import type { FXConversionRecord, FXRateSource } from "@/types/pactum";

export const EXCHANGE_RATE_PROVIDER = "ExchangeRate-API";
export const MAX_REFERENCE_AGE_SECONDS = 25 * 60 * 60;
export const REFERENCE_UPDATE_GRACE_SECONDS = 60 * 60;
export const FX_RESPONSE_MAX_BYTES = 16 * 1024;
export const FX_REQUEST_TIMEOUT_MS = 4000;

export class FXProviderError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "FXProviderError";
  }
}

export function configuredFxSource(requested?: FXRateSource): FXRateSource {
  const configured = process.env.FX_PROVIDER;
  for (const source of [configured, requested]) {
    if (source !== undefined && source !== "LIVE_PROVIDER" && source !== "DETERMINISTIC_DEMO") {
      throw new FXProviderError("FX_CONFIGURATION_INVALID", "FX_PROVIDER must be LIVE_PROVIDER or DETERMINISTIC_DEMO.");
    }
  }
  // An explicitly live deployment cannot be downgraded by a browser request.
  if (configured === "LIVE_PROVIDER" && requested === "DETERMINISTIC_DEMO") {
    throw new FXProviderError("FX_MODE_CONFLICT", "Live FX is configured on the server; demo substitution is not permitted.");
  }
  return requested ?? (configured as FXRateSource | undefined) ?? "DETERMINISTIC_DEMO";
}

export function fxIntegerSetting(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new FXProviderError("FX_CONFIGURATION_INVALID", `${name} must be a positive integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new FXProviderError("FX_CONFIGURATION_INVALID", `${name} is outside its supported range.`);
  return value;
}

export function validateReferenceProvenance(record: FXConversionRecord, historical = false): void {
  const provenance = record.referenceRate;
  if (record.rateSource === "DETERMINISTIC_DEMO") {
    if (provenance) throw new FXProviderError("FX_PROVENANCE_INVALID", "Demo rates cannot carry external provider provenance.");
    return;
  }
  const base = record.rateConvention === "INR_PER_USD" ? "USD" : record.sourceCurrency;
  const quote = record.rateConvention === "INR_PER_USD" ? "INR" : record.targetCurrency;
  if (record.rateSource !== "LIVE_PROVIDER" || !provenance || record.provider !== EXCHANGE_RATE_PROVIDER || provenance.provider !== "EXCHANGERATE_API" || provenance.baseCurrency !== base || provenance.quoteCurrency !== quote) {
    throw new FXProviderError("FX_PROVENANCE_INVALID", "Missing or invalid external reference-rate provider provenance.");
  }
  const timestamps = [provenance.updatedAt, provenance.retrievedAt, provenance.nextUpdateAt];
  const [updated, retrieved, next] = timestamps.map(value => Date.parse(value));
  if (timestamps.some((value, index) => !Number.isFinite([updated, retrieved, next][index]) || new Date([updated, retrieved, next][index]).toISOString() !== value)) throw new FXProviderError("FX_TIMESTAMP_INVALID", "Invalid provider timestamp.");
  const quoted = Date.parse(record.quotedAt);
  if (updated > retrieved || retrieved > quoted || next <= updated || next - updated > MAX_REFERENCE_AGE_SECONDS * 1000 || !Number.isSafeInteger(provenance.maxAgeSeconds) || provenance.maxAgeSeconds <= 0 || provenance.maxAgeSeconds > MAX_REFERENCE_AGE_SECONDS || !/^[a-f0-9]{64}$/.test(provenance.responseHash)) {
    throw new FXProviderError("FX_TIMESTAMP_INVALID", "Invalid provider timestamp interval or freshness provenance.");
  }
  const freshnessDeadline = Math.min(updated + provenance.maxAgeSeconds * 1000, next + REFERENCE_UPDATE_GRACE_SECONDS * 1000);
  if (quoted >= freshnessDeadline || (!historical && Date.now() >= freshnessDeadline)) throw new FXProviderError("FX_RATE_STALE", "External reference rate is stale. Retry after the provider publishes an update.");
}
