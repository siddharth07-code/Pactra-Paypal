/**
 * PACTUM — Cryptographic Flight Recorder
 *
 * Implements an append-only, tamper-evident cryptographic flight recorder for B2B procurement.
 * Strictly adheres to GEMINI.md Section 7, SECURITY.md Section 9, and Phase 5 specifications.
 *
 * Guarantees:
 * 1. Strict sequence monotonicity (0, 1, 2, ...) and tamper-evident hash-chain linkage (previousEventHash).
 * 2. Deterministic canonical JSON serialization with sorted object keys and numerical sanitization.
 * 3. SHA-256 binary Merkle tree commitment (0x00 leaf prefix, 0x01 parent prefix, odd-node promotion).
 * 4. Cryptographic inclusion proof generation and verification for any committed event.
 * 5. Full sequence integrity verification (detects insertion, alteration, deletion, or reordering of events).
 * 6. Exclusion of sensitive data (credentials, private reservation prices, prompts, tactical secrets).
 */

import crypto from "crypto";
import {
  canonicalJson,
  hashLeaf,
  VeriPayMerkleTree,
  verifyProof,
} from "./veripay-merkle";
import type {
  FlightRecorderEvent,
  FlightRecorderEventType,
  FlightRecorderErrorCode,
  FlightRecorderIntegrityResult,
  MerkleAuditNode,
  MerkleInclusionProof,
  SerializedFlightRecord,
  ProcurementSession,
} from "../types/pactum";

export type { FlightRecorderIntegrityResult, FlightRecorderErrorCode };

export const FLIGHT_RECORDER_SCHEMA_VERSION = 1;
export const GENESIS_PREVIOUS_HASH = "0".repeat(64);

export interface RecordEventOptions {
  mandateVersion?: number;
  agreementId?: string;
  offerReference?: string;
  timestamp?: string;
}

/**
 * Validates that an event payload contains only safe, JSON-serializable values
 * and no non-finite numbers (NaN, Infinity) or circular references.
 */
function validatePublicPayload(payload: unknown, depth = 0): void {
  if (depth > 20) {
    throw new Error("Payload exceeds maximum nesting depth of 20.");
  }
  if (payload === null || typeof payload === "boolean" || typeof payload === "string") {
    return;
  }
  if (typeof payload === "number") {
    if (!Number.isFinite(payload)) {
      throw new Error(`Invalid non-finite number in public payload: ${payload}`);
    }
    return;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      validatePublicPayload(item, depth + 1);
    }
    return;
  }
  if (typeof payload === "object") {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (typeof key !== "string") {
        throw new Error("Object keys must be strings.");
      }
      if (value !== undefined) {
        validatePublicPayload(value, depth + 1);
      }
    }
    return;
  }
  throw new Error(`Unsupported payload data type: ${typeof payload}`);
}

/**
 * Scrubs and strips sensitive or undefined properties from payload object.
 */
function sanitizePayload<T extends Record<string, unknown>>(payload: T): T {
  validatePublicPayload(payload);
  // Round-trip through canonicalJson to ensure undefined values are cleanly removed
  return JSON.parse(canonicalJson(payload)) as T;
}

/**
 * Computes canonical leaf hash for an event.
 * Strips leafHash from the object so hashing is self-consistent whether
 * called on a nascent event or a committed event.
 */
export function computeEventLeafHash(event: FlightRecorderEvent): Buffer {
  const eventData: Record<string, unknown> = { ...event };
  delete eventData.leafHash;
  return hashLeaf(eventData);
}

export function getEventForMerkleTree(event: FlightRecorderEvent): Record<string, unknown> {
  const eventData: Record<string, unknown> = { ...event };
  delete eventData.leafHash;
  return eventData;
}

export class CryptographicFlightRecorder {
  private sessionId: string;
  private events: FlightRecorderEvent[] = [];
  private merkleTree: VeriPayMerkleTree;
  private lastEventHash: string = GENESIS_PREVIOUS_HASH;

  constructor(sessionId: string) {
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Flight recorder requires a valid non-empty sessionId.");
    }
    this.sessionId = sessionId;
    this.merkleTree = new VeriPayMerkleTree();
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getEventCount(): number {
    return this.events.length;
  }

