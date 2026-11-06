// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { disputeService } from "@/lib/dispute-service";
import { sessionStore } from "@/lib/session-store";
import { MemorySessionPersistenceAdapter } from "@/lib/persistence/session-persistence";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import { POST } from "./route";

vi.mock("@/lib/rate-limiter", () => ({
  defaultRateLimiter: { checkLimit: vi.fn() },
  createRateLimitResponse: vi.fn(),
}));

describe("PayPal dispute evidence local-only reporting", () => {
  beforeEach(() => {
    sessionStore.setAdapter(new MemorySessionPersistenceAdapter());
    vi.mocked(defaultRateLimiter.checkLimit).mockResolvedValue({
      allowed: true, limit: 15, remaining: 14, resetEpochSeconds: 0,
      retryAfterSeconds: 0, policy: "DISPUTE_OPS", identity: "test",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("External requests forbidden")));
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });

  function fixture() {
    const session = sessionStore.createSession({
      id: "mandate-dispute-reporting", rawPrompt: "Buy monitors", itemQuery: "Monitors",
      quantity: 1, maxTotalBudget: 100, maxDeliveryDays: 5, minReturnDays: 14,
      requiredSpecs: [], currency: "USD", createdAt: new Date().toISOString(),
    });
    session.status = "SETTLED";
    session.paypalCaptureId = "CAPTURE-EXISTING";
    sessionStore.saveSession(session);
    const dispute = disputeService.openDispute({ sessionId: session.id, category: "OTHER", description: "Review existing evidence" });
    return { sessionId: session.id, dispute };
  }
  function request(body: unknown) {
    return new NextRequest("http://localhost/api/paypal/dispute", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  describe.each([true, false])("credentials configured: %s", configured => {
    beforeEach(() => {
      vi.stubEnv("PAYPAL_CLIENT_ID", configured ? "test-client" : "");
      vi.stubEnv("PAYPAL_CLIENT_SECRET", configured ? "test-secret" : "");
    });

    it.each([true, false, undefined])("reports local packaging only for submitToPayPal=%s", async submitToPayPal => {
      const { sessionId, dispute } = fixture();
      const before = sessionStore.getSession(sessionId);
      const expected = disputeService.preparePayPalDisputeEvidence(dispute.disputeId);
      const response = await POST(request({ disputeId: dispute.disputeId, submitToPayPal }));
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({
        success: true, submissionStatus: "EVIDENCE_PACKAGED_LOCAL_ONLY",
        paypalResponse: { acknowledged: false, evidenceRoot: expected.evidenceRoot, proofCount: expected.inclusionProofs.length },
      });
      expect(result.paypalResponse.notice).toMatch(/not.*submitted.*PayPal/i);
      expect(result.paypalResponse).not.toHaveProperty("timestamp");
      expect(result.paypalResponse).not.toHaveProperty("id");
      expect(result.evidencePackage).toMatchObject({
        disputeId: dispute.disputeId, sessionId, evidenceRoot: expected.evidenceRoot,
        mandateSnapshot: expected.mandateSnapshot, inclusionProofs: expected.inclusionProofs,
        settlementReference: { paypalCaptureId: "CAPTURE-EXISTING" },
        evaluationOutcome: { status: "OPENED", financialDisposition: "UNEXECUTED" },
      });
      expect(sessionStore.getSession(sessionId)).toEqual(before);
    });
  });

  it.each([["Dispute missing not found.", 404], ["Evidence packaging failed.", 400]] as const)(
    "does not report success when packaging fails: %s", async (message, status) => {
      vi.spyOn(disputeService, "preparePayPalDisputeEvidence").mockImplementationOnce(() => { throw new Error(message); });
      const response = await POST(request({ disputeId: "missing", submitToPayPal: true }));
      expect(response.status).toBe(status);
      const result = await response.json();
      expect(result).toEqual({ success: false, error: message });
      expect(result).not.toHaveProperty("paypalResponse");
      expect(result).not.toHaveProperty("submissionStatus");
    }
  );

  it("preserves an evaluated dispute, its evidence, and its unexecuted financial disposition", async () => {
    const { sessionId, dispute } = fixture();
    const evaluated = disputeService.evaluateDispute({ disputeId: dispute.disputeId });
    const before = sessionStore.getSession(sessionId);
    const response = await POST(request({ disputeId: dispute.disputeId, submitToPayPal: true }));
    const result = await response.json();
    expect(result.evidencePackage.evaluationOutcome.status).toBe(evaluated.status);
    expect(result.evidencePackage.evaluationOutcome.financialDisposition).toBe("UNEXECUTED");
    expect(result.paypalResponse.acknowledged).toBe(false);
    expect(sessionStore.getSession(sessionId)).toEqual(before);
    expect(sessionStore.getSession(sessionId)!.status).toBe("DISPUTED");
  });

  it("retains validation for missing dispute IDs", async () => {
    const response = await POST(request({ submitToPayPal: true }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("disputeId");
  });

  it("retains malformed JSON rejection", async () => {
    const response = await POST(new NextRequest("http://localhost/api/paypal/dispute", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Malformed JSON payload.");
  });
});
