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
    <div className="space-y-12 animate-in fade-in duration-300">
      {/* 1. Header Card (Warm Cream Surface, #f6f3ee, 24px radius, 40px padding) */}
      <div className="bg-[#f6f3ee] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)]">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-[32px] sm:text-[36px] font-medium tracking-[-0.72px] text-[#000000]">
              Negotiation Arena
            </h1>
            {isStreaming && (
              <span className="flex items-center gap-2 px-3 py-1 rounded-[24px] bg-[#fff2e6] text-[#ff6600] text-[13px] font-medium border border-[#ff6600]/30 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-[#ff6600]" />
                Streaming Live Turn
              </span>
            )}
            {completed && <StatusBadge status="verified" label="Negotiation Completed" />}
            {failed && <StatusBadge status="failure" label="Negotiation Halted" />}
          </div>

          <div className="text-[14px] text-[#888888] flex flex-wrap items-center gap-3">
            <span>
              Session: <span className="font-mono-token text-[#000000]">{sessionId || "Pending"}</span>
            </span>
            <span>•</span>
            <span>
              Target: <strong className="text-[#000000]">{mandate?.itemQuery || "4K Monitors"}</strong> (
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
            <span className="text-[#5c2999] font-medium">Round {currentRound} of 4</span>
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
            <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
              Competing Supplier Terms
            </h2>
            <span className="text-[14px] text-[#888888]">{quotes.length} vendors in arena</span>
          </div>

          <div className="space-y-4">
            {quotes.map((quote) => {
              const landedCost =
                quote.currentUnitBid * (mandate?.quantity || 25) + quote.shippingCost;
              const isFeasible = landedCost <= (mandate?.maxTotalBudget || 8500);

              return (
                <div
                  key={quote.vendorId}
                  className={`bg-[#ffffff] rounded-[24px] p-6 sm:p-7 border transition-all shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] ${
                    isFeasible
                      ? "border-[#e5e5e5] hover:border-[#000000]"
                      : "border-[#ef4444]/40 bg-[#feeef0]/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[8px] bg-[#f6f3ee] flex items-center justify-center text-[#5c2999]">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[18px] font-medium text-[#000000]">{quote.vendorName}</div>
                        <div className="text-[12px] font-mono-token text-[#888888]">{quote.sku}</div>
                      </div>
                    </div>
                    <StatusBadge
                      status={isFeasible ? "verified" : "warning"}
                      label={isFeasible ? "Feasible" : "Over Budget"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-[#e5e5e5] text-[14px]">
                    <div>
                      <span className="text-[#888888] block text-[12px] mb-1">Current Unit Bid</span>
                      <div className="text-[18px] font-medium text-[#000000]">
                        <CurrencyDisplay
                          amount={quote.currentUnitBid}
                          currency={mandate?.currency || "USD"}
                          size="md"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[#888888] block text-[12px] mb-1">Landed Total</span>
                      <div className="text-[18px] font-medium text-[#5c2999]">
                        <CurrencyDisplay
                          amount={landedCost}
                          currency={mandate?.currency || "USD"}
                          size="md"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[14px] text-[#888888]">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-[#000000]" />
                      {quote.deliveryDays}d delivery
                    </span>
                    <span className="flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-[#000000]" />
                      {quote.returnDays}d return window
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Negotiation Timeline Feed */}
        <div className="lg:col-span-7 bg-[#f6f3ee] rounded-[24px] border border-[#e5e5e5] flex flex-col h-[680px] overflow-hidden">
          <div className="px-8 py-6 border-b border-[#e5e5e5] flex items-center justify-between bg-[#ffffff]">
            <div>
              <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
                Negotiation Activity Feed
              </h2>
              <p className="text-[14px] text-[#888888] mt-0.5">
                Mechanism-design firewall intercepting and verifying outgoing buyer proposals
              </p>
            </div>
            <span className="text-[12px] font-medium text-[#00cc88] bg-[#ebfef6] px-3 py-1 rounded-[24px] flex items-center gap-1.5 border border-[#00cc88]/30">
              <Lock className="w-3.5 h-3.5" />
              <span>Predicates A-E Active</span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-5 text-[15px]">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#888888] space-y-2">
                <span className="text-[16px] font-medium text-[#000000]">Arena Waiting for Initial Requisition...</span>
                <span className="text-[14px] text-[#888888] max-w-sm text-center leading-relaxed">
                  When launched, each outgoing Gemini proposal will be mathematically evaluated and blocked if budget or Boulware rules are violated.
                </span>
              </div>
            ) : (
              events.map((ev) => {
                const p = ev.payload;

                // 1. BUYER PROPOSAL (Lavender panel with violet accent)
                if (ev.type === "BUYER_PROPOSAL") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-[#ffffff] border border-[#5c2999]/30 space-y-3 shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-[8px] bg-[#f6f1fe] text-[#5c2999] font-medium text-[13px] flex items-center justify-center">
                            B
                          </span>
                          <span className="font-medium text-[15px] text-[#5c2999]">
                            Gemini Buyer Agent → {String(p.vendorName || p.vendorId)} (Round {String(p.round)})
                          </span>
                        </div>
                        <span className="text-[12px] font-mono-token text-[#888888]">
                          Utility: {typeof p.utilityScore === "number" ? p.utilityScore.toFixed(3) : "N/A"}
                        </span>
                      </div>
                      <p className="text-[15px] text-[#000000] leading-relaxed italic">
                        &ldquo;{String(p.message)}&rdquo;
                      </p>
                      {Boolean(p.proposedOffer && typeof p.proposedOffer === "object") ? (
                        <div className="pt-3 flex items-center gap-4 text-[13px] text-[#888888] border-t border-[#e5e5e5]">
                          <span>Bid: ${(p.proposedOffer as { unitPrice?: number }).unitPrice}</span>
                          <span>•</span>
                          <span>Delivery: ${(p.proposedOffer as { deliveryDays?: number }).deliveryDays}d</span>
                          <span>•</span>
                          <span>Return: ${(p.proposedOffer as { returnDays?: number }).returnDays}d</span>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                // 2. GUARDRAIL INTERVENTION / BLOCKED (Prominent Amber Warning with explicit BLOCKED pill)
                if (ev.type === "GUARDRAIL_INTERVENTION" || ev.type === "GUARDRAIL_BLOCKED") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-[#fff2e6] border border-[#ff6600]/40 space-y-3 shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 text-[#ff6600]">
                          <ShieldAlert className="w-5 h-5 shrink-0" />
                          <span className="font-medium text-[15px] tracking-tight">
                            Mechanism-Design Firewall Intercepted Proposal
                          </span>
                        </div>
                        <span className="text-[12px] font-medium px-3 py-0.5 rounded-[24px] bg-[#ff6600] text-[#ffffff]">
                          BLOCKED
                        </span>
                      </div>
                      <div className="text-[14px] text-[#000000] leading-relaxed">
                        <strong className="text-[#ff6600] font-medium">Mathematical Reason:</strong>{" "}
                        {String(p.reason || p.detail || "Predicate constraint violation")}
                      </div>
                      <p className="text-[13px] text-[#888888] leading-relaxed">
                        The proposal was purged and never transmitted to the supplier. Gemini was instructed to regenerate under compliant constraints.
                      </p>
                    </div>
                  );
                }

                // 3. VENDOR COUNTEROFFER (Warm Cream Panel)
                if (ev.type === "VENDOR_COUNTEROFFER") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-[#ffffff] border border-[#e5e5e5] space-y-2.5 transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-[8px] bg-[#f6f3ee] text-[#000000] font-medium text-[13px] flex items-center justify-center">
                            V
                          </span>
                          <span className="font-medium text-[15px] text-[#000000]">
                            {String(p.vendorName || p.vendorId)} Counteroffer
                          </span>
                        </div>
                        <span className="text-[14px] font-medium text-[#00cc88]">
                          New Ask: ${String(p.newUnitAsk)}
                        </span>
                      </div>
                      {Boolean(p.turn && typeof p.turn === "object") ? (
                        <p className="text-[14px] text-[#888888] leading-relaxed italic">
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
                      className="py-2.5 px-4 rounded-[12px] bg-[#ffffff] border border-[#e5e5e5] text-[13px] text-[#888888] flex items-center justify-between"
                    >
                      <span>Round {String(p.round)} committed to Merkle Flight Recorder</span>
                      <span className="font-mono-token text-[#5c2999]">
                        {String(p.merkleRoot).slice(0, 16)}...
                      </span>
                    </div>
                  );
                }

                // 5. NEGOTIATION COMPLETED (Mint Whisper panel with Lichen Green accent)
                if (ev.type === "NEGOTIATION_COMPLETED") {
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[20px] p-6 bg-[#ebfef6] border border-[#00cc88]/40 space-y-2 transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-2 text-[#00cc88]">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span className="font-medium text-[16px]">
                          Agreement Reached &amp; Merkle Root Committed
                        </span>
                      </div>
                      <div className="text-[15px] font-medium text-[#000000]">
                        Selected Supplier: {String(p.selectedVendor)} • Total Landed: ${String(p.totalCost)}
                      </div>
                      <div className="text-[13px] text-[#00cc88] font-medium">
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
