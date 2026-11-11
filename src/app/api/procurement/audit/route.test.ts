import { recordCommercialFixture } from "@/test/helpers/commercial-evidence";
// This suite exercises domain behavior; real authentication/RLS boundaries have separate adversarial tests.
vi.mock("@/lib/db/business-route", () => ({ withBusinessRoute: (_permission: unknown, handler: unknown) => handler }));
vi.mock("@/lib/auth/business-access", () => ({ requireBusinessAccess: vi.fn().mockResolvedValue(null) }));
import { vi } from "vitest";
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as auditHandler } from "./route";
import { sessionStore } from "@/lib/session-store";
import type { ProcurementSession } from "@/types/pactum";

describe("POST /api/procurement/audit Route Tests", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  const validSession: ProcurementSession = {
    id: "session_audit_test_123",
    mandate: {
      id: "m_audit_test",
      rawPrompt: "Purchase 25 4K monitors under $8,500",
      itemQuery: "4K Monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
      currency: "USD",
      createdAt: new Date().toISOString(),
    },
    quotes: [],
    turns: [],
    selectedQuote: {
      vendorId: "vendor_alpha",
      vendorName: "Alpha Displays",
      sku: "ALP-4K-27",
      productTitle: "27 4K Monitor",
      initialUnitAsk: 380,
      currentUnitBid: 320,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACCEPTED",
      dataSource: "CHANNEL3",
    },
    finalOffer: {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    },
    status: "AUDIT_PENDING",
    agreementRecord: {
      agreementId: "agreement-audit-test", sessionId: "session_audit_test_123", vendorId: "vendor_alpha", vendorName: "Alpha Displays", sku: "ALP-4K-27", agreedPrice: 320,
      agreedOffer: { unitPrice: 320, quantity: 25, deliveryDays: 4, returnDays: 30, shippingCost: 150 }, totalCost: 8150, currency: "USD", agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER", acceptingParty: "VENDOR", acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER", round: 1, acceptedAt: new Date().toISOString(), mandateVersion: 1,
    },
    preSettlementRoot: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef1234",
    merchantAttestation: {
      merchantUrl: "https://alpha.com",
      returnPolicyText: "30-day return policy",
      timestamp: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("returns 400 when sessionId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await auditHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("sessionId");
  });

  it("returns 404 when session is not in authoritative store", async () => {
    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: "session_d1239bca416243ec" }),
    });

    const res = await auditHandler(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Session session_d1239bca416243ec not found in authoritative store.");
  });

  it("returns 422 when session is missing final offer or quote", async () => {
    const incompleteSession: ProcurementSession = {
      ...validSession,
      finalOffer: undefined,
    };
    sessionStore.saveSession(incompleteSession);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: incompleteSession.id }),
    });

    const res = await auditHandler(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("no final agreed offer");
  });

  it("evaluates all 5 invariants and returns audit certificate with AUDIT_PASSED", async () => {
    recordCommercialFixture(validSession);
    sessionStore.saveSession(validSession);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: validSession.id }),
    });

    const res = await auditHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.status).toBe("AUDIT_PASSED");
    expect(data.auditCertificate).toBeDefined();
    expect(data.auditCertificate.passed).toBe(true);
    expect(data.auditCertificate.invariants).toHaveLength(5);
    expect(data.auditCertificate.invariants.every((inv: { passed: boolean }) => inv.passed)).toBe(true);

    // Verify session store was updated with certificate
    const stored = sessionStore.getSession(validSession.id)!;
    expect(stored.auditCertificate).toBeDefined();
    expect(stored.status).toBe("AUDIT_PASSED");
  });

  it("evaluates invariants and returns AUDIT_FAILED when invariant is violated", async () => {
    const violatedSession: ProcurementSession = {
      ...validSession,
      finalOffer: {
        ...validSession.finalOffer!,
        deliveryDays: 10, // violates maxDeliveryDays: 5
      },
    };
    recordCommercialFixture(violatedSession);
    sessionStore.saveSession(violatedSession);

    const req = new NextRequest("http://localhost:3000/api/procurement/audit", {
      method: "POST",
      body: JSON.stringify({ sessionId: violatedSession.id }),
    });

    const res = await auditHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.status).toBe("AUDIT_FAILED");
    expect(data.auditCertificate.passed).toBe(false);

    const deliveryInvariant = data.auditCertificate.invariants.find(
      (inv: { name: string }) => inv.name === "DELIVERY_SLA"
    );
    expect(deliveryInvariant?.passed).toBe(false);
    expect(deliveryInvariant?.reason).toContain("Delivery SLA violated");

    const stored = sessionStore.getSession(violatedSession.id)!;
    expect(stored.status).toBe("AUDIT_FAILED");
  });
});
