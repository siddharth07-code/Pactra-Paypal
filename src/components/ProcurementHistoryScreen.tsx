"use client";

import React, { useState, useEffect } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
  EmptyState,
  CopyableHash,
} from "./SharedUI";
import {
  Search,
  Filter,
  ChevronRight,
  Eye,
  X,
  ArrowRight,
} from "lucide-react";
import type { ProcurementSession } from "@/types/pactum";

interface ProcurementHistoryScreenProps {
  sessions: ProcurementSession[];
  onSelectSession: (session: ProcurementSession) => void;
  onStartNew: () => void;
}

export function ProcurementHistoryScreen({
  sessions,
  onSelectSession,
  onStartNew,
}: ProcurementHistoryScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [inspectedSession, setInspectedSession] = useState<ProcurementSession | null>(null);

  // Close inspector on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && inspectedSession) {
        setInspectedSession(null);
      }
    };
    if (inspectedSession) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [inspectedSession]);

  const filteredSessions = sessions.filter((s) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      query === "" ||
      s.id.toLowerCase().includes(query) ||
      s.mandate.itemQuery.toLowerCase().includes(query) ||
      (s.selectedQuote?.vendorName.toLowerCase().includes(query) ?? false);

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "SETTLED" && (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED")) ||
      (statusFilter === "FAILED" && s.status === "AUDIT_FAILED") ||
      (statusFilter === "ACTIVE" && s.status !== "SETTLED" && s.status !== "AUDIT_FAILED" && s.status !== "CANCELLED");

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-smoke/80 dark:border-[#27272a]">
        <div>
          <span className="text-[11.5px] font-mono uppercase tracking-[0.08em] text-architect-violet dark:text-[#b490f5] font-medium block mb-1">
            Authoritative Audit Trail
          </span>
          <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-obsidian dark:text-[#f6f4f0]">
            Procurement History
          </h1>
          <p className="text-[14px] text-secondary mt-1 max-w-2xl leading-relaxed">
            Immutable transaction records of procurement mandates, negotiated supplier terms, Merkle roots, and cryptographic audit proofs.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11.5px] font-mono-token text-secondary bg-smoke/40 dark:bg-[#1f1f23] px-3 py-1 rounded-[6px] border border-smoke dark:border-[#27272a]">
            Authoritative In-Memory Store
          </span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-paper-white dark:bg-[#18181b] rounded-[10px] p-4 sm:p-5 border border-smoke dark:border-[#2b2b32] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#888888]" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by ID, item, or vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-warm-cream/40 dark:bg-[#121214] rounded-[8px] pl-10 pr-9 py-2 text-[14px] text-obsidian dark:text-[#f5f3ef] border border-smoke dark:border-[#2e2e34] focus:outline-none focus:border-obsidian dark:focus:border-white focus-visible:ring-2 focus-visible:ring-ember-orange transition-colors"
            aria-label="Search procurement sessions"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-[#888888] hover:text-obsidian dark:hover:text-white"
              aria-label="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto self-start sm:self-auto">
          <Filter className="w-4 h-4 text-[#888888]" aria-hidden="true" />
          <label htmlFor="history-status-filter" className="sr-only">Filter by session status</label>
          <select
            id="history-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-warm-cream/40 dark:bg-[#121214] rounded-[8px] px-3.5 py-2 text-[13.5px] text-obsidian dark:text-[#f5f3ef] border border-smoke dark:border-[#2e2e34] focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer font-medium transition-colors"
          >
            <option value="ALL">All States ({sessions.length})</option>
            <option value="SETTLED">Settled &amp; Captured</option>
            <option value="ACTIVE">Active in Negotiation</option>
            <option value="FAILED">Audit Blocked</option>
          </select>
        </div>
      </div>

      {/* Institutional Financial Data Table */}
      <div className="bg-paper-white dark:bg-[#18181b] rounded-[12px] border border-smoke dark:border-[#2b2b32] shadow-xs overflow-hidden transition-colors">
        {filteredSessions.length === 0 ? (
          <div className="p-16">
            <EmptyState
              title="No Historical Sessions Found"
              description="No procurement sessions matched the filter criteria. Initiate a new procurement mandate to build your verifiable audit trail."
              actionLabel="Launch Procurement Mandate"
              onAction={onStartNew}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px] border-collapse">
              <thead>
                <tr className="border-b border-smoke dark:border-[#28282e] bg-warm-cream/50 dark:bg-[#141416] text-[11.5px] font-mono uppercase tracking-[0.06em] text-[#666666] dark:text-[#8e8e96]">
                  <th scope="col" className="py-3.5 pl-6 pr-4 font-medium">Session ID</th>
                  <th scope="col" className="py-3.5 px-4 font-medium">Item Specification</th>
                  <th scope="col" className="py-3.5 px-4 font-medium">Supplier</th>
                  <th scope="col" className="py-3.5 px-4 font-medium text-right">Qty</th>
                  <th scope="col" className="py-3.5 px-4 font-medium text-right">Ceiling Budget</th>
                  <th scope="col" className="py-3.5 px-4 font-medium text-center">Audit Status</th>
                  <th scope="col" className="py-3.5 px-4 font-medium text-center">Lifecycle State</th>
                  <th scope="col" className="py-3.5 pl-4 pr-6 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-smoke/80 dark:divide-[#242429]">
                {filteredSessions.map((s) => {
                  let badgeStatus: "verified" | "warning" | "failure" | "info" | "neutral" = "info";
                  if (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED") badgeStatus = "verified";
                  else if (s.status === "AUDIT_FAILED") badgeStatus = "failure";
                  else if (s.status === "NEGOTIATING") badgeStatus = "warning";

                  const isAuditPassed = s.auditCertificate?.passed === true;

                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-warm-cream/35 dark:hover:bg-[#1f1f23] transition-colors group"
                    >
                      {/* Session ID */}
                      <td className="py-4 pl-6 pr-4 whitespace-nowrap">
                        <span className="font-mono text-[12.5px] font-medium text-obsidian dark:text-[#f5f3ef]">
                          {s.id}
                        </span>
                      </td>

                      {/* Item Specification */}
                      <td className="py-4 px-4">
                        <div className="font-medium text-obsidian dark:text-[#f5f3ef] line-clamp-1 max-w-[220px]">
                          {s.mandate.itemQuery}
                        </div>
                        <div className="text-[12px] text-[#666666] dark:text-[#a5a19b]">
                          {s.mandate.requiredSpecs.join(", ") || "Standard SLA"}
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="font-medium text-obsidian dark:text-[#f5f3ef]">
                          {s.selectedQuote?.vendorName || "Evaluating Baselines"}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="py-4 px-4 text-right tabular-nums whitespace-nowrap text-obsidian dark:text-[#f5f3ef]">
                        {s.mandate.quantity.toLocaleString()}
                      </td>

                      {/* Ceiling Budget */}
                      <td className="py-4 px-4 text-right tabular-nums whitespace-nowrap font-medium text-obsidian dark:text-[#f5f3ef]">
                        <CurrencyDisplay
                          amount={s.mandate.maxTotalBudget}
                          currency={s.mandate.currency}
                          size="sm"
                        />
                      </td>

                      {/* Audit Status */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {s.auditCertificate ? (
                          <StatusBadge
                            status={isAuditPassed ? "verified" : "failure"}
                            label={isAuditPassed ? "PASS" : "FAIL"}
                          />
                        ) : (
                          <StatusBadge status="neutral" label="PENDING" />
                        )}
                      </td>

                      {/* Lifecycle State */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <StatusBadge
                          status={badgeStatus}
                          label={s.status.replace(/_/g, " ")}
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-4 pl-4 pr-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setInspectedSession(s)}
                            className="p-1.5 rounded-[6px] border border-smoke dark:border-[#2e2e34] text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#242429] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                            aria-label={`Inspect session ${s.id} details`}
                            title="Inspect session record"
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectSession(s)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] bg-warm-cream/70 dark:bg-[#202024] border border-smoke dark:border-[#2e2e34] text-[12.5px] font-medium text-obsidian dark:text-[#f5f3ef] hover:border-ember-orange hover:text-ember-orange transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                            aria-label={`Open session ${s.id}`}
                          >
                            <span>Open</span>
                            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Session Inspector Drawer / Modal */}
      {inspectedSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-inspector-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setInspectedSession(null)}
            aria-hidden="true"
          />
          <div className="relative bg-paper-white dark:bg-[#18181b] rounded-[12px] p-6 sm:p-7 max-w-2xl w-full border border-smoke dark:border-[#2b2b32] shadow-2xl space-y-6 z-10 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-smoke dark:border-[#2b2b32]">
              <div>
                <div className="flex items-center gap-3">
                  <h3 id="session-inspector-title" className="text-[20px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.02em]">
                    Session Audit Inspection
                  </h3>
                  <StatusBadge
                    status={
                      inspectedSession.status === "SETTLED" || inspectedSession.status === "PAYPAL_CAPTURED"
                        ? "verified"
                        : inspectedSession.status === "AUDIT_FAILED"
                        ? "failure"
                        : "info"
                    }
                    label={inspectedSession.status.replace(/_/g, " ")}
                  />
                </div>
                <div className="text-[12px] font-mono text-[#666666] dark:text-[#a5a19b] mt-1">
                  Session ID: {inspectedSession.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedSession(null)}
                className="p-1 rounded-[6px] text-[#888888] hover:text-obsidian dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
                aria-label="Close session inspector"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* 1. Mandate Constraints */}
            <div className="space-y-2.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] font-medium block">
                Authoritative Mandate Constraints
              </span>
              <div className="bg-warm-cream/40 dark:bg-[#141416] p-4 rounded-[8px] border border-smoke dark:border-[#28282e] space-y-2 text-[13.5px]">
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Item Description:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef]">{inspectedSession.mandate.itemQuery}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Quantity:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef] tabular-nums">{inspectedSession.mandate.quantity.toLocaleString()} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Ceiling Budget:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef] tabular-nums">${inspectedSession.mandate.maxTotalBudget.toLocaleString()} {inspectedSession.mandate.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Delivery SLA:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef] tabular-nums">&le; {inspectedSession.mandate.maxDeliveryDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Min Return Window:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef] tabular-nums">&ge; {inspectedSession.mandate.minReturnDays} days</span>
                </div>
              </div>
            </div>

            {/* 2. Cryptographic Flight Recorder */}
            <div className="space-y-2.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] font-medium block">
                Merkle Flight Recorder Root
              </span>
              <div className="bg-warm-cream/40 dark:bg-[#141416] p-4 rounded-[8px] border border-smoke dark:border-[#28282e] space-y-2">
                <CopyableHash hash={inspectedSession.merkleRoot || inspectedSession.preSettlementRoot} label="Merkle Root" truncate={false} />
                <div className="text-[12px] font-mono text-[#666666] dark:text-[#a5a19b]">
                  Committed Turns: {inspectedSession.turns?.length ?? 0}
                </div>
              </div>
            </div>

            {/* 3. ACWORLD Audit Certificate */}
            <div className="space-y-2.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] font-medium block">
                Independent ACWORLD Audit Status
              </span>
              {inspectedSession.auditCertificate ? (
                <div className="p-4 rounded-[8px] border border-smoke dark:border-[#28282e] bg-warm-cream/40 dark:bg-[#141416] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13.5px] font-medium text-obsidian dark:text-[#f5f3ef]">
                      Certificate #{inspectedSession.auditCertificate.certificateId}
                    </span>
                    <StatusBadge
                      status={inspectedSession.auditCertificate.passed ? "verified" : "failure"}
                      label={inspectedSession.auditCertificate.passed ? "PASSED" : "FAILED"}
                    />
                  </div>
                  <div className="space-y-2 text-xs">
                    {inspectedSession.auditCertificate.invariants.map((inv, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[#666666] dark:text-[#a5a19b]">
                        <span>{inv.name}</span>
                        <StatusBadge
                          status={inv.passed ? "verified" : "failure"}
                          label={inv.passed ? "PASS" : "FAIL"}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 text-[13px] text-[#888888] bg-warm-cream/40 dark:bg-[#141416] rounded-[8px] border border-smoke dark:border-[#28282e]">
                  Independent audit has not been executed for this session yet.
                </div>
              )}
            </div>

            {/* 4. PayPal Transaction Info */}
            <div className="space-y-2.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] font-medium block">
                PayPal Orders v2 Artifacts
              </span>
              <div className="bg-warm-cream/40 dark:bg-[#141416] p-4 rounded-[8px] border border-smoke dark:border-[#28282e] space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Order ID:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">{inspectedSession.paypalOrderId || "Uncommitted"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Capture ID:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">{inspectedSession.paypalCaptureId || "Uncommitted"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Invoice ID:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">{inspectedSession.paypalInvoiceId || "Uncommitted"}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-smoke dark:border-[#2b2b32]">
              <button
                type="button"
                onClick={() => setInspectedSession(null)}
                className="px-4 py-2 rounded-[8px] border border-smoke dark:border-[#2e2e34] text-[13.5px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#202024] transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = inspectedSession;
                  setInspectedSession(null);
                  onSelectSession(s);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-ember-orange hover:bg-[#e65c00] text-white text-[13.5px] font-medium transition-colors cursor-pointer shadow-xs"
              >
                <span>Navigate to Live Session</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

