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
import crypto from "crypto";
import { parseProcurementMandate } from "@/lib/mandate-parser";
import { Channel3Client } from "@/lib/channel3-client";
import { NegotiationOrchestrator } from "@/lib/negotiation-orchestrator";
import { GeminiNegotiationClient } from "@/lib/gemini-client";
import { SourcingEvaluator } from "@/lib/sourcing-evaluator";
import { sessionStore } from "@/lib/session-store";
import type { ProcurementMandate, VendorQuote } from "@/types/pactum";
import { defaultRateLimiter } from "@/lib/rate-limiter";

// Active sessions set to prevent duplicate negotiation runs from repeated requests
const activeRunningSessions = new Set<string>();

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Enforce rate limiting before opening the SSE stream
  const rateLimit = await defaultRateLimiter.check(req, "NEGOTIATION_STREAM");
  if (!rateLimit.allowed) {
    return rateLimit.response!;
  }

  try {
    let body: {
      prompt?: string;
      currency?: string;
      clientSessionId?: string;
      rawMandate?: {
        itemQuery?: string;
        quantity?: number;
        maxTotalBudget?: number;
        maxDeliveryDays?: number;
        minReturnDays?: number;
        currency?: string;
        requiredSpecs?: ProcurementMandate["requiredSpecs"];
        requiredCondition?: ProcurementMandate["requiredCondition"];
      };
      sessionId?: string;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { prompt, currency, clientSessionId, rawMandate, sessionId } = body;

    let mandate: ProcurementMandate;
    let reusedQuotes: VendorQuote[] | undefined;
    let targetSessionId: string | undefined;

    // Check if an existing initialized session should be reused (Priority 2, Req 8 & 9)
    if (sessionId && typeof sessionId === "string") {
      const existingSession = sessionStore.getSession(sessionId);
      if (existingSession && existingSession.quotes && existingSession.quotes.length > 0) {
        if (
          existingSession.status === "PAYPAL_CAPTURED" ||
          existingSession.status === "SETTLED" ||
          existingSession.status === "CANCELLED" ||
          existingSession.status === "DISPUTED" ||
          existingSession.status === "CAPTURE_PENDING_RECONCILIATION"
        ) {
          return new Response(
            JSON.stringify({
              error: `Session ${sessionId} has already reached terminal or locked status (${existingSession.status}) and cannot re-enter negotiation.`,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        if (
          existingSession.agreementRecord &&
          (existingSession.status === "AUDIT_PASSED" ||
            existingSession.status === "PAYPAL_AUTHORIZED" ||
            existingSession.status === "AWAITING_PAYPAL_APPROVAL")
        ) {
          return new Response(
            JSON.stringify({
              error: `Session ${sessionId} already has an active finalized agreement. Revise the mandate to restart negotiation.`,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
        mandate = existingSession.mandate;
        reusedQuotes = existingSession.quotes;
        targetSessionId = existingSession.id;
      }
    }

    if (!mandate!) {
      if (rawMandate && typeof rawMandate === "object") {
        // Explicit structured mandate validation (Priority 2, Req 1-7)
        if (!rawMandate.itemQuery || typeof rawMandate.itemQuery !== "string" || !rawMandate.itemQuery.trim()) {
          return new Response(
            JSON.stringify({ error: "Mandate requires a non-empty item query." }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }

        const qty = Number(rawMandate.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          return new Response(
            JSON.stringify({ error: "Quantity must be a positive integer." }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }

        const bgt = Number(rawMandate.maxTotalBudget);
        if (!Number.isFinite(bgt) || bgt <= 0) {
          return new Response(
            JSON.stringify({ error: "Maximum budget must be a positive number." }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }

        const del = Number(rawMandate.maxDeliveryDays ?? 5);
        if (!Number.isInteger(del) || del <= 0) {
          return new Response(
            JSON.stringify({ error: "Max delivery days must be at least 1." }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }

        const ret = Number(rawMandate.minReturnDays ?? 30);
        if (!Number.isInteger(ret) || ret < 0) {
          return new Response(
            JSON.stringify({ error: "Min return days must be non-negative." }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }

        mandate = {
          id: `mandate_${crypto.randomBytes(6).toString("hex")}`,
          rawPrompt: prompt?.trim() || `Purchase ${qty} ${rawMandate.itemQuery.trim()} under a $${bgt} total budget.`,
          itemQuery: rawMandate.itemQuery.trim(),
          quantity: qty,
          maxTotalBudget: bgt,
          maxDeliveryDays: del,
          minReturnDays: ret,
          requiredSpecs: rawMandate.requiredSpecs || [],
          currency: currency || rawMandate.currency || "USD",
          createdAt: new Date().toISOString(),
          version: 1,
          isLocked: false,
        };
      } else {
        // Fallback to deterministic prompt parser
        if (!prompt || typeof prompt !== "string") {
          return new Response(
            JSON.stringify({ error: "Field 'prompt' is required and must be a string." }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

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
        mandate = parseResult.mandate;
      }
    }

    // Concurrency / Duplicate check
    const runKey = clientSessionId ?? targetSessionId ?? mandate.id;
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
          let quotes: VendorQuote[];
          let isFixture = true;
          let dataSource = "CHANNEL3";

          if (reusedQuotes && reusedQuotes.length > 0) {
            quotes = reusedQuotes;
            dataSource = "SESSION_REUSE";
          } else {
            // Source wholesale vendor quotes via Channel3
            const sourcingClient = new Channel3Client();
            const sourcingResult = await sourcingClient.sourceQuotes(mandate);
            quotes = sourcingResult.quotes;
            isFixture = sourcingResult.isFixture;
            dataSource = sourcingResult.dataSource;
          }

          // Revalidate vendor quotes against mandate using SourcingEvaluator
          const evaluator = new SourcingEvaluator();
          const evaluationResult = await evaluator.evaluateSourcedQuotes(mandate, quotes);

          // Ensure session is persisted with sourcing evaluation in authoritative store
          let currentSessionId = targetSessionId;
          if (!currentSessionId) {
            const newSession = sessionStore.createSession(mandate, quotes);
            newSession.status = "SOURCING";
            newSession.quoteEvaluations = evaluationResult.evaluations;
            newSession.sourcingSummary = evaluationResult.summary;
            sessionStore.saveSession(newSession);
            currentSessionId = newSession.id;
          } else {
            const existing = sessionStore.getSession(currentSessionId);
            if (existing) {
              existing.quoteEvaluations = evaluationResult.evaluations;
              existing.sourcingSummary = evaluationResult.summary;
              sessionStore.saveSession(existing);
            }
          }

          sendEvent("SOURCING_COMPLETED", {
            sessionId: currentSessionId,
            mandate,
            quotes,
            evaluations: evaluationResult.evaluations,
            eligibleQuotes: evaluationResult.eligibleQuotes,
            rankedQuotes: evaluationResult.rankedQuotes,
            hasEligibleQuotes: evaluationResult.hasEligibleQuotes,
            sourcingSummary: evaluationResult.summary,
            isFixture,
            dataSource,
          });

          // Server-side eligibility gate: prevent negotiation if no quotes are eligible
          if (!evaluationResult.hasEligibleQuotes) {
            const ineligibles = evaluationResult.summary.ineligibleCount;
            const reviews = evaluationResult.summary.reviewCount;
            const failureDetail = `Sourcing eligibility gate blocked negotiation: 0 of ${quotes.length} vendor quotes are eligible (${ineligibles} disqualified, ${reviews} require review).`;
            sendEvent("NEGOTIATION_FAILED", {
              sessionId: currentSessionId,
              error: "Sourcing gate failure: No eligible quotes satisfy the mandate.",
              detail: failureDetail,
              evaluations: evaluationResult.evaluations,
              summary: evaluationResult.summary,
            });
            return;
          }

          // Initialize orchestrator with SSE emitter using strictly eligible quotes
          const geminiClient = new GeminiNegotiationClient();
          const orchestrator = new NegotiationOrchestrator({
            geminiClient,
            maxRounds: 4, // 4 rounds for hackathon demonstration
            onEvent: async (ev) => {
              if (req.signal.aborted) return;
              sendEvent(ev.type, ev.payload);
            },
          });

          // Execute negotiation loop with eligible quotes, reusing existing session ID if available
          const orchestrationResult = await orchestrator.runNegotiation(
            mandate,
            evaluationResult.eligibleQuotes,
            currentSessionId,
            evaluationResult.evaluations
          );
          if (orchestrationResult.session) {
            orchestrationResult.session.quoteEvaluations = evaluationResult.evaluations;
            orchestrationResult.session.sourcingSummary = evaluationResult.summary;
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
