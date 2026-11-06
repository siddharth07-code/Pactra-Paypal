import "server-only";
import { requestScope } from "@/lib/persistence/request-scope";
import { orderEvidenceError, parsePaymentMinor } from "@/lib/payment-evidence";
import { minor } from "./codec";
import type { PayPalOrderDetails } from "@/lib/paypal-client";
import { AuthError } from "@/lib/auth/config";

export function recordVerifiedOrder(order: PayPalOrderDetails) {
  const scope = requestScope();
  if (!scope) return;
  const session = scope.store.getAllSessions().find(s => s.paypalOrderId === order.id);
  if (!session?.agreementRecord) return;
  const amountMinor = session.fxRecord ? BigInt(session.fxRecord.targetAmountMinor) : minor(session.agreementRecord.totalCost);
  const currency = session.fxRecord?.targetCurrency ?? session.mandate.currency;
  const customId = `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`;
  if (orderEvidenceError(order, session.paypalOrderId!, customId, currency, Number(amountMinor) / 100) || !process.env.PAYPAL_MERCHANT_ID || order.purchase_units?.[0]?.payee?.merchant_id !== process.env.PAYPAL_MERCHANT_ID) throw new AuthError(409, "PROVIDER_EVIDENCE_INVALID", "Remote merchant, order, amount, currency, or lineage is invalid.");
  scope.orders.set(order.id, order);
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  const capture = captures[0];
  if (captures.length === 1 && capture.id && capture.status === "COMPLETED" && capture.amount?.currency_code === currency && parsePaymentMinor(capture.amount.value) === Number(amountMinor)) scope.verifiedCaptures.set(order.id, { id: capture.id, amountMinor, currency });
}
