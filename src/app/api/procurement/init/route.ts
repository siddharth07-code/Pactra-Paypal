/**
 * PACTUM — Mandate Parse & Sourcing Preview Route
 * Endpoint: POST /api/procurement/init
 * Validates natural language mandate and sources quotes without immediately streaming.
 * Follows GEMINI.md Section 3, 11 and SECURITY.md Section 2, 4.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseProcurementMandate } from "@/lib/mandate-parser";
import { Channel3Client } from "@/lib/channel3-client";
import { sessionStore } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { prompt, currency, rawMandate } = body;

    let mandate;
    if (rawMandate && typeof rawMandate === "object") {
      // Direct structured mandate configuration
      if (!rawMandate.itemQuery || !rawMandate.quantity || !rawMandate.maxTotalBudget) {
        return NextResponse.json({ error: "Mandate missing required fields (itemQuery, quantity, maxTotalBudget)." }, { status: 422 });
      }
      mandate = {
        id: `mandate_${Date.now()}`,
        rawPrompt: prompt || `Procure ${rawMandate.quantity} ${rawMandate.itemQuery}`,
        itemQuery: String(rawMandate.itemQuery),
        quantity: Number(rawMandate.quantity),
        maxTotalBudget: Number(rawMandate.maxTotalBudget),
        maxDeliveryDays: Number(rawMandate.maxDeliveryDays || 5),
        minReturnDays: Number(rawMandate.minReturnDays || 30),
        currency: currency || rawMandate.currency || "USD",
        requiredSpecs: rawMandate.requiredSpecs || [],
        requiredCondition: rawMandate.requiredCondition || "NEW",
        createdAt: new Date().toISOString(),
        version: 1,
        isLocked: false,
      };
    } else {
      if (!prompt || typeof prompt !== "string") {
        return NextResponse.json({ error: "Field 'prompt' is required." }, { status: 400 });
      }

      const parseResult = parseProcurementMandate({ prompt, currency });
      if (!parseResult.success || !parseResult.mandate) {
        return NextResponse.json({
          error: parseResult.error ?? "Failed to parse mandate constraints.",
          missingFields: parseResult.missingFields,
        }, { status: 422 });
      }
      mandate = parseResult.mandate;
    }

    // Source vendor quotes via Channel3
    const sourcingClient = new Channel3Client();
    const sourcingResult = await sourcingClient.sourceQuotes(mandate);

    // Create session in server store
    const session = sessionStore.createSession(mandate, sourcingResult.quotes);
    session.status = "SOURCING";
    sessionStore.saveSession(session);

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      mandate,
      quotes: sourcingResult.quotes,
      isFixture: sourcingResult.isFixture,
      dataSource: sourcingResult.dataSource,
    });
  } catch {
    return NextResponse.json({ error: "Internal error initializing procurement." }, { status: 500 });
  }
}
