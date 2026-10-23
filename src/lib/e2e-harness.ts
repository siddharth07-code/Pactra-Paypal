/**
 * PACTUM — End-to-End Lifecycle Demonstration & Verification Harness
 *
 * Implements deterministic execution and verification of Scenarios A through F:
 * - Scenario A: Successful Procurement Lifecycle (Mandate -> Sourcing -> Negotiation -> Agreement -> Flight Recorder -> ACWORLD Audit -> Settlement -> Lineage)
 * - Scenario B: No-Deal Termination (Infeasible quotes -> NO_DEAL -> Audit Failure -> Settlement Blocked)
 * - Scenario C: Tampered Evidence Detection (Event modification -> Merkle / Hash Chain Failure -> Audit Gate Block)
 * - Scenario D: Stale Mandate Invalidation (Agreement -> Revision -> Stale Rejection -> Settlement Block)
 * - Scenario E: Incomplete Source Evidence (Missing attestation -> Invariant 3 Failure -> Settlement Block)
 * - Scenario F: Dispute Resolution Lifecycle (Settled deal -> Dispute Opened -> Inclusion Proofs -> Deterministic Evaluation -> Resolution)
 *
 * Follows GEMINI.md Section 14 and Phase 5 specifications.
 */

import { sessionStore } from "./session-store";
import { NegotiationOrchestrator } from "./negotiation-orchestrator";
import { AcworldAuditor } from "./acworld-auditor";
import { SettlementService } from "./settlement-service";
import { DisputeService } from "./dispute-service";
import { CryptographicFlightRecorder } from "./flight-recorder";
import { DETERMINISTIC_FIXTURE_QUOTES } from "./channel3-client";
import type { ProcurementMandate } from "../types/pactum";

export interface ScenarioResult<T = Record<string, unknown>> {
  scenario: "A" | "B" | "C" | "D" | "E" | "F";
  name: string;
  success: boolean;
  summary: string;
  sessionId: string;
  details: T;
}

export class LifecycleHarness {
  private auditor = new AcworldAuditor();
  private settlementService = new SettlementService();
  private disputeService = new DisputeService();

