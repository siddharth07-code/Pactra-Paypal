/**
 * PACTUM — Settlement Service & Audited Capture Gate
 * Enforces the critical rule:
 * NO PAYPAL CAPTURE MAY OCCUR WITHOUT A SUCCESSFUL, INDEPENDENT SERVER-SIDE ACWORLD AUDIT.
 * Follows GEMINI.md Section 8, 9 and SECURITY.md Section 3, 7.
 */

import crypto from "crypto";
import { orderEvidenceError, paymentAmountError } from "./payment-evidence";
import { AcworldAuditor } from "./acworld-auditor";
import { PayPalClient } from "./paypal-client";
import { sessionStore, saveSessionCheckpoint } from "./session-store";
import { VeriPayMerkleTree } from "./veripay-merkle";
import { CryptographicFlightRecorder } from "./flight-recorder";
import { settlementLogger } from "./settlement-logger";
import { isPayPalSupportedCurrency, fromMinorUnits, toMinorUnits, formatCurrency, exactLandedTotal } from "./currency";
import { applyAuditCertificate } from "./settlement-lifecycle";
import { auditFxSettlement, consumeFxRecord, computeAgreementHash } from "./fx-settlement";
import type {
  AuditCertificate,
  CaptureIntentRecord,
  ProcurementSession,
  ProcurementSessionStatus,
  SettlementEligibilityResult,
} from "../types/pactum";

export interface SettleRequest {
  sessionId: string;
  createInvoice?: boolean;
}

export interface SettleResponse {
  success: boolean;
  sessionId: string;
  auditCertificate: AuditCertificate;
  orderId?: string;
  authorizationId?: string;
  captureId?: string;
  invoiceId?: string;
  error?: string;
  blockedAtGate?: boolean;
  uncertain?: boolean;
}

export interface InitiateCheckoutRequest {
  sessionId: string;
  origin?: string;
}

export interface InitiateCheckoutResponse {
  success: boolean;
  sessionId: string;
  orderId?: string;
  approvalUrl?: string;
  error?: string;
  blockedAtGate?: boolean;
}

export interface CompleteSettlementRequest {
  sessionId: string;
  orderId?: string;
  createInvoice?: boolean;
}

/**
 * Phase 6.8.1: Centralized Server-Side Settlement Eligibility Evaluator
 * Evaluates whether an authoritative session satisfies all prerequisites for PayPal checkout.
 * Enforces:
 * 1. Agreement currency & non-stale terms (budget ceiling, delivery SLA, return SLA).
 * 2. Commercial ACWORLD audit validity & freshness.
 * 3. Cryptographic flight recorder integrity & pre-settlement root commitment.
 * 4. Cross-currency FX verification (LOCKED quote, agreementHash, arithmetic, rounding).
 */
export function evaluateSettlementEligibility(session: ProcurementSession, options: { requireFx?: boolean } = {}): SettlementEligibilityResult {
  const blockers: string[] = [];
  const reasons: SettlementEligibilityResult["reasons"] = {};

  // 1. Terminal / Incompatible Lifecycle Check
  if (session.status === "CANCELLED" || session.status === "DISPUTED") {
    blockers.push(`Session ${session.id} has status '${session.status}' and cannot proceed to settlement checkout.`);
    reasons.lifecycle = `Session is ${session.status}.`;
  }
  if (session.status === "PAYPAL_CAPTURED" || session.status === "SETTLED") {
    blockers.push(`Session ${session.id} has already been settled and captured.`);
    reasons.lifecycle = "Session already settled/captured.";
  }
  if (session.status === "CAPTURE_PENDING_RECONCILIATION") {
    blockers.push(`Session ${session.id} is in CAPTURE_PENDING_RECONCILIATION state. Authoritative reconciliation is required.`);
    reasons.lifecycle = "Reconciliation required.";
  }

  // 2. Agreement Current & Constraints Feasibility
  let agreementCurrent = true;
  if (!session.finalOffer || !session.selectedQuote) {
    agreementCurrent = false;
    blockers.push(`Session ${session.id} has no final agreed offer or selected vendor quote.`);
    reasons.agreement = "Missing final agreed offer or selected quote.";
  } else if (!session.agreementRecord) {
    agreementCurrent = false;
    blockers.push(`Session ${session.id} has no authoritative agreement record. Complete negotiation before settlement checkout.`);
    reasons.agreement = "Missing agreement record.";
  } else {
    if (session.agreementRecord.sessionId && session.agreementRecord.sessionId !== session.id) {
      agreementCurrent = false;
      blockers.push(`Agreement session mismatch: recorded agreement session ${session.agreementRecord.sessionId} does not match active session ${session.id}.`);
      reasons.agreement = "Agreement session mismatch.";
    }
    const currentMandateVersion = session.mandate.version ?? 1;
    if (session.agreementRecord.mandateVersion !== currentMandateVersion) {
      agreementCurrent = false;
      blockers.push(`Stale agreement rejected: agreement is from mandate version ${session.agreementRecord.mandateVersion}, current mandate is version ${currentMandateVersion}.`);
      reasons.agreement = "Stale mandate version.";
    }
    if (session.agreementRecord.vendorId !== session.selectedQuote.vendorId) {
      agreementCurrent = false;
      blockers.push(`Agreement vendor mismatch: recorded agreement vendor ${session.agreementRecord.vendorId} does not match selected vendor ${session.selectedQuote.vendorId}.`);
      reasons.agreement = "Vendor mismatch.";
    }
    const agreedTotal = session.agreementRecord.totalCost ?? (
      exactLandedTotal(session.finalOffer.unitPrice, session.finalOffer.quantity, session.finalOffer.shippingCost)
    );
    if (agreedTotal > session.mandate.maxTotalBudget) {
      agreementCurrent = false;
      blockers.push(`Agreed total landed cost (${agreedTotal}) exceeds maximum total budget (${session.mandate.maxTotalBudget}).`);
      reasons.agreement = "Budget ceiling exceeded.";
    }
    if (session.finalOffer.deliveryDays > session.mandate.maxDeliveryDays) {
      agreementCurrent = false;
      blockers.push(`Delivery timeframe (${session.finalOffer.deliveryDays} days) exceeds mandate SLA (${session.mandate.maxDeliveryDays} days).`);
      reasons.agreement = "Delivery SLA exceeded.";
    }
    if (session.finalOffer.returnDays < session.mandate.minReturnDays) {
      agreementCurrent = false;
      blockers.push(`Return policy window (${session.finalOffer.returnDays} days) is less than mandate minimum (${session.mandate.minReturnDays} days).`);
      reasons.agreement = "Return policy SLA violated.";
    }
  }

  // 3. Commercial ACWORLD Audit Valid & Fresh
  let commercialAuditValid = false;
  const auditCert = session.auditCertificate;
  if (!auditCert) {
    blockers.push("Commercial ACWORLD audit has not yet been executed.");
    reasons.commercialAudit = "Missing audit certificate.";
  } else if (!auditCert.passed) {
    const failingInvs = auditCert.invariants?.filter((i) => !i.passed).map((i) => i.name).join(", ");
    blockers.push(`Commercial ACWORLD audit is failing (${failingInvs || "failed"}). A passing audit is required.`);
    reasons.commercialAudit = `Audit failing: ${failingInvs || "failed"}`;
  } else {
    const currentMandateVersion = session.mandate.version ?? 1;
    if (auditCert.mandateVersion !== undefined && auditCert.mandateVersion !== currentMandateVersion) {
      blockers.push(`Stale audit certificate: issued for mandate version ${auditCert.mandateVersion}, current version is ${currentMandateVersion}.`);
      reasons.commercialAudit = "Stale audit mandate version.";
    } else if (session.agreementRecord?.agreementId && auditCert.agreementId && auditCert.agreementId !== session.agreementRecord.agreementId) {
      blockers.push(`Audit certificate agreement mismatch: certificate bound to ${auditCert.agreementId}, current agreement is ${session.agreementRecord.agreementId}.`);
      reasons.commercialAudit = "Audit agreement mismatch.";
    } else {
      commercialAuditValid = true;
    }
  }

  // A passing certificate alone cannot override a persisted failure; an authoritative re-audit must update both.
  if (session.status === "AUDIT_FAILED") {
    if (!blockers.some((b) => b.includes("AUDIT_FAILED"))) {
      blockers.push(`Session ${session.id} has status 'AUDIT_FAILED' and cannot proceed to settlement checkout without a passing re-audit.`);
    }
    reasons.lifecycle = "Session is in AUDIT_FAILED state.";
  }

  // 4. Evidence Current & Flight Recorder Integrity
  let evidenceCurrent = false;
  const evidenceRoot = session.preSettlementRoot ?? session.merkleRoot;
  if (!evidenceRoot || evidenceRoot.length !== 64 || evidenceRoot === "0".repeat(64)) {
    blockers.push("Session has no valid cryptographic Merkle evidence root.");
    reasons.evidence = "Missing or invalid evidence root.";
  } else if (session.flightRecord) {
    try {
      const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
      const integrity = recorder.verifyIntegrity();
      if (!integrity.valid || recorder.getRootHash() !== evidenceRoot) {
        blockers.push(`Flight recorder cryptographic integrity failed: ${integrity.error ?? "evidence root mismatch"}`);
        reasons.evidence = `Chain integrity invalid: ${integrity.errorCode}`;
      } else {
        evidenceCurrent = Boolean(session.agreementRecord && recorder.getEvents().some(event => event.eventType === "AGREEMENT_CREATED" && event.publicPayload.agreementId === session.agreementRecord!.agreementId && event.publicPayload.agreementHash === computeAgreementHash(session.agreementRecord!)));
        if (!evidenceCurrent) {
          blockers.push("Agreement terms are not bound to authoritative recorded evidence. Historical agreement requires reconciliation.");
          reasons.evidence = "Missing authoritative agreement commitment.";
        }
      }
    } catch (err) {
      blockers.push(`Failed to verify flight recorder: ${err instanceof Error ? err.message : String(err)}`);
      reasons.evidence = "Deserialization error.";
    }
  } else {
    blockers.push("Authoritative commercial evidence is missing. Historical agreement requires reconciliation.");
    reasons.evidence = "Missing persisted flight recorder.";
  }

  // 5. Cross-Currency FX Verification
  const isCrossCurrency = !isPayPalSupportedCurrency(session.mandate.currency);
  const fxRequired = isCrossCurrency;
  let fxValid = !fxRequired;

  if (fxRequired && options.requireFx !== false) {
    if (!session.fxRecord) {
      blockers.push(`Automated PayPal settlement is unavailable for '${session.mandate.currency}' in the configured PayPal environment without an approved FX settlement quote. An FX quote must be locked before checkout.`);
      reasons.fx = "Missing FX quote.";
    } else if (session.fxRecord.status !== "LOCKED") {
      blockers.push(`FX settlement quote is in '${session.fxRecord.status}' state. Quote must be 'LOCKED' to fix the exchange rate before PayPal checkout.`);
      reasons.fx = `Invalid quote status: ${session.fxRecord.status}`;
    } else {
      const fxAudit = auditFxSettlement({ session, fxRecord: session.fxRecord });
      if (!fxAudit.passed) {
        blockers.push(`ACWORLD FX Settlement Verification failed: ${fxAudit.error}`);
        reasons.fx = `FX audit failed: ${fxAudit.error}`;
      } else {
        fxValid = true;
      }
    }
  }

  const eligible =
    agreementCurrent &&
    commercialAuditValid &&
    evidenceCurrent &&
    (fxValid || options.requireFx === false) &&
    blockers.length === 0 &&
    session.status !== "CANCELLED" &&
    session.status !== "PAYPAL_CAPTURED" &&
    session.status !== "SETTLED" &&
    session.status !== "CAPTURE_PENDING_RECONCILIATION";

  return {
    eligible,
    commercialAuditValid,
    agreementCurrent,
    evidenceCurrent,
    fxRequired,
    fxValid,
    paymentCurrency: "USD",
    blockers,
    reasons,
  };
}

