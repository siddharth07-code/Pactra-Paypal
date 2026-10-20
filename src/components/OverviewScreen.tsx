"use client";

import React from "react";
import {
  PrimaryButton,
  StatusBadge,
  CurrencyDisplay,
  EmptyState,
} from "./SharedUI";
import {
  ArrowRight,
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
    <div className="space-y-20 animate-in fade-in duration-300">
      {/* 1. HERO VAULT (DESIGN.md: Hero Vault)
          #000000 background, rounded bottom corners (24px) or full 24px inner container.
          Large concentric-arc pattern in muted strokes (#aa8855, #665233).
          Headline at 64px weight 500 white, line-height 1.0, tracking -1.28px.
          Subhead at 20px white at 70% opacity.
          Two buttons side by side: ghost + primary. */}
      <section className="relative bg-[#000000] text-[#ffffff] rounded-[24px] p-8 sm:p-16 overflow-hidden concentric-arcs-dark shadow-[0px_16px_32px_0px_rgba(0,0,0,0.25)]">
        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-[24px] bg-[#ffffff]/10 border border-[#ffffff]/20 text-[14px] text-[#ffffff] font-normal">
            <span className="w-2 h-2 rounded-full bg-[#00cc88]" />
            <span>Autonomous Procurement &amp; Verifiable Settlement</span>
          </div>

          <h1 className="text-[44px] sm:text-[64px] font-medium leading-[1.0] tracking-[-1.28px] text-[#ffffff]">
            Procurement, with proof.
          </h1>

          <p className="text-[18px] sm:text-[20px] text-[#ffffff]/70 font-normal leading-[1.4] tracking-[-0.4px] max-w-2xl">
            Autonomous multi-vendor AI negotiation bounded by game-theoretic mechanism design, committed to a SHA-256 Merkle flight recorder, and settled behind an independent zero-trust PayPal audit gate.
          </p>

          <div className="pt-4 flex flex-wrap items-center gap-4">
            <PrimaryButton onClick={onStartNew}>
              Launch Procurement Mandate
            </PrimaryButton>
            {activeSession && (
              <button
                onClick={() => onOpenSession(activeSession)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-[8px] bg-transparent border border-[#ffffff] hover:bg-[#ffffff]/10 text-[#ffffff] font-medium text-[16px] transition-all cursor-pointer"
              >
                <span>View Active Session</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. ACTIVE PROCUREMENT & VERIFICATION (Warm Feature Card: #f6f3ee, 24px radius, 40px padding) */}
      {activeSession ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Active Mandate Card */}
          <div className="lg:col-span-7 bg-[#f6f3ee] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-[#5c2999] uppercase tracking-[-0.28px]">
                  Active Mandate State
                </span>
                <StatusBadge
                  status={
                    activeSession.status === "SETTLED"
                      ? "verified"
                      : activeSession.status === "AUDIT_FAILED"
                      ? "failure"
                      : "info"
                  }
                  label={activeSession.status.replace(/_/g, " ")}
                />
              </div>

              <div>
                <h2 className="text-[28px] sm:text-[36px] font-medium text-[#000000] tracking-[-0.72px] leading-[1.2]">
                  {activeSession.mandate.itemQuery}
                </h2>
                <p className="text-[16px] text-[#888888] font-normal leading-[1.5] mt-2 line-clamp-2">
                  {activeSession.mandate.rawPrompt}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-[#e5e5e5]">
                <div>
                  <div className="text-[14px] text-[#888888] mb-1">Target Quantity</div>
                  <div className="text-[24px] font-medium text-[#000000] tracking-tight">
                    {activeSession.mandate.quantity}{" "}
                    <span className="text-[14px] text-[#888888] font-normal">units</span>
                  </div>
                </div>
                <div>
                  <div className="text-[14px] text-[#888888] mb-1">Ceiling Budget</div>
                  <CurrencyDisplay
                    amount={activeSession.mandate.maxTotalBudget}
                    currency={activeSession.mandate.currency}
                    size="lg"
                  />
                </div>
                <div>
                  <div className="text-[14px] text-[#888888] mb-1">Vendor Proposals</div>
                  <div className="text-[24px] font-medium text-[#000000] tracking-tight">
                    {activeSession.quotes?.length ?? 0}{" "}
                    <span className="text-[14px] text-[#888888] font-normal">quotes</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-[#e5e5e5] flex items-center justify-between">
              <span className="text-[14px] text-[#888888] font-mono-token">
                ID: {activeSession.id}
              </span>
              <button
                onClick={() => onOpenSession(activeSession)}
                className="inline-flex items-center gap-1.5 text-[16px] font-medium text-[#000000] hover:text-[#ff6600] transition-colors cursor-pointer"
              >
                <span>Open Session Workspace</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lavender Feature Panel (DESIGN.md: Lavender Feature Panel: #f6f1fe, 24px radius, 40px padding, violet accent) */}
          <div className="lg:col-span-5 bg-[#f6f1fe] rounded-[24px] p-8 sm:p-10 border border-[#5c2999]/20 concentric-arcs-violet flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-[#5c2999] uppercase tracking-[-0.28px]">
                  Verification &amp; Settlement
                </span>
                <ShieldCheck className="w-5 h-5 text-[#5c2999]" />
              </div>

              <h3 className="text-[24px] font-medium text-[#000000] tracking-[-0.48px] leading-[1.2]">
                Independent Audit Gate
              </h3>

              <div className="space-y-3 pt-2">
                <div className="p-4 rounded-[16px] bg-[#ffffff] border border-[#e5e5e5] flex items-center justify-between">
                  <span className="text-[14px] text-[#000000]">ACWORLD 5-Invariant Audit</span>
                  <span className="text-[14px] font-medium">
                    {activeSession.auditCertificate?.passed ? (
                      <span className="text-[#00cc88] flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Verified
                      </span>
                    ) : (
                      <span className="text-[#888888]">Pending Settle</span>
                    )}
                  </span>
                </div>

                <div className="p-4 rounded-[16px] bg-[#ffffff] border border-[#e5e5e5] flex items-center justify-between">
                  <span className="text-[14px] text-[#000000]">Merkle Flight Recorder</span>
                  <span className="text-[14px] font-medium">
                    {activeSession.preSettlementRoot ? (
                      <span className="text-[#00cc88] flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Committed
                      </span>
                    ) : (
                      <span className="text-[#888888]">In Progress</span>
                    )}
                  </span>
                </div>

                <div className="p-4 rounded-[16px] bg-[#ffffff] border border-[#e5e5e5] flex items-center justify-between">
                  <span className="text-[14px] text-[#000000]">PayPal Orders v2 Capture</span>
                  <span className="text-[14px] font-medium">
                    {activeSession.status === "SETTLED" ? (
                      <span className="text-[#00cc88] flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Settled
                      </span>
                    ) : (
                      <span className="text-[#5c2999]">Gate Enforced</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[14px] text-[#888888] pt-6 border-t border-[#5c2999]/15 mt-4">
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
      <section className="bg-[#f6f3ee] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-[24px] font-medium text-[#000000] tracking-[-0.48px]">
              The Verifiable Procurement Pipeline
            </h3>
            <p className="text-[16px] text-[#888888] mt-1">
              Deterministic mechanism design from requisition to PayPal settlement
            </p>
          </div>
          <div className="text-[14px] font-medium px-4 py-1.5 rounded-[24px] bg-[#ebfef6] text-[#00cc88] border border-[#00cc88]/30 self-start sm:self-auto">
            Zero-Trust Architecture
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
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
              active: activeSession?.status === "SETTLED",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`rounded-[16px] p-5 border transition-all flex flex-col justify-between ${
                item.active
                  ? "bg-[#ffffff] border-[#000000] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.06)]"
                  : "bg-[#ffffff]/60 border-[#e5e5e5] opacity-70"
              }`}
            >
              <div>
                <span className="text-[12px] font-medium text-[#5c2999] tracking-wider uppercase">
                  {item.step}
                </span>
                <h4 className="text-[18px] font-medium text-[#000000] mt-1 mb-2">
                  {item.title}
                </h4>
                <p className="text-[14px] text-[#888888] leading-relaxed">{item.desc}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#e5e5e5]">
                <span className={`text-[12px] font-medium ${item.active ? "text-[#00cc88]" : "text-[#888888]"}`}>
                  {item.active ? "Active / Ready" : "Awaiting Turn"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. RECENT PROCUREMENT SESSIONS (Editorial Clean List) */}
      {sessions.length > 0 && (
        <section className="bg-[#ffffff] rounded-[24px] border border-[#e5e5e5] overflow-hidden p-8 sm:p-10 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#e5e5e5]">
            <h3 className="text-[24px] font-medium text-[#000000] tracking-[-0.48px]">
              Recent Procurement Sessions
            </h3>
            <span className="text-[14px] text-[#888888]">
              {sessions.length} total records
            </span>
          </div>

          <div className="divide-y divide-[#e5e5e5]">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => onOpenSession(s)}
                className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#f6f3ee]/50 px-3 rounded-[12px] transition-colors cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[16px] font-medium text-[#000000]">
                      {s.mandate.itemQuery}
                    </span>
                    <span className="text-[14px] text-[#888888]">
                      ({s.mandate.quantity} units)
                    </span>
                    <StatusBadge
                      status={
                        s.status === "SETTLED"
                          ? "verified"
                          : s.status === "AUDIT_FAILED"
                          ? "failure"
                          : "info"
                      }
                      label={s.status.replace(/_/g, " ")}
                    />
                  </div>
                  <div className="text-[12px] font-mono-token text-[#888888]">
                    {s.id} • Mandate v{s.mandate.version ?? 1}
                  </div>
                </div>

                <div className="flex items-center gap-8 self-end sm:self-center">
                  <div className="text-right">
                    <div className="text-[12px] text-[#888888]">Total Budget</div>
                    <CurrencyDisplay
                      amount={s.mandate.maxTotalBudget}
                      currency={s.mandate.currency}
                      size="sm"
                    />
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#888888]" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
