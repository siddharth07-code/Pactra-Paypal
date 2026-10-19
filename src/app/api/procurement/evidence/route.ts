/**
 * PACTUM — Merkle Evidence Inspection Route
 * Endpoint: GET /api/procurement/evidence
 * Reconstructs or inspects the authoritative Merkle tree for a session.
 * Follows GEMINI.md Section 7, 11 and SECURITY.md Section 3, 5.
 */

import { NextRequest, NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { VeriPayMerkleTree } from "@/lib/veripay-merkle";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing required parameter 'sessionId'." }, { status: 400 });
    }

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: `Session ${sessionId} not found.` }, { status: 404 });
    }

    // Reconstruct Merkle evidence tree from authoritative session events
    const tree = new VeriPayMerkleTree();

    // 1. MANDATE_LOCKED
    tree.addEvent("MANDATE_LOCKED", {
      mandateId: session.mandate.id,
      quantity: session.mandate.quantity,
      maxBudget: session.mandate.maxTotalBudget,
      maxDeliveryDays: session.mandate.maxDeliveryDays,
      minReturnDays: session.mandate.minReturnDays,
      currency: session.mandate.currency,
      timestamp: session.mandate.createdAt,
    });

    // 2. CHANNEL3_CATALOG_SNAPSHOT
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

    // 3. KERNEL_DOM_ATTESTATION (if present)
    if (session.merchantAttestation) {
      tree.addEvent("KERNEL_DOM_ATTESTATION", {
        sessionId: session.id,
        merchantUrl: session.merchantAttestation.merchantUrl,
        domSnapshotHash: session.merchantAttestation.domSnapshotHash,
        returnPolicyText: session.merchantAttestation.returnPolicyText,
        timestamp: session.merchantAttestation.timestamp,
      });
    }

    // 4. VERIFIED_NEGOTIATION_ROUND events
    const rounds = Array.from(new Set(session.turns.map((t) => t.round))).sort((a, b) => a - b);
    for (const round of rounds) {
      tree.addEvent("VERIFIED_NEGOTIATION_ROUND", {
        sessionId: session.id,
        round,
        turnsInRound: session.turns.filter((t) => t.round === round),
        timestamp: session.updatedAt,
      });
    }

    // 5. Post-audit events if recorded
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

    const leaves = tree.getTreeLevels()[0] ?? [];
    const rootHash = tree.getRootHash();

    return NextResponse.json({
      sessionId: session.id,
      reconstructedRoot: rootHash,
      storedPreSettlementRoot: session.preSettlementRoot ?? session.merkleRoot,
      storedPostAuditRoot: session.postAuditRoot,
      leafCount: leaves.length,
      levels: tree.getTreeLevels(),
      leaves,
      isRootMatching: !session.preSettlementRoot || rootHash === session.preSettlementRoot,
    });
  } catch {
    return NextResponse.json({ error: "Failed to inspect Merkle evidence." }, { status: 500 });
  }
}
