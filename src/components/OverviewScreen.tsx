"use client";

import React from "react";
import {
  PrimaryButton,
  GhostButton,
  StatusBadge,
  CurrencyDisplay,
  InteractiveHoverCard,
} from "./SharedUI";
import {
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  Layers,
  Lock,
  ArrowRight,
  Scale,
  FileCheck2,
  CreditCard,
  Cpu,
} from "lucide-react";
import type { ProcurementSession } from "@/types/pactum";

interface OverviewScreenProps {
  sessions: ProcurementSession[];
  onStartNew: () => void;
  onOpenSession: (session: ProcurementSession) => void;
  onNavigateHistory?: () => void;
}

export function OverviewScreen({
  sessions,
  onStartNew,
  onOpenSession,
  onNavigateHistory,
}: OverviewScreenProps) {
  const activeSession = sessions[0]; // Authoritative current session

  // Accurate metric calculations based strictly on real authoritative sessions
  const totalVolume = sessions.reduce((sum, s) => sum + s.mandate.maxTotalBudget, 0);
  const settledCount = sessions.filter(
    (s) => s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED"
  ).length;
  const activeCount = sessions.filter(
    (s) => s.status !== "SETTLED" && s.status !== "CANCELLED" && s.status !== "AUDIT_FAILED"
  ).length;
  const verifiedSavings = sessions.reduce((sum, s) => {
    if (s.finalOffer && s.selectedQuote) {
      const initialTotal = s.selectedQuote.initialUnitAsk * s.finalOffer.quantity + s.selectedQuote.shippingCost;
      const finalTotal = s.finalOffer.unitPrice * s.finalOffer.quantity + s.finalOffer.shippingCost;
      const diff = initialTotal - finalTotal;
      return sum + (diff > 0 ? diff : 0);
    }
    return sum;
  }, 0);

  return (
    <div className="w-full space-y-8 sm:space-y-10 animate-in fade-in duration-150">
      {/* 1. INSTITUTIONAL COMMAND HEADER */}
      <section className="bg-paper-white dark:bg-[#18181b] border-b border-smoke dark:border-[#27272a] py-8 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[5px] bg-architect-violet/[0.08] dark:bg-architect-violet/15 border border-architect-violet/20 dark:border-architect-violet/30 text-[11.5px] font-mono-token font-medium text-architect-violet dark:text-[#b490f5] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Autonomous Procurement &amp; Cryptographic Settlement</span>
            </div>

            <h1 className="text-[28px] sm:text-[36px] font-semibold leading-[1.12] tracking-[-0.03em] text-obsidian dark:text-[#f5f3ef]">
              Procurement Command Center
            </h1>

            <p className="text-[14px] sm:text-[15px] text-secondary font-normal leading-relaxed">
              Define natural-language mandates, compete wholesale catalogs, enforce mathematical Boulware guardrails, and settle verifiably through PayPal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <PrimaryButton onClick={onStartNew} ariaLabel="Launch new procurement mandate">
              Launch Procurement Mandate
            </PrimaryButton>
            {activeSession ? (
              <GhostButton
                onClick={() => onOpenSession(activeSession)}
                ariaLabel={`View active session ${activeSession.id}`}
              >
                View Active Session
              </GhostButton>
            ) : onNavigateHistory ? (
              <GhostButton
                onClick={onNavigateHistory}
                ariaLabel="Browse procurement history"
              >
                Browse History
              </GhostButton>
            ) : null}
          </div>
        </div>
      </section>

      {/* Main Content Body (max-w-[1280px] container) */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-10 w-full">
        {/* 2. REAL OPERATIONAL METRIC TILES */}
        <section aria-label="Procurement Metrics">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <InteractiveHoverCard
              onClick={() => {
                if (onNavigateHistory) {
                  onNavigateHistory();
                } else {
                  onStartNew();
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (onNavigateHistory) {
                    onNavigateHistory();
                  } else {
                    onStartNew();
                  }
                }
              }}
              aria-label="View procurement mandate history"
              className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 border border-smoke dark:border-[#27272a] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-xs cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <div className="flex items-center justify-between text-secondary text-[12px] mb-2 font-medium">
                <span>Total Mandate Ceiling</span>
                <TrendingUp className="w-4 h-4 text-ember-orange group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                <CurrencyDisplay amount={totalVolume} size="xl" />
              </div>
              <div className="flex items-center justify-between text-[11.5px] text-secondary mt-2 pt-2 border-t border-smoke/70 dark:border-[#242429]">
                <span>{sessions.length} recorded {sessions.length === 1 ? "session" : "sessions"}</span>
                <span className="text-ember-orange font-medium text-[11px] opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Browse <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
            </InteractiveHoverCard>

            <InteractiveHoverCard
              onClick={() => {
                if (activeSession) {
                  onOpenSession(activeSession);
                } else {
                  onStartNew();
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (activeSession) {
                    onOpenSession(activeSession);
                  } else {
                    onStartNew();
                  }
                }
              }}
              aria-label={activeSession ? `Resume active session ${activeSession.id}` : "Start new procurement mandate"}
              className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 border border-smoke dark:border-[#27272a] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-xs cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <div className="flex items-center justify-between text-secondary text-[12px] mb-2 font-medium">
                <span>Active Mandate Runs</span>
                <Layers className="w-4 h-4 text-architect-violet dark:text-[#a78bfa] group-hover:scale-105 transition-transform" aria-hidden="true" />
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                {activeCount}
              </div>
              <div className="flex items-center justify-between text-[11.5px] text-secondary mt-2 pt-2 border-t border-smoke/70 dark:border-[#242429]">
                <span>In sourcing or arena</span>
                <span className="text-architect-violet dark:text-[#a78bfa] font-medium text-[11px] opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  {activeSession ? "Resume" : "Start"} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
            </InteractiveHoverCard>

            <InteractiveHoverCard
              onClick={() => {
                if (onNavigateHistory) {
                  onNavigateHistory();
                } else {
                  onStartNew();
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (onNavigateHistory) {
                    onNavigateHistory();
                  } else {
                    onStartNew();
                  }
                }
              }}
              aria-label="View cryptographically settled sessions"
              className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 border border-smoke dark:border-[#27272a] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-xs cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <div className="flex items-center justify-between text-secondary text-[12px] mb-2 font-medium">
                <span>Cryptographically Settled</span>
                <ShieldCheck className="w-4 h-4 text-lichen-green group-hover:scale-105 transition-transform" aria-hidden="true" />
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                {settledCount}
              </div>
              <div className="flex items-center justify-between text-[11.5px] text-secondary mt-2 pt-2 border-t border-smoke/70 dark:border-[#242429]">
                <span>PayPal Orders v2 verified</span>
                <span className="text-lichen-green font-medium text-[11px] opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Audit Logs <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
            </InteractiveHoverCard>

            <div className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 border border-smoke dark:border-[#27272a] shadow-2xs transition-colors">
              <div className="flex items-center justify-between text-secondary text-[12px] mb-2 font-medium">
                <span>Verified Realized Savings</span>
                <Lock className="w-4 h-4 text-lichen-green" aria-hidden="true" />
              </div>
              <div className="text-[24px] sm:text-[28px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                {verifiedSavings > 0 ? (
                  <CurrencyDisplay amount={verifiedSavings} size="xl" className="text-lichen-green dark:text-[#4ade80]" />
                ) : (
                  <span className="text-secondary text-[20px] font-medium font-sans">Pending</span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11.5px] text-secondary mt-2 pt-2 border-t border-smoke/70 dark:border-[#242429]">
                <span>{verifiedSavings > 0 ? "From agreed discounts" : "Requires settled agreement"}</span>
                <span className="font-mono-token text-[11px]">Strict proof</span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. PROCUREMENT ARCHITECTURE WORKFLOW (Informative, Linear Process) */}
        <section aria-label="Procurement Architecture Workflow" className="space-y-4">
          <div className="pb-2 border-b border-smoke/70 dark:border-[#242429]">
            <h2 className="text-[16px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
              Procurement &amp; Cryptographic Settlement Workflow
            </h2>
            <p className="text-[13px] text-[#6e6e78] dark:text-[#8e8a83]">
              Deterministic pipeline from mandate definition through audited PayPal capture
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-[8px] bg-paper-white dark:bg-[#18181b] border border-smoke dark:border-[#232328] space-y-2">
              <div className="flex items-center justify-between text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                <span>STAGE 01</span>
                <Cpu className="w-3.5 h-3.5 text-ember-orange" aria-hidden="true" />
              </div>
              <div className="text-[14px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                Mandate &amp; Sourcing
              </div>
              <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed">
                Parse hard constraints (budget, quantity, delivery SLA, return window) and query competing wholesale catalogs.
              </p>
            </div>

            <div className="p-4 rounded-[8px] bg-paper-white dark:bg-[#18181b] border border-smoke dark:border-[#232328] space-y-2">
              <div className="flex items-center justify-between text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                <span>STAGE 02</span>
                <Scale className="w-3.5 h-3.5 text-architect-violet dark:text-[#a78bfa]" aria-hidden="true" />
              </div>
              <div className="text-[14px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                Autonomous Arena
              </div>
              <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed">
                Gemini buyer negotiates over discrete rounds. Outgoing proposals verified against Boulware decay and anti-thrashing rules.
              </p>
            </div>

            <div className="p-4 rounded-[8px] bg-paper-white dark:bg-[#18181b] border border-smoke dark:border-[#232328] space-y-2">
              <div className="flex items-center justify-between text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                <span>STAGE 03</span>
                <FileCheck2 className="w-3.5 h-3.5 text-lichen-green" aria-hidden="true" />
              </div>
              <div className="text-[14px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                ACWORLD Audit Gate
              </div>
              <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed">
                Independent verification evaluates 5 invariants (SKU integrity, ceiling arithmetic, returns, SLA, and Merkle root).
              </p>
            </div>

            <div className="p-4 rounded-[8px] bg-paper-white dark:bg-[#18181b] border border-smoke dark:border-[#232328] space-y-2">
              <div className="flex items-center justify-between text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                <span>STAGE 04</span>
                <CreditCard className="w-3.5 h-3.5 text-obsidian dark:text-white" aria-hidden="true" />
              </div>
              <div className="text-[14px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                PayPal Settlement
              </div>
              <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed">
                Authorized checkout binds Merkle root to custom_id. Capture is executed only after verified certificate pass.
              </p>
            </div>
          </div>
        </section>

        {/* 4. ACTIVE PROCUREMENT & CRYPTOGRAPHIC PROOF */}
        {activeSession && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-label="Active Procurement Mandate">
            {/* Active Mandate Card */}
            <InteractiveHoverCard
              onClick={() => onOpenSession(activeSession)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenSession(activeSession);
                }
              }}
              aria-label={`Open active session ${activeSession.id} for ${activeSession.mandate.itemQuery}`}
              className="lg:col-span-7 bg-paper-white dark:bg-[#18181b] rounded-[8px] p-6 border border-smoke dark:border-[#232328] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-sm flex flex-col justify-between cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-mono-token font-medium text-architect-violet dark:text-[#a78bfa] uppercase tracking-wider">
                    Authoritative Session State
                  </span>
                  <StatusBadge
                    status={
                      activeSession.status === "SETTLED" || activeSession.status === "PAYPAL_CAPTURED"
                        ? "verified"
                        : activeSession.status === "AUDIT_FAILED"
                          ? "failure"
                          : "info"
                    }
                    label={activeSession.status.replace(/_/g, " ")}
                  />
                </div>

                <div>
                  <h2 className="text-[20px] sm:text-[24px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight leading-snug group-hover:text-ember-orange transition-colors">
                    {activeSession.mandate.itemQuery}
                  </h2>
                  <p className="text-[13.5px] text-[#6e6e78] dark:text-[#8e8a83] font-normal leading-relaxed mt-1 line-clamp-2">
                    {activeSession.mandate.rawPrompt}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-smoke/70 dark:border-[#232328]">
                  <div>
                    <div className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mb-0.5">Target Quantity</div>
                    <div className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                      {activeSession.mandate.quantity}{" "}
                      <span className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] font-normal">units</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mb-0.5">Ceiling Budget</div>
                    <CurrencyDisplay
                      amount={activeSession.mandate.maxTotalBudget}
                      currency={activeSession.mandate.currency}
                      size="md"
                    />
                  </div>
                  <div>
                    <div className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mb-0.5">Supplier Quotes</div>
                    <div className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                      {activeSession.quotes?.length ?? 0}{" "}
                      <span className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] font-normal">proposals</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-5 border-t border-smoke/70 dark:border-[#232328] flex items-center justify-between">
                <span className="text-[11.5px] text-[#6e6e78] dark:text-[#8e8a83] font-mono-token">
                  {activeSession.id}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ember-orange group-hover:text-[#e65c00] transition-colors">
                  <span>Resume Session</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                </span>
              </div>
            </InteractiveHoverCard>

            {/* Cryptographic Flight Recorder Status Panel (Crisp, Restrained Neutral Surface) */}
            <div className="lg:col-span-5 bg-paper-white dark:bg-[#18181b] rounded-[8px] p-6 border border-smoke dark:border-[#232328] flex flex-col justify-between shadow-2xs transition-colors">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-mono-token font-medium text-architect-violet dark:text-[#a78bfa] uppercase tracking-wider">
                    Flight Recorder
                  </span>
                  <span className="text-[11px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83] bg-smoke/40 dark:bg-[#202024] px-2 py-0.5 rounded border border-smoke/70 dark:border-[#282830]">
                    SHA-256
                  </span>
                </div>

                <h3 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                  VeriPay Cryptographic Proof
                </h3>

                <p className="text-[13px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed">
                  Canonical events, supplier quotes, Boulware negotiation turns, and ACWORLD invariant checks are hashed sequentially into an immutable Merkle root.
                </p>

                <div className="space-y-1 pt-1">
                  <div className="text-[11.5px] text-[#6e6e78] dark:text-[#8e8a83] font-medium">
                    Pre-Settlement Merkle Root:
                  </div>
                  <div className="p-2.5 bg-smoke/30 dark:bg-[#141416] rounded-[6px] border border-smoke/80 dark:border-[#27272d] font-mono-token text-[11px] text-obsidian dark:text-[#f6f4f0] break-all select-all">
                    {activeSession.merkleRoot || activeSession.preSettlementRoot || "Pending negotiation rounds..."}
                  </div>
                </div>
              </div>

              <div className="pt-3.5 mt-5 border-t border-smoke/70 dark:border-[#232328] flex items-center justify-between text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                <span className="flex items-center gap-1.5 font-medium text-architect-violet dark:text-[#a78bfa]">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  Bound to PayPal custom_id
                </span>
                <span>{activeSession.turns?.length ?? 0} Turns Committed</span>
              </div>
            </div>
          </section>
        )}

        {/* 5. RECENT PROCUREMENT SESSIONS: Institutional Table */}
        {sessions.length > 0 && (
          <section
            className="bg-paper-white dark:bg-[#18181b] rounded-cards border border-smoke dark:border-[#232328] overflow-hidden shadow-2xs transition-colors"
            aria-label="Recent Sessions"
          >
            <div className="p-5 sm:p-6 border-b border-smoke/70 dark:border-[#232328] flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                  Recent Procurement Sessions
                </h3>
                <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mt-0.5">
                  Authoritative transaction logs and Merkle root references
                </p>
              </div>
              <span className="text-[11.5px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83] bg-smoke/30 dark:bg-[#202025] px-2.5 py-1 rounded-[4px] border border-smoke dark:border-[#2b2b32]">
                {sessions.length} recorded
              </span>
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-smoke dark:border-[#28282e] bg-warm-cream/30 dark:bg-[#151518] text-[11px] font-mono-token uppercase tracking-wider text-[#6e6e78] dark:text-[#8e8a83]">
                    <th scope="col" className="py-3 pl-6 pr-4 font-medium">Session ID &amp; Spec</th>
                    <th scope="col" className="py-3 px-4 font-medium text-right">Quantity</th>
                    <th scope="col" className="py-3 px-4 font-medium text-right">Ceiling Budget</th>
                    <th scope="col" className="py-3 px-4 font-medium text-center">Lifecycle State</th>
                    <th scope="col" className="py-3 pl-4 pr-6 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smoke/80 dark:divide-[#242429]">
                  {sessions.slice(0, 5).map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => onOpenSession(s)}
                      className="hover:bg-warm-cream/35 dark:hover:bg-[#1f1f23] transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 pl-6 pr-4">
                        <div className="font-semibold text-obsidian dark:text-[#f6f4f0] group-hover:text-ember-orange transition-colors">
                          {s.mandate.itemQuery}
                        </div>
                        <div className="text-[11.5px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                          {s.id}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap text-obsidian dark:text-[#f6f4f0]">
                        {s.mandate.quantity.toLocaleString()} units
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap font-medium text-obsidian dark:text-[#f6f4f0]">
                        <CurrencyDisplay
                          amount={s.mandate.maxTotalBudget}
                          currency={s.mandate.currency}
                          size="sm"
                        />
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <StatusBadge
                          status={
                            s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED"
                              ? "verified"
                              : s.status === "AUDIT_FAILED"
                              ? "failure"
                              : "info"
                          }
                          label={s.status.replace(/_/g, " ")}
                        />
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6e6e78] dark:text-[#8e8a83] group-hover:text-ember-orange transition-colors">
                          <span>Open</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="sm:hidden divide-y divide-smoke/80 dark:divide-[#242429]">
              {sessions.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  className="p-4 space-y-2 hover:bg-smoke/20 dark:hover:bg-[#1a1a1f] cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-obsidian dark:text-[#f6f4f0]">
                      {s.mandate.itemQuery}
                    </span>
                    <StatusBadge
                      status={
                        s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED"
                          ? "verified"
                          : s.status === "AUDIT_FAILED"
                          ? "failure"
                          : "info"
                      }
                      label={s.status.replace(/_/g, " ")}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                    <span className="font-mono-token">{s.id}</span>
                    <span>{s.mandate.quantity} units</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <CurrencyDisplay
                      amount={s.mandate.maxTotalBudget}
                      currency={s.mandate.currency}
                      size="sm"
                    />
                    <span className="text-[12px] font-medium text-ember-orange flex items-center gap-1">
                      Open <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {sessions.length > 5 && onNavigateHistory && (
              <div className="p-3 border-t border-smoke/70 dark:border-[#232328] bg-warm-cream/20 dark:bg-[#141416] text-center">
                <button
                  type="button"
                  onClick={onNavigateHistory}
                  className="text-[12.5px] font-medium text-ember-orange hover:text-[#e65c00] transition-colors cursor-pointer"
                >
                  View all {sessions.length} sessions in Procurement History &rarr;
                </button>
              </div>
            )}
          </section>
        )}

        {/* Empty state when no sessions exist */}
        {sessions.length === 0 && (
          <section className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-8 sm:p-12 border border-smoke dark:border-[#27272a] shadow-2xs text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-smoke/40 dark:bg-[#202025] border border-smoke dark:border-[#2b2b32] flex items-center justify-center mx-auto text-architect-violet dark:text-[#a78bfa]">
              <Cpu className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0]">
                No Active Procurement Mandates
              </h3>
              <p className="text-[13.5px] text-secondary leading-relaxed">
                Submit a natural-language mandate to automatically source wholesale quotes, run game-theoretic Boulware negotiations, and settle verifiably through PayPal.
              </p>
            </div>
            <div className="pt-2">
              <PrimaryButton onClick={onStartNew} ariaLabel="Launch first mandate">
                Launch First Procurement Mandate
              </PrimaryButton>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
