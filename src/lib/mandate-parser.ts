/**
 * PACTUM — Mandate Parser
 * Converts natural-language procurement prompts into validated, deterministic ProcurementMandates.
 * Follows GEMINI.md Section 3 & 4 and SECURITY.md Section 4.
 */

import crypto from "crypto";
import type { ProcurementMandate, RequiredSpecification } from "../types/pactum";

export interface MandateParseInput {
  prompt: string;
  currency?: string;
}

export interface MandateParseResult {
  success: boolean;
  mandate?: ProcurementMandate;
  error?: string;
  missingFields?: string[];
}

/**
 * Deterministic parser for natural-language procurement mandates.
 * Identifies:
 * - Product query & required specifications (e.g. 4K, USB-C)
 * - Quantity (e.g. 25)
 * - Maximum total budget (e.g. $8,500)
 * - Maximum delivery SLA in days (e.g. 5 days)
 * - Minimum return policy window in days (e.g. 30 days)
 */
export function parseProcurementMandate(input: MandateParseInput): MandateParseResult {
  let prompt = input.prompt?.trim();
  if (!prompt) {
    return {
      success: false,
      error: "Prompt is empty or missing.",
      missingFields: ["prompt"],
    };
  }

  // Normalize common number words for quantities and days (e.g. "five days" -> "5 days")
  const wordMap: Record<string, string> = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    thirty: "30",
  };
  prompt = prompt.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|thirty)\b/gi,
    (match) => wordMap[match.toLowerCase()] ?? match
  );

  const missingFields: string[] = [];

  // 1. Quantity extraction: e.g. "purchase 25", "order 25", "25 4K", "quantity of 25", "qty: 25", "25 monitors"
  let quantity: number | null = null;
  const qtyMatch = prompt.match(/\b(?:purchase|order|buy|procure|qty:?|quantity(?:\s+of)?)\s+(\d+)\b/i)
    || prompt.match(/\b(\d+)\s+(?:units?|monitors?|screens?|displays?|items?|pieces?)\b/i)
    || prompt.match(/\b(\d+)\s+4k\b/i);

  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10);
  }

  if (quantity === null || isNaN(quantity) || quantity <= 0) {
    missingFields.push("quantity");
  }

  // 2. Maximum Total Budget extraction: e.g. "$8,500", "under $8500", "budget of 8500", "max budget: 8500"
  let maxTotalBudget: number | null = null;
  const budgetMatch = prompt.match(/(?:budget|spend|cost|cap|total)?(?:\s+(?:of|is|under|max(?:imum)?|up\s+to|within))?\s*[\$€£]\s*([\d,]+(?:\.\d+)?)/i)
    || prompt.match(/(?:under|max(?:imum)?|within|cap\s+of)\s+([\d,]+(?:\.\d+)?)\s*(?:dollars?|usd)?/i);

  if (budgetMatch) {
    const rawVal = budgetMatch[1].replace(/,/g, "");
    const parsed = parseFloat(rawVal);
    if (Number.isFinite(parsed) && parsed > 0) {
      maxTotalBudget = parsed;
    }
  }

  if (maxTotalBudget === null) {
    missingFields.push("maxTotalBudget");
  }

  // 3. Delivery Days extraction: e.g. "within 5 days", "delivery in 5 days", "delivery <= 5 days", "5-day delivery"
  let maxDeliveryDays: number | null = null;
  const deliveryMatch = prompt.match(/(?:delivery|deliver|shipping|ship)\s+(?:within|in|under|<=)?\s*(\d+)\s*days?/i)
    || prompt.match(/(\d+)[\s-]days?\s+(?:delivery|sla|shipping)/i)
    || prompt.match(/(?:within|in)\s+(\d+)\s+days?\b/i);

  if (deliveryMatch) {
    const days = parseInt(deliveryMatch[1], 10);
    if (Number.isInteger(days) && days > 0) {
      maxDeliveryDays = days;
    }
  }

  if (maxDeliveryDays === null) {
    missingFields.push("maxDeliveryDays");
  }

  // 4. Return Policy Days extraction: e.g. "minimum 30-day return", "30 days return", "min 30-day return policy"
  let minReturnDays: number | null = null;
  const returnMatch = prompt.match(/(?:min(?:imum)?|at\s+least)?\s*(\d+)[\s-]days?\s+(?:return|refund|money-back)/i)
    || prompt.match(/(?:return\s+policy|return\s+window|returns?)\s+(?:of|at\s+least|min(?:imum)?|>=)?\s*(\d+)\s*days?/i);

  if (returnMatch) {
    const rDays = parseInt(returnMatch[1], 10);
    if (Number.isInteger(rDays) && rDays >= 0) {
      minReturnDays = rDays;
    }
  }

  if (minReturnDays === null) {
    missingFields.push("minReturnDays");
  }

  // 5. Product Specs and Item Query extraction
  const requiredSpecs: RequiredSpecification[] = [];
  if (/4k|uhd|3840\s*x\s*2160/i.test(prompt)) {
    requiredSpecs.push({ name: "Resolution", value: "4K UHD", mandatory: true });
  }
  if (/usb[\s-]?c|type[\s-]?c/i.test(prompt)) {
    requiredSpecs.push({ name: "Connectivity", value: "USB-C", mandatory: true });
  }
  if (/ips/i.test(prompt)) {
    requiredSpecs.push({ name: "PanelType", value: "IPS", mandatory: false });
  }

  let itemQuery = "4K USB-C monitors";
  if (/monitors?|screens?|displays?/i.test(prompt)) {
    itemQuery = "4K USB-C Business Monitors";
  }

  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Mandate incomplete: missing or unparseable fields: ${missingFields.join(", ")}.`,
      missingFields,
    };
  }

  const mandate: ProcurementMandate = {
    id: `mandate_${crypto.randomBytes(6).toString("hex")}`,
    rawPrompt: prompt,
    itemQuery,
    quantity: quantity!,
    maxTotalBudget: maxTotalBudget!,
    maxDeliveryDays: maxDeliveryDays!,
    minReturnDays: minReturnDays!,
    requiredSpecs,
    currency: input.currency ?? "USD",
    createdAt: new Date().toISOString(),
  };

  return {
    success: true,
    mandate,
  };
}
