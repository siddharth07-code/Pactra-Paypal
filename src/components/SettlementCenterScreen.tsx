"use client";

/**
 * PACTUM — Settlement Center Screen
 * Implements real PayPal Sandbox checkout initiation and audited capture display.
 * Primary Action: "Continue to PayPal" -> redirects to real PayPal Sandbox approval interface.
 * Strictly fail-closed: Continue to PayPal requires an authoritative passing audit certificate.
 * Follows design.md, GEMINI.md Section 8, 9, 12 and SECURITY.md Section 3, 7.
 */

import React, { useState } from "react";
import {
  PrimaryButton,
  GhostButton,
  CurrencyDisplay,
  StatusBadge,
  ConfirmationModal,
  SectionHeader,
  NoticeBanner,
} from "./SharedUI";
import {
  ShieldAlert,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Lock,
  Copy,
  Check,
  ShieldCheck,
  PlusCircle,
  History,
  FileText,
} from "lucide-react";
import type { ProcurementSession, ProcurementSessionStatus } from "@/types/pactum";

interface SettlementCenterScreenProps {
  session?: ProcurementSession;
  onRefreshSession?: () => Promise<ProcurementSession[]> | void;
  onStartNewNegotiation?: () => void;
  onSelectSessionHistory?: () => void;
  onSessionUpdated?: (updated: ProcurementSession) => void;
}

const REQUIRED_INVARIANTS = [
  {
    key: "SKU_INTEGRITY",
    title: "1. SKU & Condition Integrity",
    desc: "Selected catalog SKU and condition match mandate requirements exactly.",
  },
  {
    key: "PRICE_CEILING",
    title: "2. Price Ceiling & Arithmetic",
    desc: "Recalculates Landed Cost = Price × Qty + Shipping <= Max Total Budget.",
  },
  {
    key: "RETURN_POLICY",
    title: "3. Return Policy SLA",
    desc: "Agreed return window >= Min Return Days, verified via DOM attestation.",
  },
  {
    key: "DELIVERY_SLA",
    title: "4. Delivery SLA",
    desc: "Agreed delivery SLA in days <= mandate Max Delivery Days.",
  },
  {
    key: "CRYPTOGRAPHIC_LINEAGE",
    title: "5. Cryptographic Lineage",
    desc: "Merkle root bound to PayPal Orders v2 custom_id exactly matches authoritative tree.",
  },
] as const;

