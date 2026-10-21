"use client";

import React from "react";
import {
  PrimaryButton,
  GhostButton,
  StatusBadge,
  CurrencyDisplay,
} from "./SharedUI";
import {
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  Layers,
  Lock,
  ArrowRight,
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
    <div className="w-full space-y-12 sm:space-y-16 animate-in fade-in duration-200">
      {/* 1. HERO VAULT: Institutional Headline & Dual CTAs */}
      <section className="w-full bg-[#0a0a0c] text-white py-16 sm:py-20 px-6 sm:px-8 border-b border-[#232328] shadow-sm">
        <div className="max-w-[1240px] mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[6px] bg-white/[0.07] border border-white/15 text-[13px] text-white/90 font-medium tracking-tight">
            <span className="w-1.5 h-1.5 rounded-full bg-lichen-green" aria-hidden="true" />
            <span>Autonomous Procurement &amp; Cryptographic Settlement</span>
          </div>

          <h1 className="text-[36px] sm:text-[52px] font-semibold leading-[1.08] tracking-[-0.035em] text-white max-w-3xl">
            Procurement, with proof.
          </h1>

          <p className="text-[17px] sm:text-[19px] text-white/75 font-normal leading-[1.5] max-w-2xl">
            Source intelligently. Negotiate within constraints. Settle only when the evidence checks out.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={onStartNew} ariaLabel="Launch new procurement mandate">
              Launch Procurement Mandate
            </PrimaryButton>
            {activeSession ? (
              <GhostButton
                onClick={() => onOpenSession(activeSession)}
                className="text-white border-white/30 bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 hover:border-white/50"
                ariaLabel={`View active session ${activeSession.id}`}
              >
                View Active Session
              </GhostButton>
            ) : onNavigateHistory ? (
              <GhostButton
                onClick={onNavigateHistory}
                className="text-white border-white/30 bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 hover:border-white/50"
                ariaLabel="Browse procurement history"
              >
                Browse History
              </GhostButton>
            ) : (
              <a
                href="https://sandbox.paypal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 h-10 rounded-[8px] bg-white/5 border border-white/30 hover:bg-white/10 text-white font-medium text-[14px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
        {/* 2. REAL METRIC TILES */}
        <section aria-label="Procurement Metrics">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-6 border border-smoke dark:border-[#2b2b32] shadow-2xs transition-colors">
              <div className="flex items-center justify-between text-[#4a4a52] dark:text-[#b8b5af] text-[13px] mb-2 font-medium">
                <span>Total Mandate Ceiling</span>
                <TrendingUp className="w-4 h-4 text-ember-orange" aria-hidden="true" />
              </div>
              <div className="text-[28px] sm:text-[32px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                <CurrencyDisplay amount={totalVolume} size="xl" />
              </div>
              <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mt-2">
                Across {sessions.length} recorded procurement sessions
              </p>
            </div>

            <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-6 border border-smoke dark:border-[#2b2b32] shadow-2xs transition-colors">
              <div className="flex items-center justify-between text-[#4a4a52] dark:text-[#b8b5af] text-[13px] mb-2 font-medium">
                <span>Active Mandate Runs</span>
                <Layers className="w-4 h-4 text-architect-violet dark:text-[#a78bfa]" aria-hidden="true" />
              </div>
              <div className="text-[28px] sm:text-[32px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                {activeCount}
              </div>
              <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mt-2">
                Evaluating quotes or ready for settlement
              </p>
            </div>

            <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-6 border border-smoke dark:border-[#2b2b32] shadow-2xs transition-colors">
              <div className="flex items-center justify-between text-[#4a4a52] dark:text-[#b8b5af] text-[13px] mb-2 font-medium">
                <span>Cryptographically Settled</span>
                <ShieldCheck className="w-4 h-4 text-lichen-green" aria-hidden="true" />
              </div>
              <div className="text-[28px] sm:text-[32px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                {settledCount}
              </div>
              <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mt-2">
                Audited &amp; captured via PayPal Orders v2
              </p>
            </div>
          </div>
        </section>

        {/* 3. ACTIVE PROCUREMENT & CRYPTOGRAPHIC PROOF */}
        {activeSession && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-label="Active Procurement Mandate">
            {/* Active Mandate Card */}
            <div className="lg:col-span-7 bg-paper-white dark:bg-[#18181b] rounded-cards p-6 sm:p-7 border border-smoke dark:border-[#2b2b32] flex flex-col justify-between shadow-2xs transition-colors">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-mono-token font-medium text-architect-violet dark:text-[#a78bfa] uppercase tracking-wider">
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
                  <h2 className="text-[22px] sm:text-[26px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight leading-snug">
                    {activeSession.mandate.itemQuery}
                  </h2>
                  <p className="text-[14px] text-[#4a4a52] dark:text-[#b8b5af] font-normal leading-relaxed mt-1.5 line-clamp-2">
                    {activeSession.mandate.rawPrompt}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-smoke/80 dark:border-[#2b2b32]">
                  <div>
                    <div className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mb-0.5">Target Quantity</div>
                    <div className="text-[18px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                      {activeSession.mandate.quantity}{" "}
                      <span className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] font-normal">units</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mb-0.5">Ceiling Budget</div>
                    <CurrencyDisplay
                      amount={activeSession.mandate.maxTotalBudget}
                      currency={activeSession.mandate.currency}
                      size="lg"
                    />
                  </div>
                  <div>
                    <div className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mb-0.5">Supplier Quotes</div>
                    <div className="text-[18px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
                      {activeSession.quotes?.length ?? 0}{" "}
                      <span className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] font-normal">proposals</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-5 border-t border-smoke/80 dark:border-[#2b2b32] flex items-center justify-between">
                <span className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] font-mono-token">
                  {activeSession.id}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenSession(activeSession)}
                  className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ember-orange hover:text-[#e65c00] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange rounded-[4px]"
                >
                  <span>Resume Session</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Cryptographic Flight Recorder Status Panel */}
            <div className="lg:col-span-5 bg-lavender-mist/60 dark:bg-[#1e172a] rounded-cards p-6 sm:p-7 border border-architect-violet/20 dark:border-architect-violet/35 flex flex-col justify-between shadow-2xs transition-colors">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-mono-token font-medium text-architect-violet dark:text-[#a78bfa] uppercase tracking-wider">
                    Flight Recorder
                  </span>
                  <span className="text-[11px] font-mono-token text-architect-violet dark:text-[#a78bfa] bg-white/70 dark:bg-black/40 px-2 py-0.5 rounded-[4px] border border-architect-violet/20">
                    SHA-256
                  </span>
                </div>

                <h3 className="text-[18px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                  VeriPay Cryptographic Proof
                </h3>

                <p className="text-[13.5px] text-[#4a4a52] dark:text-[#b8b5af] leading-relaxed">
                  Canonical events, supplier quotes, Boulware negotiation turns, and independent ACWORLD invariant checks are hashed in binary sequence to create an immutable Merkle root.
                </p>

                <div className="space-y-1.5 pt-1">
                  <div className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] font-medium">
                    Pre-Settlement Merkle Root:
                  </div>
                  <div className="p-2.5 bg-paper-white dark:bg-[#141416] rounded-[6px] border border-architect-violet/20 dark:border-architect-violet/35 font-mono-token text-[11.5px] text-obsidian dark:text-[#f6f4f0] break-all select-all">
                    {activeSession.merkleRoot || activeSession.preSettlementRoot || "Pending negotiation rounds..."}
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-5 border-t border-architect-violet/20 dark:border-architect-violet/30 flex items-center justify-between text-[12.5px] text-architect-violet dark:text-[#a78bfa]">
                <span className="flex items-center gap-1.5 font-medium">
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
            className="bg-paper-white dark:bg-[#18181b] rounded-cards border border-smoke dark:border-[#2b2b32] overflow-hidden p-6 sm:p-7 space-y-5 shadow-2xs transition-colors"
            aria-label="Recent Sessions"
          >
            <div className="flex items-center justify-between pb-3 border-b border-smoke/80 dark:border-[#2b2b32]">
              <h3 className="text-[18px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                Recent Procurement Sessions
              </h3>
              <span className="text-[13px] text-[#6e6e78] dark:text-[#8e8a83]">
                {sessions.length} total records
              </span>
            </div>

            <div className="divide-y divide-smoke/80 dark:divide-[#25252a]" role="list">
              {sessions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  className="w-full text-left py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-warm-cream/40 dark:hover:bg-[#1f1f24] px-3 rounded-[8px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                  aria-label={`Open session ${s.id} for ${s.mandate.itemQuery}`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[15px] font-medium text-obsidian dark:text-[#f6f4f0] tracking-tight">
                        {s.mandate.itemQuery}
                      </span>
                      <span className="text-[13px] text-[#6e6e78] dark:text-[#8e8a83]">
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
                    <div className="text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                      {s.id} • Mandate v{s.mandate.version ?? 1}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[11.5px] text-[#6e6e78] dark:text-[#8e8a83]">Total Ceiling</div>
                      <CurrencyDisplay
                        amount={s.mandate.maxTotalBudget}
                        currency={s.mandate.currency}
                        size="sm"
                      />
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#8e8a83] dark:text-[#76767e]" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
