/**
 * PACTUM — Cryptographic Evidence Integrity Regression Tests (SEC-04)
 * Tests strict flight-recorder prefix chain matching and verifies removal of the matchesMerkle bypass.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { verifyFxCommercialSession } from "@/lib/fx-session-verification";
import { sessionStore } from "@/lib/session-store";
import { CryptographicFlightRecorder, verifyFlightRecorderChain } from "@/lib/flight-recorder";
import { AcworldAuditor, computeCertificateHash } from "@/lib/acworld-auditor";
import type { ProcurementSession, ProcurementMandate, VendorQuote } from "@/types/pactum";

const baseMandate: ProcurementMandate = {
  id: "mandate_sec04_integrity",
  rawPrompt: "Purchase 25 4K USB-C monitors under an 8,500 total budget",
  itemQuery: "4K USB-C monitors",
  quantity: 25,
  maxTotalBudget: 750000,
  maxDeliveryDays: 5,
  minReturnDays: 30,
  currency: "INR",
  requiredSpecs: [
    { name: "Resolution", value: "4K", mandatory: true },
    { name: "Ports", value: "USB-C", mandatory: true },
  ],
  createdAt: new Date().toISOString(),
  version: 1,
  isLocked: true,
};

const baseQuote: VendorQuote = {
  vendorId: "vendor_apex_in",
  vendorName: "Apex Displays India",
  sku: "APX-IN-4K-27U",
  productTitle: "Apex 27 4K Monitor",
  initialUnitAsk: 32000,
  currentUnitBid: 26000,
  shippingCost: 8234.25,
  deliveryDays: 4,
  returnDays: 30,
  condition: "NEW",
  status: "ACCEPTED",
  dataSource: "MOCK_CATALOG",
  currency: "INR",
};

function createAuditedSession(): ProcurementSession {
  const session = sessionStore.createSession(baseMandate, [baseQuote]);
  session.selectedQuote = { ...baseQuote };
  const offer = {
    unitPrice: 26000,
    quantity: 25,
    deliveryDays: 4,
    returnDays: 30,
    shippingCost: 8234.25,
    currency: "INR",
  };
  session.finalOffer = { ...offer };
  session.agreementRecord = {
    agreementId: `agree_${session.id.slice(-6)}`,
    sessionId: session.id,
    vendorId: baseQuote.vendorId,
    vendorName: baseQuote.vendorName,
    sku: baseQuote.sku,
    agreedPrice: 26000,
    agreedOffer: { ...offer },
    totalCost: 658234.25,
    currency: "INR",
    agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
    acceptingParty: "VENDOR",
    acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
    round: 3,
    acceptedAt: new Date().toISOString(),
    mandateVersion: 1,
  };
  session.merchantAttestation = {
    merchantUrl: "https://apex.in/returns",
    returnPolicyText: "30-day comprehensive enterprise return policy.",
    timestamp: new Date().toISOString(),
  };

  const recorder = new CryptographicFlightRecorder(session.id);
  recorder.recordEvent("MANDATE_CREATED", { mandateId: session.mandate.id });
  recorder.recordEvent("SOURCING_COMPLETED", { quoteCount: 1 });
  recorder.recordEvent(
    "AGREEMENT_CREATED",
    {
      agreementId: session.agreementRecord.agreementId,
      unitPrice: 26000,
      quantity: 25,
      totalCost: 658234.25,
    },
    { agreementId: session.agreementRecord.agreementId }
  );

  session.flightRecord = recorder.exportFlightRecord();
  session.merkleRoot = recorder.getRootHash();
  session.preSettlementRoot = recorder.getRootHash();
  session.status = "AUDIT_PASSED";

  const auditor = new AcworldAuditor();
  session.auditCertificate = auditor.audit({ session });
  expect(session.auditCertificate.passed).toBe(true);

  sessionStore.saveSession(session);
  return session;
}

beforeEach(() => {
  sessionStore.clear();
});

describe("SEC-04: Cryptographic Evidence Integrity in verifyFxCommercialSession", () => {
  it("1. accepts a valid commercial certificate with a valid flight-recorder chain", () => {
    const session = createAuditedSession();
    const error = verifyFxCommercialSession(session);
    expect(error).toBeUndefined();
  });

  it("2. rejects a tampered historical event whose stored session.merkleRoot still equals certificate root", () => {
    const session = createAuditedSession();
    const originalRoot = session.auditCertificate!.verifiedRoot;

    // Mutate historical event in the flight record
    session.flightRecord!.events[0].publicPayload = { mandateId: "TAMPERED_IN_STORE" };

    // Explicitly preserve the top-level session.merkleRoot and session.preSettlementRoot
    // to simulate the SEC-04 attack condition where stored strings match the certificate
    session.merkleRoot = originalRoot;
    session.preSettlementRoot = originalRoot;

    // Direct chain check must fail
    const events = session.flightRecord!.events;
    const matchesChain = events.some(
      (_, index) => verifyFlightRecorderChain(events.slice(0, index + 1), session.id, originalRoot).valid
    );
    expect(matchesChain).toBe(false);

    // Full verification must fail closed and reject the tampered session
    const error = verifyFxCommercialSession(session);
    expect(error).toBeDefined();
    expect(error).toMatch(/Failed to verify flight recorder|Payload hash mismatch|not part of the authoritative evidence history/);
  });

  it("3. accepts a valid commercial certificate anchored to an earlier verified prefix after FX events are appended", () => {
    const session = createAuditedSession();
    const preFxRoot = session.auditCertificate!.verifiedRoot;

    // Advance flight record by appending FX quote event
    const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord!);
    recorder.recordEvent("FX_QUOTE_CREATED", {
      quoteId: "quote_fx_sec04_test",
      rate: "83.5000",
      sourceAmountMinor: 65823425,
      targetAmountMinor: 788305,
    });

    session.flightRecord = recorder.exportFlightRecord();
    const postFxRoot = recorder.getRootHash();
    session.merkleRoot = postFxRoot;
    session.preSettlementRoot = postFxRoot;

    // Precondition: post-FX root differs from pre-FX commercial audit root
    expect(postFxRoot).not.toBe(preFxRoot);
    expect(session.auditCertificate!.verifiedRoot).toBe(preFxRoot);

    // Verification must find and validate the historical prefix slice
    const error = verifyFxCommercialSession(session);
    expect(error).toBeUndefined();
  });

  it("4. rejects a flight record whose sessionId does not match the active procurement session", () => {
    const session = createAuditedSession();
    session.flightRecord!.sessionId = "session_cross_injected_attacker";

    const error = verifyFxCommercialSession(session);
    expect(error).toBe("Commercial certificate root is not part of the authoritative evidence history.");
  });

  it("5. rejects a certificate root that matches neither the current chain nor any valid historical prefix", () => {
    const session = createAuditedSession();
    const fakeRoot = "d".repeat(64);

    const forgedCert = {
      ...session.auditCertificate!,
      verifiedRoot: fakeRoot,
    };
    forgedCert.certificateHash = computeCertificateHash(forgedCert);
    session.auditCertificate = forgedCert;

    const error = verifyFxCommercialSession(session);
    expect(error).toBe("Commercial certificate root is not part of the authoritative evidence history.");
  });

  it("6. preserves existing contract for a session without a serialized flight record", () => {
    const session = createAuditedSession();
    session.flightRecord = undefined;

    // In accordance with Step 4, missing flight records pass through existing
    // eligibility and ACWORLD auditor validation without introducing a permissive root-string bypass
    const error = verifyFxCommercialSession(session);
    expect(error).toBeUndefined();
  });
});
