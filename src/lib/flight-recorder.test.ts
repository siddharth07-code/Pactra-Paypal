import { describe, it, expect } from "vitest";
import {
  CryptographicFlightRecorder,
  GENESIS_PREVIOUS_HASH,
} from "./flight-recorder";
import { canonicalJson } from "./veripay-merkle";

describe("CryptographicFlightRecorder Unit Tests", () => {
  it("initializes with genesis hash and computes empty tree root as 64 zeros", () => {
    const recorder = new CryptographicFlightRecorder("session-test-init");
    expect(recorder.getSessionId()).toBe("session-test-init");
    expect(recorder.getEventCount()).toBe(0);
    expect(recorder.getRootHash()).toBe("0".repeat(64));
    expect(recorder.verifyIntegrity().valid).toBe(true);
  });

  it("records events with strictly consecutive sequence numbers and hash chain linkage", () => {
    const recorder = new CryptographicFlightRecorder("session-test-seq");

    const e0 = recorder.recordEvent("MANDATE_CREATED", {
      item: "4K Monitors",
      quantity: 25,
      budget: 8500,
    });
    expect(e0.event.sequenceNumber).toBe(0);
    expect(e0.event.previousEventHash).toBe(GENESIS_PREVIOUS_HASH);

    const e1 = recorder.recordEvent("SOURCING_COMPLETED", {
      supplierCount: 3,
      topSku: "DELL-U2723QE",
    });
    expect(e1.event.sequenceNumber).toBe(1);
    expect(e1.event.previousEventHash).not.toBe(GENESIS_PREVIOUS_HASH);

    const e2 = recorder.recordEvent("AGREEMENT_CREATED", {
      agreedPrice: 315,
      totalCost: 7975,
    });
    expect(e2.event.sequenceNumber).toBe(2);

    expect(recorder.getEventCount()).toBe(3);
    const integrity = recorder.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.verifiedEvents).toBe(3);
  });

  it("produces deterministic canonical serialization regardless of object key insertion order", () => {
    const objA = { z: 1, a: "test", m: { beta: 2, alpha: 1 } };
    const objB = { a: "test", m: { alpha: 1, beta: 2 }, z: 1 };

    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":"test","m":{"alpha":1,"beta":2},"z":1}');
  });

  it("rejects non-finite numbers in public payloads to safeguard numerical integrity", () => {
    const recorder = new CryptographicFlightRecorder("session-test-nan");

    expect(() => {
      recorder.recordEvent("BUYER_PROPOSAL", {
        price: NaN,
      });
    }).toThrow(/Invalid non-finite number/);

    expect(() => {
      recorder.recordEvent("BUYER_PROPOSAL", {
        price: Infinity,
      });
    }).toThrow(/Invalid non-finite number/);
  });

  it("generates and verifies valid cryptographic Merkle inclusion proofs for all leaves", () => {
    const recorder = new CryptographicFlightRecorder("session-test-proofs");

    recorder.recordEvent("MANDATE_CREATED", { id: "m1" });
    recorder.recordEvent("SOURCING_COMPLETED", { id: "s1" });
    recorder.recordEvent("BUYER_PROPOSAL", { id: "p1" });
    recorder.recordEvent("VENDOR_COUNTEROFFER", { id: "c1" });
    recorder.recordEvent("AGREEMENT_CREATED", { id: "a1" }); // Odd leaf count: 5 leaves

    const root = recorder.getRootHash();
    expect(root).toMatch(/^[0-9a-fA-F]{64}$/);

    // Verify inclusion proofs for all 5 leaves
    for (let i = 0; i < 5; i++) {
      const proof = recorder.generateInclusionProof(i);
      expect(proof.leafIndex).toBe(i);
      expect(proof.rootHash).toBe(root);

      const isValid = recorder.verifyEventInclusion(i, proof);
      expect(isValid).toBe(true);
    }
  });

  it("detects and rejects tampered event payload during integrity verification", () => {
    const recorder = new CryptographicFlightRecorder("session-test-tamper");

    recorder.recordEvent("MANDATE_CREATED", { budget: 8500 });
    recorder.recordEvent("AGREEMENT_CREATED", { agreedPrice: 300 });

    const exported = recorder.exportFlightRecord();

    // Adversary tampers with the agreed price in the payload
    exported.events[1].publicPayload.agreedPrice = 250;

    expect(() => {
      CryptographicFlightRecorder.fromSerialized(exported);
    }).toThrow(/Payload hash mismatch|integrity verification failed/);
  });

  it("detects and rejects removed event from sequence", () => {
    const recorder = new CryptographicFlightRecorder("session-test-remove");

    recorder.recordEvent("MANDATE_CREATED", { budget: 8500 });
    recorder.recordEvent("BUYER_PROPOSAL", { price: 280 });
    recorder.recordEvent("AGREEMENT_CREATED", { agreedPrice: 300 });

    const exported = recorder.exportFlightRecord();

    // Adversary deletes the middle event
    exported.events.splice(1, 1);

    expect(() => {
      CryptographicFlightRecorder.fromSerialized(exported);
    }).toThrow(/Sequence discontinuity|Hash chain broken|integrity verification failed/);
  });

  it("detects and rejects reordered events", () => {
    const recorder = new CryptographicFlightRecorder("session-test-reorder");

    recorder.recordEvent("MANDATE_CREATED", { budget: 8500 });
    recorder.recordEvent("BUYER_PROPOSAL", { price: 280 });

    const exported = recorder.exportFlightRecord();

    // Adversary swaps events 0 and 1
    const temp = exported.events[0];
    exported.events[0] = exported.events[1];
    exported.events[1] = temp;

    expect(() => {
      CryptographicFlightRecorder.fromSerialized(exported);
    }).toThrow(/Sequence discontinuity|Hash chain broken|integrity verification failed/);
  });

  it("rejects proof verification when substituting a foreign session's root", () => {
    const recorderA = new CryptographicFlightRecorder("session-A");
    recorderA.recordEvent("MANDATE_CREATED", { budget: 8500 });
    recorderA.recordEvent("AGREEMENT_CREATED", { agreedPrice: 300 });

    const recorderB = new CryptographicFlightRecorder("session-B");
    recorderB.recordEvent("MANDATE_CREATED", { budget: 5000 });
    recorderB.recordEvent("AGREEMENT_CREATED", { agreedPrice: 200 });

    const proofA = recorderA.generateInclusionProof(1);
    const rootB = recorderB.getRootHash();

    // Attempting to verify Event A against Root B must fail
    const substituted = recorderA.verifyEventInclusion(1, proofA, rootB);
    expect(substituted).toBe(false);
  });

  it("supports round-trip export and import without loss of integrity", () => {
    const recorder = new CryptographicFlightRecorder("session-roundtrip");
    recorder.recordEvent("MANDATE_CREATED", { budget: 8500 });
    recorder.recordEvent("SOURCING_COMPLETED", { quotes: 3 });
    recorder.recordEvent("ACWORLD_AUDIT_PASSED", { certId: "cert-1" });

    const exported = recorder.exportFlightRecord();
    const imported = CryptographicFlightRecorder.fromSerialized(exported);

    expect(imported.getSessionId()).toBe("session-roundtrip");
    expect(imported.getEventCount()).toBe(3);
    expect(imported.getRootHash()).toBe(recorder.getRootHash());
    expect(imported.verifyIntegrity().valid).toBe(true);
  });
});
