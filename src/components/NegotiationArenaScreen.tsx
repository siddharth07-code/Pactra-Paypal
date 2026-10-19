"use client";

import React, { useRef, useEffect } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
  ShieldAlert,
  CheckCircle2,
  Building2,
  Lock,
  ArrowRight,
  Truck,
  RotateCcw,
} from "lucide-react";
import type { VendorQuote, ProcurementMandate } from "@/types/pactum";

export interface StreamEventItem {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface NegotiationArenaScreenProps {
  sessionId?: string;
  mandate?: ProcurementMandate;
  quotes: VendorQuote[];
  events: StreamEventItem[];
  isStreaming: boolean;
  onProceedToSettlement?: () => void;
}

export function NegotiationArenaScreen({
  sessionId,
  mandate,
  quotes,
  events,
  isStreaming,
  onProceedToSettlement,
}: NegotiationArenaScreenProps) {
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const currentRound = events.reduce((max, ev) => {
    if (ev.payload.round && typeof ev.payload.round === "number") {
      return Math.max(max, ev.payload.round);
    }
    return max;
  }, 1);

  const completed = events.some((ev) => ev.type === "NEGOTIATION_COMPLETED");
  const failed = events.some((ev) => ev.type === "NEGOTIATION_FAILED");

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#F3F6FC]">Negotiation Arena</h1>
            {isStreaming && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5B9CFF]/15 text-[#5B9CFF] text-xs font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-[#5B9CFF]" />
                Streaming Live
              </span>
            )}
            {completed && <StatusBadge status="verified" label="Negotiation Completed" />}
            {failed && <StatusBadge status="failure" label="Negotiation Halted" />}
          </div>
          <div className="text-xs text-[#9AAAC0] flex flex-wrap items-center gap-3">
            <span>
              Session: <span className="font-mono-token text-[#F3F6FC]">{sessionId || "Pending"}</span>
            </span>
            <span>•</span>
            <span>
              Mandate: <strong className="text-[#F3F6FC]">{mandate?.itemQuery || "4K Monitors"}</strong> (
              {mandate?.quantity || 25} units)
            </span>
            <span>•</span>
            <span>
              Ceiling:{" "}
              <CurrencyDisplay
                amount={mandate?.maxTotalBudget || 8500}
                currency={mandate?.currency || "USD"}
                size="sm"
              />
            </span>
            <span>•</span>
            <span className="text-[#B58CDB] font-medium">Round {currentRound} of 4</span>
          </div>
        </div>

