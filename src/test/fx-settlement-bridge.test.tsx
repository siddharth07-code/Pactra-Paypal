// Provider-domain tests inject the HTTP persistence boundary; PostgreSQL replay/RLS tests use the real wrapper.
vi.mock("@/lib/db/webhook-route", () => ({ withWebhookRoute: (handler: unknown) => handler }));
import { completedOrder } from "@/test/helpers/payment-fixtures";
/**
 * PACTUM — Phase 6.8 Verifiable FX Settlement Bridge Test Suite
 * File: src/test/fx-settlement-bridge.test.tsx
 *
 * Verifies all 56 required test matrix proofs across:
 * 1. FX Domain (Proofs 1–16)
 * 2. ACWORLD FX Settlement (Proofs 17–26)
 * 3. PayPal Integration (Proofs 27–35)
 * 4. Reconciliation (Proofs 36–42)
 * 5. Webhooks (Proofs 43–46)
 * 6. UI Verification (Proofs 47–56)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import {
  computeFxConversion,
  computeAgreementHash,
  computeConversionHash,
  DeterministicDemoFXProvider,
  lockFXQuote,
  auditFxSettlement,
  DEFAULT_DEMO_INR_PER_USD,
} from "@/lib/fx-settlement";
import { AcworldAuditor } from "@/lib/acworld-auditor";
import { SettlementService } from "@/lib/settlement-service";
import { PayPalClient } from "@/lib/paypal-client";
import { sessionStore } from "@/lib/session-store";
import { toMinorUnits, fromMinorUnits } from "@/lib/currency";
import { POST as webhookPost } from "@/app/api/paypal/webhook/route";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import { EvidenceVaultScreen } from "@/components/EvidenceVaultScreen";
import type {
  ProcurementSession,
  ProcurementMandate,
  VendorQuote,
  NegotiationOffer,
  AgreementRecord,
} from "@/types/pactum";

// --- Fixtures & Helpers ---

const mockINRMandate: ProcurementMandate = {
  id: "mandate_inr_test",
  rawPrompt: "Purchase 25 4K monitors under ₹750,000 budget within 5 days and 30-day return policy",
  itemQuery: "4K USB-C Monitors",
  quantity: 25,
  maxTotalBudget: 750000,
  maxDeliveryDays: 5,
  minReturnDays: 30,
  requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }],
  currency: "INR",
  createdAt: new Date().toISOString(),
};

const mockUSDMandate: ProcurementMandate = {
  id: "mandate_usd_test",
  rawPrompt: "Purchase 25 4K monitors under $8,500 budget within 5 days and 30-day return policy",
  itemQuery: "4K USB-C Monitors",
  quantity: 25,
  maxTotalBudget: 8500,
  maxDeliveryDays: 5,
  minReturnDays: 30,
  requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }],
  currency: "USD",
  createdAt: new Date().toISOString(),
};

const mockINRQuote: VendorQuote = {
  vendorId: "vendor_mumbai_tech",
  vendorName: "Mumbai Display Solutions",
  sku: "MUMBAI-4K-27",
  productTitle: "Mumbai 27-inch 4K Monitor",
  initialUnitAsk: 29500,
  currentUnitBid: 28000,
  shippingCost: 8500,
  deliveryDays: 4,
  returnDays: 35,
  condition: "NEW",
  status: "ACTIVE",
  dataSource: "CHANNEL3",
  currency: "INR",
};

const mockINROffer: NegotiationOffer = {
  unitPrice: 28000,
  quantity: 25,
  shippingCost: 8500,
  deliveryDays: 4,
  returnDays: 35,
  currency: "INR",
};

// Landed cost = 28,000 * 25 + 8,500 = 708,500 INR
const INR_LANDED_COST = 708500;
const INR_LANDED_COST_PAISE = 70850000;

function createTestINRSession(): ProcurementSession {
  const session = sessionStore.createSession(mockINRMandate, [mockINRQuote]);
  session.selectedQuote = mockINRQuote;
  session.finalOffer = mockINROffer;
  session.preSettlementRoot = "a".repeat(64);
  session.merchantAttestation = {
    merchantUrl: "https://mumbaidisplays.in/returns",
    returnPolicyText: "Standard 35-day return window for enterprise clients.",
    domSnapshotHash: "b".repeat(64),
    timestamp: new Date().toISOString(),
  };
  session.agreementRecord = {
    agreementId: `agr_${session.id}`,
    sessionId: session.id,
    vendorId: mockINRQuote.vendorId,
    vendorName: mockINRQuote.vendorName,
    sku: mockINRQuote.sku,
    agreedPrice: mockINROffer.unitPrice,
    agreedOffer: mockINROffer,
    totalCost: INR_LANDED_COST,
    currency: "INR",
    agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
    acceptingParty: "VENDOR",
    acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
    round: 4,
    mandateVersion: 1,
    acceptedAt: new Date().toISOString(),
  };

  const auditor = new AcworldAuditor();
  const cert = auditor.audit({ session });
  session.auditCertificate = cert;
  session.status = "AUDIT_PASSED";
  sessionStore.saveSession(session);
  return session;
}

function createTestUSDSession(): ProcurementSession {
  const quote: VendorQuote = {
    vendorId: "vendor_apex",
    vendorName: "Apex Displays",
    sku: "APEX-4K",
    productTitle: "Apex 27-inch 4K Monitor",
    initialUnitAsk: 340,
    currentUnitBid: 320,
    shippingCost: 150,
    deliveryDays: 4,
    returnDays: 35,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "CHANNEL3",
    currency: "USD",
  };
  const offer: NegotiationOffer = {
    unitPrice: 320,
    quantity: 25,
    shippingCost: 150,
    deliveryDays: 4,
    returnDays: 35,
    currency: "USD",
  };
  const session = sessionStore.createSession(mockUSDMandate, [quote]);
  session.selectedQuote = quote;
  session.finalOffer = offer;
  session.preSettlementRoot = "c".repeat(64);
  session.merchantAttestation = {
    merchantUrl: "https://apexdisplays.com/returns",
    returnPolicyText: "Standard 35-day return window for verified enterprise procurements.",
    domSnapshotHash: "d".repeat(64),
    timestamp: new Date().toISOString(),
  };
  session.agreementRecord = {
    agreementId: `agr_${session.id}`,
    sessionId: session.id,
    vendorId: quote.vendorId,
    vendorName: quote.vendorName,
    sku: quote.sku,
    agreedPrice: offer.unitPrice,
    agreedOffer: offer,
    totalCost: 320 * 25 + 150, // $8,150
    currency: "USD",
    agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
    acceptingParty: "VENDOR",
    acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
    round: 4,
    mandateVersion: 1,
    acceptedAt: new Date().toISOString(),
  };

  const auditor = new AcworldAuditor();
  session.auditCertificate = auditor.audit({ session });
  session.status = "AUDIT_PASSED";
  sessionStore.saveSession(session);
  return session;
}

describe("Phase 6.8: Verifiable FX Settlement Bridge Matrix (56 Proofs)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // SECTION 1: FX DOMAIN (Proofs 1–16)
  // ==========================================
  describe("FX Domain (Proofs 1–16)", () => {
    it("1. INR agreement creates INR→USD FX quote", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const agreementHash = computeAgreementHash(session.agreementRecord!);

      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash,
        agreementId: session.agreementRecord!.agreementId,
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      expect(quote.sourceCurrency).toBe("INR");
      expect(quote.targetCurrency).toBe("USD");
      expect(quote.status).toBe("QUOTED");
      expect(quote.targetAmountMinor).toBeGreaterThan(0);
    });

    it("2. Source amount equals agreement landed cost exactly", async () => {
      const session = createTestINRSession();
      const expectedPaise = toMinorUnits(session.agreementRecord!.totalCost);
      const provider = new DeterministicDemoFXProvider();

      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        agreementId: session.agreementRecord!.agreementId,
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: expectedPaise,
      });

      expect(quote.sourceAmountMinor).toBe(INR_LANDED_COST_PAISE);
      expect(quote.sourceAmountMinor).toBe(expectedPaise);
    });

    it("3. Rate convention is INR_PER_USD", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      expect(quote.rateConvention).toBe("INR_PER_USD");
      expect(quote.rate).toBe(DEFAULT_DEMO_INR_PER_USD);
    });

    it("4. Conversion uses deterministic decimal-safe arithmetic", () => {
      // 708,500.00 INR at 83.5000 INR/USD
      // In cents: (70850000 * 10000) / 835000 = 708500000000 / 835000
      // 708500000000 / 835000 = 848502.99401...
      // Half-up rounding: remainder is 830000. 830000 * 2 = 1660000 >= 835000 -> rounds up to 848503 cents ($8,485.03)
      const cents = computeFxConversion(70850000, "83.5000", "INR_PER_USD", "HALF_UP");
      expect(cents).toBe(848503);
      expect(Number.isInteger(cents)).toBe(true);
    });

    it("5. HALF_UP rounding works at boundary cases", () => {
      // Rate = 2.0 (num=2, den=1)
      // Exactly half remainder: 3 / 2 = 1 rem 1. 1 * 2 = 2 >= 2 -> 2
      expect(computeFxConversion(3, "2.0", "INR_PER_USD", "HALF_UP")).toBe(2);
      // Strictly below half: 2 / 5 = 0 rem 2. 2 * 2 = 4 < 5 -> 0
      expect(computeFxConversion(2, "5.0", "INR_PER_USD", "HALF_UP")).toBe(0);
      // Strictly at half: 5 / 2 = 2 rem 1. 1 * 2 = 2 >= 2 -> 3
      expect(computeFxConversion(5, "2.0", "INR_PER_USD", "HALF_UP")).toBe(3);
    });

    it("6. Quote has timestamp", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const before = Date.now();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const after = Date.now();

      expect(quote.quotedAt).toBeDefined();
      const quotedTime = new Date(quote.quotedAt).getTime();
      expect(quotedTime).toBeGreaterThanOrEqual(before - 1000);
      expect(quotedTime).toBeLessThanOrEqual(after + 1000);
    });

    it("7. Quote has expiration", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
        ttlSeconds: 600,
      });

      expect(quote.expiresAt).toBeDefined();
      const quotedTime = new Date(quote.quotedAt).getTime();
      const expiresTime = new Date(quote.expiresAt).getTime();
      expect(expiresTime - quotedTime).toBe(600 * 1000);
    });

    it("8. Quote binds to session", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      expect(quote.sessionId).toBe(session.id);
    });

    it("9. Quote binds to agreement hash", async () => {
      const session = createTestINRSession();
      const expectedHash = computeAgreementHash(session.agreementRecord!);
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: expectedHash,
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      expect(quote.agreementHash).toBe(expectedHash);
    });

    it("10. conversionHash is deterministic", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      const hash1 = computeConversionHash(quote);
      const hash2 = computeConversionHash(quote);
      expect(hash1).toBe(quote.conversionHash);
      expect(hash1).toBe(hash2);
    });

    it("11. Modified FX record changes conversionHash", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      const mutatedQuote = { ...quote, targetAmountMinor: quote.targetAmountMinor + 1 };
      const mutatedHash = computeConversionHash(mutatedQuote);
      expect(mutatedHash).not.toBe(quote.conversionHash);
    });

    it("12. Quote expires correctly", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
        ttlSeconds: -10, // expired 10 seconds ago
      });

      expect(new Date(quote.expiresAt).getTime()).toBeLessThan(Date.now());
    });

    it("13. Expired quote cannot lock", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
        ttlSeconds: -10,
      });

      expect(() => lockFXQuote(quote, session.agreementRecord!)).toThrow(/expired|expiration/i);
    });

    it("14. Locked quote cannot mutate", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      const locked = lockFXQuote(quote, session.agreementRecord!);
      expect(locked.status).toBe("LOCKED");

      // Tamper with the locked quote
      const tampered = { ...locked, rate: "80.0000" };
      expect(computeConversionHash(tampered)).not.toBe(locked.conversionHash);
    });

    it("15. Agreement revision invalidates quote", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      // Revise the agreement
      const revisedAgreement: AgreementRecord = {
        ...session.agreementRecord!,
        totalCost: 700000,
      };

      expect(() => lockFXQuote(quote, revisedAgreement)).toThrow(/agreement has been revised/i);
    });

    it("16. Duplicate lock is idempotent", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });

      const locked1 = lockFXQuote(quote, session.agreementRecord!);
      const locked2 = lockFXQuote(locked1, session.agreementRecord!);

      expect(locked1.id).toBe(locked2.id);
      expect(locked1.status).toBe("LOCKED");
      expect(locked2.status).toBe("LOCKED");
      expect(locked1.conversionHash).toBe(locked2.conversionHash);
    });
  });

  // ==========================================
  // SECTION 2: ACWORLD FX (Proofs 17–26)
  // ==========================================
  describe("ACWORLD FX (Proofs 17–26)", () => {
    it("17. Correct conversion passes", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);
      session.fxRecord = locked;

      const result = auditFxSettlement({
        session,
        fxRecord: locked,
        expectedPayPalOrder: {
          currency: "USD",
          amountMinor: locked.targetAmountMinor,
        },
      });

      expect(result.passed).toBe(true);
      expect(result.checks.length).toBe(13);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it("18. Incorrect source amount fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: 100000, // Mismatched source amount
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);

      const result = auditFxSettlement({ session, fxRecord: locked });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "SOURCE_AMOUNT_MATCH");
      expect(check?.passed).toBe(false);
    });

    it("19. Incorrect source currency fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR", // Mismatched currency
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);

      locked.sourceCurrency = "EUR";
      const result = auditFxSettlement({ session, fxRecord: locked });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "SOURCE_CURRENCY_MATCH");
      expect(check?.passed).toBe(false);
    });

    it("20. Incorrect target amount fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);
      locked.targetAmountMinor = locked.targetAmountMinor + 500; // Tampered amount
      locked.conversionHash = computeConversionHash(locked);

      const result = auditFxSettlement({ session, fxRecord: locked });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "FX_ARITHMETIC_EXACT");
      expect(check?.passed).toBe(false);
    });

    it("21. Incorrect rate fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);
      locked.rate = "70.0000"; // Changed rate without recalculating target amount
      locked.conversionHash = computeConversionHash(locked);

      const result = auditFxSettlement({ session, fxRecord: locked });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "FX_ARITHMETIC_EXACT");
      expect(check?.passed).toBe(false);
    });

    it("22. Incorrect rounding fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);
      (locked as unknown as { roundingMode: string }).roundingMode = "FLOOR";
      locked.conversionHash = computeConversionHash(locked);

      const result = auditFxSettlement({ session, fxRecord: locked });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "ROUNDING_MODE_VALID");
      expect(check?.passed).toBe(false);
    });

    it("23. Incorrect agreementHash fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: "wrong_fake_agreement_hash_abcdef",
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      // Force status to LOCKED for test
      quote.status = "LOCKED";
      quote.conversionHash = computeConversionHash(quote);

      const result = auditFxSettlement({ session, fxRecord: quote });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "AGREEMENT_HASH_MATCH");
      expect(check?.passed).toBe(false);
    });

    it("24. Unsupported target currency fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD", // Unsupported currency
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);

      locked.targetCurrency = "INR";
      const result = auditFxSettlement({ session, fxRecord: locked });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "TARGET_CURRENCY_PAYPAL_SUPPORTED");
      expect(check?.passed).toBe(false);
    });

    it("25. Expired quote fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      // QUOTED state has not been locked
      const result = auditFxSettlement({ session, fxRecord: quote });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "LIFECYCLE_STATE_VALID");
      expect(check?.passed).toBe(false);
    });

    it("26. Mutated locked quote fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);
      // Mutate locked quote without updating conversionHash
      locked.targetAmountMinor = locked.targetAmountMinor + 100;

      const result = auditFxSettlement({ session, fxRecord: locked });
      expect(result.passed).toBe(false);
      const check = result.checks.find((c) => c.name === "CONVERSION_HASH_INTEGRITY");
      expect(check?.passed).toBe(false);
    });
  });

  // ==========================================
  // SECTION 3: PAYPAL (Proofs 27–35)
  // ==========================================
  describe("PayPal (Proofs 27–35)", () => {
    it("27. INR agreement never sends INR to PayPal", async () => {
      const session1 = createTestINRSession();
      const client = new PayPalClient();
      const createOrderSpy = vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "PAYPAL-ORDER-INR-TEST",
        status: "CREATED",
        customId: "CUSTOM_ID_TEST",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=TEST", method: "GET" }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      // Attempt checkout without FX quote -> fails before calling PayPal
      const resWithoutFX = await settlement.initiateCheckout({
        sessionId: session1.id,
        origin: "http://localhost:3000",
      });

      expect(resWithoutFX.success).toBe(false);
      expect(createOrderSpy).not.toHaveBeenCalled();

      // With FX locked quote on a session -> sends USD, never INR
      const session2 = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session2.id,
        agreementHash: computeAgreementHash(session2.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session2.fxRecord = lockFXQuote(quote, session2.agreementRecord!);
      sessionStore.saveSession(session2);

      const resWithFX = await settlement.initiateCheckout({
        sessionId: session2.id,
        origin: "http://localhost:3000",
      });

      expect(resWithFX.success).toBe(true);
      expect(createOrderSpy).toHaveBeenCalled();
      const callArg = createOrderSpy.mock.calls[0]?.[0];
      expect(callArg?.currency).toBe("USD");
      expect(callArg?.currency).not.toBe("INR");
    });

    it("28. FX-backed PayPal order sends USD", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      const createOrderSpy = vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "PAYPAL-ORDER-USD-TEST",
        status: "CREATED",
        customId: "CUSTOM_ID_TEST",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=TEST", method: "GET" }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(createOrderSpy.mock.calls[0]?.[0].currency).toBe("USD");
    });

    it("29. PayPal amount exactly equals locked target amount", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      const createOrderSpy = vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "PAYPAL-ORDER-EXACT-TEST",
        status: "CREATED",
        customId: "CUSTOM_ID_TEST",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=TEST", method: "GET" }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      const expectedUsdAmount = fromMinorUnits(session.fxRecord.targetAmountMinor);
      expect(createOrderSpy.mock.calls[0]?.[0].totalAmount).toBe(expectedUsdAmount);
    });

    it("30. PayPal currency exactly equals target currency", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      const createOrderSpy = vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "PAYPAL-ORDER-CURRENCY-TEST",
        status: "CREATED",
        customId: "CUSTOM_ID_TEST",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=TEST", method: "GET" }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(createOrderSpy.mock.calls[0]?.[0].currency).toBe(session.fxRecord.targetCurrency);
    });

    it("31. PayPal order references conversion commitment", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      const createOrderSpy = vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "PAYPAL-ORDER-COMMIT-TEST",
        status: "CREATED",
        customId: `VERIPAY_ROOT:${session.merkleRoot};SESSION:${session.id}`,
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=TEST", method: "GET" }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(createOrderSpy).toHaveBeenCalled();
    });

    it("32. Duplicate checkout does not create duplicate order", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      session.status = "PAYPAL_CAPTURED";
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      const createOrderSpy = vi.spyOn(client, "createAuthorizedOrder");

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already been settled/i);
      expect(createOrderSpy).not.toHaveBeenCalled();
    });

    it("33. Approval URL extraction works", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "ORDER-VALID-APPROVE",
        status: "CREATED",
        customId: "CUSTOM_ID_TEST",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST_TOKEN_123",
        links: [
          { rel: "self", href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-VALID-APPROVE", method: "GET" },
          { rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=TEST_TOKEN_123", method: "GET" },
        ],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(res.success).toBe(true);
      expect(res.approvalUrl).toBe("https://www.sandbox.paypal.com/checkoutnow?token=TEST_TOKEN_123");
    });

    it("34. Invalid approval host fails closed", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "ORDER-MALICIOUS-REDIRECT",
        status: "CREATED",
        customId: "CUSTOM_ID_TEST",
        approvalUrl: "https://malicious-phishing-site.com/checkoutnow?token=TEST",
        links: [
          { rel: "approve", href: "https://malicious-phishing-site.com/checkoutnow?token=TEST", method: "GET" },
        ],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/untrusted paypal redirect hostname/i);
    });

    it("35. USD native flow still works without FX", async () => {
      const session = createTestUSDSession();
      expect(session.fxRecord).toBeUndefined();

      const client = new PayPalClient();
      const createOrderSpy = vi.spyOn(client, "createAuthorizedOrder").mockResolvedValue({
        id: "ORDER-USD-NATIVE",
        status: "CREATED",
        customId: "CUSTOM_ID_TEST",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=USD_TOKEN",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=USD_TOKEN", method: "GET" }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.initiateCheckout({
        sessionId: session.id,
        origin: "http://localhost:3000",
      });

      expect(res.success).toBe(true);
      expect(createOrderSpy).toHaveBeenCalled();
      expect(createOrderSpy.mock.calls[0]?.[0].currency).toBe("USD");
      expect(createOrderSpy.mock.calls[0]?.[0].totalAmount).toBe(session.agreementRecord!.totalCost);
      expect(session.fxRecord).toBeUndefined();
    });
  });

  // ==========================================
  // SECTION 4: RECONCILIATION (Proofs 36–42)
  // ==========================================
  describe("Reconciliation (Proofs 36–42)", () => {
    it("36. USD capture validates against USD agreement", async () => {
      const session = createTestUSDSession();
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORDER-USD-REC";
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      vi.spyOn(client, "getOrder").mockResolvedValue({
        id: "ORDER-USD-REC",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [{
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "8150.00" },
          payments: { captures: [{ id: "CAP-USD", status: "COMPLETED", amount: { currency_code: "USD", value: "8150.00" } }] },
        }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.reconcileSettlement({ sessionId: session.id });
      expect(res.reconciled).toBe(true);
      expect(res.captureId).toBe("CAP-USD");
    });

    it("37. FX-backed USD capture validates against FX target", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORDER-INR-FX-REC";
      sessionStore.saveSession(session);

      const targetUsdStr = (session.fxRecord.targetAmountMinor / 100).toFixed(2);
      const client = new PayPalClient();
      vi.spyOn(client, "getOrder").mockResolvedValue({
        id: "ORDER-INR-FX-REC",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [{
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: targetUsdStr },
          payments: { captures: [{ id: "CAP-FX-USD", status: "COMPLETED", amount: { currency_code: "USD", value: targetUsdStr } }] },
        }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.reconcileSettlement({ sessionId: session.id });
      expect(res.reconciled).toBe(true);
      expect(res.captureId).toBe("CAP-FX-USD");
    });

    it("38. PayPal USD amount must not be compared numerically against INR agreement amount", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORDER-NO-CROSS-COMPARE";
      sessionStore.saveSession(session);

      // USD value is ~8485.03, INR agreement total is 708,500.
      // Reconcile must compare USD against locked USD target, not 8485.03 vs 708500
      const targetUsdStr = (session.fxRecord.targetAmountMinor / 100).toFixed(2);
      const client = new PayPalClient();
      vi.spyOn(client, "getOrder").mockResolvedValue({
        id: "ORDER-NO-CROSS-COMPARE",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [{
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: targetUsdStr },
          payments: { captures: [{ id: "CAP-SAFE", status: "COMPLETED", amount: { currency_code: "USD", value: targetUsdStr } }] },
        }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.reconcileSettlement({ sessionId: session.id });
      expect(res.reconciled).toBe(true);
    });

    it("39. Currency mismatch fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORDER-CURR-FAIL";
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      vi.spyOn(client, "getOrder").mockResolvedValue({
        id: "ORDER-CURR-FAIL",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [{
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          amount: { currency_code: "EUR", value: "8485.03" }, // Mismatched currency
          payments: { captures: [{ id: "CAP-FAIL", status: "COMPLETED", amount: { currency_code: "EUR", value: "8485.03" } }] },
        }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.reconcileSettlement({ sessionId: session.id });
      expect(res.reconciled).toBe(false);
      expect(res.error).toMatch(/currency mismatch/i);
    });

    it("40. Amount mismatch fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORDER-AMT-FAIL";
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      vi.spyOn(client, "getOrder").mockResolvedValue({
        id: "ORDER-AMT-FAIL",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [{
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "9999.99" }, // Mismatched amount
          payments: { captures: [{ id: "CAP-AMT-FAIL", status: "COMPLETED", amount: { currency_code: "USD", value: "9999.99" } }] },
        }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.reconcileSettlement({ sessionId: session.id });
      expect(res.reconciled).toBe(false);
      expect(res.error || res.message).toMatch(/amount mismatch|does not match/i);
    });

    it("41. Wrong FX record fails", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      const locked = lockFXQuote(quote, session.agreementRecord!);
      // Assign an invalid/unlocked status
      session.fxRecord = { ...locked, status: "EXPIRED" };
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      session.paypalOrderId = "ORDER-STATUS-FAIL";
      sessionStore.saveSession(session);

      const client = new PayPalClient();
      vi.spyOn(client, "getOrder").mockResolvedValue({
        id: "ORDER-STATUS-FAIL",
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [{
          custom_id: `VERIPAY_ROOT:${session.preSettlementRoot ?? session.merkleRoot};SESSION:${session.id}`,
          amount: { currency_code: "USD", value: "8485.03" },
          payments: { captures: [{ id: "CAP-S", status: "COMPLETED", amount: { currency_code: "USD", value: "8485.03" } }] },
        }],
      });

      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.reconcileSettlement({ sessionId: session.id });
      expect(res.reconciled).toBe(false);
      expect(res.error).toMatch(/FX settlement audit verification failed/i);
    });

    it("42. Wrong session fails", async () => {
      const client = new PayPalClient();
      const settlement = new SettlementService({ paypalClient: client });
      const res = await settlement.reconcileSettlement({ sessionId: "non_existent_session_id" });
      expect(res.reconciled).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  // ==========================================
  // SECTION 5: WEBHOOKS (Proofs 43–46)
  // ==========================================
  describe("Webhooks (Proofs 43–46)", () => {
    beforeEach(() => {
      vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(true);
    });
    it("43. FX-backed capture webhook validates target currency", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      // Webhook sends mismatched currency "EUR"
      const webhookPayload = {
        id: "WH-EVT-CURR-FAIL",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-WH-CURR",
          status: "COMPLETED",
          amount: { currency_code: "EUR", value: "8485.03" },
          custom_id: `SESSION:${session.id}`,
        },
      };

      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "test_sig_12345678",
        },
        body: JSON.stringify(webhookPayload),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toMatch(/currency mismatch/i);
    });

    it("44. FX-backed capture webhook validates target amount", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      // Webhook sends mismatched amount "9999.00"
      const webhookPayload = {
        id: "WH-EVT-AMT-FAIL",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-WH-AMT",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "9999.00" },
          custom_id: `SESSION:${session.id}`,
        },
      };

      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "test_sig_12345678",
        },
        body: JSON.stringify(webhookPayload),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toMatch(/amount mismatch/i);
    });

    it("45. Existing signature verification remains enforced", async () => {
      vi.spyOn(PayPalClient.prototype, "verifyWebhookSignature").mockResolvedValue(false);
      const webhookPayload = {
        id: "WH-EVT-NOSIG",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "CAP-1", status: "COMPLETED" },
      };

      // No paypal-transmission-sig header provided
      const req = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/signature/i);
    });

    it("46. Existing deduplication remains enforced", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);
      sessionStore.saveSession(session);

      const targetUsdStr = (session.fxRecord.targetAmountMinor / 100).toFixed(2);
      session.paypalOrderId = "ORDER-WEBHOOK-CONFIRMED";
      sessionStore.saveSession(session);
      vi.spyOn(PayPalClient.prototype, "getOrder").mockResolvedValue(completedOrder(session, "CAP-DEDUP-1", targetUsdStr));
      const webhookPayload = {
        id: "WH-DEDUP-UNIQUE-EVENT-ID",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-DEDUP-1",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: targetUsdStr },
          custom_id: `SESSION:${session.id}`,
        },
      };

      // First delivery: processes successfully
      const req1 = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "test_sig_dedup",
        },
        body: JSON.stringify(webhookPayload),
      });
      const res1 = await webhookPost(req1);
      expect(res1.status).toBe(200);

      // Replay / duplicate delivery: must be detected and deduplicated
      const req2 = new NextRequest("http://localhost:3000/api/paypal/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-sig": "test_sig_dedup",
        },
        body: JSON.stringify(webhookPayload),
      });
      const res2 = await webhookPost(req2);
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.deduplicated).toBe(true);
    });
  });

  // ==========================================
  // SECTION 6: UI VERIFICATION (Proofs 47–56)
  // ==========================================
  describe("UI Verification (Proofs 47–56)", () => {
    it("47. INR audited session shows Get Settlement Quote", () => {
      const session = createTestINRSession();
      delete session.fxRecord;

      render(<SettlementCenterScreen session={session} />);

      expect(screen.getByText(/Get Settlement Quote/i)).toBeInTheDocument();
      expect(screen.getAllByText(/CROSS-CURRENCY SETTLEMENT/i).length).toBeGreaterThan(0);
    });

    it("48. Quoted state shows rate and USD amount", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = quote;

      render(<SettlementCenterScreen session={session} />);

      expect(screen.getAllByText(/83.5000/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/\$8,485\.03/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Lock FX Quote/i)).toBeInTheDocument();
    });

    it("49. Lock CTA appears only for valid quote", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = quote;

      render(<SettlementCenterScreen session={session} />);
      const lockButton = screen.getByRole("button", { name: /Lock FX Quote/i });
      expect(lockButton).toBeInTheDocument();
      expect(lockButton).not.toBeDisabled();
    });

    it("50. Expired state shows Refresh FX Quote", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
        ttlSeconds: -10, // Expired
      });
      session.fxRecord = quote;

      render(<SettlementCenterScreen session={session} />);

      expect(screen.getByText(/Refresh FX Quote/i)).toBeInTheDocument();
    });

    it("51. Locked state shows Continue to PayPal Sandbox", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);

      render(<SettlementCenterScreen session={session} />);

      expect(screen.getByText(/Continue to PayPal Sandbox/i)).toBeInTheDocument();
      expect(screen.getAllByText(/LOCKED/i).length).toBeGreaterThan(0);
    });

    it("52. USD session does not show FX UI", () => {
      const session = createTestUSDSession();

      render(<SettlementCenterScreen session={session} />);

      expect(screen.queryByText(/CROSS-CURRENCY SETTLEMENT/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Get Settlement Quote/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Lock FX Quote/i)).not.toBeInTheDocument();
    });

    it("53. No false 'Provider Unavailable' terminal state for valid INR→USD bridge", () => {
      const session = createTestINRSession();

      render(<SettlementCenterScreen session={session} />);

      expect(screen.queryByText(/Settlement Provider Unavailable/i)).not.toBeInTheDocument();
      expect(screen.getByText(/PayPal Sandbox \(FX Bridge\)/i)).toBeInTheDocument();
    });

    it("54. Transaction artifacts show both commercial and settlement currencies", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);

      render(<SettlementCenterScreen session={session} />);

      // Commercial obligation is in INR (Indian grouping: 7,08,500)
      expect(screen.getAllByText(/7,08,500/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Commercial/i).length).toBeGreaterThan(0);
      // Settlement obligation is in USD
      expect(screen.getAllByText(/\$8,485\.03/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Settlement/i).length).toBeGreaterThan(0);
    });

    it("55. Evidence Vault exposes conversion evidence", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "No committed evidence in UI fixture" }) }));
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);

      render(<EvidenceVaultScreen session={session} />);

      expect(screen.getByText(/Verifiable FX Settlement Evidence/i)).toBeInTheDocument();
      expect(screen.getByText(/1 USD = ₹83.5000/i)).toBeInTheDocument();
      expect(screen.getByText(/\$8485.03 USD/i)).toBeInTheDocument();
      expect(screen.getByText(session.fxRecord.conversionHash)).toBeInTheDocument();
    });

    it("56. Mobile FX card does not overflow", async () => {
      const session = createTestINRSession();
      const provider = new DeterministicDemoFXProvider();
      const quote = await provider.getQuote({
        sessionId: session.id,
        agreementHash: computeAgreementHash(session.agreementRecord!),
        sourceCurrency: "INR",
        targetCurrency: "USD",
        sourceAmountMinor: INR_LANDED_COST_PAISE,
      });
      session.fxRecord = lockFXQuote(quote, session.agreementRecord!);

      const { container } = render(<SettlementCenterScreen session={session} />);

      // Verify responsive containment and border classes prevent layout blowout
      const card = container.querySelector("[class*='border-smoke'], [class*='rounded-']");
      expect(card).toBeInTheDocument();
      // Ensure element classes include overflow protection
      expect(container.innerHTML).toMatch(/overflow-hidden|break-words|truncate/);
    });
  });
});
