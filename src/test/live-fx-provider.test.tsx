// Provider-domain tests inject the HTTP persistence boundary; PostgreSQL replay/RLS tests use the real wrapper.
vi.mock("@/lib/db/webhook-route", () => ({ withWebhookRoute: (handler: unknown) => handler }));
// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { LiveFXProvider, computeFxConversion, computeConversionHash, validateFxQuote, auditFxSettlement, getFXRateProvider } from "@/lib/fx-settlement";
import { FX_REQUEST_TIMEOUT_MS, FX_RESPONSE_MAX_BYTES, configuredFxSource } from "@/lib/fx-provider-config";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { defaultWebhookLedger } from "@/lib/webhook-deduplication";
import { POST as webhookRoute } from "@/app/api/paypal/webhook/route";
import { defaultIdempotencyStore } from "@/lib/idempotency";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { SettlementService } from "@/lib/settlement-service";
import { PayPalClient } from "@/lib/paypal-client";
import { POST as quoteRoute } from "@/app/api/fx/quote/route";
import { POST as lockRoute } from "@/app/api/fx/lock/route";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import { completedOrder } from "@/test/helpers/payment-fixtures";
import type { FXQuoteRequest } from "@/lib/fx-settlement";
import type { ProcurementSession } from "@/types/pactum";

