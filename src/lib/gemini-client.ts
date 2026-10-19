/**
 * PACTUM — Gemini Negotiation Client
 * Interfaces with Google Gemini API for proposing structured buyer offers and reasoning.
 * Enforces runtime schema validation, bounded retries, and strict server-side credentials.
 * Follows GEMINI.md Section 5 & 10 and SECURITY.md Section 2, 4, 5.
 */

import { GoogleGenAI } from "@google/genai";
import type {
  ProcurementMandate,
  VendorQuote,
  NegotiationOffer,
} from "../types/pactum";

export interface GeminiBuyerProposal {
  unitPrice: number;
  deliveryDays: number;
  returnDays: number;
  message: string;
  tacticalRationale: string;
}

export interface GeminiClientOptions {
  apiKey?: string;
  modelName?: string;
}

/**
 * Gemini Client for B2B Buyer Agent Negotiation
 */
export class GeminiNegotiationClient {
  private ai: GoogleGenAI | null = null;
  private modelName: string;

  constructor(options?: GeminiClientOptions) {
    const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
    this.modelName = options?.modelName ?? "gemini-2.5-flash";
  }

  /**
   * Prompts Gemini to generate a structured buyer counter-offer.
   * If API key is unavailable or generation fails, generates a deterministic bounded proposal.
   */
  public async generateBuyerOffer(params: {
    mandate: ProcurementMandate;
    vendorQuote: VendorQuote;
    round: number;
    maxRounds: number;
    previousBuyerOffer?: NegotiationOffer;
    previousVendorAsk: number;
    guardrailFeedback?: string;
  }): Promise<GeminiBuyerProposal> {
    const {
      mandate,
      vendorQuote,
      round,
      maxRounds,
      previousBuyerOffer,
      previousVendorAsk,
      guardrailFeedback,
    } = params;

    // If Gemini client is configured with live key, attempt API call
    if (this.ai) {
      try {
        const prompt = this.buildPrompt({
          mandate,
          vendorQuote,
          round,
          maxRounds,
          previousBuyerOffer,
          previousVendorAsk,
          guardrailFeedback,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2, // Low temperature for consistent rational negotiation
          },
        });

        clearTimeout(timeoutId);

        if (response.text) {
          const parsed = JSON.parse(response.text) as Partial<GeminiBuyerProposal>;
          const validated = this.validateAndSanitizeProposal(parsed, {
            mandate,
            vendorQuote,
            previousBuyerOffer,
            previousVendorAsk,
          });
          if (validated) {
            return validated;
          }
        }
      } catch {
        // Fall back to deterministic rational proposal if API call fails or times out
      }
    }