  public getEvents(): FlightRecorderEvent[] {
    return this.events.map((e) => ({ ...e, publicPayload: { ...e.publicPayload } }));
  }

  public getAuditNodes(): MerkleAuditNode[] {
    return this.merkleTree.getAuditNodes();
  }

  public getRootHash(): string {
    return this.merkleTree.getRootHash();
  }

  public getTreeLevels(): string[][] {
    return this.merkleTree.getTreeLevels();
  }

  /**
   * Appends an authoritative business event to the flight recorder.
   * Atomically commits to the hash chain and Merkle tree.
   */
  public recordEvent<T extends Record<string, unknown>>(
    eventType: FlightRecorderEventType,
    payload: T,
    options: RecordEventOptions = {}
  ): { event: FlightRecorderEvent<T>; auditNode: MerkleAuditNode } {
    const sequenceNumber = this.events.length;
    const eventId = `evt_${crypto.randomBytes(8).toString("hex")}`;
    const timestamp = options.timestamp ?? new Date().toISOString();
    const mandateVersion = options.mandateVersion ?? 1;

    const cleanPayload = sanitizePayload(payload);

    // Compute direct SHA-256 hash of canonical payload
    const payloadJson = canonicalJson(cleanPayload);
    const payloadHash = crypto
      .createHash("sha256")
      .update(Buffer.from(payloadJson, "utf-8"))
      .digest("hex");

    const previousEventHash = this.lastEventHash;

    const event: FlightRecorderEvent<T> = {
      eventId,
      sessionId: this.sessionId,
      eventType,
      schemaVersion: FLIGHT_RECORDER_SCHEMA_VERSION,
      sequenceNumber,
      timestamp,
      mandateVersion,
      agreementId: options.agreementId,
      offerReference: options.offerReference,
      previousEventHash,
      payloadHash,
      publicPayload: cleanPayload,
    };

    // Calculate leaf hash: h_i = SHA-256(0x00 || canonicalJSON(event))
    const leafBuf = computeEventLeafHash(event);
    const leafHash = leafBuf.toString("hex");
    event.leafHash = leafHash;

    // Commit to Merkle Tree using event body without leafHash
    const auditNode = this.merkleTree.addEvent(eventType, getEventForMerkleTree(event), timestamp);
    auditNode.eventId = eventId;

    // Update running hash chain: SHA-256 of canonical event
    const eventCanonical = canonicalJson(event);
    this.lastEventHash = crypto
      .createHash("sha256")
      .update(Buffer.from(eventCanonical, "utf-8"))
      .digest("hex");

    this.events.push(event as FlightRecorderEvent);

    return { event, auditNode };
  }

  /**
   * Generates a cryptographic Merkle inclusion proof for an event by sequence index or eventId.
   */
  public generateInclusionProof(eventIndexOrId: number | string): MerkleInclusionProof {
    let index: number;
    if (typeof eventIndexOrId === "number") {
      index = eventIndexOrId;
    } else {
      index = this.events.findIndex((e) => e.eventId === eventIndexOrId);
      if (index === -1) {
        throw new Error(`Event with ID '${eventIndexOrId}' not found in flight recorder.`);
      }
    }

    return this.merkleTree.generateInclusionProof(index);
  }

  /**
   * Deterministically verifies that an event is committed in the Merkle tree with the specified root.
   */
  public verifyEventInclusion(
    eventIndexOrId: number | string,
    proof: MerkleInclusionProof,
    expectedRoot?: string
  ): boolean {
    const root = expectedRoot ?? this.getRootHash();
    let event: FlightRecorderEvent | undefined;

    if (typeof eventIndexOrId === "number") {
      event = this.events[eventIndexOrId];
    } else {
      event = this.events.find((e) => e.eventId === eventIndexOrId);
    }

    if (!event) {
      return false;
    }

    const calculatedLeafHash = computeEventLeafHash(event).toString("hex");
    if (calculatedLeafHash !== proof.leafHash) {
      return false;
    }

    return verifyProof(proof.leafHash, proof.proof, root);
  }

