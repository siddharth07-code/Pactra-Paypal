/**
 * PACTUM — Multi-Agent Negotiation Orchestrator
 * Coordinates multi-vendor competition across 3 vendors and 4 rounds.
 * Intercepts every outgoing buyer offer with the deterministic mechanism guardrail.
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
} from "../types/pactum";
import { verifyBuyerOffer, type GuardrailConfig } from "./mechanism-guardrail";
import { VeriPayMerkleTree } from "./veripay-merkle";
import { GeminiNegotiationClient } from "./gemini-client";
import { AcworldAuditor } from "./acworld-auditor";
import { sessionStore } from "./session-store";

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
 * Concedes a fraction of the spread between vendor current ask and buyer's offer.
 */
export function calculateVendorCounteroffer(
  vendorQuote: VendorQuote,
  currentBuyerOffer: NegotiationOffer,
  round: number,
  maxRounds: number
): {
  unitAsk: number;
  message: string;
} {
  const currentAsk = vendorQuote.currentUnitBid;
  const buyerBid = currentBuyerOffer.unitPrice;

  // Vendors concede more as rounds progress
  const concessionRate = 0.35 + 0.15 * (round / maxRounds);
  const spread = Math.max(0, currentAsk - buyerBid);
  const concession = Math.round(spread * concessionRate * 100) / 100;

  const newUnitAsk = Math.max(buyerBid, Math.round((currentAsk - concession) * 100) / 100);

  return {
    unitAsk: newUnitAsk,
    message: `Thank you for the counter-proposal. We can lower our wholesale price to $${newUnitAsk.toFixed(2)} per unit for ${currentBuyerOffer.quantity} units, maintaining ${vendorQuote.deliveryDays}-day delivery.`,
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
    existingSessionId?: string
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

    // Track state per vendor: previous buyer offer and previous vendor ask
    const vendorState = new Map<
      string,
      { previousBuyerOffer?: NegotiationOffer; currentVendorAsk: number }
    >();

    for (const quote of activeQuotes) {
      vendorState.set(quote.vendorId, { currentVendorAsk: quote.initialUnitAsk });
    }

    // Run discrete negotiation rounds 1 to maxRounds
    for (let round = 1; round <= this.maxRounds; round++) {
      await this.emit({
        type: "ROUND_STARTED",
        payload: { sessionId, round, maxRounds: this.maxRounds },
      });

      // Negotiate with each competing vendor in parallel/sequence
      for (const vendor of activeQuotes) {
        const state = vendorState.get(vendor.vendorId)!;

        // Step A: Gemini Buyer proposes an offer
        let proposal = await this.geminiClient.generateBuyerOffer({
          mandate,
          vendorQuote: vendor,
          round,
          maxRounds: this.maxRounds,
          previousBuyerOffer: state.previousBuyerOffer,
          previousVendorAsk: state.currentVendorAsk,
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

          // Record rejected turn in history with explicit provenance
          turns.push({
            id: `turn_${crypto.randomBytes(4).toString("hex")}`,
            round,
            vendorId: vendor.vendorId,
            actor: "BUYER",
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
        }

        // Only transmit to vendor if APPROVED
        if (guardrailResult.passed) {
          state.previousBuyerOffer = offer;

          // Record approved buyer turn with explicit provenance
          const buyerTurn: NegotiationTurn = {
            id: `turn_${crypto.randomBytes(4).toString("hex")}`,
            round,
            vendorId: vendor.vendorId,
            actor: "BUYER",
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

          // Vendor Agent generates counteroffer
          const vendorResponse = calculateVendorCounteroffer(vendor, offer, round, this.maxRounds);
          vendor.currentUnitBid = vendorResponse.unitAsk;
          state.currentVendorAsk = vendorResponse.unitAsk;

          const vendorTurn: NegotiationTurn = {
            id: `turn_${crypto.randomBytes(4).toString("hex")}`,
            round,
            vendorId: vendor.vendorId,
            actor: "VENDOR",
            message: vendorResponse.message,
            proposedOffer: {
              ...offer,
              unitPrice: vendorResponse.unitAsk,
            },
            guardrailStatus: "APPROVED",
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

    // Step C: Deterministic Offer Ranking & Selection Policy
    // Rank feasible offers by lowest total landed cost: (unitPrice * quantity) + shippingCost
    const evaluatedQuotes = activeQuotes.map((quote) => {
      const state = vendorState.get(quote.vendorId);
      const agreedUnitPrice = state?.previousBuyerOffer?.unitPrice ?? quote.currentUnitBid;
      const totalCost = agreedUnitPrice * mandate.quantity + quote.shippingCost;
      const feasible = totalCost <= mandate.maxTotalBudget;

      return {
        quote,
        agreedUnitPrice,
        totalCost,
        feasible,
      };
    });

    const feasibleQuotes = evaluatedQuotes.filter((item) => item.feasible);
    feasibleQuotes.sort((a, b) => a.totalCost - b.totalCost);

    const winner = feasibleQuotes[0];

    const finalOffer: NegotiationOffer | undefined = winner
      ? {
          unitPrice: winner.agreedUnitPrice,
          quantity: mandate.quantity,
          deliveryDays: winner.quote.deliveryDays,
          returnDays: winner.quote.returnDays,
          shippingCost: winner.quote.shippingCost,
        }
      : undefined;

    // Calculate baseline cost vs negotiated savings
    const initialBaselineCost =
      (initialQuotes[0]?.initialUnitAsk ?? 380) * mandate.quantity + (initialQuotes[0]?.shippingCost ?? 150);
    const savingsVsBaseline = winner ? Math.max(0, initialBaselineCost - winner.totalCost) : 0;

    // Run independent ACWORLD audit on final negotiated state
    const auditor = new AcworldAuditor();
    let auditCertificate: AuditCertificate | undefined;

    if (winner && finalOffer) {
      const preAuditSession: ProcurementSession = {
        id: sessionId,
        mandate,
        quotes: activeQuotes,
        turns,
        selectedQuote: winner.quote,
        finalOffer,
        status: "AUDIT_PENDING",
        merkleRoot: merkleTree.getRootHash(),
        preSettlementRoot: merkleTree.getRootHash(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      auditCertificate = auditor.audit({ session: preAuditSession });
    }

    const session: ProcurementSession = {
      id: sessionId,
      mandate,
      quotes: activeQuotes,
      turns,
      selectedQuote: winner?.quote,
      finalOffer,
      status: auditCertificate
        ? (auditCertificate.passed ? "AUDIT_PASSED" : "AUDIT_FAILED")
        : winner ? "AUDIT_PENDING" : "AUDIT_FAILED",
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
        selectedVendor: winner?.quote.vendorName,
        totalCost: winner?.totalCost,
        savings: savingsVsBaseline,
        merkleRoot: session.merkleRoot,
        auditPassed: auditCertificate?.passed,
      },
    });

    return {
      session,
      merkleTree,
      selectedQuote: winner?.quote,
      finalOffer,
      totalCost: winner?.totalCost,
      savingsVsBaseline,
      completed: !!winner,
    };
  }

  private async emit(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (this.onEvent) {
      await this.onEvent(event);
    }
  }
}