export class SettlementService {
  private auditor: AcworldAuditor;
  private paypalClient: PayPalClient;
  // Concurrency guard to prevent duplicate simultaneous captures for the same session
  private activeCaptureLocks = new Set<string>();

  constructor(options?: { auditor?: AcworldAuditor; paypalClient?: PayPalClient }) {
    this.auditor = options?.auditor ?? new AcworldAuditor();
    this.paypalClient = options?.paypalClient ?? new PayPalClient();
  }

  /**
   * Evaluates centralized settlement eligibility for a session.
   */
  public evaluateSettlementEligibility(session: ProcurementSession): SettlementEligibilityResult {
    return evaluateSettlementEligibility(session);
  }

  /**
   * Phase A: Initiate Checkout
   * 1. Validates authoritative session from server store.
   * 2. Checks financial & SLA constraints against locked mandate.
   * 3. Creates PayPal Sandbox Orders v2 order with intent: "AUTHORIZE" and custom_id bound to Merkle root.
   * 4. Extracts and validates the official PayPal Sandbox approval redirect URL.
   * 5. Updates session status to AWAITING_PAYPAL_APPROVAL.
   */
  public async initiateCheckout(request: InitiateCheckoutRequest): Promise<InitiateCheckoutResponse> {
    const { sessionId, origin } = request;

    if (!sessionStore.acquireLock(sessionId)) {
      return {
        success: false,
        sessionId,
        error: `A payment or checkout operation is already executing for session ${sessionId}.`,
        blockedAtGate: true,
      };
    }

    try {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          sessionId,
          error: `Session ${sessionId} not found in authoritative store.`,
        };
      }

      if (session.status === "PAYPAL_CAPTURED" || session.status === "SETTLED") {
        return {
          success: false,
          sessionId,
          error: `Session ${sessionId} has already been settled and captured.`,
          blockedAtGate: true,
        };
      }

      if (session.status === "CAPTURE_PENDING_RECONCILIATION") {
        return {
          success: false,
          sessionId,
          error: `Session ${sessionId} is in CAPTURE_PENDING_RECONCILIATION state. Authoritative reconciliation is required before initiating a new checkout.`,
          blockedAtGate: true,
        };
      }

      if (session.status === "CANCELLED" || session.status === "AUDIT_FAILED") {
        return {
          success: false,
          sessionId,
          error: `Session ${sessionId} has status '${session.status}' and cannot proceed to settlement checkout.`,
          blockedAtGate: true,
        };
      }

      if (session.paypalOrderId && ["AWAITING_PAYPAL_APPROVAL", "PAYPAL_AUTHORIZED"].includes(session.status)) {
        return { success: Boolean(session.paypalApprovalUrl), sessionId, orderId: session.paypalOrderId, approvalUrl: session.paypalApprovalUrl, error: session.paypalApprovalUrl ? undefined : "Existing order requires reconciliation; new checkout is blocked." };
      }

    if (!session.finalOffer || !session.selectedQuote) {
      return {
        success: false,
        sessionId,
        error: `Session ${sessionId} has no final agreed offer or selected vendor quote.`,
        blockedAtGate: true,
      };
    }

    if (!session.agreementRecord) {
      return {
        success: false,
        sessionId,
        error: "Current agreement, verified evidence, and audit are required.",
        blockedAtGate: true,
      };
    }

