/**
 * PACTUM — Dispute Resolution Service
 *
 * Implements deterministic evidence verification and dispute resolution.
 * Strictly adheres to GEMINI.md Section 3, 9.4, 11, SECURITY.md Section 7, and Phase 5 specifications.
 *
 * Principles:
 * 1. AI may summarize or explain; deterministic code evaluates breach conditions.
 * 2. Compares disputed claim against authoritative committed Merkle evidence and AgreementRecord.
 * 3. Generates and verifies cryptographic inclusion proofs.
 * 4. Distinguishes VERIFIED, FAILED_VERIFICATION, INSUFFICIENT_EVIDENCE, and PENDING_REVIEW.
 * 5. Recomputed Merkle root proves evidence consistency, not factual truth of missing real-world data.
 * 6. Commits DISPUTE_OPENED, DISPUTE_EVIDENCE_VERIFIED, and DISPUTE_RESOLVED to the Flight Recorder.
 */

import crypto from "crypto";
import { sessionStore } from "./session-store";
import { CryptographicFlightRecorder } from "./flight-recorder";
import type {
  DisputeCategory,
  DisputeRecord,
  DisputeInvariantCheck,
  ProcurementSession,
  MerkleInclusionProof,
} from "../types/pactum";

export interface OpenDisputeParams {
  sessionId: string;
  category: DisputeCategory;
  description: string;
  claimedValue?: number | string;
  refundRequested?: boolean;
}

export interface EvaluateDisputeParams {
  disputeId: string;
  externalEvidence?: {
    deliveredSku?: string;
    actualLandedPrice?: number;
    actualDeliveryDays?: number;
    returnRefusedWithinWindow?: boolean;
    carrierTrackingVerified?: boolean;
  };
}

export interface PayPalDisputeEvidencePackage {
  disputeId: string;
  sessionId: string;
  category: DisputeCategory;
  description: string;
  evidenceRoot: string;
  mandateSnapshot: {
    itemQuery: string;
    quantity: number;
    maxTotalBudget: number;
    maxDeliveryDays: number;
    minReturnDays: number;
  };
  agreementSnapshot?: {
    agreementId: string;
    vendorName: string;
    sku: string;
    agreedPrice: number;
    totalCost: number;
    deliveryDays: number;
    returnDays: number;
  };
  merchantAttestation?: {
    merchantUrl: string;
    domSnapshotHash?: string;
    returnPolicyText: string;
  };
  settlementReference?: {
    paypalOrderId?: string;
    paypalCaptureId?: string;
    captureAmount?: number;
  };
  inclusionProofs: MerkleInclusionProof[];
  evaluationOutcome: {
    status: string;
    rationale: string;
    verifiedInvariants: DisputeInvariantCheck[];
  };
  timestamp: string;
}

