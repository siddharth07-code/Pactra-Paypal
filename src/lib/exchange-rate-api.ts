/** Authenticated HTTPS pair adapter. Credentials and request URLs never leave the server. */
import crypto from "crypto";
import { assertSupportedFxPair, computeFxConversion, computeConversionHash, validateFxQuote, type FXQuoteRequest, type FXRateProvider } from "./fx-settlement";
import { EXCHANGE_RATE_PROVIDER, FXProviderError, FX_REQUEST_TIMEOUT_MS, FX_RESPONSE_MAX_BYTES, MAX_REFERENCE_AGE_SECONDS, fxIntegerSetting, validateReferenceProvenance } from "./fx-provider-config";
import type { FXConversionRecord } from "@/types/pactum";

function providerFailure(status: number): FXProviderError {
  if (status === 401 || status === 403) return new FXProviderError("FX_AUTH_FAILED", "FX provider rejected the API key or account. Check EXCHANGE_RATE_API_KEY on the server.");
  if (status === 429) return new FXProviderError("FX_RATE_LIMITED", "FX provider rate limit exceeded. Please retry later.");
  return new FXProviderError("FX_PROVIDER_UNAVAILABLE", "FX provider is unavailable. Please retry later.");
}

async function boundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.ok) throw providerFailure(response.status);
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new FXProviderError("FX_RESPONSE_INVALID", "FX provider returned an unexpected response format.");
  const size = response.headers.get("content-length");
  if (size && (!/^\d+$/.test(size) || Number(size) > FX_RESPONSE_MAX_BYTES)) throw new FXProviderError("FX_RESPONSE_TOO_LARGE", "FX provider response exceeds the allowed size.");
  if (!response.body) throw new FXProviderError("FX_RESPONSE_INVALID", "FX provider returned an empty response.");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > FX_RESPONSE_MAX_BYTES) throw new FXProviderError("FX_RESPONSE_TOO_LARGE", "FX provider response exceeds the allowed size.");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", cancel);
    void reader.cancel().catch(() => undefined);
  }
}

/** Preserve the published decimal token instead of rounding a binary float to four places. */
function decodePair(text: string, base: string, target: string): { rate: string; updated: number; next: number } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new FXProviderError("FX_RESPONSE_INVALID", "FX provider returned malformed JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new FXProviderError("FX_RESPONSE_INVALID", "FX provider returned an unexpected response structure.");
  const data = parsed as Record<string, unknown>;
  if (data.result === "error") {
    if (["invalid-key", "inactive-account"].includes(String(data["error-type"]))) throw providerFailure(401);
    if (data["error-type"] === "quota-reached") throw providerFailure(429);
    throw new FXProviderError("FX_RESPONSE_INVALID", "FX provider rejected the currency-pair request.");
  }
  const allowed = new Set(["result", "documentation", "terms_of_use", "time_last_update_unix", "time_last_update_utc", "time_next_update_unix", "time_next_update_utc", "base_code", "target_code", "conversion_rate"]);
  const keys = [...text.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(match => { try { return JSON.parse(`"${match[1]}"`) as string; } catch { return ""; } });
  if (keys.length !== Object.keys(data).length || new Set(keys).size !== keys.length || keys.some(key => !allowed.has(key)) || data.result !== "success" || data.base_code !== base || data.target_code !== target) {
    throw new FXProviderError("FX_RESPONSE_INVALID", "FX provider response has an unexpected structure or unsupported currency pair.");
  }
  const rates = [...text.matchAll(/"conversion_rate"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,}])/g)];
  const rate = rates[0]?.[1];
  if (rates.length !== 1 || !rate || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,12})?$/.test(rate) || typeof data.conversion_rate !== "number" || !Number.isFinite(data.conversion_rate) || data.conversion_rate <= 0) throw new FXProviderError("FX_RATE_INVALID", "FX provider returned a missing, invalid, or unsupported-precision decimal rate.");
  const updated = data.time_last_update_unix;
  const next = data.time_next_update_unix;
  if (typeof updated !== "number" || typeof next !== "number" || !Number.isSafeInteger(updated) || !Number.isSafeInteger(next) || updated <= 0 || next <= updated || next > 8640000000000) throw new FXProviderError("FX_TIMESTAMP_INVALID", "FX provider returned missing or invalid update timestamps.");
  return { rate, updated, next };
}

