"use client";

import React, { useState, useEffect } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
  EmptyState,
  CopyableHash,
} from "./SharedUI";
import { getSessionLifecycleConfig } from "./OverviewScreen";
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
  const [sortBy, setSortBy] = useState<"NEWEST" | "OLDEST" | "BUDGET_DESC" | "BUDGET_ASC">("NEWEST");
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

  const filteredSessions = sessions
    .filter((s) => {
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
        (statusFilter === "DISPUTED" && (s.status === "DISPUTED" || s.status === "CAPTURE_PENDING_RECONCILIATION")) ||
        (statusFilter === "ACTIVE" &&
          s.status !== "SETTLED" &&
          s.status !== "PAYPAL_CAPTURED" &&
          s.status !== "AUDIT_FAILED" &&
          s.status !== "CANCELLED" &&
          s.status !== "DISPUTED");

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "NEWEST") {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortBy === "OLDEST") {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      if (sortBy === "BUDGET_DESC") {
        return (b.mandate?.maxTotalBudget ?? 0) - (a.mandate?.maxTotalBudget ?? 0);
      }
      if (sortBy === "BUDGET_ASC") {
        return (a.mandate?.maxTotalBudget ?? 0) - (b.mandate?.maxTotalBudget ?? 0);
      }
      return 0;
    });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-smoke/80 dark:border-[#27272a]">
        <div>
          <span className="text-[11.5px] font-sans font-semibold uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] block mb-1">
            Authoritative Audit Trail
          </span>
          <h1 className="type-page-title text-obsidian dark:text-[#f6f4f0]">
            Procurement History
          </h1>
          <p className="type-body text-secondary mt-1 max-w-2xl">
            Immutable transaction records of procurement mandates, negotiated supplier terms, Merkle roots, and cryptographic audit proofs.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11.5px] font-sans font-medium text-secondary bg-smoke/40 dark:bg-[#1f1f23] px-3 py-1 rounded-[6px] border border-smoke dark:border-[#27272a]">
            Authoritative In-Memory Store
          </span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-4 sm:p-5 border border-smoke dark:border-[#27272a] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#737373] dark:text-[#a3a3a3]" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by ID, item, or vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-warm-cream/40 dark:bg-[#121214] rounded-[8px] pl-10 pr-9 py-2 text-[14px] text-obsidian dark:text-[#f5f3ef] border border-smoke dark:border-[#27272a] focus:outline-none focus:border-obsidian dark:focus:border-white focus-visible:ring-2 focus-visible:ring-ember-orange transition-colors"
            aria-label="Search procurement sessions"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-[#737373] dark:text-[#a3a3a3] hover:text-obsidian dark:hover:text-white"
              aria-label="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto self-start sm:self-auto">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-[#737373] dark:text-[#a3a3a3]" aria-hidden="true" />
            <label htmlFor="history-status-filter" className="sr-only">Filter by session status</label>
            <select
              id="history-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-warm-cream/40 dark:bg-[#121214] rounded-[8px] px-3.5 py-2 text-[13px] text-obsidian dark:text-[#f5f3ef] border border-smoke dark:border-[#27272a] focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer font-medium transition-colors"
            >
              <option value="ALL">All States ({sessions.length})</option>
              <option value="SETTLED">Settled &amp; Captured</option>
              <option value="ACTIVE">Active in Negotiation</option>
              <option value="FAILED">Audit Blocked</option>
              <option value="DISPUTED">Disputed / Pending Recon</option>
            </select>
          </div>

          <div>
            <label htmlFor="history-sort-by" className="sr-only">Sort sessions by</label>
            <select
              id="history-sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "NEWEST" | "OLDEST" | "BUDGET_DESC" | "BUDGET_ASC")}
              className="bg-warm-cream/40 dark:bg-[#121214] rounded-[8px] px-3.5 py-2 text-[13px] text-obsidian dark:text-[#f5f3ef] border border-smoke dark:border-[#27272a] focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer font-medium transition-colors"
            >
              <option value="NEWEST">Sort: Newest First</option>
              <option value="OLDEST">Sort: Oldest First</option>
              <option value="BUDGET_DESC">Sort: Budget (High-Low)</option>
              <option value="BUDGET_ASC">Sort: Budget (Low-High)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Institutional Financial Data Table */}
      <div className="bg-paper-white dark:bg-[#18181b] rounded-[8px] border border-smoke dark:border-[#27272a] shadow-2xs overflow-hidden transition-colors">
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
          <>
            {/* Desktop Table View (>= sm) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-[13.5px] border-collapse">
                <thead>
                  <tr className="border-b border-smoke dark:border-[#27272a] bg-warm-cream/50 dark:bg-[#141416] type-table-header text-[#737373] dark:text-[#a3a3a3]">
                    <th scope="col" className="py-3.5 pl-6 pr-4 font-semibold">Session ID</th>
                    <th scope="col" className="py-3.5 px-4 font-semibold">Item Specification</th>
                    <th scope="col" className="py-3.5 px-4 font-semibold">Supplier</th>
                    <th scope="col" className="py-3.5 px-4 font-semibold text-right">Qty</th>
                    <th scope="col" className="py-3.5 px-4 font-semibold text-right">Ceiling Budget</th>
                    <th scope="col" className="py-3.5 px-4 font-semibold text-center">Audit Status</th>
                    <th scope="col" className="py-3.5 px-4 font-semibold text-center">Lifecycle State</th>
                    <th scope="col" className="py-3.5 pl-4 pr-6 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-smoke dark:divide-[#27272a]">
                  {filteredSessions.map((s) => {
                    const isAuditPassed = s.auditCertificate?.passed === true;

                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-warm-cream/35 dark:hover:bg-[#1f1f23] transition-colors group"
                      >
                        {/* Session ID */}
                        <td className="py-4 pl-6 pr-4 whitespace-nowrap">
                          <span className="font-mono-token text-[12px] font-medium text-obsidian dark:text-[#f5f3ef]">
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
                          <div className="flex items-center justify-center gap-1.5">
                            {(() => {
                              const l = getSessionLifecycleConfig(s);
                              return <StatusBadge status={l.status} label={l.label} />;
                            })()}
                            {s.fxRecord && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-mono-token font-medium bg-architect-violet/10 text-architect-violet dark:text-[#a78bfa] border border-architect-violet/20">
                                FX Settled
                              </span>
                            )}
                          </div>
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

            {/* Mobile Dedicated Session Cards (< sm) */}
            <div className="sm:hidden divide-y divide-smoke dark:divide-[#27272a]">
              {filteredSessions.map((s) => {
                const isAuditPassed = s.auditCertificate?.passed === true;
                const lifecycle = getSessionLifecycleConfig(s);
                const supplierName = s.selectedQuote?.vendorName || "Not established";
                const hasMerkleRoot = Boolean(s.merkleRoot);

                return (
                  <div
                    key={s.id}
                    className="p-4 space-y-3 hover:bg-warm-cream/35 dark:hover:bg-[#1f1f23] transition-colors"
                  >
                    {/* Top Row: Item and Lifecycle Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <h3 className="font-medium text-[14.5px] text-obsidian dark:text-[#f5f3ef] truncate">
                          {s.mandate.itemQuery}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[11.5px] text-secondary font-mono-token">
                          <span>ID:</span>
                          <span className="truncate max-w-[140px]">{s.id}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={lifecycle.status} label={lifecycle.label} />
                      </div>
                    </div>

                    {/* Middle Grid: Supplier, Qty, Budget, Audit */}
                    <div className="grid grid-cols-2 gap-2.5 text-[12.5px] pt-1">
                      <div>
                        <span className="text-secondary block text-[11px]">Supplier</span>
                        <span className="font-medium text-obsidian dark:text-[#f5f3ef] truncate block">
                          {supplierName}
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary block text-[11px]">Quantity</span>
                        <span className="font-medium text-obsidian dark:text-[#f5f3ef] tabular-nums">
                          {s.mandate.quantity.toLocaleString()} units
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary block text-[11px]">Ceiling Budget</span>
                        <CurrencyDisplay
                          amount={s.mandate.maxTotalBudget}
                          currency={s.mandate.currency}
                          size="sm"
                        />
                      </div>
                      <div>
                        <span className="text-secondary block text-[11px]">ACWORLD Audit</span>
                        {s.auditCertificate ? (
                          <StatusBadge
                            status={isAuditPassed ? "verified" : "failure"}
                            label={isAuditPassed ? "PASS" : "FAIL"}
                          />
                        ) : (
                          <span className="text-secondary text-[11.5px] italic">Not established</span>
                        )}
                      </div>
                    </div>

                    {/* Merkle Root indicator if available */}
                    {hasMerkleRoot && (
                      <div className="text-[11px] font-mono-token text-secondary flex items-center gap-1 pt-1 truncate">
                        <span className="font-medium text-obsidian dark:text-[#f5f3ef]">Root:</span>
                        <span className="truncate">{s.merkleRoot}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-smoke/70 dark:border-[#222226]">
                      <button
                        type="button"
                        onClick={() => setInspectedSession(s)}
                        className="flex-1 py-2 px-3 rounded-[6px] border border-smoke dark:border-[#2e2e34] text-[12.5px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#242429] transition-colors cursor-pointer flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                        aria-label={`Inspect session ${s.id} details`}
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Inspect</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSession(s)}
                        className="flex-1 py-2 px-3 rounded-[6px] bg-warm-cream/70 dark:bg-[#202024] border border-smoke dark:border-[#2e2e34] text-[12.5px] font-medium text-obsidian dark:text-[#f5f3ef] hover:border-ember-orange hover:text-ember-orange transition-colors cursor-pointer flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                        aria-label={`Open session ${s.id}`}
                      >
                        <span>Open Session</span>
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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
          <div className="relative bg-paper-white dark:bg-[#18181b] rounded-[8px] p-6 sm:p-7 max-w-2xl w-full border border-smoke dark:border-[#27272a] shadow-2xl space-y-6 z-10 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-smoke dark:border-[#27272a]">
              <div>
                <div className="flex items-center gap-3">
                  <h3 id="session-inspector-title" className="text-[20px] font-semibold text-obsidian dark:text-[#f5f3ef] tracking-tight">
                    Session Audit Inspection
                  </h3>
                  {(() => {
                    const l = getSessionLifecycleConfig(inspectedSession);
                    return <StatusBadge status={l.status} label={l.label} />;
                  })()}
                </div>
                <div className="text-[12px] text-[#737373] dark:text-[#a3a3a3] mt-1">
                  Session ID: <span className="font-mono-token">{inspectedSession.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedSession(null)}
                className="p-1 rounded-[6px] text-[#737373] dark:text-[#a3a3a3] hover:text-obsidian dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
                aria-label="Close session inspector"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* 1. Mandate Constraints */}
            <div className="space-y-2.5">
              <span className="text-[11.5px] font-sans font-semibold uppercase tracking-[0.05em] text-architect-violet dark:text-[#b490f5] block">
                Authoritative Mandate Constraints
              </span>
              <div className="bg-warm-cream/40 dark:bg-[#141416] p-4 rounded-[8px] border border-smoke dark:border-[#27272a] space-y-2 text-[13.5px]">
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Item Description:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef]">{inspectedSession.mandate.itemQuery}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Quantity:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef] tabular-nums">{inspectedSession.mandate.quantity.toLocaleString()} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Ceiling Budget:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef] tabular-nums">${inspectedSession.mandate.maxTotalBudget.toLocaleString()} {inspectedSession.mandate.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Delivery SLA:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef] tabular-nums">&le; {inspectedSession.mandate.maxDeliveryDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Min Return Window:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef] tabular-nums">&ge; {inspectedSession.mandate.minReturnDays} days</span>
                </div>
              </div>
            </div>

            {/* 2. Cryptographic Flight Recorder */}
            <div className="space-y-2.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] font-medium block">
                Merkle Flight Recorder Root
              </span>
              <div className="bg-warm-cream/40 dark:bg-[#141416] p-4 rounded-[8px] border border-smoke dark:border-[#27272a] space-y-2">
                <CopyableHash hash={inspectedSession.merkleRoot || inspectedSession.preSettlementRoot} label="Merkle Root" truncate={false} />
                <div className="text-[12px] font-mono text-[#737373] dark:text-[#a3a3a3]">
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
                <div className="p-4 rounded-[8px] border border-smoke dark:border-[#27272a] bg-warm-cream/40 dark:bg-[#141416] space-y-3">
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
                      <div key={idx} className="flex items-center justify-between text-[#737373] dark:text-[#a3a3a3]">
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
                <div className="p-3 text-[13px] text-[#737373] dark:text-[#a3a3a3] bg-warm-cream/40 dark:bg-[#141416] rounded-[8px] border border-smoke dark:border-[#27272a]">
                  Independent audit has not been executed for this session yet.
                </div>
              )}
            </div>

            {/* 4. PayPal Transaction Info */}
            <div className="space-y-2.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] font-medium block">
                PayPal Orders v2 Artifacts
              </span>
              <div className="bg-warm-cream/40 dark:bg-[#141416] p-4 rounded-[8px] border border-smoke dark:border-[#27272a] space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Order ID:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">{inspectedSession.paypalOrderId || "Uncommitted"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Capture ID:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">{inspectedSession.paypalCaptureId || "Uncommitted"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373] dark:text-[#a3a3a3]">Invoice ID:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">{inspectedSession.paypalInvoiceId || "Uncommitted"}</span>
                </div>
              </div>
            </div>

            {/* 5. Verifiable FX Settlement Bridge (if applicable) */}
            {inspectedSession.fxRecord && (
              <div className="space-y-2.5">
                <span className="text-[11.5px] font-mono uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] font-medium block">
                  Verifiable FX Settlement Bridge
                </span>
                <div className="bg-warm-cream/40 dark:bg-[#141416] p-4 rounded-[8px] border border-smoke dark:border-[#27272a] space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#737373] dark:text-[#a3a3a3]">Commercial Obligation:</span>
                    <span className="text-obsidian dark:text-[#f5f3ef] font-semibold">
                      {inspectedSession.agreementRecord ? `${inspectedSession.agreementRecord.currency || "INR"} ${inspectedSession.agreementRecord.totalCost.toLocaleString()}` : "INR"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#737373] dark:text-[#a3a3a3]">Locked FX Rate:</span>
                    <span className="text-obsidian dark:text-[#f5f3ef]">1 USD = ₹{inspectedSession.fxRecord.rate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#737373] dark:text-[#a3a3a3]">Settlement Obligation:</span>
                    <span className="text-lichen-green font-bold">
                      ${(inspectedSession.fxRecord.targetAmountMinor / 100).toFixed(2)} USD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#737373] dark:text-[#a3a3a3]">Conversion Status:</span>
                    <span className="text-obsidian dark:text-[#f5f3ef] uppercase">{inspectedSession.fxRecord.status}</span>
                  </div>
                  <div className="pt-1 border-t border-smoke/70 dark:border-[#27272a]">
                    <span className="text-[#737373] dark:text-[#a3a3a3] block mb-0.5">Conversion Hash:</span>
                    <span className="break-all text-[11px] text-obsidian dark:text-[#f5f3ef]">{inspectedSession.fxRecord.conversionHash}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-smoke dark:border-[#27272a]">
              <button
                type="button"
                onClick={() => setInspectedSession(null)}
                className="px-4 py-2 rounded-[8px] border border-smoke dark:border-[#27272a] text-[13.5px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#202024] transition-colors cursor-pointer"
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

