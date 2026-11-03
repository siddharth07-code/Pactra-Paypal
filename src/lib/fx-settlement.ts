/**
 * PACTUM — Verifiable FX Settlement Bridge
 * 
 * Provides:
 * 1. Authoritative decimal-safe rational conversion (no binary float drift) with HALF_UP rounding.
 * 2. Deterministic agreement hashing & conversion commitment hashing.
 * 3. FX Rate Provider abstraction (DETERMINISTIC_DEMO and optional LIVE_PROVIDER).
 * 4. Explicit lifecycle state transitions (QUOTED -> LOCKED -> CONSUMED / EXPIRED).
 * 5. Independent ACWORLD FX Settlement Verification (distinct post-audit check).
 * 
 * Follows GEMINI.md, SECURITY.md, and Phase 6.8 Master Specification.
 */

import crypto from "crypto";
import { CryptographicFlightRecorder } from "./flight-recorder";
import { ExchangeRateApiProvider } from "./exchange-rate-api";
import { configuredFxSource, fxIntegerSetting, validateReferenceProvenance } from "./fx-provider-config";
export { ExchangeRateApiProvider as LiveFXProvider } from "./exchange-rate-api";
import { canonicalJson } from "./veripay-merkle";
import { toMinorUnits, isPayPalSupportedCurrency } from "./currency";
import type {
  AgreementRecord,
  FXConversionRecord,
  FXRateConvention,
  FXRateSource,
  FXRoundingMode,
  ProcurementSession,
} from "../types/pactum";

export const DEFAULT_DEMO_INR_PER_USD = "83.5000";
export const DEFAULT_QUOTE_TTL_SECONDS = 900; // 15 minutes

/** Only INR -> USD is implemented. Expiry bounds new financial submission, not historical evidence. */
export function assertSupportedFxPair(source: string, target: string): void {
  if (source !== "INR" || target !== "USD") throw new Error("Unsupported FX pair: only INR -> USD is supported.");
}

export function validateFxQuote(record: FXConversionRecord, allowExpired = false): void {
  assertSupportedFxPair(record.sourceCurrency, record.targetCurrency);
  if (record.commitmentVersion !== 2) throw new Error("Legacy FX commitment requires explicit re-quotation; locked rates are never silently refreshed.");
  for (const amount of [record.sourceAmountMinor, record.targetAmountMinor]) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("FX monetary minor units must be positive safe integers.");
  }
  const quoted = Date.parse(record.quotedAt);
  const expires = Date.parse(record.expiresAt);
  if (!Number.isFinite(quoted) || !Number.isFinite(expires) || new Date(quoted).toISOString() !== record.quotedAt || new Date(expires).toISOString() !== record.expiresAt || expires <= quoted || quoted > Date.now()) {
    throw new Error("Invalid FX timestamps or expired interval.");
  }
  if (!allowExpired && Date.now() >= expires) throw new Error("FX quote has expired; locked rates cannot be silently refreshed.");
  validateReferenceProvenance(record, allowExpired);
  if (computeConversionHash(record) !== record.conversionHash) throw new Error("FX conversionHash integrity mismatch: quote has been mutated.");
}

/** Update mutable lifecycle and history without changing the immutable conversion commitment. */
export function consumeFxRecord(session: ProcurementSession): void {
  if (!session.fxRecord) return;
  validateFxQuote(session.fxRecord, true);
  if (!["LOCKED", "CONSUMED"].includes(session.fxRecord.status)) throw new Error("Cannot consume an unlocked FX quote.");
  session.fxRecord = { ...session.fxRecord, status: "CONSUMED" };
  const record = session.fxRecord;
  const history = session.fxQuoteHistory ?? [];
  session.fxQuoteHistory = history.some(q => q.id === record.id) ? history.map(q => q.id === record.id ? { ...record } : q) : [...history, { ...record }];
}

export interface RationalRate {
  numerator: bigint;
  denominator: bigint;
}

/**
 * Parses a decimal string rate (e.g. "83.5000" or "83.5") into an exact rational fraction.
 */