export class DisputeService {
  /**
   * Opens an authoritative dispute against an existing procurement session.
   */
  public openDispute(params: OpenDisputeParams): DisputeRecord {
    const { sessionId, category, description, claimedValue, refundRequested = false } = params;

    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Field 'sessionId' is required.");
    }
    if (!category || typeof category !== "string") {
      throw new Error("Field 'category' is required.");
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      throw new Error("Field 'description' is required and cannot be empty.");
    }

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found in authoritative store.`);
    }

    const disputeId = `disp_${crypto.randomBytes(8).toString("hex")}`;
    const openedAt = new Date().toISOString();

    // Reconstitute or get flight recorder
    const recorder = CryptographicFlightRecorder.getOrReconstitute(session);

    // Commit DISPUTE_OPENED event to flight recorder
    recorder.recordEvent(
      "DISPUTE_OPENED",
      {
        disputeId,
        sessionId,
        category,
        description: description.trim(),
        claimedValue,
        refundRequested,
        openedAt,
      },
      {
        mandateVersion: session.mandate.version ?? 1,
        agreementId: session.agreementRecord?.agreementId,
        timestamp: openedAt,
      }
    );

    const evidenceRoot = recorder.getRootHash();
    session.flightRecord = recorder.exportFlightRecord();
    session.preSettlementRoot = session.preSettlementRoot ?? evidenceRoot;
    session.status = "DISPUTED";

    const disputeRecord: DisputeRecord = {
      disputeId,
      sessionId,
      agreementId: session.agreementRecord?.agreementId,
      settlementReference: session.paypalCaptureId || session.paypalOrderId,
      category,
      description: description.trim(),
      claimedValue,
      status: "OPENED",
      openedAt,
      evidenceRoot,
      verifiedInvariants: [],
      inclusionProofs: [],
      refundRequested,
      refundApproved: false,
    };

    if (!session.disputes) {
      session.disputes = [];
    }
    session.disputes.push(disputeRecord);

    sessionStore.saveSession(session);

    return disputeRecord;
  }

  /**
   * Evaluates a dispute against authoritative committed evidence and external observations.
   */
  public evaluateDispute(params: EvaluateDisputeParams): DisputeRecord {
    const { disputeId, externalEvidence } = params;

    if (!disputeId || typeof disputeId !== "string") {
      throw new Error("Field 'disputeId' is required.");
    }

    // Find session containing the dispute
    const allSessions = sessionStore.getAllSessions();
    let targetSession: ProcurementSession | undefined;
    let disputeIndex = -1;

    for (const s of allSessions) {
      if (s.disputes) {
        const idx = s.disputes.findIndex((d) => d.disputeId === disputeId);
        if (idx !== -1) {
          targetSession = s;
          disputeIndex = idx;
          break;
        }
      }
    }

    if (!targetSession || disputeIndex === -1) {
      throw new Error(`Dispute ${disputeId} not found in any authoritative session.`);
    }

    const dispute = targetSession.disputes![disputeIndex];
    let recorder: CryptographicFlightRecorder | undefined;
    let integrity: { valid: boolean; error?: string; verifiedEvents: number; rootHash: string };

    try {
      recorder = CryptographicFlightRecorder.getOrReconstitute(targetSession);
      integrity = recorder.verifyIntegrity();
    } catch (err) {
      integrity = {
        valid: false,
        error: `Flight record integrity failure: ${err instanceof Error ? err.message : String(err)}`,
        verifiedEvents: 0,
        rootHash: targetSession.preSettlementRoot ?? "0".repeat(64),
      };
    }

    // 1. Verify complete flight recorder integrity
    const invariants: DisputeInvariantCheck[] = [
      {
        invariant: "FLIGHT_RECORDER_INTEGRITY",
        passed: integrity.valid,
        details: integrity.valid ? "Cryptographic event log and Merkle tree verified." : integrity.error,
      },
    ];

    let resolutionStatus: DisputeRecord["status"] = "FAILED_VERIFICATION";
    let rationale = "";

    if (!integrity.valid) {
      resolutionStatus = "VERIFIED";
      rationale = `Evidence integrity compromised: ${integrity.error}`;
      invariants.push({
        invariant: "EVIDENCE_CONSISTENCY",
        passed: false,
        details: "Merkle flight recorder failed cryptographic verification.",
      });
    } else {
      const agreement = targetSession.agreementRecord;
      const quote = targetSession.selectedQuote;

      invariants.push({
        invariant: "AGREEMENT_EXISTENCE",
        passed: !!agreement,
        details: agreement ? `Agreement ${agreement.agreementId} verified.` : "No agreement formed.",
      });

      // 2. Deterministic Category-Specific Evaluation
      switch (dispute.category) {
        case "PRICE_MISMATCH": {
          if (!agreement) {
            resolutionStatus = "FAILED_VERIFICATION";
            rationale = "No authoritative agreement found to compare price against.";
            break;
          }

          if (externalEvidence?.actualLandedPrice !== undefined) {
            const agreedTotal = agreement.totalCost;
            if (externalEvidence.actualLandedPrice > agreedTotal + 0.01) {
              resolutionStatus = "VERIFIED";
              rationale = `Price breach verified: agreed landed cost is $${agreedTotal.toFixed(2)}, but vendor billed $${externalEvidence.actualLandedPrice.toFixed(2)} (overcharge of $${(externalEvidence.actualLandedPrice - agreedTotal).toFixed(2)}).`;
              invariants.push({
                invariant: "PRICE_COMPLIANCE",
                passed: false,
                details: `Billed $${externalEvidence.actualLandedPrice} vs agreed $${agreedTotal}`,
              });
            } else {
              resolutionStatus = "FAILED_VERIFICATION";
              rationale = `Price compliance confirmed: billed price $${externalEvidence.actualLandedPrice.toFixed(2)} is within agreed cost $${agreedTotal.toFixed(2)}.`;
              invariants.push({
                invariant: "PRICE_COMPLIANCE",
                passed: true,
                details: "Price within agreed terms.",
              });
            }
          } else if (targetSession.captureAmount && targetSession.captureAmount > agreement.totalCost + 0.01) {
            resolutionStatus = "VERIFIED";
            rationale = `Settlement capture overcharge verified: captured $${targetSession.captureAmount.toFixed(2)}, agreed was $${agreement.totalCost.toFixed(2)}.`;
            invariants.push({
              invariant: "SETTLEMENT_PRICE",
              passed: false,
              details: "Captured amount exceeds agreed price.",
            });
          } else {
            resolutionStatus = "INSUFFICIENT_EVIDENCE";
            rationale = "No invoice or billed price was provided to substantiate the alleged overcharge.";
            invariants.push({
              invariant: "PRICE_COMPLIANCE",
              passed: false,
              details: "Missing external billing proof.",
            });
          }
          break;
        }

        case "DELIVERY_BREACH": {
          if (!agreement) {
            resolutionStatus = "FAILED_VERIFICATION";
            rationale = "No authoritative agreement found to compare delivery SLA against.";
            break;
          }

          const agreedDays = agreement.agreedOffer.deliveryDays;
          if (externalEvidence?.actualDeliveryDays !== undefined) {
            if (externalEvidence.actualDeliveryDays > agreedDays) {
              resolutionStatus = "VERIFIED";
              rationale = `Delivery SLA breach verified: agreed delivery window is ${agreedDays} day(s), but delivery took ${externalEvidence.actualDeliveryDays} day(s).`;
              invariants.push({
                invariant: "DELIVERY_SLA_COMPLIANCE",
                passed: false,
                details: `Delivered in ${externalEvidence.actualDeliveryDays}d vs SLA ${agreedDays}d`,
              });
            } else {
              resolutionStatus = "FAILED_VERIFICATION";
              rationale = `Delivery SLA complied: delivery in ${externalEvidence.actualDeliveryDays} day(s) satisfies agreed ${agreedDays}-day limit.`;
              invariants.push({
                invariant: "DELIVERY_SLA_COMPLIANCE",
                passed: true,
                details: "Delivered within SLA window.",
              });
            }
          } else {
            resolutionStatus = "INSUFFICIENT_EVIDENCE";
            rationale = "Carrier tracking or signed delivery timestamp is required to verify delivery breach.";
            invariants.push({
              invariant: "DELIVERY_SLA_COMPLIANCE",
              passed: false,
              details: "Carrier delivery proof missing.",
            });
          }
          break;
        }

        case "RETURN_POLICY_BREACH": {
          if (!agreement) {
            resolutionStatus = "FAILED_VERIFICATION";
            rationale = "No authoritative agreement found to verify return policy terms.";
            break;
          }

          const agreedReturnDays = agreement.agreedOffer.returnDays;
          const attestationText = targetSession.merchantAttestation?.returnPolicyText;

          if (externalEvidence?.returnRefusedWithinWindow === true) {
            resolutionStatus = "VERIFIED";
            rationale = `Return policy breach verified: supplier refused customer return within agreed ${agreedReturnDays}-day return protection window (backed by merchant policy: "${attestationText ?? "Standard wholesale policy"}").`;
            invariants.push({
              invariant: "RETURN_POLICY_COMPLIANCE",
              passed: false,
              details: `Supplier refused return within ${agreedReturnDays}d window`,
            });
          } else if (externalEvidence?.returnRefusedWithinWindow === false) {
            resolutionStatus = "FAILED_VERIFICATION";
            rationale = "Return request was honored by supplier.";
            invariants.push({
              invariant: "RETURN_POLICY_COMPLIANCE",
              passed: true,
              details: "Return honored.",
            });
          } else {
            resolutionStatus = "INSUFFICIENT_EVIDENCE";
            rationale = "Documentation of supplier's refusal to accept return within the agreed window is required.";
            invariants.push({
              invariant: "RETURN_POLICY_COMPLIANCE",
              passed: false,
              details: "Return refusal correspondence missing.",
            });
          }
          break;
        }

        case "WRONG_ITEM": {
          if (!agreement || !quote) {
            resolutionStatus = "FAILED_VERIFICATION";
            rationale = "No authoritative quote/agreement found to verify item SKU.";
            break;
          }

          if (externalEvidence?.deliveredSku) {
            if (externalEvidence.deliveredSku !== quote.sku) {
              resolutionStatus = "VERIFIED";
              rationale = `Wrong item breach verified: agreed product SKU is '${quote.sku}', but supplier delivered SKU '${externalEvidence.deliveredSku}'.`;
              invariants.push({
                invariant: "SKU_MATCH",
                passed: false,
                details: `Delivered SKU '${externalEvidence.deliveredSku}' !== agreed '${quote.sku}'`,
              });
            } else {
              resolutionStatus = "FAILED_VERIFICATION";
              rationale = `Item verified: delivered SKU '${externalEvidence.deliveredSku}' matches contracted SKU.`;
              invariants.push({
                invariant: "SKU_MATCH",
                passed: true,
                details: "SKU matched.",
              });
            }
          } else {
            resolutionStatus = "INSUFFICIENT_EVIDENCE";
            rationale = "Inspection report, serial number, or delivered packing slip required to prove wrong SKU.";
            invariants.push({
              invariant: "SKU_MATCH",
              passed: false,
              details: "Delivered SKU inspection proof missing.",
            });
          }
          break;
        }

        case "SETTLEMENT_MISMATCH": {
          if (!agreement) {
            resolutionStatus = "FAILED_VERIFICATION";
            rationale = "No authoritative agreement found.";
            break;
          }

          const captured = targetSession.captureAmount;
          const agreed = agreement.totalCost;
          if (captured !== undefined && Math.abs(captured - agreed) > 0.01) {
            resolutionStatus = "VERIFIED";
            rationale = `Settlement mismatch verified: captured amount ($${captured.toFixed(2)}) does not match agreed contract ($${agreed.toFixed(2)}).`;
            invariants.push({
              invariant: "CAPTURE_AMOUNT_EQUALITY",
              passed: false,
              details: `Captured $${captured} vs agreed $${agreed}`,
            });
          } else {
            resolutionStatus = "FAILED_VERIFICATION";
            rationale = `Settlement reconciled: captured amount ($${captured?.toFixed(2) ?? agreed.toFixed(2)}) matches agreed contract.`;
            invariants.push({
              invariant: "CAPTURE_AMOUNT_EQUALITY",
              passed: true,
              details: "Settlement reconciled.",
            });
          }
          break;
        }

        case "EVIDENCE_INTEGRITY_FAILURE": {
          resolutionStatus = integrity.valid ? "FAILED_VERIFICATION" : "VERIFIED";
          rationale = integrity.valid
            ? "Evidence integrity verified: all Merkle leaves and hash chain links are valid."
            : `Evidence integrity breach verified: ${integrity.error}`;
          break;
        }

        default: {
          resolutionStatus = "INSUFFICIENT_EVIDENCE";
          rationale = `Dispute category '${dispute.category}' requires manual administrative review.`;
          invariants.push({
            invariant: "CATEGORY_SUPPORTED",
            passed: false,
            details: "Manual review required.",
          });
          break;
        }
      }
    }

    // 3. Generate Merkle Inclusion Proofs for key lifecycle events
    const inclusionProofs: MerkleInclusionProof[] = [];
    if (recorder) {
      const eventCount = recorder.getEventCount();

      if (eventCount > 0) {
        // Mandate inclusion proof (always leaf 0)
        try {
          inclusionProofs.push(recorder.generateInclusionProof(0));
        } catch {
          // Ignore if out of bounds
        }

        // Agreement inclusion proof (find index of agreement event)
        const events = recorder.getEvents();
        const agreeIdx = events.findIndex(
          (e) => e.eventType === "AGREEMENT_CREATED" || e.eventType === "BUYER_ACCEPTANCE" || e.eventType === "VENDOR_ACCEPTANCE"
        );
        if (agreeIdx !== -1) {
          try {
            inclusionProofs.push(recorder.generateInclusionProof(agreeIdx));
          } catch {
            // Ignore
          }
        }
      }
    }

    const resolvedAt = new Date().toISOString();

    // 4. Commit DISPUTE_EVIDENCE_VERIFIED and DISPUTE_RESOLVED events if recorder is valid
    if (recorder) {
      recorder.recordEvent(
        "DISPUTE_EVIDENCE_VERIFIED",
        {
          disputeId,
          sessionId: targetSession.id,
          status: resolutionStatus,
          invariantsCount: invariants.length,
          proofCount: inclusionProofs.length,
        },
        {
          mandateVersion: targetSession.mandate.version ?? 1,
          agreementId: targetSession.agreementRecord?.agreementId,
          timestamp: resolvedAt,
        }
      );

      recorder.recordEvent(
        "DISPUTE_RESOLVED",
        {
          disputeId,
          sessionId: targetSession.id,
          status: resolutionStatus,
          rationale,
          resolvedAt,
          refundApproved: resolutionStatus === "VERIFIED" && dispute.refundRequested,
        },
        {
          mandateVersion: targetSession.mandate.version ?? 1,
          agreementId: targetSession.agreementRecord?.agreementId,
          timestamp: resolvedAt,
        }
      );

      targetSession.flightRecord = recorder.exportFlightRecord();
    }

    // Update dispute record
    dispute.status = resolutionStatus;
    dispute.resolutionRationale = rationale;
    dispute.resolvedAt = resolvedAt;
    dispute.verifiedInvariants = invariants;
    dispute.inclusionProofs = inclusionProofs;
    dispute.evidenceRoot = recorder ? recorder.getRootHash() : (targetSession.preSettlementRoot ?? "0".repeat(64));
    dispute.refundApproved = resolutionStatus === "VERIFIED" && dispute.refundRequested;
    targetSession.disputes![disputeIndex] = dispute;

    sessionStore.saveSession(targetSession);

    return dispute;
  }

  /**
   * Retrieves an existing dispute by disputeId.
   */
  public getDispute(disputeId: string): {
    dispute: DisputeRecord;
    session: ProcurementSession;
    inclusionProofs: MerkleInclusionProof[];
  } {
    const allSessions = sessionStore.getAllSessions();
    for (const session of allSessions) {
      if (session.disputes) {
        const dispute = session.disputes.find((d) => d.disputeId === disputeId);
        if (dispute) {
          return {
            dispute,
            session,
            inclusionProofs: dispute.inclusionProofs,
          };
        }
      }
    }
    throw new Error(`Dispute ${disputeId} not found.`);
  }

  /**
   * Prepares structured PayPal Dispute evidence package conforming to supported PayPal Disputes API schema.
   */
  public preparePayPalDisputeEvidence(disputeId: string): PayPalDisputeEvidencePackage {
    const { dispute, session, inclusionProofs } = this.getDispute(disputeId);
    const agreement = session.agreementRecord;

    return {
      disputeId: dispute.disputeId,
      sessionId: session.id,
      category: dispute.category,
      description: dispute.description,
      evidenceRoot: dispute.evidenceRoot,
      mandateSnapshot: {
        itemQuery: session.mandate.itemQuery,
        quantity: session.mandate.quantity,
        maxTotalBudget: session.mandate.maxTotalBudget,
        maxDeliveryDays: session.mandate.maxDeliveryDays,
        minReturnDays: session.mandate.minReturnDays,
      },
      agreementSnapshot: agreement
        ? {
            agreementId: agreement.agreementId,
            vendorName: agreement.vendorName,
            sku: agreement.sku,
            agreedPrice: agreement.agreedPrice,
            totalCost: agreement.totalCost,
            deliveryDays: agreement.agreedOffer.deliveryDays,
            returnDays: agreement.agreedOffer.returnDays,
          }
        : undefined,
      merchantAttestation: session.merchantAttestation
        ? {
            merchantUrl: session.merchantAttestation.merchantUrl,
            domSnapshotHash: session.merchantAttestation.domSnapshotHash,
            returnPolicyText: session.merchantAttestation.returnPolicyText,
          }
        : undefined,
      settlementReference: {
        paypalOrderId: session.paypalOrderId,
        paypalCaptureId: session.paypalCaptureId,
        captureAmount: session.captureAmount,
      },
      inclusionProofs,
      evaluationOutcome: {
        status: dispute.status,
        rationale: dispute.resolutionRationale ?? "Pending deterministic evaluation.",
        verifiedInvariants: dispute.verifiedInvariants,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const disputeService = new DisputeService();