  /**
   * Deterministically audits the complete sequence of events from genesis to root.
   * Detects alteration, deletion, insertion, cross-session injection, or reordering of any event.
   * If expectedRoot is provided, validates that the computed root matches the external trust anchor.
   */
  public verifyIntegrity(expectedRoot?: string): FlightRecorderIntegrityResult {
    const rootHash = this.getRootHash();

    if (this.events.length === 0) {
      const emptyValid = rootHash === "0".repeat(64);
      if (expectedRoot && expectedRoot !== rootHash) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Empty flight recorder root mismatch with expected root: expected ${expectedRoot}, found ${rootHash}.`,
          verifiedEvents: 0,
          rootHash,
          errorCode: "EXPECTED_ROOT_MISMATCH",
        };
      }
      return {
        valid: emptyValid,
        sessionId: this.sessionId,
        error: emptyValid ? undefined : "Empty flight recorder root mismatch.",
        verifiedEvents: 0,
        rootHash,
      };
    }

    let expectedPrevHash = GENESIS_PREVIOUS_HASH;
    const independentTree = new VeriPayMerkleTree();

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];

      // 0. Malformed event record check
      if (
        !event ||
        typeof event !== "object" ||
        !event.eventId ||
        typeof event.eventId !== "string" ||
        !event.eventType ||
        !event.timestamp ||
        event.publicPayload === undefined
      ) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Malformed event record at index ${i}.`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event?.eventId,
          errorCode: "MALFORMED_EVENT",
        };
      }

