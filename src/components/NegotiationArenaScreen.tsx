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

  // Auto-scroll ONLY inside the feed container without moving the global viewport
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
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Header Card: Institutional Control Panel */}
      <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-6 border border-smoke dark:border-[#2b2b32] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs transition-colors">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-obsidian dark:text-[#f6f4f0]">
              Negotiation Arena
            </h1>
            {isStreaming && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[#fff7ed] dark:bg-[#2b1708] text-[#c2410c] dark:text-[#fb923c] text-[12px] font-medium border border-ember-orange/30">
                <span className="w-1.5 h-1.5 rounded-full bg-ember-orange animate-pulse" />
                Live Turn
              </span>
            )}
            {completed && <StatusBadge status="verified" label="Negotiation Completed" />}
            {failed && <StatusBadge status="failure" label="Negotiation Halted" />}
          </div>

          <div className="text-[13px] text-[#6e6e78] dark:text-[#8e8a83] flex flex-wrap items-center gap-2">
            <span>
              Session: <span className="font-mono-token text-obsidian dark:text-[#f6f4f0]">{sessionId || "Pending"}</span>
            </span>
            <span>•</span>
            <span>
              Target: <strong className="font-medium text-obsidian dark:text-[#f6f4f0]">{mandate?.itemQuery || "4K Monitors"}</strong> (
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
            <span className="text-architect-violet dark:text-[#a78bfa] font-medium">Round {currentRound} of 4</span>
          </div>
        </div>

        {completed && onProceedToSettlement && (
          <PrimaryButton onClick={onProceedToSettlement}>
            Proceed to Settlement Gate
          </PrimaryButton>
        )}
      </div>

      {/* 2. Arena Split View: Vendor Panels on Left, Activity Feed on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Vendor Panels */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between pb-1">
            <div>
              <h2 className="text-[16px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                Competing Supplier Terms
              </h2>
              <span className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                Channel3 Multi-Vendor Simulation
              </span>
            </div>
            <span className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
              {quotes.length} vendors active
            </span>
          </div>

          <div className="space-y-3">
            {quotes.map((quote) => {
              const landedCost =
                quote.currentUnitBid * (mandate?.quantity || 25) + quote.shippingCost;
              const isFeasible = landedCost <= (mandate?.maxTotalBudget || 8500);

              return (
                <div
                  key={quote.vendorId}
                  className={`bg-paper-white dark:bg-[#18181b] rounded-cards p-5 border transition-colors shadow-2xs ${
                    isFeasible
                      ? "border-smoke dark:border-[#2b2b32]"
                      : "border-[#ef4444]/35 bg-[#fef2f2]/40 dark:bg-[#2b1012]/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-[6px] bg-warm-cream dark:bg-[#202025] flex items-center justify-center text-architect-violet dark:text-[#a78bfa]">
                        <Building2 className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                          {quote.vendorName}
                        </div>
                        <div className="text-[11px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                          {quote.sku}
                        </div>
                      </div>
                    </div>
                    <StatusBadge
                      status={isFeasible ? "verified" : "warning"}
                      label={isFeasible ? "Feasible" : "Over Budget"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-3 border-y border-smoke/80 dark:border-[#2b2b32] text-[13px]">
                    <div>
                      <span className="text-[#6e6e78] dark:text-[#8e8a83] block text-[11.5px] mb-0.5">
                        Current Unit Bid
                      </span>
                      <CurrencyDisplay
                        amount={quote.currentUnitBid}
                        currency={mandate?.currency || "USD"}
                        size="md"
                      />
                    </div>
                    <div>
                      <span className="text-[#6e6e78] dark:text-[#8e8a83] block text-[11.5px] mb-0.5">
                        Landed Total
                      </span>
                      <div className="text-architect-violet dark:text-[#a78bfa] font-medium">
                        <CurrencyDisplay
                          amount={landedCost}
                          currency={mandate?.currency || "USD"}
                          size="md"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-obsidian dark:text-white" aria-hidden="true" />
                      {quote.deliveryDays}d delivery
                    </span>
                    <span className="flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5 text-obsidian dark:text-white" aria-hidden="true" />
                      {quote.returnDays}d return window
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Negotiation Timeline Feed */}
        <div className="lg:col-span-7 bg-paper-white dark:bg-[#18181b] rounded-cards border border-smoke dark:border-[#2b2b32] flex flex-col h-[640px] overflow-hidden shadow-2xs transition-colors">
          <div className="px-5 py-3.5 border-b border-smoke/80 dark:border-[#2b2b32] flex items-center justify-between bg-warm-cream/30 dark:bg-[#151518]">
            <div>
              <h2 className="text-[15px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                Negotiation Execution Feed
              </h2>
              <p className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                Mechanism-design firewall intercepting and verifying outgoing proposals
              </p>
            </div>
            <span className="text-[11px] font-medium text-[#006840] dark:text-[#4ade80] bg-mint-whisper dark:bg-[#10211a] px-2.5 py-0.5 rounded-[4px] flex items-center gap-1 border border-lichen-green/25 shrink-0">
              <Lock className="w-3 h-3" aria-hidden="true" />
              <span>Predicates A–E Active</span>
            </span>
          </div>

          {/* Feed Content Container with isolated scroll */}
          <div
            ref={feedContainerRef}
            className="flex-1 overflow-y-auto p-5 space-y-3 text-[14px]"
            tabIndex={0}
            aria-label="Negotiation stream event log"
          >
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#8e8a83] space-y-2 p-6">
                <Sparkles className="w-7 h-7 text-ember-orange mb-1 opacity-70" aria-hidden="true" />
                <span className="text-[15px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                  Arena Waiting for Initial Requisition...
                </span>
                <span className="text-[13px] text-[#6e6e78] dark:text-[#8e8a83] max-w-xs text-center leading-relaxed">
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
                      className="rounded-[8px] p-4 bg-paper-white dark:bg-[#1c1c20] border border-architect-violet/25 dark:border-architect-violet/35 space-y-2 shadow-2xs transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-[4px] bg-lavender-mist dark:bg-[#271f33] text-architect-violet dark:text-[#a78bfa] font-bold text-[11px] flex items-center justify-center">
                            B
                          </span>
                          <span className="font-semibold text-[13.5px] text-architect-violet dark:text-[#a78bfa]">
                            Gemini Buyer Agent → {String(p.vendorName || p.vendorId)} (Round {String(p.round)})
                          </span>
                        </div>
                        <span className="text-[11.5px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                          Utility: {typeof p.utilityScore === "number" ? p.utilityScore.toFixed(3) : "N/A"}
                        </span>
                      </div>
                      <p className="text-[13.5px] text-obsidian dark:text-[#f6f4f0] leading-relaxed italic">
                        &ldquo;{String(p.message)}&rdquo;
                      </p>
                      {Boolean(p.proposedOffer && typeof p.proposedOffer === "object") ? (
                        <div className="pt-2 flex flex-wrap items-center gap-3 text-[12px] text-[#6e6e78] dark:text-[#8e8a83] border-t border-smoke/70 dark:border-[#27272d] tabular-nums">
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
                      className="rounded-[8px] p-4 bg-[#fff7ed] dark:bg-[#2a1708] border border-ember-orange/30 space-y-2 shadow-2xs transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-ember-orange">
                          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="font-semibold text-[13.5px] tracking-tight">
                            Mechanism-Design Firewall Intercepted Proposal
                          </span>
                        </div>
                        <span className="text-[11px] font-mono-token font-medium px-2 py-0.5 rounded-[4px] bg-ember-orange text-white uppercase">
                          BLOCKED
                        </span>
                      </div>
                      <div className="text-[13px] text-obsidian dark:text-[#f6f4f0] leading-relaxed">
                        <strong className="text-ember-orange font-medium">Mathematical Reason:</strong>{" "}
                        {String(p.reason || p.detail || "Predicate constraint violation")}
                      </div>
                      <p className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed">
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
                      className="rounded-[8px] p-4 bg-paper-white dark:bg-[#1c1c20] border border-smoke dark:border-[#2b2b32] space-y-2 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-[4px] bg-warm-cream dark:bg-[#27272d] text-obsidian dark:text-white font-bold text-[11px] flex items-center justify-center">
                            V
                          </span>
                          <span className="font-semibold text-[13.5px] text-obsidian dark:text-[#f6f4f0]">
                            {String(p.vendorName || p.vendorId)} Counteroffer
                          </span>
                        </div>
                        <span className="text-[13.5px] font-semibold text-[#006840] dark:text-[#4ade80] tabular-nums">
                          New Ask: ${String(p.newUnitAsk)}
                        </span>
                      </div>
                      {Boolean(p.turn && typeof p.turn === "object") ? (
                        <p className="text-[13px] text-[#4a4a52] dark:text-[#b8b5af] leading-relaxed italic">
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
                      className="py-2 px-3.5 rounded-[6px] bg-warm-cream/40 dark:bg-[#161619] border border-smoke/70 dark:border-[#25252b] text-[12px] text-[#6e6e78] dark:text-[#8e8a83] flex items-center justify-between"
                    >
                      <span>Round {String(p.round)} committed to Merkle Flight Recorder</span>
                      <span className="font-mono-token text-architect-violet dark:text-[#a78bfa]">
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
                      className="rounded-[8px] p-4 bg-mint-whisper dark:bg-[#10211a] border border-lichen-green/30 space-y-2.5 transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-2 text-[#006840] dark:text-[#4ade80]">
                        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="font-semibold text-[14px]">
                          Consensus Reached with {String(p.winningVendor || "Selected Supplier")}
                        </span>
                      </div>
                      <div className="text-[13px] text-[#4a4a52] dark:text-[#b8b5af] leading-relaxed">
                        Landed Cost:{" "}
                        <strong className="text-obsidian dark:text-white tabular-nums">
                          ${String(p.finalTotalCost || p.finalAmount)}
                        </strong>{" "}
                        (Net Savings:{" "}
                        <span className="text-[#006840] dark:text-[#4ade80] font-medium tabular-nums">
                          ${String(p.savingsAmount || 0)}
                        </span>
                        )
                      </div>
                      {onProceedToSettlement && (
                        <div className="pt-1">
                          <PrimaryButton onClick={onProceedToSettlement} className="w-full sm:w-auto">
                            Proceed to Settlement Gate
                          </PrimaryButton>
                        </div>
                      )}
                    </div>
                  );
                }

                // Fallback for general events
                return (
                  <div
                    key={ev.id}
                    className="py-2 px-3 rounded-[6px] bg-warm-cream/40 dark:bg-[#18181c] border border-smoke/70 dark:border-[#25252b] text-[12px] text-[#6e6e78] dark:text-[#8e8a83] flex items-center justify-between font-mono-token"
                  >
                    <span>{ev.type}</span>
                    <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
