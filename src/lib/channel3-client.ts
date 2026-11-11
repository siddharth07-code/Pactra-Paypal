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

export interface CatalogProduct {
  id: string; title: string; merchant: string; unitPrice: number; currency: string; url: string;
}

export interface SourcingResult {
  catalogProducts?: CatalogProduct[];
  warning?: string;
  quotes: VendorQuote[];
  dataSource: "CHANNEL3" | "MOCK_CATALOG";
  isFixture: boolean;
  timestamp: string;
  category?: string;
}

/**
 * Deterministic wholesale catalog fixtures for monitors (Default demonstration benchmark):
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
    category: "monitors",
    initialUnitAsk: 375.0,
    currentUnitBid: 375.0,
    shippingCost: 150.0,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
    currency: "USD",
    priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
  },
  {
    vendorId: "vendor-displayworld",
    vendorName: "DisplayWorld Direct",
    sku: "DWD-4K-27-UB",
    productTitle: 'DisplayWorld Ultra 27" 4K Business Display USB-C',
    category: "monitors",
    initialUnitAsk: 385.0,
    currentUnitBid: 385.0,
    shippingCost: 100.0,
    deliveryDays: 3,
    returnDays: 35,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
    currency: "USD",
    priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
  },
  {
    vendorId: "vendor-nextech-supplies",
    vendorName: "NexTech Commercial Supplies",
    sku: "NXT-4K-U27-HUB",
    productTitle: 'NexTech Commercial 27" 4K IPS USB-C Hub Monitor',
    category: "monitors",
    initialUnitAsk: 360.0,
    currentUnitBid: 360.0,
    shippingCost: 250.0,
    deliveryDays: 5,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
    currency: "USD",
    priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
  },
];

/**
 * Multi-category deterministic fixtures to prevent cross-category quote contamination
 * (Phase 3 Requirement 6: Do not present monitor quotes as matching servers, laptops, or furniture).
 */
