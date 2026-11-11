import { recordCommercialFixture } from "@/test/helpers/commercial-evidence";
// Provider-domain tests inject the HTTP persistence boundary; PostgreSQL replay/RLS tests use the real wrapper.
vi.mock("@/lib/db/webhook-route", () => ({ withWebhookRoute: (handler: unknown) => handler }));
// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { defaultWebhookLedger } from "@/lib/webhook-deduplication";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { SettlementService, evaluateSettlementEligibility } from "@/lib/settlement-service";
import { PayPalClient } from "@/lib/paypal-client";
import { computeAgreementHash, computeConversionHash, computeFxConversion, DeterministicDemoFXProvider, lockFXQuote, validateFxQuote, consumeFxRecord, auditFxSettlement } from "@/lib/fx-settlement";
import { parsePaymentMinor, orderEvidenceError } from "@/lib/payment-evidence";
import { POST as quoteRoute } from "@/app/api/fx/quote/route";
import { POST as lockRoute } from "@/app/api/fx/lock/route";
import { POST as auditRoute } from "@/app/api/procurement/audit/route";
import { POST as webhookRoute } from "@/app/api/paypal/webhook/route";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import { completedOrder } from "@/test/helpers/payment-fixtures";
import type { ProcurementSession } from "@/types/pactum";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/${path}`, { method: "POST", headers: { "paypal-transmission-sig": "VALID_SIGNATURE_LONG_ENOUGH" }, body: JSON.stringify(body) });
}
function createSession(currency: "INR" | "USD" = "INR") {
  const now = new Date().toISOString();
  const s = sessionStore.createSession({ id: "m", rawPrompt: "Buy monitors", itemQuery: "monitors", quantity: 2, maxTotalBudget: 10000, maxDeliveryDays: 5, minReturnDays: 30, requiredSpecs: [], currency, version: 1, createdAt: now }, []);
  s.selectedQuote = { vendorId: "v", vendorName: "Vendor", sku: "MON", productTitle: "Monitor", initialUnitAsk: 500, currentUnitBid: 400, shippingCost: 0, deliveryDays: 3, returnDays: 30, condition: "NEW", status: "ACCEPTED", dataSource: "MOCK_CATALOG", currency };
  s.finalOffer = { unitPrice: 400, quantity: 2, shippingCost: 0, deliveryDays: 3, returnDays: 30, currency };
  s.agreementRecord = { agreementId: `agr_${s.id}`, sessionId: s.id, vendorId: "v", vendorName: "Vendor", sku: "MON", agreedPrice: 400, agreedOffer: { ...s.finalOffer }, totalCost: 800, currency, agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER", acceptingParty: "VENDOR", acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER", round: 3, mandateVersion: 1, acceptedAt: now };
  const recorder = recordCommercialFixture(s);
  s.flightRecord = recorder.exportFlightRecord();
  s.merkleRoot = s.preSettlementRoot = recorder.getRootHash();
  s.auditCertificate = new AcworldAuditor().audit({ session: s });
  expect(s.auditCertificate.passed).toBe(true);
  s.status = "AUDIT_PASSED";
  sessionStore.saveSession(s);
  return s;
}
async function quoted(s: ProcurementSession) {
  return new DeterministicDemoFXProvider().getQuote({ sessionId: s.id, agreementHash: computeAgreementHash(s.agreementRecord!), sourceCurrency: "INR", targetCurrency: "USD", sourceAmountMinor: 80000 });
}
async function locked(s: ProcurementSession) {
  s.fxRecord = lockFXQuote(await quoted(s), s.agreementRecord!);
  s.fxQuoteHistory = [{ ...s.fxRecord }];
  sessionStore.saveSession(s);
}
beforeEach(() => { vi.restoreAllMocks(); sessionStore.clear(); defaultRateLimiter.resetAll(); defaultWebhookLedger.clear(); vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Phase 6.8.2 financial integrity", () => {
  it("preserves the conversion commitment through lock and consumption", async () => {
    const s = createSession(); const q = await quoted(s); const hash = q.conversionHash;
    s.fxRecord = lockFXQuote(q, s.agreementRecord!); s.fxQuoteHistory = [q];
    expect(s.fxRecord.conversionHash).toBe(hash);
    consumeFxRecord(s);
    expect(computeConversionHash(s.fxRecord!)).toBe(hash);
    expect(s.fxQuoteHistory[0].status).toBe("CONSUMED");
    expect(auditFxSettlement({ session: s, fxRecord: s.fxRecord! }).passed).toBe(true);
  });
  it.each(["quantity", "shippingCost", "deliveryDays", "returnDays"] as const)("binds the agreement %s to its FX commitment", async field => {
    const s = createSession(); const q = await quoted(s);
    s.agreementRecord!.agreedOffer[field] += 1;
    expect(() => lockFXQuote(q, s.agreementRecord!)).toThrow(/revised|agreement/i);
  });
  it.each([Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -1, 1.5])("rejects unsafe source minor units %s", value => {
    expect(() => computeFxConversion(value, "83.5000")).toThrow();
  });
  it("rejects unsafe target minor units even with a recomputed hash", async () => {
    const q = await quoted(createSession()); q.targetAmountMinor = Number.MAX_SAFE_INTEGER + 1; q.conversionHash = computeConversionHash(q);
    expect(() => validateFxQuote(q)).toThrow(/safe integers/i);
  });
  it.each(["garbage", "", "2026-99-99T00:00:00Z"])("rejects malformed expiry %s", async expiresAt => {
    const s = createSession(); const q = await quoted(s); q.expiresAt = expiresAt; q.conversionHash = computeConversionHash(q);
    expect(() => lockFXQuote(q, s.agreementRecord!)).toThrow(/timestamp|expired/i);
  });
  it("rejects locked quote replay at expiry without changing the rate", async () => {
    const s = createSession(); await locked(s); const q = s.fxRecord!;
    vi.useFakeTimers(); vi.setSystemTime(Date.parse(q.expiresAt));
    expect(() => lockFXQuote(q, s.agreementRecord!)).toThrow(/expired/i);
    expect((await quoteRoute(request("fx/quote", { sessionId: s.id }))).status).toBe(409);
    expect(sessionStore.getSession(s.id)!.fxRecord!.conversionHash).toBe(q.conversionHash);
  });
  it("keeps consumed historical evidence verifiable after expiry", async () => {
    const s = createSession(); await locked(s); consumeFxRecord(s);
    vi.useFakeTimers(); vi.setSystemTime(Date.parse(s.fxRecord!.expiresAt) + 1);
    expect(auditFxSettlement({ session: s, fxRecord: s.fxRecord! }).passed).toBe(true);
  });
  it("rejects legacy commitments instead of silently rehashing", async () => {
    const s = createSession(); const q = await quoted(s); delete q.commitmentVersion;
    expect(() => lockFXQuote(q, s.agreementRecord!)).toThrow(/Legacy/);
  });
  it.each([["INR", "EUR"], ["USD", "INR"], ["EUR", "USD"]])("rejects unsupported pair %s/%s", async (sourceCurrency, targetCurrency) => {
    await expect(new DeterministicDemoFXProvider().getQuote({ sessionId: "s", agreementHash: "h", sourceCurrency, targetCurrency, sourceAmountMinor: 100 })).rejects.toThrow(/pair/i);
  });
  it.each([quoteRoute, lockRoute])("serializes FX routes against another session operation", async route => {
    const s = createSession(); s.fxRecord = await quoted(s); sessionStore.saveSession(s); sessionStore.acquireLock(s.id);
    expect((await route(request("fx", { sessionId: s.id }))).status).toBe(409);
    expect(sessionStore.isLocked(s.id)).toBe(true); sessionStore.releaseLock(s.id);
  });
  it.each([quoteRoute, lockRoute])("fails closed when required FX evidence recording fails", async route => {
    const s = createSession(); s.fxRecord = await quoted(s); sessionStore.saveSession(s);
    const before = sessionStore.getSession(s.id);
    vi.spyOn(CryptographicFlightRecorder, "getOrReconstitute").mockImplementation(() => { throw new Error("corrupt evidence"); });
    expect((await route(request("fx", { sessionId: s.id }))).status).toBe(422);
    expect(sessionStore.getSession(s.id)).toEqual(before);
    expect(sessionStore.isLocked(s.id)).toBe(false);
  });
  it("persists actual verification alongside both required evidence events", async () => {
    const s = createSession(); expect((await quoteRoute(request("fx/quote", { sessionId: s.id }))).status).toBe(200);
    expect((await lockRoute(request("fx/lock", { sessionId: s.id }))).status).toBe(200);
    const saved = sessionStore.getSession(s.id)!;
    expect(saved.fxVerification?.passed).toBe(true);
    expect(saved.flightRecord!.events.map(e => e.eventType)).toEqual(expect.arrayContaining(["FX_QUOTE_CREATED", "FX_QUOTE_LOCKED", "FX_SETTLEMENT_VERIFIED"]));
    expect(CryptographicFlightRecorder.fromSerialized(saved.flightRecord!).verifyIntegrity().valid).toBe(true);
  });
  it("blocks conflicting failed lifecycle despite a passing certificate", () => {
    const s = createSession("USD"); s.status = "AUDIT_FAILED";
    expect(evaluateSettlementEligibility(s).eligible).toBe(false);
  });
  it("recovers a failed audit authoritatively and preserves its history", async () => {
    const s = createSession(); s.auditCertificate!.passed = false; s.auditCertificate!.certificateId = "historic-failure"; s.status = "AUDIT_FAILED"; sessionStore.saveSession(s);
    expect((await auditRoute(request("procurement/audit", { sessionId: s.id }))).status).toBe(200);
    const saved = sessionStore.getSession(s.id)!;
    expect(saved.status).toBe("AUDIT_PASSED"); expect(saved.auditHistory!.some(c => c.certificateId === "historic-failure" && !c.passed)).toBe(true);
  });
  it.each(["SETTLED", "PAYPAL_CAPTURED", "DISPUTED", "CANCELLED", "CAPTURE_PENDING_RECONCILIATION"] as const)("rejects re-audit from %s without changing state", async status => {
    const s = createSession(); s.status = status; sessionStore.saveSession(s);
    const before = sessionStore.getSession(s.id);
    expect((await auditRoute(request("procurement/audit", { sessionId: s.id }))).status).toBe(409);
    expect(sessionStore.getSession(s.id)).toEqual(before);
  });
  it("does not infer verification from LOCKED status", async () => {
    const s = createSession(); await locked(s); render(<SettlementCenterScreen session={s} />);
    expect(screen.getByText("Not Verified")).toBeInTheDocument(); expect(screen.queryByText("13/13 CHECKS PASS")).not.toBeInTheDocument();
  });
  it("renders the actual number of authoritative checks", async () => {
    const s = createSession(); await locked(s); const report = auditFxSettlement({ session: s, fxRecord: s.fxRecord! });
    s.fxVerification = { ...report, conversionHash: s.fxRecord!.conversionHash, agreementHash: s.fxRecord!.agreementHash };
    render(<SettlementCenterScreen session={s} />); expect(screen.getByText(`${report.checks.length}/${report.checks.length} CHECKS PASS`)).toBeInTheDocument();
  });
  it.each([undefined, "NaN", "1e2", "10.001", "-1", "9007199254740992.00", "0.00"])("rejects malformed provider money %s", value => { expect(parsePaymentMinor(value)).toBeNull(); });
  it("requires order identity and mandatory Merkle binding", () => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; const order = completedOrder(s, "CAP", "800.00"); delete order.purchase_units![0].custom_id;
    expect(orderEvidenceError(order, "ORDER", `VERIPAY_ROOT:${s.preSettlementRoot};SESSION:${s.id}`, "USD", 800)).toMatch(/binding|lineage/);
  });
  it.each([undefined, { currency_code: "USD", value: "799.99" }, { currency_code: "EUR", value: "800.00" }, { currency_code: "USD", value: "NaN" }])("rejects incomplete or mismatched reconciliation capture evidence", async amount => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; s.status = "CAPTURE_PENDING_RECONCILIATION"; sessionStore.saveSession(s);
    const client = new PayPalClient(); const order = completedOrder(s, "CAP", "800.00"); order.purchase_units![0].payments!.captures![0].amount = amount;
    vi.spyOn(client, "getOrder").mockResolvedValue(order); const capture = vi.spyOn(client, "capturePayment");
    expect((await new SettlementService({ paypalClient: client }).reconcileSettlement({ sessionId: s.id })).reconciled).toBe(false);
    expect(sessionStore.getSession(s.id)!.status).toBe("CAPTURE_PENDING_RECONCILIATION"); expect(capture).not.toHaveBeenCalled();
  });
  it("does not infer capture from COMPLETED order status alone", async () => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; s.status = "CAPTURE_PENDING_RECONCILIATION"; sessionStore.saveSession(s);
    const order = completedOrder(s, "CAP", "800.00"); delete order.purchase_units![0].payments;
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(order);
    expect((await new SettlementService().reconcileSettlement({ sessionId: s.id })).reconciled).toBe(false);
  });
  it("persists consumed FX commitment on confirmed reconciliation", async () => {
    const s = createSession(); await locked(s); s.paypalOrderId = "ORDER"; s.status = "CAPTURE_PENDING_RECONCILIATION"; sessionStore.saveSession(s);
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(s, "CAP", (s.fxRecord!.targetAmountMinor / 100).toFixed(2)));
    expect((await new SettlementService().reconcileSettlement({ sessionId: s.id })).reconciled).toBe(true);
    const saved = sessionStore.getSession(s.id)!; expect(saved.fxRecord!.status).toBe("CONSUMED"); expect(computeConversionHash(saved.fxRecord!)).toBe(saved.fxRecord!.conversionHash); expect(saved.fxQuoteHistory![0].status).toBe("CONSUMED");
  });
  it("keeps webhook retryable when the session lock is busy", async () => {
    const s = createSession("USD"); sessionStore.acquireLock(s.id);
    const event = { id: "WH-BUSY", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP", custom_id: `SESSION:${s.id}`, amount: { currency_code: "USD", value: "800.00" } } };
    expect((await webhookRoute(request("paypal/webhook", event))).status).toBe(503);
    expect(defaultWebhookLedger.isProcessed(event.id)).toBe(false); expect(defaultWebhookLedger.getEntry(event.id)!.status).toBe("FAILED"); sessionStore.releaseLock(s.id);
    s.paypalOrderId = "ORDER"; sessionStore.saveSession(s); vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(s, "CAP", "800.00"));
    expect((await webhookRoute(request("paypal/webhook", event))).status).toBe(200); expect(defaultWebhookLedger.isProcessed(event.id)).toBe(true);
  });
  it("persists uncertain state and prevents recapture on malformed provider success", async () => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; sessionStore.saveSession(s);
    const order = completedOrder(s, "CAP", "800.00"); order.status = "APPROVED"; delete order.purchase_units![0].payments;
    const client = new PayPalClient(); vi.spyOn(client, "getOrder").mockResolvedValue(order); vi.spyOn(client, "authorizeOrder").mockResolvedValue({ id: "ORDER", status: "COMPLETED", authorizationId: "AUTH" });
    const capture = vi.spyOn(client, "capturePayment").mockResolvedValue({ id: "CAP", status: "COMPLETED", amount: { currency_code: "USD", value: "799.99" }, orderId: "AUTH" });
    const service = new SettlementService({ paypalClient: client });
    expect((await service.completeSettlement({ sessionId: s.id, createInvoice: false })).uncertain).toBe(true);
    expect(sessionStore.getSession(s.id)!.status).toBe("CAPTURE_PENDING_RECONCILIATION"); await service.completeSettlement({ sessionId: s.id }); expect(capture).toHaveBeenCalledTimes(1);
  });
  it("serializes genuinely concurrent FX quote requests", async () => {
    const s = createSession(); const q = await quoted(s);
    let release!: (value: typeof q) => void;
    const pending = new Promise<typeof q>(resolve => { release = resolve; });
    const provider = vi.spyOn(DeterministicDemoFXProvider.prototype, "getQuote").mockReturnValue(pending);
    const first = quoteRoute(request("fx/quote", { sessionId: s.id }));
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
    expect((await quoteRoute(request("fx/quote", { sessionId: s.id }))).status).toBe(409);
    release(q); expect((await first).status).toBe(200);
    expect(sessionStore.getSession(s.id)!.fxQuoteHistory).toHaveLength(1);
  });
  it("rolls back the quote and evidence together when persistence fails", async () => {
    const s = createSession(); const before = sessionStore.getSession(s.id);
    vi.spyOn(sessionStore.getAdapter(), "save").mockImplementation(() => { throw new Error("storage unavailable"); });
    expect((await quoteRoute(request("fx/quote", { sessionId: s.id }))).status).toBe(500);
    expect(sessionStore.getSession(s.id)).toEqual(before); expect(sessionStore.isLocked(s.id)).toBe(false);
  });
  it("rejects a tampered already locked quote", async () => {
    const s = createSession(); await locked(s); s.fxRecord!.rate = "90.0000"; sessionStore.saveSession(s);
    expect((await lockRoute(request("fx/lock", { sessionId: s.id }))).status).toBe(422);
    expect(sessionStore.getSession(s.id)!.fxRecord!.rate).toBe("90.0000");
  });
  it("never treats a consumed quote as permission for a new payment", async () => {
    const s = createSession(); await locked(s); consumeFxRecord(s);
    expect(evaluateSettlementEligibility(s).eligible).toBe(false);
  });
  it("returns an existing checkout without creating another order", async () => {
    const s = createSession("USD"); s.status = "AWAITING_PAYPAL_APPROVAL"; s.paypalOrderId = "ORDER"; s.paypalApprovalUrl = "https://www.sandbox.paypal.com/checkoutnow?token=ORDER"; sessionStore.saveSession(s);
    const client = new PayPalClient(); const create = vi.spyOn(client, "createAuthorizedOrder");
    expect((await new SettlementService({ paypalClient: client }).initiateCheckout({ sessionId: s.id })).orderId).toBe("ORDER");
    expect(create).not.toHaveBeenCalled(); expect(sessionStore.getSession(s.id)!.preSettlementRoot).toBe(s.preSettlementRoot);
  });
  it("keeps confirmed capture durable if later evidence recording fails", async () => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; sessionStore.saveSession(s);
    const order = completedOrder(s, "CAP", "800.00"); order.status = "APPROVED"; delete order.purchase_units![0].payments;
    const client = new PayPalClient(); vi.spyOn(client, "getOrder").mockResolvedValue(order); vi.spyOn(client, "authorizeOrder").mockResolvedValue({ id: "ORDER", status: "COMPLETED", authorizationId: "AUTH" });
    const capture = vi.spyOn(client, "capturePayment").mockResolvedValue({ id: "CAP", status: "COMPLETED", amount: { currency_code: "USD", value: "800.00" }, orderId: "AUTH" });
    vi.spyOn(CryptographicFlightRecorder.prototype, "recordEvent").mockImplementation(() => { throw new Error("evidence unavailable"); });
    const service = new SettlementService({ paypalClient: client });
    await expect(service.completeSettlement({ sessionId: s.id })).rejects.toThrow("evidence unavailable");
    expect(sessionStore.getSession(s.id)!.status).toBe("PAYPAL_CAPTURED"); expect(sessionStore.getSession(s.id)!.paypalCaptureId).toBe("CAP");
    expect((await service.completeSettlement({ sessionId: s.id })).success).toBe(false); expect(capture).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, { currency_code: "USD", value: "NaN" }, { currency_code: "USD", value: "799.99" }])("rejects invalid webhook amounts without consuming the event", async amount => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; sessionStore.saveSession(s);
    const event = { id: "WH-INVALID-AMOUNT", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP", custom_id: `SESSION:${s.id}`, amount } };
    expect((await webhookRoute(request("paypal/webhook", event))).status).toBe(422); expect(defaultWebhookLedger.isProcessed(event.id)).toBe(false);
    expect(sessionStore.getSession(s.id)!.status).toBe("AUDIT_PASSED");
  });
  it("does not reconcile one matching capture when multiple captures exist", async () => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; s.status = "CAPTURE_PENDING_RECONCILIATION"; sessionStore.saveSession(s);
    const order = completedOrder(s, "CAP", "800.00"); order.purchase_units![0].payments!.captures!.push({ id: "SECOND", status: "COMPLETED", amount: { currency_code: "USD", value: "800.00" } });
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(order);
    expect((await new SettlementService().reconcileSettlement({ sessionId: s.id })).reconciled).toBe(false);
  });
  it("uses the remote capture amount and a stable provider idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "TEST_TOKEN", expires_in: 3600 }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: "CAP", status: "COMPLETED", amount: { currency_code: "USD", value: "799.99" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new PayPalClient({ clientId: "test-id", clientSecret: "test-secret" }).capturePayment("AUTH", { currency: "USD", value: 800 });
    expect(result.amount.value).toBe("799.99");
    expect(fetchMock.mock.calls[1][1].headers["PayPal-Request-Id"]).toBe("capture-AUTH");
  });
  it("rejects non-Sandbox PayPal endpoints", () => {
    expect(() => new PayPalClient({ baseUrl: "https://api-m.paypal.com" })).toThrow(/Sandbox/);
  });

  it("rejects a valid flight record bound to the wrong root", () => {
    const s = createSession("USD"); s.preSettlementRoot = "f".repeat(64);
    expect(evaluateSettlementEligibility(s).eligible).toBe(false);
  });
  it("does not allow a caller to supply an order without an authoritative association", async () => {
    const s = createSession("USD"); const client = new PayPalClient(); const capture = vi.spyOn(client, "capturePayment");
    expect((await new SettlementService({ paypalClient: client }).completeSettlement({ sessionId: s.id, orderId: "INJECTED" })).error).toMatch(/binding/);
    expect(capture).not.toHaveBeenCalled();
  });
  it("rejects an authorization response that only echoes the order ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "TEST_TOKEN", expires_in: 3600 }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: "ORDER", status: "COMPLETED" }) }));
    await expect(new PayPalClient({ clientId: "test-id", clientSecret: "test-secret" }).authorizeOrder("ORDER")).rejects.toThrow(/authorization binding/);
  });

  it("captures a completed AUTHORIZE order only with an actual created authorization", async () => {
    const s = createSession("USD"); s.paypalOrderId = "ORDER"; sessionStore.saveSession(s);
    const order = completedOrder(s, "CAP", "800.00"); order.purchase_units![0].payments = { authorizations: [{ id: "AUTH", status: "CREATED", amount: { currency_code: "USD", value: "800.00" } }] };
    const client = new PayPalClient(); vi.spyOn(client, "getOrder").mockResolvedValue(order); const capture = vi.spyOn(client, "capturePayment");
    expect((await new SettlementService({ paypalClient: client }).completeSettlement({ sessionId: s.id, createInvoice: false })).success).toBe(true);
    expect(capture).toHaveBeenCalledTimes(1); expect(capture.mock.calls[0][0]).toBe("AUTH");
  });

  it("does not cancel an uncertain capture or discard its reconciliation requirement", () => {
    const s = createSession("USD"); s.status = "CAPTURE_PENDING_RECONCILIATION"; sessionStore.saveSession(s);
    expect(new SettlementService().cancelCheckout(s.id).success).toBe(false);
    expect(sessionStore.getSession(s.id)!.status).toBe("CAPTURE_PENDING_RECONCILIATION");
  });
  it("persists the same consumed FX commitment and history through a verified webhook", async () => {
    const s = createSession(); await locked(s); s.paypalOrderId = "ORDER"; sessionStore.saveSession(s);
    const value = (s.fxRecord!.targetAmountMinor / 100).toFixed(2);
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(s, "CAP", value));
    const event = { id: "WH-FX-CONSUMED", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP", custom_id: `SESSION:${s.id}`, amount: { currency_code: "USD", value } } };
    expect((await webhookRoute(request("paypal/webhook", event))).status).toBe(200);
    const saved = sessionStore.getSession(s.id)!;
    expect(saved.status).toBe("PAYPAL_CAPTURED"); expect(saved.fxRecord!.status).toBe("CONSUMED"); expect(saved.fxRecord!.conversionHash).toBe(computeConversionHash(saved.fxRecord!)); expect(saved.fxQuoteHistory![0].status).toBe("CONSUMED");
  });

});
