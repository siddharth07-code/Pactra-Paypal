/**
 * PACTUM — Mandate Intelligence
 * AI-assisted and deterministic extraction of enterprise B2B procurement mandates.
 * Supports arbitrary commercial product categories, written numbers, unit-vs-total budgets,
 * contradiction detection, and targeted clarification requests.
 * Follows GEMINI.md Section 3, 4 and SECURITY.md Section 2, 4.
 */

import crypto from "crypto";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import {
  defaultGeminiQuotaCoordinator,
  GeminiQuotaCoordinator,
  GeminiQuotaError,
} from "./gemini-quota";
import type {
  ProcurementMandate,
  MandateIntelligenceResult,
  MandateStatus,
  CurrencyCode,
  ProductCondition,
  RequiredSpecification,
} from "../types/pactum";
import {
  GeminiRequestError,
  type GeminiClientOptions,
  MIN_GEMINI_PROVIDER_DEADLINE_MS,
  DEFAULT_GEMINI_PROVIDER_DEADLINE_MS,
  DEFAULT_GEMINI_INTERNAL_TIMEOUT_MS,
} from "./gemini-client";
import { parseProcurementMandate } from "./mandate-parser";

export {
  MIN_GEMINI_PROVIDER_DEADLINE_MS,
  DEFAULT_GEMINI_PROVIDER_DEADLINE_MS,
  DEFAULT_GEMINI_INTERNAL_TIMEOUT_MS,
};

/**
 * Formal response schema for structured Gemini procurement mandate extraction.
 */
export const BUYER_MANDATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: "Structured extraction of B2B procurement mandate requirements across arbitrary product categories.",
  properties: {
    itemQuery: {
      type: Type.STRING,
      description: "Specific product title or commercial category requested (e.g. 'Dell XPS 15 Laptops', 'Ergonomic Standing Desks', 'Enterprise Rack Servers'). Leave empty or null if unspecified or too generic.",
    },
    quantity: {
      type: Type.INTEGER,
      description: "Total integer quantity of units requested. Null if not specified or ambiguous.",
    },
    maxTotalBudget: {
      type: Type.NUMBER,
      description: "Explicit total procurement budget in stated currency. Null if unspecified or conflicting.",
    },
    unitPriceBudget: {
      type: Type.NUMBER,
      description: "Unit price ceiling if stated as 'per unit' or 'each' (e.g. $340 each). Null if unspecified.",
    },
    currency: {
      type: Type.STRING,
      description: "Three-letter ISO currency code: strictly 'USD', 'INR', 'EUR', or 'GBP'. Null if ambiguous or unsupported.",
    },
    maxDeliveryDays: {
      type: Type.INTEGER,
      description: "Maximum acceptable delivery SLA in calendar days (integer >= 1). Null if unspecified.",
    },
    minReturnDays: {
      type: Type.INTEGER,
      description: "Minimum acceptable return policy window in days (integer >= 0). Null if unspecified.",
    },
    requiredCondition: {
      type: Type.STRING,
      description: "Required product condition: 'NEW', 'REFURBISHED', or 'USED'.",
    },
    requiredSpecs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          value: { type: Type.STRING },
          mandatory: { type: Type.BOOLEAN },
        },
        required: ["name", "value", "mandatory"],
      },
      description: "Explicitly requested product specifications.",
    },
    contradictions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of conflicting or contradictory requirements (e.g. '$8,500 total, but spend under $6,000').",
    },
    ambiguities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of ambiguous or unclear statements in the prompt.",
    },
    missingFields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of mandatory procurement fields that were NOT stated: strictly among ['itemQuery', 'quantity', 'maxTotalBudget', 'currency', 'maxDeliveryDays', 'minReturnDays']. Do NOT include optional fields like condition.",
    },
    clarificationQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Targeted questions to ask the user to resolve missing or ambiguous requirements.",
    },
  },
  required: ["missingFields", "ambiguities", "contradictions"],
};

