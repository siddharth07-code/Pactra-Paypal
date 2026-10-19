"use client";

import React, { useRef, useEffect } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Lock,
  ArrowRight,
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
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Screen Header */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold tracking-tight text-[#F1F5F9]">Negotiation Arena</h1>
            {isStreaming && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#4597FF]/10 text-[#4597FF] border border-[#4597FF]/30 text-xs font-mono animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4597FF]" />
                STREAMING SSE
              </span>
            )}
            {completed && <StatusBadge status="verified" label="Negotiation Completed" size="sm" />}
            {failed && <StatusBadge status="failure" label="Negotiation Halted" size="sm" />}
          </div>
          <div className="text-xs text-[#94A3B8] flex flex-wrap items-center gap-3">
            <span>
              Session: <span className="font-mono text-[#F1F5F9]">{sessionId || "Pending"}</span>
            </span>
            <span>•</span>
            <span>
              Target: <span className="text-[#F1F5F9]">{mandate?.itemQuery || "4K Monitors"}</span> (
              {mandate?.quantity || 25} units)
            </span>
            <span>•</span>
            <span>
              Budget:{" "}
              <CurrencyDisplay
                amount={mandate?.maxTotalBudget || 8500}
                currency={mandate?.currency || "USD"}
                size="sm"
              />
            </span>
            <span>•</span>
            <span className="font-mono text-[#B58CDB]">Round {currentRound} / 4</span>
          </div>
        </div>

        {completed && onProceedToSettlement && (
          <button
            onClick={onProceedToSettlement}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#22C55E] hover:bg-[#22C55E]/90 text-white text-sm font-semibold transition-all shadow-md shadow-[#22C55E]/20"
          >
            <span>Proceed to Settlement Gate</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Competing Vendors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quotes.map((quote) => {
          const landedCost =
            quote.currentUnitBid * (mandate?.quantity || 25) + quote.shippingCost;
          const isFeasible = landedCost <= (mandate?.maxTotalBudget || 8500);

          return (
            <div
              key={quote.vendorId}
              className={`bg-[#0B1728] border rounded-xl p-5 transition-all ${
                isFeasible
                  ? "border-[#203149] hover:border-[#4597FF]/40"
                  : "border-[#EF4444]/30 bg-[#EF4444]/5"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#4597FF]" />
                  <span className="font-semibold text-sm text-[#F1F5F9]">{quote.vendorName}</span>
                </div>
                <StatusBadge
                  status={isFeasible ? "verified" : "warning"}
                  label={isFeasible ? "Feasible" : "Over Budget"}
                  size="sm"
                />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-[#94A3B8]">
                  <span>Current Bid / Unit</span>
                  <CurrencyDisplay
                    amount={quote.currentUnitBid}
                    currency={mandate?.currency || "USD"}
                    size="sm"
                  />
                </div>
                <div className="flex items-center justify-between text-[#94A3B8]">
                  <span>Shipping Cost</span>
                  <CurrencyDisplay
                    amount={quote.shippingCost}
                    currency={mandate?.currency || "USD"}
                    size="sm"
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#203149] font-medium">
                  <span className="text-[#F1F5F9]">Landed Total</span>
                  <CurrencyDisplay
                    amount={landedCost}
                    currency={mandate?.currency || "USD"}
                    size="md"
                  />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#203149] flex items-center justify-between text-[11px] text-[#64748B]">
                <span>SLA: {quote.deliveryDays}d delivery</span>
                <span>Return: {quote.returnDays}d policy</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Real-Time Negotiation Feed */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl overflow-hidden flex flex-col h-[520px]">
        <div className="px-6 py-4 border-b border-[#203149] flex items-center justify-between bg-[#101F33]/40">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#4597FF]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
              Mechanism-Design Flight Recorder
            </h2>
          </div>
          <div className="text-xs font-mono text-[#64748B] flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" />
            <span>PactumPay Predicates A-E Interception</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans text-sm">
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#64748B] space-y-2">
              <span className="text-sm">Negotiation stream waiting to connect...</span>
              <span className="text-xs text-[#64748B]">
                Outgoing buyer proposals will be intercepted and verified deterministically.
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
                    className="flex gap-3 bg-[#101F33]/70 border border-[#4597FF]/30 rounded-xl p-4 text-xs"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#4597FF]/10 text-[#4597FF] flex items-center justify-center shrink-0 border border-[#4597FF]/30 font-bold">
                      B
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#4597FF]">
                          Gemini Buyer Agent → {String(p.vendorName || p.vendorId)} (Round {String(p.round)})
                        </span>
                        <span className="text-[10px] font-mono text-[#64748B]">
                          Utility: {typeof p.utilityScore === "number" ? p.utilityScore.toFixed(3) : "N/A"}
                        </span>
                      </div>
                      <p className="text-[#F1F5F9] italic">&ldquo;{String(p.message)}&rdquo;</p>
                      {Boolean(p.proposedOffer && typeof p.proposedOffer === "object") ? (
                        <div className="pt-2 flex items-center gap-3 text-[11px] font-mono text-[#94A3B8]">
                          <span>
                            Unit Bid: ${(p.proposedOffer as { unitPrice?: number }).unitPrice}
                          </span>
                          <span>
                            Delivery: ${(p.proposedOffer as { deliveryDays?: number }).deliveryDays}d
                          </span>
                          <span>
                            Return: ${(p.proposedOffer as { returnDays?: number }).returnDays}d
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }

              // 2. GUARDRAIL INTERVENTION / BLOCKED (Signature demo moment)
              if (ev.type === "GUARDRAIL_INTERVENTION" || ev.type === "GUARDRAIL_BLOCKED") {
                return (
                  <div
                    key={ev.id}
                    className="flex gap-3 bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-xl p-4 text-xs fintech-glow-warning"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/20 text-[#F59E0B] flex items-center justify-center shrink-0 border border-[#F59E0B]/40">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#F59E0B] uppercase tracking-wider flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Mechanism-Design Firewall Intercepted Proposal (BLOCKED)
                        </span>
                        <span className="font-mono text-[10px] text-[#F59E0B] bg-[#F59E0B]/20 px-2 py-0.5 rounded">
                          REJECTED BEFORE TRANSMISSION
                        </span>
                      </div>
                      <div className="text-[#F1F5F9]">
                        <span className="font-semibold text-[#F59E0B]">Mathematical Reason:</span>{" "}
                        {String(p.reason || p.detail || "Predicate constraint violation")}
                      </div>
                      <div className="text-[11px] text-[#94A3B8]">
                        The proposal was scrubbed and Gemini was instructed to regenerate under tighter Boulware thresholds.
                      </div>
                    </div>
                  </div>
                );
              }

              // 3. VENDOR COUNTEROFFER
              if (ev.type === "VENDOR_COUNTEROFFER") {
                return (
                  <div
                    key={ev.id}
                    className="flex gap-3 bg-[#101F33]/40 border border-[#203149] rounded-xl p-4 text-xs"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#203149] text-[#F1F5F9] flex items-center justify-center shrink-0 border border-[#203149] font-bold">
                      V
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#F1F5F9]">
                          {String(p.vendorName || p.vendorId)} Counteroffer
                        </span>
                        <span className="font-mono text-[#22C55E]">
                          New Ask: ${String(p.newUnitAsk)}
                        </span>
                      </div>
                      {Boolean(p.turn && typeof p.turn === "object") ? (
                        <p className="text-[#94A3B8] italic">
                          &ldquo;{String((p.turn as { message?: string }).message)}&rdquo;
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              }

              // 4. ROUND COMPLETED
              if (ev.type === "ROUND_COMPLETED") {
                return (
                  <div
                    key={ev.id}
                    className="py-1 px-3 rounded bg-[#030B18] border border-[#203149] text-[11px] font-mono text-[#64748B] flex items-center justify-between"
                  >
                    <span>Round {String(p.round)} Committed to Merkle Flight Recorder</span>
                    <span className="text-[#4597FF]">Root: {String(p.merkleRoot).slice(0, 16)}...</span>
                  </div>
                );
              }

              // 5. NEGOTIATION COMPLETED
              if (ev.type === "NEGOTIATION_COMPLETED") {
                return (
                  <div
                    key={ev.id}
                    className="flex gap-3 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl p-4 text-xs fintech-glow-verified"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#22C55E]/20 text-[#22C55E] flex items-center justify-center shrink-0 border border-[#22C55E]/40">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="font-bold text-[#22C55E] uppercase tracking-wider">
                        Pareto-Optimal Agreement Reached
                      </div>
                      <div className="text-[#F1F5F9]">
                        Selected Vendor: <span className="font-semibold">{String(p.selectedVendor)}</span> | Total Landed: ${String(p.totalCost)} | Negotiated Savings: ${String(p.savings)}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={ev.id}
                  className="py-1 text-xs font-mono text-[#64748B] border-b border-[#203149]/40"
                >
                  [{ev.type}] {JSON.stringify(ev.payload)}
                </div>
              );
            })
          )}
          <div ref={feedEndRef} />
        </div>
      </div>
    </div>
  );
}
