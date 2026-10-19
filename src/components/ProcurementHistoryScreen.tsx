"use client";

import React, { useState } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
  EmptyState,
} from "./SharedUI";
import {
  Search,
  Filter,
  ShieldCheck,
  ChevronRight,
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

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.mandate.itemQuery.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.selectedQuote?.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "SETTLED" && (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED")) ||
      (statusFilter === "FAILED" && s.status === "AUDIT_FAILED") ||
      (statusFilter === "ACTIVE" && s.status !== "SETTLED" && s.status !== "AUDIT_FAILED");

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F3F6FC]">Procurement history</h1>
          <p className="text-sm text-[#9AAAC0] mt-1.5">
            Authoritative audit trail of procurement mandates, supplier bids, and cryptographic settlements.
          </p>
        </div>
        <div className="text-xs text-[#9AAAC0] bg-[#0D1B2B] px-3.5 py-1.5 rounded-xl border border-[#23354B]/60">
          Server-Side In-Memory Storage
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-[#0D1B2B] rounded-2xl p-5 card-shadow border border-[#23354B]/60 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#64758E]" />
          <input
            type="text"
            placeholder="Search by session ID, product, or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#07111F] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#64758E]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#07111F] rounded-xl px-4 py-2.5 text-xs text-[#F3F6FC] border border-[#23354B]/60 focus:outline-none focus:border-[#5B9CFF]"
          >
            <option value="ALL">All States</option>
            <option value="SETTLED">Settled &amp; Captured</option>
            <option value="ACTIVE">Active in Negotiation</option>
            <option value="FAILED">Audit Failed</option>
          </select>
        </div>
      </div>

      {/* Sessions List */}
      <div className="bg-[#0D1B2B] rounded-2xl card-shadow border border-[#23354B]/60 overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="No historical sessions found"
              description="No procurement sessions matched the filter criteria. Initiate a new procurement mandate to build your audit trail."
              actionLabel="Launch Procurement"
              onAction={onStartNew}
            />
          </div>
        ) : (
          <div className="divide-y divide-[#23354B]/40">
            {filteredSessions.map((s) => {
              let badgeStatus: "verified" | "warning" | "failure" | "info" | "neutral" = "info";
              if (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED") badgeStatus = "verified";
              else if (s.status === "AUDIT_FAILED") badgeStatus = "failure";
              else if (s.status === "NEGOTIATING") badgeStatus = "warning";

              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s)}
                  className="px-7 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#132438]/50 transition-colors cursor-pointer"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-[#F3F6FC]">{s.mandate.itemQuery}</span>
                      <span className="text-xs text-[#9AAAC0]">({s.mandate.quantity} units)</span>
                      <StatusBadge
                        status={badgeStatus}
                        label={s.status.replace(/_/g, " ")}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#64758E]">
                      <span className="font-mono-token">{s.id}</span>
                      <span>•</span>
                      <span>
                        Supplier:{" "}
                        <strong className="text-[#9AAAC0]">
                          {s.selectedQuote?.vendorName || "Evaluating"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-xs text-[#9AAAC0]">Ceiling Budget</div>
                      <CurrencyDisplay
                        amount={s.mandate.maxTotalBudget}
                        currency={s.mandate.currency}
                        size="sm"
                      />
                    </div>
                    {s.auditCertificate ? (
                      <span className="text-xs font-semibold text-[#22C55E] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        Audit Verified
                      </span>
                    ) : (
                      <span className="text-xs text-[#64758E]">Pending Audit</span>
                    )}
                    <ChevronRight className="w-5 h-5 text-[#64758E]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
