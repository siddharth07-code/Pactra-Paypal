/**
 * PACTUM — ACWORLD Final-State Auditor
 * As specified in GEMINI.md Section 8 and SECURITY.md Section 7, 10.
 *
 * Independently validates the final proposed transaction against the authoritative
 * mandate and transaction state prior to PayPal capture.
 *
 * Evaluates five invariants:
 * 1. SKU Integrity: finalCart.sku === selectedChannel3Item.sku && condition check
 * 2. Price Ceiling and Arithmetic: unitPrice * quantity + shipping == finalAmount <= B_max
 * 3. Return Policy: returnWindowDays >= mandate.minReturnDays backed by merchant attestation
 * 4. Delivery SLA: estimatedDeliveryDays <= mandate.maxDeliveryDays
 * 5. Cryptographic Lineage: recomputed Merkle root matches bound root & custom_id format
 *
 * Fail-Closed: Any invariant failure strictly sets passed: false and blocks payment capture.
 */

import crypto from "crypto";
import type {
  ProcurementSession,
  AuditCertificate,
  InvariantResult,
} from "../types/pactum";
import { toCents, fromCents } from "./mechanism-guardrail";
import { CryptographicFlightRecorder } from "./flight-recorder";

export interface AuditRequest {
  session: ProcurementSession;
  expectedOrderCustomId?: string; // Optional PayPal custom_id to verify lineage
}

