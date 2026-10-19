"use client";

import React, { useState } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
  Play,
  Sparkles,
  AlertCircle,
  Truck,
  RotateCcw,
  Package,
} from "lucide-react";
import type { VendorQuote, CurrencyCode } from "@/types/pactum";

interface SourcingScreenProps {
  onStartNegotiation: (prompt: string, currency: string) => void;
  isLoading?: boolean;
}

export function SourcingScreen({
  onStartNegotiation,
  isLoading = false,
}: SourcingScreenProps) {
  // Dynamic Mandate Form State
  const [prompt, setPrompt] = useState(
    "Purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy."
  );
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [itemQuery, setItemQuery] = useState("4K USB-C monitors");
  const [quantity, setQuantity] = useState(25);
  const [budget, setBudget] = useState(8500);
  const [maxDelivery, setMaxDelivery] = useState(5);
  const [minReturn, setMinReturn] = useState(30);

  // Sourced quotes preview
  const [sourcedQuotes, setSourcedQuotes] = useState<VendorQuote[] | null>(null);
  const [isSourcing, setIsSourcing] = useState(false);
  const [sourcingError, setSourcingError] = useState<string | null>(null);

  const applyPreset = (presetName: "monitors" | "laptops" | "servers") => {
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

  const handleSourcePreview = async () => {
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
        throw new Error(data.error || "Failed to source quotes.");
      }

      setSourcedQuotes(data.quotes);
    } catch (err: unknown) {
      setSourcingError(err instanceof Error ? err.message : "Error sourcing vendors.");
    } finally {
      setIsSourcing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="pb-2">
        <h1 className="text-3xl font-bold tracking-tight text-[#F3F6FC]">Procurement sourcing</h1>
        <p className="text-sm text-[#9AAAC0] mt-1.5">
          Configure dynamic mandate requirements and compare multi-vendor wholesale baselines.
        </p>
      </div>

      {/* Quick Benchmark Presets */}
      <div className="bg-[#0D1B2B] rounded-2xl p-5 card-shadow border border-[#23354B]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs text-[#9AAAC0]">
          <Sparkles className="w-4 h-4 text-[#5B9CFF]" />
          <span className="font-medium">Quick demonstration scenarios:</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => applyPreset("monitors")}
            className="px-3.5 py-1.5 rounded-xl bg-[#132438] hover:bg-[#1A293D] text-xs font-medium text-[#F3F6FC] transition-colors cursor-pointer"
          >
            Scenario A ($8.5k / 25 Units)
          </button>
          <button
            onClick={() => applyPreset("laptops")}
            className="px-3.5 py-1.5 rounded-xl bg-[#132438] hover:bg-[#1A293D] text-xs font-medium text-[#F3F6FC] transition-colors cursor-pointer"
          >
            Scenario B ($4.0k / 10 Units)
          </button>
          <button
            onClick={() => applyPreset("servers")}
            className="px-3.5 py-1.5 rounded-xl bg-[#132438] hover:bg-[#1A293D] text-xs font-medium text-[#F3F6FC] transition-colors cursor-pointer"
          >
            Scenario C ($15.0k / 50 Units)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Mandate Configuration Form */}
        <div className="lg:col-span-5 bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#23354B]/40">
            <h2 className="text-base font-bold text-[#F3F6FC]">Mandate specifications</h2>
            <span className="text-xs font-medium text-[#22C55E] bg-[#22C55E]/10 px-2.5 py-1 rounded-full">
              Dynamic Budget
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9AAAC0] mb-2">
              Natural Language Procurement Prompt
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-[#07111F] rounded-xl p-3.5 text-sm text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF] transition-all resize-none leading-relaxed"
              placeholder="Enter procurement prompt..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#9AAAC0] mb-1.5">Product Query</label>
              <input
                type="text"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                className="w-full bg-[#07111F] rounded-xl px-3.5 py-2.5 text-sm text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#9AAAC0] mb-1.5">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-[#07111F] rounded-xl px-3.5 py-2.5 text-sm text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#9AAAC0] mb-1.5">Max Total Budget</label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-sm text-[#64758E]">$</span>
                <input
                  type="number"
                  min={1}
                  value={budget}
                  onChange={(e) => setBudget(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="w-full bg-[#07111F] rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#9AAAC0] mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full bg-[#07111F] rounded-xl px-3.5 py-2.5 text-sm text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#9AAAC0] mb-1.5">Delivery SLA (Days)</label>
              <input
                type="number"
                min={1}
                value={maxDelivery}
                onChange={(e) => setMaxDelivery(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-[#07111F] rounded-xl px-3.5 py-2.5 text-sm text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#9AAAC0] mb-1.5">Return Window (Days)</label>
              <input
                type="number"
                min={0}
                value={minReturn}
                onChange={(e) => setMinReturn(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-[#07111F] rounded-xl px-3.5 py-2.5 text-sm text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
              />
            </div>
          </div>

          {sourcingError && (
            <div className="p-3.5 rounded-xl bg-[#EF4444]/10 text-xs text-[#EF4444] flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{sourcingError}</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSourcePreview}
              disabled={isSourcing || isLoading}
              className="flex-1 py-3 px-4 rounded-xl bg-[#132438] hover:bg-[#1A293D] text-sm font-semibold text-[#F3F6FC] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSourcing ? "Querying Wholesale..." : "Preview Wholesale Quotes"}
            </button>
            <button
              onClick={() => onStartNegotiation(prompt, currency)}
              disabled={isLoading}
              className="flex-1 py-3 px-4 rounded-xl bg-[#5B9CFF] hover:bg-[#458AF0] text-sm font-semibold text-[#07111F] transition-all shadow-md shadow-[#5B9CFF]/15 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-[#07111F]" />
              <span>Enter Arena</span>
            </button>
          </div>
        </div>

        {/* Right: Vendor Quotes Comparison */}
        <div className="lg:col-span-7 bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-[#23354B]/40 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#F3F6FC]">Channel3 wholesale catalog comparison</h2>
                <p className="text-xs text-[#9AAAC0] mt-0.5">
                  Competing supplier baselines ready for multi-agent negotiation
                </p>
              </div>
              <span className="text-xs font-medium text-[#5B9CFF] bg-[#5B9CFF]/10 px-3 py-1 rounded-full">
                {sourcedQuotes ? `${sourcedQuotes.length} Quotes Loaded` : "Awaiting Preview"}
              </span>
            </div>

            {sourcedQuotes && sourcedQuotes.length > 0 ? (
              <div className="pt-6 space-y-4">
                {sourcedQuotes.map((quote) => {
                  const landedTotal = quote.initialUnitAsk * quantity + quote.shippingCost;
                  const isFeasible = landedTotal <= budget;

                  return (
                    <div
                      key={quote.vendorId}
                      className="bg-[#132438]/60 hover:bg-[#132438] rounded-xl p-5 border border-[#23354B]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-sm text-[#F3F6FC]">{quote.vendorName}</span>
                          <span className="text-xs font-mono-token text-[#5B9CFF] bg-[#07111F] px-2 py-0.5 rounded">
                            {quote.sku}
                          </span>
                        </div>
                        <div className="text-xs text-[#9AAAC0]">{quote.productTitle}</div>
                        <div className="flex items-center gap-4 text-xs text-[#64758E] pt-1">
                          <span className="flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-[#9AAAC0]" />
                            {quote.deliveryDays}d Delivery
                          </span>
                          <span className="flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5 text-[#9AAAC0]" />
                            {quote.returnDays}d Return Policy
                          </span>
                          <span className="font-medium text-[#5B9CFF]">{quote.condition}</span>
                        </div>
                      </div>

                      <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-[#23354B]/40">
                        <div className="text-xs text-[#9AAAC0]">Initial Landed Cost</div>
                        <CurrencyDisplay amount={landedTotal} currency={currency} size="md" />
                        <div className="text-xs text-[#64758E] mt-0.5">
                          Unit Ask: ${quote.initialUnitAsk} • Ship: ${quote.shippingCost}
                        </div>
                        <div className="mt-2.5">
                          <StatusBadge
                            status={isFeasible ? "verified" : "warning"}
                            label={isFeasible ? "Feasible" : "Over Budget"}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center text-[#9AAAC0] space-y-3">
                <Package className="w-10 h-10 mx-auto text-[#64758E] opacity-60" />
                <div className="text-sm font-semibold text-[#F3F6FC]">Wholesale Quotes Unloaded</div>
                <div className="text-xs text-[#9AAAC0] max-w-sm mx-auto leading-relaxed">
                  Click &ldquo;Preview Wholesale Quotes&rdquo; to test constraint validation, or &ldquo;Enter Arena&rdquo; to begin real-time multi-agent negotiation.
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 mt-6 border-t border-[#23354B]/40 text-xs text-[#64758E] flex items-center justify-between">
            <span>Sourcing Source: Channel3 B2B Wholesale API</span>
            <span>Deterministic Sandbox Simulation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