export class ExchangeRateApiProvider implements FXRateProvider {
  constructor(private readonly apiKey = process.env.EXCHANGE_RATE_API_KEY) {}

  async getQuote(req: FXQuoteRequest): Promise<FXConversionRecord> {
    assertSupportedFxPair(req.sourceCurrency, req.targetCurrency);
    const inverse = req.sourceCurrency === "INR" && req.targetCurrency === "USD";
    const base = inverse ? "USD" : req.sourceCurrency;
    const target = inverse ? "INR" : req.targetCurrency;
    const convention = inverse ? "INR_PER_USD" : "TARGET_PER_SOURCE";
    if (!Number.isSafeInteger(req.sourceAmountMinor) || req.sourceAmountMinor <= 0) throw new FXProviderError("FX_AMOUNT_INVALID", "FX source minor amount must be a positive safe integer.");
    if (!this.apiKey?.trim()) throw new FXProviderError("FX_NOT_CONFIGURED", "Live FX requires EXCHANGE_RATE_API_KEY on the server. Demo rates were not substituted.");
    const ttl = req.ttlSeconds ?? fxIntegerSetting("FX_QUOTE_TTL_SECONDS", 900, 900);
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 900) throw new FXProviderError("FX_CONFIGURATION_INVALID", "FX quote TTL must be between 1 and 900 seconds.");
    const maxAgeSeconds = fxIntegerSetting("FX_REFERENCE_MAX_AGE_SECONDS", MAX_REFERENCE_AGE_SECONDS, MAX_REFERENCE_AGE_SECONDS);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new FXProviderError("FX_TIMEOUT", "FX provider request timed out. Please retry.")); }, FX_REQUEST_TIMEOUT_MS);
      });
      const operation = async () => {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${encodeURIComponent(this.apiKey!.trim())}/pair/${base}/${target}`, { signal: controller.signal, redirect: "error", cache: "no-store", headers: { Accept: "application/json" } });
        const text = await boundedResponse(response, controller.signal);
        const retrievedAt = new Date().toISOString();
        const pair = decodePair(text, base, target);
        let targetAmountMinor: number;
        try { targetAmountMinor = computeFxConversion(req.sourceAmountMinor, pair.rate, convention); } catch {
          throw new FXProviderError("FX_CONVERSION_INVALID", "FX conversion cannot be represented in safe minor units.");
        }
        if (targetAmountMinor <= 0) throw new FXProviderError("FX_CONVERSION_INVALID", "FX conversion is below the minimum settlement amount.");
        const record: FXConversionRecord = {
          id: `fxq_live_${crypto.randomBytes(8).toString("hex")}`, commitmentVersion: 2,
          sessionId: req.sessionId, agreementHash: req.agreementHash, agreementId: req.agreementId,
          sourceCurrency: req.sourceCurrency, targetCurrency: req.targetCurrency, sourceAmountMinor: req.sourceAmountMinor,
          targetAmountMinor, rate: pair.rate,
          rateConvention: convention, rateSource: "LIVE_PROVIDER", provider: EXCHANGE_RATE_PROVIDER,
          quotedAt: retrievedAt, expiresAt: new Date(Date.parse(retrievedAt) + ttl * 1000).toISOString(), roundingMode: "HALF_UP", status: "QUOTED",
          referenceRate: { provider: "EXCHANGERATE_API", baseCurrency: base, quoteCurrency: target, updatedAt: new Date(pair.updated * 1000).toISOString(), nextUpdateAt: new Date(pair.next * 1000).toISOString(), retrievedAt, maxAgeSeconds, responseHash: crypto.createHash("sha256").update(text, "utf8").digest("hex") },
          conversionHash: "",
        };
        validateReferenceProvenance(record);
        record.conversionHash = computeConversionHash(record);
        validateFxQuote(record);
        return record;
      };
      return await Promise.race([operation(), timeout]);
    } catch (error) {
      if (error instanceof FXProviderError) throw error;
      // Fetch exceptions can contain the credential-bearing URL; never return them or provider bodies.
      throw new FXProviderError("FX_NETWORK_ERROR", "FX provider could not be reached. Please retry.");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
