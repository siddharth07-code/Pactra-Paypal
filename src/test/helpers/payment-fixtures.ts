import type { ProcurementSession } from "@/types/pactum";
import type { PayPalOrderDetails } from "@/lib/paypal-client";

export function completedOrder(session: ProcurementSession, captureId: string, value: string): PayPalOrderDetails {
  return { id: session.paypalOrderId!, status: "COMPLETED", intent: "AUTHORIZE", purchase_units: [{
    custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
    amount: { currency_code: "USD", value },
    payments: { captures: [{ id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value } }] },
  }] };
}
