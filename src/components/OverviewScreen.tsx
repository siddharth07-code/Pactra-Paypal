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
    <div className="w-full space-y-16 sm:space-y-20 animate-in fade-in duration-300">
      {/* 1. HERO VAULT (DESIGN.md & Section 7: Hero Vault)
          Obsidian background filling full viewport width with concentric-arc pattern.
          Headline: "Procurement, with proof."
          Subtext: "Source intelligently. Negotiate within constraints. Settle only when the evidence checks out."
          Dual CTAs: Primary + Ghost Secondary. */}
      <section className="w-full bg-[#000000] text-white py-16 sm:py-24 px-6 concentric-arcs-dark shadow-xl border-b border-[#333333]">
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-cards bg-white/10 border border-white/20 text-[14px] text-white font-normal tracking-[-0.28px]">
            <span className="w-2 h-2 rounded-full bg-lichen-green" aria-hidden="true" />
            <span>Autonomous Procurement &amp; Verifiable Settlement</span>
          </div>

          <h1 className="text-[40px] sm:text-[64px] font-medium leading-[1.05] tracking-[-1.28px] text-white max-w-4xl">
            Procurement, with proof.
          </h1>

          <p className="text-[18px] sm:text-[20px] text-white/80 font-normal leading-[1.4] tracking-[-0.4px] max-w-2xl">
            Source intelligently. Negotiate within constraints. Settle only when the evidence checks out.
          </p>

          <div className="pt-4 flex flex-wrap items-center gap-4">
            <PrimaryButton onClick={onStartNew} ariaLabel="Launch new procurement mandate">
              Launch Procurement Mandate
            </PrimaryButton>
            {activeSession ? (
              <GhostButton
                onClick={() => onOpenSession(activeSession)}
                className="text-white border-white hover:bg-white/10"
                ariaLabel={`View active session ${activeSession.id}`}
              >
                View Active Session
              </GhostButton>
            ) : onNavigateHistory ? (
              <GhostButton
                onClick={onNavigateHistory}
                className="text-white border-white hover:bg-white/10"
                ariaLabel="Browse procurement history"
              >
                Browse History
              </GhostButton>
            ) : (
              <a
                href="https://sandbox.paypal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-smallelements bg-transparent border border-white/80 hover:bg-white/10 text-white font-medium text-[16px] tracking-[-0.32px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Explore PayPal Sandbox in new tab"
              >
                Explore Sandbox
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Centered Page Body (1200px max width container) */}
      <div className="max-w-[1200px] mx-auto px-6 space-y-16 sm:space-y-20 w-full">
        {/* 2. REAL METRIC TILES (Section 7) */}
        <section aria-label="Procurement Metrics">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-6 sm:p-8 border border-smoke dark:border-[#333333] shadow-sm transition-colors">
              <div className="flex items-center justify-between text-[#666666] dark:text-[#a5a19b] text-[14px] mb-2 font-medium">
                <span>Total Mandate Ceiling</span>
                <TrendingUp className="w-4 h-4 text-ember-orange" aria-hidden="true" />
              </div>
              <div className="text-[28px] sm:text-[36px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.72px]">
                <CurrencyDisplay amount={totalVolume} size="xl" />
              </div>
              <p className="text-[13px] text-[#888888] dark:text-[#888888] mt-2">
                Across {sessions.length} recorded procurement sessions
              </p>
            </div>

            <div className="bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-6 sm:p-8 border border-smoke dark:border-[#333333] shadow-sm transition-colors">
              <div className="flex items-center justify-between text-[#666666] dark:text-[#a5a19b] text-[14px] mb-2 font-medium">
                <span>Active Mandate Runs</span>
                <Layers className="w-4 h-4 text-architect-violet dark:text-[#9d6ce6]" aria-hidden="true" />
              </div>
              <div className="text-[28px] sm:text-[36px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.72px]">
                {activeCount}
              </div>
              <p className="text-[13px] text-[#888888] dark:text-[#888888] mt-2">
                Evaluating quotes or ready for settlement
              </p>
            </div>

            <div className="bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-6 sm:p-8 border border-smoke dark:border-[#333333] shadow-sm transition-colors">
              <div className="flex items-center justify-between text-[#666666] dark:text-[#a5a19b] text-[14px] mb-2 font-medium">
                <span>Cryptographically Settled</span>
                <ShieldCheck className="w-4 h-4 text-lichen-green" aria-hidden="true" />
              </div>
              <div className="text-[28px] sm:text-[36px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.72px]">
                {settledCount}
              </div>
              <p className="text-[13px] text-[#888888] dark:text-[#888888] mt-2">
                Audited &amp; captured via PayPal Orders v2
              </p>
            </div>
          </div>
        </section>

        {/* 3. ACTIVE PROCUREMENT & VERIFICATION (Warm Feature Card) */}
        {activeSession && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8" aria-label="Active Procurement Mandate">
            {/* Active Mandate Card */}
            <div className="lg:col-span-7 bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-8 sm:p-10 border border-smoke dark:border-[#333333] flex flex-col justify-between shadow-sm transition-colors">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-architect-violet dark:text-[#9d6ce6] uppercase tracking-[-0.28px]">
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
                  <h2 className="text-[28px] sm:text-[36px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.72px] leading-[1.2]">
                    {activeSession.mandate.itemQuery}
                  </h2>
                  <p className="text-[16px] text-[#555555] dark:text-[#c4c0ba] font-normal leading-[1.5] mt-2 line-clamp-2 tracking-[-0.32px]">
                    {activeSession.mandate.rawPrompt}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-smoke dark:border-[#333333]">
                  <div>
                    <div className="text-[14px] text-[#666666] dark:text-[#a5a19b] mb-1">Target Quantity</div>
                    <div className="text-[24px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.48px]">
                      {activeSession.mandate.quantity}{" "}
                      <span className="text-[14px] text-[#666666] dark:text-[#a5a19b] font-normal">units</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[14px] text-[#666666] dark:text-[#a5a19b] mb-1">Ceiling Budget</div>
                    <CurrencyDisplay
                      amount={activeSession.mandate.maxTotalBudget}
                      currency={activeSession.mandate.currency}
                      size="lg"
                    />
                  </div>
                  <div>
                    <div className="text-[14px] text-[#666666] dark:text-[#a5a19b] mb-1">Vendor Proposals</div>
                    <div className="text-[24px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.48px]">
                      {activeSession.quotes?.length ?? 0}{" "}
                      <span className="text-[14px] text-[#666666] dark:text-[#a5a19b] font-normal">quotes</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-smoke dark:border-[#333333] flex items-center justify-between">
                <span className="text-[14px] text-[#666666] dark:text-[#a5a19b] font-mono-token">
                  {activeSession.id}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenSession(activeSession)}
                  className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ember-orange hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange rounded"
                >
                  <span>Resume Session</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Cryptographic Flight Recorder Status Panel */}
            <div className="lg:col-span-5 bg-lavender-mist dark:bg-[#271f33] rounded-cards p-8 sm:p-10 border border-architect-violet/20 dark:border-architect-violet/40 flex flex-col justify-between concentric-arcs-violet transition-colors">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-architect-violet dark:text-[#9d6ce6] uppercase tracking-[-0.28px]">
                    Flight Recorder
                  </span>
                  <span className="text-[12px] font-mono-token text-architect-violet dark:text-[#9d6ce6] bg-white/60 dark:bg-black/40 px-2 py-0.5 rounded border border-architect-violet/20">
                    SHA-256
                  </span>
                </div>

                <h3 className="text-[24px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.48px]">
                  VeriPay Cryptographic Proof
                </h3>

                <p className="text-[14px] text-[#555555] dark:text-[#c4c0ba] leading-relaxed">
                  Canonical procurement events, supplier quotes, Boulware negotiation turns, and independent ACWORLD invariant checks are hashed in binary sequence to create an immutable Merkle root.
                </p>

                <div className="space-y-2 pt-2">
                  <div className="text-[12px] text-[#666666] dark:text-[#a5a19b] font-medium">Pre-Settlement Merkle Root:</div>
                  <div className="p-3 bg-white dark:bg-[#1a1a1a] rounded-smallelements border border-smoke dark:border-[#383838] font-mono-token text-xs text-obsidian dark:text-[#f5f3ef] break-all">
                    {activeSession.merkleRoot || activeSession.preSettlementRoot || "Pending negotiation rounds..."}
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-architect-violet/20 dark:border-architect-violet/40 flex items-center justify-between text-[13px] text-architect-violet dark:text-[#9d6ce6]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  Bound to PayPal custom_id
                </span>
                <span>{activeSession.turns?.length ?? 0} Turns Committed</span>
              </div>
            </div>
          </section>
        )}

        {/* 4. FIVE-STAGE PROCUREMENT PIPELINE (Section 7) */}
        <section aria-label="Five-stage Procurement Pipeline">
          <div className="mb-6">
            <h3 className="text-[24px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.48px]">
              End-to-End Procurement Lifecycle
            </h3>
            <p className="text-[14px] text-[#666666] dark:text-[#a5a19b] mt-1">
              Deterministic mechanism design and cryptographic settlement pipeline
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                step: "01",
                title: "Mandate",
                desc: "Natural-language prompt parsed into validated quantity, budget, and SLA constraints.",
                active: Boolean(activeSession?.mandate),
              },
              {
                step: "02",
                title: "Sourcing",
                desc: "Multi-vendor catalog inquiry across wholesale Channel3 suppliers.",
                active: Boolean(activeSession?.quotes?.length),
              },
              {
                step: "03",
                title: "Arena",
                desc: "Gemini buyer negotiates bounded by Boulware time-decay utility (β=3.0).",
                active: Boolean(activeSession?.turns?.length),
              },
              {
                step: "04",
                title: "ACWORLD",
                desc: "Independent audit verifying SKU, price ceiling, and DOM return policy.",
                active: Boolean(activeSession?.auditCertificate),
              },
              {
                step: "05",
                title: "Settlement",
                desc: "PayPal Orders v2 authorization & capture bound to Merkle root.",
                active: activeSession?.status === "SETTLED" || activeSession?.status === "PAYPAL_CAPTURED",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className={`rounded-[16px] p-5 border transition-all flex flex-col justify-between ${
                  item.active
                    ? "bg-paper-white dark:bg-[#222222] border-obsidian dark:border-smoke shadow-sm"
                    : "bg-paper-white/60 dark:bg-[#1a1a1a]/60 border-smoke dark:border-[#2e2e2e] opacity-70"
                }`}
              >
                <div>
                  <span className="text-[12px] font-medium text-architect-violet dark:text-[#9d6ce6] tracking-wider uppercase">
                    {item.step}
                  </span>
                  <h4 className="text-[18px] font-medium text-obsidian dark:text-[#f5f3ef] mt-1 mb-2 tracking-[-0.36px]">
                    {item.title}
                  </h4>
                  <p className="text-[14px] text-[#555555] dark:text-[#c4c0ba] leading-relaxed tracking-[-0.28px]">{item.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-smoke dark:border-[#333333]">
                  <span className={`text-[12px] font-medium ${item.active ? "text-lichen-green" : "text-[#777777] dark:text-[#888888]"}`}>
                    {item.active ? "● Active / Ready" : "○ Awaiting Turn"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. RECENT PROCUREMENT SESSIONS */}
        {sessions.length > 0 && (
          <section className="bg-paper-white dark:bg-[#1a1a1a] rounded-cards border border-smoke dark:border-[#333333] overflow-hidden p-8 sm:p-10 space-y-6 shadow-sm transition-colors" aria-label="Recent Sessions">
            <div className="flex items-center justify-between pb-4 border-b border-smoke dark:border-[#333333]">
              <h3 className="text-[24px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.48px]">
                Recent Procurement Sessions
              </h3>
              <span className="text-[14px] text-[#666666] dark:text-[#a5a19b]">
                {sessions.length} total records
              </span>
            </div>

            <div className="divide-y divide-smoke dark:divide-[#2e2e2e]" role="list">
              {sessions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  className="w-full text-left py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-warm-cream/50 dark:hover:bg-[#222222] px-3 rounded-[12px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                  aria-label={`Open session ${s.id} for ${s.mandate.itemQuery}`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[16px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.32px]">
                        {s.mandate.itemQuery}
                      </span>
                      <span className="text-[14px] text-[#666666] dark:text-[#a5a19b]">
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
                    <div className="text-[12px] font-mono-token text-[#666666] dark:text-[#a5a19b]">
                      {s.id} • Mandate v{s.mandate.version ?? 1}
                    </div>
                  </div>

                  <div className="flex items-center gap-8 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[12px] text-[#666666] dark:text-[#a5a19b]">Total Budget</div>
                      <CurrencyDisplay
                        amount={s.mandate.maxTotalBudget}
                        currency={s.mandate.currency}
                        size="sm"
                      />
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#666666] dark:text-[#a5a19b]" aria-hidden="true" />
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
