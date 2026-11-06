// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import { vi } from "vitest";
import { describe, it, expect, beforeEach } from "vitest";
import { GET as evidenceGET } from "@/app/api/procurement/evidence/route";
import { sessionStore } from "@/lib/session-store";
import { NextRequest } from "next/server";
import { VeriPayMerkleTree } from "@/lib/veripay-merkle";
import type { ProcurementMandate, VendorQuote } from "@/types/pactum";

describe("Evidence Vault Integrity & Hash Authenticity Tests", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it("rejects evidence query without sessionId with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/evidence");
    const res = await evidenceGET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required parameter");
  });

  it("returns 404 for non-existent sessionId without inventing fake data", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/evidence?sessionId=session_non_existent");
    const res = await evidenceGET(req);
    expect(res.status).toBe(404);
  });

  it("returns authentic leaves and auditNodes for an active session with no fake placeholder hashes", async () => {
    const mandate: ProcurementMandate = {
      id: "mandate_test_123",
      rawPrompt: "Purchase 25 4K USB-C monitors under $8,500",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      currency: "USD",
      requiredSpecs: [],
      requiredCondition: "NEW",
      createdAt: "2026-10-21T00:00:00.000Z",
      version: 1,
      isLocked: true,
    };

    const quotes: VendorQuote[] = [
      {
        vendorId: "vendor_apex",
        vendorName: "Apex Global Wholesale",
        sku: "MON-4K-USBC-01",
        productTitle: "Apex 27-inch 4K USB-C Commercial Display",
        initialUnitAsk: 330,
        currentUnitBid: 330,
        shippingCost: 200,
        deliveryDays: 4,
        returnDays: 35,
        condition: "NEW",
        status: "ACTIVE",
        dataSource: "MOCK_CATALOG",
      },
    ];

    const session = sessionStore.createSession(mandate, quotes);
    const req = new NextRequest(`http://localhost:3000/api/procurement/evidence?sessionId=${session.id}`);
    const res = await evidenceGET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessionId).toBe(session.id);
    expect(data.leafCount).toBe(2); // MANDATE_LOCKED and CHANNEL3_CATALOG_SNAPSHOT
    expect(data.leaves.length).toBe(2);
    expect(data.auditNodes.length).toBe(2);

    // Verify leaves are genuine 64-character SHA-256 hex strings
    for (const leaf of data.leaves) {
      expect(leaf).toMatch(/^[0-9a-f]{64}$/);
      // Ensure none of the prohibited mock placeholder hashes exist
      expect(leaf).not.toBe("c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee1234");
      expect(leaf).not.toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
      expect(leaf).not.toBe("7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069");
      expect(leaf).not.toBe("0".repeat(64));
    }

    // Verify reconstructed root matches a fresh independent calculation
    const independentTree = new VeriPayMerkleTree();
    independentTree.addEvent("MANDATE_LOCKED", {
      mandateId: mandate.id,
      quantity: mandate.quantity,
      maxBudget: mandate.maxTotalBudget,
      maxDeliveryDays: mandate.maxDeliveryDays,
      minReturnDays: mandate.minReturnDays,
      currency: mandate.currency,
      timestamp: mandate.createdAt,
    });
    independentTree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", {
      sessionId: session.id,
      quotes: quotes.map((q) => ({
        vendorId: q.vendorId,
        vendorName: q.vendorName,
        sku: q.sku,
        initialUnitAsk: q.initialUnitAsk,
        shippingCost: q.shippingCost,
      })),
      timestamp: session.createdAt,
    });

    expect(data.reconstructedRoot).toBe(independentTree.getRootHash());
  });
});