export function parseDecimalRate(rateStr: string): RationalRate {
  if (typeof rateStr !== "string" || !rateStr.trim()) {
    throw new Error(`Invalid rate format: expected non-empty decimal string, got '${rateStr}'`);
  }

  const trimmed = rateStr.trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
    throw new Error(`Invalid rate format: '${rateStr}' is not a valid non-negative decimal string.`);
  }

  const parts = trimmed.split(".");
  const intPart = parts[0];
  const decPart = parts[1] || "";

  if (decPart.length === 0) {
    const num = BigInt(intPart);
    if (num <= 0n) throw new Error("Rate must be strictly greater than zero.");
    return { numerator: num, denominator: 1n };
  }

  const denominator = 10n ** BigInt(decPart.length);
  const numerator = BigInt(intPart) * denominator + BigInt(decPart);

  if (numerator <= 0n) {
    throw new Error("Rate must be strictly greater than zero.");
  }

  return { numerator, denominator };
}

/**
 * Decimal-safe rational FX conversion.
 * 
 * Convention: INR_PER_USD
 * 1 USD = R INR
 * USD = INR / R
 * 
 * In minor units:
 * sourceAmountMinor = paise (1 INR = 100 paise)
 * targetAmountMinor = cents (1 USD = 100 cents)
 * targetCents = (sourcePaise / 100) / R * 100 = sourcePaise / R
 * 
 * Rational formula:
 * targetCents = (sourceAmountMinor * denominator) / numerator
 * Rounding: HALF_UP
 */
export function computeFxConversion(
  sourceAmountMinor: number,
  rateStr: string,
  rateConvention: FXRateConvention = "INR_PER_USD",
  roundingMode: FXRoundingMode = "HALF_UP"
): number {
  if (!Number.isSafeInteger(sourceAmountMinor) || sourceAmountMinor < 0) {
    throw new Error(`Invalid sourceAmountMinor: ${sourceAmountMinor}. Must be a non-negative integer.`);
  }

  if (rateConvention !== "INR_PER_USD") {
    throw new Error(`Unsupported rate convention: ${rateConvention}. Authoritative convention is 'INR_PER_USD'.`);
  }

  if (roundingMode !== "HALF_UP") {
    throw new Error(`Unsupported rounding mode: ${roundingMode}. Authoritative mode is 'HALF_UP'.`);
  }

  const { numerator, denominator } = parseDecimalRate(rateStr);

  const num = BigInt(sourceAmountMinor) * denominator;
  const den = numerator;

  let quotient = num / den;
  const remainder = num % den;

  // HALF_UP rounding: If remainder * 2 >= den, round up (away from zero for positive numbers)
  if (remainder * 2n >= den) {
    quotient += 1n;
  }

  if (quotient > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Target minor amount overflowed safe integer bounds.");
  }

  return Number(quotient);
}

/**
 * Computes deterministic SHA-256 hash of an authoritative AgreementRecord.
 */
export function computeAgreementHash(agreement: AgreementRecord): string {
  const canonicalFields = { ...agreement, currency: (agreement.currency || "INR").toUpperCase() };

  return crypto
    .createHash("sha256")
    .update(canonicalJson(canonicalFields), "utf-8")
    .digest("hex");
}

/**
 * Computes deterministic SHA-256 conversion hash for a canonical FXConversionRecord.
 */
export function computeConversionHash(
  record: Omit<FXConversionRecord, "conversionHash">
): string {
  const canonicalRecord = {
    id: record.id,
    sessionId: record.sessionId,
    agreementHash: record.agreementHash,
    agreementId: record.agreementId || "",
    sourceCurrency: record.sourceCurrency.toUpperCase(),
    targetCurrency: record.targetCurrency.toUpperCase(),
    sourceAmountMinor: record.sourceAmountMinor,
    targetAmountMinor: record.targetAmountMinor,
    rate: record.rate,
    rateConvention: record.rateConvention,
    rateSource: record.rateSource,
    provider: record.provider || "",
    quotedAt: record.quotedAt,
    expiresAt: record.expiresAt,
    roundingMode: record.roundingMode,
    commitmentVersion: record.commitmentVersion ?? 2,
    ...(record.referenceRate ? { referenceRate: record.referenceRate } : {}),
  };

  return crypto
    .createHash("sha256")
    .update(canonicalJson(canonicalRecord), "utf-8")
    .digest("hex");
}

