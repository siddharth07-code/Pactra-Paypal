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
          "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy.",
        clientSessionId: "test-sse-session-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.body).toBeDefined();
  });
});