        {completed && onProceedToSettlement && (
          <button
            onClick={onProceedToSettlement}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#22C55E] hover:bg-[#1ea850] text-[#07111F] text-sm font-semibold transition-all shadow-md shadow-[#22C55E]/20 cursor-pointer"
          >
            <span>Proceed to Settlement Gate</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Multi-Column Layout: Competing Vendors Panel on Left, Timeline on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Competing Vendor Cards */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-base font-bold text-[#F3F6FC]">Competing vendor offers</h2>
            <span className="text-xs text-[#9AAAC0]">{quotes.length} vendors in arena</span>
          </div>

          <div className="space-y-4">
            {quotes.map((quote) => {
              const landedCost =
                quote.currentUnitBid * (mandate?.quantity || 25) + quote.shippingCost;
              const isFeasible = landedCost <= (mandate?.maxTotalBudget || 8500);

              return (
                <div
                  key={quote.vendorId}
                  className={`bg-[#0D1B2B] rounded-2xl p-6 card-shadow border transition-all ${
                    isFeasible
                      ? "border-[#23354B]/60 hover:border-[#5B9CFF]/40"
                      : "border-[#EF4444]/40 bg-[#EF4444]/5"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#132438] flex items-center justify-center text-[#5B9CFF]">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-[#F3F6FC]">{quote.vendorName}</div>
                        <div className="text-[11px] text-[#64758E] font-mono-token">{quote.sku}</div>
                      </div>
                    </div>
                    <StatusBadge
                      status={isFeasible ? "verified" : "warning"}
                      label={isFeasible ? "Feasible" : "Over Budget"}
                      size="sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-[#23354B]/40 text-xs">
                    <div>
                      <span className="text-[#9AAAC0]">Current Unit Bid</span>
                      <div className="text-sm font-semibold text-[#F3F6FC]">
                        <CurrencyDisplay
                          amount={quote.currentUnitBid}
                          currency={mandate?.currency || "USD"}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[#9AAAC0]">Landed Total</span>
                      <div className="text-sm font-bold text-[#5B9CFF]">
                        <CurrencyDisplay
                          amount={landedCost}
                          currency={mandate?.currency || "USD"}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-[#9AAAC0]">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" />
                      {quote.deliveryDays}d delivery
                    </span>
                    <span className="flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" />
                      {quote.returnDays}d return window
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Real-Time Activity Feed Timeline */}
        <div className="lg:col-span-7 bg-[#0D1B2B] rounded-2xl card-shadow border border-[#23354B]/60 flex flex-col h-[650px] overflow-hidden">
          <div className="px-7 py-5 border-b border-[#23354B]/40 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#F3F6FC]">Negotiation activity feed</h2>
              <p className="text-xs text-[#9AAAC0] mt-0.5">
                Mechanism-design firewall intercepting and verifying outgoing buyer proposals
              </p>
            </div>
            <span className="text-xs font-medium text-[#22C55E] bg-[#22C55E]/10 px-3 py-1 rounded-full flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              <span>Predicates A-E Active</span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-7 space-y-4 text-sm">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#9AAAC0] space-y-2">
                <span className="text-sm font-medium text-[#F3F6FC]">Negotiation stream awaiting launch...</span>
                <span className="text-xs text-[#64758E] max-w-sm text-center leading-relaxed">
                  When started, each outgoing Gemini proposal will be intercepted deterministically before any transmission occurs.
                </span>
              </div>
            ) : (
              events.map((ev) => {
                const p = ev.payload;

                // 1. BUYER PROPOSAL (Blue accent)
                if (ev.type === "BUYER_PROPOSAL") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-2xl p-5 bg-[#132438]/80 border border-[#5B9CFF]/30 space-y-2.5 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-[#5B9CFF]/15 text-[#5B9CFF] font-bold text-xs flex items-center justify-center">
                            B
                          </span>
                          <span className="font-semibold text-xs text-[#5B9CFF]">
                            Gemini Buyer Agent → {String(p.vendorName || p.vendorId)} (Round {String(p.round)})
                          </span>
                        </div>
                        <span className="text-xs font-mono-token text-[#9AAAC0]">
                          Utility: {typeof p.utilityScore === "number" ? p.utilityScore.toFixed(3) : "N/A"}
                        </span>
                      </div>
                      <p className="text-sm text-[#F3F6FC] leading-relaxed italic">
                        &ldquo;{String(p.message)}&rdquo;
                      </p>
                      {Boolean(p.proposedOffer && typeof p.proposedOffer === "object") ? (
                        <div className="pt-2 flex items-center gap-4 text-xs text-[#9AAAC0] border-t border-[#23354B]/40 font-medium">
                          <span>Unit Bid: ${(p.proposedOffer as { unitPrice?: number }).unitPrice}</span>
                          <span>Delivery: ${(p.proposedOffer as { deliveryDays?: number }).deliveryDays}d</span>
                          <span>Return: ${(p.proposedOffer as { returnDays?: number }).returnDays}d</span>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                // 2. GUARDRAIL INTERVENTION / BLOCKED (Prominent amber alert)
                if (ev.type === "GUARDRAIL_INTERVENTION" || ev.type === "GUARDRAIL_BLOCKED") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-2xl p-5 bg-[#F59E0B]/10 border border-[#F59E0B]/40 space-y-3 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[#F59E0B]">
                          <ShieldAlert className="w-5 h-5 shrink-0" />
                          <span className="font-bold text-xs tracking-wide uppercase">
                            Mechanism-Design Firewall Intercepted Proposal
                          </span>
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EF4444] text-white">
                          BLOCKED
                        </span>
                      </div>
                      <div className="text-xs text-[#F3F6FC] leading-relaxed">
                        <strong className="text-[#F59E0B]">Mathematical Reason:</strong>{" "}
                        {String(p.reason || p.detail || "Predicate constraint violation")}
                      </div>
                      <p className="text-xs text-[#9AAAC0] leading-relaxed">
                        The proposal was purged and never transmitted to the vendor. Gemini was ordered to regenerate under tightened Boulware threshold constraints.
                      </p>
                    </div>
                  );
                }

                // 3. VENDOR COUNTEROFFER (Neutral surface)
                if (ev.type === "VENDOR_COUNTEROFFER") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-2xl p-5 bg-[#07111F]/70 border border-[#23354B]/60 space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-[#23354B] text-[#F3F6FC] font-bold text-xs flex items-center justify-center">
                            V
                          </span>
                          <span className="font-semibold text-xs text-[#F3F6FC]">
                            {String(p.vendorName || p.vendorId)} Counteroffer
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-[#22C55E]">
                          New Ask: ${String(p.newUnitAsk)}
                        </span>
                      </div>
                      {Boolean(p.turn && typeof p.turn === "object") ? (
                        <p className="text-xs text-[#9AAAC0] leading-relaxed italic">
                          &ldquo;{String((p.turn as { message?: string }).message)}&rdquo;
                        </p>
                      ) : null}
                    </div>
                  );
                }

                // 4. ROUND COMPLETED
                if (ev.type === "ROUND_COMPLETED") {
                  return (
                    <div
                      key={ev.id}
                      className="py-2 px-4 rounded-xl bg-[#132438]/50 border border-[#23354B]/40 text-xs text-[#9AAAC0] flex items-center justify-between"
                    >
                      <span>Round {String(p.round)} committed to Flight Recorder</span>
                      <span className="font-mono-token text-[#5B9CFF]">
                        {String(p.merkleRoot).slice(0, 16)}...
                      </span>
                    </div>
                  );
                }

                // 5. NEGOTIATION COMPLETED (Verified Green)
                if (ev.type === "NEGOTIATION_COMPLETED") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-2xl p-5 bg-[#22C55E]/10 border border-[#22C55E]/40 space-y-2 transition-all"
                    >
                      <div className="flex items-center gap-2 text-[#22C55E]">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span className="font-bold text-xs tracking-wide uppercase">
                          Agreement Reached &amp; Flight Recorder Committed
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-[#F3F6FC]">
                        Selected Vendor: {String(p.selectedVendor)} • Total Landed: ${String(p.totalCost)}
                      </div>
                      <div className="text-xs text-[#22C55E]">
                        Negotiated Savings vs Baseline: ${String(p.savings)}
                      </div>
                    </div>
                  );
                }

                return null;
              })
            )}
            <div ref={feedEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