export interface FXQuoteRequest {
  sessionId: string;
  agreementHash: string;
  agreementId?: string;
  sourceCurrency: "INR" | string;
  targetCurrency: "USD" | string;
  sourceAmountMinor: number;
  rateSource?: FXRateSource;
  provider?: string;
  ttlSeconds?: number;
}

export interface FXRateProvider {
  getQuote(req: FXQuoteRequest): Promise<FXConversionRecord>;
}

/**
 * Deterministic Demo FX Provider for offline reliability, automated tests,
 * and predictable hackathon demonstrations.
 */
export class DeterministicDemoFXProvider implements FXRateProvider {
  private readonly rate: string;

  constructor(rate: string = DEFAULT_DEMO_INR_PER_USD) {
    this.rate = rate;
  }

  public async getQuote(req: FXQuoteRequest): Promise<FXConversionRecord> {
    assertSupportedFxPair(req.sourceCurrency, req.targetCurrency);
    const id = `fxq_${crypto.randomBytes(8).toString("hex")}`;
    const quotedAt = new Date().toISOString();
    const ttlMs = (req.ttlSeconds ?? fxIntegerSetting("FX_QUOTE_TTL_SECONDS", DEFAULT_QUOTE_TTL_SECONDS, DEFAULT_QUOTE_TTL_SECONDS)) * 1000;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const targetAmountMinor = computeFxConversion(
      req.sourceAmountMinor,
      this.rate,
      "INR_PER_USD",
      "HALF_UP"
    );

    const recordWithoutHash: Omit<FXConversionRecord, "conversionHash"> = {
      id,
      commitmentVersion: 2,
      sessionId: req.sessionId,
      agreementHash: req.agreementHash,
      agreementId: req.agreementId,
      sourceCurrency: req.sourceCurrency.toUpperCase(),
      targetCurrency: req.targetCurrency.toUpperCase(),
      sourceAmountMinor: req.sourceAmountMinor,
      targetAmountMinor,
      rate: this.rate,
      rateConvention: "INR_PER_USD",
      rateSource: "DETERMINISTIC_DEMO",
      provider: "Deterministic Demo FX",
      quotedAt,
      expiresAt,
      roundingMode: "HALF_UP",
      status: "QUOTED",
    };

    const conversionHash = computeConversionHash(recordWithoutHash);

    return {
      ...recordWithoutHash,
      conversionHash,
    };
  }
}

/**
 * Returns the requested FX rate provider without silent fallbacks.
 */
export function getFXRateProvider(requested?: FXRateSource): FXRateProvider {
  const source = configuredFxSource(requested);
  if (source !== undefined && source !== "LIVE_PROVIDER" && source !== "DETERMINISTIC_DEMO") {
    throw new Error("Unsupported FX rate source.");
  }
  if (source === "LIVE_PROVIDER") {
    return new ExchangeRateApiProvider();
  }
  return new DeterministicDemoFXProvider();
}

/**
 * Validates and locks an existing QUOTED FX conversion record.
 * An immutable commitment is created and bound to the current agreement hash.
 */
