"use client";

import React, { useState, useId } from "react";
import {
  PrimaryButton,
  GhostButton,
  FormInput,
  CurrencyDisplay,
  StatusBadge,
  SectionHeader,
} from "./SharedUI";
import {
  AlertCircle,
  Truck,
  RotateCcw,
  Package,
  Layers,
} from "lucide-react";
import type { VendorQuote, CurrencyCode, ProcurementMandate } from "@/types/pactum";

interface SourcingScreenProps {
  onStartNegotiation: (
    prompt: string,
    currency: string,
    rawMandate?: Partial<ProcurementMandate>,
    sessionId?: string
  ) => void;
  isLoading?: boolean;
}

interface ValidationErrors {
  itemQuery?: string;
  quantity?: string;
  budget?: string;
  maxDelivery?: string;
  minReturn?: string;
  prompt?: string;
}

export function SourcingScreen({
  onStartNegotiation,
  isLoading = false,
}: SourcingScreenProps) {
  const promptInputId = useId();
  const currencySelectId = useId();

  // Dynamic Mandate Form State
  const [prompt, setPrompt] = useState(
    "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy."
  );
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [itemQuery, setItemQuery] = useState("4K USB-C monitors");
  const [quantity, setQuantity] = useState<number>(25);
  const [budget, setBudget] = useState<number>(8500);
  const [maxDelivery, setMaxDelivery] = useState<number>(5);
  const [minReturn, setMinReturn] = useState<number>(30);

  // Validation errors
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Sourced quotes preview & session reuse
  const [sourcedQuotes, setSourcedQuotes] = useState<VendorQuote[] | null>(null);
  const [previewedSessionId, setPreviewedSessionId] = useState<string | null>(null);
  const [isSourcing, setIsSourcing] = useState(false);
  const [sourcingError, setSourcingError] = useState<string | null>(null);

  // Helper to format synchronized natural prompt
  const formatSynchronizedPrompt = (
    q: number,
    item: string,
    b: number,
    curr: CurrencyCode,
    d: number,
    r: number
  ) => {
    const sym = curr === "EUR" ? "€" : curr === "GBP" ? "£" : "$";
    return `Purchase ${q} ${item} under an ${sym}${b.toLocaleString()} total budget, with delivery within ${d} days and a minimum ${r}-day return policy.`;
  };

  // Field validation logic
  const validateFieldValues = (
    item: string,
    qty: number,
    b: number,
    d: number,
    r: number
  ): ValidationErrors => {
    const errs: ValidationErrors = {};
    if (!item.trim()) {
      errs.itemQuery = "Product description is required.";
    }
    if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
      errs.quantity = "Quantity must be an integer of 1 or more.";
    }
    if (isNaN(b) || b <= 0) {
      errs.budget = "Total budget must be a positive amount greater than 0.";
    }
    if (isNaN(d) || d < 1 || !Number.isInteger(d)) {
      errs.maxDelivery = "Delivery SLA must be at least 1 day.";
    }
    if (isNaN(r) || r < 0 || !Number.isInteger(r)) {
      errs.minReturn = "Return policy must be 0 days or more.";
    }
    return errs;
  };

  const handleItemQueryChange = (val: string) => {
    setItemQuery(val);
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    const newErrs = validateFieldValues(val, quantity, budget, maxDelivery, minReturn);
    setErrors(newErrs);
    setPrompt(formatSynchronizedPrompt(quantity, val, budget, currency, maxDelivery, minReturn));
  };

  const handleQuantityChange = (val: number) => {
    setQuantity(val);
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    const newErrs = validateFieldValues(itemQuery, val, budget, maxDelivery, minReturn);
    setErrors(newErrs);
    setPrompt(formatSynchronizedPrompt(val, itemQuery, budget, currency, maxDelivery, minReturn));
  };

  const handleBudgetChange = (val: number) => {
    setBudget(val);
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    const newErrs = validateFieldValues(itemQuery, quantity, val, maxDelivery, minReturn);
    setErrors(newErrs);
    setPrompt(formatSynchronizedPrompt(quantity, itemQuery, val, currency, maxDelivery, minReturn));
  };

  const handleCurrencyChange = (val: CurrencyCode) => {
    setCurrency(val);
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    setPrompt(formatSynchronizedPrompt(quantity, itemQuery, budget, val, maxDelivery, minReturn));
  };

  const handleDeliveryChange = (val: number) => {
    setMaxDelivery(val);
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    const newErrs = validateFieldValues(itemQuery, quantity, budget, val, minReturn);
    setErrors(newErrs);
    setPrompt(formatSynchronizedPrompt(quantity, itemQuery, budget, currency, val, minReturn));
  };

  const handleReturnChange = (val: number) => {
    setMinReturn(val);
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    const newErrs = validateFieldValues(itemQuery, quantity, budget, maxDelivery, val);
    setErrors(newErrs);
    setPrompt(formatSynchronizedPrompt(quantity, itemQuery, budget, currency, maxDelivery, val));
  };

  // Scenario presets
  const applyPreset = (
    q: number,
    item: string,
    b: number,
    d: number,
    r: number,
    curr: CurrencyCode = "USD"
  ) => {
    setItemQuery(item);
    setQuantity(q);
    setBudget(b);
    setCurrency(curr);
    setMaxDelivery(d);
    setMinReturn(r);
    setErrors({});
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    setSourcingError(null);
    setPrompt(formatSynchronizedPrompt(q, item, b, curr, d, r));
  };

  // Sourcing preview via /api/procurement/init
  const handleSourcePreview = async () => {
    const errs = validateFieldValues(itemQuery, quantity, budget, maxDelivery, minReturn);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSourcing(true);
    setSourcingError(null);

    try {
      const res = await fetch("/api/procurement/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currency,
          rawMandate: {
            itemQuery,
            quantity,
            maxTotalBudget: budget,
            maxDeliveryDays: maxDelivery,
            minReturnDays: minReturn,
            currency,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to query Channel3 catalog.");
      }

      setSourcedQuotes(data.quotes || []);
      setPreviewedSessionId(data.sessionId || null);
    } catch (err: unknown) {
      setSourcingError(err instanceof Error ? err.message : "Error querying suppliers.");
    } finally {
      setIsSourcing(false);
    }
  };

  const handleEnterArena = () => {
    const errs = validateFieldValues(itemQuery, quantity, budget, maxDelivery, minReturn);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    onStartNegotiation(
      prompt,
      currency,
      {
        itemQuery,
        quantity,
        maxTotalBudget: budget,
        maxDeliveryDays: maxDelivery,
        minReturnDays: minReturn,
        currency,
      },
      previewedSessionId || undefined
    );
  };

  const currencyPrefix = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <SectionHeader
        title="Procurement Mandate & Sourcing"
        subtitle="Define authoritative constraints and source competing baseline quotes from wholesale suppliers."
      />

      {/* Benchmark Presets */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[12px] font-mono-token uppercase text-[#6e6e78] dark:text-[#8e8a83] mr-1">
          Preset Scenarios:
        </span>
        <button
          type="button"
          onClick={() => applyPreset(25, "4K USB-C monitors", 8500, 5, 30)}
          className="px-3 py-1.5 rounded-[6px] text-[12.5px] font-medium bg-paper-white dark:bg-[#1c1c20] hover:bg-smoke/40 dark:hover:bg-[#25252b] border border-smoke dark:border-[#2b2b32] text-obsidian dark:text-[#f6f4f0] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
        >
          Scenario A ($8.5k / 25 4K Monitors)
        </button>
        <button
          type="button"
          onClick={() => applyPreset(10, "Ergonomic Standing Desks", 4500, 7, 14)}
          className="px-3 py-1.5 rounded-[6px] text-[12.5px] font-medium bg-paper-white dark:bg-[#1c1c20] hover:bg-smoke/40 dark:hover:bg-[#25252b] border border-smoke dark:border-[#2b2b32] text-obsidian dark:text-[#f6f4f0] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
        >
          Scenario B ($4.5k / 10 Desks)
        </button>
        <button
          type="button"
          onClick={() => applyPreset(50, "Enterprise Rack Servers", 15000, 3, 60)}
          className="px-3 py-1.5 rounded-[6px] text-[12.5px] font-medium bg-paper-white dark:bg-[#1c1c20] hover:bg-smoke/40 dark:hover:bg-[#25252b] border border-smoke dark:border-[#2b2b32] text-obsidian dark:text-[#f6f4f0] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
        >
          Scenario C ($15.0k / 50 Servers)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Mandate Configuration Form */}
        <div className="lg:col-span-5 bg-paper-white dark:bg-[#18181b] rounded-cards p-6 sm:p-7 border border-smoke dark:border-[#2b2b32] shadow-2xs space-y-5 transition-colors">
          <div className="flex items-center justify-between pb-3.5 border-b border-smoke/80 dark:border-[#2b2b32]">
            <h2 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
              Authoritative Mandate
            </h2>
            <StatusBadge status="verified" label="Dynamic Budget" />
          </div>

          {/* Natural Language Prompt with Sync */}
          <div className="space-y-1.5">
            <label
              htmlFor={promptInputId}
              className="block text-[13px] font-medium text-obsidian dark:text-[#f6f4f0] tracking-tight"
            >
              Natural Language Mandate Prompt
            </label>
            <textarea
              id={promptInputId}
              rows={3}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPreviewedSessionId(null);
              }}
              className="w-full bg-paper-white dark:bg-[#18181b] rounded-[8px] p-3 text-[14px] text-obsidian dark:text-[#f6f4f0] border border-smoke dark:border-[#2b2b32] hover:border-obsidian/30 dark:hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange transition-colors resize-none leading-relaxed"
              placeholder="Enter procurement prompt..."
            />
          </div>

          {/* Structured Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormInput
              id="mandate-item-query"
              label="Item Query"
              value={itemQuery}
              onChange={(e) => handleItemQueryChange(e.target.value)}
              placeholder="e.g. 4K Monitors"
              error={errors.itemQuery}
            />
            <FormInput
              id="mandate-quantity"
              label="Quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 0)}
              error={errors.quantity}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormInput
              id="mandate-budget"
              label="Max Total Budget"
              type="number"
              min={1}
              prefix={currencyPrefix}
              value={budget}
              onChange={(e) => handleBudgetChange(parseFloat(e.target.value) || 0)}
              error={errors.budget}
            />
            <div className="space-y-1.5">
              <label
                htmlFor={currencySelectId}
                className="block text-[13px] font-medium text-obsidian dark:text-[#f6f4f0] tracking-tight"
              >
                Currency
              </label>
              <select
                id={currencySelectId}
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                className="w-full h-10 bg-paper-white dark:bg-[#18181b] rounded-[8px] px-3 py-2 text-[14px] text-obsidian dark:text-[#f6f4f0] border border-smoke dark:border-[#2b2b32] hover:border-obsidian/30 dark:hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange transition-colors cursor-pointer font-medium"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FormInput
              id="mandate-delivery-days"
              label="Delivery SLA (Days)"
              type="number"
              min={1}
              value={maxDelivery}
              onChange={(e) => handleDeliveryChange(parseInt(e.target.value) || 0)}
              error={errors.maxDelivery}
            />
            <FormInput
              id="mandate-return-days"
              label="Return Window (Days)"
              type="number"
              min={0}
              value={minReturn}
              onChange={(e) => handleReturnChange(parseInt(e.target.value) || 0)}
              error={errors.minReturn}
            />
          </div>

          {sourcingError && (
            <div
              role="alert"
              className="p-3.5 rounded-[6px] bg-[#feeef0] dark:bg-[#2b1012] text-[13px] text-[#dc2626] dark:text-[#f87171] flex items-center gap-2 border border-[#ef4444]/25"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{sourcingError}</span>
            </div>
          )}

          {previewedSessionId && (
            <div className="p-3 rounded-[6px] bg-mint-whisper dark:bg-[#10211a] border border-lichen-green/30 text-[12.5px] text-[#006840] dark:text-[#4ade80] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-lichen-green shrink-0" />
              <span>Wholesale quotes previewed & locked in active session. Ready to negotiate.</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <GhostButton
              onClick={handleSourcePreview}
              disabled={isSourcing || isLoading}
              className="flex-1"
            >
              {isSourcing ? "Querying Suppliers..." : "Preview Wholesale"}
            </GhostButton>
            <PrimaryButton
              onClick={handleEnterArena}
              disabled={isLoading || isSourcing}
              className="flex-1"
            >
              Enter Arena
            </PrimaryButton>
          </div>
        </div>

        {/* Right Column: Wholesale Vendor Quotes Comparison */}
        <div className="lg:col-span-7 bg-paper-white dark:bg-[#18181b] rounded-cards p-6 sm:p-7 border border-smoke dark:border-[#2b2b32] flex flex-col justify-between shadow-2xs transition-colors">
          <div>
            <div className="pb-3.5 border-b border-smoke/80 dark:border-[#2b2b32] flex items-center justify-between">
              <div>
                <h2 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                  Channel3 Wholesale Catalog
                </h2>
                <p className="text-[13px] text-[#4a4a52] dark:text-[#b8b5af] mt-0.5">
                  Multi-vendor competing baselines loaded for game-theoretic negotiation
                </p>
              </div>
              <StatusBadge
                status={sourcedQuotes ? "verified" : "neutral"}
                label={sourcedQuotes ? `${sourcedQuotes.length} Quotes Loaded` : "Awaiting Preview"}
              />
            </div>

            {sourcedQuotes && sourcedQuotes.length > 0 ? (
              <div className="pt-4">
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="border-b border-smoke dark:border-[#28282e] text-[11px] font-mono-token uppercase tracking-wider text-[#6e6e78] dark:text-[#8e8a83]">
                        <th scope="col" className="pb-3 font-medium">Supplier &amp; SKU</th>
                        <th scope="col" className="pb-3 px-3 font-medium">SLAs</th>
                        <th scope="col" className="pb-3 px-3 font-medium text-right">Unit / Ship</th>
                        <th scope="col" className="pb-3 px-3 font-medium text-right">Landed Cost</th>
                        <th scope="col" className="pb-3 pl-3 text-right font-medium">Budget Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smoke/80 dark:divide-[#242429]">
                      {sourcedQuotes.map((quote) => {
                        const landedTotal = quote.initialUnitAsk * quantity + quote.shippingCost;
                        const isFeasible = landedTotal <= budget;

                        return (
                          <tr
                            key={quote.vendorId}
                            className="hover:bg-warm-cream/30 dark:hover:bg-[#1f1f23] transition-colors"
                          >
                            <td className="py-3.5 pr-3">
                              <div className="font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                                {quote.vendorName}
                              </div>
                              <div className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] line-clamp-1 max-w-[220px]">
                                {quote.productTitle}
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <span className="text-[10.5px] font-mono-token text-architect-violet dark:text-[#a78bfa] bg-smoke/40 dark:bg-[#202025] px-1.5 py-0.5 rounded border border-smoke dark:border-[#2b2b32] font-medium">
                                  {quote.sku}
                                </span>
                                <span className="text-[11px] text-[#6e6e78] dark:text-[#8e8a83]">
                                  {quote.condition}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-3 whitespace-nowrap">
                              <div className="text-obsidian dark:text-[#f6f4f0] flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5 text-[#6e6e78] dark:text-[#8e8a83]" aria-hidden="true" />
                                <span>{quote.deliveryDays}d delivery</span>
                              </div>
                              <div className="text-[#6e6e78] dark:text-[#8e8a83] text-[12px] flex items-center gap-1 mt-0.5">
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{quote.returnDays}d return</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-3 text-right whitespace-nowrap tabular-nums text-[#6e6e78] dark:text-[#8e8a83]">
                              <div>{currencyPrefix}{quote.initialUnitAsk.toLocaleString()} / unit</div>
                              <div className="text-[11.5px] mt-0.5">+{currencyPrefix}{quote.shippingCost} ship</div>
                            </td>
                            <td className="py-3.5 px-3 text-right whitespace-nowrap">
                              <CurrencyDisplay amount={landedTotal} currency={currency} size="sm" />
                            </td>
                            <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                              <StatusBadge
                                status={isFeasible ? "verified" : "warning"}
                                label={isFeasible ? "Within Budget" : "Exceeds"}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Breakdown */}
                <div className="sm:hidden divide-y divide-smoke/80 dark:divide-[#242429]">
                  {sourcedQuotes.map((quote) => {
                    const landedTotal = quote.initialUnitAsk * quantity + quote.shippingCost;
                    const isFeasible = landedTotal <= budget;

                    return (
                      <div key={quote.vendorId} className="py-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-obsidian dark:text-[#f6f4f0]">
                            {quote.vendorName}
                          </span>
                          <StatusBadge
                            status={isFeasible ? "verified" : "warning"}
                            label={isFeasible ? "Within Budget" : "Exceeds"}
                          />
                        </div>
                        <div className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83]">
                          {quote.productTitle}
                        </div>
                        <div className="flex items-center justify-between text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                          <span>{quote.deliveryDays}d Delivery • {quote.returnDays}d Return</span>
                          <span className="font-mono-token text-[11px] text-architect-violet dark:text-[#a78bfa]">
                            {quote.sku}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                            {currencyPrefix}{quote.initialUnitAsk}/unit + {currencyPrefix}{quote.shippingCost}
                          </span>
                          <CurrencyDisplay amount={landedTotal} currency={currency} size="sm" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-smoke/40 dark:bg-[#202025] mx-auto flex items-center justify-center text-[#6e6e78] dark:text-[#8e8a83]">
                  <Package className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="text-[15px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                  Wholesale Catalog Unloaded
                </div>
                <p className="text-[13px] text-[#6e6e78] dark:text-[#8e8a83] max-w-sm mx-auto leading-relaxed">
                  Execute &ldquo;Preview Wholesale&rdquo; to query competing baseline quotes from Channel3 or &ldquo;Enter Arena&rdquo; to commence autonomous multi-agent negotiation.
                </p>
              </div>
            )}
          </div>

          <div className="pt-3.5 mt-5 border-t border-smoke/80 dark:border-[#2b2b32] text-[12px] text-[#6e6e78] dark:text-[#8e8a83] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              Wholesale Feed: Channel3 API
            </span>
            <span className="text-[#6e6e78] dark:text-[#8e8a83] font-mono-token text-[11px]">
              Deterministic Simulation
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