const req: FXQuoteRequest = { sessionId: "session", agreementHash: "agreement", sourceCurrency: "INR", targetCurrency: "USD", sourceAmountMinor: 65823425 };
function payload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { result: "success", base_code: "USD", target_code: "INR", conversion_rate: 83.5, time_last_update_unix: now - 3600, time_next_update_unix: now + 82800, ...overrides };
}
function response(data: unknown = payload(), status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function post(path: string, body: unknown, key?: string) {
  return new NextRequest(`http://localhost:3000/api/fx/${path}`, { method: "POST", headers: key ? { "idempotency-key": key } : {}, body: JSON.stringify(body) });
}
function session(currency: "USD" | "INR" = "INR"): ProcurementSession {
  const now = new Date().toISOString();
  const s = sessionStore.createSession({ id: "m", rawPrompt: "Buy monitors", itemQuery: "monitors", quantity: 25, maxTotalBudget: 750000, maxDeliveryDays: 5, minReturnDays: 30, requiredSpecs: [], currency, version: 1, createdAt: now }, []);
  s.selectedQuote = { vendorId: "v", vendorName: "Vendor", sku: "MON", productTitle: "Monitor", initialUnitAsk: 30000, currentUnitBid: 26000, shippingCost: 8234.25, deliveryDays: 4, returnDays: 30, condition: "NEW", status: "ACCEPTED", dataSource: "MOCK_CATALOG", currency };
  s.finalOffer = { unitPrice: 26000, quantity: 25, shippingCost: 8234.25, deliveryDays: 4, returnDays: 30, currency };
  s.agreementRecord = { agreementId: `agr_${s.id}`, sessionId: s.id, vendorId: "v", vendorName: "Vendor", sku: "MON", agreedPrice: 26000, agreedOffer: { ...s.finalOffer }, totalCost: 658234.25, currency, agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER", acceptingParty: "VENDOR", acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER", round: 3, mandateVersion: 1, acceptedAt: now };
  const recorder = CryptographicFlightRecorder.getOrReconstitute(s);
  s.flightRecord = recorder.exportFlightRecord(); s.preSettlementRoot = s.merkleRoot = recorder.getRootHash();
  s.auditCertificate = new AcworldAuditor().audit({ session: s }); expect(s.auditCertificate.passed).toBe(true); s.status = "AUDIT_PASSED"; sessionStore.saveSession(s); return s;
}
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.restoreAllMocks(); vi.stubEnv("FX_PROVIDER", "LIVE_PROVIDER"); vi.stubEnv("EXCHANGE_RATE_API_KEY", "test-secret"); vi.stubEnv("FX_QUOTE_TTL_SECONDS", "300"); vi.stubEnv("FX_REFERENCE_MAX_AGE_SECONDS", "90000");
  sessionStore.clear(); defaultRateLimiter.resetAll(); defaultIdempotencyStore.clear(); defaultWebhookLedger.clear();
  fetchMock = vi.fn().mockImplementation(async () => response()); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("ExchangeRate-API reference adapter", () => {
  it("requests USD/INR and retains actual provider and retrieval timestamps", async () => {
    const body = payload(); fetchMock.mockResolvedValue(response(body)); const before = Date.now(); const q = await new LiveFXProvider().getQuote(req);
    expect(fetchMock.mock.calls[0][0]).toBe("https://v6.exchangerate-api.com/v6/test-secret/pair/USD/INR");
    expect(q.targetAmountMinor).toBe(788304); expect(q.provider).toBe("ExchangeRate-API"); expect(q.rateConvention).toBe("INR_PER_USD"); expect(q.referenceRate!.updatedAt).toBe(new Date(body.time_last_update_unix * 1000).toISOString());
    expect(Date.parse(q.referenceRate!.retrievedAt)).toBeGreaterThanOrEqual(before); expect(q.referenceRate!.retrievedAt).toBe(q.quotedAt); expect(Date.parse(q.expiresAt) - Date.parse(q.quotedAt)).toBe(300000); expect(q.conversionHash).toBe(computeConversionHash(q));
  });
  it("preserves the exact published decimal token and response commitment", async () => {
    const text = JSON.stringify(payload()).replace('"conversion_rate":83.5', '"conversion_rate":83.500000000001');
    fetchMock.mockResolvedValue(new Response(text, { headers: { "Content-Type": "application/json" } })); const q = await new LiveFXProvider().getQuote(req);
    expect(q.rate).toBe("83.500000000001"); expect(q.referenceRate!.responseHash).toBe(crypto.createHash("sha256").update(text).digest("hex")); expect(q.targetAmountMinor).toBe(computeFxConversion(req.sourceAmountMinor, q.rate));
  });
  it.each([undefined, null, 0, -1, "83.5", "bad", {}, []])("rejects missing/invalid rate %j", async conversion_rate => {
    fetchMock.mockResolvedValue(response(payload({ conversion_rate }))); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/rate|structure/i);
  });
  it.each(["1e309", "8.35e1", "83.1234567890123"])("rejects unsupported rate precision/token %s", async token => {
    const text = JSON.stringify(payload()).replace('"conversion_rate":83.5', `"conversion_rate":${token}`); fetchMock.mockResolvedValue(new Response(text, { headers: { "Content-Type": "application/json" } })); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/rate/i);
  });
  it.each([[], null, { result: "success" }, { result: "success", unexpected: { conversion_rate: 83.5 } }])("rejects unexpected response structure %j", async body => {
    fetchMock.mockResolvedValue(response(body)); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/structure|pair/i);
  });
  it("rejects malformed JSON", async () => { fetchMock.mockResolvedValue(new Response("{bad", { headers: { "Content-Type": "application/json" } })); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/JSON/); });
  it("rejects duplicate provider fields", async () => { const text = JSON.stringify(payload()).replace('"conversion_rate":83.5', '"conversion_rate":83.5,"conversion_rate":90'); fetchMock.mockResolvedValue(new Response(text, { headers: { "Content-Type": "application/json" } })); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/structure/); });
  it.each([{ base_code: "INR", target_code: "USD" }, { target_code: "EUR" }])("rejects reversed or unsupported response pair", async fields => { fetchMock.mockResolvedValue(response(payload(fields))); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/pair/); });
  it("rejects unsupported request pair without requesting the provider", async () => { await expect(new LiveFXProvider().getQuote({ ...req, targetCurrency: "EUR" })).rejects.toThrow(/pair/); expect(fetchMock).not.toHaveBeenCalled(); });
  it.each([{ time_last_update_unix: undefined }, { time_last_update_unix: "2026-11-04" }, { time_next_update_unix: undefined }, { time_last_update_unix: 0 }])("rejects missing/invalid timestamps", async fields => { fetchMock.mockResolvedValue(response(payload(fields))); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/timestamp/); });
  it("rejects stale daily reference rates independently of quote TTL", async () => { const now = Math.floor(Date.now() / 1000); fetchMock.mockResolvedValue(response(payload({ time_last_update_unix: now - 90001, time_next_update_unix: now - 3601 }))); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/stale/); });
  it("rejects provider update times in the future", async () => { const now = Math.floor(Date.now() / 1000); fetchMock.mockResolvedValue(response(payload({ time_last_update_unix: now + 60 }))); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/timestamp/); });
  it.each([401, 403, 429, 500, 503])("handles HTTP %s with sanitized errors", async status => { fetchMock.mockResolvedValue(response({ secret: "must-not-leak" }, status)); await expect(new LiveFXProvider().getQuote(req)).rejects.toMatchObject({ code: status === 429 ? "FX_RATE_LIMITED" : [401, 403].includes(status) ? "FX_AUTH_FAILED" : "FX_PROVIDER_UNAVAILABLE" }); });
  it.each(["invalid-key", "inactive-account", "quota-reached", "unsupported-code"])("handles provider error envelope %s", async type => { fetchMock.mockResolvedValue(response({ result: "error", "error-type": type })); await expect(new LiveFXProvider().getQuote(req)).rejects.toMatchObject({ code: type === "quota-reached" ? "FX_RATE_LIMITED" : type === "unsupported-code" ? "FX_RESPONSE_INVALID" : "FX_AUTH_FAILED" }); });
  it("redacts credential-bearing network errors", async () => { fetchMock.mockRejectedValue(new Error("https://host/test-secret private debug")); await expect(new LiveFXProvider().getQuote(req)).rejects.toMatchObject({ code: "FX_NETWORK_ERROR", message: "FX provider could not be reached. Please retry." }); });
  it("times out the full request and aborts it", async () => {
    vi.useFakeTimers(); fetchMock.mockReturnValue(new Promise(() => {})); const promise = new LiveFXProvider().getQuote(req); const assertion = expect(promise).rejects.toMatchObject({ code: "FX_TIMEOUT" }); await vi.advanceTimersByTimeAsync(FX_REQUEST_TIMEOUT_MS); await assertion; expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("also bounds stalled body reads", async () => {
    vi.useFakeTimers(); fetchMock.mockResolvedValue(new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "application/json" } })); const promise = new LiveFXProvider().getQuote(req); const assertion = expect(promise).rejects.toMatchObject({ code: "FX_TIMEOUT" }); await vi.advanceTimersByTimeAsync(FX_REQUEST_TIMEOUT_MS); await assertion;
  });
  it.each([true, false])("rejects oversized responses with or without declared length %s", async declared => { fetchMock.mockResolvedValue(new Response("x".repeat(FX_RESPONSE_MAX_BYTES + 1), { headers: { "Content-Type": "application/json", ...(declared ? { "Content-Length": String(FX_RESPONSE_MAX_BYTES + 1) } : {}) } })); await expect(new LiveFXProvider().getQuote(req)).rejects.toMatchObject({ code: "FX_RESPONSE_TOO_LARGE" }); });
  it("rejects non-JSON HTTP bodies", async () => { fetchMock.mockResolvedValue(new Response("<html/>")); await expect(new LiveFXProvider().getQuote(req)).rejects.toMatchObject({ code: "FX_RESPONSE_INVALID" }); });
  it("requires the server API key without falling back", async () => { vi.stubEnv("EXCHANGE_RATE_API_KEY", ""); await expect(getFXRateProvider().getQuote(req)).rejects.toMatchObject({ code: "FX_NOT_CONFIGURED" }); expect(fetchMock).not.toHaveBeenCalled(); });
  it("honors explicit demo mode offline", async () => { vi.stubEnv("FX_PROVIDER", "DETERMINISTIC_DEMO"); expect((await getFXRateProvider().getQuote(req)).rateSource).toBe("DETERMINISTIC_DEMO"); expect(fetchMock).not.toHaveBeenCalled(); });
  it("prevents browser demo downgrade of a live server", () => { expect(() => configuredFxSource("DETERMINISTIC_DEMO")).toThrow(/substitution/); });
  it.each(["0", "901", "NaN", "1.5"])("rejects invalid TTL configuration %s", async value => { vi.stubEnv("FX_QUOTE_TTL_SECONDS", value); await expect(new LiveFXProvider().getQuote(req)).rejects.toThrow(/FX_QUOTE_TTL/); expect(fetchMock).not.toHaveBeenCalled(); });
  it("retains exact direction, HALF_UP boundaries, and deterministic safe integer conversion", () => { expect(computeFxConversion(65823425, "83.5000")).toBe(788304); expect(computeFxConversion(3, "2")).toBe(2); expect(computeFxConversion(Number.MAX_SAFE_INTEGER, "1")).toBe(Number.MAX_SAFE_INTEGER); expect(() => computeFxConversion(Number.MAX_SAFE_INTEGER + 1, "1")).toThrow(); expect(computeFxConversion(65823425, "83.5000")).toBe(computeFxConversion(65823425, "83.5000")); });
});

