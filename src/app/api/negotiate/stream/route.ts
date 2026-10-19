/**
 * PACTUM — Server-Sent Events (SSE) Negotiation Stream Route
 * Endpoint: /api/negotiate/stream
 *
 * Implements real-time streaming of:
 * - Session initialization
 * - Sourcing completion
 * - Round progression
 * - Outgoing buyer proposals
 * - Guardrail interventions / blocks
 * - Vendor counteroffers
 * - Final offer ranking and Merkle root commitment
 *
 * Follows GEMINI.md Section 6, 11 and SECURITY.md Section 3, 4, 13.
 */

import { NextRequest } from "next/server";
import { parseProcurementMandate } from "@/lib/mandate-parser";
import { Channel3Client } from "@/lib/channel3-client";
import { NegotiationOrchestrator } from "@/lib/negotiation-orchestrator";
import { GeminiNegotiationClient } from "@/lib/gemini-client";

// Active sessions set to prevent duplicate negotiation runs from repeated requests
const activeRunningSessions = new Set<string>();

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: { prompt?: string; currency?: string; clientSessionId?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { prompt, currency, clientSessionId } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Field 'prompt' is required and must be a string." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 1: Parse and validate mandate
    const parseResult = parseProcurementMandate({ prompt, currency });
    if (!parseResult.success || !parseResult.mandate) {
      return new Response(
        JSON.stringify({
          error: parseResult.error ?? "Invalid mandate constraints.",
          missingFields: parseResult.missingFields,
        }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    const mandate = parseResult.mandate;

    // Concurrency / Duplicate check
    const runKey = clientSessionId ?? mandate.id;
    if (activeRunningSessions.has(runKey)) {
      return new Response(
        JSON.stringify({ error: "Negotiation is already active for this session." }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }
    activeRunningSessions.add(runKey);

    // Step 2: Initialize SSE response stream
    const encoder = new TextEncoder();
    const abortController = new AbortController();

    // Listen for client disconnect
    req.signal.addEventListener("abort", () => {
      activeRunningSessions.delete(runKey);
      abortController.abort();
    });

    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(type: string, data: Record<string, unknown>) {
          const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        }

        try {
          // Source wholesale vendor quotes
          const sourcingClient = new Channel3Client();
          const sourcingResult = await sourcingClient.sourceQuotes(mandate);

          sendEvent("SOURCING_COMPLETED", {
            mandate,
            quotes: sourcingResult.quotes,
            isFixture: sourcingResult.isFixture,
            dataSource: sourcingResult.dataSource,
          });

          // Initialize orchestrator with SSE emitter
          const geminiClient = new GeminiNegotiationClient();
          const orchestrator = new NegotiationOrchestrator({
            geminiClient,
            maxRounds: 4, // 4 rounds for hackathon demonstration
            onEvent: async (ev) => {
              if (req.signal.aborted) return;
              sendEvent(ev.type, ev.payload);
            },
          });

          // Execute negotiation loop
          const orchestrationResult = await orchestrator.runNegotiation(mandate, sourcingResult.quotes);
          if (orchestrationResult.session) {
            const { sessionStore } = await import("@/lib/session-store");
            sessionStore.saveSession(orchestrationResult.session);
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "Internal negotiation error";
          sendEvent("NEGOTIATION_FAILED", {
            error: "Negotiation pipeline encountered an unrecoverable condition.",
            detail: errorMessage,
          });
        } finally {
          activeRunningSessions.delete(runKey);
          controller.close();
        }
      },
      cancel() {
        activeRunningSessions.delete(runKey);
        abortController.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error occurred while establishing stream." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
