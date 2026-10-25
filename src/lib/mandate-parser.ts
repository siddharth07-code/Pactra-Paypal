/**
 * PACTUM — Mandate Parser
 * Converts natural-language procurement prompts into validated, deterministic ProcurementMandates.
 * Supports arbitrary commercial product categories, written numbers, unit-vs-total budgets,
 * contradiction detection, and targeted clarification requests.
 * Follows GEMINI.md Section 3 & 4 and SECURITY.md Section 4.
 */

import crypto from "crypto";
import type {
  ProcurementMandate,
  RequiredSpecification,
  MandateStatus,
  MandateExtractorType,
  CurrencyCode,
  ProductCondition,
} from "../types/pactum";

export interface MandateParseInput {
  prompt: string;
  currency?: string;
}

export interface MandateParseResult {
  success: boolean;
  status: MandateStatus;
  mandate?: ProcurementMandate;
  error?: string;
  missingFields?: string[];
  ambiguities?: string[];
  contradictions?: string[];
  clarificationQuestions?: string[];
  itemQuery?: string;
  quantity?: number;
  maxTotalBudget?: number;
  unitPriceBudget?: number;
  currency?: CurrencyCode;
  maxDeliveryDays?: number;
  minReturnDays?: number;
  requiredCondition?: ProductCondition;
  extractedMandate?: Partial<ProcurementMandate>;
  extractor: MandateExtractorType;
  rawPrompt: string;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

/**
 * Parses a standalone written number word or compound phrase into an integer.
 * Supports "12", "twelve", "25", "twenty-five", "twenty five", "100", "one hundred", etc.
 */
export function parseWrittenNumber(text: string): number | null {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.toLowerCase().trim().replace(/[\s-]+and[\s-]+/g, " ");
  if (/^\d+$/.test(cleaned)) {
    return parseInt(cleaned, 10);
  }

  const tokens = cleaned.split(/[\s-]+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let matchedAny = false;

  for (const token of tokens) {
    const val = NUMBER_WORDS[token];
    if (val === undefined) {
      if (/^\d+$/.test(token)) {
        current += parseInt(token, 10);
        matchedAny = true;
      } else {
        return null;
      }
    } else {
      matchedAny = true;
      if (val === 100) {
        current = (current || 1) * 100;
      } else if (val === 1000) {
        current = (current || 1) * 1000;
        total += current;
        current = 0;
      } else {
        current += val;
      }
    }
  }

  if (!matchedAny) return null;
  return total + current;
}

/**
 * Normalizes number words in natural prompt text into standard numeric digits.
 */
export function normalizeNumberWords(prompt: string): string {
  // Replace compound tens with hyphen or space: e.g. "twenty-five" or "twenty five" -> 25
  let normalized = prompt.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, ten, one) => {
      const t = NUMBER_WORDS[ten.toLowerCase()] ?? 0;
      const o = NUMBER_WORDS[one.toLowerCase()] ?? 0;
      return String(t + o);
    }
  );

  // Replace "one hundred", "two hundred", etc.
  normalized = normalized.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred\b/gi,
    (_, num) => {
      const n = NUMBER_WORDS[num.toLowerCase()] ?? 1;
      return String(n * 100);
    }
  );

  // Replace individual words: e.g. "five", "ten", "twelve", "thirty", etc.
  normalized = normalized.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi,
    (match) => {
      const val = NUMBER_WORDS[match.toLowerCase()];
      return val !== undefined ? String(val) : match;
    }
  );

  return normalized;
}

/**
 * Deterministic offline parser for natural-language procurement mandates.
 * Supports arbitrary commercial product categories (monitors, laptops, servers, desks, switches, etc.).
 * Accurately extracts quantity, budget, delivery SLA, return window, specs, and flags ambiguity/contradictions.
 */
