/**
 * PACTUM — Channel3 Sourcing Client
 * Interfaces with Channel3 B2B catalog API or uses strictly labeled deterministic fixtures.
 * Follows GEMINI.md Section 3 & 10 and SECURITY.md Section 8.
 */

import type { ProcurementMandate, VendorQuote } from "../types/pactum";

export interface SourcingOptions {
  apiKey?: string;
  forceFixtures?: boolean;
}

export interface SourcingResult {
  quotes: VendorQuote[];
  dataSource: "CHANNEL3" | "MOCK_CATALOG";
  isFixture: boolean;
  timestamp: string;
}

/**
 * Deterministic wholesale catalog fixtures for the hackathon demonstration:
 * 25 units of 4K USB-C Business Monitors
 * Baseline asks:
 * - Vendor A: $375/unit, $150 shipping, 4 days delivery, 30-day return policy
 * - Vendor B: $385/unit, $100 shipping, 3 days delivery, 35-day return policy (Target for demo intervention)
 * - Vendor C: $360/unit, $250 shipping, 5 days delivery, 30-day return policy
 */
export const DETERMINISTIC_FIXTURE_QUOTES: VendorQuote[] = [
  {
    vendorId: "vendor-apex-displays",
    vendorName: "Apex Displays Wholesale",
    sku: "APX-MON-4K-USBC-27",
    productTitle: 'Apex Pro 27" 4K UHD IPS USB-C Monitor 90W PD',
    initialUnitAsk: 375.0,
    currentUnitBid: 375.0,
    shippingCost: 150.0,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  },
  {
    vendorId: "vendor-displayworld",
    vendorName: "DisplayWorld Direct",
    sku: "DWD-4K-27-UB",
    productTitle: 'DisplayWorld Ultra 27" 4K Business Display USB-C',
    initialUnitAsk: 385.0,
    currentUnitBid: 385.0,
    shippingCost: 100.0,
    deliveryDays: 3,
    returnDays: 35,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  },
  {
    vendorId: "vendor-nextech-supplies",
    vendorName: "NexTech Commercial Supplies",
    sku: "NXT-4K-U27-HUB",
    productTitle: 'NexTech Commercial 27" 4K IPS USB-C Hub Monitor',
    initialUnitAsk: 360.0,
    currentUnitBid: 360.0,
    shippingCost: 250.0,
    deliveryDays: 5,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
  },
];

/**
 * Sourcing Client for retrieving 3 competing B2B vendor quotes.
 */
export class Channel3Client {
  private apiKey: string | undefined;

  constructor(options?: SourcingOptions) {
    this.apiKey = options?.apiKey ?? process.env.CHANNEL3_API_KEY;
  }

  /**
   * Queries Channel3 or returns deterministic fixtures if API key is not configured.
   */
  public async sourceQuotes(
    mandate: ProcurementMandate,
    options?: { forceFixtures?: boolean }
  ): Promise<SourcingResult> {
    const useFixtures = options?.forceFixtures || !this.apiKey;

    if (!useFixtures && this.apiKey) {
      try {
        // Attempt external Channel3 call with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch("https://api.channel3.ai/v1/sourcing/quotes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            query: mandate.itemQuery,
            quantity: mandate.quantity,
            maxBudget: mandate.maxTotalBudget,
            maxDeliveryDays: mandate.maxDeliveryDays,
            minReturnDays: mandate.minReturnDays,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json()) as { quotes: VendorQuote[] };
          if (Array.isArray(data.quotes) && data.quotes.length >= 3) {
            return {
              quotes: data.quotes.slice(0, 3).map((q) => ({
                ...q,
                dataSource: "CHANNEL3",
              })),
              dataSource: "CHANNEL3",
              isFixture: false,
              timestamp: new Date().toISOString(),
            };
          }
        }
      } catch {
        // Fall back to deterministic fixtures if live call fails or times out
      }
    }

    // Return deterministic fixtures with explicit labeling
    return {
      quotes: DETERMINISTIC_FIXTURE_QUOTES.map((q) => ({ ...q })),
      dataSource: "MOCK_CATALOG",
      isFixture: true,
      timestamp: new Date().toISOString(),
    };
  }
}