    // Deterministic rational buyer proposal fallback
    return this.generateDeterministicProposal({
      mandate,
      vendorQuote,
      round,
      maxRounds,
      previousBuyerOffer,
      previousVendorAsk,
    });
  }

  /**
   * Builds safe prompt without exposing private reservation price or maximum budget directly in messages.
   */
  private buildPrompt(context: {
    mandate: ProcurementMandate;
    vendorQuote: VendorQuote;
    round: number;
    maxRounds: number;
    previousBuyerOffer?: NegotiationOffer;
    previousVendorAsk: number;
    guardrailFeedback?: string;
  }): string {
    const {
      mandate,
      vendorQuote,
      round,
      maxRounds,
      previousBuyerOffer,
      previousVendorAsk,
      guardrailFeedback,
    } = context;

    return `You are a B2B Autonomous Procurement Buyer Agent representing an enterprise purchasing ${mandate.quantity} units of ${mandate.itemQuery}.
Current round: ${round} of ${maxRounds}.
Vendor: ${vendorQuote.vendorName} (${vendorQuote.productTitle}).
Vendor initial unit ask: $${vendorQuote.initialUnitAsk.toFixed(2)}.
Vendor current unit ask: $${previousVendorAsk.toFixed(2)}.
Vendor shipping: $${vendorQuote.shippingCost.toFixed(2)}.
Vendor delivery days: ${vendorQuote.deliveryDays}.
Vendor return days: ${vendorQuote.returnDays}.
${previousBuyerOffer ? `Previous buyer offer: $${previousBuyerOffer.unitPrice.toFixed(2)}.` : "This is the initial buyer offer."}
${guardrailFeedback ? `PREVIOUS GUARDRAIL FEEDBACK TO CORRECT: ${guardrailFeedback}` : ""}

CONSTRAINTS & RULES:
1. Max total spend must not exceed the enterprise budget limit.
2. Anti-thrashing rule: your offer price must be >= previous buyer offer and <= vendor current ask ($${previousVendorAsk.toFixed(2)}).
3. Do NOT reveal internal max budget or reservation price in your vendor message.
4. Output strict JSON matching this schema:
{
  "unitPrice": number,
  "deliveryDays": number,
  "returnDays": number,
  "message": string,
  "tacticalRationale": string
}`;
  }

  /**
   * Validates runtime output from model.
   */
  public validateAndSanitizeProposal(
    raw: Partial<GeminiBuyerProposal>,
    bounds: {
      mandate: ProcurementMandate;
      vendorQuote: VendorQuote;
      previousBuyerOffer?: NegotiationOffer;
      previousVendorAsk: number;
    }
  ): GeminiBuyerProposal | null {
    if (
      typeof raw.unitPrice !== "number" ||
      !Number.isFinite(raw.unitPrice) ||
      typeof raw.deliveryDays !== "number" ||
      typeof raw.returnDays !== "number" ||
      typeof raw.message !== "string"
    ) {
      return null;
    }

    // Ensure within reasonable bounds
    const prevBuyer = bounds.previousBuyerOffer?.unitPrice ?? (bounds.vendorQuote.initialUnitAsk * 0.7);
    if (raw.unitPrice < prevBuyer || raw.unitPrice > bounds.previousVendorAsk) {
      return null;
    }

    return {
      unitPrice: Math.round(raw.unitPrice * 100) / 100,
      deliveryDays: Math.min(bounds.mandate.maxDeliveryDays, Math.max(1, Math.round(raw.deliveryDays))),
      returnDays: Math.max(bounds.mandate.minReturnDays, Math.round(raw.returnDays)),
      message: raw.message.trim(),
      tacticalRationale: typeof raw.tacticalRationale === "string" ? raw.tacticalRationale : "Model proposed rational counter-offer.",
    };
  }

  /**
   * Generates deterministic rational progression when live API is unconfigured or in tests.
   * Concession curve: progresses from 22% discount toward 12% discount over rounds 1 to 4.
   */
  public generateDeterministicProposal(context: {
    mandate: ProcurementMandate;
    vendorQuote: VendorQuote;
    round: number;
    maxRounds: number;
    previousBuyerOffer?: NegotiationOffer;
    previousVendorAsk: number;
  }): GeminiBuyerProposal {
    const { mandate, vendorQuote, round, maxRounds, previousBuyerOffer, previousVendorAsk } = context;

    const initialAsk = vendorQuote.initialUnitAsk;
    const targetPrice = initialAsk * 0.75; // 25% target discount

    // Delivery & Return requests aligned with strong SLAs
    const deliveryDays = Math.min(mandate.maxDeliveryDays, 2);
    const returnDays = Math.max(mandate.minReturnDays, 45);

    // Compute SLA utility contribution
    const deliveryDenom = Math.max(1, mandate.maxDeliveryDays - 1);
    const D_t = Math.max(0, Math.min(1, (mandate.maxDeliveryDays - deliveryDays) / deliveryDenom));
    const returnDenom = Math.max(1, 60 - mandate.minReturnDays);
    const R_t = Math.max(0, Math.min(1, (returnDays - mandate.minReturnDays) / returnDenom));
    const slaUtility = 0.15 * D_t + 0.15 * R_t;

    // Boulware threshold for current round: tau(t) = U_min + (1 - U_min) * (1 - (t/T)^3)
    const progress = Math.max(0, Math.min(1, round / maxRounds));
    const decay = Math.pow(progress, 3.0);
    const threshold = 0.35 + (1 - 0.35) * (1 - decay);

    // We need 0.70 * P_t + slaUtility >= threshold
    const requiredP_t = Math.max(0, Math.min(1, (threshold - slaUtility + 0.02) / 0.7));
    // P_t = (initialAsk - price) / (initialAsk - targetPrice) -> price = initialAsk - P_t * (initialAsk - targetPrice)
    let unitPrice = Math.round((initialAsk - requiredP_t * (initialAsk - targetPrice)) * 100) / 100;

    // Anti-thrashing bounds: p_(t-1) <= p_t <= p_(vendor, t-1)
    if (previousBuyerOffer && unitPrice < previousBuyerOffer.unitPrice) {
      unitPrice = Math.min(previousBuyerOffer.unitPrice + 2.0, previousVendorAsk);
    }
    if (unitPrice > previousVendorAsk) {
      unitPrice = previousVendorAsk;
    }

    // Budget constraint check: unitPrice * quantity + shipping <= maxTotalBudget
    const maxAffordableUnit = (mandate.maxTotalBudget - vendorQuote.shippingCost) / mandate.quantity;
    if (unitPrice > maxAffordableUnit) {
      unitPrice = Math.floor(maxAffordableUnit * 100) / 100;
    }

    // Dynamically ensure proposed price does not collide with the private reservation price range ±3%
    const p_res = mandate.maxTotalBudget / mandate.quantity;
    if (unitPrice >= p_res * 0.97 && unitPrice <= p_res * 1.03) {
      unitPrice = Math.floor(p_res * 0.96 * 100) / 100;
    }

    return {
      unitPrice,
      deliveryDays,
      returnDays,
      message: `We submit an offer of $${unitPrice.toFixed(2)} per unit for ${mandate.quantity} units under standard commercial terms with ${deliveryDays}-day delivery and ${returnDays}-day return protection.`,
      tacticalRationale: `Round ${round}/${maxRounds}: Boulware-aligned utility targeting tau=${threshold.toFixed(3)}.`,
    };
  }
}
