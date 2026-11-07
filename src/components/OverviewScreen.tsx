"use client";

import React from "react";
import { PrimaryButton, GhostButton, CurrencyDisplay } from "./SharedUI";
import { PageContainer, OperationsPanel, DataMessage, LedgerTable } from "./OperationsUI";
import type { ProcurementSession } from "@/types/pactum";

interface OverviewScreenProps {
  sessions: ProcurementSession[];
  onStartNew: () => void;
  onOpenSession: (session: ProcurementSession) => void;
  onNavigateHistory?: () => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

export const getSessionLifecycleConfig = (session: ProcurementSession) => {
  const states: Record<string, { label: string; nextAction: string; status: "neutral" | "warning" | "verified" | "failure" | "info" }> = {
    SETTLED: { label: "Settled", nextAction: "Review settlement records.", status: "verified" },
    PAYPAL_CAPTURED: { label: "Captured", nextAction: "Review capture evidence.", status: "verified" },
    PAYPAL_AUTHORIZED: { label: "Authorized", nextAction: "Review settlement before capture.", status: "info" },
    AWAITING_PAYPAL_APPROVAL: { label: "Awaiting approval", nextAction: "Complete buyer approval in PayPal Sandbox.", status: "warning" },
    CAPTURE_PENDING_RECONCILIATION: { label: "Reconciliation needed", nextAction: "Payment outcome is uncertain. Reconcile before any further payment action.", status: "warning" },
    AUDIT_PASSED: { label: "Audit passed", nextAction: "Review settlement eligibility.", status: "verified" },
    AUDIT_FAILED: { label: "Audit blocked", nextAction: "Review failed checks before proceeding.", status: "failure" },
    AUDIT_PENDING: { label: "Awaiting audit", nextAction: "Review agreed terms and run ACWORLD audit.", status: "warning" },
    NEGOTIATING: { label: "Negotiating", nextAction: "Review negotiation progress.", status: "info" },
    SOURCING: { label: "Sourcing", nextAction: "Review supplier offers.", status: "neutral" },
    MANDATE_PENDING: { label: "Mandate pending", nextAction: "Review requirements and supplier offers.", status: "neutral" },
    CANCELLED: { label: "Cancelled", nextAction: "This procurement is closed.", status: "neutral" },
    DISPUTED: { label: "Disputed", nextAction: "Review dispute evidence. PayPal submission is not confirmed.", status: "warning" },
  };
  return states[session.status] ?? { label: session.status.toLowerCase().replaceAll("_", " "), nextAction: "Review procurement details.", status: "neutral" as const };
};

const closed = new Set(["SETTLED", "PAYPAL_CAPTURED", "CANCELLED", "AUDIT_FAILED", "DISPUTED"]);
const needsReview = new Set(["AUDIT_PENDING", "AUDIT_FAILED", "PAYPAL_AUTHORIZED", "AWAITING_PAYPAL_APPROVAL", "CAPTURE_PENDING_RECONCILIATION", "DISPUTED"]);
function timestamp(session: ProcurementSession) {
  const value = Date.parse(session.updatedAt || session.createdAt);
  return Number.isFinite(value) ? value : 0;
}
function updatedLabel(session: ProcurementSession) {
  const value = timestamp(session);
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value) : "Date unavailable";
}

export function OverviewScreen({ sessions, onStartNew, onOpenSession, onNavigateHistory, loading = false, error = "", onRetry }: OverviewScreenProps) {
  const recent = [...sessions].sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 8);
  const outstanding = [...sessions].filter(s => needsReview.has(s.status)).sort((a,b) => timestamp(b) - timestamp(a)).slice(0, 4);
  const activeCount = sessions.filter(s => !closed.has(s.status)).length;
  const settledCount = sessions.filter(s => s.status === "SETTLED" || (s.status === "PAYPAL_CAPTURED" && Boolean(s.paypalCaptureId))).length;

  return <PageContainer>
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2"><h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold tracking-[-0.03em]">Procurement overview</h1>
        <p className="text-sm text-text-secondary">Your mandates, outstanding decisions and settlement progress.</p></div>
      <PrimaryButton onClick={onStartNew}>New mandate</PrimaryButton>
    </div>

    {loading ? <OperationsPanel title="Mandates"><DataMessage title="Loading procurement records…" /></OperationsPanel>
      : error ? <OperationsPanel title="Procurement unavailable"><DataMessage title="Could not load your mandates" error><p>{error}</p>{onRetry && <GhostButton onClick={onRetry} className="mt-4">Try again</GhostButton>}</DataMessage></OperationsPanel>
      : sessions.length === 0 ? <OperationsPanel title="Your procurement workspace"><DataMessage title="No mandates yet"><p>Create a mandate to define what you need, compare supplier offers and track an agreement through settlement.</p><p className="mt-2">Your procurement records will appear here.</p></DataMessage></OperationsPanel>
      : <>
        <dl className="flex flex-wrap gap-x-12 gap-y-5 border-y border-border-primary py-5">
          {[ ["Active mandates", activeCount], ["Needs review", sessions.filter(s => needsReview.has(s.status)).length], ["Settled procurements", settledCount] ].map(([label, value]) => <div key={label} className="min-w-[140px]"><dt className="text-sm text-text-secondary">{label}</dt><dd className="mt-1 text-3xl font-medium tabular-nums tracking-tight">{value}</dd></div>)}
        </dl>
        {outstanding.length > 0 && <OperationsPanel title="Needs your review"><ul className="divide-y divide-border-primary">{outstanding.map(session => <li key={session.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="font-medium break-words">{session.mandate.itemQuery}</p><p className="mt-1 text-sm text-text-secondary">{getSessionLifecycleConfig(session).nextAction}</p></div><GhostButton onClick={() => onOpenSession(session)} ariaLabel={`Review ${session.mandate.itemQuery}`}>Review mandate</GhostButton></li>)}</ul></OperationsPanel>}
        <OperationsPanel title="Recently updated mandates" action={onNavigateHistory && <GhostButton onClick={onNavigateHistory}>View history</GhostButton>}>
          <LedgerTable label="Recent procurement mandates">
            <thead><tr><th scope="col">Mandate</th><th scope="col">State</th><th scope="col" className="text-right">Budget</th><th scope="col">Updated (UTC)</th><th scope="col"><span className="sr-only">Open record</span></th></tr></thead>
            <tbody>{recent.map(session => <tr key={session.id}><th scope="row" className="font-medium"><span className="block max-w-[360px] break-words">{session.mandate.itemQuery}</span><span className="mt-1 block text-xs font-normal text-text-secondary">{session.mandate.quantity} units</span></th><td>{getSessionLifecycleConfig(session).label}</td><td className="text-right whitespace-nowrap"><CurrencyDisplay amount={session.mandate.maxTotalBudget} currency={session.mandate.currency || "USD"} /><span className="ml-2 text-xs text-text-secondary">{session.mandate.currency || "USD"}</span></td><td className="whitespace-nowrap text-text-secondary">{updatedLabel(session)}</td><td className="text-right"><GhostButton onClick={() => onOpenSession(session)} ariaLabel={`Open mandate ${session.id}`}>Open</GhostButton></td></tr>)}</tbody>
          </LedgerTable>
          <p className="px-5 py-3 border-t border-border-primary text-xs text-text-secondary">Budgets are commercial limits, not payment totals. Each amount retains its original currency.</p>
        </OperationsPanel>
      </>}
  </PageContainer>;
}