    if (session.agreementRecord.sessionId && session.agreementRecord.sessionId !== sessionId) {
      return {
        success: false,
        sessionId,
        error: `Agreement session mismatch: recorded agreement session ${session.agreementRecord.sessionId} does not match active session ${sessionId}.`,
        blockedAtGate: true,
      };
    }
    if (session.agreementRecord.mandateVersion !== (session.mandate.version ?? 1)) {
      return {
        success: false,
        sessionId,
        error: `Stale agreement rejected: agreement is from mandate version ${session.agreementRecord.mandateVersion}, current mandate is version ${session.mandate.version ?? 1}.`,
        blockedAtGate: true,
      };
    }
    if (session.agreementRecord.vendorId !== session.selectedQuote.vendorId) {
      return {
        success: false,
        sessionId,
        error: `Agreement vendor mismatch: recorded agreement vendor ${session.agreementRecord.vendorId} does not match selected vendor ${session.selectedQuote.vendorId}.`,
        blockedAtGate: true,
      };
    }
    if (
      session.agreementRecord.vendorName &&
      session.selectedQuote.vendorName &&
      session.agreementRecord.vendorName !== session.selectedQuote.vendorName
    ) {
      return {
        success: false,
        sessionId,
        error: `Agreement vendor name mismatch: recorded agreement vendor name ${session.agreementRecord.vendorName} does not match selected vendor name ${session.selectedQuote.vendorName}.`,
        blockedAtGate: true,
      };
    }

    // Ensure verified evidence flight record is attached and synchronized
    if (!session.flightRecord) {
      return { success: false, sessionId, error: "Authoritative commercial evidence is missing. Historical agreement requires reconciliation.", blockedAtGate: true };
    } else {
      const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
      const integrity = recorder.verifyIntegrity(session.preSettlementRoot ?? session.merkleRoot);
      if (!integrity.valid) {
        return {
          success: false,
          sessionId,
          error: `Flight recorder cryptographic integrity failed: ${integrity.error ?? "evidence root mismatch"}`,
          blockedAtGate: true,
        };
      }
    }

    const finalOffer = session.finalOffer;
    const totalAmount = exactLandedTotal(finalOffer.unitPrice, finalOffer.quantity, finalOffer.shippingCost);

    // Evaluate authoritative ACWORLD Pre-Checkout Audit Gate
    const preAuditCert = this.auditor.audit({ session });

    applyAuditCertificate(session, preAuditCert);
    if (preAuditCert.passed) {
      session.preSettlementRoot = preAuditCert.verifiedRoot;
      session.merkleRoot = preAuditCert.verifiedRoot;
    }
    await saveSessionCheckpoint(session);

    // Pre-flight check against mandate constraints
    if (totalAmount > session.mandate.maxTotalBudget) {
      return {
        success: false,
        sessionId,
        error: `Agreed total landed cost (${formatCurrency(totalAmount, session.mandate.currency)}) exceeds maximum total budget (${formatCurrency(session.mandate.maxTotalBudget, session.mandate.currency)}).`,
        blockedAtGate: true,
      };
    }

    if (finalOffer.deliveryDays > session.mandate.maxDeliveryDays) {
      return {
        success: false,
        sessionId,
        error: `Delivery timeframe (${finalOffer.deliveryDays} days) exceeds mandate SLA (${session.mandate.maxDeliveryDays} days).`,
        blockedAtGate: true,
      };
    }

    if (finalOffer.returnDays < session.mandate.minReturnDays) {
      return {
        success: false,
        sessionId,
        error: `Return policy window (${finalOffer.returnDays} days) is less than mandate minimum (${session.mandate.minReturnDays} days).`,
        blockedAtGate: true,
      };
    }

    if (!preAuditCert.passed) {
      const failingInvariants = preAuditCert.invariants
        .filter((inv) => !inv.passed)
        .map((inv) => `${inv.name}: ${inv.reason || "failed"}`)
        .join("; ");
      return {
        success: false,
        sessionId,
        error: `ACWORLD audit gate failed pre-checkout verification: ${failingInvariants}`,
        blockedAtGate: true,
      };
    }

    // Evaluate centralized settlement eligibility
    const eligibility = evaluateSettlementEligibility(session);
    if (!eligibility.eligible) {
      return {
        success: false,
        sessionId,
        error: eligibility.blockers[0] || "Session is not eligible for settlement checkout.",
        blockedAtGate: true,
      };
    }

    const isCrossCurrency = !isPayPalSupportedCurrency(session.mandate.currency);
    let settlementCurrency = session.mandate.currency;
    let settlementTotal = totalAmount;
    let settlementUnitPrice = finalOffer.unitPrice;
    let settlementShipping = finalOffer.shippingCost;

    if (isCrossCurrency) {
      if (!session.fxRecord) {
        return {
          success: false,
          sessionId,
          error: `Automated PayPal settlement is unavailable for '${session.mandate.currency}' in the configured PayPal environment without an approved FX settlement quote. An FX quote must be locked before checkout.`,
          blockedAtGate: true,
        };
      }

      if (session.fxRecord.status !== "LOCKED") {
        return {
          success: false,
          sessionId,
          error: `FX settlement quote is in '${session.fxRecord.status}' state. Quote must be 'LOCKED' to fix the exchange rate before PayPal checkout.`,
          blockedAtGate: true,
        };
      }

      const fxAudit = auditFxSettlement({ session, fxRecord: session.fxRecord });
      if (!fxAudit.passed) {
        return {
          success: false,
          sessionId,
          error: `ACWORLD FX Settlement Verification failed: ${fxAudit.error}`,
          blockedAtGate: true,
        };
      }

      settlementCurrency = session.fxRecord.targetCurrency;
      settlementTotal = fromMinorUnits(session.fxRecord.targetAmountMinor);
      settlementUnitPrice = settlementTotal / finalOffer.quantity;
      settlementShipping = 0;
    }

    const baseOrigin = origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnUrl = `${baseOrigin}/settlement/return?sessionId=${encodeURIComponent(sessionId)}`;
    const cancelUrl = `${baseOrigin}/settlement/cancel?sessionId=${encodeURIComponent(sessionId)}`;

    const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";

    const orderResult = await this.paypalClient.createAuthorizedOrder({
        sessionId,
        merkleRoot: preSettlementRoot,
        currency: settlementCurrency,
        unitPrice: settlementUnitPrice,
        quantity: finalOffer.quantity,
        shippingCost: settlementShipping,
        totalAmount: settlementTotal,
        productTitle: session.selectedQuote.productTitle,
        returnUrl,
        cancelUrl,
        userAction: "CONTINUE",
      });

      if (!orderResult.approvalUrl) {
        return {
          success: false,
          sessionId,
          orderId: orderResult.id,
          error: "PayPal did not return an approval redirect link.",
        };
      }

      // Security check: Verify approval URL belongs to PayPal Sandbox domain
      const parsedUrl = new URL(orderResult.approvalUrl);
      const allowedHosts = [
        "www.sandbox.paypal.com",
        "sandbox.paypal.com",
        "api-m.sandbox.paypal.com",
        "www.paypal.com",
      ];

      if (!allowedHosts.includes(parsedUrl.hostname)) {
        return {
          success: false,
          sessionId,
          orderId: orderResult.id,
          error: `Security violation: Untrusted PayPal redirect hostname '${parsedUrl.hostname}'.`,
          blockedAtGate: true,
        };
      }

      session.paypalOrderId = orderResult.id;
      session.paypalApprovalUrl = orderResult.approvalUrl;
      session.status = "AWAITING_PAYPAL_APPROVAL";
      await saveSessionCheckpoint(session);

