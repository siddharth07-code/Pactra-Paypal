import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayPalClient, WebhookVerificationUnavailableError, type WebhookVerificationParams } from "./paypal-client";

describe("PayPal webhook provider verification", () => {
  const params: WebhookVerificationParams = {
    authAlgo: "SHA256withRSA", certUrl: "https://example.invalid/cert", transmissionId: "TX",
    transmissionSig: "LONG_FORGED_SIGNATURE", transmissionTime: "2026-11-06T00:00:00Z", webhookId: "WH-ID",
    webhookEvent: { id: "EVENT", event_type: "EVENT.TYPE", resource: {}, event_version: "1.0", extra: { keep: true } },
  };
  let client: PayPalClient;
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("External requests forbidden")));
    client = new PayPalClient({ clientId: "test-client", clientSecret: "test-secret" });
    vi.spyOn(client, "getAccessToken").mockResolvedValue("test-token");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("sends every event field unchanged to the verification API", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ verification_status: "SUCCESS" }));
    expect(await client.verifyWebhookSignature(params)).toBe(true);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.webhook_event).toEqual(params.webhookEvent);
  });
  it("rejects an explicit signature verification failure", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ verification_status: "FAILURE" }));
    expect(await client.verifyWebhookSignature(params)).toBe(false);
  });
  it.each(["authAlgo", "certUrl", "transmissionId", "transmissionSig", "transmissionTime"] as const)("rejects missing %s before requesting provider credentials", async field => {
    expect(await client.verifyWebhookSignature({ ...params, [field]: "" })).toBe(false);
    expect(client.getAccessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([["", ""], ["test-client", ""], ["", "test-secret"], [" ", " "]])(
    "rejects missing credentials without a provider request", async (clientId, clientSecret) => {
      const unconfigured = new PayPalClient({ clientId, clientSecret });
      expect(await unconfigured.verifyWebhookSignature(params)).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it("rejects missing webhook configuration without a provider request", async () => {
    expect(await client.verifyWebhookSignature({ ...params, webhookId: "" })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403])("rejects provider HTTP %s", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    expect(await client.verifyWebhookSignature(params)).toBe(false);
  });
  it.each([429, 500, 503])("keeps provider HTTP %s retryable", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));
    await expect(client.verifyWebhookSignature(params)).rejects.toBeInstanceOf(WebhookVerificationUnavailableError);
  });
  it.each([new Error("network failure"), new DOMException("timeout", "TimeoutError")])("keeps transport errors retryable", async error => {
    vi.mocked(fetch).mockRejectedValue(error);
    await expect(client.verifyWebhookSignature(params)).rejects.toBeInstanceOf(WebhookVerificationUnavailableError);
  });
  it.each(["not json", "{}", '{"verification_status":"UNKNOWN"}', "null"])("rejects malformed provider result %s", async body => {
    vi.mocked(fetch).mockResolvedValue(new Response(body));
    await expect(client.verifyWebhookSignature(params)).rejects.toBeInstanceOf(WebhookVerificationUnavailableError);
  });
  it("keeps token acquisition outages retryable without exposing provider details", async () => {
    vi.mocked(client.getAccessToken).mockRejectedValue(new Error("sensitive provider detail"));
    await expect(client.verifyWebhookSignature(params)).rejects.toThrow("temporarily unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
});
