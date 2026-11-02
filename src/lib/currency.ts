/**
 * PACTUM — Shared Currency & Monetary Architecture
 *
 * Implements:
 * - Authoritative ISO 4217 currency support for USD ($) and INR (₹), with legacy EUR (€) and GBP (£) support.
 * - Locale-aware monetary formatting using Intl.NumberFormat (en-US for USD, en-IN for INR).
 * - Exact minor units conversion (cents for USD, paise for INR) with decimal safety.
 * - Validation rules for mixed-currency prevention (no silent conversion or cross-currency summation).
 * - PayPal Orders v2 supported currency allowlist and validation.
 *
 * Follows GEMINI.md Section 4, 8, 9 and Phase 6.6 Specification.
 */

export type SupportedCurrency = "USD" | "INR" | "EUR" | "GBP";

/**
 * Standard ISO 4217 currencies supported for internal procurement, sourcing,
 * negotiation, Merkle proofs, and ACWORLD audit.
 */
export const INTERNAL_SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = [
  "USD",
  "INR",
  "EUR",
  "GBP",
] as const;

/**
 * PayPal Orders v2 authoritative supported currency allowlist.
 * Notice: INR is explicitly NOT supported by PayPal Orders v2 standard checkout.
 */
export const PAYPAL_SUPPORTED_CURRENCIES: readonly string[] = [
  "AUD",
  "BRL",
  "CAD",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "HKD",
  "HUF",
  "ILS",
  "JPY",
  "MYR",
  "MXN",
  "TWD",
  "NZD",
  "NOK",
  "PHP",
  "PLN",
  "GBP",
  "SGD",
  "SEK",
  "CHF",
  "THB",
  "USD",
] as const;

/**
 * Returns true if the currency code is a valid internal procurement currency.
 */
export function isInternalSupportedCurrency(currency?: string | null): currency is SupportedCurrency {
  if (!currency || typeof currency !== "string") return false;
  return INTERNAL_SUPPORTED_CURRENCIES.includes(currency.toUpperCase() as SupportedCurrency);
}

/**
 * Returns true if PayPal Orders v2 supports this currency for payment capture.
 */
export function isPayPalSupportedCurrency(currency?: string | null): boolean {
  if (!currency || typeof currency !== "string") return false;
  return PAYPAL_SUPPORTED_CURRENCIES.includes(currency.toUpperCase());
}

/**
 * Returns the standard currency symbol for a currency code.
 */
export function getCurrencySymbol(currency?: string | null): string {
  const code = (currency || "USD").toUpperCase();
  switch (code) {
    case "INR":
      return "₹";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "USD":
    default:
      return "$";
  }
}

/**
 * Returns the preferred BCP 47 locale for a given currency code.
 */
export function getCurrencyLocale(currency?: string | null): string {
  const code = (currency || "USD").toUpperCase();
  switch (code) {
    case "INR":
      return "en-IN";
    case "EUR":
      return "de-DE";
    case "GBP":
      return "en-GB";
    case "USD":
    default:
      return "en-US";
  }
}

/**
 * Safely converts standard currency units to integer minor units (cents / paise).
 * 1 USD = 100 cents
 * 1 INR = 100 paise
 * Prevents floating-point precision drift in financial comparisons.
 */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100);
}

/**
 * Converts integer minor units back to standard decimal currency units.
 */
export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/**
 * Formats a monetary amount into a clean, localized string using Intl.NumberFormat.
 * 
 * Examples:
 * - formatCurrency(15000, "INR") -> "₹15,000.00"
 * - formatCurrency(8500, "USD")  -> "$8,500.00"
 */
export function formatCurrency(
  amount: number,
  currency?: string | null,
  options?: {
    showDecimals?: boolean;
    showCode?: boolean;
  }
): string {
  const validAmount = Number.isFinite(amount) ? amount : 0;
  const currCode = (currency || "USD").toUpperCase();
  const locale = getCurrencyLocale(currCode);
  const showDecimals = options?.showDecimals ?? true;

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currCode,
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    });
    const formatted = formatter.format(validAmount);

    if (options?.showCode) {
      return `${formatted} ${currCode}`;
    }
    return formatted;
  } catch {
    // Fallback if Intl fails on custom/unknown currency
    const symbol = getCurrencySymbol(currCode);
    const fixed = showDecimals ? validAmount.toFixed(2) : Math.round(validAmount).toString();
    const formatted = `${symbol}${fixed}`;
    return options?.showCode ? `${formatted} ${currCode}` : formatted;
  }
}

/**
 * Formats session budget context pill text.
 * Example: "session_9e6... | Budget: ₹15,000.00 INR"
 */
export function formatSessionBudgetString(
  maxTotalBudget: number,
  currency?: string | null
): string {
  const curr = (currency || "USD").toUpperCase();
  const formatted = formatCurrency(maxTotalBudget, curr, { showDecimals: true });
  return `Budget: ${formatted} ${curr}`;
}

/**
 * Centralized grammatically correct day / SLA formatter.
 * Handles singular and plural correctly:
 * - formatDaysSLA(1, 5, "max") -> "1 day (max 5 days)"
 * - formatDaysSLA(60, 30, "min") -> "60 days (min 30 days)"
 * - formatDaysSLA(1, 1, "max") -> "1 day (max 1 day)"
 * - formatDaysSLA(5) -> "5 days"
 */
export function formatDaysSLA(
  days: number,
  limitDays?: number | null,
  limitType: "max" | "min" = "max"
): string {
  const dayStr = `${days} ${days === 1 ? "day" : "days"}`;
  if (limitDays === undefined || limitDays === null) {
    return dayStr;
  }
  const limitDayStr = `${limitDays} ${limitDays === 1 ? "day" : "days"}`;
  return `${dayStr} (${limitType} ${limitDayStr})`;
}

