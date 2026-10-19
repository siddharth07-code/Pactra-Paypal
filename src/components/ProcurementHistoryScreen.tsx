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
      <div className="border-b border-[#203149] pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F1F5F9]">Procurement History</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Authoritative audit trail of procurement sessions, mandate revisions, and verified settlements.
          </p>
        </div>
        <div className="text-xs font-mono text-[#64748B] bg-[#0B1728] px-3 py-1.5 rounded-lg border border-[#203149]">
          Server In-Memory Storage
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" />
          <input
            type="text"
            placeholder="Search by session, item, or vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#030B18] border border-[#203149] rounded-lg pl-9 pr-3 py-2 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#64748B]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#030B18] border border-[#203149] rounded-lg px-3 py-1.5 text-xs text-[#F1F5F9] focus:outline-none focus:border-[#4597FF]"
          >
            <option value="ALL">All States</option>
            <option value="SETTLED">Settled &amp; Captured</option>
            <option value="ACTIVE">Active / In Progress</option>
            <option value="FAILED">Audit Failed</option>
          </select>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="p-12">
            <EmptyState
              title="No Historical Sessions Found"
              description="No procurement sessions matched the filter criteria. Initiate a new procurement mandate to build your audit trail."
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
                  <th className="px-6 py-3">Item Requirements</th>
                  <th className="px-6 py-3">Budget</th>
                  <th className="px-6 py-3">Selected Vendor</th>
                  <th className="px-6 py-3">Audit Certificate</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#203149]">
                {filteredSessions.map((s) => {
                  let badgeStatus: "verified" | "warning" | "failure" | "info" | "neutral" = "info";
                  if (s.status === "SETTLED" || s.status === "PAYPAL_CAPTURED") badgeStatus = "verified";
                  else if (s.status === "AUDIT_FAILED") badgeStatus = "failure";
                  else if (s.status === "NEGOTIATING") badgeStatus = "warning";

                  return (
                    <tr
                      key={s.id}
                      onClick={() => onSelectSession(s)}
                      className="hover:bg-[#101F33]/40 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#4597FF]">{s.id}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-[#F1F5F9]">{s.mandate.itemQuery}</div>
                        <div className="text-xs text-[#64748B]">{s.mandate.quantity} units</div>
                      </td>
                      <td className="px-6 py-4">
                        <CurrencyDisplay
                          amount={s.mandate.maxTotalBudget}
                          currency={s.mandate.currency}
                          size="sm"
                        />
                      </td>
                      <td className="px-6 py-4 text-[#F1F5F9]">
                        {s.selectedQuote?.vendorName || (
                          <span className="text-[#64748B] italic">In Negotiation</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {s.auditCertificate ? (
                          <span className="text-xs font-mono text-[#22C55E] flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Cert Verified
                          </span>
                        ) : (
                          <span className="text-xs text-[#64748B]">Pending</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={badgeStatus} label={s.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSession(s);
                          }}
                          className="px-3 py-1 rounded bg-[#203149] hover:bg-[#4597FF] hover:text-white text-xs font-medium text-[#94A3B8] transition-colors"
                        >
                          Details
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
