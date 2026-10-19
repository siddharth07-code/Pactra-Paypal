"use client";

import React from "react";
import {
  MetricCard,
  StatusBadge,
  CurrencyDisplay,
  EmptyState,
} from "./SharedUI";
import {
  ArrowRight,
  Lock,
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
  const activeCount = sessions.filter(
    (s) => s.status !== "SETTLED" && s.status !== "AUDIT_FAILED"
  ).length;

  const totalVendors = sessions.reduce((acc, s) => acc + (s.quotes?.length || 0), 0);
  const auditedCount = sessions.filter((s) => s.auditCertificate?.passed).length;
  const settledCount = sessions.filter((s) => s.status === "SETTLED").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header & Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#203149] pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F1F5F9]">Procurement Overview</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Monitor autonomous sourcing, game-theoretic negotiations, cryptographic verification, and audited PayPal settlement.
          </p>
        </div>
        <button
          onClick={onStartNew}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#4597FF] hover:bg-[#4597FF]/90 text-white font-medium text-sm transition-all shadow-md shadow-[#4597FF]/10"
        >
          <span>New Procurement</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Sessions"
          value={String(activeCount)}
          subvalue={sessions.length > 0 ? `${sessions.length} total initiated` : "No sessions initiated"}
          accent="blue"
        />
        <MetricCard
          title="Vendors Evaluated"
          value={String(totalVendors)}
          subvalue="Multi-attribute Channel3 catalog"
          accent="purple"
        />
        <MetricCard
          title="Verified Invariants"
          value={String(auditedCount)}
          subvalue="Zero-trust ACWORLD audit pass"
          accent="emerald"
        />
        <MetricCard
          title="Settled Captures"
          value={String(settledCount)}
          subvalue="PayPal Orders v2 gated execution"
          accent="amber"
        />
      </div>

      {/* Workflow Lifecycle Visualizer */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
            PACTUM Institutional Pipeline
          </h3>
          <span className="text-xs font-mono text-[#4597FF] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Deterministic Trust Chain
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
          {[
            { step: "1. Mandate", desc: "Dynamic Constraints", status: "Dynamic" },
            { step: "2. Sourcing", desc: "Channel3 Wholesale", status: "3 Quotes" },
            { step: "3. Arena", desc: "Boulware β=3.0", status: "4 Rounds" },
            { step: "4. ACWORLD", desc: "5-Invariant Audit", status: "Fail-Closed" },
            { step: "5. PayPal v2", desc: "Orders Authorization", status: "custom_id" },
            { step: "6. Settlement", desc: "Audited Capture & Invoice", status: "Merkle Bound" },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-[#101F33]/70 border border-[#203149] rounded-lg p-3 text-center relative overflow-hidden"
            >
              <div className="text-xs font-semibold text-[#F1F5F9]">{item.step}</div>
              <div className="text-[11px] text-[#94A3B8] mt-1">{item.desc}</div>
              <div className="mt-2 inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-[#203149] text-[#4597FF]">
                {item.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#203149] flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
            Recent Procurement Sessions
          </h3>
          <span className="text-xs text-[#64748B] font-mono">Server In-Memory Storage</span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No Procurement Sessions Yet"
              description="Create a dynamic procurement mandate to experience autonomous multi-vendor AI negotiation, cryptographic Merkle flight recording, and audited PayPal settlement."
              actionLabel="Launch Procurement"
              onAction={onStartNew}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#101F33] text-xs font-mono uppercase text-[#94A3B8] border-b border-[#203149]">
                <tr>
                  <th className="px-6 py-3">Session ID</th>
                  <th className="px-6 py-3">Product / Objective</th>
                  <th className="px-6 py-3">Budget</th>
                  <th className="px-6 py-3">Vendors</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#203149]">
                {sessions.map((s) => {
                  let statusType: "verified" | "warning" | "failure" | "info" | "neutral" = "info";
                  if (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED") statusType = "verified";
                  else if (s.status === "AUDIT_FAILED") statusType = "failure";
                  else if (s.status === "NEGOTIATING") statusType = "warning";

                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-[#101F33]/40 transition-colors cursor-pointer"
                      onClick={() => onOpenSession(s)}
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#4597FF]">{s.id}</td>
                      <td className="px-6 py-4 font-medium text-[#F1F5F9] max-w-xs truncate">
                        {s.mandate.itemQuery} ({s.mandate.quantity} units)
                      </td>
                      <td className="px-6 py-4">
                        <CurrencyDisplay
                          amount={s.mandate.maxTotalBudget}
                          currency={s.mandate.currency}
                          size="sm"
                        />
                      </td>
                      <td className="px-6 py-4 text-[#94A3B8]">{s.quotes?.length ?? 0} quotes</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={statusType} label={s.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSession(s);
                          }}
                          className="px-3 py-1 rounded bg-[#203149] hover:bg-[#4597FF] hover:text-white text-xs font-medium text-[#94A3B8] transition-colors"
                        >
                          View Session
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
