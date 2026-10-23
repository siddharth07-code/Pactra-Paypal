/**
 * PACTUM — Multi-Agent Negotiation Orchestrator
 * Coordinates multi-vendor competition across competing wholesale vendors and discrete rounds.
 * Intercepts every outgoing buyer offer with the deterministic mechanism guardrail.
 * Drives distinct vendor simulations with private reservation constraints.
 * Commits flight-recorder evidence into the VeriPay SHA-256 Merkle tree.
 * Follows GEMINI.md Section 5, 6, 7 and SECURITY.md Section 5, 6, 9.
 */

import crypto from "crypto";
import type {
  ProcurementMandate,
  VendorQuote,
  NegotiationOffer,
  NegotiationTurn,
  ProcurementSession,
  AuditCertificate,
  StructuredNegotiationState,
  CompetingVendorOfferSummary,
  GuardrailInterventionSummary,
  QuoteEvaluation,
  AgreementRecord,
  NegotiationOfferState,
} from "../types/pactum";
import {
  verifyBuyerOffer,
  calculateUtility,
  calculateBoulwareThreshold,
  type GuardrailConfig,
} from "./mechanism-guardrail";
import { VeriPayMerkleTree } from "./veripay-merkle";
import { GeminiNegotiationClient } from "./gemini-client";
import { AcworldAuditor } from "./acworld-auditor";
import { sessionStore } from "./session-store";
import {
  calculateSimulatedVendorCounteroffer,
  getVendorSimulationProfile,
  type VendorSimulationProfile,
} from "./vendor-simulator";

export interface OrchestratorOptions {
  geminiClient?: GeminiNegotiationClient;
  maxRounds?: number; // 4 for demo
  guardrailConfig?: GuardrailConfig;
  onEvent?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
}

export interface OrchestrationResult {
  session: ProcurementSession;
  merkleTree: VeriPayMerkleTree;
  selectedQuote?: VendorQuote;
  finalOffer?: NegotiationOffer;
  totalCost?: number;
  savingsVsBaseline?: number;
  completed: boolean;
}

/**
 * Deterministic Vendor Counteroffer Strategy
 * Re-exports the simulated vendor counteroffer engine for backward compatibility.
 */
export function calculateVendorCounteroffer(
  vendorQuote: VendorQuote,
  currentBuyerOffer: NegotiationOffer,
  round: number,
  maxRounds: number,
  profile?: VendorSimulationProfile
): {
  unitAsk: number;
  message: string;
  provenance: "SIMULATED_VENDOR";
  accepted: boolean;
  atFloor: boolean;
  strategyType: string;
} {
  const result = calculateSimulatedVendorCounteroffer({
    vendorQuote,
    buyerOffer: currentBuyerOffer,
    round,
    maxRounds,
    profile,
  });

  return {
    unitAsk: result.unitAsk,
    message: result.message,
    provenance: result.provenance,
    accepted: result.accepted,
    atFloor: result.atFloor,
    strategyType: result.strategyType,
  };
}

/**
 * Negotiation Orchestrator
 */
export class NegotiationOrchestrator {
  private geminiClient: GeminiNegotiationClient;
  private maxRounds: number;
  private guardrailConfig: GuardrailConfig;
  private onEvent?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;

  constructor(options?: OrchestratorOptions) {
    this.geminiClient = options?.geminiClient ?? new GeminiNegotiationClient();
    this.maxRounds = options?.maxRounds ?? 4;
    this.guardrailConfig = options?.guardrailConfig ?? {
      maxRounds: this.maxRounds,
      minUtility: 0.35,
      boulwareBeta: 3.0,
      targetPriceDiscount: 0.25,
      simulatedInterventionVendorId: "vendor-displayworld",
      simulatedInterventionRound: 2,
    };
    this.onEvent = options?.onEvent;
  }