export function parseProcurementMandate(input: MandateParseInput): MandateParseResult {
  const rawPrompt = input.prompt?.trim();
  if (!rawPrompt) {
    return {
      success: false,
      status: "INVALID",
      error: "Prompt is empty or missing.",
      missingFields: ["prompt"],
      ambiguities: ["Empty procurement prompt."],
      contradictions: [],
      clarificationQuestions: ["Please enter a procurement request describing what you need to purchase."],
      extractor: "DETERMINISTIC_PARSER",
      rawPrompt: "",
    };
  }

  const normalizedPrompt = normalizeNumberWords(rawPrompt);
  const missingFields: string[] = [];
  const ambiguities: string[] = [];
  const contradictions: string[] = [];
  const clarificationQuestions: string[] = [];

  // 1. Quantity extraction: e.g. "purchase 25", "order 10", "buy 50", "qty: 12", "quantity of 100"
  // Remove currency expressions (e.g. $8,500, €5,000, £10,000) so amounts/commas are not misparsed as quantities
  const promptSansCurrency = normalizedPrompt.replace(/[\$€£]\s*[\d,]+(?:\.\d+)?/g, " ");

  let quantity: number | null = null;
  const qtyMatch =
    promptSansCurrency.match(/\b(?:purchase|order|buy|procure|acquire|source|qty:?|quantity(?:\s+of)?)\s+(\d+)\b(?!\s*k\b)/i) ||
    promptSansCurrency.match(/\b(\d+)\s+(?:units?|pieces?|items?|pack(?:s)?)\b/i) ||
    promptSansCurrency.match(/\b(\d+)\s+([a-zA-Z0-9\s-]+?)(?:\s+(?:under|for|with|at|budget|delivery|within|min|sla|\$|€|£)\b|$)/i);

  if (qtyMatch) {
    // Ensure matched number is not a resolution (e.g. 4k), refresh rate, memory size, or SLA day count
    const matchIndex = qtyMatch.index ?? 0;
    const followingText = promptSansCurrency.slice(matchIndex + qtyMatch[1].length).trim();
    if (!/^(?:k|p|hz|gb|tb|days?|hours?|weeks?|months?)\b/i.test(followingText)) {
      const q = parseInt(qtyMatch[1], 10);
      if (Number.isInteger(q) && q > 0) {
        quantity = q;
      }
    }
  }

  // Detect conflicting quantities if multiple distinct quantities are stated with purchase verbs or unit counts
  const allQtyMatches = Array.from(
    normalizedPrompt.matchAll(/\b(?:purchase|order|buy|procure|need|qty:?|quantity(?:\s+of)?)\s+(\d+)\b|\b(\d+)\s+units?\b/gi)
  )
    .map((m) => parseInt(m[1] || m[2], 10))
    .filter((q) => Number.isInteger(q) && q > 0);
  const uniqueQuantities = Array.from(new Set(allQtyMatches));
  if (uniqueQuantities.length >= 2) {
    contradictions.push(`Conflicting quantity requirements detected: ${uniqueQuantities.join(" vs ")}.`);
  }

  if (quantity === null || quantity <= 0) {
    missingFields.push("quantity");
    clarificationQuestions.push("Please specify the quantity of units required.");
  }

  // 2. Product Category / itemQuery extraction across arbitrary categories
  let itemQuery: string | undefined;
  const productMatch =
    normalizedPrompt.match(/\b(?:purchase|order|buy|procure|acquire|source)\s+(?:\d+\s+)?(?:units?\s+of\s+)?(.+?)(?:\s+(?:under|for|with|at|budget|delivery|within|min|sla|total|having|\$|€|£|by|in)\b|$)/i) ||
    normalizedPrompt.match(/\b\d+\s+(.+?)(?:\s+(?:under|for|with|at|budget|delivery|within|min|sla|total|\$|€|£)\b|$)/i);

  if (productMatch && productMatch[1]) {
    const candidate = productMatch[1]
      .replace(/^(?:units?|pieces?|items?)\s+of\s+/i, "")
      .replace(/[.,;]+$/, "")
      .trim();

    if (candidate.length >= 2) {
      // Check for overly generic placeholders
      if (
        /^(?:some|any)?\s*(?:equipment|items?|stuff|products?|things?|hardware)(?:\s+as\s+cheaply\s+as\s+possible)?$/i.test(candidate) ||
        /^(?:some|any)?\s*(?:equipment|items?|stuff|products?|things?|hardware)\b/i.test(candidate)
      ) {
        ambiguities.push("Product description is too generic; specific product or category not identified.");
        missingFields.push("itemQuery");
        clarificationQuestions.push("What specific product or equipment category do you need to procure?");
      } else {
        itemQuery = candidate;
      }
    }
  }

  if (!itemQuery && !missingFields.includes("itemQuery")) {
    missingFields.push("itemQuery");
    clarificationQuestions.push("Please specify the exact product or equipment category you wish to procure.");
  }

  // 3. Budget extraction: Total Budget vs Unit Price
  let maxTotalBudget: number | null = null;
  let unitPriceBudget: number | null = null;

  // Check explicit unit price: e.g. "at $340 each", "$340 per unit", "at 340 a piece"
  const unitMatch =
    normalizedPrompt.match(/(?:at|for)\s*[\$€£]?\s*([\d,]+(?:\.\d+)?)\s*(?:each|per\s+unit|a\s+piece|a\s+unit|per\s+item|\/unit)\b/i) ||
    normalizedPrompt.match(/\bunit\s+price\s+(?:of|is|at|under)?\s*[\$€£]?\s*([\d,]+(?:\.\d+)?)/i);

  if (unitMatch) {
    const uVal = parseFloat(unitMatch[1].replace(/,/g, ""));
    if (Number.isFinite(uVal) && uVal > 0) {
      unitPriceBudget = uVal;
    }
  }

  // Check total budget
  const explicitTotalMatch =
    normalizedPrompt.match(/(?:total\s+budget|max(?:imum)?\s+budget|total\s+cost|total\s+spend|cap)\s+(?:of|is|under)?\s*[\$€£]?\s*([\d,]+(?:\.\d+)?)/i) ||
    normalizedPrompt.match(/[\$€£]\s*([\d,]+(?:\.\d+)?)\s*(?:total|in\s+total|altogether)\b/i) ||
    normalizedPrompt.match(/(?:under|within|max(?:imum)?\s+of|budget\s+of|cap\s+of|up\s+to|not\s+spend\s+more\s+than)\s*[\$€£]\s*([\d,]+(?:\.\d+)?)/i);

  if (explicitTotalMatch) {
    const rawVal = explicitTotalMatch[1].replace(/,/g, "");
    const parsed = parseFloat(rawVal);
    if (Number.isFinite(parsed) && parsed > 0) {
      maxTotalBudget = parsed;
    }
  } else if (!unitMatch) {
    // Only match bare currency number as total budget if there is no explicit unit price match
    const bareBudgetMatch = normalizedPrompt.match(/[\$€£]\s*([\d,]+(?:\.\d+)?)/i);
    if (bareBudgetMatch) {
      const rawVal = bareBudgetMatch[1].replace(/,/g, "");
      const parsed = parseFloat(rawVal);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxTotalBudget = parsed;
      }
    }
  }

  // Detect conflicting budget ceilings in text (e.g. "$8,500 total, but do not spend more than $6,000")
  const allBudgets = Array.from(normalizedPrompt.matchAll(/[\$€£]\s*([\d,]+(?:\.\d+)?)/g))
    .map((m) => parseFloat(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  const distinctBudgets = Array.from(new Set(allBudgets.filter((b) => b >= 50 && b !== unitPriceBudget)));
  if (distinctBudgets.length >= 2) {
    const minB = Math.min(...distinctBudgets);
    const maxB = Math.max(...distinctBudgets);
    if (maxB / minB > 1.05) {
      contradictions.push(
        `Conflicting budget statements detected: ${distinctBudgets.map((b) => `$${b.toLocaleString()}`).join(" vs ")}.`
      );
    }
  }

  // If only unit price is given, derive total budget if quantity is known
  if (maxTotalBudget === null && unitPriceBudget && quantity) {
    maxTotalBudget = Math.round(unitPriceBudget * quantity * 100) / 100;
  }

  // If both unit price and total budget are given, ensure they don't contradict
  if (unitPriceBudget && quantity && maxTotalBudget) {
    const impliedTotal = unitPriceBudget * quantity;
    if (impliedTotal > maxTotalBudget * 1.01) {
      contradictions.push(
        `Unit price budget exceeds total budget: $${unitPriceBudget.toFixed(2)} × ${quantity} = $${impliedTotal.toFixed(2)} exceeds stated maximum budget of $${maxTotalBudget.toFixed(2)}.`
      );
    }
  }

  if (maxTotalBudget === null || maxTotalBudget <= 0) {
    missingFields.push("maxTotalBudget");
    clarificationQuestions.push("Please specify the maximum total budget or unit price ceiling.");
  }

  // 4. Delivery Days extraction
  let maxDeliveryDays: number | null = null;
  const deliveryMatch =
    normalizedPrompt.match(/(?:delivery|deliver|shipping|ship)\s+(?:within|in|under|<=)?\s*(-?\d+)\s*days?/i) ||
    normalizedPrompt.match(/(-?\d+)[\s-]days?\s+(?:delivery|sla|shipping)/i) ||
    normalizedPrompt.match(/(?:within|in)\s+(-?\d+)\s+days?\b/i);

  if (deliveryMatch) {
    const d = parseInt(deliveryMatch[1], 10);
    if (Number.isInteger(d) && d > 0) {
      maxDeliveryDays = d;
    } else {
      contradictions.push(`Invalid delivery SLA: ${d} days. Delivery SLA must be at least 1 day.`);
    }
  } else {
    missingFields.push("maxDeliveryDays");
    clarificationQuestions.push("Please specify the maximum acceptable delivery SLA in days.");
  }

  // 5. Return Policy Days extraction
  let minReturnDays: number | null = null;
  const returnMatch =
    normalizedPrompt.match(/(?:min(?:imum)?|at\s+least)?\s*(-?\d+)[\s-]days?\s+(?:return|refund|money-back)/i) ||
    normalizedPrompt.match(/(?:return\s+policy|return\s+window|returns?)\s+(?:of|at\s+least|min(?:imum)?|>=)?\s*(-?\d+)\s*days?/i);

  if (returnMatch) {
    const r = parseInt(returnMatch[1], 10);
    if (Number.isInteger(r) && r >= 0) {
      minReturnDays = r;
    } else {
      contradictions.push(`Invalid return policy: ${r} days. Return window must be 0 days or more.`);
    }
  } else {
    missingFields.push("minReturnDays");
    clarificationQuestions.push("Please specify the minimum acceptable return policy window in days.");
  }

  // 6. Currency extraction: strictly USD, EUR, GBP
  let currency: CurrencyCode | null = null;
  if (/€|\beur\b|\beuros?\b/i.test(normalizedPrompt) || input.currency === "EUR") {
    currency = "EUR";
  } else if (/£|\bgbp\b|\bpounds?\b/i.test(normalizedPrompt) || input.currency === "GBP") {
    currency = "GBP";
  } else if (/\$|\busd\b|\bdollars?\b/i.test(normalizedPrompt) || input.currency === "USD") {
    currency = "USD";
  } else if (input.currency) {
    if (input.currency === "USD" || input.currency === "EUR" || input.currency === "GBP") {
      currency = input.currency;
    } else {
      ambiguities.push(`Unsupported currency '${input.currency}'. Only USD, EUR, and GBP are supported.`);
      missingFields.push("currency");
    }
  } else {
    // Check unsupported currency symbols
    if (/¥|\bjpy\b|\byen\b|₹|\binr\b|\brupees?\b|\baud\b|\bcad\b/i.test(normalizedPrompt)) {
      ambiguities.push("Unsupported currency detected. Only USD ($), EUR (€), and GBP (£) are supported.");
    }
    missingFields.push("currency");
    clarificationQuestions.push("Please specify the transaction currency (USD, EUR, or GBP).");
  }

  // 7. Specifications extraction
  const requiredSpecs: RequiredSpecification[] = [];
  if (/4k|uhd|3840\s*x\s*2160/i.test(normalizedPrompt)) {
    requiredSpecs.push({ name: "Resolution", value: "4K UHD", mandatory: true });
  }
  if (/usb[\s-]?c|type[\s-]?c/i.test(normalizedPrompt)) {
    requiredSpecs.push({ name: "Connectivity", value: "USB-C", mandatory: true });
  }
  if (/\b(?:ips|oled|mini-led)\b/i.test(normalizedPrompt)) {
    const m = normalizedPrompt.match(/\b(ips|oled|mini-led)\b/i);
    requiredSpecs.push({ name: "PanelType", value: m ? m[1].toUpperCase() : "IPS", mandatory: false });
  }
  if (/\b(?:i7|i9|m2|m3|ryzen|xeon|epyc)\b/i.test(normalizedPrompt)) {
    const m = normalizedPrompt.match(/\b(i7|i9|m2|m3|ryzen|xeon|epyc)\b/i);
    requiredSpecs.push({ name: "Processor", value: m ? m[1].toUpperCase() : "Processor", mandatory: true });
  }
  if (/\b(\d+)\s*(?:gb|tb)\s*(?:ram|memory)\b/i.test(normalizedPrompt)) {
    const m = normalizedPrompt.match(/\b(\d+)\s*(?:gb|tb)\s*(?:ram|memory)\b/i);
    requiredSpecs.push({ name: "RAM", value: m ? `${m[1]}GB` : "16GB", mandatory: true });
  }

  // 8. Product Condition extraction (NEW, REFURBISHED, USED)
  let requiredCondition: ProductCondition | undefined;
  const isNew = /\b(?:brand\s+new|factory\s+sealed|new\s+condition)\b/i.test(normalizedPrompt) || /\bnew\b/i.test(normalizedPrompt);
  const isRefurb = /\b(?:refurbished|certified\s+refurbished|renewed|reconditioned)\b/i.test(normalizedPrompt);
  const isUsed = /\b(?:used|pre-owned|second-hand)\b/i.test(normalizedPrompt);

  if (isNew && (isRefurb || isUsed)) {
    contradictions.push("Conflicting condition requirements: both new and refurbished/used specified.");
  } else if (isRefurb) {
    requiredCondition = "REFURBISHED";
  } else if (isUsed) {
    requiredCondition = "USED";
  } else if (isNew) {
    requiredCondition = "NEW";
  }

  // 9. Decide status & construct mandate
  const finalMissing = Array.from(new Set(missingFields));
  const finalClarifications = Array.from(new Set(clarificationQuestions));
  const finalAmbiguities = Array.from(new Set(ambiguities));
  const finalContradictions = Array.from(new Set(contradictions));

  let status: MandateStatus = "READY";
  let mandate: ProcurementMandate | undefined;

  if (finalContradictions.length > 0) {
    status = "INVALID";
  } else if (
    finalMissing.length > 0 ||
    finalAmbiguities.length > 0 ||
    !itemQuery ||
    !quantity ||
    !maxTotalBudget ||
    !currency ||
    !maxDeliveryDays ||
    minReturnDays === null
  ) {
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
      requiredSpecs,
      requiredCondition,
      currency,
      createdAt: new Date().toISOString(),
      version: 1,
      isLocked: false,
    };
  }

  return {
    success: status === "READY",
    status,
    mandate,
    extractedMandate: mandate,
    itemQuery,
    quantity: quantity ?? undefined,
    maxTotalBudget: maxTotalBudget ?? undefined,
    unitPriceBudget: unitPriceBudget ?? undefined,
    currency: currency ?? undefined,
    maxDeliveryDays: maxDeliveryDays ?? undefined,
    minReturnDays: minReturnDays ?? undefined,
    requiredCondition,
    missingFields: finalMissing,
    ambiguities: finalAmbiguities,
    contradictions: finalContradictions,
    clarificationQuestions: finalClarifications,
    extractor: "DETERMINISTIC_PARSER",
    rawPrompt,
    error:
      status === "INVALID"
        ? `Mandate contradictory: ${finalContradictions.join("; ")}`
        : status === "NEEDS_CLARIFICATION"
        ? `Mandate incomplete: missing or ambiguous fields: ${finalMissing.join(", ")}.`
        : undefined,
  };
}

