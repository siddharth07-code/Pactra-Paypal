/**
 * PACTUM — Merkle Evidence Inspection Route
 * Endpoint: GET /api/procurement/evidence
 * Reconstructs or inspects the authoritative Merkle tree & Flight Recorder for a session.
 * Follows GEMINI.md Section 7, 11, SECURITY.md Section 3, 5, 9, and Phase 5 specifications.
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { defaultRateLimiter } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rateLimit = await defaultRateLimiter.check(req, "EVIDENCE_READ");
  if (!rateLimit.allowed) {
    return rateLimit.response!;
  }

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const eventIndexStr = searchParams.get("eventIndex");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing required parameter 'sessionId'." }, { status: 400 });
    }

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: `Session ${sessionId} not found.` }, { status: 404 });
    }

    let rootHash: string;
    let levels: string[][];
    let leaves: string[];
    let auditNodes;
    let events: unknown[] = [];
    let integrity = { valid: true, rootHash: "" };
    let inclusionProof;

    if (session.flightRecord) {
      const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
      integrity = recorder.verifyIntegrity();
      rootHash = recorder.getRootHash();
      levels = recorder.getTreeLevels();
      leaves = levels[0] ?? [];
      auditNodes = recorder.getAuditNodes();
      events = recorder.getEvents();

      if (eventIndexStr !== null && eventIndexStr !== undefined) {
        const idx = parseInt(eventIndexStr, 10);
        if (Number.isInteger(idx) && idx >= 0 && idx < leaves.length) {
          inclusionProof = recorder.generateInclusionProof(idx);
        }
      }
    } else {
      const { VeriPayMerkleTree } = await import("@/lib/veripay-merkle");
      const tree = new VeriPayMerkleTree();

      tree.addEvent("MANDATE_LOCKED", {
        mandateId: session.mandate.id,
        quantity: session.mandate.quantity,
        maxBudget: session.mandate.maxTotalBudget,
        maxDeliveryDays: session.mandate.maxDeliveryDays,
        minReturnDays: session.mandate.minReturnDays,
        currency: session.mandate.currency,
        timestamp: session.mandate.createdAt,
      });

      if (session.quotes && session.quotes.length > 0) {
        tree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", {
          sessionId: session.id,
          quotes: session.quotes.map((q) => ({
            vendorId: q.vendorId,
            vendorName: q.vendorName,
            sku: q.sku,
            initialUnitAsk: q.initialUnitAsk,
            shippingCost: q.shippingCost,
          })),
          timestamp: session.createdAt,
        });
      }

      if (session.merchantAttestation) {
        tree.addEvent("KERNEL_DOM_ATTESTATION", {
          sessionId: session.id,
          merchantUrl: session.merchantAttestation.merchantUrl,
          domSnapshotHash: session.merchantAttestation.domSnapshotHash,
          returnPolicyText: session.merchantAttestation.returnPolicyText,
          timestamp: session.merchantAttestation.timestamp,
        });
      }

      const rounds = Array.from(new Set(session.turns.map((t) => t.round))).sort((a, b) => a - b);
      for (const round of rounds) {
        tree.addEvent("VERIFIED_NEGOTIATION_ROUND", {
          sessionId: session.id,
          round,
          turnsInRound: session.turns.filter((t) => t.round === round),
          timestamp: session.updatedAt,
        });
      }

      if (session.auditCertificate) {
        tree.addEvent("ACWORLD_FINAL_STATE_AUDIT", {
          sessionId: session.id,
          certificateId: session.auditCertificate.certificateId,
          passed: session.auditCertificate.passed,
          verifiedRoot: session.auditCertificate.verifiedRoot,
          timestamp: session.auditCertificate.timestamp,
        });
      }

      if (session.paypalCaptureId) {
        tree.addEvent("SETTLEMENT_CAPTURED", {
          sessionId: session.id,
          paypalOrderId: session.paypalOrderId,
          paypalCaptureId: session.paypalCaptureId,
          amount: session.captureAmount,
          currency: session.mandate.currency,
          timestamp: session.updatedAt,
        });
      }

      levels = tree.getTreeLevels();
      leaves = levels[0] ?? [];
      rootHash = tree.getRootHash();
      auditNodes = tree.getAuditNodes();
      integrity = { valid: true, rootHash };

      if (eventIndexStr !== null && eventIndexStr !== undefined) {
        const idx = parseInt(eventIndexStr, 10);
        if (Number.isInteger(idx) && idx >= 0 && idx < leaves.length) {
          inclusionProof = tree.generateInclusionProof(idx);
        }
      }
    }

    return NextResponse.json({
      sessionId: session.id,
      reconstructedRoot: rootHash,
      storedPreSettlementRoot: session.preSettlementRoot ?? session.merkleRoot,
      storedPostAuditRoot: session.postAuditRoot,
      leafCount: leaves.length,
      levels,
      leaves,
      auditNodes,
      events,
      integrity,
      inclusionProof,
      isPreSettlementRootMatching: !session.preSettlementRoot || rootHash === session.preSettlementRoot,
      isPostAuditRootMatching: !!session.postAuditRoot && rootHash === session.postAuditRoot,
      isRootMatching:
        !session.preSettlementRoot ||
        rootHash === session.preSettlementRoot ||
        (!!session.postAuditRoot && rootHash === session.postAuditRoot),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to inspect Merkle evidence: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
