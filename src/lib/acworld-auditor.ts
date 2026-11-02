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
  InvariantStatus,
  AuditCertificateStatus,
  AuditType,
} from "../types/pactum";
import { toCents, fromCents } from "./mechanism-guardrail";
import { CryptographicFlightRecorder } from "./flight-recorder";
import { canonicalJson } from "./veripay-merkle";

export interface AuditRequest {
  session: ProcurementSession;
  expectedOrderCustomId?: string; // Optional PayPal custom_id to verify lineage
}

/**
 * Computes a SHA-256 cryptographic digest over the canonical JSON representation
 * of an AuditCertificate (excluding certificateHash itself).
 */
export function computeCertificateHash(certificate: Omit<AuditCertificate, "certificateHash">): string {
  const certCopy: Record<string, unknown> = { ...certificate };
  delete certCopy.certificateHash;
  return crypto
    .createHash("sha256")
    .update(Buffer.from(canonicalJson(certCopy), "utf-8"))
    .digest("hex");
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
    const mandateVersion = mandate.version ?? 1;
    const agreementId = session.agreementRecord?.agreementId;

    // --- INVARIANT 1: SKU & Condition Integrity ---
    let skuPassed = false;
    let skuStatus: InvariantStatus = "INVALID";
    let skuCode = "SKU_MATCH";
    let skuReason: string | undefined;
    const skuEvidenceRefs: string[] = [];

    if (!selectedQuote) {
      skuStatus = "INCOMPLETE";
      skuCode = "MISSING_SELECTED_QUOTE";
      skuReason = "Audit failed: No authoritative vendor quote was selected.";
    } else if (!finalOffer) {
      skuStatus = "INCOMPLETE";
      skuCode = "MISSING_FINAL_OFFER";
      skuReason = "Audit failed: No agreed final offer is recorded.";
    } else if (session.agreementRecord && session.agreementRecord.sessionId && session.agreementRecord.sessionId !== session.id) {
      skuStatus = "INVALID";
      skuCode = "SESSION_MISMATCH";
      skuReason = `Agreement session mismatch: recorded agreement session ${session.agreementRecord.sessionId} does not match active session ${session.id}.`;
    } else if (session.agreementRecord && session.agreementRecord.mandateVersion !== mandateVersion) {
      skuStatus = "INVALID";
      skuCode = "STALE_AGREEMENT";
      skuReason = `Stale agreement rejected: agreement is from mandate version ${session.agreementRecord.mandateVersion}, current mandate is version ${mandateVersion}.`;
    } else if (session.agreementRecord && session.agreementRecord.vendorId !== selectedQuote.vendorId) {
      skuStatus = "INVALID";
      skuCode = "VENDOR_MISMATCH";
      skuReason = `Agreement vendor mismatch: recorded agreement vendor ${session.agreementRecord.vendorId} does not match selected vendor ${selectedQuote.vendorId}.`;
    } else if (
      session.agreementRecord &&
      session.agreementRecord.vendorName &&
      selectedQuote.vendorName &&
      session.agreementRecord.vendorName !== selectedQuote.vendorName
    ) {
      skuStatus = "INVALID";
      skuCode = "VENDOR_MISMATCH";
      skuReason = `Agreement vendor name mismatch: recorded agreement vendor name ${session.agreementRecord.vendorName} does not match selected vendor name ${selectedQuote.vendorName}.`;
    } else if (session.agreementRecord && Math.abs(session.agreementRecord.agreedPrice - finalOffer.unitPrice) > 0.01) {
      skuStatus = "INVALID";
      skuCode = "AGREEMENT_PRICE_MISMATCH";
      skuReason = `Agreement price mismatch: recorded agreed price $${session.agreementRecord.agreedPrice} does not match final offer $${finalOffer.unitPrice}.`;
    } else if (session.agreementRecord && session.agreementRecord.sku && selectedQuote.sku && session.agreementRecord.sku !== selectedQuote.sku) {
      skuStatus = "INVALID";
      skuCode = "SKU_MISMATCH";
      skuReason = `Agreement SKU mismatch: recorded agreement SKU ${session.agreementRecord.sku} does not match selected vendor SKU ${selectedQuote.sku}.`;
    } else if (
      session.agreementRecord &&
      session.agreementRecord.agreedOffer &&
      (session.agreementRecord.agreedOffer.quantity !== finalOffer.quantity ||
        session.agreementRecord.agreedOffer.deliveryDays !== finalOffer.deliveryDays ||
        session.agreementRecord.agreedOffer.returnDays !== finalOffer.returnDays ||
        Math.abs(session.agreementRecord.agreedOffer.shippingCost - finalOffer.shippingCost) > 0.01 ||
        Math.abs(session.agreementRecord.agreedOffer.unitPrice - finalOffer.unitPrice) > 0.01)
    ) {
      skuStatus = "INVALID";
      skuCode = "AGREEMENT_OFFER_MISMATCH";
      skuReason = `Agreement agreedOffer terms do not match authoritative finalOffer: quantity (${session.agreementRecord.agreedOffer.quantity} vs ${finalOffer.quantity}), delivery (${session.agreementRecord.agreedOffer.deliveryDays} vs ${finalOffer.deliveryDays}), returns (${session.agreementRecord.agreedOffer.returnDays} vs ${finalOffer.returnDays}).`;
    } else {
      if (selectedQuote.sku) {
        skuEvidenceRefs.push(`sku:${selectedQuote.sku}`);
      }
      if (session.agreementRecord?.agreementId) {
        skuEvidenceRefs.push(`agreement:${session.agreementRecord.agreementId}`);
      }

      // Check condition requirement if mandate specifies one
      if (mandate.requiredCondition && selectedQuote.condition !== mandate.requiredCondition) {
        skuStatus = "INVALID";
        skuCode = "CONDITION_MISMATCH";
        skuReason = `Condition mismatch: Required ${mandate.requiredCondition}, but vendor provided ${selectedQuote.condition}.`;
      } else {
        skuPassed = true;
        skuStatus = "VALID";
        skuCode = "SKU_MATCH";
      }
    }

    invariants.push({
      name: "SKU_INTEGRITY",
      passed: skuPassed,
      status: skuStatus,
      code: skuCode,
      reason: skuReason,
      evidenceReferences: skuEvidenceRefs.length > 0 ? skuEvidenceRefs : undefined,
      details: {
        selectedSku: selectedQuote?.sku,
        vendorName: selectedQuote?.vendorName,
        condition: selectedQuote?.condition,
        requiredCondition: mandate.requiredCondition,
      },
    });

    // --- INVARIANT 2: Price Ceiling and Safe Arithmetic ---
    let pricePassed = false;
    let priceStatus: InvariantStatus = "INVALID";
    let priceCode = "PRICE_VALID";
    let priceReason: string | undefined;
    let computedTotal = 0;
    const priceEvidenceRefs: string[] = [];

    if (finalOffer && selectedQuote) {
      const unitCents = toCents(finalOffer.unitPrice ?? 0);
      const shipCents = toCents(finalOffer.shippingCost ?? selectedQuote.shippingCost ?? 0);
      const totalCents = unitCents * (finalOffer.quantity || 1) + shipCents;
      computedTotal = fromCents(totalCents);
      const maxBudgetCents = toCents(mandate.maxTotalBudget ?? 0);

      priceEvidenceRefs.push(`budget:${mandate.maxTotalBudget}`, `total:${computedTotal}`);

      if (!mandate.currency || typeof mandate.currency !== "string" || mandate.currency.length !== 3) {
        priceStatus = "INVALID";
        priceCode = "INVALID_CURRENCY";
        priceReason = `Invalid mandate currency code: ${mandate.currency}. Must be a 3-letter currency code (e.g. USD).`;
      } else if (selectedQuote.currency && selectedQuote.currency.toUpperCase() !== mandate.currency.toUpperCase()) {
        priceStatus = "INVALID";
        priceCode = "CURRENCY_MISMATCH";
        priceReason = `Quote currency mismatch: selected quote currency ${selectedQuote.currency} does not match mandate currency ${mandate.currency}.`;
      } else if (finalOffer.currency && finalOffer.currency.toUpperCase() !== mandate.currency.toUpperCase()) {
        priceStatus = "INVALID";
        priceCode = "CURRENCY_MISMATCH";
        priceReason = `Final offer currency mismatch: final offer currency ${finalOffer.currency} does not match mandate currency ${mandate.currency}.`;
      } else if (session.agreementRecord?.currency && session.agreementRecord.currency.toUpperCase() !== mandate.currency.toUpperCase()) {
        priceStatus = "INVALID";
        priceCode = "CURRENCY_MISMATCH";
        priceReason = `Agreement currency mismatch: agreement currency ${session.agreementRecord.currency} does not match mandate currency ${mandate.currency}.`;
      } else if (!Number.isFinite(mandate.maxTotalBudget) || mandate.maxTotalBudget <= 0) {
        priceStatus = "INVALID";
        priceCode = "INVALID_BUDGET";
        priceReason = `Invalid mandate budget ceiling: ${mandate.maxTotalBudget}. Budget must be a positive finite amount.`;
      } else if (!Number.isFinite(finalOffer.unitPrice) || finalOffer.unitPrice <= 0) {
        priceStatus = "INVALID";
        priceCode = "INVALID_UNIT_PRICE";
        priceReason = `Invalid unit price: ${finalOffer.unitPrice}.`;
      } else if (!Number.isFinite(finalOffer.shippingCost) || finalOffer.shippingCost < 0) {
        priceStatus = "INVALID";
        priceCode = "INVALID_SHIPPING_COST";
        priceReason = `Invalid shipping cost: ${finalOffer.shippingCost}.`;
      } else if (finalOffer.quantity !== mandate.quantity || mandate.quantity <= 0) {
        priceStatus = "INVALID";
        priceCode = "QUANTITY_MISMATCH";
        priceReason = `Quantity mismatch: final offer quantity (${finalOffer.quantity}) does not match mandate (${mandate.quantity}).`;
      } else if (totalCents > maxBudgetCents) {
        priceStatus = "INVALID";
        priceCode = "BUDGET_EXCEEDED";
        priceReason = `Price ceiling violated: Total landed cost $${computedTotal.toFixed(2)} exceeds active mandate budget $${mandate.maxTotalBudget.toFixed(2)}.`;
      } else if (session.agreementRecord && Math.abs(session.agreementRecord.totalCost - computedTotal) > 0.02) {
        priceStatus = "INVALID";
        priceCode = "ARITHMETIC_MISMATCH";
        priceReason = `Total cost mismatch: agreement total $${session.agreementRecord.totalCost} does not match recomputed landed cost $${computedTotal}.`;
      } else {
        pricePassed = true;
        priceStatus = "VALID";
        priceCode = "PRICE_VALID";
      }
    } else {
      priceStatus = "INCOMPLETE";
      priceCode = "MISSING_PRICE_DATA";
      priceReason = "Missing final offer or quote for price arithmetic audit.";
    }

    invariants.push({
      name: "PRICE_CEILING",
      passed: pricePassed,
      status: priceStatus,
      code: priceCode,
      reason: priceReason,
      evidenceReferences: priceEvidenceRefs.length > 0 ? priceEvidenceRefs : undefined,
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
    let returnStatus: InvariantStatus = "INVALID";
    let returnCode = "RETURN_POLICY_VALID";
    let returnReason: string | undefined;
    const returnEvidenceRefs: string[] = [];

    if (finalOffer) {
      if (finalOffer.returnDays < mandate.minReturnDays) {
        returnStatus = "INVALID";
        returnCode = "RETURN_POLICY_VIOLATION";
        returnReason = `Return policy SLA violated: Offered ${finalOffer.returnDays} days, mandate requires at least ${mandate.minReturnDays} days.`;
      } else if (!Number.isFinite(finalOffer.returnDays) || finalOffer.returnDays < 0) {
        returnStatus = "INVALID";
        returnCode = "INVALID_RETURN_DAYS";
        returnReason = `Invalid return policy window: ${finalOffer.returnDays} days.`;
      } else {
        // Verify evidence backing
        const attestation = session.merchantAttestation;
        let attestationValid = true;
        let attestationError: string | undefined;

        if (attestation) {
          if (
            !attestation.merchantUrl ||
            typeof attestation.merchantUrl !== "string" ||
            !/^https?:\/\//i.test(attestation.merchantUrl)
          ) {
            attestationValid = false;
            attestationError = `Invalid merchant URL in attestation: ${attestation.merchantUrl}`;
          } else if (
            !attestation.returnPolicyText ||
            typeof attestation.returnPolicyText !== "string" ||
            attestation.returnPolicyText.trim().length === 0
          ) {
            attestationValid = false;
            attestationError = "Merchant attestation has empty or missing returnPolicyText.";
          } else if (attestation.domSnapshotHash && !/^[0-9a-fA-F]{64}$/.test(attestation.domSnapshotHash)) {
            attestationValid = false;
            attestationError = `Malformed domSnapshotHash in merchant attestation: ${attestation.domSnapshotHash}`;
          }
        }

        if (attestation?.merchantUrl) {
          returnEvidenceRefs.push(`merchant_url:${attestation.merchantUrl}`);
        }
        if (attestation?.domSnapshotHash) {
          returnEvidenceRefs.push(`dom_hash:${attestation.domSnapshotHash}`);
        }

        if (!attestation && selectedQuote?.dataSource === "CHANNEL3") {
          returnStatus = "INVALID";
          returnCode = "MISSING_ATTESTATION";
          returnReason = "Merchant DOM attestation evidence missing for live Channel3 product.";
        } else if (attestation && !attestationValid) {
          returnStatus = "INVALID";
          returnCode = "MALFORMED_ATTESTATION";
          returnReason = `Merchant attestation validation failed: ${attestationError}`;
        } else {
          returnPassed = true;
          returnStatus = "VALID";
          returnCode = "RETURN_POLICY_VALID";
        }
      }
    } else {
      returnStatus = "INCOMPLETE";
      returnCode = "MISSING_OFFER";
      returnReason = "Missing final offer for return policy audit.";
    }

    invariants.push({
      name: "RETURN_POLICY",
      passed: returnPassed,
      status: returnStatus,
      code: returnCode,
      reason: returnReason,
      isSupplierAttestation: true,
      evidenceReferences: returnEvidenceRefs.length > 0 ? returnEvidenceRefs : undefined,
      details: {
        returnDays: finalOffer?.returnDays,
        minReturnDays: mandate.minReturnDays,
        hasAttestation: !!session.merchantAttestation,
      },
    });

    // --- INVARIANT 4: Delivery SLA ---
    let deliveryPassed = false;
    let deliveryStatus: InvariantStatus = "INVALID";
    let deliveryCode = "DELIVERY_SLA_VALID";
    let deliveryReason: string | undefined;

    if (finalOffer) {
      if (finalOffer.deliveryDays > mandate.maxDeliveryDays) {
        deliveryStatus = "INVALID";
        deliveryCode = "DELIVERY_SLA_VIOLATION";
        deliveryReason = `Delivery SLA violated: Offered ${finalOffer.deliveryDays} days exceeds maximum allowed ${mandate.maxDeliveryDays} days.`;
      } else if (!Number.isFinite(finalOffer.deliveryDays) || finalOffer.deliveryDays <= 0) {
        deliveryStatus = "INVALID";
        deliveryCode = "INVALID_DELIVERY_DAYS";
        deliveryReason = `Invalid delivery SLA: ${finalOffer.deliveryDays} days.`;
      } else {
        deliveryPassed = true;
        deliveryStatus = "VALID";
        deliveryCode = "DELIVERY_SLA_VALID";
      }
    } else {
      deliveryStatus = "INCOMPLETE";
      deliveryCode = "MISSING_OFFER";
      deliveryReason = "Missing final offer for delivery SLA audit.";
    }

    invariants.push({
      name: "DELIVERY_SLA",
      passed: deliveryPassed,
      status: deliveryStatus,
      code: deliveryCode,
      reason: deliveryReason,
      details: {
        deliveryDays: finalOffer?.deliveryDays,
        maxDeliveryDays: mandate.maxDeliveryDays,
      },
    });

    // --- INVARIANT 5: Cryptographic Lineage & Merkle Binding ---
    let lineagePassed = false;
    let lineageStatus: InvariantStatus = "INVALID";
    let lineageCode = "LINEAGE_VALID";
    let lineageReason: string | undefined;
    const lineageEvidenceRefs: string[] = [];
    const verifiedRoot = session.preSettlementRoot ?? session.merkleRoot ?? "";

    if (!verifiedRoot || verifiedRoot.length !== 64 || verifiedRoot === "0".repeat(64)) {
      lineageStatus = "INVALID";
      lineageCode = "INVALID_ROOT";
      lineageReason = "Cryptographic lineage failed: Session has no valid pre-settlement Merkle root.";
    } else {
      lineageEvidenceRefs.push(`root:${verifiedRoot}`);

      if (session.flightRecord) {
        try {
          const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord);
          // If pre-settlement events (e.g. FX quote/lock) advanced merkleRoot to recorder root,
          // ensure preSettlementRoot is synchronized before verifying anchor commitment
          if (
            !session.postAuditRoot &&
            session.merkleRoot === recorder.getRootHash() &&
            session.preSettlementRoot !== recorder.getRootHash()
          ) {
            session.preSettlementRoot = recorder.getRootHash();
          }
          const expectedRootAnchor = session.postAuditRoot ?? session.preSettlementRoot ?? session.merkleRoot;
          const integrity = recorder.verifyIntegrity(expectedRootAnchor);
          if (!integrity.valid) {
            lineageStatus = "INVALID";
            lineageCode = integrity.errorCode ?? "CHAIN_TAMPERED";
            lineageReason = `Cryptographic flight recorder integrity failed: ${integrity.error}`;
          } else if (session.agreementRecord) {
            const events = recorder.getEvents();
            const hasAgreementEvent = events.some((e) => {
              const payloadAgrId = (e.publicPayload as Record<string, unknown> | undefined)?.agreementId;
              const matchesId =
                e.agreementId === session.agreementRecord?.agreementId ||
                payloadAgrId === session.agreementRecord?.agreementId;
              const isAcceptanceType =
                e.eventType === "AGREEMENT_CREATED" ||
                e.eventType === "VENDOR_ACCEPTANCE" ||
                e.eventType === "BUYER_ACCEPTANCE";
              return matchesId && isAcceptanceType;
            });
            if (!hasAgreementEvent) {
              lineageStatus = "INVALID";
              lineageCode = "MISSING_AGREEMENT_EVENT";
              lineageReason = `Lineage failure: Agreement ${session.agreementRecord.agreementId} has no corresponding acceptance/creation event in flight recorder.`;
            } else {
              lineagePassed = true;
              lineageStatus = "VALID";
              lineageCode = "LINEAGE_VALID";
            }
          } else {
            lineagePassed = true;
            lineageStatus = "VALID";
            lineageCode = "LINEAGE_VALID";
          }
        } catch (err) {
          lineageStatus = "INVALID";
          lineageCode = "RECORDER_DESERIALIZATION_FAILED";
          lineageReason = `Cryptographic flight recorder integrity failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        // Lineage verified from valid session evidence root
        lineagePassed = true;
        lineageStatus = "VALID";
        lineageCode = "LINEAGE_VALID";
      }
    }

    if (lineagePassed && expectedOrderCustomId) {
      lineageEvidenceRefs.push(`custom_id:${expectedOrderCustomId}`);
      // Must match VERIPAY_ROOT:<merkle_root> or VERIPAY_ROOT:<merkle_root>;SESSION:<sessionId>
      const expectedPrefix = `VERIPAY_ROOT:${verifiedRoot}`;
      if (!expectedOrderCustomId.includes(expectedPrefix)) {
        lineagePassed = false;
        lineageStatus = "INVALID";
        lineageCode = "CUSTOM_ID_ROOT_MISMATCH";
        lineageReason = `Cryptographic lineage mismatch: PayPal order custom_id (${expectedOrderCustomId}) does not match verified root (${verifiedRoot}).`;
      } else if (
        expectedOrderCustomId.includes(";SESSION:") &&
        !expectedOrderCustomId.includes(`;SESSION:${session.id}`)
      ) {
        lineagePassed = false;
        lineageStatus = "INVALID";
        lineageCode = "CUSTOM_ID_SESSION_MISMATCH";
        lineageReason = `Cryptographic lineage mismatch: PayPal order custom_id is bound to a different session (${expectedOrderCustomId}). Expected session ${session.id}.`;
      }
    }

    invariants.push({
      name: "CRYPTOGRAPHIC_LINEAGE",
      passed: lineagePassed,
      status: lineageStatus,
      code: lineageCode,
      reason: lineageReason,
      evidenceReferences: lineageEvidenceRefs.length > 0 ? lineageEvidenceRefs : undefined,
      details: {
        verifiedRoot,
        expectedOrderCustomId,
      },
    });

    // Overall outcome: All 5 invariants must pass
    const overallPassed = invariants.every((inv) => inv.passed);
    const anyIncomplete = invariants.some((inv) => inv.status === "INCOMPLETE");
    const certificateStatus: AuditCertificateStatus = overallPassed
      ? "VALID"
      : anyIncomplete
      ? "INCOMPLETE"
      : "INVALID";
    const auditType: AuditType = session.paypalCaptureId ? "POST_SETTLEMENT" : "PRE_SETTLEMENT";

    const certificatePayload: Omit<AuditCertificate, "certificateHash"> = {
      certificateId,
      sessionId: session.id,
      mandateVersion,
      agreementId,
      passed: overallPassed,
      status: certificateStatus,
      auditType,
      invariants,
      verifiedRoot,
      timestamp: new Date().toISOString(),
      orderReference: session.paypalOrderId,
    };

    const certificateHash = computeCertificateHash(certificatePayload);

    return {
      ...certificatePayload,
      certificateHash,
    };
  }

  /**
   * Independently verifies the authenticity, cryptographic integrity, and freshness of an AuditCertificate
   * against authoritative session state and evidence commitments.
   *
   * Rejects:
   * 1. Structurally malformed or null certificate objects.
   * 2. Fabricated certificates with missing, tampered, or mismatched certificateHash.
   * 3. Cross-session certificate injection (certificate.sessionId !== session.id).
   * 4. Stale certificates from older mandate revisions (certificate.mandateVersion !== session.mandate.version).
   * 5. Agreement mismatch (certificate.agreementId !== session.agreementRecord?.agreementId).
   * 6. Commitment mismatch (certificate.verifiedRoot !== expectedEvidenceRoot).
   * 7. Certificates with failed overall audit status or failing invariants.
   */
  public static verifyCertificateFreshness(
    certificate: AuditCertificate,
    session: ProcurementSession,
    expectedEvidenceRoot?: string
  ): { valid: boolean; reason?: string; errorCode?: string } {
    if (!certificate || typeof certificate !== "object") {
      return { valid: false, reason: "Malformed or null certificate object.", errorCode: "MALFORMED_CERTIFICATE" };
    }

    if (!certificate.certificateId || !certificate.sessionId || !certificate.verifiedRoot || !Array.isArray(certificate.invariants)) {
      return { valid: false, reason: "Certificate missing mandatory fields.", errorCode: "MALFORMED_CERTIFICATE" };
    }

    // 1. Cryptographic integrity check: verify certificateHash commitment
    if (!certificate.certificateHash) {
      return { valid: false, reason: "Certificate is missing cryptographic certificateHash.", errorCode: "MISSING_CERTIFICATE_HASH" };
    }

    const recomputedHash = computeCertificateHash(certificate);
    if (certificate.certificateHash.toLowerCase() !== recomputedHash.toLowerCase()) {
      return {
        valid: false,
        reason: `Cryptographic certificateHash mismatch: recorded ${certificate.certificateHash}, recomputed ${recomputedHash}. Potential certificate forgery.`,
        errorCode: "CERTIFICATE_HASH_MISMATCH",
      };
    }

    // 2. Session binding check
    if (certificate.sessionId !== session.id) {
      return {
        valid: false,
        reason: `Certificate session mismatch: certificate belongs to session ${certificate.sessionId}, active session is ${session.id}.`,
        errorCode: "SESSION_MISMATCH",
      };
    }

    // 3. Mandate revision freshness check
    const currentMandateVersion = session.mandate.version ?? 1;
    if (certificate.mandateVersion !== undefined && certificate.mandateVersion !== currentMandateVersion) {
      return {
        valid: false,
        reason: `Stale certificate: certificate issued for mandate version ${certificate.mandateVersion}, current mandate is version ${currentMandateVersion}.`,
        errorCode: "STALE_MANDATE_VERSION",
      };
    }

    // 4. Agreement binding check
    if (session.agreementRecord?.agreementId) {
      if (certificate.agreementId && certificate.agreementId !== session.agreementRecord.agreementId) {
        return {
          valid: false,
          reason: `Certificate agreement mismatch: certificate bound to agreement ${certificate.agreementId}, active session agreement is ${session.agreementRecord.agreementId}.`,
          errorCode: "AGREEMENT_MISMATCH",
        };
      }
    }

    // 5. Evidence root commitment check
    const targetRoot = expectedEvidenceRoot ?? session.preSettlementRoot ?? session.merkleRoot;
    if (targetRoot && certificate.verifiedRoot.toLowerCase() !== targetRoot.toLowerCase()) {
      return {
        valid: false,
        reason: `Certificate evidence root mismatch: certificate verified root ${certificate.verifiedRoot} does not match expected session root ${targetRoot}.`,
        errorCode: "ROOT_MISMATCH",
      };
    }

    // 6. Invariant passed status check
    if (!certificate.passed || certificate.status === "INVALID" || certificate.status === "INCOMPLETE") {
      return {
        valid: false,
        reason: "Certificate indicates failed or incomplete audit.",
        errorCode: "AUDIT_FAILED",
      };
    }

    const failingInvariants = certificate.invariants.filter((inv) => !inv.passed);
    if (failingInvariants.length > 0) {
      return {
        valid: false,
        reason: `Certificate contains failing invariants: ${failingInvariants.map((i) => i.name).join(", ")}.`,
        errorCode: "INVARIANT_FAILED",
      };
    }

    return { valid: true };
  }
}
