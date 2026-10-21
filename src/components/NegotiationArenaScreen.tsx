"use client";

import React, { useRef, useEffect } from "react";
import {
  PrimaryButton,
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
  ShieldAlert,
  CheckCircle2,
  Building2,
  Lock,
  Truck,
  RotateCcw,
  Sparkles,
  ArrowRight,
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
  const feedContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ONLY inside the feed container without unexpectedly moving the entire page
  useEffect(() => {
    if (feedContainerRef.current) {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      feedContainerRef.current.scrollTo({
        top: feedContainerRef.current.scrollHeight,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    }
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
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* 1. Header Card (Warm Cream Surface) */}
      <div className="bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-8 sm:p-10 border border-smoke dark:border-[#333333] flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm transition-colors">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] sm:text-[36px] font-medium tracking-[-0.72px] text-obsidian dark:text-[#f5f3ef]">
              Negotiation Arena
            </h1>
            {isStreaming && (
              <span className="flex items-center gap-2 px-3 py-1 rounded-[24px] bg-[#fff2e6] dark:bg-[#331c0e] text-ember-orange text-[13px] font-medium border border-ember-orange/30 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-ember-orange" />
                Streaming Live Turn
              </span>
            )}
            {completed && <StatusBadge status="verified" label="Negotiation Completed" />}
            {failed && <StatusBadge status="failure" label="Negotiation Halted" />}
          </div>

          <div className="text-[14px] text-[#666666] dark:text-[#a5a19b] flex flex-wrap items-center gap-3">
            <span>
              Session: <span className="font-mono-token text-obsidian dark:text-[#f5f3ef]">{sessionId || "Pending"}</span>
            </span>
            <span>•</span>
            <span>
              Target: <strong className="text-obsidian dark:text-[#f5f3ef]">{mandate?.itemQuery || "4K Monitors"}</strong> (
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
            <span className="text-architect-violet dark:text-[#9d6ce6] font-medium">Round {currentRound} of 4</span>
          </div>
        </div>

        {completed && onProceedToSettlement && (
          <PrimaryButton onClick={onProceedToSettlement}>
            Proceed to Settlement Gate
          </PrimaryButton>
        )}
      </div>

      {/* 2. Arena Split View: Vendor Panels on Left, Activity Feed on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Vendor Panels */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-[20px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.4px]">
                Competing Supplier Terms
              </h2>
              <span className="text-[12px] text-[#888888] dark:text-[#777777]">
                Channel3 Multi-Vendor Simulation
              </span>
            </div>
            <span className="text-[13px] text-[#666666] dark:text-[#a5a19b]">{quotes.length} vendors in arena</span>
          </div>

          <div className="space-y-4">
            {quotes.map((quote) => {
              const landedCost =
                quote.currentUnitBid * (mandate?.quantity || 25) + quote.shippingCost;
              const isFeasible = landedCost <= (mandate?.maxTotalBudget || 8500);

              return (
                <div
                  key={quote.vendorId}
                  className={`bg-paper-white dark:bg-[#1a1a1a] rounded-cards p-6 sm:p-7 border transition-all shadow-sm ${
                    isFeasible
                      ? "border-smoke dark:border-[#333333] hover:border-obsidian/40 dark:hover:border-white/40"
                      : "border-[#ef4444]/40 bg-[#feeef0]/20 dark:bg-[#feeef0]/10"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[8px] bg-warm-cream dark:bg-[#262626] flex items-center justify-center text-architect-violet dark:text-[#9d6ce6]">
                        <Building2 className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-[18px] font-medium text-obsidian dark:text-[#f5f3ef]">{quote.vendorName}</div>
                        <div className="text-[12px] font-mono-token text-[#666666] dark:text-[#a5a19b]">{quote.sku}</div>
                      </div>
                    </div>
                    <StatusBadge
                      status={isFeasible ? "verified" : "warning"}
                      label={isFeasible ? "Feasible" : "Over Budget"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-smoke dark:border-[#333333] text-[14px]">
                    <div>
                      <span className="text-[#666666] dark:text-[#a5a19b] block text-[12px] mb-1">Current Unit Bid</span>
                      <div className="text-[18px] font-medium text-obsidian dark:text-[#f5f3ef]">
                        <CurrencyDisplay
                          amount={quote.currentUnitBid}
                          currency={mandate?.currency || "USD"}
                          size="md"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[#666666] dark:text-[#a5a19b] block text-[12px] mb-1">Landed Total</span>
                      <div className="text-[18px] font-medium text-architect-violet dark:text-[#9d6ce6]">
                        <CurrencyDisplay
                          amount={landedCost}
                          currency={mandate?.currency || "USD"}
                          size="md"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[13px] text-[#666666] dark:text-[#a5a19b]">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-obsidian dark:text-white" aria-hidden="true" />
                      {quote.deliveryDays}d delivery
                    </span>
                    <span className="flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-obsidian dark:text-white" aria-hidden="true" />
                      {quote.returnDays}d return window
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Negotiation Timeline Feed */}
        <div className="lg:col-span-7 bg-warm-cream dark:bg-[#1a1a1a] rounded-cards border border-smoke dark:border-[#333333] flex flex-col h-[680px] overflow-hidden shadow-sm transition-colors">
          <div className="px-8 py-5 border-b border-smoke dark:border-[#333333] flex items-center justify-between bg-paper-white dark:bg-[#202020]">
            <div>
              <h2 className="text-[18px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.36px]">
                Negotiation Activity Feed
              </h2>
              <p className="text-[13px] text-[#666666] dark:text-[#a5a19b]">
                Mechanism-design firewall intercepting and verifying outgoing buyer proposals
              </p>
            </div>
            <span className="text-[12px] font-medium text-lichen-green bg-mint-whisper dark:bg-[#132820] px-3 py-1 rounded-[24px] flex items-center gap-1.5 border border-lichen-green/30 shrink-0">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Predicates A-E Active</span>
            </span>
          </div>

          {/* Feed Content Container with isolated scroll */}
          <div
            ref={feedContainerRef}
            className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-4 text-[15px]"
            tabIndex={0}
            aria-label="Negotiation stream event log"
          >
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#888888] space-y-2 p-6">
                <Sparkles className="w-8 h-8 text-ember-orange mb-2 opacity-70" aria-hidden="true" />
                <span className="text-[16px] font-medium text-obsidian dark:text-[#f5f3ef]">Arena Waiting for Initial Requisition...</span>
                <span className="text-[14px] text-[#666666] dark:text-[#a5a19b] max-w-sm text-center leading-relaxed">
                  When launched, each outgoing Gemini proposal will be mathematically evaluated and blocked if budget or Boulware rules are violated.
                </span>
              </div>
            ) : (
              events.map((ev) => {
                const p = ev.payload;

                // 1. BUYER PROPOSAL
                if (ev.type === "BUYER_PROPOSAL") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-paper-white dark:bg-[#242424] border border-architect-violet/30 dark:border-architect-violet/40 space-y-3 shadow-xs transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-[8px] bg-lavender-mist dark:bg-[#332545] text-architect-violet dark:text-[#9d6ce6] font-medium text-[13px] flex items-center justify-center">
                            B
                          </span>
                          <span className="font-medium text-[15px] text-architect-violet dark:text-[#9d6ce6]">
                            Gemini Buyer Agent → {String(p.vendorName || p.vendorId)} (Round {String(p.round)})
                          </span>
                        </div>
                        <span className="text-[12px] font-mono-token text-[#666666] dark:text-[#a5a19b]">
                          Utility: {typeof p.utilityScore === "number" ? p.utilityScore.toFixed(3) : "N/A"}
                        </span>
                      </div>
                      <p className="text-[15px] text-obsidian dark:text-[#f5f3ef] leading-relaxed italic">
                        &ldquo;{String(p.message)}&rdquo;
                      </p>
                      {Boolean(p.proposedOffer && typeof p.proposedOffer === "object") ? (
                        <div className="pt-3 flex flex-wrap items-center gap-4 text-[13px] text-[#666666] dark:text-[#a5a19b] border-t border-smoke dark:border-[#333333]">
                          <span>Bid: ${(p.proposedOffer as { unitPrice?: number }).unitPrice}</span>
                          <span>•</span>
                          <span>Delivery: {(p.proposedOffer as { deliveryDays?: number }).deliveryDays}d</span>
                          <span>•</span>
                          <span>Return: {(p.proposedOffer as { returnDays?: number }).returnDays}d</span>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                // 2. GUARDRAIL INTERVENTION / BLOCKED
                if (ev.type === "GUARDRAIL_INTERVENTION" || ev.type === "GUARDRAIL_BLOCKED") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-[#fff2e6] dark:bg-[#331c0e] border border-ember-orange/40 space-y-3 shadow-xs transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 text-ember-orange">
                          <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
                          <span className="font-medium text-[15px] tracking-tight">
                            Mechanism-Design Firewall Intercepted Proposal
                          </span>
                        </div>
                        <span className="text-[12px] font-medium px-3 py-0.5 rounded-[24px] bg-ember-orange text-white">
                          BLOCKED
                        </span>
                      </div>
                      <div className="text-[14px] text-obsidian dark:text-[#f5f3ef] leading-relaxed">
                        <strong className="text-ember-orange font-medium">Mathematical Reason:</strong>{" "}
                        {String(p.reason || p.detail || "Predicate constraint violation")}
                      </div>
                      <p className="text-[13px] text-[#666666] dark:text-[#c4c0ba] leading-relaxed">
                        The proposal was purged and never transmitted to the supplier. Gemini was instructed to regenerate under compliant constraints.
                      </p>
                    </div>
                  );
                }

                // 3. VENDOR COUNTEROFFER
                if (ev.type === "VENDOR_COUNTEROFFER") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-paper-white dark:bg-[#242424] border border-smoke dark:border-[#333333] space-y-2.5 transition-colors shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-[8px] bg-warm-cream dark:bg-[#333333] text-obsidian dark:text-white font-medium text-[13px] flex items-center justify-center">
                            V
                          </span>
                          <span className="font-medium text-[15px] text-obsidian dark:text-[#f5f3ef]">
                            {String(p.vendorName || p.vendorId)} Counteroffer
                          </span>
                        </div>
                        <span className="text-[14px] font-medium text-lichen-green">
                          New Ask: ${String(p.newUnitAsk)}
                        </span>
                      </div>
                      {Boolean(p.turn && typeof p.turn === "object") ? (
                        <p className="text-[14px] text-[#666666] dark:text-[#c4c0ba] leading-relaxed italic">
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
                      className="py-2.5 px-4 rounded-[12px] bg-paper-white dark:bg-[#222222] border border-smoke dark:border-[#333333] text-[13px] text-[#666666] dark:text-[#a5a19b] flex items-center justify-between"
                    >
                      <span>Round {String(p.round)} committed to Merkle Flight Recorder</span>
                      <span className="font-mono-token text-architect-violet dark:text-[#9d6ce6]">
                        {String(p.merkleRoot).slice(0, 16)}...
                      </span>
                    </div>
                  );
                }

                // 5. NEGOTIATION COMPLETED
                if (ev.type === "NEGOTIATION_COMPLETED") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-mint-whisper dark:bg-[#132c22] border border-lichen-green/40 space-y-3 transition-colors shadow-sm"
                    >
                      <div className="flex items-center gap-2 text-lichen-green">
                        <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <span className="font-medium text-[16px]">
                          Agreement Reached &amp; Merkle Root Committed
                        </span>
                      </div>
                      <div className="text-[15px] font-medium text-obsidian dark:text-[#f5f3ef]">
                        Selected Supplier: {String(p.selectedVendor)} • Total Landed: ${String(p.totalCost)}
                      </div>
                      <div className="text-[13px] text-lichen-green font-medium">
                        Negotiated Savings vs Baseline: ${String(p.savings)}
                      </div>

                      {onProceedToSettlement && (
                        <div className="pt-2">
                          <PrimaryButton onClick={onProceedToSettlement} className="w-full sm:w-auto">
                            Proceed to Settlement Gate
                          </PrimaryButton>
                        </div>
                      )}
                    </div>
                  );
                }

                return null;
              })
            )}
          </div>

          {/* Sticky bottom continuation bar when negotiation is completed */}
          {completed && onProceedToSettlement && (
            <div className="p-4 bg-paper-white dark:bg-[#202020] border-t border-smoke dark:border-[#333333] flex items-center justify-between gap-4">
              <span className="text-[13px] text-[#666666] dark:text-[#a5a19b]">
                Negotiation agreement locked. Ready to run independent ACWORLD audit.
              </span>
              <button
                type="button"
                onClick={onProceedToSettlement}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-buttons bg-ember-orange text-white text-[14px] font-medium hover:bg-[#e65c00] transition-colors cursor-pointer shrink-0 shadow-sm"
              >
                <span>Settlement Gate</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
