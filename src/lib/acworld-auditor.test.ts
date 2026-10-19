import { describe, it, expect } from "vitest";
import { AcworldAuditor } from "./acworld-auditor";
import type { ProcurementSession } from "../types/pactum";

describe("ACWORLD Final-State Auditor Unit Tests", () => {
  const auditor = new AcworldAuditor();

  const validSession: ProcurementSession = {
    id: "session-audit-1",
    mandate: {
      id: "mandate-audit-1",
      rawPrompt: "Purchase 25 4K USB-C monitors under $8,500 total budget",
      itemQuery: "4K USB-C monitors",
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
      vendorId: "vendor-apex",
      vendorName: "Apex Displays Wholesale",
      sku: "APX-4K-27-USBC",
      productTitle: "27 4K IPS USB-C Monitor",
      initialUnitAsk: 375,
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
    preSettlementRoot: "c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee1234",
    merchantAttestation: {
      merchantUrl: "https://apexwholesale.com/return-policy",
      returnPolicyText: "30-day hassle-free commercial return guarantee.",
      timestamp: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("passes audit when all 5 invariants are satisfied", () => {
    const cert = auditor.audit({
      session: validSession,
      expectedOrderCustomId: `VERIPAY_ROOT:${validSession.preSettlementRoot};SESSION:${validSession.id}`,
    });

    expect(cert.passed).toBe(true);
    expect(cert.invariants.length).toBe(5);
    expect(cert.invariants.every((i) => i.passed)).toBe(true);
  });

  it("fails Invariant 1 on product condition mismatch", () => {
    const sessionWithConditionMismatch: ProcurementSession = {
      ...validSession,
      mandate: {
        ...validSession.mandate,
        requiredCondition: "NEW",
      },
      selectedQuote: {
        ...validSession.selectedQuote!,
        condition: "REFURBISHED",
      },
    };

    const cert = auditor.audit({ session: sessionWithConditionMismatch });
    expect(cert.passed).toBe(false);
    const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
    expect(inv1.passed).toBe(false);
    expect(inv1.reason).toContain("Condition mismatch");
  });

  it("fails Invariant 2 when landed price exceeds dynamic mandate budget", () => {
    // 25 * 350 + 150 = 8900 > 8500
    const overBudgetSession: ProcurementSession = {
      ...validSession,
      finalOffer: {
        ...validSession.finalOffer!,
        unitPrice: 350,
      },
    };

    const cert = auditor.audit({ session: overBudgetSession });
    expect(cert.passed).toBe(false);
    const inv2 = cert.invariants.find((i) => i.name === "PRICE_CEILING")!;
    expect(inv2.passed).toBe(false);
    expect(inv2.reason).toContain("Price ceiling violated");
  });

  it("fails Invariant 3 when return days are less than mandate minimum", () => {
    const poorReturnSession: ProcurementSession = {
      ...validSession,
      finalOffer: {
        ...validSession.finalOffer!,
        returnDays: 14, // mandate requires 30
      },
    };

    const cert = auditor.audit({ session: poorReturnSession });
    expect(cert.passed).toBe(false);
    const inv3 = cert.invariants.find((i) => i.name === "RETURN_POLICY")!;
    expect(inv3.passed).toBe(false);
    expect(inv3.reason).toContain("Return policy SLA violated");
  });

  it("fails Invariant 4 when delivery SLA is violated", () => {
    const slowDeliverySession: ProcurementSession = {
      ...validSession,
      finalOffer: {
        ...validSession.finalOffer!,
        deliveryDays: 7, // mandate requires 5
      },
    };

    const cert = auditor.audit({ session: slowDeliverySession });
    expect(cert.passed).toBe(false);
    const inv4 = cert.invariants.find((i) => i.name === "DELIVERY_SLA")!;
    expect(inv4.passed).toBe(false);
    expect(inv4.reason).toContain("Delivery SLA violated");
  });

  it("fails Invariant 5 when PayPal order custom_id does not match Merkle root", () => {
    const cert = auditor.audit({
      session: validSession,
      expectedOrderCustomId: `VERIPAY_ROOT:${"f".repeat(64)};SESSION:${validSession.id}`,
    });

    expect(cert.passed).toBe(false);
    const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
    expect(inv5.passed).toBe(false);
    expect(inv5.reason).toContain("Cryptographic lineage mismatch");
  });
});
