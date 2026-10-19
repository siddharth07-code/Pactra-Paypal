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
import type {
  AuditCertificate,
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
  captureId?: string;
  invoiceId?: string;
  error?: string;
  blockedAtGate?: boolean;
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
   * Executes authoritative settlement:
   * 1. Validates authoritative session from server store.
   * 2. Authorizes order if not already authorized.
   * 3. Runs independent ACWORLD final-state audit on session & order custom_id.
   * 4. Enforces FAIL-CLOSED capture gate: strictly blocks PayPal capture on any audit failure.
   * 5. Captures order only upon audit pass.
   * 6. Creates negotiated B2B invoice.
   * 7. Commits ACWORLD_FINAL_STATE_AUDIT and SETTLEMENT_CAPTURED events to Merkle tree.
   */
  public async settle(request: SettleRequest): Promise<SettleResponse> {
    const { sessionId, createInvoice = true } = request;

    // 1. Authoritative session retrieval
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

    // 2. Concurrency check
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
        error: `Session ${sessionId} has already been settled and captured.`,
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

    this.activeCaptureLocks.add(sessionId);

    try {
      const finalOffer = session.finalOffer;
      const totalAmount = finalOffer.unitPrice * finalOffer.quantity + finalOffer.shippingCost;
      const preSettlementRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";

      // 3. Authorize PayPal Order if not already created
      if (!session.paypalOrderId) {
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
        session.status = "PAYPAL_AUTHORIZED";
        sessionStore.saveSession(session);
      }

      // Expected customId bound to PayPal order
      const expectedCustomId = `VERIPAY_ROOT:${preSettlementRoot};SESSION:${sessionId}`;

      // 4. INDEPENDENT ACWORLD FINAL-STATE AUDIT GATE
      const auditCertificate = this.auditor.audit({
        session,
        expectedOrderCustomId: expectedCustomId,
      });

      session.auditCertificate = auditCertificate;

      // FAIL-CLOSED GATE CHECK: If audit fails, abort immediately without calling capture
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
          orderId: session.paypalOrderId,
          error: `ACWORLD Audit Gate Failed: ${failedInvariants}`,
          blockedAtGate: true,
        };
      }

      session.status = "AUDIT_PASSED";
      sessionStore.saveSession(session);

      // 5. AUDITED CAPTURE OPERATION
      // Re-check order amount matches final agreed amount
      const captureResult = await this.paypalClient.capturePayment(session.paypalOrderId, {
        currency: session.mandate.currency,
        value: totalAmount,
      });

      if (captureResult.status !== "COMPLETED") {
        return {
          success: false,
          sessionId,
          auditCertificate,
          orderId: session.paypalOrderId,
          error: `PayPal capture returned non-completed status: ${captureResult.status}`,
          blockedAtGate: false,
        };
      }

      session.paypalCaptureId = captureResult.id;
      session.captureAmount = totalAmount;
      session.status = "PAYPAL_CAPTURED";

      // 6. Post-Audit & Settlement Merkle Event Commitment
      const merkleTree = new VeriPayMerkleTree();
      // Record ACWORLD_FINAL_STATE_AUDIT
      merkleTree.addEvent("ACWORLD_FINAL_STATE_AUDIT", {
        sessionId,
        certificateId: auditCertificate.certificateId,
        passed: auditCertificate.passed,
        verifiedRoot: auditCertificate.verifiedRoot,
        timestamp: new Date().toISOString(),
      });

      // Record SETTLEMENT_CAPTURED
      merkleTree.addEvent("SETTLEMENT_CAPTURED", {
        sessionId,
        paypalOrderId: session.paypalOrderId,
        paypalCaptureId: session.paypalCaptureId,
        amount: totalAmount,
        currency: session.mandate.currency,
        timestamp: new Date().toISOString(),
      });

      session.postAuditRoot = merkleTree.getRootHash();

      // 7. B2B Negotiated Invoice Creation
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
        captureId: session.paypalCaptureId,
        invoiceId,
        blockedAtGate: false,
      };
    } finally {
      this.activeCaptureLocks.delete(sessionId);
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