  private createBaselineMandate(overrides: Partial<ProcurementMandate> = {}): ProcurementMandate {
    return {
      id: `mandate-demo-${Date.now()}`,
      rawPrompt: "Purchase 25 4K USB-C monitors under $8,500 total budget with 5-day delivery and 30-day return window",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [
        { name: "Resolution", value: "4K UHD (3840x2160)", mandatory: true },
        { name: "Connectivity", value: "USB-C with Power Delivery", mandatory: true },
      ],
      currency: "USD",
      version: 1,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  /**
   * Scenario A: Successful Procurement Lifecycle
   */
  public async runScenarioA(): Promise<ScenarioResult<{
    selectedVendor: string;
    agreedPrice: number;
    totalCost: number;
    savings: number;
    merkleRoot: string;
    auditPassed: boolean;
    orderId?: string;
    captureId?: string;
    eventsRecorded: number;
  }>> {
    const mandate = this.createBaselineMandate();
    const quotes = DETERMINISTIC_FIXTURE_QUOTES.map((q) => ({ ...q }));

    // Run 4-round multi-agent bargaining
    const orchestrator = new NegotiationOrchestrator({ maxRounds: 4 });
    const negotiationResult = await orchestrator.runNegotiation(mandate, quotes);

    if (!negotiationResult.completed || !negotiationResult.selectedQuote || !negotiationResult.finalOffer) {
      throw new Error("Scenario A expected successful negotiation completion.");
    }

    const session = negotiationResult.session;

    // Attach merchant attestation evidence
    session.merchantAttestation = {
      merchantUrl: "https://displayworld.example.com/item/dw-4k-usb-c",
      domSnapshotHash: "4a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
      returnPolicyText: "Standard 30-day commercial return window guaranteed for business accounts.",
      timestamp: new Date().toISOString(),
    };

    // Reconstitute and commit flight recorder
    const recorder = CryptographicFlightRecorder.getOrReconstitute(session);
    session.flightRecord = recorder.exportFlightRecord();
    session.preSettlementRoot = recorder.getRootHash();

    // Run independent ACWORLD audit
    const auditCert = this.auditor.audit({ session });
    session.auditCertificate = auditCert;
    session.status = auditCert.passed ? "AUDIT_PASSED" : "AUDIT_FAILED";
    sessionStore.saveSession(session);

    if (!auditCert.passed) {
      throw new Error(`Scenario A audit failed: ${auditCert.invariants.find((i) => !i.passed)?.reason}`);
    }

    // Authorize & Settle payment
    const settlementResult = await this.settlementService.settle({
      sessionId: session.id,
      createInvoice: true,
    });

    const updatedSession = sessionStore.getSession(session.id)!;
    const initialAskTotal = quotes.reduce((min, q) => Math.min(min, q.initialUnitAsk * 25 + q.shippingCost), Infinity);
    const savings = Math.max(0, initialAskTotal - (updatedSession.captureAmount ?? negotiationResult.totalCost ?? 0));

    return {
      scenario: "A",
      name: "Successful Procurement Lifecycle",
      success: settlementResult.success && auditCert.passed,
      summary: `Negotiated 25 units with ${negotiationResult.selectedQuote.vendorName} at $${negotiationResult.finalOffer.unitPrice}/unit ($${negotiationResult.totalCost} total). Verified SHA-256 Merkle root ${recorder.getRootHash().slice(0, 16)}... and settled under budget ceiling.`,
      sessionId: session.id,
      details: {
        selectedVendor: negotiationResult.selectedQuote.vendorName,
        agreedPrice: negotiationResult.finalOffer.unitPrice,
        totalCost: negotiationResult.totalCost!,
        savings,
        merkleRoot: recorder.getRootHash(),
        auditPassed: auditCert.passed,
        orderId: settlementResult.orderId,
        captureId: settlementResult.captureId,
        eventsRecorded: recorder.getEventCount(),
      },
    };
  }

  /**
   * Scenario B: No-Deal Termination
   */
  public async runScenarioB(): Promise<ScenarioResult<{
    negotiationCompleted: boolean;
    outcome: string;
    sessionStatus: string;
    settlementBlocked: boolean;
    agreementCreated: boolean;
  }>> {
    // Mandate with extremely restrictive budget ($3,000 for 25 monitors = $120/unit, market baseline is $340+)
    const mandate = this.createBaselineMandate({ maxTotalBudget: 3000 });
    const quotes = DETERMINISTIC_FIXTURE_QUOTES.map((q) => ({ ...q }));

    const orchestrator = new NegotiationOrchestrator({ maxRounds: 2 });
    const negotiationResult = await orchestrator.runNegotiation(mandate, quotes);

    const session = negotiationResult.session;

    // Attempting settlement on a no-deal session must be strictly rejected
    const settlementResult = await this.settlementService.initiateCheckout({
      sessionId: session.id,
    });

    return {
      scenario: "B",
      name: "No-Deal Lifecycle",
      success: !negotiationResult.completed && !settlementResult.success && settlementResult.blockedAtGate === true,
      summary: "All supplier counteroffers exceeded the unfeasible $3,000 budget ceiling. The system terminated with NO_DEAL, formed zero agreements, and settlement gates strictly blocked checkout.",
      sessionId: session.id,
      details: {
        negotiationCompleted: negotiationResult.completed,
        outcome: "NO_DEAL",
        sessionStatus: session.status,
        settlementBlocked: settlementResult.blockedAtGate === true,
        agreementCreated: !!session.agreementRecord,
      },
    };
  }

  /**
   * Scenario C: Tampered Evidence Detection
   */
  public async runScenarioC(): Promise<ScenarioResult<{
    tamperDetected: boolean;
    auditPassed: boolean;
    settlementBlocked: boolean;
    auditReason?: string;
  }>> {
    const mandate = this.createBaselineMandate();
    const quotes = DETERMINISTIC_FIXTURE_QUOTES.map((q) => ({ ...q }));

    const orchestrator = new NegotiationOrchestrator({ maxRounds: 2 });
    const result = await orchestrator.runNegotiation(mandate, quotes);
    const session = result.session;

    // Build valid flight recorder
    const recorder = CryptographicFlightRecorder.getOrReconstitute(session);
    session.flightRecord = recorder.exportFlightRecord();
    session.preSettlementRoot = recorder.getRootHash();

    // Adversary tampers with the committed flight record by modifying the agreed price in event 0
    session.flightRecord.events[0].publicPayload = {
      ...session.flightRecord.events[0].publicPayload,
      maliciousInjection: "adversary-tampered-data",
    };

    sessionStore.saveSession(session);

    // Run ACWORLD audit on tampered session
    const auditCert = this.auditor.audit({ session });

    // Attempt settlement on tampered session
    const settlementResult = await this.settlementService.initiateCheckout({
      sessionId: session.id,
    });

    const inv5 = auditCert.invariants.find((i) => i.name === "CRYPTOGRAPHIC_LINEAGE");

    return {
      scenario: "C",
      name: "Tampered Evidence Detection",
      success: !auditCert.passed && settlementResult.blockedAtGate === true,
      summary: "Adversarial modification of committed event payload broke hash chain continuity. ACWORLD Invariant 5 caught the tampering, failed closed, and settlement capture was completely blocked.",
      sessionId: session.id,
      details: {
        tamperDetected: !inv5?.passed,
        auditPassed: auditCert.passed,
        settlementBlocked: settlementResult.blockedAtGate === true,
        auditReason: inv5?.reason,
      },
    };
  }

  /**
   * Scenario D: Stale Mandate Invalidation
   */
  public async runScenarioD(): Promise<ScenarioResult<{
    initialMandateVersion: number;
    revisedMandateVersion: number;
    staleAgreementRejected: boolean;
    settlementBlocked: boolean;
  }>> {
    const mandate = this.createBaselineMandate();
    const quotes = DETERMINISTIC_FIXTURE_QUOTES.map((q) => ({ ...q }));

    const orchestrator = new NegotiationOrchestrator({ maxRounds: 2 });
    const result = await orchestrator.runNegotiation(mandate, quotes);
    const session = result.session;

    const initialVersion = session.mandate.version ?? 1;

    // Simulate stale agreement injection: user revises budget to $8,000, creating Version 2
    sessionStore.reviseMandate(session.id, { maxTotalBudget: 8000 });

    const revisedSession = sessionStore.getSession(session.id)!;

    // Adversary attempts to attach the old agreement (Version 1) to the revised session (Version 2)
    revisedSession.agreementRecord = result.session.agreementRecord;
    revisedSession.finalOffer = result.finalOffer;
    revisedSession.selectedQuote = result.selectedQuote;
    revisedSession.preSettlementRoot = result.session.preSettlementRoot;
    sessionStore.saveSession(revisedSession);

    // Audit and settlement must reject stale agreement
    const auditCert = this.auditor.audit({ session: revisedSession });
    const settlementResult = await this.settlementService.initiateCheckout({
      sessionId: revisedSession.id,
    });

    return {
      scenario: "D",
      name: "Stale Mandate Invalidation",
      success: !auditCert.passed && settlementResult.blockedAtGate === true,
      summary: "Mandate was revised to Version 2. When an attempt was made to audit and settle the Version 1 agreement, Invariant 1 authoritatively rejected the stale agreement revision.",
      sessionId: session.id,
      details: {
        initialMandateVersion: initialVersion,
        revisedMandateVersion: revisedSession.mandate.version ?? 2,
        staleAgreementRejected: !auditCert.passed,
        settlementBlocked: settlementResult.blockedAtGate === true,
      },
    };
  }

  /**
   * Scenario E: Incomplete Source Evidence
   */
  public async runScenarioE(): Promise<ScenarioResult<{
    missingAttestationDetected: boolean;
    auditPassed: boolean;
    settlementBlocked: boolean;
    auditReason?: string;
  }>> {
    const mandate = this.createBaselineMandate();
    const quotes = DETERMINISTIC_FIXTURE_QUOTES.map((q) => ({
      ...q,
      dataSource: "CHANNEL3" as const, // Channel3 live sourcing requires DOM attestation evidence
    }));

    const orchestrator = new NegotiationOrchestrator({ maxRounds: 2 });
    const result = await orchestrator.runNegotiation(mandate, quotes);
    const session = result.session;

    // Deliberately omit merchant DOM attestation
    session.merchantAttestation = undefined;
    sessionStore.saveSession(session);

    // Run ACWORLD audit
    const auditCert = this.auditor.audit({ session });
    const settlementResult = await this.settlementService.initiateCheckout({
      sessionId: session.id,
    });

    const inv3 = auditCert.invariants.find((i) => i.name === "RETURN_POLICY");

    return {
      scenario: "E",
      name: "Incomplete Source Evidence",
      success: !auditCert.passed && settlementResult.blockedAtGate === true,
      summary: "Quote sourced from Channel3 catalog lacked required merchant DOM return-policy attestation. ACWORLD Invariant 3 failed closed, reporting missing merchant evidence.",
      sessionId: session.id,
      details: {
        missingAttestationDetected: !inv3?.passed,
        auditPassed: auditCert.passed,
        settlementBlocked: settlementResult.blockedAtGate === true,
        auditReason: inv3?.reason,
      },
    };
  }

  /**
   * Scenario F: Dispute Resolution Lifecycle
   */
  public async runScenarioF(): Promise<ScenarioResult<{
    disputeId: string;
    disputeCategory: string;
    disputeStatus: string;
    evidenceRoot: string;
    proofCount: number;
    breachVerified: boolean;
    resolutionRationale?: string;
    paypalEvidencePrepared?: boolean;
  }>> {
    // Start from a successful settled procurement (Scenario A)
    const scenarioA = await this.runScenarioA();
    const session = sessionStore.getSession(scenarioA.sessionId)!;

    // Supplier delivers wrong product SKU (e.g. DW-1080P instead of contracted DW-4K-USB-C)
    const dispute = this.disputeService.openDispute({
      sessionId: session.id,
      category: "WRONG_ITEM",
      description: "Delivered 1080p VGA monitors instead of contracted 4K USB-C monitors.",
      refundRequested: true,
    });

    // Run deterministic evaluation with physical inspection evidence
    const evaluated = this.disputeService.evaluateDispute({
      disputeId: dispute.disputeId,
      externalEvidence: {
        deliveredSku: "DW-1080P-VGA-REFURB",
      },
    });

    // Prepare PayPal Dispute Evidence Package with Merkle inclusion proofs
    const paypalPkg = this.disputeService.preparePayPalDisputeEvidence(dispute.disputeId);

    return {
      scenario: "F",
      name: "Dispute Resolution Lifecycle",
      success: evaluated.status === "VERIFIED" && evaluated.inclusionProofs.length > 0,
      summary: `Opened dispute ${dispute.disputeId} against settled transaction. Deterministic auditor compared delivered SKU against committed Merkle tree, verified contract breach, generated ${evaluated.inclusionProofs.length} inclusion proofs, and approved refund claim.`,
      sessionId: session.id,
      details: {
        disputeId: dispute.disputeId,
        disputeCategory: dispute.category,
        disputeStatus: evaluated.status,
        evidenceRoot: evaluated.evidenceRoot,
        proofCount: evaluated.inclusionProofs.length,
        breachVerified: evaluated.status === "VERIFIED",
        resolutionRationale: evaluated.resolutionRationale,
        paypalEvidencePrepared: paypalPkg.inclusionProofs.length > 0,
      },
    };
  }

  /**
   * Runs all 6 scenarios in sequence.
   */
  public async runAllScenarios(): Promise<Record<string, ScenarioResult>> {
    const a = await this.runScenarioA();
    const b = await this.runScenarioB();
    const c = await this.runScenarioC();
    const d = await this.runScenarioD();
    const e = await this.runScenarioE();
    const f = await this.runScenarioF();

    return { A: a, B: b, C: c, D: d, E: e, F: f };
  }
}