export const FIXTURE_CATALOGS_BY_CATEGORY: Record<string, VendorQuote[]> = {
  monitors: DETERMINISTIC_FIXTURE_QUOTES,
  laptops: [
    {
      vendorId: "vendor-apex-laptops",
      vendorName: "Apex Enterprise Systems",
      sku: "APX-LAP-DEV15-32G",
      productTitle: 'Apex DevBook Pro 15" Laptop Core i7 32GB RAM 1TB SSD',
      category: "laptops",
      initialUnitAsk: 1150.0,
      currentUnitBid: 1150.0,
      shippingCost: 120.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-mobile",
      vendorName: "DisplayWorld Mobile Systems",
      sku: "DWD-LAP-WS16",
      productTitle: 'DisplayWorld WorkStation Laptop 16" 32GB RAM 1TB',
      category: "laptops",
      initialUnitAsk: 1220.0,
      currentUnitBid: 1220.0,
      shippingCost: 90.0,
      deliveryDays: 3,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-computing",
      vendorName: "NexTech Enterprise Systems",
      sku: "NXT-LAP-EE14",
      productTitle: 'NexTech Enterprise Elite Laptop 14" 16GB RAM 512GB SSD',
      category: "laptops",
      initialUnitAsk: 980.0,
      currentUnitBid: 980.0,
      shippingCost: 150.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
  servers: [
    {
      vendorId: "vendor-apex-servers",
      vendorName: "Apex Cloud Infrastructure",
      sku: "APX-SRV-2U-XEON",
      productTitle: "Apex Enterprise 2U Rackmount Server Dual Xeon 64GB ECC",
      category: "servers",
      initialUnitAsk: 2800.0,
      currentUnitBid: 2800.0,
      shippingCost: 350.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-datacenter",
      vendorName: "DisplayWorld Data Systems",
      sku: "DWD-SRV-CR2U",
      productTitle: "DisplayWorld CloudRack 2U Enterprise Server 128GB ECC",
      category: "servers",
      initialUnitAsk: 3100.0,
      currentUnitBid: 3100.0,
      shippingCost: 280.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-servers",
      vendorName: "NexTech Server Solutions",
      sku: "NXT-SRV-HD1U",
      productTitle: "NexTech HighDensity 1U Rack Server 64GB ECC",
      category: "servers",
      initialUnitAsk: 2450.0,
      currentUnitBid: 2450.0,
      shippingCost: 400.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
  furniture: [
    {
      vendorId: "vendor-apex-furniture",
      vendorName: "Apex Commercial Furniture",
      sku: "APX-DSK-DUAL60",
      productTitle: 'Apex ErgoRise Dual-Motor Commercial Standing Desk 60"x30"',
      category: "furniture",
      initialUnitAsk: 380.0,
      currentUnitBid: 380.0,
      shippingCost: 180.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-office",
      vendorName: "DisplayWorld Office Ergonomics",
      sku: "DWD-DSK-PL72",
      productTitle: 'DisplayWorld ProLift Commercial Sit-Stand Desk 72"x30"',
      category: "furniture",
      initialUnitAsk: 420.0,
      currentUnitBid: 420.0,
      shippingCost: 150.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-workspaces",
      vendorName: "NexTech Commercial Workspaces",
      sku: "NXT-DSK-HD60",
      productTitle: 'NexTech HeavyDuty Motorized Standing Desk 60"x30"',
      category: "furniture",
      initialUnitAsk: 350.0,
      currentUnitBid: 350.0,
      shippingCost: 220.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
  networking: [
    {
      vendorId: "vendor-apex-networks",
      vendorName: "Apex Networks Wholesale",
      sku: "APX-NET-48POE",
      productTitle: "Apex NetCore 48-Port PoE+ Managed Gigabit Switch 370W",
      category: "networking",
      initialUnitAsk: 680.0,
      currentUnitBid: 680.0,
      shippingCost: 140.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-telecom",
      vendorName: "DisplayWorld Network Solutions",
      sku: "DWD-NET-SX48",
      productTitle: "DisplayWorld SwitchX 48-Port Gigabit Enterprise PoE+",
      category: "networking",
      initialUnitAsk: 720.0,
      currentUnitBid: 720.0,
      shippingCost: 110.0,
      deliveryDays: 3,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-networks",
      vendorName: "NexTech Telecom Supplies",
      sku: "NXT-NET-24POE",
      productTitle: "NexTech Edge 24-Port Managed Switch PoE+ 250W",
      category: "networking",
      initialUnitAsk: 510.0,
      currentUnitBid: 510.0,
      shippingCost: 160.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "USD",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
};

/**
 * Native INR deterministic fixtures with economically plausible commercial wholesale pricing.
 * Never derived by re-labeling USD figures.
 */
export const NATIVE_INR_FIXTURES_BY_CATEGORY: Record<string, VendorQuote[]> = {
  monitors: [
    {
      vendorId: "vendor-apex-displays-india",
      vendorName: "Apex Displays India (Wholesale)",
      sku: "APX-IN-4K-27U",
      productTitle: 'Apex Pro India 27" 4K UHD IPS USB-C Monitor 90W PD',
      category: "monitors",
      initialUnitAsk: 32500.0,
      currentUnitBid: 32500.0,
      shippingCost: 12500.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-india",
      vendorName: "DisplayWorld India Direct",
      sku: "DWD-IN-4K-27B",
      productTitle: 'DisplayWorld India 27" 4K Commercial Display USB-C',
      category: "monitors",
      initialUnitAsk: 33800.0,
      currentUnitBid: 33800.0,
      shippingCost: 8500.0,
      deliveryDays: 3,
      returnDays: 35,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-india",
      vendorName: "NexTech India Commercial",
      sku: "NXT-IN-4K-27H",
      productTitle: 'NexTech Commercial India 27" 4K IPS USB-C Hub Monitor',
      category: "monitors",
      initialUnitAsk: 31200.0,
      currentUnitBid: 31200.0,
      shippingCost: 15000.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
  servers: [
    {
      vendorId: "vendor-apex-servers-india",
      vendorName: "Apex Cloud Infrastructure India",
      sku: "APX-IN-SRV-2U",
      productTitle: "Apex Enterprise India 2U Rackmount Server Dual Xeon 64GB ECC",
      category: "servers",
      initialUnitAsk: 280000.0,
      currentUnitBid: 280000.0,
      shippingCost: 25000.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-servers-india",
      vendorName: "DisplayWorld Data Systems India",
      sku: "DWD-IN-SRV-2U",
      productTitle: "DisplayWorld CloudRack India 2U Enterprise Server 128GB ECC",
      category: "servers",
      initialUnitAsk: 310000.0,
      currentUnitBid: 310000.0,
      shippingCost: 20000.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-servers-india",
      vendorName: "NexTech Server Solutions India",
      sku: "NXT-IN-SRV-1U",
      productTitle: "NexTech HighDensity India 1U Rack Server 64GB ECC",
      category: "servers",
      initialUnitAsk: 245000.0,
      currentUnitBid: 245000.0,
      shippingCost: 35000.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
  furniture: [
    {
      vendorId: "vendor-apex-furniture-india",
      vendorName: "Apex Commercial Furniture India",
      sku: "APX-IN-DSK-60",
      productTitle: 'Apex ErgoRise India Dual-Motor Commercial Standing Desk 60"x30"',
      category: "furniture",
      initialUnitAsk: 38000.0,
      currentUnitBid: 38000.0,
      shippingCost: 15000.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-furniture-india",
      vendorName: "DisplayWorld Office India",
      sku: "DWD-IN-DSK-72",
      productTitle: 'DisplayWorld ProLift India Sit-Stand Commercial Desk 72"x30"',
      category: "furniture",
      initialUnitAsk: 42000.0,
      currentUnitBid: 42000.0,
      shippingCost: 12000.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-furniture-india",
      vendorName: "NexTech Workspaces India",
      sku: "NXT-IN-DSK-60",
      productTitle: 'NexTech HeavyDuty India Motorized Standing Desk 60"x30"',
      category: "furniture",
      initialUnitAsk: 35000.0,
      currentUnitBid: 35000.0,
      shippingCost: 18000.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
  laptops: [
    {
      vendorId: "vendor-apex-laptops-india",
      vendorName: "Apex Enterprise Systems India",
      sku: "APX-IN-LAP-15",
      productTitle: 'Apex DevBook Pro India 15" Laptop Core i7 32GB RAM 1TB SSD',
      category: "laptops",
      initialUnitAsk: 115000.0,
      currentUnitBid: 115000.0,
      shippingCost: 12000.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-laptops-india",
      vendorName: "DisplayWorld Mobile Systems India",
      sku: "DWD-IN-LAP-16",
      productTitle: 'DisplayWorld WorkStation India 16" 32GB RAM 1TB',
      category: "laptops",
      initialUnitAsk: 122000.0,
      currentUnitBid: 122000.0,
      shippingCost: 9000.0,
      deliveryDays: 3,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-laptops-india",
      vendorName: "NexTech Enterprise Systems India",
      sku: "NXT-IN-LAP-14",
      productTitle: 'NexTech Enterprise Elite India 14" 16GB RAM 512GB SSD',
      category: "laptops",
      initialUnitAsk: 98000.0,
      currentUnitBid: 98000.0,
      shippingCost: 15000.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
  networking: [
    {
      vendorId: "vendor-apex-networks-india",
      vendorName: "Apex Networks Wholesale India",
      sku: "APX-IN-NET-48",
      productTitle: "Apex NetCore India 48-Port PoE+ Managed Gigabit Switch 370W",
      category: "networking",
      initialUnitAsk: 68000.0,
      currentUnitBid: 68000.0,
      shippingCost: 14000.0,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-displayworld-networks-india",
      vendorName: "DisplayWorld Network Solutions India",
      sku: "DWD-IN-NET-48",
      productTitle: "DisplayWorld SwitchX India 48-Port Gigabit Enterprise PoE+",
      category: "networking",
      initialUnitAsk: 72000.0,
      currentUnitBid: 72000.0,
      shippingCost: 11000.0,
      deliveryDays: 3,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
    {
      vendorId: "vendor-nextech-networks-india",
      vendorName: "NexTech Telecom Supplies India",
      sku: "NXT-IN-NET-24",
      productTitle: "NexTech Edge India 24-Port Managed Switch PoE+ 250W",
      category: "networking",
      initialUnitAsk: 51000.0,
      currentUnitBid: 51000.0,
      shippingCost: 16000.0,
      deliveryDays: 5,
      returnDays: 30,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "MOCK_CATALOG",
      currency: "INR",
      priceProvenance: "NATIVE_DETERMINISTIC_FIXTURE",
    },
  ],
};

function matchCategoryKeywords(text: string): string {
  if (/\b(monitor|monitors|display|displays|screen|screens)\b/i.test(text)) {
    return "monitors";
  }
  if (/\b(laptop|laptops|notebook|notebooks|thinkpad|macbook|chromebook)\b/i.test(text)) {
    return "laptops";
  }
  if (/\b(server|servers|rackmount|poweredge|proliant|xeon)\b/i.test(text)) {
    return "servers";
  }
  if (/\b(desk|desks|standing desk|sit-stand|furniture|table|tables)\b/i.test(text)) {
    return "furniture";
  }
  if (/\b(switch|switches|networking|router|routers|ethernet switch)\b/i.test(text)) {
    return "networking";
  }
  return "unknown";
}

/**
 * Deterministically detects the commercial category from a mandate
 */
export function detectMandateCategory(mandate: ProcurementMandate): string {
  // Check structured requiredSpecs first
  if (mandate.requiredSpecs && Array.isArray(mandate.requiredSpecs)) {
    for (const spec of mandate.requiredSpecs) {
      const name = spec.name.toLowerCase();
      if (name === "category" || name === "productcategory") {
        const val = spec.value.toLowerCase();
        const matched = matchCategoryKeywords(val);
        if (matched !== "unknown") return matched;
        return val;
      }
    }
  }

  // 1. Inspect itemQuery text first
  if (mandate.itemQuery) {
    const itemMatch = matchCategoryKeywords(mandate.itemQuery);
    if (itemMatch !== "unknown") return itemMatch;
  }

  // 2. Fall back to rawPrompt text
  if (mandate.rawPrompt) {
    const promptMatch = matchCategoryKeywords(mandate.rawPrompt);
    if (promptMatch !== "unknown") return promptMatch;
  }

  return "unknown";
}

/**
 * Sourcing Client for retrieving competing B2B vendor quotes.
 */
export class Channel3Client {
  private apiKey: string | undefined;

  constructor(options?: SourcingOptions) {
    this.apiKey = options?.apiKey ?? process.env.CHANNEL3_API_KEY;
  }

  /**
   * Queries Channel3 or returns category-constrained deterministic fixtures.
   * If no fixtures exist for an unsupported category, returns an empty quote array
   * rather than cross-contaminating with monitor quotes.
   */
  public async sourceQuotes(
    mandate: ProcurementMandate,
    options?: { forceFixtures?: boolean }
  ): Promise<SourcingResult> {
    const useFixtures = options?.forceFixtures || !this.apiKey;
    const detectedCategory = detectMandateCategory(mandate);

    if (!useFixtures && this.apiKey) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch("https://api.trychannel3.com/v1/search", {
          method: "POST", redirect: "error", cache: "no-store",
          headers: { "Content-Type": "application/json", "x-api-key": this.apiKey },
          body: JSON.stringify({ query: mandate.itemQuery, limit: 10, config: { currency: mandate.currency }, filters: { price: { max_price: mandate.maxTotalBudget / mandate.quantity } } }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Catalog request failed.");
        const data = await response.json() as { products?: unknown[] };
        if (!Array.isArray(data.products)) throw new Error("Invalid catalog response.");
        const catalogProducts: CatalogProduct[] = [];
        for (const value of data.products.slice(0, 30)) {
          if (!value || typeof value !== "object") continue;
          const p = value as { id?: unknown; title?: unknown; offers?: unknown[] };
          if (typeof p.id !== "string" || typeof p.title !== "string" || !Array.isArray(p.offers)) continue;
          for (const value of p.offers) {
            if (!value || typeof value !== "object") continue;
            const offer = value as { domain?: unknown; url?: unknown; price?: { price?: unknown; currency?: unknown }; availability?: unknown };
            const price = offer.price?.price;
            if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || offer.price?.currency !== mandate.currency || typeof offer.url !== "string" || typeof offer.domain !== "string" || offer.availability !== "InStock") continue;
            let url: URL;
            try { url = new URL(offer.url); } catch { continue; }
            if (url.protocol !== "https:") continue;
            catalogProducts.push({ id: p.id, title: p.title, merchant: offer.domain, unitPrice: price, currency: mandate.currency, url: url.href });
          }
        }
        return { quotes: [], catalogProducts, warning: "Channel3 catalog listings do not establish shipping, delivery, returns, or supplier acceptance. Obtain verified merchant terms before procurement; these listings cannot authorize settlement.", dataSource: "CHANNEL3", isFixture: false, timestamp: new Date().toISOString(), category: detectedCategory };
      } catch {
        throw new Error("Channel3 catalog is unavailable or returned invalid data. Retry sourcing; demonstration offers were not substituted.");
      } finally { clearTimeout(timeoutId); controller.abort(); }
    }

    // Return category-specific deterministic fixtures with explicit native currency matching
    const mandateCurrency = (mandate.currency || "USD").toUpperCase();
    const catalog = mandateCurrency === "INR"
      ? NATIVE_INR_FIXTURES_BY_CATEGORY[detectedCategory]
      : FIXTURE_CATALOGS_BY_CATEGORY[detectedCategory];

    if (catalog && catalog.length > 0) {
      // Strictly enforce currency integrity: only return quotes natively matching the mandate currency.
      // NEVER silently re-label USD quotes as INR or vice-versa!
      const matchingQuotes = catalog.filter(
        (q) => (q.currency || "USD").toUpperCase() === mandateCurrency
      );

      if (matchingQuotes.length > 0) {
        return {
          quotes: matchingQuotes.map((q) => ({ ...q })),
          dataSource: "MOCK_CATALOG",
          isFixture: true,
          timestamp: new Date().toISOString(),
          category: detectedCategory,
        };
      }
    }

    // No appropriate fixtures exist for this category and currency — return clear empty results state
    // (Never return quotes with mismatched currency or wrong category!)
    return {
      quotes: [],
      dataSource: "MOCK_CATALOG",
      isFixture: true,
      timestamp: new Date().toISOString(),
      category: detectedCategory,
    };
  }
}