let defaultMandateIntelligence: import("./mandate-intelligence").MandateIntelligenceService | null = null;

/**
 * Asynchronously extracts and validates a procurement mandate using MandateIntelligenceService (with live Gemini or deterministic fallback).
 */
export async function extractProcurementMandate(
  input: MandateParseInput,
  options?: { intelligenceService?: import("./mandate-intelligence").MandateIntelligenceService; fallbackOnFailure?: boolean }
): Promise<MandateParseResult> {
  const { MandateIntelligenceService } = await import("./mandate-intelligence");
  const service = options?.intelligenceService ?? (defaultMandateIntelligence ??= new MandateIntelligenceService());
  const res = await service.extractMandate({
    prompt: input.prompt,
    currency: input.currency,
    fallbackOnFailure: options?.fallbackOnFailure ?? true,
  });

  return {
    success: res.status === "READY",
    status: res.status,
    mandate: res.mandate,
    extractedMandate: res.mandate,
    itemQuery: res.itemQuery,
    quantity: res.quantity,
    maxTotalBudget: res.maxTotalBudget,
    unitPriceBudget: res.unitPriceBudget,
    currency: res.currency,
    maxDeliveryDays: res.maxDeliveryDays,
    minReturnDays: res.minReturnDays,
    missingFields: res.missingFields,
    ambiguities: res.ambiguities,
    contradictions: res.contradictions,
    clarificationQuestions: res.clarificationQuestions,
    extractor: res.extractor,
    rawPrompt: res.rawPrompt,
    error: res.error,
  };
}

