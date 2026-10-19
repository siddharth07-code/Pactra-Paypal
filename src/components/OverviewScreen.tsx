"use client";

import React from "react";
import {
  StatusBadge,
  CurrencyDisplay,
  EmptyState,
} from "./SharedUI";
import {
  ArrowRight,
  ShieldCheck,
  ChevronRight,
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
  const activeSession = sessions[0]; // Most recent session

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F3F6FC]">Procurement overview</h1>
          <p className="text-sm text-[#9AAAC0] mt-1.5">
            Your procurement command center.
          </p>
        </div>
        <button
          onClick={onStartNew}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#5B9CFF] hover:bg-[#458AF0] text-[#07111F] font-semibold text-sm transition-all shadow-md shadow-[#5B9CFF]/15 cursor-pointer"
        >
          <span>New Procurement</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main Focus: Active Procurement & Verification Panels */}
      {activeSession ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* A. Prominent Active Procurement Panel */}
          <div className="lg:col-span-8 bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#5B9CFF]">
                  Active Procurement Mandate
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

              <div className="space-y-1 mb-6">
                <h2 className="text-2xl font-bold text-[#F3F6FC] tracking-tight">
                  {activeSession.mandate.itemQuery}
                </h2>
                <p className="text-sm text-[#9AAAC0] line-clamp-2 leading-relaxed">
                  {activeSession.mandate.rawPrompt}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-4 border-t border-[#23354B]/40">
                <div>
                  <div className="text-xs text-[#9AAAC0] mb-1 font-medium">Quantity</div>
                  <div className="text-xl font-bold text-[#F3F6FC]">
                    {activeSession.mandate.quantity}{" "}
                    <span className="text-xs font-normal text-[#9AAAC0]">units</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#9AAAC0] mb-1 font-medium">Mandate Budget</div>
                  <CurrencyDisplay
                    amount={activeSession.mandate.maxTotalBudget}
                    currency={activeSession.mandate.currency}
                    size="lg"
                  />
                </div>
                <div>
                  <div className="text-xs text-[#9AAAC0] mb-1 font-medium">Vendors Evaluated</div>
                  <div className="text-xl font-bold text-[#F3F6FC]">
                    {activeSession.quotes?.length ?? 0}{" "}
                    <span className="text-xs font-normal text-[#9AAAC0]">competing</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-[#23354B]/40 flex items-center justify-between">
              <span className="text-xs text-[#64758E] font-mono-token">
                ID: {activeSession.id}
              </span>
              <button
                onClick={() => onOpenSession(activeSession)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#5B9CFF] hover:text-[#458AF0] transition-colors cursor-pointer"
              >
                <span>Open Current Session</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* B. Verification Status Panel */}
          <div className="lg:col-span-4 bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9AAAC0]">
                  Verification Status
                </span>
                <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
              </div>

              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#132438]/70 border border-[#23354B]/40">
                  <div className="text-xs text-[#9AAAC0] mb-1">ACWORLD Final-State Audit</div>
                  <div className="text-sm font-semibold text-[#F3F6FC] flex items-center gap-2">
                    {activeSession.auditCertificate ? (
                      activeSession.auditCertificate.passed ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
                          <span>5 Invariants Verified</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                          <span>Audit Invariants Blocked</span>
                        </>
                      )
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[#9AAAC0]" />
                        <span>Awaiting Final Offer</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#132438]/70 border border-[#23354B]/40">
                  <div className="text-xs text-[#9AAAC0] mb-1">Evidence Chain</div>
                  <div className="text-sm font-semibold text-[#F3F6FC] flex items-center gap-2">
                    {activeSession.preSettlementRoot ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
                        <span>SHA-256 Merkle Root Committed</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[#9AAAC0]" />
                        <span>Recording Negotiation Turns</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#132438]/70 border border-[#23354B]/40">
                  <div className="text-xs text-[#9AAAC0] mb-1">PayPal Settlement</div>
                  <div className="text-sm font-semibold text-[#F3F6FC] flex items-center gap-2">
                    {activeSession.status === "SETTLED" ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
                        <span>Audited Capture Executed</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                        <span>Behind Fail-Closed Audit Gate</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-[#64758E] pt-4 border-t border-[#23354B]/40">
              Deterministic mechanism-design firewall enforced server-side.
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No active procurement sessions"
          description="Create a dynamic procurement mandate to experience autonomous multi-vendor AI negotiation, cryptographic Merkle flight recording, and audited PayPal settlement."
          actionLabel="Launch New Procurement"
          onAction={onStartNew}
        />
      )}

      {/* C. Visually Refined Procurement Workflow */}
      <div className="bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-[#F3F6FC]">Institutional Procurement Pipeline</h3>
            <p className="text-xs text-[#9AAAC0] mt-0.5">End-to-end autonomous transaction and settlement lifecycle</p>
          </div>
          <span className="text-xs font-medium text-[#5B9CFF] bg-[#5B9CFF]/10 px-3 py-1 rounded-full">
            Fail-Closed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            {
              step: "1. Mandate",
              title: "Dynamic Constraints",
              desc: "Natural language parsed into formal budget ceiling & SLA requirements.",
              active: true,
            },
            {
              step: "2. Sourcing",
              title: "Channel3 Wholesale",
              desc: "Simultaneous multi-vendor catalog discovery and baseline price retrieval.",
              active: Boolean(activeSession?.quotes?.length),
            },
            {
              step: "3. Arena",
              title: "Boulware Negotiation",
              desc: "Gemini agent negotiates with 3 vendors bounded by strict utility decay (β=3.0).",
              active: Boolean(activeSession?.turns?.length),
            },
            {
              step: "4. Verification",
              title: "ACWORLD Audit Gate",
              desc: "Independent zero-trust evaluation of 5 mathematical & cryptographic invariants.",
              active: Boolean(activeSession?.auditCertificate),
            },
            {
              step: "5. Settlement",
              title: "Audited PayPal Capture",
              desc: "Order authorization and capture executed only upon verified audit pass.",
              active: activeSession?.status === "SETTLED",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`rounded-xl p-4.5 transition-all border ${
                item.active
                  ? "bg-[#132438] border-[#5B9CFF]/30 text-[#F3F6FC]"
                  : "bg-[#07111F]/50 border-[#23354B]/30 text-[#64758E]"
              }`}
            >
              <div className="text-xs font-semibold text-[#5B9CFF] mb-1">{item.step}</div>
              <div className="text-sm font-semibold text-[#F3F6FC] mb-1.5">{item.title}</div>
              <p className="text-xs text-[#9AAAC0] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* D. Recent Procurement Sessions */}
      {sessions.length > 0 && (
        <div className="bg-[#0D1B2B] rounded-2xl card-shadow border border-[#23354B]/60 overflow-hidden">
          <div className="px-7 py-5 border-b border-[#23354B]/40 flex items-center justify-between">
            <h3 className="text-base font-bold text-[#F3F6FC]">Recent procurement sessions</h3>
            <span className="text-xs text-[#9AAAC0]">{sessions.length} total sessions recorded</span>
          </div>

          <div className="divide-y divide-[#23354B]/40">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => onOpenSession(s)}
                className="px-7 py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#132438]/50 transition-colors cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm text-[#F3F6FC]">{s.mandate.itemQuery}</span>
                    <span className="text-xs text-[#9AAAC0]">({s.mandate.quantity} units)</span>
                    <StatusBadge
                      status={
                        s.status === "SETTLED"
                          ? "verified"
                          : s.status === "AUDIT_FAILED"
                          ? "failure"
                          : "info"
                      }
                      label={s.status.replace(/_/g, " ")}
                      size="sm"
                    />
                  </div>
                  <div className="text-xs text-[#64758E] font-mono-token">{s.id}</div>
                </div>

                <div className="flex items-center gap-6 self-end sm:self-center">
                  <div className="text-right">
                    <div className="text-xs text-[#9AAAC0]">Budget</div>
                    <CurrencyDisplay
                      amount={s.mandate.maxTotalBudget}
                      currency={s.mandate.currency}
                      size="sm"
                    />
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#64758E]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
