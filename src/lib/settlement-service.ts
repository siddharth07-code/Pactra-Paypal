/**
 * PACTUM — Settlement Service & Audited Capture Gate
 * Enforces the critical rule:
 * NO PAYPAL CAPTURE MAY OCCUR WITHOUT A SUCCESSFUL, INDEPENDENT SERVER-SIDE ACWORLD AUDIT.
 * Follows GEMINI.md Section 8, 9 and SECURITY.md Section 3, 7.
 */

import { AcworldAuditor } from "./acworld-auditor";
import { PayPalClient } from "./paypal-client";
import { sessionStore } from "./session-store";
import { VeriPayMerkleTree } from "./veripay-merkle";
import { CryptographicFlightRecorder } from "./flight-recorder";
import type {
  AuditCertificate,
  ProcurementSession,
  ProcurementSessionStatus,
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
  orderId: string;
  createInvoice?: boolean;
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
   * Phase A: Initiate Checkout
   * 1. Validates authoritative session from server store.
   * 2. Checks financial & SLA constraints against locked mandate.
   * 3. Creates PayPal Sandbox Orders v2 order with intent: "AUTHORIZE" and custom_id bound to Merkle root.
   * 4. Extracts and validates the official PayPal Sandbox approval redirect URL.
   * 5. Updates session status to AWAITING_PAYPAL_APPROVAL.
   */
  public async initiateCheckout(request: InitiateCheckoutRequest): Promise<InitiateCheckoutResponse> {
    const { sessionId, origin } = request;

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

    if (!session.finalOffer || !session.selectedQuote) {
      return {
        success: false,
        sessionId,
        error: `Session ${sessionId} has no final agreed offer or selected vendor quote.`,
        blockedAtGate: true,
      };
    }

    if (session.agreementRecord) {
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
    }

    const finalOffer = session.finalOffer;
    const totalAmount = finalOffer.unitPrice * finalOffer.quantity + finalOffer.shippingCost;

    // Pre-flight check against mandate constraints
    if (totalAmount > session.mandate.maxTotalBudget) {
      return {
        success: false,
        sessionId,
        error: `Agreed total landed cost ($${totalAmount}) exceeds maximum total budget ($${session.mandate.maxTotalBudget}).`,
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

    // Evaluate authoritative ACWORLD Pre-Checkout Audit Gate
    const preAuditCert = this.auditor.audit({ session });
    session.auditCertificate = preAuditCert;
    session.status = preAuditCert.passed ? "AUDIT_PASSED" : "AUDIT_FAILED";
    sessionStore.saveSession(session);

    if (!session.auditCertificate.passed) {
      const failingInvariants = session.auditCertificate.invariants
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

    const baseOrigin = origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnUrl = `${baseOrigin}/settlement/return?sessionId=${encodeURIComponent(sessionId)}`;
    const cancelUrl = `${baseOrigin}/settlement/cancel?sessionId=${encodeURIComponent(sessionId)}`;

    const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";

    try {
      const orderResult = await this.paypalClient.createAuthorizedOrder({
        sessionId,
        merkleRoot: preSettlementRoot,
        currency: session.mandate.currency,
        unitPrice: finalOffer.unitPrice,
        quantity: finalOffer.quantity,
        shippingCost: finalOffer.shippingCost,
        totalAmount,
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
      sessionStore.saveSession(session);

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
      };
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
    if (this.activeCaptureLocks.has(sessionId)) {
      return {
        success: false,
        sessionId,
        auditCertificate: this.buildFailedCertificate(sessionId, "Capture operation currently in progress."),
        error: `Settlement capture is already executing for session ${sessionId}.`,
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
        auditCertificate: session.auditCertificate ?? this.buildFailedCertificate(sessionId, "Capture outcome uncertain: reconciliation required before re-attempting capture."),
        orderId: session.paypalOrderId,
        error: `Session ${sessionId} is in CAPTURE_PENDING_RECONCILIATION state. Blind capture retry is blocked. Authoritative reconciliation is required.`,
        blockedAtGate: true,
        uncertain: true,
      };
    }

    if (session.status === "CANCELLED") {
      return {
        success: false,
        sessionId,
        auditCertificate: this.buildFailedCertificate(sessionId, "Session is cancelled."),
        error: `Session ${sessionId} is cancelled and cannot be captured.`,
        blockedAtGate: true,
      };
    }

    // Verify orderId binding to avoid arbitrary client injection
    if (session.paypalOrderId && session.paypalOrderId !== orderId) {
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
    }

    this.activeCaptureLocks.add(sessionId);

    try {
      const finalOffer = session.finalOffer;
      const totalAmount = finalOffer.unitPrice * finalOffer.quantity + finalOffer.shippingCost;
      const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";
      const expectedCustomId = `VERIPAY_ROOT:${preSettlementRoot};SESSION:${sessionId}`;

      // 1. Authoritative verification with PayPal API
      const orderDetails = await this.paypalClient.getOrder(orderId);

      // Verify buyer approval status
      if (orderDetails.status === "PAYER_ACTION_REQUIRED" || orderDetails.status === "CREATED") {
        return {
          success: false,
          sessionId,
          orderId,
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
          orderId,
          auditCertificate: this.buildFailedCertificate(sessionId, `Order intent mismatch: ${orderDetails.intent}`),
          error: `PayPal order intent is '${orderDetails.intent}'. PACTUM requires intent 'AUTHORIZE'.`,
          blockedAtGate: true,
        };
      }

      // Verify amount matches authoritative calculation
      const orderAmountStr = orderDetails.purchase_units?.[0]?.amount?.value;
      if (orderAmountStr) {
        const orderAmount = parseFloat(orderAmountStr);
        if (Math.abs(orderAmount - totalAmount) > 0.01) {
          return {
            success: false,
            sessionId,
            orderId,
            auditCertificate: this.buildFailedCertificate(sessionId, `Order amount mismatch: PayPal ${orderAmount} vs Session ${totalAmount}`),
            error: `PayPal order amount ($${orderAmount}) does not match session agreed amount ($${totalAmount}).`,
            blockedAtGate: true,
          };
        }
      }

      // Verify custom_id cryptographic binding if present
      const actualCustomId = orderDetails.purchase_units?.[0]?.custom_id;
      if (actualCustomId && actualCustomId !== expectedCustomId) {
        return {
          success: false,
          sessionId,
          orderId,
          auditCertificate: this.buildFailedCertificate(sessionId, "Order custom_id does not match Merkle root binding."),
          error: `PayPal custom_id mismatch: expected '${expectedCustomId}', got '${actualCustomId}'.`,
          blockedAtGate: true,
        };
      }

      // 2. Authorize order (if in APPROVED status)
      let authorizationId = session.paypalAuthorizationId;
      if (!authorizationId && orderDetails.status === "APPROVED") {
        const authRes = await this.paypalClient.authorizeOrder(orderId);
        authorizationId = authRes.authorizationId;
        session.paypalAuthorizationId = authorizationId;
        session.status = "PAYPAL_AUTHORIZED";
        sessionStore.saveSession(session);
      } else if (!authorizationId) {
        authorizationId =
          orderDetails.purchase_units?.[0]?.payments?.authorizations?.[0]?.id || orderId;
        session.paypalAuthorizationId = authorizationId;
      }

      // 3. INDEPENDENT ACWORLD FINAL-STATE AUDIT GATE
      const auditCertificate = this.auditor.audit({
        session,
        expectedOrderCustomId: expectedCustomId,
      });

      session.auditCertificate = auditCertificate;

      // FAIL-CLOSED GATE CHECK: If audit fails, strictly block capture
      if (!auditCertificate.passed) {
        session.status = "AUDIT_FAILED";
        sessionStore.saveSession(session);

        const failedInvariants = auditCertificate.invariants
          .filter((inv) => !inv.passed)
          .map((inv) => `${inv.name}: ${inv.reason}`)
          .join("; ");

        return {
          success: false,
          sessionId,
          auditCertificate,
          orderId,
          authorizationId,
          error: `ACWORLD Audit Gate Failed: ${failedInvariants}`,
          blockedAtGate: true,
        };
      }

      session.status = "AUDIT_PASSED";
      sessionStore.saveSession(session);

      // 4. AUDITED CAPTURE OPERATION
      // Idempotency: Check if remote order was already captured on PayPal (e.g. from an earlier interrupted attempt)
      const existingCaptures = orderDetails.purchase_units?.[0]?.payments?.captures;
      const completedCapture = existingCaptures?.find((c) => c.status === "COMPLETED");

      let captureId: string;
      if (completedCapture) {
        captureId = completedCapture.id;
      } else {
        const captureTarget = authorizationId || orderId;
        try {
          const captureResult = await this.paypalClient.capturePayment(captureTarget, {
            currency: session.mandate.currency,
            value: totalAmount,
          });

          if (captureResult.status !== "COMPLETED") {
            return {
              success: false,
              sessionId,
              auditCertificate,
              orderId,
              authorizationId,
              error: `PayPal capture returned non-completed status: ${captureResult.status}`,
              blockedAtGate: false,
            };
          }
          captureId = captureResult.id;
        } catch (captureErr: unknown) {
          const errMsg = captureErr instanceof Error ? captureErr.message : String(captureErr);
          const isTimeout = /timeout|abort|econnreset|etimedout/i.test(errMsg);
          if (isTimeout) {
            session.status = "CAPTURE_PENDING_RECONCILIATION";
            sessionStore.saveSession(session);
            return {
              success: false,
              sessionId,
              auditCertificate,
              orderId,
              authorizationId,
              error: `Network timeout communicating with PayPal during capture: ${errMsg}. Session left in uncertain remote state and marked CAPTURE_PENDING_RECONCILIATION for authoritative reconciliation.`,
              uncertain: true,
              blockedAtGate: false,
            };
          }
          throw captureErr;
        }
      }

      session.paypalCaptureId = captureId;
      session.captureAmount = totalAmount;
      session.status = "PAYPAL_CAPTURED";

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
            amount: totalAmount,
            currency: session.mandate.currency,
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
          amount: totalAmount,
          currency: session.mandate.currency,
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
          currency: session.mandate.currency,
          unitPrice: finalOffer.unitPrice,
          quantity: finalOffer.quantity,
          shippingCost: finalOffer.shippingCost,
          productTitle: session.selectedQuote.productTitle,
        });

        invoiceId = invoiceResult.id;
        session.paypalInvoiceId = invoiceId;
        session.invoiceStatus = invoiceResult.status === "DRAFT" ? "DRAFT" : "SENT";
      }

      session.status = "SETTLED";
      sessionStore.saveSession(session);

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
      this.activeCaptureLocks.delete(sessionId);
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

    if (session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED") {
      return { success: false, error: "Cannot cancel an already settled and captured session." };
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

    // Pre-create authorized order if not already present
    if (!session.paypalOrderId) {
      const finalOffer = session.finalOffer;
      const totalAmount = finalOffer.unitPrice * finalOffer.quantity + finalOffer.shippingCost;
      const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";

      const orderResult = await this.paypalClient.createAuthorizedOrder({
        sessionId,
        merkleRoot: preSettlementRoot,
        currency: session.mandate.currency,
        unitPrice: finalOffer.unitPrice,
        quantity: finalOffer.quantity,
        shippingCost: finalOffer.shippingCost,
        totalAmount,
        productTitle: session.selectedQuote.productTitle,
      });

      session.paypalOrderId = orderResult.id;
      session.paypalApprovalUrl = orderResult.approvalUrl;
      session.status = "PAYPAL_AUTHORIZED";
      sessionStore.saveSession(session);
    }

    return this.completeSettlement({
      sessionId,
      orderId: session.paypalOrderId,
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

    try {
      const orderDetails = await this.paypalClient.getOrder(session.paypalOrderId);
      const existingCaptures = orderDetails.purchase_units?.[0]?.payments?.captures;
      const completedCapture = existingCaptures?.find((c) => c.status === "COMPLETED");

      if (completedCapture) {
        // Remote capture was successful! Reconcile session state
        session.paypalCaptureId = completedCapture.id;
        session.status = "PAYPAL_CAPTURED";
        session.updatedAt = new Date().toISOString();
        sessionStore.saveSession(session);

        return {
          success: true,
          sessionId,
          status: "PAYPAL_CAPTURED",
          reconciled: true,
          captureId: completedCapture.id,
          message: `Authoritative reconciliation confirmed remote capture ${completedCapture.id} completed on PayPal.`,
        };
      }

      // Check if order is completed
      if (orderDetails.status === "COMPLETED") {
        session.status = "PAYPAL_CAPTURED";
        session.updatedAt = new Date().toISOString();
        sessionStore.saveSession(session);
        return {
          success: true,
          sessionId,
          status: "PAYPAL_CAPTURED",
          reconciled: true,
          message: "Authoritative reconciliation confirmed PayPal order completed.",
        };
      }

      // If still authorized without capture, reset to PAYPAL_AUTHORIZED so capture can be retried safely
      session.status = "PAYPAL_AUTHORIZED";
      session.updatedAt = new Date().toISOString();
      sessionStore.saveSession(session);

      return {
        success: true,
        sessionId,
        status: "PAYPAL_AUTHORIZED",
        reconciled: true,
        message: "Reconciliation verified no capture occurred remotely. Status reset to PAYPAL_AUTHORIZED.",
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
    }
  }

  private buildFailedCertificate(sessionId: string, reason: string): AuditCertificate {
    return {
      certificateId: `audit_cert_failed_${Date.now()}`,
      sessionId,
      passed: false,
      invariants: [
        {
          name: "SKU_INTEGRITY",
          passed: false,
          reason,
        },
      ],
      verifiedRoot: "",
      timestamp: new Date().toISOString(),
    };
  }
}