  /**
   * Executes the full multi-vendor negotiation pipeline.
   */
  public async runNegotiation(
    mandate: ProcurementMandate,
    initialQuotes: VendorQuote[],
    existingSessionId?: string,
    quoteEvaluations?: Record<string, QuoteEvaluation>
  ): Promise<OrchestrationResult> {
    const sessionId = existingSessionId || `session_${crypto.randomBytes(8).toString("hex")}`;
    const merkleTree = new VeriPayMerkleTree();

    // 1. Commit MANDATE_LOCKED event
    merkleTree.addEvent("MANDATE_LOCKED", {
      mandateId: mandate.id,
      quantity: mandate.quantity,
      maxBudget: mandate.maxTotalBudget,
      maxDeliveryDays: mandate.maxDeliveryDays,
      minReturnDays: mandate.minReturnDays,
      currency: mandate.currency,
      timestamp: new Date().toISOString(),
    });

    // 2. Commit CHANNEL3_CATALOG_SNAPSHOT event
    merkleTree.addEvent("CHANNEL3_CATALOG_SNAPSHOT", {
      sessionId,
      quotes: initialQuotes.map((q) => ({
        vendorId: q.vendorId,
        vendorName: q.vendorName,
        sku: q.sku,
        initialUnitAsk: q.initialUnitAsk,
        shippingCost: q.shippingCost,
      })),
      timestamp: new Date().toISOString(),
    });

    await this.emit({
      type: "SESSION_INITIALIZED",
      payload: { sessionId, mandate, quotes: initialQuotes },
    });

    const activeQuotes = initialQuotes.map((q) => ({ ...q }));

    // Persist session in authoritative store right at initialization
    const existing = existingSessionId ? sessionStore.getSession(existingSessionId) : undefined;
    const initialSession: ProcurementSession = {
      ...(existing || {}),
      id: sessionId,
      mandate: { ...(existing?.mandate || mandate), isLocked: true },
      quotes: activeQuotes,
      turns: [],
      status: "NEGOTIATING",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessionStore.saveSession(initialSession);

    const turns: NegotiationTurn[] = [];

    // Initialize stable vendor simulation profiles (strictly server-side, never leaked to client)
    const vendorProfiles = new Map<string, VendorSimulationProfile>();
    for (const quote of activeQuotes) {
      vendorProfiles.set(quote.vendorId, getVendorSimulationProfile(quote));
    }

    // Track structured state per vendor
    const vendorState = new Map<
      string,
      {
        previousBuyerOffer?: NegotiationOffer;
        previousBuyerOffers: NegotiationOffer[];
        currentVendorAsk: number;
        previousVendorCounteroffers: Array<{
          round: number;
          unitAsk: number;
          message: string;
          accepted?: boolean;
        }>;
        interventions: GuardrailInterventionSummary[];
        agreement?: AgreementRecord;
        offerState: NegotiationOfferState;
      }
    >();

    for (const quote of activeQuotes) {
      vendorState.set(quote.vendorId, {
        currentVendorAsk: quote.initialUnitAsk,
        previousBuyerOffers: [],
        previousVendorCounteroffers: [],
        interventions: [],
        offerState: "PROPOSED",
      });
    }

    // Run discrete negotiation rounds 1 to maxRounds
    for (let round = 1; round <= this.maxRounds; round++) {
      await this.emit({
        type: "ROUND_STARTED",
        payload: { sessionId, round, maxRounds: this.maxRounds },
      });

      // Negotiate with each competing vendor in sequence
      for (const vendor of activeQuotes) {
        const state = vendorState.get(vendor.vendorId)!;
        const profile = vendorProfiles.get(vendor.vendorId)!;

        // Build cross-vendor intelligence summaries (strictly eligible competitors)
        const competingEligibleOffers: CompetingVendorOfferSummary[] = activeQuotes
          .filter((q) => q.vendorId !== vendor.vendorId)
          .map((q) => {
            const qState = vendorState.get(q.vendorId);
            const currentBid = qState?.currentVendorAsk ?? q.currentUnitBid;
            const landed = currentBid * mandate.quantity + q.shippingCost;
            const evalItem = quoteEvaluations ? quoteEvaluations[q.vendorId] : undefined;
            return {
              vendorId: q.vendorId,
              vendorName: q.vendorName,
              sku: q.sku,
              currentUnitBid: currentBid,
              initialUnitAsk: q.initialUnitAsk,
              shippingCost: q.shippingCost,
              deliveryDays: q.deliveryDays,
              returnDays: q.returnDays,
              currentLandedCost: landed,
              dataSource: q.dataSource,
              eligibilityStatus: evalItem?.status ?? "ELIGIBLE",
              compatibilityExplanation: evalItem?.compatibility?.explanation,
            };
          });

        // Construct authoritative structured negotiation state server-side
        const structuredState: StructuredNegotiationState = {
          sessionId,
          mandateId: mandate.id,
          mandateVersion: mandate.version ?? 1,
          round,
          maxRounds: this.maxRounds,
          remainingRounds: Math.max(0, this.maxRounds - round),
          activeVendorId: vendor.vendorId,
          originalQuote: vendor,
          currentVendorAsk: state.currentVendorAsk,
          currentBuyerOffer: state.previousBuyerOffer,
          previousBuyerOffers: [...state.previousBuyerOffers],
          previousVendorCounteroffers: [...state.previousVendorCounteroffers],
          competingEligibleOffers,
          currentLandedCost: state.currentVendorAsk * mandate.quantity + vendor.shippingCost,
          mandateConstraints: {
            quantity: mandate.quantity,
            maxTotalBudget: mandate.maxTotalBudget,
            maxDeliveryDays: mandate.maxDeliveryDays,
            minReturnDays: mandate.minReturnDays,
            currency: mandate.currency,
            requiredSpecs: mandate.requiredSpecs,
            requiredCondition: mandate.requiredCondition,
          },
          previousGuardrailInterventions: [...state.interventions],
          agreementRecord: state.agreement,
          status: "ACTIVE",
        };

        // Step A: Gemini Buyer proposes an offer
        let proposal = await this.geminiClient.generateBuyerOffer({
          mandate,
          vendorQuote: vendor,
          round,
          maxRounds: this.maxRounds,
          previousBuyerOffer: state.previousBuyerOffer,
          previousVendorAsk: state.currentVendorAsk,
          structuredState,
          competingQuotes: activeQuotes,
          quoteEvaluations,
          history: turns,
        });

        let offer: NegotiationOffer = {
          unitPrice: proposal.unitPrice,
          quantity: mandate.quantity,
          deliveryDays: proposal.deliveryDays,
          returnDays: proposal.returnDays,
          shippingCost: vendor.shippingCost,
        };

        // Step B: Pass offer through Mechanism-Design Guardrail
        let guardrailResult = verifyBuyerOffer(offer, proposal.message, {
          mandate,
          vendorQuote: vendor,
          round,
          previousBuyerOffer: state.previousBuyerOffer,
          previousVendorAsk: state.currentVendorAsk,
          config: this.guardrailConfig,
        });

        // Handle blocked or intervention events with bounded regeneration
        if (!guardrailResult.passed) {
          const isIntervention = guardrailResult.status === "GUARDRAIL_INTERVENTION";
          await this.emit({
            type: isIntervention ? "GUARDRAIL_INTERVENTION" : "GUARDRAIL_BLOCKED",
            payload: {
              sessionId,
              round,
              vendorId: vendor.vendorId,
              vendorName: vendor.vendorName,
              status: guardrailResult.status,
              reason: guardrailResult.reason,
              rejectedOffer: offer,
              generator: proposal.generator,
              latencyMs: proposal.latencyMs,
            },
          });

          // Record intervention in state
          state.interventions.push({
            round,
            vendorId: vendor.vendorId,
            status: guardrailResult.status,
            predicateFailed: guardrailResult.predicateFailed,
            reason: guardrailResult.reason ?? "Guardrail constraint check failed.",
            timestamp: new Date().toISOString(),
          });

          // Record rejected turn in history with explicit provenance
          turns.push({
            id: `turn_${crypto.randomBytes(4).toString("hex")}`,
            round,
            vendorId: vendor.vendorId,
            actor: "BUYER",
            turnType: "REJECTION",
            offerState: "REJECTED",
            message: proposal.message,
            proposedOffer: offer,
            guardrailStatus: guardrailResult.status,
            guardrailReason: guardrailResult.reason,
            generator: proposal.generator,
            timestamp: new Date().toISOString(),
          });

          // Request bounded regeneration under tighter bounds (without simulation trigger)
          const adjustedConfig: GuardrailConfig = {
            ...this.guardrailConfig,
            simulatedInterventionVendorId: undefined, // Clear intervention so regenerated offer can pass
            simulatedInterventionRound: undefined,
          };

          // Regenerate proposal
          proposal = await this.geminiClient.generateBuyerOffer({
            mandate,
            vendorQuote: vendor,
            round,
            maxRounds: this.maxRounds,
            previousBuyerOffer: state.previousBuyerOffer,
            previousVendorAsk: state.currentVendorAsk,
            guardrailFeedback: guardrailResult.reason,
            structuredState,
            competingQuotes: activeQuotes,
            quoteEvaluations,
            history: turns,
          });

          offer = {
            unitPrice: proposal.unitPrice,
            quantity: mandate.quantity,
            deliveryDays: proposal.deliveryDays,
            returnDays: proposal.returnDays,
            shippingCost: vendor.shippingCost,
          };

          // Revalidate regenerated offer from the beginning
          guardrailResult = verifyBuyerOffer(offer, proposal.message, {
            mandate,
            vendorQuote: vendor,
            round,
            previousBuyerOffer: state.previousBuyerOffer,
            previousVendorAsk: state.currentVendorAsk,
            config: adjustedConfig,
          });

          if (!guardrailResult.passed) {
            state.offerState = "REJECTED";
            turns.push({
              id: `turn_${crypto.randomBytes(4).toString("hex")}`,
              round,
              vendorId: vendor.vendorId,
              actor: "BUYER",
              turnType: "REJECTION",
              offerState: "REJECTED",
              message: proposal.message,
              proposedOffer: offer,
              guardrailStatus: guardrailResult.status,
              guardrailReason: guardrailResult.reason,
              generator: proposal.generator,
              timestamp: new Date().toISOString(),
            });
            await this.emit({
              type: "GUARDRAIL_BLOCKED",
              payload: {
                sessionId,
                round,
                vendorId: vendor.vendorId,
                vendorName: vendor.vendorName,
                status: guardrailResult.status,
                reason: guardrailResult.reason,
                rejectedOffer: offer,
                generator: proposal.generator,
                latencyMs: proposal.latencyMs,
              },
            });
          }
        }

        // Only transmit to vendor if APPROVED
        if (guardrailResult.passed) {
          state.previousBuyerOffer = offer;
          state.previousBuyerOffers.push(offer);
          state.offerState = "PROPOSED";

          // Record approved buyer turn with explicit provenance
          const buyerTurn: NegotiationTurn = {
            id: `turn_${crypto.randomBytes(4).toString("hex")}`,
            round,
            vendorId: vendor.vendorId,
            actor: "BUYER",
            turnType: "PROPOSAL",
            offerState: "PROPOSED",
            message: proposal.message,
            proposedOffer: offer,
            utilityScore: guardrailResult.utilityScore,
            boulwareThreshold: guardrailResult.boulwareThreshold,
            guardrailStatus: "APPROVED",
            generator: proposal.generator,
            timestamp: new Date().toISOString(),
          };
          turns.push(buyerTurn);

          await this.emit({
            type: "BUYER_PROPOSAL",
            payload: {
              sessionId,
              round,
              vendorId: vendor.vendorId,
              vendorName: vendor.vendorName,
              message: proposal.message,
              proposedOffer: offer,
              utilityScore: guardrailResult.utilityScore,
              threshold: guardrailResult.boulwareThreshold,
              generator: proposal.generator,
              latencyMs: proposal.latencyMs,
              modelName: proposal.modelName,
              turn: buyerTurn,
            },
          });

          // Simulated Vendor generates realistic counteroffer based on its stable commercial strategy
          const vendorResponse = calculateVendorCounteroffer(vendor, offer, round, this.maxRounds, profile);
          vendor.currentUnitBid = vendorResponse.unitAsk;
          state.currentVendorAsk = vendorResponse.unitAsk;
          state.previousVendorCounteroffers.push({
            round,
            unitAsk: vendorResponse.unitAsk,
            message: vendorResponse.message,
            accepted: vendorResponse.accepted,
          });

          if (vendorResponse.accepted) {
            const agreement: AgreementRecord = {
              agreementId: `agree_${crypto.randomBytes(6).toString("hex")}`,
              sessionId,
              vendorId: vendor.vendorId,
              vendorName: vendor.vendorName,
              sku: vendor.sku,
              agreedPrice: vendorResponse.unitAsk,
              agreedOffer: { ...offer, unitPrice: vendorResponse.unitAsk },
              totalCost: vendorResponse.unitAsk * mandate.quantity + vendor.shippingCost,
              agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
              round,
              acceptedAt: new Date().toISOString(),
              mandateVersion: mandate.version ?? 1,
            };
            state.agreement = agreement;
            state.offerState = "ACCEPTED";
          } else {
            state.offerState = "COUNTEROFFERED";
          }

          const vendorTurn: NegotiationTurn = {
            id: `turn_${crypto.randomBytes(4).toString("hex")}`,
            round,
            vendorId: vendor.vendorId,
            actor: "VENDOR",
            turnType: vendorResponse.accepted ? "ACCEPTANCE" : "COUNTEROFFER",
            offerState: vendorResponse.accepted ? "ACCEPTED" : "COUNTEROFFERED",
            agreementId: state.agreement?.agreementId,
            message: vendorResponse.message,
            proposedOffer: {
              ...offer,
              unitPrice: vendorResponse.unitAsk,
            },
            guardrailStatus: "APPROVED",
            vendorProvenance: "SIMULATED_VENDOR",
            timestamp: new Date().toISOString(),
          };
          turns.push(vendorTurn);

          await this.emit({
            type: "VENDOR_COUNTEROFFER",
            payload: {
              sessionId,
              round,
              vendorId: vendor.vendorId,
              vendorName: vendor.vendorName,
              newUnitAsk: vendorResponse.unitAsk,
              provenance: "SIMULATED_VENDOR",
              strategyType: profile.strategyType,
              accepted: vendorResponse.accepted,
              agreementId: state.agreement?.agreementId,
              atFloor: vendorResponse.atFloor,
              turn: vendorTurn,
            },
          });
        }
      }

      // Commit verified round history to Merkle Flight Recorder
      merkleTree.addEvent("VERIFIED_NEGOTIATION_ROUND", {
        sessionId,
        round,
        turnsInRound: turns.filter((t) => t.round === round),
        vendorStates: activeQuotes.map((q) => ({
          vendorId: q.vendorId,
          currentAsk: q.currentUnitBid,
        })),
        timestamp: new Date().toISOString(),
      });

      await this.emit({
        type: "ROUND_COMPLETED",
        payload: { sessionId, round, merkleRoot: merkleTree.getRootHash() },
      });
    }

    // Step B.2: Negotiation Closing & Agreement Formation
    // For vendors where mutual agreement has not yet been formed, check if the buyer accepts their final counteroffer at the deadline
    for (const vendor of activeQuotes) {
      const state = vendorState.get(vendor.vendorId)!;
      if (!state.agreement && state.previousBuyerOffer) {
        const finalAsk = state.currentVendorAsk;
        const totalCost = finalAsk * mandate.quantity + vendor.shippingCost;
        const withinBudget = totalCost <= mandate.maxTotalBudget;
        const deliveryCompliant = vendor.deliveryDays <= mandate.maxDeliveryDays;
        const returnCompliant = vendor.returnDays >= mandate.minReturnDays;
        const conditionCompliant =
          !mandate.requiredCondition || vendor.condition === mandate.requiredCondition;
        const arithmeticValid = Number.isFinite(totalCost) && totalCost > 0 && finalAsk > 0;

        const candidateOffer: NegotiationOffer = {
          unitPrice: finalAsk,
          quantity: mandate.quantity,
          deliveryDays: vendor.deliveryDays,
          returnDays: vendor.returnDays,
          shippingCost: vendor.shippingCost,
        };

        const { utility } = calculateUtility(
          candidateOffer,
          mandate,
          vendor,
          this.guardrailConfig.targetPriceDiscount ?? 0.25
        );

        const deadlineThreshold = calculateBoulwareThreshold(
          this.maxRounds,
          this.maxRounds,
          this.guardrailConfig.minUtility ?? 0.35,
          this.guardrailConfig.boulwareBeta ?? 3.0
        );

        if (
          withinBudget &&
          deliveryCompliant &&
          returnCompliant &&
          conditionCompliant &&
          arithmeticValid &&
          utility >= deadlineThreshold - 1e-6
        ) {
          const agreement: AgreementRecord = {
            agreementId: `agree_${crypto.randomBytes(6).toString("hex")}`,
            sessionId,
            vendorId: vendor.vendorId,
            vendorName: vendor.vendorName,
            sku: vendor.sku,
            agreedPrice: finalAsk,
            agreedOffer: candidateOffer,
            totalCost,
            agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
            round: this.maxRounds,
            acceptedAt: new Date().toISOString(),
            mandateVersion: mandate.version ?? 1,
          };
          state.agreement = agreement;
          state.offerState = "ACCEPTED";

          const acceptTurn: NegotiationTurn = {
            id: `turn_${crypto.randomBytes(4).toString("hex")}`,
            round: this.maxRounds,
            vendorId: vendor.vendorId,
            actor: "BUYER",
            turnType: "ACCEPTANCE",
            offerState: "ACCEPTED",
            agreementId: agreement.agreementId,
            message: `Simulated buyer response: We accept your final wholesale terms of $${finalAsk.toFixed(2)} per unit for ${mandate.quantity} units with ${vendor.deliveryDays}-day delivery and ${vendor.returnDays}-day return protection.`,
            proposedOffer: candidateOffer,
            utilityScore: utility,
            boulwareThreshold: deadlineThreshold,
            guardrailStatus: "APPROVED",
            generator: "DETERMINISTIC_FALLBACK",
            timestamp: new Date().toISOString(),
          };
          turns.push(acceptTurn);
        } else {
          state.offerState = "EXPIRED";
        }
      }
    }

    // Step C: Deterministic Offer Ranking, Validation, & Selection Policy
    // Only vendors with a valid, authoritative AgreementRecord are eligible candidates
    const evaluatedCandidates = activeQuotes
      .map((quote) => {
        const state = vendorState.get(quote.vendorId);
        const agreement = state?.agreement;
        if (!agreement) {
          return null;
        }

        // Authoritatively re-validate the agreement against the current locked mandate
        const withinBudget = agreement.totalCost <= mandate.maxTotalBudget;
        const deliveryCompliant = agreement.agreedOffer.deliveryDays <= mandate.maxDeliveryDays;
        const returnCompliant = agreement.agreedOffer.returnDays >= mandate.minReturnDays;
        const conditionCompliant =
          !mandate.requiredCondition || quote.condition === mandate.requiredCondition;
        const arithmeticValid =
          Number.isFinite(agreement.totalCost) &&
          agreement.totalCost > 0 &&
          agreement.agreedPrice > 0;
        const mandateVersionValid =
          agreement.mandateVersion === (mandate.version ?? 1);

        const feasible =
          withinBudget &&
          deliveryCompliant &&
          returnCompliant &&
          conditionCompliant &&
          arithmeticValid &&
          mandateVersionValid;

        if (!feasible) return null;

        const { utility } = calculateUtility(
          agreement.agreedOffer,
          mandate,
          quote,
          this.guardrailConfig.targetPriceDiscount ?? 0.25
        );

        return {
          quote,
          agreement,
          totalCost: agreement.totalCost,
          utility,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // If NO offer is acceptable/feasible, orchestrator produces an explicit no-deal outcome
    if (evaluatedCandidates.length === 0) {
      const session: ProcurementSession = {
        id: sessionId,
        mandate,
        quotes: activeQuotes,
        turns,
        selectedQuote: undefined,
        finalOffer: undefined,
        agreementRecord: undefined,
        status: "AUDIT_FAILED",
        merkleRoot: merkleTree.getRootHash(),
        preSettlementRoot: merkleTree.getRootHash(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      sessionStore.saveSession(session);

      await this.emit({
        type: "NEGOTIATION_COMPLETED",
        payload: {
          sessionId,
          selectedVendor: undefined,
          totalCost: undefined,
          savings: 0,
          outcome: "NO_DEAL",
          reason: "No vendor counteroffer satisfied mandatory budget and SLA constraints.",
          merkleRoot: session.merkleRoot,
          auditPassed: false,
        },
      });

      return {
        session,
        merkleTree,
        selectedQuote: undefined,
        finalOffer: undefined,
        totalCost: undefined,
        savingsVsBaseline: 0,
        completed: false,
      };
    }

    // Sort feasible candidates:
    // 1. Highest multi-attribute utility score
    // 2. Deterministic tie-breaking by lowest total landed cost (if utility difference < 1e-4)
    // 3. Deterministic alphabetical tie-breaking by vendorId (if cost difference < $0.01)
    evaluatedCandidates.sort((a, b) => {
      const utilityDiff = b.utility - a.utility;
      if (Math.abs(utilityDiff) > 1e-4) {
        return utilityDiff;
      }
      const costDiff = a.totalCost - b.totalCost;
      if (Math.abs(costDiff) > 0.01) {
        return costDiff;
      }
      return a.quote.vendorId.localeCompare(b.quote.vendorId);
    });

    const winner = evaluatedCandidates[0];

    const finalOffer: NegotiationOffer = winner.agreement.agreedOffer;

    // Calculate baseline cost vs negotiated savings
    const initialBaselineCost =
      (initialQuotes[0]?.initialUnitAsk ?? 380) * mandate.quantity + (initialQuotes[0]?.shippingCost ?? 150);
    const savingsVsBaseline = Math.max(0, initialBaselineCost - winner.totalCost);

    // Run independent ACWORLD audit on final negotiated state
    const auditor = new AcworldAuditor();

    const preAuditSession: ProcurementSession = {
      id: sessionId,
      mandate,
      quotes: activeQuotes,
      turns,
      selectedQuote: winner.quote,
      finalOffer,
      agreementRecord: winner.agreement,
      status: "AUDIT_PENDING",
      merkleRoot: merkleTree.getRootHash(),
      preSettlementRoot: merkleTree.getRootHash(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const auditCertificate: AuditCertificate = auditor.audit({ session: preAuditSession });

    const session: ProcurementSession = {
      id: sessionId,
      mandate,
      quotes: activeQuotes,
      turns,
      selectedQuote: winner.quote,
      finalOffer,
      agreementRecord: winner.agreement,
      status: auditCertificate.passed ? "AUDIT_PASSED" : "AUDIT_FAILED",
      auditCertificate,
      merkleRoot: merkleTree.getRootHash(),
      preSettlementRoot: merkleTree.getRootHash(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Persist final session state to authoritative store
    sessionStore.saveSession(session);

    await this.emit({
      type: "NEGOTIATION_COMPLETED",
      payload: {
        sessionId,
        selectedVendor: winner.quote.vendorName,
        totalCost: winner.totalCost,
        savings: savingsVsBaseline,
        merkleRoot: session.merkleRoot,
        auditPassed: auditCertificate.passed,
      },
    });

    return {
      session,
      merkleTree,
      selectedQuote: winner.quote,
      finalOffer,
      totalCost: winner.totalCost,
      savingsVsBaseline,
      completed: true,
    };
  }

  private async emit(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (this.onEvent) {
      await this.onEvent(event);
    }
  }
}
