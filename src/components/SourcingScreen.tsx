"use client";

import React, { useState } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
  Boxes,
  Play,
  Sparkles,
  AlertCircle,
  Truck,
  RotateCcw,
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
  // Dynamic Mandate Form State (Scenario Defaults are demonstration options only)
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

  // Scenario Presets
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

  const handleLaunchNegotiation = () => {
    onStartNegotiation(prompt, currency);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="border-b border-[#203149] pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#F1F5F9]">Procurement Sourcing</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Configure dynamic procurement mandate constraints and evaluate multi-vendor Channel3 wholesale catalog offers.
        </p>
      </div>

      {/* Preset Scenarios */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs text-[#94A3B8] flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#4597FF]" />
          <span>Quick Benchmark Scenarios:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyPreset("monitors")}
            className="px-3 py-1 rounded-md bg-[#101F33] hover:bg-[#203149] text-xs font-mono text-[#F1F5F9] border border-[#203149] transition-colors"
          >
            Scenario A ($8.5k / 25 Units)
          </button>
          <button
            onClick={() => applyPreset("laptops")}
            className="px-3 py-1 rounded-md bg-[#101F33] hover:bg-[#203149] text-xs font-mono text-[#F1F5F9] border border-[#203149] transition-colors"
          >
            Scenario B ($4.0k / 10 Units)
          </button>
          <button
            onClick={() => applyPreset("servers")}
            className="px-3 py-1 rounded-md bg-[#101F33] hover:bg-[#203149] text-xs font-mono text-[#F1F5F9] border border-[#203149] transition-colors"
          >
            Scenario C ($15.0k / 50 Units)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Mandate Configuration Form */}
        <div className="lg:col-span-5 bg-[#0B1728] border border-[#203149] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#203149]">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
              Authoritative Mandate
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30">
              DYNAMIC BUDGET
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
              Natural Language Procurement Prompt
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-[#030B18] border border-[#203149] rounded-lg p-3 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#4597FF] transition-colors resize-none font-sans"
              placeholder="Enter procurement instructions..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Item Query</label>
              <input
                type="text"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                className="w-full bg-[#030B18] border border-[#203149] rounded-lg px-3 py-2 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-[#030B18] border border-[#203149] rounded-lg px-3 py-2 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Max Total Budget</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-[#64748B]">$</span>
                <input
                  type="number"
                  min={1}
                  value={budget}
                  onChange={(e) => setBudget(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="w-full bg-[#030B18] border border-[#203149] rounded-lg pl-7 pr-3 py-2 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full bg-[#030B18] border border-[#203149] rounded-lg px-3 py-2 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Max Delivery (Days)</label>
              <input
                type="number"
                min={1}
                value={maxDelivery}
                onChange={(e) => setMaxDelivery(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-[#030B18] border border-[#203149] rounded-lg px-3 py-2 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">Min Return (Days)</label>
              <input
                type="number"
                min={0}
                value={minReturn}
                onChange={(e) => setMinReturn(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-[#030B18] border border-[#203149] rounded-lg px-3 py-2 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
              />
            </div>
          </div>

          {sourcingError && (
            <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#EF4444] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{sourcingError}</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSourcePreview}
              disabled={isSourcing || isLoading}
              className="flex-1 py-2.5 px-4 rounded-lg bg-[#101F33] hover:bg-[#203149] text-sm font-medium text-[#F1F5F9] border border-[#203149] transition-colors disabled:opacity-50"
            >
              {isSourcing ? "Querying Wholesale..." : "Preview Sourced Quotes"}
            </button>
            <button
              onClick={handleLaunchNegotiation}
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-lg bg-[#4597FF] hover:bg-[#4597FF]/90 text-sm font-medium text-white transition-all shadow-md shadow-[#4597FF]/10 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Enter Arena</span>
            </button>
          </div>
        </div>

        {/* Right: Vendor Quotes Comparison Table */}
        <div className="lg:col-span-7 bg-[#0B1728] border border-[#203149] rounded-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-[#203149] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Channel3 Wholesale Vendor Offers
                </h2>
                <div className="text-xs text-[#64748B] mt-0.5">
                  Competing catalog baselines ready for game-theoretic negotiation
                </div>
              </div>
              <span className="text-xs font-mono text-[#4597FF] px-2 py-0.5 rounded bg-[#203149]">
                {sourcedQuotes ? `${sourcedQuotes.length} Quotes Loaded` : "Awaiting Sourcing"}
              </span>
            </div>

            {sourcedQuotes && sourcedQuotes.length > 0 ? (
              <div className="p-6 space-y-4">
                {sourcedQuotes.map((quote) => {
                  const landedTotal = quote.initialUnitAsk * quantity + quote.shippingCost;
                  const isFeasible = landedTotal <= budget;

                  return (
                    <div
                      key={quote.vendorId}
                      className="bg-[#101F33]/80 border border-[#203149] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#4597FF]/40 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#F1F5F9]">{quote.vendorName}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#203149] text-[#94A3B8]">
                            SKU: {quote.sku}
                          </span>
                        </div>
                        <div className="text-xs text-[#94A3B8]">{quote.productTitle}</div>
                        <div className="flex items-center gap-4 text-xs text-[#64748B] pt-1">
                          <span className="flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-[#94A3B8]" />
                            {quote.deliveryDays}d SLA
                          </span>
                          <span className="flex items-center gap-1">
                            <RotateCcw className="w-3.5 h-3.5 text-[#94A3B8]" />
                            {quote.returnDays}d Return Window
                          </span>
                          <span className="font-mono text-[#4597FF]">{quote.condition}</span>
                        </div>
                      </div>

                      <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-[#203149]">
                        <div className="text-xs text-[#94A3B8]">Initial Unit Ask</div>
                        <CurrencyDisplay
                          amount={quote.initialUnitAsk}
                          currency={currency}
                          size="md"
                        />
                        <div className="text-xs text-[#64748B] mt-1">
                          Landed: <CurrencyDisplay amount={landedTotal} currency={currency} size="sm" />
                        </div>
                        <div className="mt-2">
                          <StatusBadge
                            status={isFeasible ? "verified" : "warning"}
                            label={isFeasible ? "Feasible" : "Exceeds Budget"}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-[#94A3B8] space-y-3">
                <Boxes className="w-10 h-10 mx-auto text-[#64748B] opacity-60" />
                <div className="text-sm font-medium text-[#F1F5F9]">No Vendor Quotes Loaded</div>
                <div className="text-xs text-[#64748B] max-w-sm mx-auto">
                  Click &quot;Preview Sourced Quotes&quot; to fetch three competing wholesale proposals or directly click &quot;Enter Arena&quot; to initiate autonomous negotiation.
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-[#030B18]/60 border-t border-[#203149] text-xs text-[#64748B] flex items-center justify-between">
            <span>Sourcing Source: Channel3 Wholesale API</span>
            <span className="font-mono">Deterministic Simulation Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