      return {
        success: true,
        sessionId,
        orderId: orderResult.id,
        approvalUrl: orderResult.approvalUrl,
      };
    } catch (err: unknown) {
      return {
        success: false,
        sessionId,
        error: err instanceof Error ? err.message : "Failed to initiate PayPal checkout.",
        blockedAtGate: true,
      };
    } finally {
      sessionStore.releaseLock(sessionId);
    }
  }

  /**
   * Phase B: Complete Settlement & Audited Capture
   * 1. Validates authoritative session and matches order ID.
   * 2. Authoritatively verifies order status with PayPal Orders v2 API.
   * 3. Confirms buyer approval and authorizes order (intent: AUTHORIZE).
   * 4. Enforces the INDEPENDENT ACWORLD FINAL-STATE AUDIT GATE.
   * 5. If audit passes: executes audited capture of authorized funds.
   * 6. Commits ACWORLD_FINAL_STATE_AUDIT and SETTLEMENT_CAPTURED to Merkle flight recorder.
   * 7. Generates negotiated B2B invoice.
   */
  public async completeSettlement(request: CompleteSettlementRequest): Promise<SettleResponse> {
    const { sessionId, orderId, createInvoice = true } = request;

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        sessionId,
        auditCertificate: this.buildFailedCertificate(sessionId, "Session does not exist."),
        error: `Session ${sessionId} not found in authoritative session store.`,
        blockedAtGate: true,
      };
    }

    // Concurrency check
    if (!sessionStore.acquireLock(sessionId)) {
      return {
        success: false,
        sessionId,
        auditCertificate: this.buildFailedCertificate(sessionId, "Capture operation currently in progress."),
        error: `Settlement capture is already executing for session ${sessionId}.`,
        blockedAtGate: true,
      };
    }

    try {
      if (session.status === "PAYPAL_CAPTURED" || session.status === "SETTLED") {
        return {
          success: false,
          sessionId,
          auditCertificate: session.auditCertificate ?? this.buildFailedCertificate(sessionId, "Already captured."),
          orderId: session.paypalOrderId,
          captureId: session.paypalCaptureId,
          invoiceId: session.paypalInvoiceId,
          error: `Session ${sessionId} has already been settled and captured.`,
          blockedAtGate: true,
        };
      }

      if (session.status === "CAPTURE_PENDING_RECONCILIATION") {
        return {
          success: false,
          sessionId,
          auditCertificate: session.auditCertificate ?? this.buildFailedCertificate(sessionId, "Capture outcome uncertain: reconciliation required before re-attempting capture."),
          orderId: session.paypalOrderId,
          error: `Session ${sessionId} is in CAPTURE_PENDING_RECONCILIATION state. Blind capture retry is blocked. Authoritative reconciliation is required.`,
          blockedAtGate: true,
          uncertain: true,
        };
      }

      if (session.status === "CANCELLED" || session.status === "DISPUTED") {
        return {
          success: false,
          sessionId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Session is cancelled."),
          error: `Session ${sessionId} is cancelled and cannot be captured.`,
          blockedAtGate: true,
        };
      }

      if (!session.paypalOrderId) return { success: false, sessionId, auditCertificate: this.buildFailedCertificate(sessionId, "Missing authoritative PayPal order binding."), error: "Missing authoritative PayPal order binding.", blockedAtGate: true };

      // Verify orderId binding to avoid arbitrary client injection
      if (session.paypalOrderId && orderId && session.paypalOrderId !== orderId) {
        return {
          success: false,
          sessionId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Order ID does not match authoritative session."),
          error: `Provided Order ID ${orderId} does not match authoritative session order ${session.paypalOrderId}. Client order injection rejected.`,
          blockedAtGate: true,
        };
      }

      if (!session.finalOffer || !session.selectedQuote) {
        return {
          success: false,
          sessionId,
          auditCertificate: this.buildFailedCertificate(sessionId, "No final agreed offer."),
          error: `Session ${sessionId} has no final agreed offer or selected quote.`,
          blockedAtGate: true,
        };
      }

      if (session.agreementRecord) {
        if (session.agreementRecord.sessionId && session.agreementRecord.sessionId !== sessionId) {
          return {
            success: false,
            sessionId,
            auditCertificate: this.buildFailedCertificate(sessionId, "Agreement session mismatch."),
            error: `Agreement session mismatch: recorded agreement session ${session.agreementRecord.sessionId} does not match active session ${sessionId}.`,
            blockedAtGate: true,
          };
        }
        if (session.agreementRecord.mandateVersion !== (session.mandate.version ?? 1)) {
          return {
            success: false,
            sessionId,
            auditCertificate: this.buildFailedCertificate(sessionId, "Stale agreement from older mandate version."),
            error: `Stale agreement rejected: agreement is from mandate version ${session.agreementRecord.mandateVersion}, current mandate is version ${session.mandate.version ?? 1}.`,
            blockedAtGate: true,
          };
        }
        if (session.agreementRecord.vendorId !== session.selectedQuote.vendorId) {
          return {
            success: false,
            sessionId,
            auditCertificate: this.buildFailedCertificate(sessionId, "Agreement vendor mismatch."),
            error: `Agreement vendor mismatch: recorded agreement vendor ${session.agreementRecord.vendorId} does not match selected vendor ${session.selectedQuote.vendorId}.`,
            blockedAtGate: true,
          };
        }
        if (
          session.agreementRecord.vendorName &&
          session.selectedQuote.vendorName &&
          session.agreementRecord.vendorName !== session.selectedQuote.vendorName
        ) {
          return {
            success: false,
            sessionId,
            auditCertificate: this.buildFailedCertificate(sessionId, "Agreement vendor name mismatch."),
            error: `Agreement vendor name mismatch: recorded agreement vendor name ${session.agreementRecord.vendorName} does not match selected vendor name ${session.selectedQuote.vendorName}.`,
            blockedAtGate: true,
          };
        }
      }

      const effectiveOrderId = orderId || session.paypalOrderId;
      if (!effectiveOrderId) {
        return {
          success: false,
          sessionId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Missing PayPal order ID."),
          error: `Session ${sessionId} has no associated PayPal order ID.`,
          blockedAtGate: true,
        };
      }
      const finalOffer = session.finalOffer;
      const totalAmount = exactLandedTotal(finalOffer.unitPrice, finalOffer.quantity, finalOffer.shippingCost);
      const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";
      const expectedCustomId = `VERIPAY_ROOT:${preSettlementRoot};SESSION:${sessionId}`;

      // 1. Authoritative verification with PayPal API
      const orderDetails = await this.paypalClient.getOrder(effectiveOrderId);

      // Verify buyer approval status
      if (orderDetails.status === "PAYER_ACTION_REQUIRED" || orderDetails.status === "CREATED") {
        return {
          success: false,
          sessionId,
          orderId: effectiveOrderId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Order awaiting buyer approval on PayPal Sandbox."),
          error: "Order has not yet been approved by buyer on PayPal Sandbox.",
          blockedAtGate: true,
        };
      }

      // Verify intent is AUTHORIZE
      if (orderDetails.intent !== "AUTHORIZE") {
        return {
          success: false,
          sessionId,
          orderId: effectiveOrderId,
          auditCertificate: this.buildFailedCertificate(sessionId, `Order intent mismatch: ${orderDetails.intent}`),
          error: `PayPal order intent is '${orderDetails.intent}'. PACTRA requires intent 'AUTHORIZE'.`,
          blockedAtGate: true,
        };
      }

      // Verify settlement currency and amount match authoritative calculation
      const isCrossCurrency = Boolean(session.fxRecord);
      const expectedCurrency = isCrossCurrency ? session.fxRecord!.targetCurrency : session.mandate.currency;
      const expectedAmount = isCrossCurrency
        ? fromMinorUnits(session.fxRecord!.targetAmountMinor)
        : totalAmount;

      const orderCurrency = orderDetails.purchase_units?.[0]?.amount?.currency_code;
      if (!orderCurrency || orderCurrency !== expectedCurrency) {
        return {
          success: false,
          sessionId,
          orderId: effectiveOrderId,
          auditCertificate: this.buildFailedCertificate(sessionId, `Order currency mismatch: PayPal ${orderCurrency} vs Expected ${expectedCurrency}`),
          error: `PayPal order currency '${orderCurrency}' does not match expected settlement currency '${expectedCurrency}'.`,
          blockedAtGate: true,
        };
      }

      const orderAmountStr = orderDetails.purchase_units?.[0]?.amount?.value;
      if (orderAmountStr) {
        const orderAmount = parseFloat(orderAmountStr);
        if (!Number.isFinite(orderAmount) || toMinorUnits(orderAmount) !== toMinorUnits(expectedAmount)) {
          return {
            success: false,
            sessionId,
            orderId: effectiveOrderId,
            auditCertificate: this.buildFailedCertificate(sessionId, `Order amount mismatch: PayPal ${orderAmount} vs Expected ${expectedAmount}`),
            error: isCrossCurrency
              ? `PayPal order amount ($${orderAmount}) does not match expected settlement amount ($${expectedAmount}).`
              : `PayPal order amount ($${orderAmount}) does not match session agreed amount ($${expectedAmount}).`,
            blockedAtGate: true,
          };
        }
      }

      // Verify custom_id cryptographic binding if present
      const actualCustomId = orderDetails.purchase_units?.[0]?.custom_id;
      if (actualCustomId !== expectedCustomId) {
        return {
          success: false,
          sessionId,
          orderId: effectiveOrderId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Order custom_id does not match Merkle root binding."),
          error: `PayPal custom_id mismatch: expected '${expectedCustomId}', got '${actualCustomId}'.`,
          blockedAtGate: true,
        };
      }

      const remoteEvidenceError = orderEvidenceError(orderDetails, effectiveOrderId, expectedCustomId, expectedCurrency, expectedAmount);
      if (remoteEvidenceError) return { success: false, sessionId, auditCertificate: this.buildFailedCertificate(sessionId, remoteEvidenceError), error: remoteEvidenceError, blockedAtGate: true };
      if (!["APPROVED", "COMPLETED"].includes(orderDetails.status)) return { success: false, sessionId, auditCertificate: this.buildFailedCertificate(sessionId, "Invalid remote order state."), error: "Invalid remote order state.", blockedAtGate: true };

      // 2. Authorize order (if in APPROVED status)
      let authorizationId = session.paypalAuthorizationId;
      if (!authorizationId && orderDetails.status === "APPROVED") {
        const authRes = await this.paypalClient.authorizeOrder(effectiveOrderId);
        authorizationId = authRes.authorizationId;
        session.paypalAuthorizationId = authorizationId;
        session.status = "PAYPAL_AUTHORIZED";
        await saveSessionCheckpoint(session);
      } else if (!authorizationId) {
        authorizationId =
          orderDetails.purchase_units?.[0]?.payments?.authorizations?.find(a => a.status === "CREATED")?.id;
        session.paypalAuthorizationId = authorizationId;
      }

      // Ensure verified evidence flight record is attached and synchronized
      if (!session.flightRecord) {
        return { success: false, sessionId, error: "Authoritative commercial evidence is missing. Historical agreement requires reconciliation.", auditCertificate: this.buildFailedCertificate(sessionId, "Authoritative commercial evidence is missing. Historical agreement requires reconciliation."), blockedAtGate: true };
      }

      // 3. INDEPENDENT ACWORLD FINAL-STATE AUDIT GATE
      const auditCertificate = this.auditor.audit({
        session,
        expectedOrderCustomId: expectedCustomId,
      });

      applyAuditCertificate(session, auditCertificate);

      // FAIL-CLOSED GATE CHECK: If audit fails, strictly block capture
      if (!auditCertificate.passed) {
        session.status = "AUDIT_FAILED";
        await saveSessionCheckpoint(session);

        const failedInvariants = auditCertificate.invariants
          .filter((inv) => !inv.passed)
          .map((inv) => `${inv.name}: ${inv.reason}`)
          .join("; ");

        return {
          success: false,
          sessionId,
          auditCertificate,
          orderId: effectiveOrderId,
          authorizationId,
          error: `ACWORLD Audit Gate Failed: ${failedInvariants}`,
          blockedAtGate: true,
        };
      }

      session.status = "AUDIT_PASSED";
      await saveSessionCheckpoint(session);

      // 3.5 INDEPENDENT ACWORLD FX SETTLEMENT VERIFICATION GATE
      if (session.fxRecord) {
        const fxAuditResult = auditFxSettlement({
          session,
          fxRecord: session.fxRecord,
          expectedPayPalOrder: {
            currency: orderCurrency || expectedCurrency,
            amountMinor: toMinorUnits(parseFloat(orderAmountStr || expectedAmount.toString())),
          },
        });

        session.fxVerification = { ...fxAuditResult, conversionHash: session.fxRecord.conversionHash, agreementHash: session.fxRecord.agreementHash };
        if (!fxAuditResult.passed) {
          session.status = "AUDIT_FAILED";
          await saveSessionCheckpoint(session);

          return {
            success: false,
            sessionId,
            auditCertificate: this.buildFailedCertificate(
              sessionId,
              `ACWORLD FX Settlement Verification Failed: ${fxAuditResult.error}`
            ),
            orderId: effectiveOrderId,
            authorizationId,
            error: `ACWORLD FX Verification Failed: ${fxAuditResult.error}`,
            blockedAtGate: true,
          };
        }
      }

      // 4. AUDITED CAPTURE OPERATION
      // Idempotency: Check if remote order was already captured on PayPal (e.g. from an earlier interrupted attempt)
      const existingCaptures = orderDetails.purchase_units?.[0]?.payments?.captures;
      const completedCapture = existingCaptures?.find((c) => c.status === "COMPLETED");

      if (completedCapture && (existingCaptures?.length !== 1 || !completedCapture.id || paymentAmountError(completedCapture.amount, expectedCurrency, expectedAmount))) {
        session.status = "CAPTURE_PENDING_RECONCILIATION";
        await saveSessionCheckpoint(session);
        return { success: false, sessionId, auditCertificate, error: "Existing capture amount mismatch or incomplete capture evidence.", uncertain: true, blockedAtGate: true };
      }
      if (!completedCapture && (existingCaptures?.length || !authorizationId || ["CAPTURE_SUBMITTED", "UNCERTAIN", "CAPTURED"].includes(session.captureIntent?.status ?? ""))) {
        session.status = "CAPTURE_PENDING_RECONCILIATION";
        await saveSessionCheckpoint(session);
        return { success: false, sessionId, auditCertificate, error: "Capture evidence remains uncertain; reconciliation required.", uncertain: true, blockedAtGate: true };
      }

      if (!completedCapture) {
        const eligibility = evaluateSettlementEligibility(session);
        if (!eligibility.eligible) return { success: false, sessionId, auditCertificate, error: eligibility.blockers.join("; "), blockedAtGate: true };
      }

      const captureIntentId = session.captureIntent?.intentId ?? `cintent_${crypto.randomBytes(8).toString("hex")}`;
      const captureIntent: CaptureIntentRecord = {
        intentId: captureIntentId,
        sessionId,
        orderId: effectiveOrderId,
        authorizationId,
        amount: expectedAmount,
        currency: expectedCurrency,
        preSettlementRoot,
        mandateVersion: session.mandate.version ?? 1,
        status: completedCapture ? "CAPTURED" : "PENDING_CAPTURE",
        paypalCaptureId: completedCapture ? completedCapture.id : undefined,
        createdAt: session.captureIntent?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      session.captureIntent = captureIntent;
      await saveSessionCheckpoint(session);

      settlementLogger.info("CAPTURE_INTENT_CREATED", "Capture intent record persisted", {
        correlationId: sessionId,
        sessionId,
        orderId: effectiveOrderId,
        metadata: {
          intentId: captureIntentId,
          status: captureIntent.status,
          amount: expectedAmount,
          currency: expectedCurrency,
        },
      });

      let captureId: string;
      if (completedCapture) {
        captureId = completedCapture.id;
      } else {
        const captureTarget = authorizationId || effectiveOrderId;
        try {
          captureIntent.status = "CAPTURE_SUBMITTED";
          captureIntent.updatedAt = new Date().toISOString();
          session.captureIntent = captureIntent;
          await saveSessionCheckpoint(session);

          settlementLogger.info("CAPTURE_SUBMITTED", "PayPal capture requested", {
            correlationId: sessionId,
            sessionId,
            orderId: effectiveOrderId,
            metadata: { captureTarget, amount: expectedAmount },
          });

          const captureResult = await this.paypalClient.capturePayment(captureTarget, {
            currency: expectedCurrency,
            value: expectedAmount,
          });

          if (captureResult.status !== "COMPLETED") {
            captureIntent.status = "UNCERTAIN";
            session.status = "CAPTURE_PENDING_RECONCILIATION";
            captureIntent.lastError = `PayPal capture returned non-completed status: ${captureResult.status}`;
            captureIntent.updatedAt = new Date().toISOString();
            session.captureIntent = captureIntent;
            await saveSessionCheckpoint(session);

            settlementLogger.error("CAPTURE_FAILED", `PayPal capture returned non-completed status: ${captureResult.status}`, {
              correlationId: sessionId,
              sessionId,
              orderId: effectiveOrderId,
            });

            return {
              success: false,
              sessionId,
              auditCertificate,
              orderId: effectiveOrderId,
              authorizationId,
              error: `PayPal capture returned non-completed status: ${captureResult.status}`,
              uncertain: true,
              blockedAtGate: false,
            };
          }
          if (!captureResult.id || paymentAmountError(captureResult.amount, expectedCurrency, expectedAmount)) {
            throw new Error("Uncertain capture: remote capture amount/currency mismatch or missing evidence.");
          }
          captureId = captureResult.id;
          captureIntent.status = "CAPTURED";
          captureIntent.paypalCaptureId = captureId;
          captureIntent.updatedAt = new Date().toISOString();
          session.captureIntent = captureIntent;
        } catch (captureErr: unknown) {
          const errMsg = captureErr instanceof Error ? captureErr.message : String(captureErr);
          // Submission may have reached PayPal even when the response is malformed or unavailable.
          captureIntent.status = "UNCERTAIN";
          captureIntent.lastError = errMsg;
          captureIntent.updatedAt = new Date().toISOString();
          session.captureIntent = captureIntent;
          session.status = "CAPTURE_PENDING_RECONCILIATION";
          await saveSessionCheckpoint(session);
          settlementLogger.error("CAPTURE_OUTCOME_UNCERTAIN", "Capture outcome requires authoritative reconciliation.", {
            correlationId: sessionId, sessionId, orderId: effectiveOrderId, metadata: { intentId: captureIntentId },
          });
          return {
            success: false, sessionId, auditCertificate, orderId: effectiveOrderId, authorizationId,
            error: `Capture outcome could not be confirmed: ${errMsg}. Session left in uncertain remote state and marked CAPTURE_PENDING_RECONCILIATION for authoritative reconciliation.`,
            uncertain: true, blockedAtGate: false,
          };
        }
      }

      session.paypalCaptureId = captureId;
      session.captureAmount = expectedAmount;
      session.status = "PAYPAL_CAPTURED";
      consumeFxRecord(session);
      await saveSessionCheckpoint(session);

      // 5. Post-Audit & Settlement Merkle Event Commitment
      if (session.flightRecord) {
        const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
        recorder.recordEvent(
          "ACWORLD_AUDIT_PASSED",
          {
            certificateId: auditCertificate.certificateId,
            sessionId,
            passed: auditCertificate.passed,
            verifiedRoot: auditCertificate.verifiedRoot,
          },
          {
            mandateVersion: session.mandate.version ?? 1,
            agreementId: session.agreementRecord?.agreementId,
            timestamp: auditCertificate.timestamp,
          }
        );
        recorder.recordEvent(
          "SETTLEMENT_COMPLETED",
          {
            sessionId,
            paypalOrderId: session.paypalOrderId,
            paypalAuthorizationId: authorizationId,
            paypalCaptureId: session.paypalCaptureId,
            amount: expectedAmount,
            currency: expectedCurrency,
            commercialAmount: totalAmount,
            commercialCurrency: session.mandate.currency,
            fxConversionHash: session.fxRecord?.conversionHash,
            status: "SETTLED",
          },
          {
            mandateVersion: session.mandate.version ?? 1,
            agreementId: session.agreementRecord?.agreementId,
            timestamp: new Date().toISOString(),
          }
        );
        session.flightRecord = recorder.exportFlightRecord();
        session.postAuditRoot = recorder.getRootHash();
      } else {
        const merkleTree = new VeriPayMerkleTree();
        merkleTree.addEvent("ACWORLD_FINAL_STATE_AUDIT", {
          sessionId,
          certificateId: auditCertificate.certificateId,
          passed: auditCertificate.passed,
          verifiedRoot: auditCertificate.verifiedRoot,
          timestamp: new Date().toISOString(),
        });
        merkleTree.addEvent("SETTLEMENT_CAPTURED", {
          sessionId,
          paypalOrderId: session.paypalOrderId,
          paypalCaptureId: session.paypalCaptureId,
          amount: expectedAmount,
          currency: expectedCurrency,
          commercialAmount: totalAmount,
          commercialCurrency: session.mandate.currency,
          fxConversionHash: session.fxRecord?.conversionHash,
          timestamp: new Date().toISOString(),
        });
        session.postAuditRoot = merkleTree.getRootHash();
      }

      // 6. B2B Negotiated Invoice Creation
      let invoiceId: string | undefined;
      if (createInvoice) {
        const invoiceResult = await this.paypalClient.createNegotiatedInvoice({
          sessionId,
          merkleRoot: session.postAuditRoot,
          currency: expectedCurrency,
          unitPrice: isCrossCurrency ? expectedAmount / finalOffer.quantity : finalOffer.unitPrice,
          quantity: finalOffer.quantity,
          shippingCost: isCrossCurrency ? 0 : finalOffer.shippingCost,
          productTitle: isCrossCurrency
            ? `${session.selectedQuote.productTitle} (FX Settled: ${formatCurrency(session.agreementRecord?.totalCost || totalAmount, session.mandate.currency)} @ 1 USD = ₹${session.fxRecord!.rate})`
            : session.selectedQuote.productTitle,
        });

        invoiceId = invoiceResult.id;
        session.paypalInvoiceId = invoiceId;
        session.invoiceStatus = invoiceResult.status === "DRAFT" ? "DRAFT" : "SENT";
      }

      session.status = "SETTLED";
      await saveSessionCheckpoint(session);

      return {
        success: true,
        sessionId,
        auditCertificate,
        orderId: session.paypalOrderId,
        authorizationId,
        captureId: session.paypalCaptureId,
        invoiceId,
        blockedAtGate: false,
      };
    } finally {
      sessionStore.releaseLock(sessionId);
    }
  }

  /**
   * Cancels checkout and reverts session from AWAITING_PAYPAL_APPROVAL to CANCELLED / AUDIT_PENDING.
   * Does NOT mark the transaction as paid.
   */
  public cancelCheckout(sessionId: string): { success: boolean; session?: ProcurementSession; error?: string } {
    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return { success: false, error: `Session ${sessionId} not found.` };
    }

    if (sessionStore.isLocked(sessionId) || ["SETTLED", "PAYPAL_CAPTURED", "DISPUTED", "CAPTURE_PENDING_RECONCILIATION"].includes(session.status)) {
      return { success: false, error: "Cannot cancel a captured, disputed, uncertain, or busy settlement. Authoritative reconciliation is required for uncertain capture." };
    }

    session.status = "CANCELLED";
    sessionStore.saveSession(session);
    return { success: true, session };
  }

  /**
   * Executes authoritative settlement (backward-compatible single-invocation wrapper):
   * Used by tests and automated scripts.
   */
  public async settle(request: SettleRequest): Promise<SettleResponse> {
    const { sessionId, createInvoice = true } = request;

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        sessionId,
        auditCertificate: this.buildFailedCertificate(sessionId, "Session does not exist."),
        error: `Session ${sessionId} not found in authoritative session store.`,
        blockedAtGate: true,
      };
    }

    if (session.status === "PAYPAL_CAPTURED" || session.status === "SETTLED") {
      return {
        success: false,
        sessionId,
        auditCertificate: session.auditCertificate ?? this.buildFailedCertificate(sessionId, "Already captured."),
        orderId: session.paypalOrderId,
        captureId: session.paypalCaptureId,
        invoiceId: session.paypalInvoiceId,
        error: `Session ${sessionId} has already been settled and captured.`,
        blockedAtGate: true,
      };
    }

    if (session.status === "CAPTURE_PENDING_RECONCILIATION") {
      return {
        success: false,
        sessionId,
        auditCertificate: session.auditCertificate ?? this.buildFailedCertificate(sessionId, "Session is pending reconciliation."),
        orderId: session.paypalOrderId,
        error: `Session ${sessionId} is in CAPTURE_PENDING_RECONCILIATION state. Blind capture retry is blocked. Explicit authoritative reconciliation is required.`,
        blockedAtGate: true,
        uncertain: true,
      };
    }

    if (session.status === "CANCELLED" || session.status === "AUDIT_FAILED") {
      return {
        success: false,
        sessionId,
        auditCertificate: this.buildFailedCertificate(sessionId, `Session has status '${session.status}'.`),
        error: `Session ${sessionId} has status '${session.status}' and cannot proceed to settlement.`,
        blockedAtGate: true,
      };
    }

    if (!session.finalOffer || !session.selectedQuote) {
      return {
        success: false,
        sessionId,
        auditCertificate: this.buildFailedCertificate(sessionId, "No final agreed offer."),
        error: `Session ${sessionId} has no final agreed offer or selected quote.`,
        blockedAtGate: true,
      };
    }

    if (session.agreementRecord) {
      if (session.agreementRecord.sessionId && session.agreementRecord.sessionId !== sessionId) {
        return {
          success: false,
          sessionId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Agreement session mismatch."),
          error: `Agreement session mismatch: recorded agreement session ${session.agreementRecord.sessionId} does not match active session ${sessionId}.`,
          blockedAtGate: true,
        };
      }
      if (session.agreementRecord.mandateVersion !== (session.mandate.version ?? 1)) {
        return {
          success: false,
          sessionId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Stale agreement from older mandate version."),
          error: `Stale agreement rejected: agreement is from mandate version ${session.agreementRecord.mandateVersion}, current mandate is version ${session.mandate.version ?? 1}.`,
          blockedAtGate: true,
        };
      }
      if (session.agreementRecord.vendorId !== session.selectedQuote.vendorId) {
        return {
          success: false,
          sessionId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Agreement vendor mismatch."),
          error: `Agreement vendor mismatch: recorded agreement vendor ${session.agreementRecord.vendorId} does not match selected vendor ${session.selectedQuote.vendorId}.`,
          blockedAtGate: true,
        };
      }
    }

    if (!session.paypalOrderId) {
      const checkout = await this.initiateCheckout({ sessionId });
      if (!checkout.success) return { success: false, sessionId, auditCertificate: sessionStore.getSession(sessionId)?.auditCertificate ?? this.buildFailedCertificate(sessionId, checkout.error ?? "Checkout blocked."), error: checkout.error, blockedAtGate: true };
    }
    const currentSession = sessionStore.getSession(sessionId)!;

    return this.completeSettlement({
      sessionId,
      orderId: currentSession.paypalOrderId,
      createInvoice,
    });
  }

  /**
   * Phase C: Reconcile Uncertain Settlement
   * Authoritatively inspects remote PayPal order to determine if a timed-out capture succeeded.
   * If remote capture completed: recovers session to PAYPAL_CAPTURED and finalizes.
   * If remote order is still authorized and uncaptured: leaves order safe for audited capture.
   */
  public async reconcileSettlement(request: { sessionId: string }): Promise<{
    success: boolean;
    sessionId: string;
    status: ProcurementSessionStatus;
    reconciled: boolean;
    captureId?: string;
    message: string;
    error?: string;
  }> {
    const { sessionId } = request;

    if (!sessionStore.acquireLock(sessionId)) {
      const current = sessionStore.getSession(sessionId);
      return {
        success: false,
        sessionId,
        status: current ? current.status : "CAPTURE_PENDING_RECONCILIATION",
        reconciled: false,
        message: `Settlement reconciliation is already in progress for session ${sessionId}.`,
        error: "Lock contention",
      };
    }

    try {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          sessionId,
          status: "CANCELLED",
          reconciled: false,
          message: `Session ${sessionId} not found.`,
          error: "Session not found",
        };
      }

      if (session.status !== "CAPTURE_PENDING_RECONCILIATION") {
        return {
          success: true,
          sessionId,
          status: session.status,
          reconciled: true,
          captureId: session.paypalCaptureId,
          message: `Session is not pending reconciliation (current status: ${session.status}).`,
        };
      }

      if (!session.paypalOrderId) {
        return {
          success: false,
          sessionId,
          status: session.status,
          reconciled: false,
          message: "No PayPal Order ID associated with session to reconcile.",
          error: "Missing order ID",
        };
      }

      const finalOffer = session.finalOffer;
      const totalAmount = finalOffer
        ? exactLandedTotal(finalOffer.unitPrice, finalOffer.quantity, finalOffer.shippingCost)
        : 0;
      const isCrossCurrency = Boolean(session.fxRecord);
      const expectedCurrency = isCrossCurrency ? session.fxRecord!.targetCurrency : session.mandate.currency;
      const expectedTotal = isCrossCurrency
        ? fromMinorUnits(session.fxRecord!.targetAmountMinor)
        : totalAmount;

      if (isCrossCurrency && session.fxRecord) {
        const fxAudit = auditFxSettlement({
          session,
          fxRecord: session.fxRecord,
          historical: true,
        });
        if (!fxAudit.passed) {
          return {
            success: false,
            sessionId,
            status: session.status,
            reconciled: false,
            message: `FX settlement audit verification failed: ${fxAudit.error}`,
            error: "FX settlement audit verification failed",
          };
        }
      }

      const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";
      const expectedCustomId = `VERIPAY_ROOT:${preSettlementRoot};SESSION:${sessionId}`;

      const orderDetails = await this.paypalClient.getOrder(session.paypalOrderId);

      const remoteEvidenceError = orderEvidenceError(orderDetails, session.paypalOrderId, expectedCustomId, expectedCurrency, expectedTotal);
      if (remoteEvidenceError) return { success: false, sessionId, status: session.status, reconciled: false, message: remoteEvidenceError, error: remoteEvidenceError };

      // Verify remote order currency
      const remoteCurrency = orderDetails.purchase_units?.[0]?.amount?.currency_code;
      if (remoteCurrency && remoteCurrency.toUpperCase() !== expectedCurrency.toUpperCase()) {
        return {
          success: false,
          sessionId,
          status: session.status,
          reconciled: false,
          message: `Reconciliation currency mismatch: remote order has currency '${remoteCurrency}', expected '${expectedCurrency}'.`,
          error: "Currency mismatch",
        };
      }

      // Verify remote order amount
      const remoteAmountStr = orderDetails.purchase_units?.[0]?.amount?.value;
      if (remoteAmountStr && expectedTotal > 0) {
        const remoteAmount = parseFloat(remoteAmountStr);
        if (!Number.isFinite(remoteAmount) || toMinorUnits(remoteAmount) !== toMinorUnits(expectedTotal)) {
          return {
            success: false,
            sessionId,
            status: session.status,
            reconciled: false,
            message: `Reconciliation amount mismatch: remote order amount ($${remoteAmount}) does not match agreed total ($${expectedTotal}).`,
            error: "Amount mismatch",
          };
        }
      }

      // Verify remote custom_id binding
      const actualCustomId = orderDetails.purchase_units?.[0]?.custom_id;
      if (actualCustomId !== expectedCustomId) {
        return {
          success: false,
          sessionId,
          status: session.status,
          reconciled: false,
          message: `Reconciliation custom_id mismatch: expected '${expectedCustomId}', got '${actualCustomId}'. Remote order belongs to different session/root.`,
          error: "Lineage mismatch",
        };
      }

      if (session.fxRecord) {
        const fxAudit = auditFxSettlement({ session, fxRecord: session.fxRecord, historical: true, expectedPayPalOrder: { currency: orderDetails.purchase_units![0].amount!.currency_code, amountMinor: toMinorUnits(expectedTotal) } });
        if (!fxAudit.passed) return { success: false, sessionId, status: session.status, reconciled: false, message: fxAudit.error ?? "FX verification failed." };
        session.fxVerification = { ...fxAudit, conversionHash: session.fxRecord.conversionHash, agreementHash: session.fxRecord.agreementHash };
      }

      const existingCaptures = orderDetails.purchase_units?.[0]?.payments?.captures;
      const completedCapture = existingCaptures?.find((c) => c.status === "COMPLETED");

      if (completedCapture) {
        const captureError = paymentAmountError(completedCapture.amount, expectedCurrency, expectedTotal);
        if (existingCaptures?.length !== 1 || !completedCapture.id || captureError) return { success: false, sessionId, status: session.status, reconciled: false, message: captureError ?? "Missing capture ID.", error: captureError ?? "Missing capture ID." };

        // Remote capture was successful! Reconcile session state
        session.paypalCaptureId = completedCapture.id;
        session.captureAmount = expectedTotal;
        consumeFxRecord(session);
        if (session.captureIntent) {
          session.captureIntent.status = "CAPTURED";
          session.captureIntent.paypalCaptureId = completedCapture.id;
          session.captureIntent.updatedAt = new Date().toISOString();
        }
        session.status = "PAYPAL_CAPTURED";
        session.updatedAt = new Date().toISOString();
        await saveSessionCheckpoint(session);

        settlementLogger.info("RECONCILIATION_RESOLVED", `Authoritative reconciliation confirmed remote capture ${completedCapture.id} completed on PayPal.`, {
          correlationId: sessionId,
          sessionId,
          metadata: { outcome: "CAPTURED", captureId: completedCapture.id },
        });

        return {
          success: true,
          sessionId,
          status: "PAYPAL_CAPTURED",
          reconciled: true,
          captureId: completedCapture.id,
          message: `Authoritative reconciliation confirmed remote capture ${completedCapture.id} completed on PayPal.`,
        };
      }

      if (existingCaptures?.length || (orderDetails.status === "COMPLETED" && !orderDetails.purchase_units?.[0]?.payments?.authorizations?.some(a => a.id && a.status === "CREATED"))) {
        return { success: false, sessionId, status: session.status, reconciled: false, message: "Remote order lacks complete verified capture evidence; reconciliation remains pending." };
      }

      // Inspect if order was cancelled or voided remotely
      if (orderDetails.status === "VOIDED") {
        session.status = "CANCELLED";
        if (session.captureIntent) {
          session.captureIntent.status = "FAILED";
          session.captureIntent.error = "Remote PayPal order was VOIDED.";
          session.captureIntent.updatedAt = new Date().toISOString();
        }
        session.updatedAt = new Date().toISOString();
        await saveSessionCheckpoint(session);

        return {
          success: true,
          sessionId,
          status: "CANCELLED",
          reconciled: true,
          message: "Remote PayPal order was VOIDED; session marked CANCELLED.",
        };
      }

      // If capture was previously submitted and is UNCERTAIN, do NOT blindly reset to PAYPAL_AUTHORIZED!
      // An in-flight capture request may still be processing remotely on PayPal's queue.
      // Resetting to PAYPAL_AUTHORIZED would enable a second capture request, risking double-charging.
      if (
        session.captureIntent &&
        (session.captureIntent.status === "UNCERTAIN" ||
          session.captureIntent.status === "CAPTURE_SUBMITTED")
      ) {
        session.status = "CAPTURE_PENDING_RECONCILIATION";
        session.captureIntent.status = "UNCERTAIN";
        session.captureIntent.updatedAt = new Date().toISOString();
        session.updatedAt = new Date().toISOString();
        await saveSessionCheckpoint(session);

        settlementLogger.warn(
          "RECONCILIATION_STILL_PENDING",
          "Remote order has no completed capture, but capture was previously submitted. Retaining CAPTURE_PENDING_RECONCILIATION to prevent blind double-capture.",
          {
            correlationId: sessionId,
            sessionId,
            metadata: {
              remoteStatus: orderDetails.status,
              intentId: session.captureIntent.intentId,
            },
          }
        );

        return {
          success: false,
          sessionId,
          status: "CAPTURE_PENDING_RECONCILIATION",
          reconciled: false,
          message: `Remote order is in status '${orderDetails.status}' with no completed captures. In-flight capture remains uncertain; blind capture retry is strictly blocked until remote capture completes or order is cancelled.`,
        };
      }

      if (!["APPROVED", "COMPLETED"].includes(orderDetails.status) || !orderDetails.purchase_units?.[0]?.payments?.authorizations?.some(a => a.id && a.status === "CREATED")) {
        return { success: false, sessionId, status: session.status, reconciled: false, message: "Remote authorization not confirmed; reconciliation remains pending." };
      }

      // If capture was never submitted to PayPal (e.g. unconfirmed initial state without capture intent),
      // reset to PAYPAL_AUTHORIZED so capture can proceed.
      session.status = "PAYPAL_AUTHORIZED";
      if (session.captureIntent) {
        session.captureIntent.status = "PENDING_CAPTURE";
        session.captureIntent.updatedAt = new Date().toISOString();
      }
      session.updatedAt = new Date().toISOString();
      await saveSessionCheckpoint(session);

      settlementLogger.info("RECONCILIATION_RESOLVED", "Reconciliation verified no capture was ever submitted. Status reset to PAYPAL_AUTHORIZED.", {
        correlationId: sessionId,
        sessionId,
        metadata: { message: "No remote capture submitted. Reset to PAYPAL_AUTHORIZED." },
      });

      return {
        success: true,
        sessionId,
        status: "PAYPAL_AUTHORIZED",
        reconciled: true,
        message: "Reconciliation verified no capture was ever submitted. Status reset to PAYPAL_AUTHORIZED.",
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        sessionId,
        status: "CAPTURE_PENDING_RECONCILIATION",
        reconciled: false,
        message: `Reconciliation query failed: ${errMsg}. Session remains in CAPTURE_PENDING_RECONCILIATION.`,
        error: errMsg,
      };
    } finally {
      sessionStore.releaseLock(sessionId);
    }
  }

  private buildFailedCertificate(sessionId: string, reason: string): AuditCertificate {
    return {
      certificateId: `audit_cert_failed_${Date.now()}`,
      sessionId,
      mandateVersion: 1,
      passed: false,
      status: "INVALID",
      auditType: "PRE_SETTLEMENT",
      invariants: [
        {
          name: "SKU_INTEGRITY",
          passed: false,
          status: "INVALID",
          code: "AUDIT_GATE_FAILED",
          reason,
        },
      ],
      verifiedRoot: "",
      timestamp: new Date().toISOString(),
    };
  }
}
