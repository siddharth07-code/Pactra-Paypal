import { describe, it, expect } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

describe("Negotiation SSE Stream API Route Tests", () => {
  it("rejects missing prompt with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt");
  });

  it("rejects incomplete mandate with 422 Unprocessable Entity", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({ prompt: "Buy some displays" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("Mandate incomplete");
    expect(data.missingFields).toBeDefined();
  });

  it("initializes SSE stream for valid procurement prompt", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        prompt:
          "Purchase 25 4K USB-C monitors under a $10,000 total budget, with delivery within five days and a minimum 30-day return policy.",
        clientSessionId: "test-sse-session-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.body).toBeDefined();
  });

  it("halts negotiation stream when sourcing eligibility gate finds 0 eligible quotes", async () => {
    const req = new NextRequest("http://localhost:3000/api/negotiate/stream", {
      method: "POST",
      body: JSON.stringify({
        prompt:
          "Purchase 5 Clinical Centrifuges under a $5,000 total budget, with delivery within 5 days and a minimum 30-day return policy.",
        clientSessionId: "test-sse-uncatalogued-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    let accumulatedText = "";
    const decoder = new TextDecoder();

    // Read the stream output
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      accumulatedText += decoder.decode(value, { stream: true });
    }

    expect(accumulatedText).toContain("SOURCING_COMPLETED");
    expect(accumulatedText).toContain("NEGOTIATION_FAILED");
    expect(accumulatedText).toContain("Sourcing eligibility gate blocked negotiation");
    // Ensure negotiation rounds never commenced
    expect(accumulatedText).not.toContain("ROUND_STARTED");
  });
});
