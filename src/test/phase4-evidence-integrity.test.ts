/**
 * PACTUM — Phase 4 Adversarial Test Suite:
 * Evidence Integrity, Independent Verification & ACWORLD Auditability
 *
 * Covers:
 * 1. Flight Recorder Event-Chain Integrity (Tampering, deletion, reordering, duplicate seq, gap, cross-session, malformed)
 * 2. VeriPay Merkle Tree & Proof Correctness (Empty, single, 2-leaf, odd leaves, inclusion proofs, tampered leaves/siblings/roots)
 * 3. ACWORLD Deterministic Audit Invariants (All 5 invariants, SKU, condition, price arithmetic, budget, return attestation, SLA, lineage)
 * 4. Settlement Lifecycle & Evidence Lineage (Audit gate blocking, stale certificate rejection, post-settlement history preservation)
 *
 * Deterministic tests: No external network calls.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";
import {
  CryptographicFlightRecorder,
  verifyFlightRecorderChain,
} from "../lib/flight-recorder";
import {
  VeriPayMerkleTree,
  canonicalJson,
  verifyProof,
  verifyInclusionProof,
  EMPTY_TREE_ROOT,
} from "../lib/veripay-merkle";
import { AcworldAuditor, computeCertificateHash } from "../lib/acworld-auditor";
import { SettlementService } from "../lib/settlement-service";
import { sessionStore } from "../lib/session-store";
import type { PayPalClient } from "../lib/paypal-client";
import type {
  ProcurementSession,
  FlightRecorderEvent,
  FlightRecorderEventType,
  AuditCertificate,
} from "../types/pactum";

describe("Phase 4: Evidence Integrity & ACWORLD Auditability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. FLIGHT RECORDER EVENT-CHAIN INTEGRITY
  // =========================================================================
  describe("1. Flight Recorder Event-Chain Integrity", () => {
    const sessionId = "session_flight_test_1";

    function createSampleRecorder(sid = sessionId): CryptographicFlightRecorder {
      const recorder = new CryptographicFlightRecorder(sid);
      recorder.recordEvent(
        "MANDATE_CREATED",
        { item: "4K Monitors", quantity: 25, budget: 8500 },
        { mandateVersion: 1 }
      );
      recorder.recordEvent(
        "VENDOR_COUNTEROFFER",
        { vendorId: "v1", unitAsk: 340, shipping: 100 },
        { mandateVersion: 1 }
      );
      recorder.recordEvent(
        "BUYER_PROPOSAL",
        { vendorId: "v1", unitBid: 320, shipping: 100 },
        { mandateVersion: 1 }
      );
      recorder.recordEvent(
        "BUYER_ACCEPTANCE",
        { agreementId: "agr_1", price: 320, total: 8100 },
        { mandateVersion: 1, agreementId: "agr_1" }
      );
      return recorder;
    }

    it("verifies a valid multi-event chain from genesis to root", () => {
      const recorder = createSampleRecorder();
      const integrity = recorder.verifyIntegrity();
      expect(integrity.valid).toBe(true);
      expect(integrity.verifiedEvents).toBe(4);
      expect(integrity.rootHash).toBe(recorder.getRootHash());
      expect(integrity.error).toBeUndefined();
    });

    it("detects payload tampering in any event", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Tamper with payload of event 2 (index 1)
      events[1].publicPayload.unitAsk = 999;

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("PAYLOAD_HASH_MISMATCH");
      expect(result.firstFailingIndex).toBe(1);
    });

    it("detects event-type tampering in the chain", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Tamper with eventType of event 3
      events[2].eventType = "VENDOR_ACCEPTANCE";

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("LEAF_HASH_MISMATCH");
      expect(result.firstFailingIndex).toBe(2);
    });

    it("detects timestamp tampering in a committed event", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Alter timestamp
      events[0].timestamp = "2020-01-01T00:00:00.000Z";

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("LEAF_HASH_MISMATCH");
      expect(result.firstFailingIndex).toBe(0);
    });

    it("detects previous-hash tampering (hash chain break)", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Alter previousEventHash of event 2
      events[2].previousEventHash = "0".repeat(64);

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("HASH_CHAIN_BROKEN");
      expect(result.firstFailingIndex).toBe(2);
    });

    it("detects invalid genesis previous-hash at index 0", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      events[0].previousEventHash = "a".repeat(64);

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("GENESIS_HASH_MISMATCH");
      expect(result.firstFailingIndex).toBe(0);
    });

    it("detects event deletion from the middle of the chain", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Delete index 1
      events.splice(1, 1);

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("SEQUENCE_GAP");
      expect(result.firstFailingIndex).toBe(1);
    });

    it("detects event reordering within the chain", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Swap events 1 and 2
      const tmp = events[1];
      events[1] = events[2];
      events[2] = tmp;

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(["SEQUENCE_GAP", "HASH_CHAIN_BROKEN", "DUPLICATE_SEQUENCE"]).toContain(
        result.errorCode
      );
    });

    it("detects duplicate sequence numbers", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Make event 2 have sequenceNumber 0 like event 1
      events[1].sequenceNumber = 0;

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("DUPLICATE_SEQUENCE");
    });

    it("detects sequence gaps where numbers are skipped", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Artificially increment sequence numbers to create a gap
      events[2].sequenceNumber = 5;

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("SEQUENCE_GAP");
      expect(result.firstFailingIndex).toBe(2);
    });

    it("detects cross-session event injection", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents();

      // Inject foreign session event
      events[2].sessionId = "malicious_foreign_session";

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("CROSS_SESSION_INJECTION");
      expect(result.firstFailingIndex).toBe(2);
    });

    it("detects malformed event records safely", () => {
      const recorder = createSampleRecorder();
      const events = recorder.getEvents() as unknown as FlightRecorderEvent[];

      // Invalidate event structure
      events[1] = { malformed: true } as unknown as FlightRecorderEvent;

      const result = verifyFlightRecorderChain(events, sessionId);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("MALFORMED_EVENT");
      expect(result.firstFailingIndex).toBe(1);
    });

    it("detects expected root anchor mismatch (tampered root attack)", () => {
      const recorder = createSampleRecorder();
      const tamperedRoot = "f".repeat(64);

      const result = recorder.verifyIntegrity(tamperedRoot);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("EXPECTED_ROOT_MISMATCH");
    });
  });

  // =========================================================================
  // 2. VERIPAY MERKLE TREE: PROOF CORRECTNESS
  // =========================================================================
  describe("2. VeriPay Merkle Tree & Proof Correctness", () => {
    it("handles an empty tree correctly with 64 zero hex string", () => {
      const tree = new VeriPayMerkleTree();
      expect(tree.getRootHash()).toBe("0".repeat(64));
      expect(tree.getAuditNodes().length).toBe(0);
      expect(() => tree.generateInclusionProof(0)).toThrow(/empty/i);
    });

    it("handles a single leaf tree deterministically", () => {
      const tree = new VeriPayMerkleTree();
      const node = tree.addEvent("MANDATE_LOCKED", { budget: 5000 }, "2026-01-01T00:00:00Z");

      expect(tree.getRootHash()).toBe(node.leafHash);
      const proof = tree.generateInclusionProof(0);
      expect(proof.leafIndex).toBe(0);
      expect(proof.proof.length).toBe(0);
      expect(verifyInclusionProof(proof)).toBe(true);
      expect(verifyInclusionProof(proof, tree.getRootHash())).toBe(true);
    });

    it("handles a two-leaf tree and generates valid inclusion proofs for both leaves", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_CREATED", { v: 1 });
      tree.addEvent("BUYER_PROPOSAL", { v: 2 });

      expect(tree.getRootHash().length).toBe(64);
      const proof0 = tree.generateInclusionProof(0);
      const proof1 = tree.generateInclusionProof(1);

      expect(verifyInclusionProof(proof0, tree.getRootHash())).toBe(true);
      expect(verifyInclusionProof(proof1, tree.getRootHash())).toBe(true);
      expect(proof0.proof.length).toBe(1);
      expect(proof0.proof[0].position).toBe("right");
      expect(proof1.proof[0].position).toBe("left");
    });

    it("handles odd leaf counts (3 leaves and 5 leaves) with duplicate right node hashing", () => {
      // 3 leaves
      const tree3 = new VeriPayMerkleTree();
      tree3.addEvent("MANDATE_CREATED", { a: 1 });
      tree3.addEvent("VENDOR_COUNTEROFFER", { b: 2 });
      tree3.addEvent("BUYER_ACCEPTANCE", { c: 3 });

      const root3 = tree3.getRootHash();
      expect(root3.length).toBe(64);

      for (let i = 0; i < 3; i++) {
        const proof = tree3.generateInclusionProof(i);
        expect(verifyInclusionProof(proof, root3)).toBe(true);
      }

      // 5 leaves
      const tree5 = new VeriPayMerkleTree();
      const eventTypes: FlightRecorderEventType[] = [
        "MANDATE_CREATED",
        "BUYER_PROPOSAL",
        "VENDOR_COUNTEROFFER",
        "BUYER_ACCEPTANCE",
        "AGREEMENT_CREATED",
      ];
      for (let i = 0; i < 5; i++) {
        tree5.addEvent(eventTypes[i], { step: i });
      }

      const root5 = tree5.getRootHash();
      for (let i = 0; i < 5; i++) {
        const proof = tree5.generateInclusionProof(i);
        expect(verifyInclusionProof(proof, root5)).toBe(true);
      }
    });

    it("fails verification if leaf hash is altered", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_CREATED", { v: 10 });
      tree.addEvent("VENDOR_COUNTEROFFER", { v: 20 });
      tree.addEvent("BUYER_ACCEPTANCE", { v: 30 });

      const proof = tree.generateInclusionProof(1);
      const tamperedProof = {
        ...proof,
        leafHash: crypto.createHash("sha256").update("tampered_leaf").digest("hex"),
      };

      expect(verifyInclusionProof(tamperedProof, tree.getRootHash())).toBe(false);
    });

    it("fails verification if a proof sibling hash is altered", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_CREATED", { v: 10 });
      tree.addEvent("VENDOR_COUNTEROFFER", { v: 20 });
      tree.addEvent("BUYER_ACCEPTANCE", { v: 30 });

      const proof = tree.generateInclusionProof(0);
      const tamperedProof = {
        ...proof,
        proof: proof.proof.map((p, idx) =>
          idx === 0 ? { ...p, hash: "1234".repeat(16) } : p
        ),
      };

      expect(verifyInclusionProof(tamperedProof, tree.getRootHash())).toBe(false);
    });

    it("fails verification if sibling position ordering is inverted", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_CREATED", { v: 10 });
      tree.addEvent("VENDOR_COUNTEROFFER", { v: 20 });

      const proof = tree.generateInclusionProof(0);
      // Invert position from right to left
      const tamperedProof = {
        ...proof,
        proof: [{ position: "left" as const, hash: proof.proof[0].hash }],
      };

      expect(verifyInclusionProof(tamperedProof, tree.getRootHash())).toBe(false);
    });

    it("fails verification when checked against an incorrect root", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_CREATED", { v: 1 });
      tree.addEvent("BUYER_PROPOSAL", { v: 2 });

      const proof = tree.generateInclusionProof(0);
      const wrongRoot = "e".repeat(64);

      expect(verifyInclusionProof(proof, wrongRoot)).toBe(false);
    });

    it("rejects out-of-range leaf indices safely", () => {
      const tree = new VeriPayMerkleTree();
      tree.addEvent("MANDATE_CREATED", { v: 1 });

      expect(() => tree.generateInclusionProof(-1)).toThrow(/invalid leaf index/i);
      expect(() => tree.generateInclusionProof(5)).toThrow(/invalid leaf index/i);
      expect(() => tree.generateInclusionProof(NaN)).toThrow(/invalid leaf index/i);
    });

    it("rejects malformed proof structures with non-hex or invalid positions", () => {
      expect(verifyProof("not-a-valid-hex-hash", [], "0".repeat(64))).toBe(false);
      expect(
        verifyProof("a".repeat(64), [{ position: "center" as unknown as "left", hash: "b".repeat(64) }], "c".repeat(64))
      ).toBe(false);
      expect(
        verifyProof("a".repeat(64), [{ position: "left", hash: "short-hash" }], "c".repeat(64))
      ).toBe(false);
    });

    it("canonicalJson rejects non-finite numbers and circular references", () => {
      expect(() => canonicalJson({ val: NaN })).toThrow(/non-finite/i);
      expect(() => canonicalJson({ val: Infinity })).toThrow(/non-finite/i);

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(() => canonicalJson(circular)).toThrow(/circular/i);
    });
  });

  // =========================================================================
  // 3. ACWORLD AUDIT: INVARIANT VERIFICATION
  // =========================================================================
  describe("3. ACWORLD Independent Audit Invariants", () => {
    const auditor = new AcworldAuditor();

    function createValidSession(): ProcurementSession {
      return {
        id: "sess_acworld_valid_1",
        mandate: {
          id: "man_1",
          rawPrompt: "Purchase 25 4K monitors under $8,500 total budget",
          itemQuery: "4K USB-C monitors",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          requiredSpecs: [],
          currency: "USD",
          requiredCondition: "NEW",
          createdAt: new Date().toISOString(),
          version: 1,
        },
        quotes: [],
        turns: [],
        selectedQuote: {
          vendorId: "v_dell",
          vendorName: "Dell Wholesale",
          sku: "DELL-U2723QE",
          productTitle: "Dell UltraSharp 27 4K",
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
        agreementRecord: {
          agreementId: "agr_dell_1",
          sessionId: "sess_acworld_valid_1",
          vendorId: "v_dell",
          vendorName: "Dell Wholesale",
          sku: "DELL-U2723QE",
          agreedPrice: 320,
          agreedOffer: {
            unitPrice: 320,
            quantity: 25,
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 150,
          },
          totalCost: 320 * 25 + 150, // 8150
          agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          acceptingParty: "BUYER",
          acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          round: 3,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
        preSettlementRoot: "c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee1234",
        status: "AUDIT_PENDING",
        merchantAttestation: {
          merchantUrl: "https://dell.com/returns",
          domSnapshotHash: "a".repeat(64),
          returnPolicyText: "30-day corporate return satisfaction policy.",
          timestamp: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    it("passes all 5 invariants for a valid authoritative session", () => {
      const session = createValidSession();
      const cert = auditor.audit({
        session,
        expectedOrderCustomId: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
      });

      expect(cert.passed).toBe(true);
      expect(cert.status).toBe("VALID");
      expect(cert.mandateVersion).toBe(1);
      expect(cert.agreementId).toBe("agr_dell_1");
      expect(cert.auditType).toBe("PRE_SETTLEMENT");
      expect(cert.invariants.length).toBe(5);
      expect(cert.invariants.every((i) => i.passed && i.status === "VALID")).toBe(true);

      // Verify supplier attestation is explicitly flagged on Invariant 3
      const inv3 = cert.invariants.find((i) => i.name === "RETURN_POLICY")!;
      expect(inv3.isSupplierAttestation).toBe(true);
    });

    it("fails Invariant 1 on SKU mismatch between agreement and selected quote", () => {
      const session = createValidSession();
      session.agreementRecord!.sku = "WRONG-SKU-999";

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      expect(cert.status).toBe("INVALID");
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("SKU_MISMATCH");
    });

    it("fails Invariant 1 on product condition mismatch", () => {
      const session = createValidSession();
      session.selectedQuote!.condition = "REFURBISHED";

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("CONDITION_MISMATCH");
    });

    it("fails Invariant 1 on vendor ID mismatch between agreement and quote", () => {
      const session = createValidSession();
      session.agreementRecord!.vendorId = "rogue_vendor_id";

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("VENDOR_MISMATCH");
    });

    it("fails Invariant 1 on stale agreement from older mandate revision", () => {
      const session = createValidSession();
      session.mandate.version = 2; // Mandate updated to version 2
      session.agreementRecord!.mandateVersion = 1; // Agreement was for version 1

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("STALE_AGREEMENT");
    });

    it("fails Invariant 1 on agreement session mismatch", () => {
      const session = createValidSession();
      session.agreementRecord!.sessionId = "foreign_session_xyz";

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("SESSION_MISMATCH");
    });

    it("fails Invariant 2 when landed cost exceeds mandate budget ceiling", () => {
      const session = createValidSession();
      // 25 * 350 + 150 = 8900 > 8500
      session.finalOffer!.unitPrice = 350;
      session.agreementRecord!.agreedPrice = 350;
      session.agreementRecord!.totalCost = 350 * 25 + 150;

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv2 = cert.invariants.find((i) => i.name === "PRICE_CEILING")!;
      expect(inv2.passed).toBe(false);
      expect(inv2.code).toBe("BUDGET_EXCEEDED");
    });

    it("fails Invariant 2 on quantity mismatch between final offer and mandate", () => {
      const session = createValidSession();
      session.finalOffer!.quantity = 20; // mandate requires 25

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv2 = cert.invariants.find((i) => i.name === "PRICE_CEILING")!;
      expect(inv2.passed).toBe(false);
      expect(inv2.code).toBe("QUANTITY_MISMATCH");
    });

    it("fails Invariant 2 on negative or non-finite unit price", () => {
      const session = createValidSession();
      session.finalOffer!.unitPrice = -50;

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv2 = cert.invariants.find((i) => i.name === "PRICE_CEILING")!;
      expect(inv2.passed).toBe(false);
      expect(inv2.code).toBe("INVALID_UNIT_PRICE");
    });

    it("fails Invariant 2 on agreement total arithmetic mismatch", () => {
      const session = createValidSession();
      // unitPrice 320 * 25 + 150 = 8150, but agreement states 7000
      session.agreementRecord!.totalCost = 7000;

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv2 = cert.invariants.find((i) => i.name === "PRICE_CEILING")!;
      expect(inv2.passed).toBe(false);
      expect(inv2.code).toBe("ARITHMETIC_MISMATCH");
    });

    it("fails Invariant 3 when agreed return window is less than mandate minimum", () => {
      const session = createValidSession();
      session.finalOffer!.returnDays = 14; // Mandate requires 30

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv3 = cert.invariants.find((i) => i.name === "RETURN_POLICY")!;
      expect(inv3.passed).toBe(false);
      expect(inv3.code).toBe("RETURN_POLICY_VIOLATION");
    });

    it("fails Invariant 3 when merchant attestation is missing for live catalog item", () => {
      const session = createValidSession();
      session.merchantAttestation = undefined;
      session.selectedQuote!.dataSource = "CHANNEL3";

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv3 = cert.invariants.find((i) => i.name === "RETURN_POLICY")!;
      expect(inv3.passed).toBe(false);
      expect(inv3.code).toBe("MISSING_ATTESTATION");
    });

    it("fails Invariant 4 when delivery SLA exceeds mandate maximum", () => {
      const session = createValidSession();
      session.finalOffer!.deliveryDays = 10; // Mandate allows max 5

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv4 = cert.invariants.find((i) => i.name === "DELIVERY_SLA")!;
      expect(inv4.passed).toBe(false);
      expect(inv4.code).toBe("DELIVERY_SLA_VIOLATION");
    });

    it("fails Invariant 5 when pre-settlement Merkle root is missing or invalid", () => {
      const session = createValidSession();
      session.preSettlementRoot = undefined;
      session.merkleRoot = undefined;

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
      expect(inv5.passed).toBe(false);
      expect(inv5.code).toBe("INVALID_ROOT");
    });

    it("fails Invariant 5 when flight recorder event chain has been tampered", () => {
      const session = createValidSession();
      const recorder = new CryptographicFlightRecorder(session.id);
      recorder.recordEvent("MANDATE_CREATED", { mandateId: session.mandate.id });
      recorder.recordEvent("AGREEMENT_CREATED", { agreementId: session.agreementRecord!.agreementId });

      const exported = recorder.exportFlightRecord();
      // Tamper with exported payload
      exported.events[0].publicPayload = { mandateId: "tampered_mandate" };
      session.flightRecord = exported;
      session.preSettlementRoot = exported.rootHash;

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
      expect(inv5.passed).toBe(false);
      expect(["RECORDER_DESERIALIZATION_FAILED", "PAYLOAD_HASH_MISMATCH"]).toContain(inv5.code);
    });

    it("fails Invariant 5 when agreement acceptance event is missing from flight recorder", () => {
      const session = createValidSession();
      const recorder = new CryptographicFlightRecorder(session.id);
      // Record only mandate, omitting agreement acceptance event
      recorder.recordEvent("MANDATE_CREATED", { mandateId: session.mandate.id });

      const exported = recorder.exportFlightRecord();
      session.flightRecord = exported;
      session.preSettlementRoot = exported.rootHash;

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
      expect(inv5.passed).toBe(false);
      expect(inv5.code).toBe("MISSING_AGREEMENT_EVENT");
    });

    it("fails Invariant 5 when PayPal custom_id does not match verified Merkle root", () => {
      const session = createValidSession();
      const wrongCustomId = `VERIPAY_ROOT:${"d".repeat(64)};SESSION:${session.id}`;

      const cert = auditor.audit({
        session,
        expectedOrderCustomId: wrongCustomId,
      });

      expect(cert.passed).toBe(false);
      const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
      expect(inv5.passed).toBe(false);
      expect(inv5.code).toBe("CUSTOM_ID_ROOT_MISMATCH");
    });

    it("fails Invariant 5 when PayPal custom_id is bound to a different session ID", () => {
      const session = createValidSession();
      const foreignCustomId = `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:foreign_session_999`;

      const cert = auditor.audit({
        session,
        expectedOrderCustomId: foreignCustomId,
      });

      expect(cert.passed).toBe(false);
      const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
      expect(inv5.passed).toBe(false);
      expect(inv5.code).toBe("CUSTOM_ID_SESSION_MISMATCH");
    });
  });

  // =========================================================================
  // 4. SETTLEMENT LIFECYCLE & EVIDENCE LINEAGE
  // =========================================================================
  describe("4. Settlement Lifecycle & Evidence Lineage", () => {
    function setupAuthoritativeSession(sid = "session_settle_lifecycle"): ProcurementSession {
      const session: ProcurementSession = {
        id: sid,
        mandate: {
          id: "mandate_1",
          rawPrompt: "Purchase 25 4K monitors under $8,500",
          itemQuery: "4K monitors",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date().toISOString(),
          version: 1,
        },
        quotes: [],
        turns: [],
        selectedQuote: {
          vendorId: "v_apex",
          vendorName: "Apex Displays",
          sku: "APX-4K-27",
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
        agreementRecord: {
          agreementId: `agr_${sid}`,
          sessionId: sid,
          vendorId: "v_apex",
          vendorName: "Apex Displays",
          sku: "APX-4K-27",
          agreedPrice: 320,
          agreedOffer: {
            unitPrice: 320,
            quantity: 25,
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 150,
          },
          totalCost: 320 * 25 + 150,
          agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          acceptingParty: "BUYER",
          acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          round: 3,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
        merchantAttestation: {
          merchantUrl: "https://apex.com/returns",
          returnPolicyText: "30-day corporate return guarantee.",
          timestamp: new Date().toISOString(),
        },
        preSettlementRoot: "a".repeat(64),
        status: "PAYPAL_AUTHORIZED",
        paypalOrderId: `order_${sid}`,
        paypalAuthorizationId: `auth_${sid}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessionStore.saveSession(session);
      return session;
    }

    it("strictly blocks capture if ACWORLD audit gate fails", async () => {
      const session = setupAuthoritativeSession("sess_gate_block");
      // Cause invariant failure at the audit gate: mandate budget ceiling lower than landed cost
      session.mandate.maxTotalBudget = 5000; // 320 * 25 + 150 = 8150 > 5000
      sessionStore.saveSession(session);

      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "COMPLETED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        }),
        capturePayment: vi.fn(),
      };

      const settlement = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const res = await settlement.completeSettlement({ sessionId: "sess_gate_block" });

      expect(res.success).toBe(false);
      expect(res.blockedAtGate).toBe(true);
      expect(res.auditCertificate?.passed).toBe(false);
      expect(mockPaypal.capturePayment).not.toHaveBeenCalled();

      // Authoritative session must be AUDIT_FAILED
      const reloaded = sessionStore.getSession("sess_gate_block")!;
      expect(reloaded.status).toBe("AUDIT_FAILED");
    });

    it("rejects capture if order belongs to a different session ID", async () => {
      setupAuthoritativeSession("sess_order_mismatch");

      const settlement = new SettlementService();
      const res = await settlement.completeSettlement({
        sessionId: "sess_order_mismatch",
        orderId: "foreign_order_xyz",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("does not match authoritative session");
      expect(res.auditCertificate?.passed).toBe(false);
    });

    it("rejects capture if PayPal order amount does not match authoritative agreed total", async () => {
      const session = setupAuthoritativeSession("sess_amount_mismatch");

      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "COMPLETED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "9999.00" }, // Mismatched remote amount
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        }),
        capturePayment: vi.fn(),
      };

      const settlement = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const res = await settlement.completeSettlement({ sessionId: "sess_amount_mismatch" });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/does not match session agreed amount/i);
      expect(mockPaypal.capturePayment).not.toHaveBeenCalled();
    });

    it("handles capture uncertainty with fail-closed CAPTURE_PENDING_RECONCILIATION", async () => {
      const session = setupAuthoritativeSession("sess_timeout_uncertain");

      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "COMPLETED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        }),
        capturePayment: vi.fn().mockRejectedValue(new Error("ETIMEDOUT: Connection dropped")),
      };

      const settlement = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const res = await settlement.completeSettlement({ sessionId: "sess_timeout_uncertain" });

      expect(res.success).toBe(false);
      expect(res.uncertain).toBe(true);

      const reloaded = sessionStore.getSession("sess_timeout_uncertain")!;
      expect(reloaded.status).toBe("CAPTURE_PENDING_RECONCILIATION");
    });

    it("reconciliation does not fabricate success without authoritative provider evidence", async () => {
      const session = setupAuthoritativeSession("sess_reconcile_unconfirmed");
      session.status = "CAPTURE_PENDING_RECONCILIATION";
      sessionStore.saveSession(session);

      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "CREATED", // Remote order is still just CREATED, not completed
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
              payments: {},
            },
          ],
        }),
      };

      const settlement = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const recon = await settlement.reconcileSettlement({ sessionId: "sess_reconcile_unconfirmed" });

      // Cannot claim capture success
      expect(recon.status).toBe("CAPTURE_PENDING_RECONCILIATION");
      expect(recon.reconciled).toBe(false);
      expect(sessionStore.getSession("sess_reconcile_unconfirmed")!.status).toBe("CAPTURE_PENDING_RECONCILIATION");
    });

    it("preserves historical pre-settlement root when post-settlement events are appended", async () => {
      const session = setupAuthoritativeSession("sess_post_settle_preservation");

      // Attach a flight recorder to track post-settlement extension
      const recorder = new CryptographicFlightRecorder(session.id);
      recorder.recordEvent("MANDATE_CREATED", { mandateId: session.mandate.id });
      recorder.recordEvent("AGREEMENT_CREATED", { agreementId: session.agreementRecord!.agreementId });
      session.flightRecord = recorder.exportFlightRecord();
      session.preSettlementRoot = recorder.getRootHash();
      const authoritativePreRoot = session.preSettlementRoot;
      sessionStore.saveSession(session);

      const mockPaypal = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "APPROVED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${authoritativePreRoot};SESSION:${session.id}`,
            },
          ],
        }),
        authorizeOrder: vi.fn().mockResolvedValue({ authorizationId: "AUTH_PRESERVATION" }),
        capturePayment: vi.fn().mockResolvedValue({
          id: "cap_successful_123",
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "8150.00" },
        }),
        createNegotiatedInvoice: vi.fn().mockResolvedValue({
          invoiceId: "inv_12345",
          status: "DRAFT",
        }),
      };

      const settlement = new SettlementService({ paypalClient: mockPaypal as unknown as PayPalClient });
      const res = await settlement.completeSettlement({ sessionId: "sess_post_settle_preservation" });

      expect(res.success).toBe(true);
      const updated = sessionStore.getSession("sess_post_settle_preservation")!;
      expect(updated.status).toBe("SETTLED");

      // Critical Invariant: Pre-settlement root remains unchanged!
      expect(updated.preSettlementRoot).toBe(authoritativePreRoot);

      // Post-audit root reflects extended flight record
      expect(updated.postAuditRoot).toBeDefined();
      expect(updated.postAuditRoot).not.toBe(updated.preSettlementRoot);

      // Verify the flight recorder contains ACWORLD_AUDIT_PASSED and SETTLEMENT_COMPLETED
      const reconstituted = CryptographicFlightRecorder.fromSerialized(updated.flightRecord!);
      const events = reconstituted.getEvents();
      expect(events.some((e) => e.eventType === "ACWORLD_AUDIT_PASSED")).toBe(true);
      expect(events.some((e) => e.eventType === "SETTLEMENT_COMPLETED")).toBe(true);

      // Flight recorder integrity of the extended chain must be valid
      const chainIntegrity = reconstituted.verifyIntegrity(updated.postAuditRoot);
      expect(chainIntegrity.valid).toBe(true);
    });
  });

  // =========================================================================
  // 5. PHASE 4.1 ADVERSARIAL GAP CLOSURE & SECURITY VERIFICATION
  // =========================================================================
  describe("5. Phase 4.1 Adversarial Gap Closure & Security Verification", () => {
    it("canonicalJson correctly serializes DAGs without false circular reference errors", () => {
      const sharedNode = { id: "item_shared", price: 100 };
      const dagPayload = {
        primaryQuote: sharedNode,
        secondaryQuote: sharedNode,
        history: [sharedNode, sharedNode],
      };

      // Must not throw circular reference error for a DAG
      expect(() => canonicalJson(dagPayload)).not.toThrow();
      const serialized = canonicalJson(dagPayload);
      expect(serialized).toContain('"id":"item_shared"');
      expect(serialized).toContain('"price":100');
    });

    it("canonicalJson normalizes negative zero to 0", () => {
      const normalZero = canonicalJson({ price: 0 });
      const negativeZero = canonicalJson({ price: -0 });
      expect(negativeZero).toBe('{"price":0}');
      expect(negativeZero).toBe(normalZero);
    });

    it("canonicalJson normalizes Unicode NFC strings consistently", () => {
      // "café" in NFC (precomposed \u00E9) vs NFD (e + combining acute accent \u0301)
      const nfc = "caf\u00e9";
      const nfd = "cafe\u0301";
      expect(nfc).not.toBe(nfd); // In raw JS string comparison, they are distinct
      expect(canonicalJson({ text: nfc })).toBe(canonicalJson({ text: nfd }));
    });

    it("VeriPay Merkle Tree: inclusion proofs for 8-leaf trees and full verification for sizes 1, 2, 3, 5, 8", () => {
      const sizes = [1, 2, 3, 5, 8];

      for (const size of sizes) {
        const tree = new VeriPayMerkleTree();
        for (let i = 0; i < size; i++) {
          tree.addEvent("MANDATE_CREATED", { leafIndex: i, testVal: `leaf_${i}` });
        }

        const root = tree.getRootHash();
        expect(root.length).toBe(64);

        // Every leaf must have a verifiable inclusion proof
        for (let i = 0; i < size; i++) {
          const proof = tree.generateInclusionProof(i);
          expect(proof.leafIndex).toBe(i);
          expect(verifyInclusionProof(proof, root)).toBe(true);

          // Mutating leaf hash must fail
          const badLeafProof = { ...proof, leafHash: "f".repeat(64) };
          expect(verifyInclusionProof(badLeafProof, root)).toBe(false);

          // Mutating root must fail
          expect(verifyInclusionProof(proof, "e".repeat(64))).toBe(false);
        }
      }
    });

    it("verifyProof strictly rejects empty-tree zero root identifier", () => {
      const zeroRoot = "0".repeat(64);
      // Attempting to prove inclusion against the canonical empty tree identifier must fail
      expect(verifyProof(zeroRoot, [], zeroRoot)).toBe(false);
      expect(
        verifyInclusionProof({
          leafIndex: 0,
          leafHash: zeroRoot,
          proof: [],
          rootHash: zeroRoot,
        })
      ).toBe(false);
    });

    it("verifyFlightRecorderChain handles malformed payloads gracefully without uncaught exceptions", () => {
      const events: FlightRecorderEvent[] = [
        {
          eventId: "evt_1",
          sessionId: "sess_malformed_test",
          eventType: "MANDATE_CREATED",
          schemaVersion: 1,
          sequenceNumber: 0,
          timestamp: "2026-01-01T00:00:00Z",
          mandateVersion: 1,
          previousEventHash: "0".repeat(64),
          payloadHash: "a".repeat(64),
          leafHash: "b".repeat(64),
          publicPayload: {
            // Non-finite number directly in publicPayload will throw in canonicalJson
            invalidVal: NaN as unknown as number,
          },
        },
      ];

      const result = verifyFlightRecorderChain(events, "sess_malformed_test");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("PAYLOAD_HASH_MISMATCH");
    });

    it("fromSerialized detects and rejects tampered lastEventHash", () => {
      const recorder = new CryptographicFlightRecorder("sess_last_hash_check");
      recorder.recordEvent("MANDATE_CREATED", { v: 1 });
      const exported = recorder.exportFlightRecord();

      // Tamper with serialized lastEventHash without changing events
      exported.lastEventHash = "deadbeef".repeat(8);

      expect(() => {
        CryptographicFlightRecorder.fromSerialized(exported);
      }).toThrow(/Flight record lastEventHash mismatch/i);
    });

    it("ACWORLD Invariant 1 rejects agreement whose agreedOffer terms contradict finalOffer", () => {
      const auditor = new AcworldAuditor();
      const session: ProcurementSession = {
        id: "sess_agreed_offer_mismatch",
        mandate: {
          id: "m_1",
          rawPrompt: "25 monitors under 8500",
          itemQuery: "monitors",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date().toISOString(),
          version: 1,
        },
        quotes: [],
        turns: [],
        selectedQuote: {
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-1",
          productTitle: "Monitor",
          initialUnitAsk: 340,
          currentUnitBid: 320,
          shippingCost: 100,
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
          shippingCost: 100,
        },
        agreementRecord: {
          agreementId: "agr_mismatch_terms",
          sessionId: "sess_agreed_offer_mismatch",
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-1",
          agreedPrice: 320,
          agreedOffer: {
            unitPrice: 320,
            quantity: 10, // Contradicts finalOffer.quantity (25)
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 100,
          },
          totalCost: 320 * 25 + 100,
          agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          acceptingParty: "BUYER",
          acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          round: 2,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
        preSettlementRoot: "b".repeat(64),
        status: "AUDIT_PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("AGREEMENT_OFFER_MISMATCH");
    });

    it("ACWORLD Invariant 2 rejects invalid currency code and non-positive budget ceiling", () => {
      const auditor = new AcworldAuditor();
      const baseSession: ProcurementSession = {
        id: "sess_invalid_currency_budget",
        mandate: {
          id: "m_1",
          rawPrompt: "25 monitors",
          itemQuery: "monitors",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          requiredSpecs: [],
          currency: "INVALID", // Not 3-letter currency code
          createdAt: new Date().toISOString(),
          version: 1,
        },
        quotes: [],
        turns: [],
        selectedQuote: {
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-1",
          productTitle: "Monitor",
          initialUnitAsk: 340,
          currentUnitBid: 320,
          shippingCost: 100,
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
          shippingCost: 100,
        },
        preSettlementRoot: "c".repeat(64),
        status: "AUDIT_PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const certCurrency = auditor.audit({ session: baseSession });
      expect(certCurrency.passed).toBe(false);
      const inv2Currency = certCurrency.invariants.find((i) => i.name === "PRICE_CEILING")!;
      expect(inv2Currency.passed).toBe(false);
      expect(inv2Currency.code).toBe("INVALID_CURRENCY");

      // Now test non-positive budget
      baseSession.mandate.currency = "USD";
      baseSession.mandate.maxTotalBudget = -100;
      const certBudget = auditor.audit({ session: baseSession });
      expect(certBudget.passed).toBe(false);
      const inv2Budget = certBudget.invariants.find((i) => i.name === "PRICE_CEILING")!;
      expect(inv2Budget.passed).toBe(false);
      expect(inv2Budget.code).toBe("INVALID_BUDGET");
    });

    it("ACWORLD Invariant 3 rejects malformed merchant attestation structure", () => {
      const auditor = new AcworldAuditor();
      const session: ProcurementSession = {
        id: "sess_malformed_attestation",
        mandate: {
          id: "m_1",
          rawPrompt: "25 monitors",
          itemQuery: "monitors",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date().toISOString(),
          version: 1,
        },
        quotes: [],
        turns: [],
        selectedQuote: {
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-1",
          productTitle: "Monitor",
          initialUnitAsk: 340,
          currentUnitBid: 320,
          shippingCost: 100,
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
          shippingCost: 100,
        },
        merchantAttestation: {
          merchantUrl: "javascript:alert(1)", // Invalid non-http URL
          domSnapshotHash: "invalid_hash_not_64_chars",
          returnPolicyText: "   ", // Empty whitespace text
          timestamp: new Date().toISOString(),
        },
        preSettlementRoot: "d".repeat(64),
        status: "AUDIT_PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv3 = cert.invariants.find((i) => i.name === "RETURN_POLICY")!;
      expect(inv3.passed).toBe(false);
      expect(inv3.code).toBe("MALFORMED_ATTESTATION");
    });

    it("ACWORLD Invariant 5 strictly rejects flight recorder with agreement event for a different agreementId", () => {
      const auditor = new AcworldAuditor();
      const session: ProcurementSession = {
        id: "sess_cross_agreement_lineage",
        mandate: {
          id: "m_1",
          rawPrompt: "25 monitors",
          itemQuery: "monitors",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          requiredSpecs: [],
          currency: "USD",
          createdAt: new Date().toISOString(),
          version: 1,
        },
        quotes: [],
        turns: [],
        selectedQuote: {
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-1",
          productTitle: "Monitor",
          initialUnitAsk: 340,
          currentUnitBid: 320,
          shippingCost: 100,
          deliveryDays: 4,
          returnDays: 30,
          condition: "NEW",
          status: "ACCEPTED",
          dataSource: "MOCK_CATALOG",
        },
        finalOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 100,
        },
        agreementRecord: {
          agreementId: "agr_active_target",
          sessionId: "sess_cross_agreement_lineage",
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-1",
          agreedPrice: 320,
          agreedOffer: {
            unitPrice: 320,
            quantity: 25,
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 100,
          },
          totalCost: 320 * 25 + 100,
          agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          acceptingParty: "BUYER",
          acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          round: 2,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
        status: "AUDIT_PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Construct a flight recorder that contains an AGREEMENT_CREATED event for a DIFFERENT agreement
      const recorder = new CryptographicFlightRecorder(session.id);
      recorder.recordEvent("MANDATE_CREATED", { mandateId: "m_1" });
      recorder.recordEvent("AGREEMENT_CREATED", { agreementId: "agr_FOREIGN_OLD" }, { agreementId: "agr_FOREIGN_OLD" });

      session.flightRecord = recorder.exportFlightRecord();
      session.preSettlementRoot = recorder.getRootHash();

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv5 = cert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE")!;
      expect(inv5.passed).toBe(false);
      expect(inv5.code).toBe("MISSING_AGREEMENT_EVENT");
    });
  });

  // =========================================================================
  // 5. PHASE 4.2: MERKLE EMPTY-TREE AND STRUCTURAL PROOF SOUNDNESS
  // =========================================================================
  describe("5. Phase 4.2: Merkle Empty-Tree and Structural Proof Soundness", () => {
    it("rejects authentication of any leaf against EMPTY_TREE_ROOT", () => {
      const arbitraryLeaf = crypto.randomBytes(32).toString("hex");
      // Empty proof path against EMPTY_TREE_ROOT
      expect(verifyProof(arbitraryLeaf, [], EMPTY_TREE_ROOT)).toBe(false);
      expect(
        verifyInclusionProof({
          leafIndex: 0,
          leafHash: arbitraryLeaf,
          proof: [],
          rootHash: EMPTY_TREE_ROOT,
          treeSize: 0,
        })
      ).toBe(false);
    });

    it("enforces that an empty proof path is ONLY valid for index 0 in a 1-leaf tree", () => {
      const singleLeaf = crypto.randomBytes(32).toString("hex");
      // Valid 1-leaf proof: index 0, treeSize 1, leafHash === rootHash
      expect(
        verifyProof(singleLeaf, [], singleLeaf, { leafIndex: 0, treeSize: 1 })
      ).toBe(true);

      // Invalid: empty proof with leafIndex 1
      expect(
        verifyProof(singleLeaf, [], singleLeaf, { leafIndex: 1, treeSize: 1 })
      ).toBe(false);

      // Invalid: empty proof for tree with 2 leaves
      expect(
        verifyProof(singleLeaf, [], singleLeaf, { leafIndex: 0, treeSize: 2 })
      ).toBe(false);

      // Invalid: empty proof against empty tree sentinel root
      expect(
        verifyProof(EMPTY_TREE_ROOT, [], EMPTY_TREE_ROOT, { leafIndex: 0, treeSize: 1 })
      ).toBe(false);
    });

    it("verifies sound inclusion proofs for trees of size 1, 2, 3, 5, and 8 leaves", () => {
      const leafCounts = [1, 2, 3, 5, 8];

      for (const count of leafCounts) {
        const tree = new VeriPayMerkleTree();
        for (let i = 0; i < count; i++) {
          tree.addEvent("BUYER_PROPOSAL", { index: i, nonce: `nonce_${count}_${i}` }, `2026-10-27T00:00:0${i}Z`);
        }

        const root = tree.getRootHash();
        expect(root).toMatch(/^[0-9a-fA-F]{64}$/);
        expect(root).not.toBe(EMPTY_TREE_ROOT);

        for (let i = 0; i < count; i++) {
          const proof = tree.generateInclusionProof(i);
          expect(proof.leafIndex).toBe(i);
          expect(proof.treeSize).toBe(count);

          // Authentic proof verifies
          expect(verifyInclusionProof(proof)).toBe(true);
          expect(
            verifyProof(proof.leafHash, proof.proof, root, {
              leafIndex: i,
              treeSize: count,
            })
          ).toBe(true);

          // Altered leaf hash fails
          const alteredLeaf = crypto.randomBytes(32).toString("hex");
          expect(
            verifyProof(alteredLeaf, proof.proof, root, {
              leafIndex: i,
              treeSize: count,
            })
          ).toBe(false);

          // Altered root fails
          const alteredRoot = crypto.randomBytes(32).toString("hex");
          expect(
            verifyProof(proof.leafHash, proof.proof, alteredRoot, {
              leafIndex: i,
              treeSize: count,
            })
          ).toBe(false);

          // If multi-step proof, corrupted step or direction fails
          if (proof.proof.length > 0) {
            const tamperedSteps = JSON.parse(JSON.stringify(proof.proof));
            tamperedSteps[0].position = tamperedSteps[0].position === "left" ? "right" : "left";
            expect(
              verifyProof(proof.leafHash, tamperedSteps, root, {
                leafIndex: i,
                treeSize: count,
              })
            ).toBe(false);
          }
        }
      }
    });
  });

  // =========================================================================
  // 6. PHASE 4.2: FLIGHT RECORDER EVENT-CHAIN & PAYLOAD BOUNDARY HARDENING
  // =========================================================================
  describe("6. Phase 4.2: Flight Recorder Boundary & Payload Hardening", () => {
    it("rejects non-finite numbers (NaN, Infinity) and circular payloads without corrupting chain", () => {
      const recorder = new CryptographicFlightRecorder("sess_boundary_test");

      expect(() =>
        recorder.recordEvent("MANDATE_CREATED", { item: "Monitors", budget: NaN })
      ).toThrow(/Invalid non-finite number/);

      expect(() =>
        recorder.recordEvent("MANDATE_CREATED", { item: "Monitors", budget: Infinity })
      ).toThrow(/Invalid non-finite number/);

      expect(() =>
        recorder.recordEvent("MANDATE_CREATED", { item: "Monitors", budget: -Infinity })
      ).toThrow(/Invalid non-finite number/);

      const circular: Record<string, unknown> = { key: "value" };
      circular.loop = circular;
      expect(() =>
        recorder.recordEvent("MANDATE_CREATED", circular)
      ).toThrow();

      // Ensure no corrupt events were committed
      expect(recorder.getEvents().length).toBe(0);
      expect(recorder.getRootHash()).toBe(EMPTY_TREE_ROOT);
    });

    it("returns structured failure MALFORMED_EVENT when malformed events are verified", () => {
      const malformedEvents = [
        null as unknown as FlightRecorderEvent,
        { eventId: "", eventType: "MANDATE_CREATED" } as unknown as FlightRecorderEvent,
        {
          eventId: "ev_1",
          eventType: "MANDATE_CREATED",
          sessionId: "sess_malformed",
          sequenceNumber: 0,
          timestamp: "2026-10-27T00:00:00Z",
          previousEventHash: "0".repeat(64),
          // Missing publicPayload
        } as unknown as FlightRecorderEvent,
      ];

      const result = verifyFlightRecorderChain(malformedEvents, "sess_malformed");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("MALFORMED_EVENT");
    });

    it("rejects deserialization in fromSerialized if lastEventHash or rootHash is tampered", () => {
      const recorder = new CryptographicFlightRecorder("sess_deser_test");
      recorder.recordEvent("MANDATE_CREATED", { mandateId: "m1" });
      recorder.recordEvent("SOURCING_COMPLETED", { quoteCount: 1 });

      const exported = recorder.exportFlightRecord();

      // Tampered lastEventHash
      const tamperedRecord1 = { ...exported, lastEventHash: "f".repeat(64) };
      expect(() => CryptographicFlightRecorder.fromSerialized(tamperedRecord1)).toThrow(
        /lastEventHash mismatch/
      );

      // Tampered rootHash
      const tamperedRecord2 = { ...exported, rootHash: "e".repeat(64) };
      expect(() => CryptographicFlightRecorder.fromSerialized(tamperedRecord2)).toThrow(
        /integrity verification failed/
      );
    });
  });

  // =========================================================================
  // 7. PHASE 4.2: ACWORLD AGREEMENT BINDING & VENDOR INVARIANTS
  // =========================================================================
  describe("7. Phase 4.2: ACWORLD Agreement Binding & Vendor Invariants", () => {
    const auditor = new AcworldAuditor();

    function createValidBaseSession(): ProcurementSession {
      return {
        id: "sess_agreement_binding_test",
        quotes: [],
        turns: [],
        mandate: {
          id: "m_1",
          rawPrompt: "25 4K monitors",
          itemQuery: "4K USB-C Monitor",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          currency: "USD",
          requiredSpecs: [],
          version: 1,
          createdAt: new Date().toISOString(),
        },
        selectedQuote: {
          vendorId: "v_tech",
          vendorName: "TechWholesale Direct",
          sku: "DELL-U2723QE-4K",
          productTitle: "Dell UltraSharp 27 4K",
          initialUnitAsk: 340,
          currentUnitBid: 320,
          shippingCost: 100,
          deliveryDays: 4,
          returnDays: 30,
          condition: "NEW",
          status: "ACCEPTED",
          dataSource: "MOCK_CATALOG",
        },
        finalOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 100,
        },
        agreementRecord: {
          agreementId: "agr_test_binding_1",
          sessionId: "sess_agreement_binding_test",
          vendorId: "v_tech",
          vendorName: "TechWholesale Direct",
          sku: "DELL-U2723QE-4K",
          agreedPrice: 320,
          agreedOffer: {
            unitPrice: 320,
            quantity: 25,
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 100,
          },
          totalCost: 320 * 25 + 100,
          agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          acceptingParty: "BUYER",
          acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          round: 2,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
        preSettlementRoot: "a".repeat(64),
        status: "AUDIT_PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    it("rejects agreement if vendorName does not match selectedQuote.vendorName", () => {
      const session = createValidBaseSession();
      session.agreementRecord!.vendorName = "Impostor Hardware Supplier LLC";

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("VENDOR_MISMATCH");
      expect(inv1.reason).toContain("vendor name mismatch");
    });

    it("rejects agreement if agreedOffer shipping cost diverges from finalOffer", () => {
      const session = createValidBaseSession();
      session.agreementRecord!.agreedOffer.shippingCost = 450; // Divergence

      const cert = auditor.audit({ session });
      expect(cert.passed).toBe(false);
      const inv1 = cert.invariants.find((i) => i.name === "SKU_INTEGRITY")!;
      expect(inv1.passed).toBe(false);
      expect(inv1.code).toBe("AGREEMENT_OFFER_MISMATCH");
    });

    it("strictly prevents client-supplied passing certificate from bypassing server-side audit in SettlementService", async () => {
      const session = createValidBaseSession();
      // Mandate budget violated
      session.mandate.maxTotalBudget = 5000; // Final offer total is 8100, which exceeds 5000
      // Attacker attempts to inject passing certificate into session state
      session.auditCertificate = {
        certificateId: "cert_forged_bypass",
        sessionId: session.id,
        passed: true,
        invariants: [],
        verifiedRoot: session.preSettlementRoot!,
        timestamp: new Date().toISOString(),
      };
      session.paypalOrderId = "ORDER_MOCK_TEST_GATE";

      sessionStore.saveSession(session);

      const mockPayPalClient = {
        getOrder: vi.fn().mockResolvedValue({
          id: "ORDER_MOCK_TEST_GATE",
          status: "APPROVED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { value: "8100.00", currency_code: "USD" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        }),
        authorizeOrder: vi.fn().mockResolvedValue({ authorizationId: "AUTH_MOCK_123" }),
        capturePayment: vi.fn(),
      } as unknown as PayPalClient;

      const settlement = new SettlementService({ paypalClient: mockPayPalClient });
      const result = await settlement.completeSettlement({ sessionId: session.id });

      expect(result.success).toBe(false);
      expect(result.blockedAtGate).toBe(true);
      expect(result.error).toContain("ACWORLD Audit Gate Failed");
      expect(result.auditCertificate.passed).toBe(false);
      // Capture must never have been called!
      expect(vi.mocked(mockPayPalClient.capturePayment)).not.toHaveBeenCalled();

      const saved = sessionStore.getSession(session.id);
      expect(saved?.status).toBe("AUDIT_FAILED");
    });
  });

  // =========================================================================
  // 8. PHASE 4.2: AUDITCERTIFICATE CRYPTOGRAPHIC FRESHNESS & AUTHENTICITY
  // =========================================================================
  describe("8. Phase 4.2: AuditCertificate Cryptographic Freshness & Authenticity", () => {
    const auditor = new AcworldAuditor();

    function createValidAuditedSession(): { session: ProcurementSession; cert: AuditCertificate } {
      const session: ProcurementSession = {
        id: "sess_cert_freshness_test",
        quotes: [],
        turns: [],
        mandate: {
          id: "m_fresh",
          rawPrompt: "25 4K monitors",
          itemQuery: "4K USB-C Monitor",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          currency: "USD",
          requiredSpecs: [],
          version: 1,
          createdAt: new Date().toISOString(),
        },
        selectedQuote: {
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-MON-1",
          productTitle: "4K Monitor",
          initialUnitAsk: 340,
          currentUnitBid: 320,
          shippingCost: 100,
          deliveryDays: 4,
          returnDays: 30,
          condition: "NEW",
          status: "ACCEPTED",
          dataSource: "MOCK_CATALOG",
        },
        finalOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 100,
        },
        agreementRecord: {
          agreementId: "agr_fresh_1",
          sessionId: "sess_cert_freshness_test",
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-MON-1",
          agreedPrice: 320,
          agreedOffer: {
            unitPrice: 320,
            quantity: 25,
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 100,
          },
          totalCost: 8100,
          agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          acceptingParty: "BUYER",
          acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          round: 1,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
        preSettlementRoot: "b".repeat(64),
        status: "AUDIT_PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cert = auditor.audit({ session });
      return { session, cert };
    }

    it("verifies authentic certificate with matching certificateHash", () => {
      const { session, cert } = createValidAuditedSession();
      expect(cert.passed).toBe(true);
      expect(cert.certificateHash).toBeDefined();
      expect(cert.certificateHash).toBe(computeCertificateHash(cert));

      const verification = AcworldAuditor.verifyCertificateFreshness(
        cert,
        session,
        session.preSettlementRoot
      );
      expect(verification.valid).toBe(true);
      expect(verification.reason).toBeUndefined();
    });

    it("rejects certificate if any field is tampered (certificateHash mismatch)", () => {
      const { session, cert } = createValidAuditedSession();

      // Tamper with orderReference
      const tamperedCert: AuditCertificate = {
        ...cert,
        orderReference: "ORDER_INJECTED_FORGERY",
      };

      const verification = AcworldAuditor.verifyCertificateFreshness(
        tamperedCert,
        session,
        session.preSettlementRoot
      );
      expect(verification.valid).toBe(false);
      expect(verification.errorCode).toBe("CERTIFICATE_HASH_MISMATCH");
    });

    it("rejects cross-session certificate injection", () => {
      const { session, cert } = createValidAuditedSession();
      const foreignSession: ProcurementSession = { ...session, id: "sess_OTHER_DIFFERENT" };

      const verification = AcworldAuditor.verifyCertificateFreshness(cert, foreignSession);
      expect(verification.valid).toBe(false);
      expect(verification.errorCode).toBe("SESSION_MISMATCH");
    });

    it("rejects certificate from an older mandate revision", () => {
      const { session, cert } = createValidAuditedSession();
      // Mandate has been revised to version 2
      session.mandate.version = 2;

      const verification = AcworldAuditor.verifyCertificateFreshness(cert, session);
      expect(verification.valid).toBe(false);
      expect(verification.errorCode).toBe("STALE_MANDATE_VERSION");
    });

    it("rejects certificate bound to a different evidence root", () => {
      const { session, cert } = createValidAuditedSession();
      const expectedNewRoot = "c".repeat(64);

      const verification = AcworldAuditor.verifyCertificateFreshness(cert, session, expectedNewRoot);
      expect(verification.valid).toBe(false);
      expect(verification.errorCode).toBe("ROOT_MISMATCH");
    });
  });

  // =========================================================================
  // 9. PHASE 4.2: PAYPAL CAPTURE GATE CONCURRENCY & UNCERTAIN OUTCOMES
  // =========================================================================
  describe("9. Phase 4.2: PayPal Capture Gate Concurrency & Reconciliation", () => {
    function setupReadySession(sessionId = "sess_gate_concurrency"): ProcurementSession {
      const session: ProcurementSession = {
        id: sessionId,
        quotes: [],
        turns: [],
        mandate: {
          id: "m_ready",
          rawPrompt: "25 4K monitors",
          itemQuery: "4K USB-C Monitor",
          quantity: 25,
          maxTotalBudget: 8500,
          maxDeliveryDays: 5,
          minReturnDays: 30,
          currency: "USD",
          requiredSpecs: [],
          version: 1,
          createdAt: new Date().toISOString(),
        },
        selectedQuote: {
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-MON-1",
          productTitle: "4K Monitor",
          initialUnitAsk: 340,
          currentUnitBid: 320,
          shippingCost: 100,
          deliveryDays: 4,
          returnDays: 30,
          condition: "NEW",
          status: "ACCEPTED",
          dataSource: "MOCK_CATALOG",
        },
        finalOffer: {
          unitPrice: 320,
          quantity: 25,
          deliveryDays: 4,
          returnDays: 30,
          shippingCost: 100,
        },
        agreementRecord: {
          agreementId: "agr_ready_1",
          sessionId,
          vendorId: "v_1",
          vendorName: "Vendor 1",
          sku: "SKU-MON-1",
          agreedPrice: 320,
          agreedOffer: {
            unitPrice: 320,
            quantity: 25,
            deliveryDays: 4,
            returnDays: 30,
            shippingCost: 100,
          },
          totalCost: 8100,
          agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          acceptingParty: "BUYER",
          acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
          round: 1,
          acceptedAt: new Date().toISOString(),
          mandateVersion: 1,
        },
        preSettlementRoot: "d".repeat(64),
        paypalOrderId: `ORDER_${sessionId}`,
        status: "PAYPAL_AUTHORIZED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessionStore.saveSession(session);
      return session;
    }

    it("blocks concurrent capture requests via sessionStore locking", async () => {
      const session = setupReadySession("sess_concurrent_race");

      const mockPayPalClient = {
        getOrder: vi.fn().mockImplementation(async () => {
          // Delay to simulate network flight time
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            id: session.paypalOrderId,
            status: "APPROVED",
            intent: "AUTHORIZE",
            purchase_units: [
              {
                amount: { value: "8100.00", currency_code: "USD" },
                custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
              },
            ],
          };
        }),
        authorizeOrder: vi.fn().mockResolvedValue({ authorizationId: "AUTH_MOCK_CONCURRENCY" }),
        capturePayment: vi.fn().mockResolvedValue({ id: "CAPTURE_CONCURRENCY_1", status: "COMPLETED", amount: { currency_code: "USD", value: "8100.00" } }),
        createNegotiatedInvoice: vi.fn().mockResolvedValue({ invoiceId: "INV_123", status: "SENT" }),
        createDraftInvoice: vi.fn().mockResolvedValue({ invoiceId: "INV_123" }),
        sendInvoice: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as PayPalClient;

      const service = new SettlementService({ paypalClient: mockPayPalClient });

      // Run two settlement calls simultaneously
      const [res1, res2] = await Promise.all([
        service.completeSettlement({ sessionId: session.id }),
        service.completeSettlement({ sessionId: session.id }),
      ]);

      // Exactly one succeeds and one is blocked at the gate by the concurrency lock
      const succeeded = [res1, res2].filter((r) => r.success);
      const blocked = [res1, res2].filter((r) => r.blockedAtGate);

      expect(succeeded.length).toBe(1);
      expect(blocked.length).toBe(1);
      expect(blocked[0].error).toContain("Settlement capture is already executing");
      // PayPal capture was called only once
      expect(vi.mocked(mockPayPalClient.capturePayment)).toHaveBeenCalledTimes(1);
    });

    it("rejects unauthorized client orderId substitution attempt", async () => {
      const session = setupReadySession("sess_order_injection");

      const service = new SettlementService();
      const result = await service.completeSettlement({
        sessionId: session.id,
        orderId: "ORDER_INJECTED_ATTACK", // Does not match session.paypalOrderId
      });

      expect(result.success).toBe(false);
      expect(result.blockedAtGate).toBe(true);
      expect(result.error).toContain("Client order injection rejected");
    });

    it("transitions to CAPTURE_PENDING_RECONCILIATION on timeout, blocks blind retries, and reconciles via PayPal API", async () => {
      const session = setupReadySession("sess_timeout_reconcile");

      const mockPayPalClient = {
        getOrder: vi.fn().mockResolvedValue({
          id: session.paypalOrderId,
          status: "APPROVED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { value: "8100.00", currency_code: "USD" },
              custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            },
          ],
        }),
        authorizeOrder: vi.fn().mockResolvedValue({ authorizationId: "AUTH_TIMEOUT_1" }),
        capturePayment: vi.fn().mockRejectedValue(new Error("ETIMEDOUT: Connection timeout during capture")),
      } as unknown as PayPalClient;

      const service = new SettlementService({ paypalClient: mockPayPalClient });

      // 1. Initial attempt times out
      const timeoutRes = await service.completeSettlement({ sessionId: session.id });
      expect(timeoutRes.success).toBe(false);
      expect(timeoutRes.uncertain).toBe(true);

      const saved = sessionStore.getSession(session.id)!;
      expect(saved.status).toBe("CAPTURE_PENDING_RECONCILIATION");

      // 2. Blind capture retry is immediately blocked
      const retryRes = await service.completeSettlement({ sessionId: session.id });
      expect(retryRes.success).toBe(false);
      expect(retryRes.blockedAtGate).toBe(true);
      expect(retryRes.error).toContain("Blind capture retry is blocked");

      // 3. Authoritative reconciliation queries remote PayPal API
      mockPayPalClient.getOrder = vi.fn().mockResolvedValue({
        id: session.paypalOrderId,
        status: "COMPLETED",
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: { value: "8100.00", currency_code: "USD" },
            custom_id: `VERIPAY_ROOT:${session.preSettlementRoot};SESSION:${session.id}`,
            payments: {
              captures: [{ id: "REMOTE_CONFIRMED_CAP_1", status: "COMPLETED", amount: { currency_code: "USD", value: "8100.00" } }],
            },
          },
        ],
      });

      const reconcileRes = await service.reconcileSettlement({ sessionId: session.id });
      expect(reconcileRes.success).toBe(true);
      expect(reconcileRes.reconciled).toBe(true);
      expect(reconcileRes.status).toBe("PAYPAL_CAPTURED");
      expect(reconcileRes.captureId).toBe("REMOTE_CONFIRMED_CAP_1");
    });
  });

  // =========================================================================
  // 10. PHASE 4.2: PRE-SETTLEMENT VS POST-SETTLEMENT LINEAGE RECOMPUTATION
  // =========================================================================
  describe("10. Phase 4.2: Pre-Settlement vs Post-Settlement Lineage Recomputation", () => {
    it("independently recomputes pre-settlement root and verifies post-settlement events extend history without altering pre-settlement commitment", () => {
      const sessionId = "sess_pre_post_root_lineage";
      const recorder = new CryptographicFlightRecorder(sessionId);

      // Pre-settlement events
      recorder.recordEvent("MANDATE_CREATED", { mandateId: "m1", quantity: 25, budget: 8500 });
      recorder.recordEvent("SOURCING_COMPLETED", { quoteCount: 3 });
      recorder.recordEvent("KERNEL_DOM_ATTESTATION", { merchantUrl: "https://vendor.com", domHash: "1".repeat(64) });
      recorder.recordEvent("BUYER_PROPOSAL", { unitPrice: 320, quantity: 25 });
      recorder.recordEvent("AGREEMENT_CREATED", { agreementId: "agr_lineage_1", price: 320, total: 8100 });

      // Compute and capture pre-settlement commitment
      const preSettlementRoot = recorder.getRootHash();
      expect(preSettlementRoot).toMatch(/^[0-9a-fA-F]{64}$/);

      // Independent recomputation from the sliced pre-settlement events
      const independentPreTree = new VeriPayMerkleTree();
      for (const ev of recorder.getEvents()) {
        const evData: Record<string, unknown> = { ...ev };
        delete evData.leafHash;
        independentPreTree.addEvent(ev.eventType, evData, ev.timestamp);
      }
      expect(independentPreTree.getRootHash()).toBe(preSettlementRoot);

      // Post-settlement events appended
      recorder.recordEvent("ACWORLD_AUDIT_PASSED", { certificateId: "cert_lineage_1", passed: true });
      recorder.recordEvent("SETTLEMENT_COMPLETED", { captureId: "cap_lineage_1", status: "SETTLED" });

      const postSettlementRoot = recorder.getRootHash();
      expect(postSettlementRoot).toMatch(/^[0-9a-fA-F]{64}$/);
      expect(postSettlementRoot).not.toBe(preSettlementRoot);

      // Pre-settlement commitment remains valid and immutable
      expect(independentPreTree.getRootHash()).toBe(preSettlementRoot);

      // Slicing the full chain verifies integrity of both segments
      const fullIntegrity = recorder.verifyIntegrity(postSettlementRoot);
      expect(fullIntegrity.valid).toBe(true);

      // Passing postSettlementRoot where preSettlementRoot is expected is strictly detected
      const badRootIntegrity = recorder.verifyIntegrity(preSettlementRoot);
      expect(badRootIntegrity.valid).toBe(false);
      expect(badRootIntegrity.errorCode).toBe("EXPECTED_ROOT_MISMATCH");
    });
  });
});