export function SettlementCenterScreen({
  session,
  onRefreshSession,
  onStartNewNegotiation,
  onSelectSessionHistory,
  onSessionUpdated,
}: SettlementCenterScreenProps) {
  const [isInitiating, setIsInitiating] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const selectedQuote = session?.selectedQuote;
  const finalOffer = session?.finalOffer;
  const mandate = session?.mandate;

  const totalAmount = finalOffer
    ? finalOffer.unitPrice * finalOffer.quantity + finalOffer.shippingCost
    : 0;

  const mandateBudget = mandate?.maxTotalBudget ?? 0;
  const netSavings = mandateBudget > 0 ? mandateBudget - totalAmount : 0;
  const savingsPct = mandateBudget > 0 ? (netSavings / mandateBudget) * 100 : 0;

  // Strict Fail-Closed Audit Evaluation (Section 13)
  const auditCert = session?.auditCertificate;
  const isAuditPassed = Boolean(auditCert && auditCert.passed === true);
  const isAuditFailed = Boolean(auditCert && auditCert.passed === false);
  const isAuditMissing = auditCert === undefined;

  const handleCopySessionId = () => {
    if (!session?.id) return;
    navigator.clipboard.writeText(session.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  /**
   * Run independent ACWORLD Pre-Checkout Audit
   */
  const handleRunAudit = async () => {
    if (!session?.id || isRunningAudit) return;
    setIsRunningAudit(true);
    setAuditError(null);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/procurement/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "ACWORLD pre-checkout audit failed.");
      }

      if (onSessionUpdated && session) {
        onSessionUpdated({
          ...session,
          auditCertificate: data.auditCertificate,
          status: data.status,
        });
      }

      if (onRefreshSession) {
        await onRefreshSession();
      }
    } catch (err: unknown) {
      setAuditError(err instanceof Error ? err.message : "Audit evaluation failed.");
    } finally {
      setIsRunningAudit(false);
    }
  };

  /**
   * Primary Action: Initiates PayPal Orders v2 checkout and redirects
   * the browser to the official PayPal Sandbox approval screen.
   * Strictly blocked unless ACWORLD audit passed.
   */
  const handleContinueToPayPal = async () => {
    if (!session?.id || isInitiating || !isAuditPassed) return;
    setIsInitiating(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/paypal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.approvalUrl) {
        throw new Error(data.error || "Failed to initiate PayPal Sandbox checkout.");
      }

      // Security validation: verify hostname strictly belongs to PayPal Sandbox or PayPal
      const parsedUrl = new URL(data.approvalUrl);
      const allowedHosts = [
        "www.sandbox.paypal.com",
        "sandbox.paypal.com",
        "api-m.sandbox.paypal.com",
        "www.paypal.com",
      ];

      if (!allowedHosts.includes(parsedUrl.hostname)) {
        throw new Error(`Security rejection: Untrusted redirect host '${parsedUrl.hostname}'.`);
      }

      if (onRefreshSession) {
        await onRefreshSession();
      }

      // Normal browser redirect to the authoritative PayPal Sandbox checkout interface
      window.location.assign(data.approvalUrl);
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout initiation failed.");
      setIsInitiating(false);
    }
  };

  /**
   * Manual capture trigger (for orders already authorized by buyer in Sandbox)
   */
  const handleAuditedCapture = async () => {
    if (!session?.id || !session.paypalOrderId || isCapturing) return;
    setIsCapturing(true);
    setConfirmModalOpen(false);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/paypal/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          orderId: session.paypalOrderId,
          createInvoice: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Audited capture failed.");
      }

      if (onRefreshSession) await onRefreshSession();
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : "Capture request failed.");
    } finally {
      setIsCapturing(false);
    }
  };

  const getStatusBadgeConfig = (status?: ProcurementSessionStatus) => {
    switch (status) {
      case "SETTLED":
      case "PAYPAL_CAPTURED":
        return { status: "verified" as const, label: "Captured & Settled" };
      case "PAYPAL_AUTHORIZED":
        return { status: "info" as const, label: "Authorized by Buyer" };
      case "AWAITING_PAYPAL_APPROVAL":
        return { status: "warning" as const, label: "Awaiting PayPal Approval" };
      case "CAPTURE_PENDING_RECONCILIATION":
        return { status: "warning" as const, label: "Capture Pending Reconciliation" };
      case "DISPUTED":
        return { status: "warning" as const, label: "Disputed" };
      case "AUDIT_PASSED":
        return { status: "verified" as const, label: "Audit Verified" };
      case "AUDIT_FAILED":
        return { status: "failure" as const, label: "Audit Blocked" };
      case "CANCELLED":
        return { status: "failure" as const, label: "Cancelled" };
      default:
        return { status: "neutral" as const, label: status?.replace(/_/g, " ") || "Awaiting Settlement" };
    }
  };

  const badgeConfig = getStatusBadgeConfig(session?.status);
  const isSessionNotFound = checkoutError?.includes("not found in authoritative store");

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <SectionHeader
          title="Settlement Center"
          subtitle="Zero-trust ACWORLD audit verification and cryptographically bound PayPal Orders v2 settlement."
        />
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <span className="text-[11.5px] font-mono-token font-medium px-2.5 py-1 rounded-[4px] bg-smoke/30 dark:bg-[#202025] text-obsidian dark:text-[#f6f4f0] border border-smoke dark:border-[#2b2b32]">
            PayPal Sandbox
          </span>
          <StatusBadge status={badgeConfig.status} label={badgeConfig.label} />
        </div>
      </div>

      {!session ? (
        <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-10 text-center text-[#6e6e78] dark:text-[#8e8a83] border border-smoke dark:border-[#2b2b32] space-y-4">
          <CreditCard className="w-10 h-10 mx-auto text-ash-gray mb-1 opacity-70" aria-hidden="true" />
          <h3 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0]">
            No Authoritative Session Selected
          </h3>
          <p className="text-[13.5px] text-[#4a4a52] dark:text-[#b8b5af] max-w-sm mx-auto leading-relaxed">
            Please run a procurement negotiation in the Negotiation Arena to select a winning vendor offer before proceeding to settlement.
          </p>
          <div className="flex justify-center gap-2.5 pt-2">
            {onStartNewNegotiation && (
              <PrimaryButton onClick={onStartNewNegotiation} className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4" />
                <span>Start New Negotiation</span>
              </PrimaryButton>
            )}
            {onSelectSessionHistory && (
              <GhostButton onClick={onSelectSessionHistory} className="flex items-center gap-2">
                <History className="w-4 h-4" />
                <span>Procurement History</span>
              </GhostButton>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Missing Session Recovery Alert */}
          {isSessionNotFound && (
            <div className="p-4 rounded-[8px] bg-[#fff8eb] dark:bg-[#261a08] border border-ember-orange/35 space-y-2.5">
              <div className="flex items-center gap-2 text-ember-orange font-semibold text-[14px]">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Authoritative Session Not Found in Server Store</span>
              </div>
              <p className="text-[13px] text-[#4a4a52] dark:text-[#b8b5af] leading-relaxed">
                The session <code className="font-mono-token text-architect-violet dark:text-[#a78bfa] bg-lavender-mist dark:bg-[#20182b] px-1.5 py-0.5 rounded text-[12px] font-medium">{session.id}</code> is not registered in the authoritative server store. This can happen if the server process restarted.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {onStartNewNegotiation && (
                  <PrimaryButton onClick={onStartNewNegotiation} className="text-[12.5px] h-9 px-3.5">
                    Start New Mandate
                  </PrimaryButton>
                )}
                {onSelectSessionHistory && (
                  <GhostButton onClick={onSelectSessionHistory} className="text-[12.5px] h-9 px-3.5">
                    Select Valid Session from History
                  </GhostButton>
                )}
                {onRefreshSession && (
                  <GhostButton onClick={() => onRefreshSession()} className="text-[12.5px] h-9 px-3.5">
                    Reload Server Store
                  </GhostButton>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Transaction Breakdown & Settlement Action */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-6 border border-smoke dark:border-[#2b2b32] shadow-2xs space-y-5">
                <div className="flex justify-between items-start pb-3.5 border-b border-smoke/80 dark:border-[#2b2b32]">
                  <div>
                    <h2 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                      Agreed Transaction Terms
                    </h2>
                    <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mt-0.5">Authoritative procurement contract</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySessionId}
                    title="Click to copy full Authoritative Session ID"
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-warm-cream/50 dark:bg-[#202025] hover:bg-smoke/60 dark:hover:bg-[#282830] text-[11px] font-mono-token text-architect-violet dark:text-[#a78bfa] border border-smoke dark:border-[#2b2b32] transition-colors cursor-pointer"
                  >
                    <span>{session.id.slice(0, 14)}...</span>
                    {copiedId ? <Check className="w-3 h-3 text-lichen-green" aria-hidden="true" /> : <Copy className="w-3 h-3 text-ash-gray" aria-hidden="true" />}
                  </button>
                </div>

                <div className="space-y-3 text-[13.5px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">Selected Supplier:</span>
                    <span className="font-semibold text-obsidian dark:text-[#f6f4f0]">{selectedQuote?.vendorName || "Not selected"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">SKU / Product:</span>
                    <span className="font-mono-token text-[11.5px] text-architect-violet dark:text-[#a78bfa] bg-lavender-mist dark:bg-[#20182b] px-2 py-0.5 rounded border border-architect-violet/20">
                      {selectedQuote?.sku || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">Agreed Unit Price:</span>
                    <CurrencyDisplay
                      amount={finalOffer?.unitPrice || 0}
                      currency={mandate?.currency}
                      size="sm"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">Quantity:</span>
                    <span className="font-medium text-obsidian dark:text-[#f6f4f0] tabular-nums">{finalOffer?.quantity || 0} units</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">Delivery SLA:</span>
                    <span className="text-obsidian dark:text-[#f6f4f0]">{finalOffer?.deliveryDays ?? "—"} Days (Max {mandate?.maxDeliveryDays}d)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">Return Policy Window:</span>
                    <span className="text-obsidian dark:text-[#f6f4f0]">{finalOffer?.returnDays ?? "—"} Days (Min {mandate?.minReturnDays}d)</span>
                  </div>

                  {/* Financial Comparison: Budget Ceiling vs Negotiated Landed Total */}
                  <div className="pt-3.5 border-t border-smoke/80 dark:border-[#2b2b32] space-y-2">
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="text-[#6e6e78] dark:text-[#8e8a83]">Mandate Budget Ceiling:</span>
                      <span className="font-mono-token text-obsidian dark:text-[#f6f4f0] font-medium">
                        ${mandateBudget.toLocaleString()} {mandate?.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="text-[#6e6e78] dark:text-[#8e8a83]">Agreed Landed Cost:</span>
                      <span className="font-mono-token text-ember-orange font-semibold text-[15px]">
                        ${totalAmount.toLocaleString()} {mandate?.currency}
                      </span>
                    </div>
                    {mandateBudget > 0 && (
                      <div className="flex justify-between items-center text-[13px] pt-1">
                        <span className="text-[#6e6e78] dark:text-[#8e8a83]">Procurement Savings:</span>
                        <span className="font-mono-token text-[#006840] dark:text-lichen-green font-semibold">
                          +${netSavings.toLocaleString()} ({savingsPct.toFixed(1)}%)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit Error Banner */}
                {auditError && (
                  <div className="p-3.5 rounded-[6px] bg-[#feeef0] dark:bg-[#2b1012] border border-[#ef4444]/25 text-[#dc2626] dark:text-[#f87171] text-[12.5px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="leading-snug">{auditError}</div>
                  </div>
                )}

                {/* Checkout Error Banner */}
                {checkoutError && !isSessionNotFound && (
                  <div className="p-3.5 rounded-[6px] bg-[#feeef0] dark:bg-[#2b1012] border border-[#ef4444]/25 text-[#dc2626] dark:text-[#f87171] text-[12.5px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="leading-snug">{checkoutError}</div>
                  </div>
                )}

                {/* Status Specific Notice */}
                {session.status === "CAPTURE_PENDING_RECONCILIATION" && (
                  <NoticeBanner
                    variant="warning"
                    title="Payment Outcome Uncertain — Reconciliation Required"
                  >
                    A capture request was transmitted, but the network or PayPal Sandbox response timed out or returned an ambiguous state. Order #{session.paypalOrderId || "..."} requires reconciliation before taking further action. Do not re-attempt capture to prevent duplicate charges.
                  </NoticeBanner>
                )}

                {session.status === "AWAITING_PAYPAL_APPROVAL" && (
                  <div className="p-3.5 rounded-[6px] bg-[#fff8eb] dark:bg-[#281a08] border border-ember-orange/30 text-ember-orange text-[12.5px] space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>Awaiting PayPal Sandbox Approval</span>
                    </div>
                    <p className="text-[12px] text-[#4a4a52] dark:text-[#b8b5af] leading-relaxed">
                      Order #{session.paypalOrderId || "..."} has been initialized. Click below to enter PayPal Sandbox and approve authorization.
                    </p>
                  </div>
                )}

                {/* Primary Action Button (Strictly Fail-Closed) */}
                <div className="pt-1">
                  {session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED" ? (
                    <div className="p-3 bg-mint-whisper dark:bg-[#10211a] rounded-[8px] text-center text-[13px] text-[#006840] dark:text-[#4ade80] font-semibold flex items-center justify-center gap-2 border border-lichen-green/25">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>PayPal Funds Captured &amp; Invoice Created</span>
                    </div>
                  ) : session.status === "CAPTURE_PENDING_RECONCILIATION" ? (
                    <div className="p-3 bg-amber-500/10 dark:bg-amber-500/15 rounded-[8px] text-center text-[13px] text-amber-800 dark:text-amber-300 font-semibold flex items-center justify-center gap-2 border border-amber-500/30">
                      <AlertCircle className="w-4 h-4" aria-hidden="true" />
                      <span>Capture Retries Disabled — Awaiting Reconciliation</span>
                    </div>
                  ) : session.status === "PAYPAL_AUTHORIZED" ? (
                    <PrimaryButton
                      onClick={() => setConfirmModalOpen(true)}
                      disabled={isCapturing}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {isCapturing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          <span>Auditing &amp; Capturing Funds...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" aria-hidden="true" />
                          <span>Run ACWORLD Audit &amp; Capture</span>
                        </>
                      )}
                    </PrimaryButton>
                  ) : (
                    <div className="space-y-2.5">
                      {isAuditPassed && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#006840] dark:text-[#4ade80] font-medium justify-center pb-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Audited &amp; Eligible for PayPal Authorization</span>
                        </div>
                      )}

                      {/* STRICT FAIL-CLOSED BUTTON: Requires isAuditPassed === true */}
                      <PrimaryButton
                        onClick={handleContinueToPayPal}
                        disabled={
                          isInitiating ||
                          isSessionNotFound ||
                          !finalOffer ||
                          !selectedQuote ||
                          !isAuditPassed
                        }
                        className="w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isInitiating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Connecting to PayPal Sandbox...</span>
                          </>
                        ) : (
                          <>
                            <span>Continue to PayPal</span>
                            <ExternalLink className="w-4 h-4" aria-hidden="true" />
                          </>
                        )}
                      </PrimaryButton>

                      {/* Explicit Explanations for Readiness State */}
                      {isAuditMissing && (
                        <p className="text-[12px] text-architect-violet dark:text-[#a78bfa] text-center font-medium">
                          Audit Required: Run ACWORLD Pre-Checkout Audit before releasing PayPal authorization.
                        </p>
                      )}
                      {isAuditFailed && (
                        <p className="text-[12px] text-[#dc2626] dark:text-[#f87171] text-center font-medium">
                          PayPal checkout blocked: One or more ACWORLD audit invariants failed.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* PayPal Transaction Artifacts Card */}
              <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-5 border border-smoke dark:border-[#2b2b32] space-y-3 shadow-2xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-smoke/80 dark:border-[#2b2b32]">
                  <h3 className="text-[12px] font-mono-token uppercase tracking-wider text-architect-violet dark:text-[#a78bfa] font-medium">
                    PayPal Transaction Artifacts
                  </h3>
                  <span className="text-[11px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                    intent: AUTHORIZE
                  </span>
                </div>

                <div className="space-y-2.5 text-[13px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">PayPal Order ID:</span>
                    <span className="font-mono-token text-[11.5px] text-obsidian dark:text-[#f6f4f0]">
                      {session.paypalOrderId || "Pending Authorization"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">PayPal Capture ID:</span>
                    <span className="font-mono-token text-[11.5px] text-obsidian dark:text-[#f6f4f0]">
                      {session.paypalCaptureId || "Pending Server Capture"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">B2B Invoice ID:</span>
                    <span className="font-mono-token text-[11.5px] text-obsidian dark:text-[#f6f4f0]">
                      {session.paypalInvoiceId || "Pending Invoice Generation"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6e6e78] dark:text-[#8e8a83]">Bound Merkle Root:</span>
                    <span className="font-mono-token text-[11.5px] text-architect-violet dark:text-[#a78bfa]">
                      {session.merkleRoot ? `${session.merkleRoot.slice(0, 16)}...` : "Pending Tree Seal"}
                    </span>
                  </div>
                </div>

                {session.paypalInvoiceId && (
                  <div className="pt-2.5 border-t border-smoke/80 dark:border-[#2b2b32] flex items-center justify-between text-[12px]">
                    <span className="text-[#006840] dark:text-[#4ade80] flex items-center gap-1.5 font-medium">
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                      Invoice Generated in Sandbox
                    </span>
                    <span className="font-mono-token text-[11px] text-[#6e6e78] dark:text-[#8e8a83]">STATUS: SENT</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: ACWORLD Independent 5-Invariant Audit Gate */}
            <div className="lg:col-span-7 bg-paper-white dark:bg-[#18181b] rounded-cards p-6 sm:p-7 border border-smoke dark:border-[#2b2b32] flex flex-col justify-between shadow-2xs">
              <div>
                <div className="pb-3.5 border-b border-smoke/80 dark:border-[#2b2b32] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
                      Independent ACWORLD Audit Gate
                    </h2>
                    <p className="text-[13px] text-[#4a4a52] dark:text-[#b8b5af] mt-0.5">
                      Server-side verification strictly required prior to releasing PayPal capture
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83] bg-smoke/30 dark:bg-[#202025] px-2.5 py-1 rounded-[4px] border border-smoke dark:border-[#2b2b32]">
                      Zero-Trust Gate
                    </span>
                    <button
                      type="button"
                      onClick={handleRunAudit}
                      disabled={isRunningAudit || !finalOffer || isSessionNotFound}
                      title="Run or re-evaluate the 5 independent ACWORLD invariants on the server"
                      className="px-3 py-1 rounded-[6px] text-[12.5px] font-medium bg-paper-white dark:bg-[#202025] hover:bg-smoke/40 dark:hover:bg-[#292930] text-obsidian dark:text-[#f6f4f0] border border-smoke dark:border-[#2b2b32] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
                    >
                      {isRunningAudit ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-ember-orange" aria-hidden="true" />
                          <span>Auditing...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-lichen-green" aria-hidden="true" />
                          <span>{auditCert ? "Re-Run Audit" : "Run Audit"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-5 space-y-3.5">
                  {/* Status Banner */}
                  {auditCert ? (
                    <div
                      className={`p-3.5 rounded-[8px] border flex items-center justify-between ${
                        auditCert.passed
                          ? "bg-paper-white dark:bg-[#18181b] border-smoke dark:border-[#2b2b32] text-obsidian dark:text-[#f6f4f0]"
                          : "bg-paper-white dark:bg-[#18181b] border-[#ef4444]/40 text-[#dc2626] dark:text-[#f87171]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 font-semibold text-[13.5px]">
                        {auditCert.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-lichen-green shrink-0" aria-hidden="true" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-[#ef4444] shrink-0" aria-hidden="true" />
                        )}
                        <span className="tracking-tight">
                          {auditCert.passed
                            ? "All 5 Invariants Independently Verified"
                            : "Fail-Closed: Audit Gate Blocked"}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono-token px-2 py-0.5 rounded-[4px] bg-smoke/30 dark:bg-[#202025] text-[#6e6e78] dark:text-[#8e8a83] border border-smoke dark:border-[#2b2b32]">
                        #{auditCert.certificateId.slice(-8)}
                      </span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-[8px] bg-smoke/30 dark:bg-[#1c1c20] border border-smoke dark:border-[#2b2b32] text-obsidian dark:text-[#f6f4f0] text-[12.5px] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-[#6e6e78] dark:text-[#8e8a83]" aria-hidden="true" />
                        <span>Pre-Checkout Audit Pending Server Evaluation</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunAudit}
                        disabled={isRunningAudit || isSessionNotFound}
                        className="px-2.5 py-1 rounded-[6px] bg-ember-orange text-white font-medium text-[12px] hover:bg-[#e65c00] transition-colors cursor-pointer"
                      >
                        Run Evaluation
                      </button>
                    </div>
                  )}

                  {/* Semantic Invariant Rows (Matched by key, never by array position) */}
                  <div className="divide-y divide-smoke/80 dark:divide-[#242429] pt-1">
                    {REQUIRED_INVARIANTS.map((req) => {
                      const inv = auditCert?.invariants?.find((i) => i.name === req.key);
                      const isEvaluated = Boolean(inv);
                      const isPassed = inv?.passed === true;

                      return (
                        <div
                          key={req.key}
                          className="py-3.5 flex items-start justify-between gap-4"
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[13.5px] text-obsidian dark:text-[#f6f4f0]">
                              {req.title}
                            </div>
                            <div className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed">
                              {inv?.reason || req.desc}
                            </div>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <StatusBadge
                              status={isEvaluated ? (isPassed ? "verified" : "failure") : "neutral"}
                              label={isEvaluated ? (isPassed ? "PASSED" : "FAILED") : "PENDING"}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-3.5 mt-5 border-t border-smoke/80 dark:border-[#2b2b32] text-[12px] text-[#6e6e78] dark:text-[#8e8a83] flex items-center justify-between">
                <span>Auditor Policy: Fail-Closed Protection</span>
                <span className="text-[#006840] dark:text-[#4ade80] font-medium">Zero-Trust Settlement Gate</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Authorized Orders */}
      <ConfirmationModal
        isOpen={confirmModalOpen}
        title="Confirm Audited Capture"
        description={`You are about to invoke the server-side audited PayPal capture gate for ${session?.id}. ACWORLD will independently inspect all five mathematical and cryptographic invariants. If any invariant fails, funds will NOT be released.`}
        confirmLabel="Audit & Capture"
        cancelLabel="Cancel"
        onConfirm={handleAuditedCapture}
        onCancel={() => setConfirmModalOpen(false)}
      />
    </div>
  );
}
