"use client";

import React, { useRef, useEffect, useState } from "react";
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
  ChevronDown,
  ArrowRight,
  AlertTriangle,
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
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // Auto-scroll inside feed container without shifting global window scroll
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

  const completedEvent = events.find((ev) => ev.type === "NEGOTIATION_COMPLETED");
  const failed = events.some((ev) => ev.type === "NEGOTIATION_FAILED");

  const isNoDeal = Boolean(
    completedEvent &&
    (completedEvent.payload.outcome === "NO_DEAL" ||
      (!completedEvent.payload.selectedVendor &&
        !completedEvent.payload.winningVendor &&
        !completedEvent.payload.winningVendorId))
  );

  const isConsensusDeal = Boolean(
    completedEvent &&
    completedEvent.payload.outcome !== "NO_DEAL" &&
    (completedEvent.payload.selectedVendor ||
      completedEvent.payload.winningVendor ||
      completedEvent.payload.winningVendorId)
  );

  const winningVendorId = completedEvent?.payload?.winningVendorId as string | undefined;
  const winningVendorName = (completedEvent?.payload?.selectedVendor ||
    completedEvent?.payload?.winningVendor) as string | undefined;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. EDITORIAL PAGE HEADER */}
      <div className="pb-5 border-b border-smoke dark:border-[#27272a] flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-obsidian dark:text-[#f6f4f0] leading-none">
              Negotiation Arena
            </h1>
            {isStreaming && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-ember-orange/10 dark:bg-ember-orange/15 text-ember-orange text-[11.5px] font-medium border border-ember-orange/20">
                <span className="w-1.5 h-1.5 rounded-full bg-ember-orange animate-pulse" />
                Live Turn
              </span>
            )}
            {isConsensusDeal && <StatusBadge status="verified" label="Consensus Reached" />}
            {isNoDeal && <StatusBadge status="warning" label="No Deal Reached" />}
            {failed && <StatusBadge status="failure" label="Negotiation Halted" />}
            {!isStreaming && !isConsensusDeal && !isNoDeal && !failed && (
              <StatusBadge status="neutral" label="Active Workspace" />
            )}
          </div>

          {/* Clean metadata strip with aligned labels and values */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-[#737373] dark:text-[#a3a3a3]">
            <div className="flex items-center gap-1.5">
              <span>Session:</span>
              <span className="font-mono-token text-obsidian dark:text-[#f6f4f0] text-[12px]">
                {sessionId || "Pending"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Target:</span>
              <span className="font-medium text-obsidian dark:text-[#f6f4f0]">
                {mandate?.itemQuery || "4K Monitors"} ({mandate?.quantity || 25} units)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Ceiling:</span>
              <CurrencyDisplay
                amount={mandate?.maxTotalBudget || 8500}
                currency={mandate?.currency || "USD"}
                size="sm"
              />
            </div>
            <div className="flex items-center gap-1.5 text-architect-violet dark:text-[#a78bfa] font-medium">
              <span>Round {currentRound} of 4</span>
            </div>
          </div>
        </div>

        {isConsensusDeal && onProceedToSettlement && (
          <PrimaryButton onClick={onProceedToSettlement} className="self-start md:self-auto shrink-0">
            Proceed to Settlement Gate
          </PrimaryButton>
        )}
      </div>

      {/* 2. WORKSPACE GRID: Supplier Comparison (Left) & Execution Feed (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Structured Supplier Comparison Area */}
        <section aria-label="Competing Supplier Terms" className="lg:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between pb-1 border-b border-smoke dark:border-[#27272a]">
            <div>
              <h2 className="text-[15px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                Competing Supplier Terms
              </h2>
              <p className="text-[12px] text-[#737373] dark:text-[#a3a3a3]">
                Wholesale baseline quotes &amp; live counter-bids
              </p>
            </div>
            <span className="text-[11.5px] font-mono-token text-[#737373] dark:text-[#a3a3a3]">
              {quotes.length} suppliers
            </span>
          </div>

          {/* Compact Supplier Comparison Table / List */}
          <div className="divide-y divide-smoke dark:divide-[#27272a] border border-smoke dark:border-[#27272a] rounded-[8px] bg-paper-white dark:bg-[#18181b] overflow-hidden shadow-2xs">
            {quotes.map((quote) => {
              const landedCost =
                quote.currentUnitBid * (mandate?.quantity || 25) + quote.shippingCost;
              const isFeasible = landedCost <= (mandate?.maxTotalBudget || 8500);
              const isSelected = selectedVendorId === quote.vendorId;
              const isWinner = isConsensusDeal && (winningVendorId === quote.vendorId || winningVendorName === quote.vendorName);

              return (
                <div
                  key={quote.vendorId}
                  onClick={() => setSelectedVendorId(isSelected ? null : quote.vendorId)}
                  className={`p-4 transition-colors cursor-pointer select-none border-l-2 ${
                    isWinner
                      ? "bg-smoke/25 dark:bg-[#141a16] border-l-lichen-green"
                      : isSelected
                      ? "bg-smoke/20 dark:bg-[#1f1f23] border-l-architect-violet"
                      : "hover:bg-smoke/15 dark:hover:bg-[#1c1c20] border-l-transparent"
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedVendorId(isSelected ? null : quote.vendorId);
                    }
                  }}
                  aria-label={`Inspect ${quote.vendorName} terms`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[14.5px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                          {quote.vendorName}
                        </span>
                        {isWinner && (
                          <StatusBadge status="verified" label="Winning Offer" />
                        )}
                      </div>
                      <div className="text-[11.5px] font-mono-token text-[#737373] dark:text-[#a3a3a3]">
                        {quote.sku}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-[#737373] dark:text-[#a3a3a3] uppercase tracking-wider font-sans font-medium">
                        Landed Total
                      </div>
                      <div className="text-[16px] font-semibold text-obsidian dark:text-[#f6f4f0] tabular-nums tracking-tight">
                        <CurrencyDisplay
                          amount={landedCost}
                          currency={mandate?.currency || "USD"}
                          size="md"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Aligned Financial & Logistics Metrics Row */}
                  <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-smoke dark:border-[#27272a] text-[12px]">
                    <div>
                      <span className="text-[#737373] dark:text-[#a3a3a3] block text-[11px]">Current Ask</span>
                      <span className="font-sans font-medium text-obsidian dark:text-[#f6f4f0] tabular-nums">
                        ${quote.currentUnitBid}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#737373] dark:text-[#a3a3a3] block text-[11px]">Delivery SLA</span>
                      <span className="text-obsidian dark:text-[#f6f4f0]">{quote.deliveryDays} days</span>
                    </div>
                    <div>
                      <span className="text-[#737373] dark:text-[#a3a3a3] block text-[11px]">Return Window</span>
                      <span className="text-obsidian dark:text-[#f6f4f0]">{quote.returnDays} days</span>
                    </div>
                  </div>

                  {/* Feasibility Indicator */}
                  <div className="pt-2.5 flex items-center justify-between text-[11.5px]">
                    <span className="text-[#737373] dark:text-[#a3a3a3]">
                      Shipping: ${quote.shippingCost}
                    </span>
                    <StatusBadge
                      status={isFeasible ? "verified" : "warning"}
                      label={isFeasible ? "Within Budget" : "Exceeds Ceiling"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column: Negotiation Execution Feed */}
        <section aria-label="Negotiation Execution Feed" className="lg:col-span-7 space-y-3.5">
          <div className="flex items-center justify-between pb-1 border-b border-smoke dark:border-[#27272a]">
            <div>
              <h2 className="text-[15px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                Negotiation Execution Feed
              </h2>
              <p className="text-[12px] text-[#737373] dark:text-[#a3a3a3]">
                Chronological transcript with deterministic guardrail evaluations
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono-token text-[#006840] dark:text-[#4ade80] bg-smoke/40 dark:bg-[#18181c] px-2 py-0.5 rounded border border-smoke dark:border-[#27272a] shrink-0">
              <Lock className="w-3 h-3" aria-hidden="true" />
              <span>Predicates A–E Active</span>
            </div>
          </div>

          {/* Chronological Stream Container */}
          <div
            ref={feedContainerRef}
            className="border border-smoke dark:border-[#27272a] rounded-[8px] bg-paper-white dark:bg-[#18181b] p-4 sm:p-5 h-[620px] overflow-y-auto space-y-3.5 text-[13.5px] shadow-2xs"
            tabIndex={0}
            aria-label="Negotiation timeline log"
          >
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-[#737373] dark:text-[#a3a3a3]">
                <Building2 className="w-8 h-8 text-ash-gray opacity-50 mb-1" aria-hidden="true" />
                <p className="text-[15px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                  Arena Ready
                </p>
                <p className="text-[13px] max-w-sm leading-relaxed">
                  Autonomous Gemini buyer and supplier agents will negotiate discrete rounds under Boulware decay and anti-thrashing rules.
                </p>
              </div>
            ) : (
              events.map((ev) => {
                const p = ev.payload;

                // 1. ROUND STARTED
                if (ev.type === "ROUND_STARTED") {
                  return (
                    <div
                      key={ev.id}
                      className="py-1.5 flex items-center gap-3 text-[11.5px] font-sans text-[#737373] dark:text-[#a3a3a3] select-none"
                    >
                      <span className="h-px bg-smoke dark:bg-[#27272a] flex-1" />
                      <span className="uppercase tracking-wider font-semibold text-architect-violet dark:text-[#a78bfa]">
                        Round {String(p.round)} of {String(p.maxRounds || 4)}
                      </span>
                      <span className="h-px bg-smoke dark:bg-[#27272a] flex-1" />
                    </div>
                  );
                }

                // 2. BUYER PROPOSAL
                if (ev.type === "BUYER_PROPOSAL") {
                  const proposedOffer = p.proposedOffer as { unitPrice?: number; deliveryDays?: number; returnDays?: number } | undefined;
                  const thresholdVal = typeof p.threshold === "number" ? p.threshold : undefined;

                  return (
                    <div
                      key={ev.id}
                      className="py-3 px-3.5 rounded-[6px] bg-smoke/20 dark:bg-[#141416] border-l-2 border-l-architect-violet/70 border-y border-r border-smoke dark:border-[#27272a] space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[12px]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-obsidian dark:text-[#f6f4f0]">
                            Buyer Agent (Gemini) → {String(p.vendorName || p.vendorId)}
                          </span>
                          <span className="text-[#737373] dark:text-[#a3a3a3]">
                            (Round {String(p.round)})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-sans tabular-nums font-medium text-architect-violet dark:text-[#a78bfa]">
                            Utility: {typeof p.utilityScore === "number" ? p.utilityScore.toFixed(3) : "—"}
                            {thresholdVal !== undefined && (
                              <span className="text-[11px] text-[#737373] dark:text-[#a3a3a3] font-normal ml-1">
                                (τ: {thresholdVal.toFixed(3)})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      <p className="text-[13px] text-[#4a4a52] dark:text-[#c4c0ba] leading-relaxed italic">
                        &ldquo;{String(p.message)}&rdquo;
                      </p>

                      {Boolean(proposedOffer) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1.5 border-t border-smoke/70 dark:border-[#27272a] text-[12px] font-sans tabular-nums text-[#737373] dark:text-[#a3a3a3]">
                          <span>Unit Bid: <strong className="text-obsidian dark:text-[#f6f4f0] font-semibold">${proposedOffer?.unitPrice}</strong></span>
                          <span>Delivery SLA: <strong className="text-obsidian dark:text-[#f6f4f0] font-semibold">{proposedOffer?.deliveryDays}d</strong></span>
                          <span>Return Window: <strong className="text-obsidian dark:text-[#f6f4f0] font-semibold">{proposedOffer?.returnDays}d</strong></span>
                          <span className="ml-auto text-[11px] text-[#006840] dark:text-[#4ade80] font-mono-token">
                            Guardrail Passed
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. GUARDRAIL INTERVENTION / BLOCKED (Mathematically explicit, clean presentation)
                if (ev.type === "GUARDRAIL_INTERVENTION" || ev.type === "GUARDRAIL_BLOCKED") {
                  const reasonStr = String(p.reason || p.detail || "Predicate constraint violation");
                  let predicateName = "Mechanism-Design Guardrail";
                  if (/budget|exceed|shipping|feasibility/i.test(reasonStr)) {
                    predicateName = "Predicate A — Feasibility & Budget Limit";
                  } else if (/leakage|reservation|disclose/i.test(reasonStr)) {
                    predicateName = "Predicate B — Reservation-Price Leakage";
                  } else if (/utility|normaliz/i.test(reasonStr)) {
                    predicateName = "Predicate C — Multi-Attribute Utility";
                  } else if (/boulware|threshold|decay/i.test(reasonStr)) {
                    predicateName = "Predicate D — Boulware Utility Threshold";
                  } else if (/anti-thrashing|monotonic|previous buyer/i.test(reasonStr)) {
                    predicateName = "Predicate E — Anti-Thrashing Monotonicity";
                  }

                  const rejectedOffer = p.rejectedOffer as { unitPrice?: number; deliveryDays?: number; returnDays?: number } | undefined;

                  return (
                    <div
                      key={ev.id}
                      className="py-3 px-3.5 rounded-[6px] bg-amber-500/[0.04] dark:bg-[#1a1614] border-l-2 border-l-ember-orange border-y border-r border-amber-500/20 dark:border-[#38261e] space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[12px]">
                        <div className="flex items-center gap-1.5 text-ember-orange font-semibold">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{predicateName} Intervened</span>
                        </div>
                        <span className="text-[10.5px] font-mono-token font-medium px-1.5 py-0.5 rounded bg-ember-orange/15 text-ember-orange border border-ember-orange/25 uppercase">
                          Purged from Queue
                        </span>
                      </div>

                      <div className="text-[12.5px] text-obsidian dark:text-[#f6f4f0] leading-snug">
                        <span className="text-[#737373] dark:text-[#a3a3a3]">Mathematical Violation:</span>{" "}
                        <span className="font-medium text-ember-orange">
                          {reasonStr}
                        </span>
                      </div>

                      {rejectedOffer && (
                        <div className="text-[11.5px] text-[#737373] dark:text-[#a3a3a3] font-mono-token pt-0.5">
                          Blocked Offer: ${rejectedOffer.unitPrice}/unit • {rejectedOffer.deliveryDays}d delivery • {rejectedOffer.returnDays}d return
                        </div>
                      )}

                      {/* Accessible Technical Disclosure Control */}
                      <details className="text-[11.5px] text-[#737373] dark:text-[#a3a3a3] pt-1 group">
                        <summary className="cursor-pointer hover:text-obsidian dark:hover:text-white select-none inline-flex items-center gap-1 font-mono-token">
                          <span>Verification details</span>
                          <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                        </summary>
                        <div className="mt-1.5 p-2 rounded bg-smoke/40 dark:bg-[#121214] font-mono-token text-[11px] space-y-1 border border-smoke/70 dark:border-[#27272a]">
                          <div>Target Vendor: {String(p.vendorName || p.vendorId)}</div>
                          <div>Status: {String(p.status || "GUARDRAIL_BLOCKED")}</div>
                          <div>Action: Outgoing message purged. AI prompt regenerated under tighter mathematical constraints.</div>
                        </div>
                      </details>
                    </div>
                  );
                }

                // 4. VENDOR COUNTEROFFER
                if (ev.type === "VENDOR_COUNTEROFFER") {
                  const quote = quotes.find((q) => q.vendorId === p.vendorId);
                  const initialAsk = quote?.initialUnitAsk;
                  const newAsk = Number(p.newUnitAsk);
                  const concession = initialAsk && !isNaN(newAsk) && initialAsk > newAsk ? initialAsk - newAsk : null;

                  return (
                    <div
                      key={ev.id}
                      className="py-3 px-3.5 rounded-[6px] bg-smoke/15 dark:bg-[#141416] border border-smoke dark:border-[#27272a] space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-obsidian dark:text-[#f6f4f0]">
                          {String(p.vendorName || p.vendorId)} Counteroffer
                        </span>
                        <div className="flex items-center gap-2">
                          {concession !== null && (
                            <span className="text-[11px] font-mono-token text-[#006840] dark:text-[#4ade80]">
                              (-${concession.toFixed(2)} concession)
                            </span>
                          )}
                          <span className="font-sans font-semibold text-obsidian dark:text-[#f6f4f0] tabular-nums">
                            New Ask: ${String(p.newUnitAsk)}
                          </span>
                        </div>
                      </div>

                      {Boolean(p.turn && typeof p.turn === "object") && (
                        <p className="text-[13px] text-[#4a4a52] dark:text-[#c4c0ba] leading-relaxed italic">
                          &ldquo;{String((p.turn as { message?: string }).message)}&rdquo;
                        </p>
                      )}
                    </div>
                  );
                }

                // 5. ROUND COMPLETED
                if (ev.type === "ROUND_COMPLETED") {
                  return (
                    <div
                      key={ev.id}
                      className="py-1.5 px-3 rounded-[4px] bg-smoke/25 dark:bg-[#141416] text-[11.5px] text-[#737373] dark:text-[#a3a3a3] flex items-center justify-between font-mono-token border border-smoke dark:border-[#27272a]"
                    >
                      <span>Round {String(p.round)} committed to Merkle tree</span>
                      <span className="text-architect-violet dark:text-[#a78bfa]">
                        {String(p.merkleRoot).slice(0, 14)}...
                      </span>
                    </div>
                  );
                }

                // 6. NEGOTIATION COMPLETED
                if (ev.type === "NEGOTIATION_COMPLETED") {
                  const isDealTurn =
                    p.outcome !== "NO_DEAL" &&
                    Boolean(p.selectedVendor || p.winningVendor || p.winningVendorId);

                  if (!isDealTurn) {
                    return (
                      <div
                        key={ev.id}
                        className="py-3.5 px-4 rounded-[6px] bg-amber-500/[0.08] dark:bg-amber-500/10 border-l-2 border-l-amber-500 border-y border-r border-amber-500/20 space-y-2 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="font-semibold text-[14px]">
                            Negotiation Concluded — No Deal
                          </span>
                        </div>
                        <p className="text-[13px] text-[#4a4a52] dark:text-[#b8b5af] leading-relaxed">
                          {String(
                            p.reason ||
                              "No competing vendor counteroffer satisfied mandatory budget and SLA constraints."
                          )}
                        </p>
                        <div className="text-[12px] text-[#737373] dark:text-[#a3a3a3] pt-0.5">
                          Settlement gate is closed for this session. Revise mandate constraints or source alternative wholesale catalogs.
                        </div>
                      </div>
                    );
                  }

                  const vendorName = String(p.selectedVendor || p.winningVendor || "Selected Supplier");
                  const totalCostVal = p.totalCost ?? p.finalTotalCost ?? p.finalAmount;
                  const savingsVal = p.savings ?? p.savingsAmount ?? 0;

                  return (
                    <div
                      key={ev.id}
                      className="py-3.5 px-4 rounded-[6px] bg-emerald-500/[0.05] dark:bg-[#141a16] border-l-2 border-l-lichen-green border-y border-r border-emerald-500/20 dark:border-[#1e2a22] space-y-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-[#006840] dark:text-[#4ade80]">
                        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="font-semibold text-[14px]">
                          Consensus Reached with {vendorName}
                        </span>
                      </div>

                      <div className="text-[13px] text-[#4a4a52] dark:text-[#b8b5af] flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>
                          Final Landed Cost:{" "}
                          <strong className="text-obsidian dark:text-white tabular-nums">
                            ${String(totalCostVal ?? "—")}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Net Savings:{" "}
                          <strong className="text-[#006840] dark:text-[#4ade80] tabular-nums">
                            +${String(savingsVal)}
                          </strong>
                        </span>
                      </div>

                      <div className="text-[12.5px] text-[#006840] dark:text-[#4ade80] flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Agreement Accepted: Mutual agreement recorded and committed to pre-settlement Merkle tree.</span>
                      </div>

                      {onProceedToSettlement && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={onProceedToSettlement}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[6px] bg-ember-orange hover:bg-[#e65c00] text-white text-[12.5px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                          >
                            <span>Proceed to Settlement Gate</span>
                            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // Fallback for general events
                return (
                  <div
                    key={ev.id}
                    className="py-1 px-2.5 rounded bg-smoke/20 dark:bg-[#141416] text-[11px] text-[#737373] dark:text-[#a3a3a3] flex items-center justify-between font-mono-token border border-smoke dark:border-[#27272a]"
                  >
                    <span>{ev.type}</span>
                    <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
