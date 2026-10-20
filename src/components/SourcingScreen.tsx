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
  Sparkles,
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

  // Synchronized field updates that keep natural prompt aligned
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

  const applyPreset = (presetName: "monitors" | "laptops" | "servers") => {
    setPreviewedSessionId(null);
    setSourcedQuotes(null);
    setErrors({});
    setSourcingError(null);

    if (presetName === "monitors") {
      setItemQuery("4K USB-C monitors");
      setQuantity(25);
      setBudget(8500);
      setMaxDelivery(5);
      setMinReturn(30);
      setCurrency("USD");
      setPrompt(
        "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy."
      );
    } else if (presetName === "laptops") {
      setItemQuery("Enterprise Workstation Laptops 32GB RAM");
      setQuantity(10);
      setBudget(4000);
      setMaxDelivery(4);
      setMinReturn(30);
      setCurrency("USD");
      setPrompt(
        "Procure 10 Enterprise Workstation Laptops under $4,000 total budget, delivery in 4 days with 30-day return policy."
      );
    } else if (presetName === "servers") {
      setItemQuery("1U Rackmount Enterprise Server Nodes");
      setQuantity(50);
      setBudget(15000);
      setMaxDelivery(7);
      setMinReturn(14);
      setCurrency("USD");
      setPrompt(
        "Purchase 50 1U Rackmount Enterprise Server Nodes under $15,000 total budget, delivery within 7 days and 14-day return window."
      );
    }
  };

  // Preview wholesale quotes via /api/procurement/init
  const handleSourcePreview = async () => {
    const valErrs = validateFieldValues(itemQuery, quantity, budget, maxDelivery, minReturn);
    if (Object.keys(valErrs).length > 0) {
      setErrors(valErrs);
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
            itemQuery: itemQuery.trim(),
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
        throw new Error(data.error || "Failed to source quotes.");
      }

      setSourcedQuotes(data.quotes);
      setPreviewedSessionId(data.sessionId || null);
    } catch (err: unknown) {
      setSourcingError(err instanceof Error ? err.message : "Error sourcing vendors.");
    } finally {
      setIsSourcing(false);
    }
  };

  // Commencing negotiation arena
  const handleEnterArena = () => {
    const valErrs = validateFieldValues(itemQuery, quantity, budget, maxDelivery, minReturn);
    if (Object.keys(valErrs).length > 0) {
      setErrors(valErrs);
      return;
    }

    onStartNegotiation(
      prompt,
      currency,
      {
        itemQuery: itemQuery.trim(),
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
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* Header */}
      <SectionHeader
        title="Procurement sourcing"
        subtitle="Configure dynamic requisition constraints and evaluate wholesale supplier baselines before entering the arena."
      />

      {/* Preset Scenarios Strip */}
      <div className="bg-warm-cream rounded-cards p-6 border border-smoke flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-[15px] text-obsidian">
          <Sparkles className="w-4 h-4 text-ember-orange" aria-hidden="true" />
          <span className="font-medium tracking-[-0.3px]">Benchmark Mandates:</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => applyPreset("monitors")}
            className="px-4 py-2 rounded-buttons bg-paper-white hover:bg-obsidian/5 text-[14px] font-medium text-obsidian border border-smoke transition-all cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
          >
            Scenario A ($8.5k / 25 Monitors)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("laptops")}
            className="px-4 py-2 rounded-buttons bg-paper-white hover:bg-obsidian/5 text-[14px] font-medium text-obsidian border border-smoke transition-all cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
          >
            Scenario B ($4.0k / 10 Laptops)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("servers")}
            className="px-4 py-2 rounded-buttons bg-paper-white hover:bg-obsidian/5 text-[14px] font-medium text-obsidian border border-smoke transition-all cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
          >
            Scenario C ($15.0k / 50 Servers)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Mandate Configuration Form */}
        <div className="lg:col-span-5 bg-paper-white rounded-cards p-8 sm:p-10 border border-smoke shadow-[0px_4px_8px_0px_rgba(0,0,0,0.04)] space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-smoke">
            <h2 className="text-[20px] font-medium text-obsidian tracking-[-0.4px]">
              Authoritative Mandate
            </h2>
            <StatusBadge status="verified" label="Dynamic Budget" />
          </div>

          {/* Natural Language Prompt with Sync */}
          <div className="space-y-1.5">
            <label
              htmlFor={promptInputId}
              className="block text-[14px] font-medium text-obsidian tracking-[-0.28px]"
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
              className="w-full bg-warm-cream rounded-smallelements p-4 text-[15px] text-obsidian border border-smoke hover:border-obsidian/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:border-transparent transition-all resize-none leading-relaxed tracking-[-0.2px]"
              placeholder="Enter procurement prompt..."
            />
          </div>

          {/* Structured Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                className="block text-[14px] font-medium text-obsidian tracking-[-0.28px]"
              >
                Currency
              </label>
              <select
                id={currencySelectId}
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                className="w-full bg-warm-cream rounded-smallelements px-3.5 py-2.5 text-[15px] text-obsidian border border-smoke hover:border-obsidian/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:border-transparent transition-all cursor-pointer font-medium"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              className="p-4 rounded-smallelements bg-[#feeef0] text-[14px] text-[#ef4444] flex items-center gap-2.5 border border-[#ef4444]/20"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{sourcingError}</span>
            </div>
          )}

          {previewedSessionId && (
            <div className="p-3.5 rounded-smallelements bg-mint-whisper border border-lichen-green/30 text-[13px] text-obsidian flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-lichen-green shrink-0" />
              <span>Wholesale quotes previewed & locked in active session. Ready to negotiate.</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <GhostButton
              onClick={handleSourcePreview}
              disabled={isSourcing || isLoading}
              className="flex-1 py-3 text-[15px]"
            >
              {isSourcing ? "Querying Suppliers..." : "Preview Wholesale"}
            </GhostButton>
            <PrimaryButton
              onClick={handleEnterArena}
              disabled={isLoading || isSourcing}
              className="flex-1 text-[15px]"
            >
              Enter Arena
            </PrimaryButton>
          </div>
        </div>

        {/* Right Column: Wholesale Vendor Quotes Comparison */}
        <div className="lg:col-span-7 bg-warm-cream rounded-cards p-8 sm:p-10 border border-smoke flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-smoke flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-medium text-obsidian tracking-[-0.4px]">
                  Channel3 Wholesale Catalog
                </h2>
                <p className="text-[14px] text-[#666666] mt-0.5 tracking-[-0.2px]">
                  Multi-vendor competing baselines loaded for game-theoretic negotiation
                </p>
              </div>
              <StatusBadge
                status={sourcedQuotes ? "verified" : "neutral"}
                label={sourcedQuotes ? `${sourcedQuotes.length} Quotes Loaded` : "Awaiting Preview"}
              />
            </div>

            {sourcedQuotes && sourcedQuotes.length > 0 ? (
              <div className="pt-6 space-y-4">
                {sourcedQuotes.map((quote) => {
                  const landedTotal = quote.initialUnitAsk * quantity + quote.shippingCost;
                  const isFeasible = landedTotal <= budget;

                  return (
                    <div
                      key={quote.vendorId}
                      className="bg-paper-white rounded-cards p-6 border border-smoke shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[16px] font-medium text-obsidian tracking-[-0.32px]">
                            {quote.vendorName}
                          </span>
                          <span className="text-[12px] font-mono-token text-architect-violet bg-lavender-mist px-2 py-0.5 rounded border border-architect-violet/20 font-medium">
                            {quote.sku}
                          </span>
                        </div>
                        <div className="text-[14px] text-[#666666] tracking-[-0.2px]">
                          {quote.productTitle}
                        </div>
                        <div className="flex items-center gap-4 text-[13px] text-[#666666] pt-1">
                          <span className="flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-obsidian" aria-hidden="true" />
                            {quote.deliveryDays}d Delivery
                          </span>
                          <span className="flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5 text-obsidian" aria-hidden="true" />
                            {quote.returnDays}d Return Policy
                          </span>
                          <span className="font-medium text-architect-violet">{quote.condition}</span>
                        </div>
                      </div>

                      <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-smoke">
                        <div className="text-[12px] text-[#666666] font-normal">Initial Landed Cost</div>
                        <CurrencyDisplay amount={landedTotal} currency={currency} size="md" />
                        <div className="text-[12px] text-[#666666] mt-0.5">
                          Unit: {currencyPrefix}{quote.initialUnitAsk} • Ship: {currencyPrefix}{quote.shippingCost}
                        </div>
                        <div className="mt-2">
                          <StatusBadge
                            status={isFeasible ? "verified" : "warning"}
                            label={isFeasible ? "Within Budget" : "Exceeds Budget"}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-20 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-paper-white border border-smoke mx-auto flex items-center justify-center text-ash-gray">
                  <Package className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="text-[18px] font-medium text-obsidian tracking-[-0.36px]">
                  Catalog Unloaded
                </div>
                <p className="text-[14px] text-[#666666] max-w-sm mx-auto leading-relaxed tracking-[-0.2px]">
                  Click &ldquo;Preview Wholesale&rdquo; to test constraint validation against competing suppliers, or &ldquo;Enter Arena&rdquo; to commence autonomous negotiation.
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 mt-6 border-t border-smoke text-[13px] text-[#666666] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-obsidian" aria-hidden="true" />
              Source: Channel3 Sourcing API
            </span>
            <span className="text-lichen-green font-medium">Deterministic Simulation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
