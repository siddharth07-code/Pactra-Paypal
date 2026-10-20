"use client";

/**
 * PACTUM — Settlement Center Screen
 * Implements real PayPal Sandbox checkout initiation and audited capture display.
 * Primary Action: "Continue to PayPal" -> redirects to real PayPal Sandbox approval interface.
 * Follows design.md, GEMINI.md Section 8, 9, 12 and SECURITY.md Section 3, 7.
 */

import React, { useState } from "react";
import {
  PrimaryButton,
  GhostButton,
  CurrencyDisplay,
  StatusBadge,
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
  RefreshCw,
  PlusCircle,
  History,
} from "lucide-react";
import type { ProcurementSession, ProcurementSessionStatus } from "@/types/pactum";

interface SettlementCenterScreenProps {
  session?: ProcurementSession;
  onRefreshSession?: () => Promise<ProcurementSession[]> | void;
  onStartNewNegotiation?: () => void;
  onSelectSessionHistory?: () => void;
  onSessionUpdated?: (updated: ProcurementSession) => void;
}

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

  const auditCert = session?.auditCertificate;
  const isAuditPassed = auditCert?.passed ?? false;
  const isAuditFailed = auditCert !== undefined && !auditCert.passed;

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
   */
  const handleContinueToPayPal = async () => {
    if (!session?.id || isInitiating) return;
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
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[36px] font-medium tracking-[-0.72px] text-[#000000]">
            Settlement center
          </h1>
          <p className="text-[16px] text-[#888888] mt-1">
            Zero-trust ACWORLD audit verification and cryptographically bound PayPal Orders v2 settlement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium px-3.5 py-1.5 rounded-[24px] bg-[#fff2e6] text-[#ff6600] border border-[#ff6600]/30">
            PayPal Sandbox
          </span>
          <StatusBadge status={badgeConfig.status} label={badgeConfig.label} />
        </div>
      </div>

      {!session ? (
        <div className="bg-[#f6f3ee] rounded-[24px] p-12 text-center text-[#888888] border border-[#e5e5e5] space-y-4">
          <CreditCard className="w-12 h-12 mx-auto text-[#aa8855] mb-2 opacity-70" />
          <h3 className="text-[20px] font-medium text-[#000000]">No Authoritative Session Selected</h3>
          <p className="text-[14px] text-[#888888] max-w-md mx-auto leading-relaxed">
            Please run a procurement negotiation in the Negotiation Arena to select a winning vendor offer before proceeding to settlement.
          </p>
          <div className="flex justify-center gap-3 pt-3">
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
        <div className="space-y-8">
          {/* Missing Session Recovery Alert */}
          {isSessionNotFound && (
            <div className="p-6 rounded-[20px] bg-[#fff8eb] border border-[#ff6600]/40 space-y-3">
              <div className="flex items-center gap-2.5 text-[#ff6600] font-medium text-[16px]">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>Authoritative Session Not Found in Server Store</span>
              </div>
              <p className="text-[14px] text-[#888888] leading-relaxed">
                The session <code className="font-mono-token text-[#5c2999] bg-[#f6f1fe] px-2 py-0.5 rounded font-medium">{session.id}</code> is not registered in the authoritative server store. This can happen if the server process restarted or an uncommitted session ID was retained by client cache.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {onStartNewNegotiation && (
                  <PrimaryButton onClick={onStartNewNegotiation} className="flex items-center gap-2 text-[13px]">
                    <PlusCircle className="w-4 h-4" />
                    <span>Start New Negotiation</span>
                  </PrimaryButton>
                )}
                {onSelectSessionHistory && (
                  <GhostButton onClick={onSelectSessionHistory} className="flex items-center gap-2 text-[13px]">
                    <History className="w-4 h-4" />
                    <span>Select Valid Session from History</span>
                  </GhostButton>
                )}
                {onRefreshSession && (
                  <GhostButton onClick={() => onRefreshSession()} className="flex items-center gap-2 text-[13px]">
                    <RefreshCw className="w-4 h-4" />
                    <span>Reload Server Sessions</span>
                  </GhostButton>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Transaction Breakdown & Settlement Action */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#ffffff] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] space-y-6">
                <div className="flex justify-between items-start pb-4 border-b border-[#e5e5e5]">
                  <div>
                    <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
                      Agreed Transaction Terms
                    </h2>
                    <p className="text-[13px] text-[#888888] mt-0.5">Authoritative procurement contract</p>
                  </div>
                  <button
                    onClick={handleCopySessionId}
                    title="Click to copy full Authoritative Session ID"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#f6f3ee] hover:bg-[#eae6df] text-[12px] font-mono-token text-[#5c2999] border border-[#e5e5e5] transition-colors"
                  >
                    <span>{session.id.slice(0, 16)}...</span>
                    {copiedId ? <Check className="w-3.5 h-3.5 text-[#00cc88]" /> : <Copy className="w-3.5 h-3.5 text-[#888888]" />}
                  </button>
                </div>

                <div className="space-y-4 text-[15px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Selected Supplier:</span>
                    <span className="font-medium text-[#000000]">{selectedQuote?.vendorName || "Not selected"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">SKU / Product:</span>
                    <span className="font-mono-token text-[12px] text-[#5c2999] bg-[#f6f1fe] px-2 py-0.5 rounded">
                      {selectedQuote?.sku || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Agreed Unit Price:</span>
                    <CurrencyDisplay
                      amount={finalOffer?.unitPrice || 0}
                      currency={mandate?.currency}
                      size="sm"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Quantity:</span>
                    <span className="font-medium text-[#000000]">{finalOffer?.quantity || 0} units</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Delivery SLA:</span>
                    <span className="text-[#000000]">{finalOffer?.deliveryDays ?? "—"} Days (Max {mandate?.maxDeliveryDays}d)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Return Policy Window:</span>
                    <span className="text-[#000000]">{finalOffer?.returnDays ?? "—"} Days (Min {mandate?.minReturnDays}d)</span>
                  </div>

                  {/* Financial Comparison: Budget Ceiling vs Negotiated Landed Total */}
                  <div className="pt-4 border-t border-[#e5e5e5] space-y-2.5">
                    <div className="flex justify-between items-center text-[14px]">
                      <span className="text-[#888888]">Mandate Budget Ceiling:</span>
                      <span className="font-mono-token text-[#000000] font-medium">
                        ${mandateBudget.toLocaleString()} {mandate?.currency}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[14px]">
                      <span className="text-[#888888]">Agreed Landed Cost:</span>
                      <span className="font-mono-token text-[#ff6600] font-semibold text-[16px]">
                        ${totalAmount.toLocaleString()} {mandate?.currency}
                      </span>
                    </div>
                    {mandateBudget > 0 && (
                      <div className="flex justify-between items-center text-[14px] bg-[#ebfef6] p-2.5 rounded-[12px] border border-[#00cc88]/30">
                        <span className="text-[#00cc88] font-medium">Procurement Savings:</span>
                        <span className="font-mono-token text-[#00cc88] font-semibold">
                          +${netSavings.toLocaleString()} ({savingsPct.toFixed(1)}%)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit Error Banner */}
                {auditError && (
                  <div className="p-4 rounded-[16px] bg-[#feeef0] border border-[#ef4444]/30 text-[#ef4444] text-[13px] flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="leading-snug">{auditError}</div>
                  </div>
                )}

                {/* Checkout Error Banner */}
                {checkoutError && !isSessionNotFound && (
                  <div className="p-4 rounded-[16px] bg-[#feeef0] border border-[#ef4444]/30 text-[#ef4444] text-[13px] flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="leading-snug">{checkoutError}</div>
                  </div>
                )}

                {/* Status Specific Notice */}
                {session.status === "AWAITING_PAYPAL_APPROVAL" && (
                  <div className="p-4 rounded-[16px] bg-[#fff8eb] border border-[#ff6600]/30 text-[#aa5500] text-[13px] space-y-1">
                    <div className="font-medium flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin text-[#ff6600]" />
                      <span>Awaiting PayPal Sandbox Approval</span>
                    </div>
                    <p className="text-[12px] text-[#888888] leading-relaxed">
                      Order #{session.paypalOrderId || "..."} has been initialized. Click below to enter PayPal Sandbox and approve authorization.
                    </p>
                  </div>
                )}

                {/* Primary Action Button */}
                <div className="pt-2">
                  {session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED" ? (
                    <div className="p-4 bg-[#ebfef6] rounded-[24px] text-center text-[14px] text-[#00cc88] font-medium flex items-center justify-center gap-2 border border-[#00cc88]/30">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>PayPal Funds Captured &amp; Invoice Created</span>
                    </div>
                  ) : session.status === "PAYPAL_AUTHORIZED" ? (
                    <PrimaryButton
                      onClick={() => setConfirmModalOpen(true)}
                      disabled={isCapturing}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {isCapturing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Auditing &amp; Capturing Funds...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>Run ACWORLD Audit &amp; Capture</span>
                        </>
                      )}
                    </PrimaryButton>
                  ) : (
                    <div className="space-y-3">
                      {isAuditPassed && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#00cc88] font-medium justify-center pb-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Audited &amp; Eligible for PayPal Authorization</span>
                        </div>
                      )}
                      <PrimaryButton
                        onClick={handleContinueToPayPal}
                        disabled={
                          isInitiating ||
                          isSessionNotFound ||
                          !finalOffer ||
                          !selectedQuote ||
                          isAuditFailed
                        }
                        className="w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isInitiating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Connecting to PayPal Sandbox...</span>
                          </>
                        ) : (
                          <>
                            <span>Continue to PayPal</span>
                            <ExternalLink className="w-4 h-4" />
                          </>
                        )}
                      </PrimaryButton>
                      {isAuditFailed && (
                        <p className="text-[12px] text-[#ef4444] text-center">
                          PayPal checkout disabled: One or more ACWORLD audit invariants failed.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* PayPal Transaction Artifacts Card */}
              <div className="bg-[#f6f3ee] rounded-[24px] p-8 border border-[#e5e5e5] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#e5e5e5]">
                  <h3 className="text-[14px] font-medium uppercase tracking-[-0.28px] text-[#5c2999]">
                    PayPal Transaction Artifacts
                  </h3>
                  <span className="text-[11px] font-mono-token text-[#888888]">
                    intent: AUTHORIZE
                  </span>
                </div>
                <div className="space-y-3 text-[14px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Orders v2 Order ID:</span>
                    <span className="font-mono-token text-[#000000] font-medium">
                      {session.paypalOrderId || "Awaiting Checkout Initiation"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Authorization ID:</span>
                    <span className="font-mono-token text-[#5c2999]">
                      {session.paypalAuthorizationId ||
                        (session.status === "AWAITING_PAYPAL_APPROVAL"
                          ? "Pending Buyer Approval"
                          : session.status === "PAYPAL_AUTHORIZED"
                          ? "Authorized by Buyer"
                          : "Pending Order Creation")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">Captured Payment ID:</span>
                    <span className="font-mono-token text-[#00cc88]">
                      {session.paypalCaptureId ||
                        (session.status === "PAYPAL_AUTHORIZED"
                          ? "Ready for Audited Capture"
                          : "Awaiting Audit Gate")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888888]">B2B Invoice ID:</span>
                    <span className="font-mono-token text-[#5c2999]">
                      {session.paypalInvoiceId || "Draft Generated Post-Capture"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-[#e5e5e5] text-[12px]">
                    <span className="text-[#888888]">Merkle Root Binding:</span>
                    <span className="font-mono-token text-[#888888] truncate max-w-[200px]" title={session.preSettlementRoot || session.merkleRoot}>
                      {session.preSettlementRoot ? `${session.preSettlementRoot.slice(0, 16)}...` : "Pending Evidence Commitment"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Independent ACWORLD 5-Invariant Audit Gate */}
            <div className="lg:col-span-7 bg-[#f6f3ee] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] flex flex-col justify-between space-y-6">
              <div>
                <div className="pb-4 border-b border-[#e5e5e5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
                      Independent ACWORLD Audit Gate
                    </h2>
                    <p className="text-[14px] text-[#888888] mt-0.5">
                      Server-side verification strictly required prior to releasing PayPal capture
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[#00cc88] bg-[#ebfef6] px-3.5 py-1.5 rounded-[24px] border border-[#00cc88]/30">
                      Zero-Trust Gate
                    </span>
                    <button
                      onClick={handleRunAudit}
                      disabled={isRunningAudit || !finalOffer || isSessionNotFound}
                      title="Run or re-evaluate the 5 independent ACWORLD invariants on the server"
                      className="px-3 py-1.5 rounded-[24px] text-[12px] font-medium bg-[#ffffff] hover:bg-[#eae6df] text-[#000000] border border-[#e5e5e5] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isRunningAudit ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ff6600]" />
                          <span>Auditing...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-[#00cc88]" />
                          <span>Run Audit</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-6 space-y-4">
                  {auditCert ? (
                    <div className="space-y-4">
                      <div
                        className={`p-5 rounded-[20px] border flex items-center justify-between ${
                          auditCert.passed
                            ? "bg-[#ebfef6] border-[#00cc88]/40 text-[#00cc88]"
                            : "bg-[#feeef0] border-[#ef4444]/40 text-[#ef4444]"
                        }`}
                      >
                        <div className="flex items-center gap-3 font-medium text-[15px]">
                          {auditCert.passed ? (
                            <CheckCircle2 className="w-5 h-5 text-[#00cc88]" />
                          ) : (
                            <ShieldAlert className="w-5 h-5 text-[#ef4444]" />
                          )}
                          <span>
                            {auditCert.passed
                              ? "ALL 5 INVARIANTS CRYPTOGRAPHICALLY VERIFIED"
                              : "FAIL-CLOSED: AUDIT GATE BLOCKED"}
                          </span>
                        </div>
                        <span className="text-[12px] font-mono-token px-3 py-1 rounded-[6px] bg-[#ffffff] text-[#000000] border border-[#e5e5e5]">
                          #{auditCert.certificateId.slice(-8)}
                        </span>
                      </div>

                      {/* Invariant Rows */}
                      <div className="space-y-3 pt-2">
                        {auditCert.invariants.map((inv, idx) => (
                          <div
                            key={idx}
                            className="bg-[#ffffff] rounded-[16px] p-5 border border-[#e5e5e5] flex items-start justify-between gap-4 shadow-sm"
                          >
                            <div className="space-y-1">
                              <div className="font-medium text-[15px] text-[#000000]">
                                {idx + 1}. {inv.name.replace(/_/g, " ")}
                              </div>
                              <div className="text-[13px] text-[#888888] leading-relaxed">
                                {inv.reason || "Strict compliance verified against active locked mandate."}
                              </div>
                            </div>
                            <span
                              className={`px-3 py-1 rounded-[24px] text-[12px] font-medium shrink-0 ${
                                inv.passed
                                  ? "bg-[#ebfef6] text-[#00cc88] border border-[#00cc88]/30"
                                  : "bg-[#feeef0] text-[#ef4444] border border-[#ef4444]/30"
                              }`}
                            >
                              {inv.passed ? "PASSED" : "FAILED"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 rounded-[16px] bg-[#fff8eb] border border-[#ff6600]/30 text-[#aa5500] text-[13px] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 text-[#ff6600]" />
                          <span>Pre-Checkout Audit Pending Server Evaluation</span>
                        </div>
                        <button
                          onClick={handleRunAudit}
                          disabled={isRunningAudit || isSessionNotFound}
                          className="px-3 py-1 rounded-[8px] bg-[#ff6600] text-[#ffffff] font-medium text-[12px] hover:bg-[#e55c00] transition-colors"
                        >
                          Run Evaluation
                        </button>
                      </div>

                      <p className="text-[14px] text-[#888888] leading-relaxed">
                        Before releasing PayPal funds, ACWORLD independently evaluates 5 non-negotiable invariants against the authoritative locked mandate:
                      </p>
                      {[
                        { name: "1. SKU & Condition Integrity", desc: "Selected catalog SKU and condition match mandate requirements exactly." },
                        { name: "2. Price Ceiling & Arithmetic", desc: "Recalculates Landed Cost = Price × Qty + Shipping <= Max Total Budget." },
                        { name: "3. Return Policy SLA", desc: "Agreed return window >= Min Return Days, verified via DOM attestation." },
                        { name: "4. Delivery SLA", desc: "Estimated delivery days <= Max Delivery Days constraint." },
                        { name: "5. Cryptographic Lineage", desc: "Recomputed SHA-256 Merkle root bound to PayPal order custom_id." },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-[#ffffff] rounded-[16px] p-4.5 border border-[#e5e5e5] text-[14px] flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-[#000000]">{item.name}</div>
                            <div className="text-[13px] text-[#888888] mt-0.5">{item.desc}</div>
                          </div>
                          <span className="text-[12px] text-[#888888] font-medium bg-[#f6f3ee] px-3 py-1 rounded-[24px]">
                            Pending Audit
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-[#e5e5e5] text-[13px] text-[#888888] flex items-center justify-between">
                <span>Auditor Policy: Fail-Closed Protection</span>
                <span className="text-[#00cc88] font-medium">Zero-Trust Settlement Gate</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Authorized Orders */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#000000]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#ffffff] rounded-[24px] max-w-md w-full p-8 space-y-6 shadow-[0px_16px_32px_0px_rgba(0,0,0,0.25)] border border-[#e5e5e5] animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-[#ff6600]">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-[20px] font-medium text-[#000000]">Confirm Audited Capture</h3>
            </div>
            <p className="text-[14px] text-[#888888] leading-relaxed">
              You are about to invoke the server-side audited PayPal capture gate for{" "}
              <strong className="text-[#000000]">{session?.id}</strong>. ACWORLD will independently inspect all five mathematical and cryptographic invariants. If any invariant fails, funds will <strong className="text-[#ef4444]">NOT</strong> be released.
            </p>
            <div className="bg-[#f6f3ee] p-5 rounded-[16px] border border-[#e5e5e5] text-[14px] space-y-2">
              <div className="flex justify-between text-[#888888]">
                <span>Total Capture Amount:</span>
                <span className="font-medium text-[#000000]">
                  ${totalAmount.toLocaleString()} {mandate?.currency}
                </span>
              </div>
              <div className="flex justify-between text-[#888888]">
                <span>Supplier:</span>
                <span className="text-[#000000] font-medium">{selectedQuote?.vendorName}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <GhostButton onClick={() => setConfirmModalOpen(false)}>
                Cancel
              </GhostButton>
              <PrimaryButton onClick={handleAuditedCapture}>
                Audit &amp; Capture
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
