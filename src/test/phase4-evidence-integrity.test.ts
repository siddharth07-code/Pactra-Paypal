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
} from "../lib/veripay-merkle";
import { AcworldAuditor } from "../lib/acworld-auditor";
import { SettlementService } from "../lib/settlement-service";
import { sessionStore } from "../lib/session-store";
import type { PayPalClient } from "../lib/paypal-client";
import type {
  ProcurementSession,
  FlightRecorderEvent,
  FlightRecorderEventType,
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
      expect(recon.status).toBe("PAYPAL_AUTHORIZED");
      expect(recon.reconciled).toBe(true);
      expect(sessionStore.getSession("sess_reconcile_unconfirmed")!.status).toBe("PAYPAL_AUTHORIZED");
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
          status: "COMPLETED",
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: "8150.00" },
              custom_id: `VERIPAY_ROOT:${authoritativePreRoot};SESSION:${session.id}`,
            },
          ],
        }),
        capturePayment: vi.fn().mockResolvedValue({
          id: "cap_successful_123",
          status: "COMPLETED",
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
});
