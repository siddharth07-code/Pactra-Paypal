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
    <div className="space-y-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[36px] font-medium tracking-[-0.72px] text-[#000000]">
            Procurement history
          </h1>
          <p className="text-[16px] text-[#888888] mt-1">
            Authoritative audit trail of procurement mandates, supplier bids, and cryptographic settlements.
          </p>
        </div>
        <div className="text-[13px] text-[#888888] bg-[#f6f3ee] px-4 py-2 rounded-[24px] border border-[#e5e5e5]">
          Server In-Memory Storage
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-[#f6f3ee] rounded-[24px] p-6 border border-[#e5e5e5] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-4 top-3 text-[#888888]" />
          <input
            type="text"
            placeholder="Search by session ID, product, or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#ffffff] rounded-[24px] pl-11 pr-4 py-2.5 text-[14px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000]"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#888888]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#ffffff] rounded-[24px] px-4 py-2.5 text-[14px] text-[#000000] border border-[#e5e5e5] focus:outline-none focus:border-[#000000] cursor-pointer"
          >
            <option value="ALL">All States</option>
            <option value="SETTLED">Settled &amp; Captured</option>
            <option value="ACTIVE">Active in Negotiation</option>
            <option value="FAILED">Audit Failed</option>
          </select>
        </div>
      </div>

      {/* Sessions List on White Paper Surface */}
      <div className="bg-[#ffffff] rounded-[24px] border border-[#e5e5e5] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] overflow-hidden">
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
          <div className="divide-y divide-[#e5e5e5]">
            {filteredSessions.map((s) => {
              let badgeStatus: "verified" | "warning" | "failure" | "info" | "neutral" = "info";
              if (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED") badgeStatus = "verified";
              else if (s.status === "AUDIT_FAILED") badgeStatus = "failure";
              else if (s.status === "NEGOTIATING") badgeStatus = "warning";

              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s)}
                  className="px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#f6f3ee]/60 transition-colors cursor-pointer"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-[17px] text-[#000000]">{s.mandate.itemQuery}</span>
                      <span className="text-[14px] text-[#888888]">({s.mandate.quantity} units)</span>
                      <StatusBadge
                        status={badgeStatus}
                        label={s.status.replace(/_/g, " ")}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-[13px] text-[#888888]">
                      <span className="font-mono-token">{s.id}</span>
                      <span>•</span>
                      <span>
                        Supplier:{" "}
                        <strong className="text-[#000000] font-medium">
                          {s.selectedQuote?.vendorName || "Evaluating"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[12px] text-[#888888]">Ceiling Budget</div>
                      <CurrencyDisplay
                        amount={s.mandate.maxTotalBudget}
                        currency={s.mandate.currency}
                        size="sm"
                      />
                    </div>
                    {s.auditCertificate ? (
                      <span className="text-[13px] font-medium text-[#00cc88] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        Audit Verified
                      </span>
                    ) : (
                      <span className="text-[13px] text-[#888888]">Pending Audit</span>
                    )}
                    <ChevronRight className="w-5 h-5 text-[#888888]" />
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