export const MANDATE_SYSTEM_INSTRUCTION = `You are a B2B Procurement Mandate Intelligence Analyst.
Your role is to analyze natural-language enterprise purchasing requests and extract a structured procurement mandate across any commercial product category (such as IT hardware, office furniture, networking equipment, industrial supplies, servers, monitors, etc.).

CRITICAL OPERATIONAL RULES:
1. Extract the specific product requested. Do NOT default to monitors or any preferred product.
2. Distinguish:
   - Explicitly stated requirements (stated clearly by user).
   - Inferred information (mark as ambiguity or suggested spec, never as explicit requirement).
   - Missing information (add to missingFields and form clarificationQuestions).
   - Contradictory information (add to contradictions, e.g. conflicting budget limits or impossible SLAs).
3. Budget handling:
   - Distinguish total budget (e.g. "$8,500 total") from unit price (e.g. "$340 each").
   - If conflicting budgets are given (e.g. "budget $8,500 but do not spend more than $6,000"), report this in contradictions. Do NOT arbitrarily pick one.
4. Currencies:
   - Supported currencies are strictly: USD ($), INR (₹), EUR (€), GBP (£).
   - If currency is missing, ambiguous, or unsupported, report in missingFields or ambiguities. Do NOT invent a currency.
5. Quantity:
   - Accurately parse numeric and written numbers (e.g. "twenty-five" = 25, "one hundred" = 100, "12" = 12).
6. Output MUST strictly adhere to the JSON schema.`;

export interface MandateExtractionInput {
  prompt: string;
  currency?: string;
  fallbackOnFailure?: boolean;
}

/**
 * Mandate Intelligence Service
 * Orchestrates Gemini AI-assisted extraction and deterministic validation.
 */
export class MandateIntelligenceService {
  private ai: GoogleGenAI | null = null;
  private modelName: string;
  private providerDeadlineMs: number;
  private internalTimeoutMs: number;
  private timeoutMs: number;
  private quotaCoordinator: GeminiQuotaCoordinator;

  constructor(options?: GeminiClientOptions) {
    if (options?.aiClient) {
      this.ai = options.aiClient as unknown as GoogleGenAI;
    } else {
      const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
      if (apiKey) {
        this.ai = new GoogleGenAI({ apiKey });
      }
    }
    this.modelName = options?.modelName ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

    // Resolve provider deadline (Google GenAI requires minimum 10,000ms / 10s)
    const configuredDeadline =
      options?.providerDeadlineMs ??
      options?.timeoutMs ??
      (Number(process.env.GEMINI_PROVIDER_DEADLINE_MS) ||
       Number(process.env.GEMINI_TIMEOUT_MS) ||
       DEFAULT_GEMINI_PROVIDER_DEADLINE_MS);

    this.providerDeadlineMs = Math.max(MIN_GEMINI_PROVIDER_DEADLINE_MS, configuredDeadline);

    // Internal abort timeout: ensure it does not routinely cancel requests before provider deadline can take effect
    if (options?.internalTimeoutMs !== undefined) {
      this.internalTimeoutMs = options.internalTimeoutMs;
    } else if (options?.timeoutMs !== undefined && options.timeoutMs < this.providerDeadlineMs) {
      this.internalTimeoutMs = options.timeoutMs;
    } else {
      this.internalTimeoutMs = Math.max(
        this.providerDeadlineMs + 2000,
        Number(process.env.GEMINI_INTERNAL_TIMEOUT_MS) || DEFAULT_GEMINI_INTERNAL_TIMEOUT_MS
      );
    }
    this.timeoutMs = this.internalTimeoutMs;

    if (options?.quotaCoordinator) {
      this.quotaCoordinator = options.quotaCoordinator;
    } else if (options?.aiClient) {
      this.quotaCoordinator = new GeminiQuotaCoordinator({
        maxRequestsPerMinute: 10000,
        maxConcurrentRequests: 1000,
        maxAttempts: 1,
        providerTimeoutMs: 15000,
        circuitBreakerThreshold: 1000,
        circuitBreakerCooldownMs: 100,
      });
    } else {
      this.quotaCoordinator = defaultGeminiQuotaCoordinator;
    }
  }

