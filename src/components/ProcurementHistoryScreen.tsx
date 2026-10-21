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
  ShieldCheck,
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
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[36px] font-medium tracking-[-0.72px] text-obsidian dark:text-[#f5f3ef]">
            Procurement history
          </h1>
          <p className="text-[16px] text-[#555555] dark:text-[#c4c0ba] mt-1">
            Authoritative audit trail of procurement mandates, supplier bids, and cryptographic settlements.
          </p>
        </div>
        <div className="text-[13px] text-[#666666] dark:text-[#a5a19b] bg-warm-cream dark:bg-[#1f1f1f] px-4 py-2 rounded-[24px] border border-smoke dark:border-[#333333]">
          Authoritative In-Memory Store
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-6 border border-smoke dark:border-[#333333] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm transition-colors">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-4 top-3 text-[#888888]" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by session ID, product, or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-paper-white dark:bg-[#262626] rounded-[24px] pl-11 pr-9 py-2.5 text-[14px] text-obsidian dark:text-[#f5f3ef] border border-smoke dark:border-[#383838] focus:outline-none focus:border-obsidian dark:focus:border-white focus-visible:ring-2 focus-visible:ring-ember-orange"
            aria-label="Search procurement sessions"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-3 text-[#888888] hover:text-obsidian dark:hover:text-white"
              aria-label="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#888888]" aria-hidden="true" />
          <label htmlFor="history-status-filter" className="sr-only">Filter by session status</label>
          <select
            id="history-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-paper-white dark:bg-[#262626] rounded-[24px] px-4 py-2.5 text-[14px] text-obsidian dark:text-[#f5f3ef] border border-smoke dark:border-[#383838] focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer font-medium"
          >
            <option value="ALL">All States</option>
            <option value="SETTLED">Settled &amp; Captured</option>
            <option value="ACTIVE">Active in Negotiation</option>
            <option value="FAILED">Audit Blocked</option>
          </select>
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-paper-white dark:bg-[#1a1a1a] rounded-cards border border-smoke dark:border-[#333333] shadow-sm overflow-hidden transition-colors">
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
          <div className="divide-y divide-smoke dark:divide-[#2e2e2e]">
            {filteredSessions.map((s) => {
              let badgeStatus: "verified" | "warning" | "failure" | "info" | "neutral" = "info";
              if (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED") badgeStatus = "verified";
              else if (s.status === "AUDIT_FAILED") badgeStatus = "failure";
              else if (s.status === "NEGOTIATING") badgeStatus = "warning";

              return (
                <div
                  key={s.id}
                  className="px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-warm-cream/50 dark:hover:bg-[#222222] transition-colors"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-medium text-[17px] text-obsidian dark:text-[#f5f3ef]">{s.mandate.itemQuery}</span>
                      <span className="text-[14px] text-[#666666] dark:text-[#a5a19b]">({s.mandate.quantity} units)</span>
                      <StatusBadge
                        status={badgeStatus}
                        label={s.status.replace(/_/g, " ")}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#666666] dark:text-[#a5a19b]">
                      <span className="font-mono-token">{s.id}</span>
                      <span>•</span>
                      <span>
                        Supplier:{" "}
                        <strong className="text-obsidian dark:text-[#f5f3ef] font-medium">
                          {s.selectedQuote?.vendorName || "Evaluating Baselines"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[12px] text-[#666666] dark:text-[#a5a19b]">Ceiling Budget</div>
                      <CurrencyDisplay
                        amount={s.mandate.maxTotalBudget}
                        currency={s.mandate.currency}
                        size="sm"
                      />
                    </div>

                    {s.auditCertificate ? (
                      <span className="text-[13px] font-medium text-lichen-green flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                        Audit Verified
                      </span>
                    ) : (
                      <span className="text-[13px] text-[#888888] dark:text-[#777777]">Pending Audit</span>
                    )}

                    {/* Action buttons: Inspect details and Open live session */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectedSession(s)}
                        className="p-2 rounded-smallelements border border-smoke dark:border-[#383838] text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#262626] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                        aria-label={`Inspect session ${s.id} details`}
                        title="Inspect session record"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectSession(s)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-smallelements bg-warm-cream dark:bg-[#262626] border border-smoke dark:border-[#383838] text-[13px] font-medium text-obsidian dark:text-[#f5f3ef] hover:border-ember-orange transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                        aria-label={`Open session ${s.id}`}
                      >
                        <span>Open</span>
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Session Inspector Drawer / Modal (Section 14) */}
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
          <div className="relative bg-paper-white dark:bg-[#1a1a1a] rounded-cards p-8 max-w-2xl w-full border border-smoke dark:border-[#363636] shadow-xl space-y-6 z-10 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-smoke dark:border-[#333333]">
              <div>
                <div className="flex items-center gap-3">
                  <h3 id="session-inspector-title" className="text-[22px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.44px]">
                    Session Inspection
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
                <div className="text-[13px] font-mono-token text-[#666666] dark:text-[#a5a19b] mt-1">
                  ID: {inspectedSession.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedSession(null)}
                className="p-1 rounded text-[#888888] hover:text-obsidian dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
                aria-label="Close session inspector"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Mandate Constraints */}
            <div className="space-y-3">
              <h4 className="text-[14px] font-medium uppercase tracking-[-0.28px] text-architect-violet dark:text-[#9d6ce6]">
                Authoritative Mandate Constraints
              </h4>
              <div className="bg-warm-cream dark:bg-[#202020] p-4 rounded-smallelements border border-smoke dark:border-[#333333] space-y-2 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Item Description:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef]">{inspectedSession.mandate.itemQuery}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Quantity:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef]">{inspectedSession.mandate.quantity} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Max Budget:</span>
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef]">${inspectedSession.mandate.maxTotalBudget.toLocaleString()} {inspectedSession.mandate.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Delivery SLA:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">&le; {inspectedSession.mandate.maxDeliveryDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666] dark:text-[#a5a19b]">Min Return Window:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">&ge; {inspectedSession.mandate.minReturnDays} days</span>
                </div>
              </div>
            </div>

            {/* Cryptographic Flight Recorder */}
            <div className="space-y-3">
              <h4 className="text-[14px] font-medium uppercase tracking-[-0.28px] text-architect-violet dark:text-[#9d6ce6]">
                Merkle Flight Recorder Root
              </h4>
              <div className="bg-warm-cream dark:bg-[#202020] p-4 rounded-smallelements border border-smoke dark:border-[#333333] space-y-2">
                <CopyableHash hash={inspectedSession.merkleRoot || inspectedSession.preSettlementRoot} label="Merkle Root" truncate={false} />
                <div className="text-[12px] text-[#666666] dark:text-[#a5a19b]">
                  Committed Turns: {inspectedSession.turns?.length ?? 0}
                </div>
              </div>
            </div>

            {/* ACWORLD Audit Certificate */}
            <div className="space-y-3">
              <h4 className="text-[14px] font-medium uppercase tracking-[-0.28px] text-architect-violet dark:text-[#9d6ce6]">
                ACWORLD Audit Status
              </h4>
              {inspectedSession.auditCertificate ? (
                <div className="p-4 rounded-smallelements border border-smoke dark:border-[#333333] bg-warm-cream dark:bg-[#202020] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-medium text-obsidian dark:text-[#f5f3ef]">Certificate #{inspectedSession.auditCertificate.certificateId}</span>
                    <span className={`text-[12px] font-medium px-2.5 py-0.5 rounded-full ${inspectedSession.auditCertificate.passed ? "bg-mint-whisper dark:bg-[#132c22] text-lichen-green" : "bg-[#feeef0] text-[#ef4444]"}`}>
                      {inspectedSession.auditCertificate.passed ? "PASSED" : "FAILED"}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    {inspectedSession.auditCertificate.invariants.map((inv, idx) => (
                      <div key={idx} className="flex justify-between text-[#666666] dark:text-[#a5a19b]">
                        <span>{inv.name}</span>
                        <span className={inv.passed ? "text-lichen-green font-medium" : "text-[#ef4444] font-medium"}>
                          {inv.passed ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 text-[13px] text-[#888888] bg-warm-cream dark:bg-[#202020] rounded-smallelements border border-smoke dark:border-[#333333]">
                  Audit has not been run for this session.
                </div>
              )}
            </div>

            {/* PayPal Transaction Info */}
            <div className="space-y-3">
              <h4 className="text-[14px] font-medium uppercase tracking-[-0.28px] text-architect-violet dark:text-[#9d6ce6]">
                PayPal Orders v2 Artifacts
              </h4>
              <div className="bg-warm-cream dark:bg-[#202020] p-4 rounded-smallelements border border-smoke dark:border-[#333333] space-y-1.5 text-xs font-mono-token">
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

            {/* Action Bar */}
            <div className="flex justify-end gap-3 pt-3 border-t border-smoke dark:border-[#333333]">
              <button
                type="button"
                onClick={() => setInspectedSession(null)}
                className="px-4 py-2 rounded-smallelements border border-smoke dark:border-[#383838] text-[14px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#262626] transition-colors cursor-pointer"
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
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-buttons bg-ember-orange hover:bg-[#e65c00] text-white text-[14px] font-medium transition-all cursor-pointer shadow-sm"
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