export function lockFXQuote(
  quote: FXConversionRecord,
  agreement: AgreementRecord
): FXConversionRecord {
  validateFxQuote(quote);
  if (quote.status === "LOCKED") {
    // Idempotent: If already locked with matching agreement, return the immutable record
    const expectedAgreementHash = computeAgreementHash(agreement);
    if (quote.agreementHash !== expectedAgreementHash) {
      throw new Error(
        `Cannot lock FX quote: Quote is already locked to a different agreement hash (${quote.agreementHash} vs ${expectedAgreementHash}).`
      );
    }
    return quote;
  }

  if (quote.status !== "QUOTED") {
    throw new Error(`Cannot lock FX quote: Quote has invalid status '${quote.status}'. Only 'QUOTED' quotes can be locked.`);
  }

  const now = Date.now();
  const expiresAt = new Date(quote.expiresAt).getTime();
  if (now >= expiresAt) {
    throw new Error(
      `Cannot lock FX quote: Quote has expired at ${quote.expiresAt} (current time: ${new Date(now).toISOString()}). Request a refreshed quote.`
    );
  }

  const currentAgreementHash = computeAgreementHash(agreement);
  if (quote.agreementHash !== currentAgreementHash) {
    throw new Error(
      `Cannot lock FX quote: Agreement has been revised. Quote agreementHash '${quote.agreementHash}' does not match current agreement hash '${currentAgreementHash}'.`
    );
  }

  // Verify that the conversion hash of the incoming quote matches its unmutated state
  const currentHash = computeConversionHash(quote);
  if (currentHash !== quote.conversionHash) {
    throw new Error("Cannot lock FX quote: Quote payload has been tampered with or mutated.");
  }

  const lockedRecord: FXConversionRecord = {
    ...quote,
    status: "LOCKED",
  };

  lockedRecord.conversionHash = computeConversionHash(lockedRecord);
  return lockedRecord;
}

/**
 * ACWORLD FX Settlement Verification Stage Check Result
 */
export interface FXVerificationCheck {
  name: string;
  passed: boolean;
  expected?: string | number | boolean;
  actual?: string | number | boolean;
  reason?: string;
}

export interface FXSettlementAuditResult {
  passed: boolean;
  checks: FXVerificationCheck[];
  error?: string;
  auditTimestamp: string;
}

/**
 * ACWORLD FX Settlement Verification
 *
 * Independent transformation checks after commercial audit, including live provider
 * provenance/evidence and optional authoritative PayPal order checks.
 */
