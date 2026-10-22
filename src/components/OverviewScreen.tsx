"use client";

import React from "react";
import {
  PrimaryButton,
  GhostButton,
  StatusBadge,
  CurrencyDisplay,
  InteractiveHoverCard,
  InteractiveHoverButton,
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

  return (
    <div className="w-full space-y-12 sm:space-y-16 animate-in fade-in duration-150">
      {/* 1. HERO VAULT: Institutional Headline & Dual CTAs */}
      <section className="w-full bg-[#0a0a0c] text-white py-16 sm:py-20 px-6 sm:px-8 border-b border-[#232328]">
        <div className="max-w-[1240px] mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[4px] bg-white/[0.06] border border-white/10 text-[12.5px] text-white/90 font-medium tracking-tight">
            <span className="w-1.5 h-1.5 rounded-full bg-lichen-green" aria-hidden="true" />
            <span>Autonomous Procurement &amp; Cryptographic Settlement</span>
          </div>

          <h1 className="text-[36px] sm:text-[50px] font-semibold leading-[1.08] tracking-[-0.035em] text-white max-w-3xl">
            Procurement, with proof.
          </h1>

          <p className="text-[16px] sm:text-[18px] text-white/70 font-normal leading-[1.5] max-w-2xl">
            Source intelligently. Negotiate within constraints. Settle only when the evidence checks out.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onStartNew} ariaLabel="Launch new procurement mandate">
              Launch Procurement Mandate
            </PrimaryButton>
            {activeSession ? (
              <GhostButton
                onClick={() => onOpenSession(activeSession)}
                className="text-white border-white/20 bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 hover:border-white/40"
                ariaLabel={`View active session ${activeSession.id}`}
              >
                View Active Session
              </GhostButton>
            ) : onNavigateHistory ? (
              <GhostButton
                onClick={onNavigateHistory}
                className="text-white border-white/20 bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 hover:border-white/40"
                ariaLabel="Browse procurement history"
              >
                Browse History
              </GhostButton>
            ) : (
              <a
                href="https://sandbox.paypal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 h-10 rounded-[8px] bg-white/5 border border-white/20 hover:bg-white/10 text-white font-medium text-[14px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Explore PayPal Sandbox in new tab"
              >
                Explore Sandbox
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Centered Page Body (1240px max width container) */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16 w-full">
        {/* 2. REAL OPERATIONAL METRIC TILES */}
        <section aria-label="Procurement Metrics">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
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
              className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 sm:p-6 border border-smoke dark:border-[#232328] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-sm cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <div className="flex items-center justify-between text-[#6e6e78] dark:text-[#8e8a83] text-[12.5px] mb-2 font-medium">
                <span>Total Mandate Ceiling</span>
                <TrendingUp className="w-4 h-4 text-ember-orange group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </div>
              <div className="text-[26px] sm:text-[30px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                <CurrencyDisplay amount={totalVolume} size="xl" />
              </div>
              <div className="flex items-center justify-between text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mt-2 pt-2 border-t border-smoke/60 dark:border-[#222227]">
                <span>Across {sessions.length} recorded sessions</span>
                <span className="text-ember-orange font-medium text-[11.5px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
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
              className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 sm:p-6 border border-smoke dark:border-[#232328] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-sm cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <div className="flex items-center justify-between text-[#6e6e78] dark:text-[#8e8a83] text-[12.5px] mb-2 font-medium">
                <span>Active Mandate Runs</span>
                <Layers className="w-4 h-4 text-architect-violet dark:text-[#a78bfa] group-hover:scale-105 transition-transform" aria-hidden="true" />
              </div>
              <div className="text-[26px] sm:text-[30px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                {activeCount}
              </div>
              <div className="flex items-center justify-between text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mt-2 pt-2 border-t border-smoke/60 dark:border-[#222227]">
                <span>Evaluating quotes or ready for settlement</span>
                <span className="text-architect-violet dark:text-[#a78bfa] font-medium text-[11.5px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
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
              className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 sm:p-6 border border-smoke dark:border-[#232328] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-sm cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <div className="flex items-center justify-between text-[#6e6e78] dark:text-[#8e8a83] text-[12.5px] mb-2 font-medium">
                <span>Cryptographically Settled</span>
                <ShieldCheck className="w-4 h-4 text-lichen-green group-hover:scale-105 transition-transform" aria-hidden="true" />
              </div>
              <div className="text-[26px] sm:text-[30px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                {settledCount}
              </div>
              <div className="flex items-center justify-between text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mt-2 pt-2 border-t border-smoke/60 dark:border-[#222227]">
                <span>Audited &amp; captured via PayPal Orders v2</span>
                <span className="text-lichen-green font-medium text-[11.5px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Audit Logs <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
            </InteractiveHoverCard>
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

        {/* 5. RECENT PROCUREMENT SESSIONS: Crisp Institutional Table */}
        {sessions.length > 0 && (
          <section
            className="bg-paper-white dark:bg-[#18181b] rounded-[8px] border border-smoke dark:border-[#232328] overflow-hidden p-5 sm:p-6 space-y-4 shadow-2xs transition-colors"
            aria-label="Recent Sessions"
          >
            <div className="flex items-center justify-between pb-3 border-b border-smoke/70 dark:border-[#232328]">
              <div>
                <h3 className="text-[16px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                  Recent Procurement Sessions
                </h3>
                <p className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                  Authoritative transaction logs and Merkle root references
                </p>
              </div>
              <span className="text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                {sessions.length} total records
              </span>
            </div>

            <div className="space-y-2" role="list">
              {sessions.map((s) => (
                <InteractiveHoverButton
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  liftY={-4}
                  className="w-full text-left py-3 px-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-smoke/20 dark:bg-[#141416] hover:bg-smoke/40 dark:hover:bg-[#1c1c20] rounded-[6px] border border-smoke/60 dark:border-[#25252b] hover:border-smoke-dark dark:hover:border-[#383842] shadow-2xs hover:shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange group transition-colors"
                  aria-label={`Open session ${s.id} for ${s.mandate.itemQuery}`}
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-medium text-obsidian dark:text-[#f6f4f0] tracking-tight group-hover:text-ember-orange transition-colors">
                        {s.mandate.itemQuery}
                      </span>
                      <span className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83]">
                        ({s.mandate.quantity} units)
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
                    <div className="text-[11.5px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                      {s.id} • Mandate v{s.mandate.version ?? 1}
                    </div>
                  </div>

                  <div className="flex items-center gap-5 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[11px] text-[#6e6e78] dark:text-[#8e8a83] uppercase tracking-wider font-mono-token">Ceiling</div>
                      <CurrencyDisplay
                        amount={s.mandate.maxTotalBudget}
                        currency={s.mandate.currency}
                        size="sm"
                      />
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#8e8a83] dark:text-[#76767e] group-hover:text-obsidian dark:group-hover:text-white group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                  </div>
                </InteractiveHoverButton>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
