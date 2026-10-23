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

  it("fails Invariant 1 when agreementRecord is from an older mandate revision", () => {
    const staleAgreementSession: ProcurementSession = {
      ...validSession,
      mandate: {
        ...validSession.mandate,
        version: 2, // Current mandate is version 2
      },
      agreementRecord: {
        agreementId: "agree-stale",
        sessionId: validSession.id,
        vendorId: "vendor-apex",
        vendorName: "Apex Displays Wholesale",
        sku: "APX-4K-27-USBC",
        agreedPrice: 320,
        agreedOffer: validSession.finalOffer!,
        totalCost: 320 * 25 + 150,
        agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
        acceptingParty: "VENDOR",
        acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
        round: 4,
        acceptedAt: new Date().toISOString(),
        mandateVersion: 1, // Stale agreement from version 1!
      },
    };

    const cert = auditor.audit({ session: staleAgreementSession });
    expect(cert.passed).toBe(false);
    const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
    expect(inv1.passed).toBe(false);
    expect(inv1.reason).toContain("Stale agreement rejected");
  });

  it("fails Invariant 1 when agreementRecord vendor does not match selectedQuote", () => {
    const mismatchedVendorSession: ProcurementSession = {
      ...validSession,
      agreementRecord: {
        agreementId: "agree-wrong-vendor",
        sessionId: validSession.id,
        vendorId: "vendor-other", // Mismatched vendor!
        vendorName: "Other Vendor",
        sku: "OTHER-SKU",
        agreedPrice: 320,
        agreedOffer: validSession.finalOffer!,
        totalCost: 320 * 25 + 150,
        agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
        acceptingParty: "VENDOR",
        acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
        round: 4,
        acceptedAt: new Date().toISOString(),
        mandateVersion: 1,
      },
    };

    const cert = auditor.audit({ session: mismatchedVendorSession });
    expect(cert.passed).toBe(false);
    const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
    expect(inv1.passed).toBe(false);
    expect(inv1.reason).toContain("Agreement vendor mismatch");
  });

  it("fails Invariant 5 when session flightRecord fails cryptographic integrity", () => {
    const tamperedSession: ProcurementSession = {
      ...validSession,
      flightRecord: {
        sessionId: validSession.id,
        schemaVersion: 1,
        rootHash: validSession.merkleRoot!,
        lastSequenceNumber: 1,
        lastEventHash: "0".repeat(64),
        events: [
          {
            eventId: "evt_1",
            sessionId: validSession.id,
            eventType: "MANDATE_CREATED",
            schemaVersion: 1,
            sequenceNumber: 0,
            timestamp: new Date().toISOString(),
            mandateVersion: 1,
            previousEventHash: "0".repeat(64),
            payloadHash: "bad-hash", // Tampered!
            leafHash: "bad-leaf",
            publicPayload: { test: "data" },
          },
        ],
        auditNodes: [],
        exportedAt: new Date().toISOString(),
      },
    };

    const cert = auditor.audit({ session: tamperedSession });
    expect(cert.passed).toBe(false);
    const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
    expect(inv5.passed).toBe(false);
    expect(inv5.reason).toContain("Cryptographic flight recorder integrity failed");
  });

  it("fails Invariant 3 when merchant attestation is missing for Channel3 sourced quote", () => {
    const missingAttestationSession: ProcurementSession = {
      ...validSession,
      selectedQuote: {
        ...validSession.selectedQuote!,
        dataSource: "CHANNEL3",
      },
      merchantAttestation: undefined, // Missing attestation!
    };

    const cert = auditor.audit({ session: missingAttestationSession });
    expect(cert.passed).toBe(false);
    const inv3 = cert.invariants.find((i) => i.name === "RETURN_POLICY")!;
    expect(inv3.passed).toBe(false);
    expect(inv3.reason).toContain("Merchant DOM attestation evidence missing");
  });
});