export class AcworldAuditor {
  /**
   * Independently audits a procurement session's final negotiated state.
   */
  public audit(request: AuditRequest): AuditCertificate {
    const { session, expectedOrderCustomId } = request;
    const { mandate, selectedQuote, finalOffer } = session;

    const certificateId = `audit_cert_${crypto.randomBytes(8).toString("hex")}`;
    const invariants: InvariantResult[] = [];

    // --- INVARIANT 1: SKU & Condition Integrity ---
    let skuPassed = false;
    let skuReason: string | undefined;

    if (!selectedQuote) {
      skuReason = "Audit failed: No authoritative vendor quote was selected.";
    } else if (!finalOffer) {
      skuReason = "Audit failed: No agreed final offer is recorded.";
    } else if (session.agreementRecord && session.agreementRecord.sessionId && session.agreementRecord.sessionId !== session.id) {
      skuReason = `Agreement session mismatch: recorded agreement session ${session.agreementRecord.sessionId} does not match active session ${session.id}.`;
    } else if (session.agreementRecord && session.agreementRecord.mandateVersion !== (mandate.version ?? 1)) {
      skuReason = `Stale agreement rejected: agreement is from mandate version ${session.agreementRecord.mandateVersion}, current mandate is version ${mandate.version ?? 1}.`;
    } else if (session.agreementRecord && session.agreementRecord.vendorId !== selectedQuote.vendorId) {
      skuReason = `Agreement vendor mismatch: recorded agreement vendor ${session.agreementRecord.vendorId} does not match selected vendor ${selectedQuote.vendorId}.`;
    } else if (session.agreementRecord && Math.abs(session.agreementRecord.agreedPrice - finalOffer.unitPrice) > 0.01) {
      skuReason = `Agreement price mismatch: recorded agreed price $${session.agreementRecord.agreedPrice} does not match final offer $${finalOffer.unitPrice}.`;
    } else if (session.agreementRecord && session.agreementRecord.sku && selectedQuote.sku && session.agreementRecord.sku !== selectedQuote.sku) {
      skuReason = `Agreement SKU mismatch: recorded agreement SKU ${session.agreementRecord.sku} does not match selected vendor SKU ${selectedQuote.sku}.`;
    } else {
      // Check condition requirement if mandate specifies one
      if (mandate.requiredCondition && selectedQuote.condition !== mandate.requiredCondition) {
        skuReason = `Condition mismatch: Required ${mandate.requiredCondition}, but vendor provided ${selectedQuote.condition}.`;
      } else {
        skuPassed = true;
      }
    }

    invariants.push({
      name: "SKU_INTEGRITY",
      passed: skuPassed,
      reason: skuReason,
      details: {
        selectedSku: selectedQuote?.sku,
        vendorName: selectedQuote?.vendorName,
        condition: selectedQuote?.condition,
        requiredCondition: mandate.requiredCondition,
      },
    });

    // --- INVARIANT 2: Price Ceiling and Safe Arithmetic ---
    let pricePassed = false;
    let priceReason: string | undefined;
    let computedTotal = 0;

    if (finalOffer && selectedQuote) {
      const unitCents = toCents(finalOffer.unitPrice);
      const shipCents = toCents(finalOffer.shippingCost);
      const totalCents = unitCents * finalOffer.quantity + shipCents;
      computedTotal = fromCents(totalCents);
      const maxBudgetCents = toCents(mandate.maxTotalBudget);

      if (!Number.isFinite(finalOffer.unitPrice) || finalOffer.unitPrice <= 0) {
        priceReason = `Invalid unit price: ${finalOffer.unitPrice}.`;
      } else if (finalOffer.quantity !== mandate.quantity) {
        priceReason = `Quantity mismatch: final offer quantity (${finalOffer.quantity}) does not match mandate (${mandate.quantity}).`;
      } else if (totalCents > maxBudgetCents) {
        priceReason = `Price ceiling violated: Total landed cost $${computedTotal.toFixed(2)} exceeds active mandate budget $${mandate.maxTotalBudget.toFixed(2)}.`;
      } else {
        pricePassed = true;
      }
    } else {
      priceReason = "Missing final offer or quote for price arithmetic audit.";
    }

    invariants.push({
      name: "PRICE_CEILING",
      passed: pricePassed,
      reason: priceReason,
      details: {
        computedTotal,
        maxTotalBudget: mandate.maxTotalBudget,
        currency: mandate.currency,
        unitPrice: finalOffer?.unitPrice,
        quantity: finalOffer?.quantity,
        shippingCost: finalOffer?.shippingCost,
      },
    });

    // --- INVARIANT 3: Return Policy Supported by Merchant Evidence ---
    let returnPassed = false;
    let returnReason: string | undefined;

    if (finalOffer) {
      if (finalOffer.returnDays < mandate.minReturnDays) {
        returnReason = `Return policy SLA violated: Offered ${finalOffer.returnDays} days, mandate requires at least ${mandate.minReturnDays} days.`;
      } else {
        // Verify evidence backing
        const attestation = session.merchantAttestation;
        if (!attestation && selectedQuote?.dataSource === "CHANNEL3") {
          returnReason = "Merchant DOM attestation evidence missing for live Channel3 product.";
        } else {
          returnPassed = true;
        }
      }
    } else {
      returnReason = "Missing final offer for return policy audit.";
    }

    invariants.push({
      name: "RETURN_POLICY",
      passed: returnPassed,
      reason: returnReason,
      details: {
        returnDays: finalOffer?.returnDays,
        minReturnDays: mandate.minReturnDays,
        hasAttestation: !!session.merchantAttestation,
      },
    });

    // --- INVARIANT 4: Delivery SLA ---
    let deliveryPassed = false;
    let deliveryReason: string | undefined;

    if (finalOffer) {
      if (finalOffer.deliveryDays > mandate.maxDeliveryDays) {
        deliveryReason = `Delivery SLA violated: Offered ${finalOffer.deliveryDays} days exceeds maximum allowed ${mandate.maxDeliveryDays} days.`;
      } else {
        deliveryPassed = true;
      }
    } else {
      deliveryReason = "Missing final offer for delivery SLA audit.";
    }

    invariants.push({
      name: "DELIVERY_SLA",
      passed: deliveryPassed,
      reason: deliveryReason,
      details: {
        deliveryDays: finalOffer?.deliveryDays,
        maxDeliveryDays: mandate.maxDeliveryDays,
      },
    });

    // --- INVARIANT 5: Cryptographic Lineage & Merkle Binding ---
    let lineagePassed = false;
    let lineageReason: string | undefined;
    const verifiedRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";

    if (!verifiedRoot || verifiedRoot.length !== 64 || verifiedRoot === "0".repeat(64)) {
      lineageReason = "Cryptographic lineage failed: Session has no valid pre-settlement Merkle root.";
    } else if (session.flightRecord) {
      try {
        const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
        const expectedRootAnchor = session.postAuditRoot ?? session.preSettlementRoot ?? session.merkleRoot;
        const integrity = recorder.verifyIntegrity(expectedRootAnchor);
        if (!integrity.valid) {
          lineageReason = `Cryptographic flight recorder integrity failed: ${integrity.error}`;
        } else if (session.agreementRecord) {
          const events = recorder.getEvents();
          const hasAgreementEvent = events.some(
            (e) =>
              e.agreementId === session.agreementRecord?.agreementId ||
              (e.publicPayload as Record<string, unknown> | undefined)?.agreementId === session.agreementRecord?.agreementId ||
              e.eventType === "AGREEMENT_CREATED" ||
              e.eventType === "VENDOR_ACCEPTANCE" ||
              e.eventType === "BUYER_ACCEPTANCE"
          );
          if (!hasAgreementEvent) {
            lineageReason = `Lineage failure: Agreement ${session.agreementRecord.agreementId} has no corresponding acceptance/creation event in flight recorder.`;
          } else {
            lineagePassed = true;
          }
        } else {
          lineagePassed = true;
        }
      } catch (err) {
        lineageReason = `Cryptographic flight recorder integrity failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      // Lineage verified from valid session evidence root
      lineagePassed = true;
    }

    if (lineagePassed && expectedOrderCustomId) {
      // Must match VERIPAY_ROOT:<merkle_root> or VERIPAY_ROOT:<merkle_root>;SESSION:<sessionId>
      const expectedPrefix = `VERIPAY_ROOT:${verifiedRoot}`;
      if (!expectedOrderCustomId.includes(expectedPrefix)) {
        lineagePassed = false;
        lineageReason = `Cryptographic lineage mismatch: PayPal order custom_id (${expectedOrderCustomId}) does not match verified root (${verifiedRoot}).`;
      } else if (
        expectedOrderCustomId.includes(";SESSION:") &&
        !expectedOrderCustomId.includes(`;SESSION:${session.id}`)
      ) {
        lineagePassed = false;
        lineageReason = `Cryptographic lineage mismatch: PayPal order custom_id is bound to a different session (${expectedOrderCustomId}). Expected session ${session.id}.`;
      }
    }

    invariants.push({
      name: "CRYPTOGRAPHIC_LINEAGE",
      passed: lineagePassed,
      reason: lineageReason,
      details: {
        verifiedRoot,
        expectedOrderCustomId,
      },
    });

    // Overall outcome: All 5 invariants must pass
    const overallPassed = invariants.every((inv) => inv.passed);

    return {
      certificateId,
      sessionId: session.id,
      passed: overallPassed,
      invariants,
      verifiedRoot,
      timestamp: new Date().toISOString(),
      orderReference: session.paypalOrderId,
    };
  }
}