  public getModelName(): string {
    return this.modelName;
  }

  public getProviderDeadlineMs(): number {
    return this.providerDeadlineMs;
  }

  public getInternalTimeoutMs(): number {
    return this.internalTimeoutMs;
  }

  public getTimeoutMs(): number {
    return this.timeoutMs;
  }

  public hasLiveClient(): boolean {
    return this.ai !== null;
  }

  /**
   * Extracts and validates a procurement mandate from a natural-language prompt.
   */
  public async extractMandate(
    input: MandateExtractionInput
  ): Promise<MandateIntelligenceResult> {
    const rawPrompt = input.prompt?.trim() || "";
    const startTime = Date.now();

    if (!rawPrompt) {
      return {
        status: "INVALID",
        extractor: "DETERMINISTIC_PARSER",
        rawPrompt,
        missingFields: ["prompt"],
        ambiguities: ["Prompt is empty or missing."],
        contradictions: [],
        clarificationQuestions: ["Please enter a procurement request describing what you need to purchase."],
        error: "Prompt is empty.",
      };
    }

    // Attempt schema-validated Gemini extraction if client is configured
    if (this.ai) {
      const providerDeadline = this.providerDeadlineMs;
      const internalTimeout = this.internalTimeoutMs;

      try {
        const validatedResult = await this.quotaCoordinator.execute(
          "extractMandate",
          async (quotaSignal) => {
            const controller = new AbortController();
            let timeoutId: NodeJS.Timeout | undefined;

            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                controller.abort();
                reject(
                  new GeminiRequestError(
                    "REQUEST_TIMEOUT",
                    `Gemini Mandate extraction timed out after ${internalTimeout}ms.`
                  )
                );
              }, internalTimeout);
            });

            if (quotaSignal) {
              quotaSignal.addEventListener("abort", () => controller.abort());
            }

            try {
              const userPrompt = `Enterprise Procurement Request to Analyze:
"""
${rawPrompt}
"""
Context Currency Hint: ${input.currency || "None (extract from prompt)"}

Extract the structured procurement mandate according to the required schema.`;

              const apiCall = this.ai!.models.generateContent({
                model: this.modelName,
                contents: userPrompt,
                config: {
                  systemInstruction: MANDATE_SYSTEM_INSTRUCTION,
                  abortSignal: controller.signal,
                  httpOptions: { timeout: providerDeadline },
                  responseMimeType: "application/json",
                  responseSchema: BUYER_MANDATE_SCHEMA,
                  temperature: 0.1, // Low temperature for factual constraint extraction
                },
              });

              const response = await Promise.race([apiCall, timeoutPromise]);

              if (!response || typeof response.text !== "string" || !response.text.trim()) {
                throw new GeminiRequestError(
                  "INVALID_SCHEMA_RESPONSE",
                  "Model returned empty response text for mandate extraction."
                );
              }

              let rawText = response.text.trim();
              if (rawText.startsWith("```")) {
                rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
              }

              let parsed: Record<string, unknown>;
              try {
                parsed = JSON.parse(rawText);
              } catch (jsonErr) {
                throw new GeminiRequestError(
                  "INVALID_SCHEMA_RESPONSE",
                  `Model mandate response was not valid JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`
                );
              }

              return this.deterministicallyValidateExtraction(parsed, rawPrompt, input.currency);
            } finally {
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
            }
          }
        );

        return {
          ...validatedResult,
          extractor: "GEMINI_LIVE",
          latencyMs: Date.now() - startTime,
        };
      } catch (err: unknown) {
        const classified = this.classifyError(err);

        console.warn(
          JSON.stringify({
            level: "warn",
            component: "MandateIntelligenceService",
            event: "EXTRACTION_FAILURE",
            errorCode: classified.code,
            model: this.modelName,
            message: classified.message,
            timestamp: new Date().toISOString(),
          })
        );

        if (input.fallbackOnFailure === false) {
          throw classified;
        }

        // Engage deterministic offline parser fallback
        const fallback = parseProcurementMandate({ prompt: rawPrompt, currency: input.currency });
        return {
          status: fallback.status,
          mandate: fallback.mandate,
          extractor: "DETERMINISTIC_PARSER",
          itemQuery: fallback.mandate?.itemQuery,
          quantity: fallback.mandate?.quantity,
          maxTotalBudget: fallback.mandate?.maxTotalBudget,
          currency: fallback.mandate?.currency,
          maxDeliveryDays: fallback.mandate?.maxDeliveryDays,
          minReturnDays: fallback.mandate?.minReturnDays,
          requiredSpecs: fallback.mandate?.requiredSpecs,
          requiredCondition: fallback.mandate?.requiredCondition,
          missingFields: fallback.missingFields ?? [],
          ambiguities: fallback.ambiguities ?? [],
          contradictions: fallback.contradictions ?? [],
          clarificationQuestions: fallback.clarificationQuestions ?? [],
          rawPrompt,
          latencyMs: Date.now() - startTime,
          error: `${classified.code}: ${classified.message}`,
        };
      }
    }

    // Deterministic offline parser when no live client is configured
    const fallback = parseProcurementMandate({ prompt: rawPrompt, currency: input.currency });
    return {
      status: fallback.status,
      mandate: fallback.mandate,
      extractor: "DETERMINISTIC_PARSER",
      itemQuery: fallback.mandate?.itemQuery,
      quantity: fallback.mandate?.quantity,
      maxTotalBudget: fallback.mandate?.maxTotalBudget,
      currency: fallback.mandate?.currency,
      maxDeliveryDays: fallback.mandate?.maxDeliveryDays,
      minReturnDays: fallback.mandate?.minReturnDays,
      requiredSpecs: fallback.mandate?.requiredSpecs,
      requiredCondition: fallback.mandate?.requiredCondition,
      missingFields: fallback.missingFields ?? [],
      ambiguities: fallback.ambiguities ?? [],
      contradictions: fallback.contradictions ?? [],
      clarificationQuestions: fallback.clarificationQuestions ?? [],
      rawPrompt,
      latencyMs: Date.now() - startTime,
      error: "MISSING_API_KEY: Operating with deterministic offline mandate parser.",
    };
  }

  private classifyError(err: unknown): GeminiRequestError {
    if (err instanceof GeminiRequestError) {
      return err;
    }
    if (err instanceof GeminiQuotaError) {
      return new GeminiRequestError("RATE_LIMIT_EXCEEDED", `RATE_LIMITED: ${err.message}`, 429);
    }
    const message = err instanceof Error ? err.message : String(err);
    const status = typeof (err as { status?: number }).status === "number"
      ? (err as { status?: number }).status
      : undefined;

    // Permanent request configuration error (e.g. invalid deadline or bad request parameters)
    if (
      status === 400 ||
      message.includes("INVALID_ARGUMENT") ||
      message.toLowerCase().includes("invalid_argument") ||
      message.toLowerCase().includes("invalid argument") ||
      (message.toLowerCase().includes("deadline") && message.toLowerCase().includes("too short"))
    ) {
      return new GeminiRequestError(
        "INVALID_ARGUMENT",
        `Permanent request configuration error: ${message}`,
        status || 400
      );
    }

    if (message.includes("aborted") || message.includes("timeout") || (err as { name?: string }).name === "AbortError") {
      return new GeminiRequestError("REQUEST_TIMEOUT", `Request timed out or was aborted: ${message}`);
    }
    if (status === 401 || status === 403 || message.toLowerCase().includes("api_key") || message.toLowerCase().includes("unauthenticated")) {
      return new GeminiRequestError("AUTHENTICATION_ERROR", `Authentication failed: ${message}`, status);
    }
    if (
      status === 429 ||
      message.includes("429") ||
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("resource exhausted") ||
      message.toLowerCase().includes("rate limit")
    ) {
      return new GeminiRequestError("RATE_LIMIT_EXCEEDED", `RATE_LIMITED: Rate limit or quota exceeded: ${message}`, status);
    }
    if (status === 404 || message.toLowerCase().includes("not found")) {
      return new GeminiRequestError("MODEL_NOT_FOUND", `Model or endpoint not found: ${message}`, status);
    }
    return new GeminiRequestError("API_REQUEST_FAILED", `Gemini API call failed: ${message}`, status);
  }

  /**
   * Deterministically validates and resolves candidate fields extracted by the model or parser.
   * Model output is NEVER trusted blindly: schema, types, contradictions, and ranges are enforced here.
   */
  public deterministicallyValidateExtraction(
    candidate: Record<string, unknown>,
    rawPrompt: string,
    defaultCurrency?: string
  ): Omit<MandateIntelligenceResult, "extractor" | "latencyMs"> {
    const missingFields: string[] = Array.isArray(candidate.missingFields)
      ? candidate.missingFields.filter((f): f is string => typeof f === "string")
      : [];

    const ambiguities: string[] = Array.isArray(candidate.ambiguities)
      ? candidate.ambiguities.filter((a): a is string => typeof a === "string")
      : [];

    const contradictions: string[] = Array.isArray(candidate.contradictions)
      ? candidate.contradictions.filter((c): c is string => typeof c === "string")
      : [];

    const clarificationQuestions: string[] = Array.isArray(candidate.clarificationQuestions)
      ? candidate.clarificationQuestions.filter((q): q is string => typeof q === "string")
      : [];

    // 1. Validate Product Title / itemQuery
    let itemQuery: string | undefined;
    if (typeof candidate.itemQuery === "string" && candidate.itemQuery.trim()) {
      itemQuery = candidate.itemQuery.trim();
      // Detect overly generic non-products
      if (/^(?:some|any)?\s*(?:equipment|items?|stuff|products?|things?|hardware)$/i.test(itemQuery)) {
        itemQuery = undefined;
        if (!missingFields.includes("itemQuery")) missingFields.push("itemQuery");
        ambiguities.push("Requested product description is too generic.");
        clarificationQuestions.push("What specific product or equipment category do you need to procure?");
      }
    } else {
      if (!missingFields.includes("itemQuery")) missingFields.push("itemQuery");
      clarificationQuestions.push("Please specify the exact product or equipment required.");
    }

    // 2. Validate Quantity
    let quantity: number | undefined;
    if (typeof candidate.quantity === "number") {
      if (candidate.quantity > 0 && Number.isInteger(candidate.quantity)) {
        quantity = candidate.quantity;
      } else if (!missingFields.includes("quantity") && candidate.quantity !== -1) {
        contradictions.push(`Invalid quantity: ${candidate.quantity}. Quantity must be a positive integer.`);
      } else {
        if (!missingFields.includes("quantity")) missingFields.push("quantity");
        clarificationQuestions.push("Please specify the quantity of units required.");
      }
    } else {
      if (!missingFields.includes("quantity")) missingFields.push("quantity");
      clarificationQuestions.push("Please specify the number of units required.");
    }

    // 3. Validate Budget & Currency
    let maxTotalBudget: number | undefined;
    const unitPriceBudget = typeof candidate.unitPriceBudget === "number" && Number.isFinite(candidate.unitPriceBudget) && candidate.unitPriceBudget > 0
      ? candidate.unitPriceBudget
      : undefined;

    if (typeof candidate.maxTotalBudget === "number") {
      if (candidate.maxTotalBudget > 0 && Number.isFinite(candidate.maxTotalBudget)) {
        maxTotalBudget = Math.round(candidate.maxTotalBudget * 100) / 100;
      } else if (!missingFields.includes("maxTotalBudget") && candidate.maxTotalBudget !== -1) {
        contradictions.push(`Invalid budget: ${candidate.maxTotalBudget}. Budget must be greater than zero.`);
      } else {
        if (!missingFields.includes("maxTotalBudget")) missingFields.push("maxTotalBudget");
        clarificationQuestions.push("Please specify your maximum total budget or unit price ceiling.");
      }
    } else if (unitPriceBudget && quantity) {
      // Derive total budget from unit price if unambiguous
      maxTotalBudget = Math.round(unitPriceBudget * quantity * 100) / 100;
    } else {
      if (!missingFields.includes("maxTotalBudget")) missingFields.push("maxTotalBudget");
      clarificationQuestions.push("Please specify your maximum total budget or unit price ceiling.");
    }

    // If both unit price and total budget are given, ensure they don't contradict
    if (unitPriceBudget && quantity && maxTotalBudget) {
      const impliedTotal = unitPriceBudget * quantity;
      if (impliedTotal > maxTotalBudget * 1.01) {
        contradictions.push(
          `Unit price budget ($${unitPriceBudget.toFixed(2)} × ${quantity} = $${impliedTotal.toFixed(2)}) exceeds maximum total budget limit of $${maxTotalBudget.toFixed(2)}.`
        );
      }
    }

    // Deterministic regex check for conflicting budgets in rawPrompt (e.g. "$8,500 total, but do not spend more than $6,000")
    const budgetAmounts = Array.from(rawPrompt.matchAll(/[\$€£]\s*([\d,]+(?:\.\d+)?)/g)).map((m) =>
      parseFloat(m[1].replace(/,/g, ""))
    ).filter((n) => Number.isFinite(n) && n > 0);

    const uniqueLargeBudgets = Array.from(new Set(budgetAmounts.filter((n) => n >= 100)));
    if (uniqueLargeBudgets.length >= 2) {
      const minB = Math.min(...uniqueLargeBudgets);
      const maxB = Math.max(...uniqueLargeBudgets);
      if (maxB / minB > 1.05) {
        // More than 5% difference between stated budget amounts
        const message = `Conflicting budget figures detected in mandate: ${uniqueLargeBudgets.map((b) => `$${b}`).join(" vs ")}.`;
        if (!contradictions.some((c) => c.includes("Conflicting budget"))) {
          contradictions.push(message);
        }
      }
    }

    // Currency validation: strictly USD, INR, EUR, GBP
    let currency: CurrencyCode | undefined;
    const rawCurrency = typeof candidate.currency === "string" ? candidate.currency.toUpperCase() : defaultCurrency?.toUpperCase();
    if (rawCurrency === "USD" || rawCurrency === "INR" || rawCurrency === "EUR" || rawCurrency === "GBP") {
      currency = rawCurrency;
    } else if (rawCurrency) {
      ambiguities.push(`Unsupported currency '${rawCurrency}'. Only USD, INR, EUR, and GBP are supported.`);
      if (!missingFields.includes("currency")) missingFields.push("currency");
      clarificationQuestions.push("Please confirm a supported currency: USD ($), INR (₹), EUR (€), or GBP (£).");
    } else {
      if (!missingFields.includes("currency")) missingFields.push("currency");
      clarificationQuestions.push("Please specify the currency (USD, INR, EUR, or GBP).");
    }

    // 4. Validate Delivery SLA Days
    let maxDeliveryDays: number | undefined;
    if (typeof candidate.maxDeliveryDays === "number") {
      if (candidate.maxDeliveryDays >= 1 && Number.isInteger(candidate.maxDeliveryDays)) {
        maxDeliveryDays = candidate.maxDeliveryDays;
      } else if (!missingFields.includes("maxDeliveryDays") && candidate.maxDeliveryDays !== -1) {
        contradictions.push(`Invalid delivery SLA: ${candidate.maxDeliveryDays} days. Delivery SLA must be at least 1 day.`);
      } else {
        if (!missingFields.includes("maxDeliveryDays")) missingFields.push("maxDeliveryDays");
        clarificationQuestions.push("Please specify the maximum acceptable delivery SLA in days.");
      }
    } else {
      if (!missingFields.includes("maxDeliveryDays")) missingFields.push("maxDeliveryDays");
      clarificationQuestions.push("Please specify the maximum acceptable delivery SLA in days.");
    }

    // 5. Validate Return Window Days
    let minReturnDays: number | undefined;
    if (typeof candidate.minReturnDays === "number") {
      if (candidate.minReturnDays >= 0 && Number.isInteger(candidate.minReturnDays)) {
        minReturnDays = candidate.minReturnDays;
      } else if (!missingFields.includes("minReturnDays") && candidate.minReturnDays !== -1) {
        contradictions.push(`Invalid return policy: ${candidate.minReturnDays} days. Return policy must be at least 0 days.`);
      } else {
        if (!missingFields.includes("minReturnDays")) missingFields.push("minReturnDays");
        clarificationQuestions.push("Please specify the minimum acceptable return policy window in days.");
      }
    } else {
      if (!missingFields.includes("minReturnDays")) missingFields.push("minReturnDays");
      clarificationQuestions.push("Please specify the minimum acceptable return policy window in days.");
    }

    // 6. Validate Condition
    let requiredCondition: ProductCondition = "NEW";
    if (typeof candidate.requiredCondition === "string") {
      const cond = candidate.requiredCondition.toUpperCase();
      if (cond === "NEW" || cond === "REFURBISHED" || cond === "USED") {
        requiredCondition = cond;
      }
    }

    // 7. Validate Specs
    const requiredSpecs: RequiredSpecification[] = [];
    if (Array.isArray(candidate.requiredSpecs)) {
      for (const s of candidate.requiredSpecs) {
        if (s && typeof s === "object" && typeof s.name === "string" && typeof s.value === "string") {
          requiredSpecs.push({
            name: s.name.trim(),
            value: s.value.trim(),
            mandatory: Boolean(s.mandatory),
          });
        }
      }
    }

    // Deduplicate missing fields and questions (strictly mandatory fields determine readiness)
    const MANDATORY_FIELDS = [
      "itemQuery",
      "quantity",
      "maxTotalBudget",
      "currency",
      "maxDeliveryDays",
      "minReturnDays",
    ];
    const finalMissing = Array.from(new Set(missingFields)).filter((f) => MANDATORY_FIELDS.includes(f));
    const finalClarifications = Array.from(new Set(clarificationQuestions));
    const finalAmbiguities = Array.from(new Set(ambiguities));
    const finalContradictions = Array.from(new Set(contradictions));

    // Determine status:
    // - INVALID: Any contradictory constraints exist
    // - NEEDS_CLARIFICATION: Any mandatory fields are missing or ambiguous
    // - READY: All mandatory constraints are valid and uncontradicted
    let status: MandateStatus = "READY";
    let mandate: ProcurementMandate | undefined;

    if (finalContradictions.length > 0) {
      status = "INVALID";
    } else if (finalMissing.length > 0 || !itemQuery || !quantity || !maxTotalBudget || !currency || !maxDeliveryDays || minReturnDays === undefined) {
      status = "NEEDS_CLARIFICATION";
    } else {
      status = "READY";
      mandate = {
        id: `mandate_${crypto.randomBytes(6).toString("hex")}`,
        rawPrompt,
        itemQuery,
        quantity,
        maxTotalBudget,
        maxDeliveryDays,
        minReturnDays,
        currency,
        requiredSpecs,
        requiredCondition,
        createdAt: new Date().toISOString(),
        version: 1,
        isLocked: false,
      };
    }

    return {
      status,
      mandate,
      itemQuery,
      quantity,
      maxTotalBudget,
      unitPriceBudget,
      currency,
      maxDeliveryDays,
      minReturnDays,
      requiredSpecs,
      requiredCondition,
      missingFields: finalMissing,
      ambiguities: finalAmbiguities,
      contradictions: finalContradictions,
      clarificationQuestions: finalClarifications,
      rawPrompt,
    };
  }
}
