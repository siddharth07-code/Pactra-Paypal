import { toMinorUnits } from "./currency";
import type { PayPalOrderDetails } from "./paypal-client";

/** Parse provider decimal strings exactly; never accept NaN, exponent syntax, or sub-cent values. */
export function parsePaymentMinor(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor > 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export function paymentAmountError(amount: { currency_code?: string; value?: string } | undefined, currency: string, total: number): string | undefined {
  if (!amount || amount.currency_code !== currency) return "Payment currency mismatch or missing currency.";
  const expected = toMinorUnits(total);
  if (!Number.isSafeInteger(expected) || expected <= 0 || parsePaymentMinor(amount.value) !== expected) return "Payment amount mismatch or missing/invalid amount.";
}

export function orderEvidenceError(order: PayPalOrderDetails, id: string, customId: string, currency: string, total: number): string | undefined {
  if (order.id !== id || order.intent !== "AUTHORIZE" || order.purchase_units?.length !== 1) return "Invalid remote order identity, intent, or purchase units.";
  const unit = order.purchase_units[0];
  const amountError = paymentAmountError(unit.amount, currency, total);
  if (amountError) return amountError;
  if (unit.custom_id !== customId) return "Remote order custom_id lineage mismatch or missing binding.";
}
