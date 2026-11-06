import { requireBusinessAccess } from "@/lib/auth/business-access";
/**
 * PACTUM — Mandate Parse, Intelligence & Sourcing Route
 * Endpoint: POST /api/procurement/init
 * Supports real-time mandate analysis, clarification requests, and authoritative sourcing initialization.
 * Follows GEMINI.md Section 3, 11 and SECURITY.md Section 2, 4.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractProcurementMandate } from "@/lib/mandate-parser";
import { Channel3Client } from "@/lib/channel3-client";
import { SourcingEvaluator } from "@/lib/sourcing-evaluator";
import { sessionStore } from "@/lib/session-store";
import { defaultRateLimiter } from "@/lib/rate-limiter";
import {
  defaultIdempotencyStore,
  ConcurrentOperationInProgressError,
  IdempotencyPayloadMismatchError,
} from "@/lib/idempotency";
import type { ProcurementMandate, CurrencyCode } from "@/types/pactum";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const accessDenied = await requireBusinessAccess(req);
  if (accessDenied) return accessDenied;

  try {
    const body = await req.json().catch(() => ({}));
    const { prompt, currency, rawMandate, analyzeOnly } = body;

    // Rate limiting check: separate policies for analysis vs session creation
    const policy = analyzeOnly ? "MANDATE_ANALYZE" : "SESSION_CREATE";
    const rateLimit = await defaultRateLimiter.check(req, policy);
    if (!rateLimit.allowed) {
      return rateLimit.response!;
    }

    // 1. Analyze-only mode: returns extraction intelligence without creating a session
    if (analyzeOnly) {
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return NextResponse.json(
          {
            success: false,
            status: "INVALID",
            error: "Prompt is empty or missing.",
            missingFields: ["prompt"],
            clarificationQuestions: ["Please enter a procurement prompt."],
          },
          { status: 400 }
        );
      }

      const analysis = await extractProcurementMandate({ prompt, currency });
      return NextResponse.json({
        success: analysis.status === "READY",
        status: analysis.status,
        mandate: analysis.mandate,
        itemQuery: analysis.itemQuery,
        quantity: analysis.quantity,
        maxTotalBudget: analysis.maxTotalBudget,
        unitPriceBudget: analysis.unitPriceBudget,
        currency: analysis.currency,
        maxDeliveryDays: analysis.maxDeliveryDays,
        minReturnDays: analysis.minReturnDays,
        missingFields: analysis.missingFields || [],
        ambiguities: analysis.ambiguities || [],
        contradictions: analysis.contradictions || [],
        clarificationQuestions: analysis.clarificationQuestions || [],
        extractor: analysis.extractor,
        error: analysis.error,
      });
    }

    const idempotencyKey =
      req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key");

    const executeSessionCreation = async (): Promise<{
      status: number;
      body: Record<string, unknown>;
    }> => {
      let mandate: ProcurementMandate;

      // 2. Structured form submission with server-side validation
      if (rawMandate && typeof rawMandate === "object") {
        const errors: string[] = [];
        const itemQuery = typeof rawMandate.itemQuery === "string" ? rawMandate.itemQuery.trim() : "";
        if (!itemQuery) errors.push("itemQuery is required");

        const qty = Number(rawMandate.quantity);
        if (!Number.isInteger(qty) || qty <= 0) errors.push("quantity must be an integer >= 1");

        const bgt = Number(rawMandate.maxTotalBudget);
        if (!Number.isFinite(bgt) || bgt <= 0) errors.push("maxTotalBudget must be a positive number");

        const d = Number(rawMandate.maxDeliveryDays ?? 5);
        if (!Number.isInteger(d) || d < 1) errors.push("maxDeliveryDays must be an integer >= 1");

        const r = Number(rawMandate.minReturnDays ?? 30);
        if (!Number.isInteger(r) || r < 0) errors.push("minReturnDays must be an integer >= 0");

        const curr = (rawMandate.currency || currency || "USD").toUpperCase();
        if (curr !== "USD" && curr !== "EUR" && curr !== "GBP" && curr !== "INR") {
          errors.push(`Unsupported currency '${curr}'. Must be USD, INR, EUR, or GBP.`);
        }

        if (errors.length > 0) {
          return {
            status: 422,
            body: {
              success: false,
              status: "INVALID",
              error: `Mandate validation failed: ${errors.join("; ")}`,
              missingFields: errors,
            },
          };
        }

        mandate = {
          id: `mandate_${Date.now()}`,
          rawPrompt: prompt || `Procure ${qty} ${itemQuery} under ${curr} ${bgt}`,
          itemQuery,
          quantity: qty,
          maxTotalBudget: bgt,
          maxDeliveryDays: d,
          minReturnDays: r,
          currency: curr as CurrencyCode,
          requiredSpecs: rawMandate.requiredSpecs || [],
          requiredCondition: rawMandate.requiredCondition || "NEW",
          createdAt: new Date().toISOString(),
          version: 1,
          isLocked: false,
        };
      } else {
        // 3. Natural-language prompt submission via Mandate Intelligence
        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
          return {
            status: 400,
            body: {
              success: false,
              status: "INVALID",
              error: "Field 'prompt' is required and cannot be empty.",
            },
          };
        }

        const parseResult = await extractProcurementMandate({ prompt, currency });
        if (parseResult.status !== "READY" || !parseResult.mandate) {
          return {
            status: 422,
            body: {
              success: false,
              status: parseResult.status,
              error: parseResult.error ?? "Mandate requires resolution or clarification before sourcing.",
              missingFields: parseResult.missingFields || [],
              ambiguities: parseResult.ambiguities || [],
              contradictions: parseResult.contradictions || [],
              clarificationQuestions: parseResult.clarificationQuestions || [],
              extractor: parseResult.extractor,
            },
          };
        }
        mandate = parseResult.mandate;
      }

      // 4. Source wholesale vendor quotes via Channel3
      const sourcingClient = new Channel3Client();
      const sourcingResult = await sourcingClient.sourceQuotes(mandate);

      // 5. Evaluate vendor quotes deterministically and assess product compatibility
      const evaluator = new SourcingEvaluator();
      const evaluationResult = await evaluator.evaluateSourcedQuotes(mandate, sourcingResult.quotes);

      // 6. Create authoritative session in server store only after successful mandate validation
      const session = sessionStore.createSession(mandate, sourcingResult.quotes);
      session.status = "SOURCING";
      session.quoteEvaluations = evaluationResult.evaluations;
      session.sourcingSummary = evaluationResult.summary;
      sessionStore.saveSession(session);

      return {
        status: 200,
        body: {
          success: true,
          status: "READY",
          sessionId: session.id,
          mandate,
          quotes: sourcingResult.quotes,
          evaluations: evaluationResult.evaluations,
          rankedQuotes: evaluationResult.rankedQuotes,
          eligibleQuotes: evaluationResult.eligibleQuotes,
          hasEligibleQuotes: evaluationResult.hasEligibleQuotes,
          negotiationCandidates: evaluationResult.negotiationCandidates,
          hasNegotiationCandidates: evaluationResult.hasNegotiationCandidates,
          sourcingSummary: evaluationResult.summary,
          isFixture: sourcingResult.isFixture,
          dataSource: sourcingResult.dataSource,
        },
      };
    };

    if (idempotencyKey) {
      try {
        const { status, body: resBody, isReplay } = await defaultIdempotencyStore.executeIdempotent({
          scope: "SESSION_CREATE",
          key: idempotencyKey,
          payload: body,
          execute: executeSessionCreation,
        });

        return new NextResponse(JSON.stringify(resBody), {
          status,
          headers: {
            "Content-Type": "application/json",
            "X-Idempotent-Replay": isReplay ? "true" : "false",
          },
        });
      } catch (err) {
        if (err instanceof ConcurrentOperationInProgressError) {
          return NextResponse.json(
            { error: err.message, code: "CONCURRENT_OPERATION_IN_PROGRESS" },
            { status: 409 }
          );
        }
        if (err instanceof IdempotencyPayloadMismatchError) {
          return NextResponse.json(
            { error: err.message, code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" },
            { status: 422 }
          );
        }
        throw err;
      }
    }

    const { status, body: resBody } = await executeSessionCreation();
    return NextResponse.json(resBody, { status });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "Internal error initializing procurement.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
