"use client";

import React from "react";
import {
  PrimaryButton,
  GhostButton,
  StatusBadge,
  CurrencyDisplay,
  EmptyState,
} from "./SharedUI";
import {
  ShieldCheck,
  ChevronRight,
  Check,
} from "lucide-react";
import type { ProcurementSession } from "@/types/pactum";

interface OverviewScreenProps {
  sessions: ProcurementSession[];
  onStartNew: () => void;
  onOpenSession: (session: ProcurementSession) => void;
}

export function OverviewScreen({
  sessions,
  onStartNew,
  onOpenSession,
}: OverviewScreenProps) {
  const activeSession = sessions[0]; // Authoritative current session

  return (
    <div className="w-full space-y-16 sm:space-y-20 animate-in fade-in duration-300">
      {/* 1. HERO VAULT (DESIGN.md: Hero Vault)
          #000000 background filling full viewport width, concentric-arc pattern in muted strokes.
          Headline at 64px weight 500 white, line-height 1.0, tracking -1.28px.
          Subhead at 20px white at 70% opacity.
          Two buttons side by side: ghost + primary. */}
      <section className="w-full bg-obsidian text-paper-white py-16 sm:py-24 px-6 concentric-arcs-dark shadow-xl border-b border-bark-brown/30">
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-cards bg-paper-white/10 border border-paper-white/20 text-[14px] text-paper-white font-normal tracking-[-0.28px]">
            <span className="w-2 h-2 rounded-full bg-lichen-green" aria-hidden="true" />
            <span>Autonomous Procurement &amp; Verifiable Settlement</span>
          </div>

          <h1 className="text-[40px] sm:text-[64px] font-medium leading-[1.0] tracking-[-1.28px] text-paper-white max-w-4xl">
            Procurement, with proof.
          </h1>

          <p className="text-[18px] sm:text-[20px] text-paper-white/70 font-normal leading-[1.4] tracking-[-0.4px] max-w-2xl">
            Autonomous multi-vendor AI negotiation bounded by game-theoretic mechanism design, committed to a SHA-256 Merkle flight recorder, and settled behind an independent zero-trust PayPal audit gate.
          </p>

          <div className="pt-4 flex flex-wrap items-center gap-4">
            <PrimaryButton onClick={onStartNew} ariaLabel="Launch new procurement mandate">
              Launch Procurement Mandate
            </PrimaryButton>
            {activeSession ? (
              <GhostButton
                onClick={() => onOpenSession(activeSession)}
                className="text-paper-white border-paper-white hover:bg-paper-white/10"
                ariaLabel={`View active session ${activeSession.id}`}
              >
                View Active Session
              </GhostButton>
            ) : (
              <a
                href="https://sandbox.paypal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-smallelements bg-transparent border border-paper-white/80 hover:bg-paper-white/10 text-paper-white font-medium text-[16px] tracking-[-0.32px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-white"
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
        {/* 2. ACTIVE PROCUREMENT & VERIFICATION (Warm Feature Card: #f6f3ee, 24px radius, 40px padding) */}
        {activeSession ? (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8" aria-label="Active Procurement Mandate">
            {/* Active Mandate Card */}
            <div className="lg:col-span-7 bg-warm-cream rounded-cards p-8 sm:p-10 border border-smoke flex flex-col justify-between shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-architect-violet uppercase tracking-[-0.28px]">
                    Active Mandate State
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
                  <h2 className="text-[28px] sm:text-[36px] font-medium text-obsidian tracking-[-0.72px] leading-[1.2]">
                    {activeSession.mandate.itemQuery}
                  </h2>
                  <p className="text-[16px] text-[#555555] font-normal leading-[1.5] mt-2 line-clamp-2 tracking-[-0.32px]">
                    {activeSession.mandate.rawPrompt}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-smoke">
                  <div>
                    <div className="text-[14px] text-[#666666] mb-1">Target Quantity</div>
                    <div className="text-[24px] font-medium text-obsidian tracking-[-0.48px]">
                      {activeSession.mandate.quantity}{" "}
                      <span className="text-[14px] text-[#666666] font-normal">units</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[14px] text-[#666666] mb-1">Ceiling Budget</div>
                    <CurrencyDisplay
                      amount={activeSession.mandate.maxTotalBudget}
                      currency={activeSession.mandate.currency}
                      size="lg"
                    />
                  </div>
                  <div>
                    <div className="text-[14px] text-[#666666] mb-1">Vendor Proposals</div>
                    <div className="text-[24px] font-medium text-obsidian tracking-[-0.48px]">
                      {activeSession.quotes?.length ?? 0}{" "}
                      <span className="text-[14px] text-[#666666] font-normal">quotes</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-smoke flex items-center justify-between">
                <span className="text-[14px] text-[#666666] font-mono-token">
                  ID: {activeSession.id}
                </span>
                <button
                  onClick={() => onOpenSession(activeSession)}
                  className="inline-flex items-center gap-1.5 text-[16px] font-medium text-obsidian hover:text-ember-orange transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange rounded-smallelements px-2 py-1"
                >
                  <span>Open Session Workspace</span>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Lavender Feature Panel (DESIGN.md: Lavender Feature Panel: #f6f1fe, 24px radius, 40px padding, violet accent) */}
            <div className="lg:col-span-5 bg-lavender-mist rounded-cards p-8 sm:p-10 border border-architect-violet/20 concentric-arcs-violet flex flex-col justify-between shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-architect-violet uppercase tracking-[-0.28px]">
                    Verification &amp; Settlement
                  </span>
                  <ShieldCheck className="w-5 h-5 text-architect-violet" aria-hidden="true" />
                </div>

                <h3 className="text-[24px] font-medium text-obsidian tracking-[-0.48px] leading-[1.2]">
                  Independent Audit Gate
                </h3>

                <div className="space-y-3 pt-2">
                  <div className="p-4 rounded-[16px] bg-paper-white border border-smoke flex items-center justify-between">
                    <span className="text-[14px] text-obsidian font-normal">ACWORLD 5-Invariant Audit</span>
                    <span className="text-[14px] font-medium">
                      {activeSession.auditCertificate?.passed ? (
                        <span className="text-obsidian flex items-center gap-1.5 font-medium">
                          <Check className="w-4 h-4 text-lichen-green stroke-[3]" aria-hidden="true" /> Verified
                        </span>
                      ) : (
                        <span className="text-[#666666]">Pending Settle</span>
                      )}
                    </span>
                  </div>

                  <div className="p-4 rounded-[16px] bg-paper-white border border-smoke flex items-center justify-between">
                    <span className="text-[14px] text-obsidian font-normal">Merkle Flight Recorder</span>
                    <span className="text-[14px] font-medium">
                      {activeSession.preSettlementRoot ? (
                        <span className="text-obsidian flex items-center gap-1.5 font-medium">
                          <Check className="w-4 h-4 text-lichen-green stroke-[3]" aria-hidden="true" /> Committed
                        </span>
                      ) : (
                        <span className="text-[#666666]">In Progress</span>
                      )}
                    </span>
                  </div>

                  <div className="p-4 rounded-[16px] bg-paper-white border border-smoke flex items-center justify-between">
                    <span className="text-[14px] text-obsidian font-normal">PayPal Orders v2 Capture</span>
                    <span className="text-[14px] font-medium">
                      {activeSession.status === "SETTLED" || activeSession.status === "PAYPAL_CAPTURED" ? (
                        <span className="text-obsidian flex items-center gap-1.5 font-medium">
                          <Check className="w-4 h-4 text-lichen-green stroke-[3]" aria-hidden="true" /> Settled
                        </span>
                      ) : (
                        <span className="text-architect-violet font-medium">Gate Enforced</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[14px] text-[#555555] pt-6 border-t border-architect-violet/15 mt-4 leading-relaxed">
                Funds cannot be disbursed from PayPal without verifiable SHA-256 Merkle proofs.
              </p>
            </div>
          </section>
        ) : (
          <EmptyState
            title="No Active Procurement Sessions"
            description="Source wholesale offers from Channel3 and let Gemini negotiate optimal unit price and shipping terms within your private reservation price."
            actionLabel="Launch Procurement Mandate"
            onAction={onStartNew}
          />
        )}

        {/* 3. PROCUREMENT WORKFLOW (Warm Cream Surface with Mint Accent) */}
        <section className="bg-warm-cream rounded-cards p-8 sm:p-10 border border-smoke space-y-8" aria-label="Procurement Pipeline Stages">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[24px] font-medium text-obsidian tracking-[-0.48px]">
                The Verifiable Procurement Pipeline
              </h3>
              <p className="text-[16px] text-[#555555] mt-1 tracking-[-0.32px]">
                Deterministic mechanism design from requisition to PayPal settlement
              </p>
            </div>
            <div className="text-[14px] font-medium px-4 py-1.5 rounded-cards bg-mint-whisper text-obsidian border border-lichen-green/30 self-start sm:self-auto flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-lichen-green" aria-hidden="true" />
              <span>Zero-Trust Architecture</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              {
                step: "01",
                title: "Mandate",
                desc: "Natural language parsed into formal budget ceilings and delivery SLAs.",
                active: true,
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
                    ? "bg-paper-white border-obsidian shadow-[0px_4px_8px_0px_rgba(0,0,0,0.06)]"
                    : "bg-paper-white/60 border-smoke opacity-70"
                }`}
              >
                <div>
                  <span className="text-[12px] font-medium text-architect-violet tracking-wider uppercase">
                    {item.step}
                  </span>
                  <h4 className="text-[18px] font-medium text-obsidian mt-1 mb-2 tracking-[-0.36px]">
                    {item.title}
                  </h4>
                  <p className="text-[14px] text-[#555555] leading-relaxed tracking-[-0.28px]">{item.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-smoke">
                  <span className={`text-[12px] font-medium ${item.active ? "text-obsidian" : "text-[#777777]"}`}>
                    {item.active ? "● Active / Ready" : "○ Awaiting Turn"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. RECENT PROCUREMENT SESSIONS (Editorial Clean List) */}
        {sessions.length > 0 && (
          <section className="bg-paper-white rounded-cards border border-smoke overflow-hidden p-8 sm:p-10 space-y-6 shadow-[0px_4px_8px_0px_rgba(0,0,0,0.02)]" aria-label="Recent Sessions">
            <div className="flex items-center justify-between pb-4 border-b border-smoke">
              <h3 className="text-[24px] font-medium text-obsidian tracking-[-0.48px]">
                Recent Procurement Sessions
              </h3>
              <span className="text-[14px] text-[#666666]">
                {sessions.length} total records
              </span>
            </div>

            <div className="divide-y divide-smoke" role="list">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenSession(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenSession(s);
                    }
                  }}
                  className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-warm-cream/50 px-3 rounded-[12px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                  aria-label={`Open session ${s.id} for ${s.mandate.itemQuery}`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[16px] font-medium text-obsidian tracking-[-0.32px]">
                        {s.mandate.itemQuery}
                      </span>
                      <span className="text-[14px] text-[#666666]">
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
                    <div className="text-[12px] font-mono-token text-[#666666]">
                      {s.id} • Mandate v{s.mandate.version ?? 1}
                    </div>
                  </div>

                  <div className="flex items-center gap-8 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[12px] text-[#666666]">Total Budget</div>
                      <CurrencyDisplay
                        amount={s.mandate.maxTotalBudget}
                        currency={s.mandate.currency}
                        size="sm"
                      />
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#666666]" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
