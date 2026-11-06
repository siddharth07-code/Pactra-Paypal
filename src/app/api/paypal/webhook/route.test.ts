// Provider-domain tests inject the HTTP persistence boundary; PostgreSQL replay/RLS tests use the real wrapper.
vi.mock("@/lib/db/webhook-route", () => ({ withWebhookRoute: (handler: unknown) => handler }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PayPalClient, WebhookVerificationUnavailableError } from "@/lib/paypal-client";
import { sessionStore } from "@/lib/session-store";
import { MemorySessionPersistenceAdapter } from "@/lib/persistence/session-persistence";
import { defaultWebhookLedger } from "@/lib/webhook-deduplication";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { POST } from "./route";

vi.mock("@/lib/rate-limiter", () => ({
  defaultRateLimiter: { checkLimit: vi.fn().mockResolvedValue({ allowed: true }) },
  createRateLimitResponse: vi.fn(),
}));

describe("webhook authenticity and replay safety", () => {
  beforeEach(() => {
    vi.mocked(defaultRateLimiter.checkLimit).mockResolvedValue({
      allowed: true, limit: 10, remaining: 9, resetEpochSeconds: 0,
      retryAfterSeconds: 0, policy: "PAYPAL_SETTLEMENT", identity: "test",
    });
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-CONFIGURED");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("External requests forbidden")));
    sessionStore.setAdapter(new MemorySessionPersistenceAdapter());
    defaultWebhookLedger.clear();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  function fixture() {
    const session = sessionStore.createSession({
      id: "mandate-webhook", rawPrompt: "Buy monitors", itemQuery: "Monitors",
      quantity: 1, maxTotalBudget: 100, maxDeliveryDays: 5, minReturnDays: 14,
      requiredSpecs: [], currency: "USD", createdAt: new Date().toISOString(),
    });
    session.status = "PAYPAL_CAPTURED";
    session.paypalInvoiceId = "INV-BOUND";
    sessionStore.saveSession(session);
    const event = {
      id: "WH-AUTHENTIC", event_type: "INVOICING.INVOICE.PAID", event_version: "1.0",
      create_time: "2026-11-06T00:00:00Z", resource_type: "invoices", summary: "Invoice paid",
      resource: { id: "INV-BOUND", custom_id: `SESSION:${session.id}`, extra: { providerField: true } },
      links: [{ href: "https://example.invalid/event", rel: "self" }], extension: [1, { nested: "preserved" }],
    };
    return { session, event };
  }
  function request(event: unknown) {
    return new NextRequest("http://localhost/api/paypal/webhook", {
      method: "POST", headers: { "Content-Type": "application/json", "paypal-transmission-sig": "LONG_FORGED_SIGNATURE" },
      body: JSON.stringify(event),
    });
  }

  it("passes the complete event unchanged to an injected verifier and retains valid behavior", async () => {
    const { session, event } = fixture();
    const verify = vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    expect((await POST(request(event))).status).toBe(200);
    expect(verify.mock.calls[0][0].webhookEvent).toEqual(event);
    expect(sessionStore.getSession(session.id)).toMatchObject({ status: "SETTLED", invoiceStatus: "PAID" });
    expect(defaultWebhookLedger.isProcessed(event.id)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures before touching the ledger or business state", async () => {
    const { session, event } = fixture();
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(false);
    const claim = vi.spyOn(defaultWebhookLedger, "recordProcessing");
    expect((await POST(request(event))).status).toBe(401);
    expect(claim).not.toHaveBeenCalled();
    expect(sessionStore.getSession(session.id)).toEqual(session);
  });

  it.each(["development", "production"])("fails closed with missing credentials in %s", async mode => {
    const { session, event } = fixture();
    const adapter = sessionStore.getAdapter();
    vi.stubEnv("NODE_ENV", mode);
    const response = await POST(request(event));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(defaultWebhookLedger.getEntry(event.id)).toBeUndefined();
    expect(adapter.load().sessions.find(s => s.id === session.id)).toEqual(session);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires authentication even for an already processed event", async () => {
    const { event } = fixture();
    defaultWebhookLedger.recordProcessing(event.id, event.event_type);
    defaultWebhookLedger.recordProcessed(event.id);
    expect((await POST(request(event))).status).toBe(401);
    expect(defaultWebhookLedger.isProcessed(event.id)).toBe(true);
  });

  it("authenticates before claiming and processes simultaneous duplicates once", async () => {
    const { event } = fixture();
    let release!: (value: boolean) => void;
    const barrier = new Promise<boolean>(resolve => { release = resolve; });
    const verify = vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockReturnValue(barrier);
    const claim = vi.spyOn(defaultWebhookLedger, "recordProcessing");
    const save = vi.spyOn(sessionStore, "saveSession");
    const first = POST(request(event));
    const second = POST(request(event));
    await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
    expect(claim).not.toHaveBeenCalled();
    release(true);
    const responses = await Promise.all([first, second]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(claim.mock.results.map(result => result.value)).toEqual([true, false]);
    expect(save).toHaveBeenCalledTimes(1);
    expect((await responses[1].json()).deduplicated).toBe(true);
  });

  it("never enters business processing when an event claim is refused", async () => {
    const { session, event } = fixture();
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    vi.spyOn(defaultWebhookLedger, "recordProcessing").mockReturnValue(false);
    const acquire = vi.spyOn(sessionStore, "acquireLock");
    expect((await POST(request(event))).status).toBe(409);
    expect(acquire).not.toHaveBeenCalled();
    expect(sessionStore.getSession(session.id)).toEqual(session);
  });

  it("returns retryable failure without changing an existing claim on verification outage", async () => {
    const { event } = fixture();
    defaultWebhookLedger.recordProcessing(event.id, event.event_type);
    const original = defaultWebhookLedger.getEntry(event.id);
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockRejectedValue(new WebhookVerificationUnavailableError());
    const response = await POST(request(event));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(defaultWebhookLedger.getEntry(event.id)).toEqual(original);
  });

  it("allows safe retry after a verification outage without creating a premature claim", async () => {
    const { event } = fixture();
    const verify = vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature")
      .mockRejectedValueOnce(new WebhookVerificationUnavailableError()).mockResolvedValue(true);
    expect((await POST(request(event))).status).toBe(503);
    expect(defaultWebhookLedger.getEntry(event.id)).toBeUndefined();
    expect((await POST(request(event))).status).toBe(200);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(defaultWebhookLedger.isProcessed(event.id)).toBe(true);
  });

  it("preserves the active owner's claim when a duplicate delivery is refused", async () => {
    const { event } = fixture();
    defaultWebhookLedger.recordProcessing(event.id, event.event_type);
    const original = defaultWebhookLedger.getEntry(event.id);
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    const acquire = vi.spyOn(sessionStore, "acquireLock");
    expect((await POST(request(event))).status).toBe(409);
    expect(defaultWebhookLedger.getEntry(event.id)).toEqual(original);
    expect(acquire).not.toHaveBeenCalled();
  });

  it("does not process business state when claim persistence fails", async () => {
    const { session, event } = fixture();
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    vi.spyOn(defaultWebhookLedger, "recordProcessing").mockImplementation(() => { throw new Error("Storage unavailable"); });
    expect((await POST(request(event))).status).toBe(500);
    expect(sessionStore.getSession(session.id)).toEqual(session);
    expect(defaultWebhookLedger.getEntry(event.id)).toBeUndefined();
  });

  it("does not acknowledge success when completion persistence fails", async () => {
    const { event } = fixture();
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    vi.spyOn(defaultWebhookLedger, "recordProcessed").mockImplementationOnce(() => { throw new Error("Storage unavailable"); });
    expect((await POST(request(event))).status).toBe(500);
    expect(defaultWebhookLedger.isProcessed(event.id)).toBe(false);
    expect((await POST(request(event))).status).toBe(200);
  });

  it("never marks an event processed when business persistence fails", async () => {
    const { session, event } = fixture();
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    vi.spyOn(sessionStore.getAdapter(), "save").mockImplementationOnce(() => { throw new Error("Disk unavailable"); });
    expect((await POST(request(event))).status).toBe(500);
    expect(defaultWebhookLedger.isProcessed(event.id)).toBe(false);
    expect(sessionStore.getSession(session.id)).toEqual(session);
  });

  it("returns retryable failure if even recording the failure cannot be persisted", async () => {
    const { event } = fixture();
    vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    vi.spyOn(defaultWebhookLedger, "recordProcessed").mockImplementationOnce(() => { throw new Error("Disk unavailable"); });
    vi.spyOn(defaultWebhookLedger, "recordFailed").mockImplementationOnce(() => { throw new Error("Disk unavailable"); });
    expect((await POST(request(event))).status).toBe(503);
    expect(defaultWebhookLedger.isProcessed(event.id)).toBe(false);
  });

  it.each([undefined, "", 42])("rejects event ID %s rather than bypassing replay protection", async id => {
    const { event } = fixture();
    expect((await POST(request({ ...event, id }))).status).toBe(400);
  });
});