describe("Live reference quote, evidence, PayPal, and UI", () => {
  async function quoteAndLock(s = session()) {
    expect((await quoteRoute(post("quote", { sessionId: s.id }))).status).toBe(200);
    expect((await lockRoute(post("lock", { sessionId: s.id }))).status).toBe(200);
    return sessionStore.getSession(s.id)!;
  }
  it("creates and locks an authoritative live quote without changing commercial terms", async () => {
    const s = session(); const agreement = structuredClone(s.agreementRecord); const saved = await quoteAndLock(s);
    expect(saved.agreementRecord).toEqual(agreement); expect(saved.fxRecord!.status).toBe("LOCKED"); expect(saved.fxRecord!.rateSource).toBe("LIVE_PROVIDER"); expect(saved.fxRecord!.targetAmountMinor).toBe(788304); expect(saved.fxVerification!.passed).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(CryptographicFlightRecorder.fromSerialized(saved.flightRecord!).verifyIntegrity().valid).toBe(true);
    const event = saved.flightRecord!.events.find(e => e.eventType === "FX_QUOTE_CREATED")!; expect(event.publicPayload.referenceRate).toEqual(saved.fxRecord!.referenceRate); expect(event.publicPayload.conversionHash).toBe(saved.fxRecord!.conversionHash);
  });
  it("does not create a PayPal order while quoting or locking", async () => { const create = vi.spyOn(PayPalClient.prototype, "createAuthorizedOrder"); await quoteAndLock(); expect(create).not.toHaveBeenCalled(); });
  it("replays duplicate quote requests without a second provider request", async () => { const s = session(); const first = await (await quoteRoute(post("quote", { sessionId: s.id }, "live-duplicate"))).json(); const second = await (await quoteRoute(post("quote", { sessionId: s.id }, "live-duplicate"))).json(); expect(second.fxRecord).toEqual(first.fxRecord); expect(fetchMock).toHaveBeenCalledTimes(1); });
  it("serializes concurrent live quote requests", async () => {
    const s = session(); let resolve!: (value: Response) => void; fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done; })); const first = quoteRoute(post("quote", { sessionId: s.id })); await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); expect((await quoteRoute(post("quote", { sessionId: s.id }))).status).toBe(409); resolve(response()); expect((await first).status).toBe(200);
  });
  it("serializes lock requests against the shared financial lock", async () => { const s = session(); await quoteRoute(post("quote", { sessionId: s.id })); sessionStore.acquireLock(s.id); expect((await lockRoute(post("lock", { sessionId: s.id }))).status).toBe(409); sessionStore.releaseLock(s.id); expect((await lockRoute(post("lock", { sessionId: s.id }))).status).toBe(200); expect(fetchMock).toHaveBeenCalledTimes(1); });
  it("rejects a quote at its expiry without fetching a replacement", async () => { const s = session(); await quoteRoute(post("quote", { sessionId: s.id })); const q = sessionStore.getSession(s.id)!.fxRecord!; vi.useFakeTimers(); vi.setSystemTime(Date.parse(q.expiresAt)); expect((await lockRoute(post("lock", { sessionId: s.id }))).status).toBe(422); expect(fetchMock).toHaveBeenCalledTimes(1); });
  it("never refreshes a locked quote when a market rate changes", async () => { const saved = await quoteAndLock(); const q = structuredClone(saved.fxRecord); fetchMock.mockResolvedValue(response(payload({ conversion_rate: 99 }))); expect((await quoteRoute(post("quote", { sessionId: saved.id }))).status).toBe(200); expect(sessionStore.getSession(saved.id)!.fxRecord).toEqual(q); expect(fetchMock).toHaveBeenCalledTimes(1); });
  it.each(["rate", "provider timestamp"])("rejects tampered %s at lock", async field => { const s = session(); await quoteRoute(post("quote", { sessionId: s.id })); const saved = sessionStore.getSession(s.id)!; if (field === "rate") saved.fxRecord!.rate = "90.0000"; else saved.fxRecord!.referenceRate!.updatedAt = new Date(Date.now() - 7200000).toISOString(); sessionStore.saveSession(saved); expect((await lockRoute(post("lock", { sessionId: s.id }))).status).toBe(422); });
  it("binds provider provenance into the immutable hash", async () => { const q = await new LiveFXProvider().getQuote(req); const oldHash = q.conversionHash; q.referenceRate!.retrievedAt = new Date(Date.now() - 500).toISOString(); expect(computeConversionHash(q)).not.toBe(oldHash); expect(() => validateFxQuote(q)).toThrow(); });
  it("rejects stale provider provenance even if its hash is recomputed", async () => { const q = await new LiveFXProvider().getQuote(req); q.referenceRate!.updatedAt = new Date(Date.now() - 90001000).toISOString(); q.referenceRate!.nextUpdateAt = new Date(Date.now() - 3601000).toISOString(); q.conversionHash = computeConversionHash(q); expect(() => validateFxQuote(q)).toThrow(/stale/); });
  it("invalidates a quote when authoritative agreement revision changes", async () => { const s = session(); await quoteRoute(post("quote", { sessionId: s.id })); const saved = sessionStore.getSession(s.id)!; saved.agreementRecord!.mandateVersion += 1; sessionStore.saveSession(saved); expect((await lockRoute(post("lock", { sessionId: s.id }))).status).toBe(403); expect(fetchMock).toHaveBeenCalledTimes(1); });
  it("rejects a forged commercial certificate before requesting a rate", async () => { const s = session(); s.auditCertificate!.certificateHash = "f".repeat(64); sessionStore.saveSession(s); expect((await quoteRoute(post("quote", { sessionId: s.id }))).status).toBe(403); expect(fetchMock).not.toHaveBeenCalled(); });
  it("requires VeriPay evidence at ACWORLD verification", async () => { const saved = await quoteAndLock(); delete saved.flightRecord; expect(auditFxSettlement({ session: saved, fxRecord: saved.fxRecord! }).passed).toBe(false); });
  it.each([quoteRoute, lockRoute])("fails closed on required evidence recording failure", async route => { const s = session(); if (route === lockRoute) await quoteRoute(post("quote", { sessionId: s.id })); const before = sessionStore.getSession(s.id); vi.spyOn(CryptographicFlightRecorder, "getOrReconstitute").mockImplementation(() => { throw new Error("evidence failed"); }); expect((await route(post("fx", { sessionId: s.id }))).status).toBe(422); expect(sessionStore.getSession(s.id)).toEqual(before); });
  it("blocks financial success when evidence persistence fails", async () => { const s = session(); vi.spyOn(sessionStore.getAdapter(), "save").mockImplementation(() => { throw new Error("storage failed"); }); expect((await quoteRoute(post("quote", { sessionId: s.id }))).status).toBe(500); expect(sessionStore.getSession(s.id)!.fxRecord).toBeUndefined(); });
  it("does not persist a quote or continue to PayPal after provider failure", async () => { const s = session(); fetchMock.mockResolvedValue(response({}, 429)); const res = await quoteRoute(post("quote", { sessionId: s.id })); expect(res.status).toBe(503); expect((await res.json()).code).toBe("FX_RATE_LIMITED"); expect(sessionStore.getSession(s.id)!.fxRecord).toBeUndefined(); const create = vi.spyOn(PayPalClient.prototype, "createAuthorizedOrder"); expect((await new SettlementService().initiateCheckout({ sessionId: s.id })).success).toBe(false); expect(create).not.toHaveBeenCalled(); });
  it("uses locked USD minor units throughout checkout and capture", async () => {
    const saved = await quoteAndLock(); const client = new PayPalClient(); const create = vi.spyOn(client, "createAuthorizedOrder"); const service = new SettlementService({ paypalClient: client });
    const checkout = await service.initiateCheckout({ sessionId: saved.id }); expect(checkout.success).toBe(true); expect(create.mock.calls[0][0]).toMatchObject({ currency: "USD", totalAmount: 7883.04 });
    const captured = await service.completeSettlement({ sessionId: saved.id, orderId: checkout.orderId, createInvoice: false }); expect(captured.success).toBe(true); expect(sessionStore.getSession(saved.id)!.captureAmount).toBe(7883.04); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reconciles locked-rate USD capture after reference and quote expiry without requesting rates", async () => {
    const saved = await quoteAndLock(); saved.paypalOrderId = "ORDER"; saved.status = "CAPTURE_PENDING_RECONCILIATION"; sessionStore.saveSession(saved); vi.useFakeTimers(); vi.setSystemTime(Date.parse(saved.fxRecord!.expiresAt) + 90000000);
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(saved, "CAP", "7883.04")); expect((await new SettlementService().reconcileSettlement({ sessionId: saved.id })).reconciled).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps native USD checkout independent of the FX provider", async () => { const s = session("USD"); expect((await new SettlementService().initiateCheckout({ sessionId: s.id })).success).toBe(true); expect(fetchMock).not.toHaveBeenCalled(); });
  it("shows actual provider, timestamps, provenance, and authoritative verification", async () => { const saved = await quoteAndLock(); const { container } = render(<SettlementCenterScreen session={saved} />); expect(screen.getByText("ExchangeRate-API")).toBeInTheDocument(); expect(screen.getByText("External Reference Rate")).toBeInTheDocument(); const dates = [...container.querySelectorAll("time")].map(t => t.dateTime); expect(dates).toEqual(expect.arrayContaining([saved.fxRecord!.referenceRate!.updatedAt, saved.fxRecord!.referenceRate!.retrievedAt, saved.fxRecord!.expiresAt])); expect(screen.getByText(`${saved.fxVerification!.checks.length}/${saved.fxVerification!.checks.length} CHECKS PASS`)).toBeInTheDocument(); });
  it("distinguishes deterministic demo rates", async () => { vi.stubEnv("FX_PROVIDER", "DETERMINISTIC_DEMO"); const saved = await quoteAndLock(); render(<SettlementCenterScreen session={saved} />); expect(screen.getByText("Deterministic Demo Rate")).toBeInTheDocument(); expect(screen.queryByText("Provider Updated:")).not.toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled(); });
  it("shows provider failures and permits explicit safe retry without opening PayPal", async () => {
    const s = session(); fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: "FX provider rate limit exceeded. Please retry later." }), { status: 503, headers: { "Content-Type": "application/json" } })); render(<SettlementCenterScreen session={s} />); fireEvent.click(screen.getByText("Get Settlement Quote")); await waitFor(() => expect(screen.getByText(/rate limit exceeded/)).toBeInTheDocument()); expect(screen.getByText("Get Settlement Quote").closest("button")).not.toBeDisabled(); expect(screen.queryByText("Continue to PayPal Sandbox")).not.toBeInTheDocument();
  });
  it("makes concurrent lock retries idempotent without duplicate evidence or refetch", async () => {
    const s = session(); await quoteRoute(post("quote", { sessionId: s.id }));
    const results = await Promise.all([lockRoute(post("lock", { sessionId: s.id })), lockRoute(post("lock", { sessionId: s.id }))]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    const saved = sessionStore.getSession(s.id)!; expect(saved.flightRecord!.events.filter(e => e.eventType === "FX_QUOTE_LOCKED")).toHaveLength(1); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects provenance mutation even when its conversion hash is recomputed", async () => {
    const s = session(); await quoteRoute(post("quote", { sessionId: s.id })); const saved = sessionStore.getSession(s.id)!;
    saved.fxRecord!.referenceRate!.responseHash = "f".repeat(64); saved.fxRecord!.conversionHash = computeConversionHash(saved.fxRecord!); sessionStore.saveSession(saved);
    expect((await lockRoute(post("lock", { sessionId: s.id }))).status).toBe(422);
  });
  it("does not refresh a live rate during capture webhook processing", async () => {
    const saved = await quoteAndLock(); saved.paypalOrderId = "ORDER"; saved.status = "CAPTURE_PENDING_RECONCILIATION"; sessionStore.saveSession(saved);
    vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(saved, "CAP", "7883.04")); vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    const event = { id: "LIVE-WH", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP", custom_id: `SESSION:${saved.id}`, amount: { currency_code: "USD", value: "7883.04" } } };
    const result = await webhookRoute(new NextRequest("http://localhost:3000/api/paypal/webhook", { method: "POST", body: JSON.stringify(event) }));
    expect(result.status).toBe(200); expect(fetchMock).toHaveBeenCalledTimes(1); const consumed = sessionStore.getSession(saved.id)!; expect(consumed.fxRecord!.status).toBe("CONSUMED"); expect(consumed.fxRecord!.conversionHash).toBe(saved.fxRecord!.conversionHash);
  });
  it("distinguishes stale provider data from a still-unexpired quote", async () => {
    vi.stubEnv("FX_REFERENCE_MAX_AGE_SECONDS", "3601"); const s = session(); await quoteRoute(post("quote", { sessionId: s.id })); const q = sessionStore.getSession(s.id)!.fxRecord!;
    vi.useFakeTimers(); vi.setSystemTime(Date.parse(q.quotedAt) + 2000); expect(Date.now()).toBeLessThan(Date.parse(q.expiresAt));
    const result = await lockRoute(post("lock", { sessionId: s.id })); expect(result.status).toBe(422); expect((await result.json()).error).toMatch(/stale/); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("shows an expired locked quote without offering silent rate replacement", async () => {
    const saved = await quoteAndLock(); vi.useFakeTimers(); vi.setSystemTime(Date.parse(saved.fxRecord!.expiresAt)); render(<SettlementCenterScreen session={saved} />);
    expect(screen.getByText("FX Quote Expired")).toBeInTheDocument(); expect(screen.getByText("Refresh FX Quote").closest("button")).toBeDisabled(); expect(screen.queryByText("Continue to PayPal Sandbox")).not.toBeInTheDocument();
  });

  it("does not replace a locked demo quote when server mode switches to live", async () => {
    vi.stubEnv("FX_PROVIDER", "DETERMINISTIC_DEMO"); const saved = await quoteAndLock(); vi.stubEnv("FX_PROVIDER", "LIVE_PROVIDER");
    expect((await quoteRoute(post("quote", { sessionId: saved.id }))).status).toBe(409); expect(fetchMock).not.toHaveBeenCalled(); expect(sessionStore.getSession(saved.id)!.fxRecord).toEqual(saved.fxRecord);
  });
  it("does not silently refresh an external quote using a demo server default", async () => {
    const s = session(); await quoteRoute(post("quote", { sessionId: s.id })); const before = sessionStore.getSession(s.id)!.fxRecord;
    vi.stubEnv("FX_PROVIDER", "DETERMINISTIC_DEMO"); expect((await quoteRoute(post("quote", { sessionId: s.id }))).status).toBe(409); expect(sessionStore.getSession(s.id)!.fxRecord).toEqual(before); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});