export function auditFxSettlement(params: {
  session: ProcurementSession;
  fxRecord: FXConversionRecord;
  historical?: boolean; // Only for already submitted/captured remote evidence.
  expectedPayPalOrder?: {
    currency: string;
    amountMinor: number;
  };
}): FXSettlementAuditResult {
  const { session, fxRecord, expectedPayPalOrder } = params;
  const checks: FXVerificationCheck[] = [];
  try {
    validateFxQuote(fxRecord, params.historical === true || fxRecord.status === "CONSUMED" || Boolean(session.captureIntent && ["CAPTURE_SUBMITTED", "UNCERTAIN", "CAPTURED"].includes(session.captureIntent.status)));
  } catch (error) {
    checks.push({ name: "FX_COMMITMENT_VALID", passed: false, reason: error instanceof Error ? error.message : "Invalid FX quote" });
  }
  if (fxRecord.rateSource === "LIVE_PROVIDER") {
    try {
      validateReferenceProvenance(fxRecord, params.historical === true || fxRecord.status === "CONSUMED" || Boolean(session.captureIntent && ["CAPTURE_SUBMITTED", "UNCERTAIN", "CAPTURED"].includes(session.captureIntent.status)));
      checks.push({ name: "PROVIDER_PROVENANCE_AND_FRESHNESS", passed: true });
    } catch (error) {
      checks.push({ name: "PROVIDER_PROVENANCE_AND_FRESHNESS", passed: false, reason: error instanceof Error ? error.message : "Invalid provider provenance." });
    }
    try {
      if (!session.flightRecord || session.flightRecord.sessionId !== session.id) throw new Error("Missing session FX evidence.");
      const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
      const committed = recorder.getEvents().some(event => event.eventType === "FX_QUOTE_CREATED" && event.publicPayload.conversionHash === fxRecord.conversionHash && event.publicPayload.agreementHash === fxRecord.agreementHash);
      if (!committed) throw new Error("FX reference-rate commitment is missing from VeriPay evidence.");
      checks.push({ name: "FX_REFERENCE_EVIDENCE", passed: true });
    } catch (error) {
      checks.push({ name: "FX_REFERENCE_EVIDENCE", passed: false, reason: error instanceof Error ? error.message : "Invalid FX evidence." });
    }
  }
  const auditTimestamp = new Date().toISOString();

  // 1. Agreement exists
  const hasAgreement = Boolean(session.agreementRecord);
  checks.push({
    name: "AGREEMENT_EXISTS",
    passed: hasAgreement,
    actual: hasAgreement,
    reason: hasAgreement ? undefined : "No authoritative agreement record exists on session.",
  });

  // 2. Agreement passed commercial ACWORLD audit
  const passedCommercialAudit = Boolean(session.auditCertificate && session.auditCertificate.passed);
  checks.push({
    name: "COMMERCIAL_ACWORLD_AUDIT_PASSED",
    passed: passedCommercialAudit,
    actual: passedCommercialAudit,
    reason: passedCommercialAudit
      ? undefined
      : "Commercial ACWORLD audit has not passed for this session agreement.",
  });

  // 3. FX source currency == agreement currency
  const agreementCurrency = (session.agreementRecord?.currency || session.mandate.currency || "INR").toUpperCase();
  const sourceCurrencyMatches = fxRecord.sourceCurrency.toUpperCase() === agreementCurrency;
  checks.push({
    name: "SOURCE_CURRENCY_MATCH",
    passed: sourceCurrencyMatches,
    expected: agreementCurrency,
    actual: fxRecord.sourceCurrency.toUpperCase(),
    reason: sourceCurrencyMatches
      ? undefined
      : `FX source currency '${fxRecord.sourceCurrency}' does not match agreement currency '${agreementCurrency}'.`,
  });

  // 4. FX source amount == agreed landed cost EXACTLY
  const agreementTotalCost = session.agreementRecord?.totalCost ?? (
    session.finalOffer
      ? session.finalOffer.unitPrice * session.finalOffer.quantity + session.finalOffer.shippingCost
      : 0
  );
  const expectedSourceMinor = toMinorUnits(agreementTotalCost);
  const sourceAmountMatches = fxRecord.sourceAmountMinor === expectedSourceMinor;
  checks.push({
    name: "SOURCE_AMOUNT_MATCH",
    passed: sourceAmountMatches,
    expected: expectedSourceMinor,
    actual: fxRecord.sourceAmountMinor,
    reason: sourceAmountMatches
      ? undefined
      : `FX source amount (${fxRecord.sourceAmountMinor} minor units) does not match agreed landed cost (${expectedSourceMinor} minor units).`,
  });

  // 5. FX target currency is PayPal-supported
  const targetCurrencySupported = isPayPalSupportedCurrency(fxRecord.targetCurrency);
  checks.push({
    name: "TARGET_CURRENCY_PAYPAL_SUPPORTED",
    passed: targetCurrencySupported,
    expected: true,
    actual: targetCurrencySupported,
    reason: targetCurrencySupported
      ? undefined
      : `FX target currency '${fxRecord.targetCurrency}' is not supported by PayPal Orders v2.`,
  });

  // 6. FX record belongs to current session
  const sessionMatches = fxRecord.sessionId === session.id;
  checks.push({
    name: "SESSION_ID_MATCH",
    passed: sessionMatches,
    expected: session.id,
    actual: fxRecord.sessionId,
    reason: sessionMatches
      ? undefined
      : `FX record sessionId '${fxRecord.sessionId}' does not match active session '${session.id}'.`,
  });

  // 7. FX agreementHash matches current agreement
  const currentAgreementHash = session.agreementRecord ? computeAgreementHash(session.agreementRecord) : "";
  const agreementHashMatches = Boolean(currentAgreementHash && fxRecord.agreementHash === currentAgreementHash);
  checks.push({
    name: "AGREEMENT_HASH_MATCH",
    passed: agreementHashMatches,
    expected: currentAgreementHash,
    actual: fxRecord.agreementHash,
    reason: agreementHashMatches
      ? undefined
      : `FX record agreementHash does not match current authoritative agreement hash.`,
  });

  // 8. FX quote is valid for its lifecycle state
  const isValidState = fxRecord.status === "LOCKED" || fxRecord.status === "CONSUMED";
  checks.push({
    name: "LIFECYCLE_STATE_VALID",
    passed: isValidState,
    expected: "LOCKED or CONSUMED",
    actual: fxRecord.status,
    reason: isValidState
      ? undefined
      : `FX record must be in 'LOCKED' or 'CONSUMED' state for settlement verification (actual: '${fxRecord.status}').`,
  });

  // 9. FX arithmetic recomputes exactly
  let arithmeticMatches = false;
  let recomputedTargetMinor = -1;
  try {
    recomputedTargetMinor = computeFxConversion(
      fxRecord.sourceAmountMinor,
      fxRecord.rate,
      fxRecord.rateConvention,
      fxRecord.roundingMode
    );
    arithmeticMatches = recomputedTargetMinor === fxRecord.targetAmountMinor;
  } catch {
    arithmeticMatches = false;
  }
  checks.push({
    name: "FX_ARITHMETIC_EXACT",
    passed: arithmeticMatches,
    expected: recomputedTargetMinor,
    actual: fxRecord.targetAmountMinor,
    reason: arithmeticMatches
      ? undefined
      : `Deterministic FX arithmetic recalculation failed: expected ${recomputedTargetMinor}, got ${fxRecord.targetAmountMinor}.`,
  });

  // 10. FX rounding recomputes exactly with HALF_UP
  const roundingValid = fxRecord.roundingMode === "HALF_UP";
  checks.push({
    name: "ROUNDING_MODE_VALID",
    passed: roundingValid,
    expected: "HALF_UP",
    actual: fxRecord.roundingMode,
    reason: roundingValid ? undefined : `Rounding mode must be 'HALF_UP', got '${fxRecord.roundingMode}'.`,
  });

  // 11. Locked quote has not been mutated (conversionHash matches)
  const recomputedConversionHash = computeConversionHash(fxRecord);
  const conversionHashMatches = recomputedConversionHash === fxRecord.conversionHash;
  checks.push({
    name: "CONVERSION_HASH_INTEGRITY",
    passed: conversionHashMatches,
    expected: recomputedConversionHash,
    actual: fxRecord.conversionHash,
    reason: conversionHashMatches
      ? undefined
      : "Cryptographic conversionHash mismatch: locked FX record has been mutated.",
  });

  // 12. PayPal order currency == FX target currency (if provided)
  if (expectedPayPalOrder) {
    const orderCurrencyMatches = expectedPayPalOrder.currency.toUpperCase() === fxRecord.targetCurrency.toUpperCase();
    checks.push({
      name: "PAYPAL_ORDER_CURRENCY_MATCH",
      passed: orderCurrencyMatches,
      expected: fxRecord.targetCurrency.toUpperCase(),
      actual: expectedPayPalOrder.currency.toUpperCase(),
      reason: orderCurrencyMatches
        ? undefined
        : `PayPal order currency '${expectedPayPalOrder.currency}' does not match FX target currency '${fxRecord.targetCurrency}'.`,
    });

    // 13. PayPal order amount == FX target amount (if provided)
    const orderAmountMatches = expectedPayPalOrder.amountMinor === fxRecord.targetAmountMinor;
    checks.push({
      name: "PAYPAL_ORDER_AMOUNT_MATCH",
      passed: orderAmountMatches,
      expected: fxRecord.targetAmountMinor,
      actual: expectedPayPalOrder.amountMinor,
      reason: orderAmountMatches
        ? undefined
        : `PayPal order amount (${expectedPayPalOrder.amountMinor} minor units) does not match locked FX target (${fxRecord.targetAmountMinor} minor units).`,
    });
  }

  const allPassed = checks.every((c) => c.passed);
  const failingCheck = checks.find((c) => !c.passed);

  return {
    passed: allPassed,
    checks,
    error: failingCheck ? `${failingCheck.name}: ${failingCheck.reason}` : undefined,
    auditTimestamp,
  };
}