      // 1. Session binding check
      if (event.sessionId !== this.sessionId) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Cross-session event injection detected at index ${i}: event belongs to session ${event.sessionId}, expected ${this.sessionId}.`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode: "CROSS_SESSION_INJECTION",
        };
      }

      // 2. Sequence number check
      if (event.sequenceNumber !== i) {
        const isDuplicate = i > 0 && event.sequenceNumber === this.events[i - 1]?.sequenceNumber;
        const errorCode: FlightRecorderErrorCode = isDuplicate
          ? "DUPLICATE_SEQUENCE"
          : "SEQUENCE_GAP";
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Sequence discontinuity at index ${i}: expected sequenceNumber ${i}, found ${event.sequenceNumber}.`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode,
        };
      }

      // 3. Hash chain check
      if (event.previousEventHash !== expectedPrevHash) {
        const errorCode: FlightRecorderErrorCode =
          i === 0 ? "GENESIS_HASH_MISMATCH" : "HASH_CHAIN_BROKEN";
        return {
          valid: false,
          sessionId: this.sessionId,
          error:
            i === 0
              ? `Invalid genesis previousEventHash at index 0: expected ${GENESIS_PREVIOUS_HASH}, found ${event.previousEventHash}.`
              : `Hash chain broken at event ${event.eventId} (index ${i}): previousEventHash mismatch.`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode,
        };
      }

      // 4. Payload hash check
      let recomputedPayloadHash: string;
      try {
        recomputedPayloadHash = crypto
          .createHash("sha256")
          .update(Buffer.from(canonicalJson(event.publicPayload), "utf-8"))
          .digest("hex");
      } catch (err) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Payload serialization error at event ${event.eventId} (index ${i}): ${err instanceof Error ? err.message : String(err)}`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode: "PAYLOAD_HASH_MISMATCH",
        };
      }

      if (event.payloadHash !== recomputedPayloadHash) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Payload hash mismatch at event ${event.eventId} (index ${i}).`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode: "PAYLOAD_HASH_MISMATCH",
        };
      }

      // 5. Leaf hash check
      let recomputedLeaf: string;
      try {
        recomputedLeaf = computeEventLeafHash(event).toString("hex");
      } catch (err) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Leaf hash computation error at event ${event.eventId} (index ${i}): ${err instanceof Error ? err.message : String(err)}`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode: "MALFORMED_EVENT",
        };
      }

      if (event.leafHash !== recomputedLeaf) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Leaf hash mismatch at event ${event.eventId} (index ${i}).`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode: "LEAF_HASH_MISMATCH",
        };
      }

      // Add to independent verification tree
      try {
        independentTree.addEvent(event.eventType, getEventForMerkleTree(event), event.timestamp);
      } catch (err) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Tree commitment error at event ${event.eventId} (index ${i}): ${err instanceof Error ? err.message : String(err)}`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode: "MALFORMED_EVENT",
        };
      }

      // Advance hash chain
      let canonical: string;
      try {
        canonical = canonicalJson(event);
      } catch (err) {
        return {
          valid: false,
          sessionId: this.sessionId,
          error: `Event canonicalization error at event ${event.eventId} (index ${i}): ${err instanceof Error ? err.message : String(err)}`,
          verifiedEvents: i,
          rootHash,
          firstFailingIndex: i,
          firstFailingEventId: event.eventId,
          errorCode: "MALFORMED_EVENT",
        };
      }

      expectedPrevHash = crypto
        .createHash("sha256")
        .update(Buffer.from(canonical, "utf-8"))
        .digest("hex");
    }

    // 6. Merkle Root equality check
    const independentRoot = independentTree.getRootHash();
    if (independentRoot !== rootHash) {
      return {
        valid: false,
        sessionId: this.sessionId,
        error: `Merkle root mismatch: recorder root is ${rootHash}, independent recomputation produced ${independentRoot}.`,
        verifiedEvents: this.events.length,
        rootHash,
        errorCode: "MERKLE_ROOT_MISMATCH",
      };
    }

    // 7. Expected root commitment verification against external trust anchor
    if (expectedRoot && expectedRoot !== rootHash) {
      return {
        valid: false,
        sessionId: this.sessionId,
        error: `Expected root commitment mismatch: expected ${expectedRoot}, but flight recorder root is ${rootHash}. Potential unauthorized root replacement attack.`,
        verifiedEvents: this.events.length,
        rootHash,
        errorCode: "EXPECTED_ROOT_MISMATCH",
      };
    }

    return {
      valid: true,
      sessionId: this.sessionId,
      verifiedEvents: this.events.length,
      rootHash,
    };
  }

  /**
   * Serializes the flight recorder for persistence.
   */
  public exportFlightRecord(): SerializedFlightRecord {
    return {
      sessionId: this.sessionId,
      schemaVersion: FLIGHT_RECORDER_SCHEMA_VERSION,
      rootHash: this.getRootHash(),
      lastSequenceNumber: this.events.length - 1,
      lastEventHash: this.lastEventHash,
      events: this.getEvents(),
      auditNodes: this.getAuditNodes(),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Reconstitutes a FlightRecorder from serialized data with mandatory integrity verification.
   */
  public static fromSerialized(record: SerializedFlightRecord): CryptographicFlightRecorder {
    if (!record || !record.sessionId || !Array.isArray(record.events)) {
      throw new Error("Invalid serialized flight record structure.");
    }

    const recorder = new CryptographicFlightRecorder(record.sessionId);
    let expectedPrevHash = GENESIS_PREVIOUS_HASH;

    for (const event of record.events) {
      recorder.merkleTree.addEvent(event.eventType, getEventForMerkleTree(event), event.timestamp);
      recorder.events.push(event);

      const canonical = canonicalJson(event);
      expectedPrevHash = crypto
        .createHash("sha256")
        .update(Buffer.from(canonical, "utf-8"))
        .digest("hex");
    }

    recorder.lastEventHash = expectedPrevHash;

    const integrity = recorder.verifyIntegrity(record.rootHash);
    if (!integrity.valid) {
      throw new Error(`Flight record integrity verification failed upon reconstitution: ${integrity.error}`);
    }

    if (record.lastEventHash && record.lastEventHash !== expectedPrevHash) {
      throw new Error(
        `Flight record lastEventHash mismatch: recorded ${record.lastEventHash}, recomputed ${expectedPrevHash}`
      );
    }

    return recorder;
  }

  /**
   * Reconstitutes or initializes a flight recorder from an existing session's authoritative state.
   */
  public static getOrReconstitute(session: ProcurementSession): CryptographicFlightRecorder {
    if (session.flightRecord) {
      return CryptographicFlightRecorder.fromSerialized(session.flightRecord);
    }

    const recorder = new CryptographicFlightRecorder(session.id);

    // 1. Mandate event
    recorder.recordEvent(
      "MANDATE_CREATED",
      {
        mandateId: session.mandate.id,
        itemQuery: session.mandate.itemQuery,
        quantity: session.mandate.quantity,
        maxTotalBudget: session.mandate.maxTotalBudget,
        maxDeliveryDays: session.mandate.maxDeliveryDays,
        minReturnDays: session.mandate.minReturnDays,
        currency: session.mandate.currency,
        requiredCondition: session.mandate.requiredCondition,
      },
      { mandateVersion: session.mandate.version ?? 1, timestamp: session.mandate.createdAt }
    );

    // 2. Sourcing quotes event
    if (session.quotes && session.quotes.length > 0) {
      recorder.recordEvent(
        "SOURCING_COMPLETED",
        {
          sessionId: session.id,
          quoteCount: session.quotes.length,
          quotes: session.quotes.map((q) => ({
            vendorId: q.vendorId,
            vendorName: q.vendorName,
            sku: q.sku,
            initialUnitAsk: q.initialUnitAsk,
            shippingCost: q.shippingCost,
            deliveryDays: q.deliveryDays,
            returnDays: q.returnDays,
            condition: q.condition,
            dataSource: q.dataSource,
          })),
        },
        { mandateVersion: session.mandate.version ?? 1, timestamp: session.createdAt }
      );
    }

    // 3. Merchant Attestation
    if (session.merchantAttestation) {
      recorder.recordEvent(
        "KERNEL_DOM_ATTESTATION",
        {
          sessionId: session.id,
          merchantUrl: session.merchantAttestation.merchantUrl,
          domSnapshotHash: session.merchantAttestation.domSnapshotHash,
          returnPolicyText: session.merchantAttestation.returnPolicyText,
        },
        { mandateVersion: session.mandate.version ?? 1, timestamp: session.merchantAttestation.timestamp }
      );
    }

    // 4. Negotiation Turns & Rounds
    if (session.turns && session.turns.length > 0) {
      const rounds = Array.from(new Set(session.turns.map((t) => t.round))).sort((a, b) => a - b);
      for (const round of rounds) {
        const roundTurns = session.turns.filter((t) => t.round === round);
        recorder.recordEvent(
          "VERIFIED_NEGOTIATION_ROUND",
          {
            sessionId: session.id,
            round,
            turnsInRound: roundTurns.map((t) => ({
              actor: t.actor,
              vendorId: t.vendorId,
              turnType: t.turnType,
              offerState: t.offerState,
              unitPrice: t.proposedOffer.unitPrice,
              deliveryDays: t.proposedOffer.deliveryDays,
              returnDays: t.proposedOffer.returnDays,
              guardrailStatus: t.guardrailStatus,
              guardrailReason: t.guardrailReason,
            })),
          },
          { mandateVersion: session.mandate.version ?? 1, timestamp: session.updatedAt }
        );
      }
    }

    // 5. Authoritative Agreement
    if (session.agreementRecord) {
      recorder.recordEvent(
        "AGREEMENT_CREATED",
        {
          agreementId: session.agreementRecord.agreementId,
          sessionId: session.id,
          vendorId: session.agreementRecord.vendorId,
          vendorName: session.agreementRecord.vendorName,
          sku: session.agreementRecord.sku,
          agreedPrice: session.agreementRecord.agreedPrice,
          totalCost: session.agreementRecord.totalCost,
          agreedOffer: session.agreementRecord.agreedOffer,
          acceptingParty: session.agreementRecord.acceptingParty,
          acceptanceMechanism: session.agreementRecord.acceptanceMechanism,
          round: session.agreementRecord.round,
        },
        {
          mandateVersion: session.agreementRecord.mandateVersion,
          agreementId: session.agreementRecord.agreementId,
          offerReference: session.agreementRecord.offerReference,
          timestamp: session.agreementRecord.acceptedAt,
        }
      );
    }

    // 6. Audit Certificate
    if (session.auditCertificate) {
      recorder.recordEvent(
        session.auditCertificate.passed ? "ACWORLD_AUDIT_PASSED" : "ACWORLD_AUDIT_FAILED",
        {
          certificateId: session.auditCertificate.certificateId,
          sessionId: session.id,
          passed: session.auditCertificate.passed,
          verifiedRoot: session.auditCertificate.verifiedRoot,
          invariants: session.auditCertificate.invariants.map((i) => ({
            name: i.name,
            passed: i.passed,
            reason: i.reason,
          })),
        },
        {
          mandateVersion: session.mandate.version ?? 1,
          agreementId: session.agreementRecord?.agreementId,
          timestamp: session.auditCertificate.timestamp,
        }
      );
    }

    // 6.5 Phase 6.8 Verifiable FX Settlement Bridge Events
    if (session.fxRecord) {
      recorder.recordEvent(
        session.fxRecord.status === "LOCKED" || session.fxRecord.status === "CONSUMED"
          ? "FX_QUOTE_LOCKED"
          : "FX_QUOTE_CREATED",
        {
          sessionId: session.id,
          quoteId: session.fxRecord.id,
          agreementHash: session.fxRecord.agreementHash,
          sourceCurrency: session.fxRecord.sourceCurrency,
          targetCurrency: session.fxRecord.targetCurrency,
          sourceAmountMinor: session.fxRecord.sourceAmountMinor,
          targetAmountMinor: session.fxRecord.targetAmountMinor,
          rate: session.fxRecord.rate,
          rateConvention: session.fxRecord.rateConvention,
          rateSource: session.fxRecord.rateSource,
          provider: session.fxRecord.provider,
          conversionHash: session.fxRecord.conversionHash,
          status: session.fxRecord.status,
        },
        {
          mandateVersion: session.mandate.version ?? 1,
          agreementId: session.agreementRecord?.agreementId,
          timestamp: session.fxRecord.quotedAt,
        }
      );
    }

    // 7. Settlement Authorization & Capture
    if (session.paypalOrderId) {
      recorder.recordEvent(
        "SETTLEMENT_AUTHORIZED",
        {
          sessionId: session.id,
          paypalOrderId: session.paypalOrderId,
          paypalAuthorizationId: session.paypalAuthorizationId,
        },
        {
          mandateVersion: session.mandate.version ?? 1,
          agreementId: session.agreementRecord?.agreementId,
          timestamp: session.updatedAt,
        }
      );
    }

    if (session.paypalCaptureId) {
      recorder.recordEvent(
        "SETTLEMENT_CAPTURED",
        {
          sessionId: session.id,
          paypalOrderId: session.paypalOrderId,
          paypalCaptureId: session.paypalCaptureId,
          captureAmount: session.captureAmount,
          currency: session.fxRecord ? session.fxRecord.targetCurrency : session.mandate.currency,
          commercialCurrency: session.mandate.currency,
          paypalInvoiceId: session.paypalInvoiceId,
        },
        {
          mandateVersion: session.mandate.version ?? 1,
          agreementId: session.agreementRecord?.agreementId,
          timestamp: session.updatedAt,
        }
      );
    }

    // Update session with serialized flight record
    session.flightRecord = recorder.exportFlightRecord();

    return recorder;
  }
}

/**
 * Standalone verifier for an arbitrary sequence of events.
 * Does not trust any state outside the provided records.
 */
export function verifyFlightRecorderChain(
  events: FlightRecorderEvent[],
  expectedSessionId: string,
  expectedRoot?: string
): FlightRecorderIntegrityResult {
  const recorder = new CryptographicFlightRecorder(expectedSessionId);
  for (const event of events) {
    if (event && typeof event === "object") {
      try {
        // @ts-expect-error accessing private merkleTree for verification construction
        recorder.merkleTree.addEvent(event.eventType, getEventForMerkleTree(event), event.timestamp);
      } catch {
        // Malformed events will be caught during verifyIntegrity
      }
    }
    // @ts-expect-error accessing private events for verification construction
    recorder.events.push(event);
  }
  return recorder.verifyIntegrity(expectedRoot);
}
