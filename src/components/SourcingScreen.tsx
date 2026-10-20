"use client";

import React, { useState } from "react";
import {
  PrimaryButton,
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
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
    <div className="space-y-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-[36px] font-medium tracking-[-0.72px] text-[#000000]">
          Procurement sourcing
        </h1>
        <p className="text-[16px] text-[#888888]">
          Configure dynamic requisition constraints and evaluate wholesale supplier baselines before entering the arena.
        </p>
      </div>

      {/* Preset Scenarios Strip */}
      <div className="bg-[#f6f3ee] rounded-[24px] p-6 border border-[#e5e5e5] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-[14px] text-[#000000]">
          <Sparkles className="w-4 h-4 text-[#ff6600]" />
          <span className="font-medium">Benchmark Mandates:</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => applyPreset("monitors")}
            className="px-4 py-2 rounded-[24px] bg-[#ffffff] hover:bg-[#ffffff]/80 text-[14px] font-medium text-[#000000] border border-[#e5e5e5] transition-all cursor-pointer shadow-sm"
          >
            Scenario A ($8.5k / 25 Monitors)
          </button>
          <button
            onClick={() => applyPreset("laptops")}
            className="px-4 py-2 rounded-[24px] bg-[#ffffff] hover:bg-[#ffffff]/80 text-[14px] font-medium text-[#000000] border border-[#e5e5e5] transition-all cursor-pointer shadow-sm"
          >
            Scenario B ($4.0k / 10 Laptops)
          </button>
          <button
            onClick={() => applyPreset("servers")}
            className="px-4 py-2 rounded-[24px] bg-[#ffffff] hover:bg-[#ffffff]/80 text-[14px] font-medium text-[#000000] border border-[#e5e5e5] transition-all cursor-pointer shadow-sm"
          >
            Scenario C ($15.0k / 50 Servers)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Mandate Configuration Form */}
        <div className="lg:col-span-5 bg-[#ffffff] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.04)] space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#e5e5e5]">
            <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
              Authoritative Mandate
            </h2>
            <span className="text-[12px] font-medium text-[#00cc88] bg-[#ebfef6] px-3 py-1 rounded-[24px]">
              Dynamic Budget
            </span>
          </div>

          <div>
            <label className="block text-[14px] font-medium text-[#000000] mb-2">
              Natural Language Procurement Mandate
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-[#f6f3ee] rounded-[16px] p-4 text-[15px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000] transition-all resize-none leading-relaxed"
              placeholder="Enter procurement prompt..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-[#000000] mb-1.5">Item Query</label>
              <input
                type="text"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                className="w-full bg-[#f6f3ee] rounded-[8px] px-3.5 py-2.5 text-[15px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000]"
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[#000000] mb-1.5">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-[#f6f3ee] rounded-[8px] px-3.5 py-2.5 text-[15px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-[#000000] mb-1.5">Max Total Budget</label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-[15px] text-[#888888]">$</span>
                <input
                  type="number"
                  min={1}
                  value={budget}
                  onChange={(e) => setBudget(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="w-full bg-[#f6f3ee] rounded-[8px] pl-8 pr-3.5 py-2.5 text-[15px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[#000000] mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full bg-[#f6f3ee] rounded-[8px] px-3.5 py-2.5 text-[15px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000]"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[14px] font-medium text-[#000000] mb-1.5">Delivery SLA (Days)</label>
              <input
                type="number"
                min={1}
                value={maxDelivery}
                onChange={(e) => setMaxDelivery(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-[#f6f3ee] rounded-[8px] px-3.5 py-2.5 text-[15px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000]"
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[#000000] mb-1.5">Return Window (Days)</label>
              <input
                type="number"
                min={0}
                value={minReturn}
                onChange={(e) => setMinReturn(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-[#f6f3ee] rounded-[8px] px-3.5 py-2.5 text-[15px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000]"
              />
            </div>
          </div>

          {sourcingError && (
            <div className="p-4 rounded-[12px] bg-[#feeef0] text-[14px] text-[#ef4444] flex items-center gap-2.5 border border-[#ef4444]/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{sourcingError}</span>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSourcePreview}
              disabled={isSourcing || isLoading}
              className="flex-1 py-3 px-4 rounded-[8px] bg-[#f6f3ee] hover:bg-[#e5e5e5] text-[15px] font-medium text-[#000000] border border-[#e5e5e5] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSourcing ? "Querying Suppliers..." : "Preview Wholesale"}
            </button>
            <PrimaryButton
              onClick={() => onStartNegotiation(prompt, currency)}
              disabled={isLoading}
              className="flex-1"
            >
              Enter Arena
            </PrimaryButton>
          </div>
        </div>

        {/* Right Column: Wholesale Vendor Quotes Comparison */}
        <div className="lg:col-span-7 bg-[#f6f3ee] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-[#e5e5e5] flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
                  Channel3 Wholesale Catalog
                </h2>
                <p className="text-[14px] text-[#888888] mt-0.5">
                  Multi-vendor competing baselines loaded for game-theoretic negotiation
                </p>
              </div>
              <span className="text-[12px] font-medium text-[#5c2999] bg-[#f6f1fe] px-3 py-1 rounded-[24px]">
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
                      className="bg-[#ffffff] rounded-[20px] p-6 border border-[#e5e5e5] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[16px] font-medium text-[#000000]">{quote.vendorName}</span>
                          <span className="text-[12px] font-mono-token text-[#5c2999] bg-[#f6f1fe] px-2 py-0.5 rounded">
                            {quote.sku}
                          </span>
                        </div>
                        <div className="text-[14px] text-[#888888]">{quote.productTitle}</div>
                        <div className="flex items-center gap-4 text-[14px] text-[#888888] pt-1">
                          <span className="flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-[#000000]" />
                            {quote.deliveryDays}d Delivery
                          </span>
                          <span className="flex items-center gap-1.5">
                            <RotateCcw className="w-4 h-4 text-[#000000]" />
                            {quote.returnDays}d Return Policy
                          </span>
                          <span className="font-medium text-[#5c2999]">{quote.condition}</span>
                        </div>
                      </div>

                      <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-[#e5e5e5]">
                        <div className="text-[12px] text-[#888888]">Initial Landed Cost</div>
                        <CurrencyDisplay amount={landedTotal} currency={currency} size="md" />
                        <div className="text-[12px] text-[#888888] mt-0.5">
                          Unit: ${quote.initialUnitAsk} • Ship: ${quote.shippingCost}
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
              <div className="py-20 text-center text-[#888888] space-y-3">
                <Package className="w-10 h-10 mx-auto text-[#aa8855] opacity-70" />
                <div className="text-[18px] font-medium text-[#000000]">Catalog Unloaded</div>
                <p className="text-[14px] text-[#888888] max-w-sm mx-auto leading-relaxed">
                  Click &ldquo;Preview Wholesale&rdquo; to test constraint validation against competing suppliers, or &ldquo;Enter Arena&rdquo; to commence autonomous negotiation.
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 mt-6 border-t border-[#e5e5e5] text-[13px] text-[#888888] flex items-center justify-between">
            <span>Source: Channel3 Sourcing API</span>
            <span className="text-[#00cc88] font-medium">Deterministic Simulation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
