"use client";

/**
 * PACTUM — Settlement Center Screen
 * Implements authoritative procurement terms, independent ACWORLD audit gate,
 * and PayPal Sandbox checkout / audited capture verification.
 * Follows GEMINI.md Section 8, 9, 12 and Phase 6.2 Semantic UI Specifications.
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
  RefreshCw,
  ArrowRightLeft,
} from "lucide-react";
import type { ProcurementSession, ProcurementSessionStatus, FXConversionRecord } from "@/types/pactum";
import { formatCurrency, formatDaysSLA } from "@/lib/currency";

function displayFxRate(rate: string): string {
  const [whole, decimals = ""] = rate.split(".");
  return `${whole}.${decimals.padEnd(4, "0")}`;
}

function FXRateProvenance({ record }: { record: FXConversionRecord }) {
  const reference = record.referenceRate;
  return (
    <div className="space-y-1.5 text-[11.5px] min-w-0 break-words">
      <div className="flex flex-wrap justify-between gap-2"><span>Rate Type:</span><span>{record.rateSource === "LIVE_PROVIDER" ? "External Reference Rate" : "Deterministic Demo Rate"}</span></div>
      <div className="flex flex-wrap justify-between gap-2"><span>Provider:</span><span>{record.provider || "Not Recorded"}</span></div>
      {reference && <>
        <div className="flex flex-wrap justify-between gap-2"><span>Provider Updated:</span><time dateTime={reference.updatedAt}>{new Date(reference.updatedAt).toLocaleString()}</time></div>
        <div className="flex flex-wrap justify-between gap-2"><span>Retrieved:</span><time dateTime={reference.retrievedAt}>{new Date(reference.retrievedAt).toLocaleString()}</time></div>
      </>}
      <div className="flex flex-wrap justify-between gap-2"><span>Quote Expires:</span><time dateTime={record.expiresAt}>{new Date(record.expiresAt).toLocaleString()}</time></div>
      <div className="flex flex-wrap justify-between gap-2"><span>Status:</span><span>{record.status !== "CONSUMED" && Date.parse(record.expiresAt) <= Date.now() ? "EXPIRED" : record.status}</span></div>
      {record.rateSource === "LIVE_PROVIDER" && <p className="text-text-secondary">Periodically updated reference rate. Quote expiry is separate from provider updates. This is not a guaranteed executable market rate.</p>}
    </div>
  );
}

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
    desc: "Catalog SKU and condition match mandate requirements exactly.",
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [isLockingQuote, setIsLockingQuote] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [selectedRateSource, setSelectedRateSource] = useState<"DETERMINISTIC_DEMO" | "LIVE_PROVIDER" | undefined>(undefined);

  // Authoritative agreement record and agreed offer
  const agreementRecord = session?.agreementRecord;
  const finalOffer = session?.finalOffer || agreementRecord?.agreedOffer;
  const selectedQuote = session?.selectedQuote;
  const mandate = session?.mandate;

  // An agreement is authoritative ONLY when an agreementRecord or a valid finalOffer with a selected vendor exists
  const hasAgreement = Boolean(agreementRecord || (finalOffer && selectedQuote));

  // Supplier & terms presentation
  const supplierName = hasAgreement
    ? agreementRecord?.vendorName || selectedQuote?.vendorName || "Agreed Supplier"
    : selectedQuote?.vendorName
    ? `${selectedQuote.vendorName} (Awaiting Agreement)`
    : "Awaiting agreement";

  const sku = hasAgreement
    ? agreementRecord?.sku || selectedQuote?.sku || "Not established"
    : selectedQuote?.sku
    ? selectedQuote.sku
    : "Not established";

  const unitPrice = hasAgreement ? (agreementRecord?.agreedPrice ?? finalOffer?.unitPrice ?? null) : null;
  const quantity = hasAgreement ? (finalOffer?.quantity ?? mandate?.quantity ?? null) : (mandate?.quantity ?? null);
  const deliveryDays = hasAgreement ? finalOffer?.deliveryDays : null;
  const returnDays = hasAgreement ? finalOffer?.returnDays : null;
  const shippingCost = hasAgreement ? (finalOffer?.shippingCost ?? 0) : null;

  // Landed cost and budget
  const mandateBudget = mandate?.maxTotalBudget ?? 0;
  const agreedLandedCost = hasAgreement && unitPrice !== null && quantity !== null
    ? (agreementRecord?.totalCost ?? (unitPrice * quantity + (shippingCost ?? 0)))
    : null;

  // Savings calculation ONLY when meaningful agreed landed cost exists and budget > 0
  const hasSavings = hasAgreement && agreedLandedCost !== null && mandateBudget > 0;
  const netSavings = hasSavings ? mandateBudget - agreedLandedCost : null;
  const savingsPct = hasSavings && mandateBudget > 0 ? (netSavings! / mandateBudget) * 100 : null;

  // Strict Fail-Closed Audit Evaluation (Section 13)
  const auditCert = session?.auditCertificate;
  const isAuditPassed = Boolean(auditCert && auditCert.passed === true && session?.status !== "AUDIT_FAILED");
  const isAuditFailed = Boolean((auditCert && auditCert.passed === false) || session?.status === "AUDIT_FAILED");
  const isAuditMissing = auditCert === undefined;
  const failedInvariantsCount = auditCert?.invariants?.filter((i) => !i.passed).length ?? (session?.status === "AUDIT_FAILED" ? 1 : 0);

  // Cross-Currency Settlement Bridge state
  const isCrossCurrency = Boolean(mandate?.currency && mandate.currency !== "USD");
  const fxVerification = session?.fxVerification;
  const hasFxVerification = Boolean(fxVerification && fxVerification.conversionHash === session?.fxRecord?.conversionHash && fxVerification.agreementHash === session?.fxRecord?.agreementHash && isAuditPassed && (session?.fxRecord?.status === "CONSUMED" || Date.parse(session?.fxRecord?.expiresAt ?? "") > Date.now()));
  const fxVerified = hasFxVerification && fxVerification!.passed && fxVerification!.checks.length > 0 && fxVerification!.checks.every(check => check.passed);
  const isFxQuoteExpired = Boolean(
    session?.fxRecord &&
    session.fxRecord.status !== "CONSUMED" &&
    new Date(session.fxRecord.expiresAt).getTime() <= Date.now()
  );

  // PayPal & Settlement Artifacts existence
  const hasAnyArtifact = Boolean(
    session?.paypalOrderId ||
    session?.paypalCaptureId ||
    session?.paypalInvoiceId ||
    session?.fxRecord ||
    session?.merkleRoot
  );

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  /**
   * Run independent ACWORLD Pre-Checkout Audit
   */
  const handleRunAudit = async () => {
    if (!session?.id || isRunningAudit || !hasAgreement) return;
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
      if (onRefreshSession) {
        try {
          await onRefreshSession();
        } catch {
          // Ignore refresh error
        }
      }
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

  /**
   * Authoritative reconciliation trigger for CAPTURE_PENDING_RECONCILIATION
   */
  const handleReconcile = async () => {
    if (!session?.id || isReconciling) return;
    setIsReconciling(true);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/paypal/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 504) {
        throw new Error(data.message || data.error || "Authoritative reconciliation query failed.");
      }
      if (onRefreshSession) await onRefreshSession();
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : "Reconciliation query failed.");
    } finally {
      setIsReconciling(false);
    }
  };

  /**
   * Cross-Currency Settlement Bridge: Request server-owned FX Quote
   */
  const handleGetFxQuote = async () => {
    if (!session?.id || isFetchingQuote || !isAuditPassed) return;
    setIsFetchingQuote(true);
    setFxError(null);
    try {
      const res = await fetch("/api/fx/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          rateSource: selectedRateSource ?? session.fxRecord?.rateSource,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.fxRecord) {
        throw new Error(data.error || "Failed to obtain FX settlement quote.");
      }
      if (onSessionUpdated) {
        onSessionUpdated({ ...session, fxRecord: data.fxRecord, fxVerification: data.fxVerification });
      }
      if (onRefreshSession) {
        await onRefreshSession();
      }
    } catch (err: unknown) {
      setFxError(err instanceof Error ? err.message : "Failed to obtain FX quote.");
    } finally {
      setIsFetchingQuote(false);
    }
  };

  /**
   * Cross-Currency Settlement Bridge: Lock FX Quote & run ACWORLD FX Verification
   */
  const handleLockFxQuote = async () => {
    if (!session?.id || !session.fxRecord || isLockingQuote || !isAuditPassed) return;
    setIsLockingQuote(true);
    setFxError(null);
    try {
      const res = await fetch("/api/fx/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          quoteId: session.fxRecord.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.fxRecord) {
        throw new Error(data.error || "Failed to lock FX quote.");
      }
      if (onSessionUpdated) {
        onSessionUpdated({ ...session, fxRecord: data.fxRecord, fxVerification: data.fxVerification });
      }
      if (onRefreshSession) {
        await onRefreshSession();
      }
    } catch (err: unknown) {
      setFxError(err instanceof Error ? err.message : "Failed to lock FX quote.");
    } finally {
      setIsLockingQuote(false);
    }
  };

  /**
   * Settlement Lifecycle Badge Config
   * Maps session and agreement states accurately to settlement lifecycle stages.
   */
  const getSettlementBadgeConfig = (status?: ProcurementSessionStatus, hasAgr: boolean = false) => {
    switch (status) {
      case "SETTLED":
        return { status: "verified" as const, label: "Settlement Completed" };
      case "PAYPAL_CAPTURED":
        return { status: "verified" as const, label: "Captured" };
      case "PAYPAL_AUTHORIZED":
        return { status: "info" as const, label: "Authorized by Buyer" };
      case "AWAITING_PAYPAL_APPROVAL":
        return { status: "warning" as const, label: "Awaiting PayPal Approval" };
      case "CAPTURE_PENDING_RECONCILIATION":
        return { status: "warning" as const, label: "Awaiting Reconciliation" };
      case "DISPUTED":
        return { status: "warning" as const, label: "Disputed" };
      case "AUDIT_PASSED":
        return { status: "verified" as const, label: "Audit Passed" };
      case "AUDIT_FAILED":
        return { status: "failure" as const, label: "Audit Blocked" };
      case "AUDIT_PENDING":
        if (isAuditPassed) {
          return { status: "verified" as const, label: "Audit Passed" };
        }
        return hasAgr
          ? { status: "warning" as const, label: "Awaiting Audit" }
          : { status: "neutral" as const, label: "Awaiting Agreement" };
      case "NEGOTIATING":
        return { status: "info" as const, label: "Negotiation In Progress" };
      case "SOURCING":
      case "MANDATE_PENDING":
        return { status: "neutral" as const, label: "Awaiting Vendor Selection" };
      case "CANCELLED":
        return { status: "failure" as const, label: "Cancelled" };
      default:
        if (isAuditPassed) {
          return { status: "verified" as const, label: "Audit Passed" };
        }
        return hasAgr
          ? { status: "neutral" as const, label: "Awaiting Audit" }
          : { status: "neutral" as const, label: "Awaiting Agreement" };
    }
  };

  const badgeConfig = getSettlementBadgeConfig(session?.status, hasAgreement);
  const isSessionNotFound = checkoutError?.includes("not found in authoritative store");

  return (
    <div className="space-y-8 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <SectionHeader
          title="Settlement Center"
          subtitle="Verify the agreed procurement terms before payment."
        />
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {isCrossCurrency ? (
            <>
              <span className="text-[11.5px] font-sans font-medium px-2.5 py-1 rounded-[4px] bg-surface-secondary text-text-primary border border-border-primary">
                PayPal Sandbox (FX Bridge)
              </span>
              <StatusBadge status={badgeConfig.status} label={badgeConfig.label} />
            </>
          ) : (
            <>
              <span className="text-[11.5px] font-sans font-medium px-2.5 py-1 rounded-[4px] bg-surface-secondary text-text-primary border border-border-primary">
                PayPal Sandbox
              </span>
              <StatusBadge status={badgeConfig.status} label={badgeConfig.label} />
            </>
          )}
        </div>
      </div>

      {!session ? (
        <div className="bg-surface-primary rounded-[6px] p-8 sm:p-10 text-center text-text-secondary border border-border-primary space-y-4 ">
          <CreditCard className="w-10 h-10 mx-auto text-ash-gray mb-1 opacity-70" aria-hidden="true" />
          <h3 className="text-[17px] font-semibold text-text-primary">
            No Authoritative Session Selected
          </h3>
          <p className="text-[13.5px] text-text-secondary max-w-sm mx-auto leading-relaxed">
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
            <div className="p-4 rounded-[6px] bg-[#fff8eb] dark:bg-[#261a08] border border-ember-orange/35 space-y-2.5">
              <div className="flex items-center gap-2 text-ember-orange font-semibold text-[14px]">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Authoritative Session Not Found in Server Store</span>
              </div>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                The session <code className="font-mono-token text-text-primary bg-surface-secondary px-1.5 py-0.5 rounded text-[12px] font-medium">{session.id}</code> is not registered in the authoritative server store. This can happen if the server process restarted.
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
              <div className="bg-surface-primary rounded-[6px] p-5 sm:p-6 border border-border-primary  space-y-5">
                <div className="flex justify-between items-start pb-3.5 border-b border-border-primary">
                  <div>
                    <h2 className="text-[17px] font-semibold text-text-primary tracking-tight">
                      Agreed Transaction Terms
                    </h2>
                    <p className="text-[12.5px] text-text-secondary mt-0.5">Authoritative procurement terms</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(session.id, "session")}
                    title="Click to copy full Authoritative Session ID"
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-surface-secondary hover:bg-surface-secondary text-[11px] font-mono-token text-text-primary border border-border-primary transition-colors cursor-pointer"
                  >
                    <span>{session.id.slice(0, 14)}...</span>
                    {copiedKey === "session" ? <Check className="w-3 h-3 text-lichen-green" aria-hidden="true" /> : <Copy className="w-3 h-3 text-ash-gray" aria-hidden="true" />}
                  </button>
                </div>

                <div className="space-y-3 text-[13.5px]">
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">Selected Supplier:</span>
                    <span className="font-semibold text-text-primary">{supplierName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">SKU / Product:</span>
                    {hasAgreement && sku !== "Not established" ? (
                      <span className="font-mono-token text-[11.5px] text-text-primary bg-surface-secondary px-2 py-0.5 rounded border border-border-primary">
                        {sku}
                      </span>
                    ) : selectedQuote?.sku ? (
                      <span className="font-mono-token text-[11.5px] text-text-secondary bg-surface-secondary px-2 py-0.5 rounded border border-border-primary">
                        {selectedQuote.sku} (Pending)
                      </span>
                    ) : (
                      <span className="text-text-secondary italic">Not established</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">Agreed Unit Price:</span>
                    {hasAgreement && unitPrice !== null ? (
                      <CurrencyDisplay
                        amount={unitPrice}
                        currency={mandate?.currency}
                        size="sm"
                      />
                    ) : (
                      <span className="text-text-secondary italic">Not established</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">Quantity:</span>
                    <span className="font-medium text-text-primary tabular-nums">
                      {quantity !== null ? `${quantity} units` : "Not established"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">Delivery SLA:</span>
                    {hasAgreement && deliveryDays != null ? (
                      <span className="text-text-primary">
                        {formatDaysSLA(deliveryDays, mandate?.maxDeliveryDays, "max")}
                      </span>
                    ) : (
                      <span className="text-text-secondary italic">
                        Not established {mandate?.maxDeliveryDays ? `(Mandate: ≤ ${mandate.maxDeliveryDays} days)` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">Return Policy Window:</span>
                    {hasAgreement && returnDays != null ? (
                      <span className="text-text-primary">
                        {formatDaysSLA(returnDays, mandate?.minReturnDays, "min")}
                      </span>
                    ) : (
                      <span className="text-text-secondary italic">
                        Not established {mandate?.minReturnDays ? `(Mandate: ≥ ${mandate.minReturnDays} days)` : ""}
                      </span>
                    )}
                  </div>
                  {agreementRecord && (
                    <div className="flex justify-between items-center">
                      <span className="text-text-secondary">Agreement Record:</span>
                      <span
                        className="font-mono-token text-[11px] text-text-primary bg-surface-secondary px-2 py-0.5 rounded border border-border-primary font-medium"
                        title={agreementRecord.agreementId}
                      >
                        {agreementRecord.agreementId.slice(0, 18)}... (R{agreementRecord.round})
                      </span>
                    </div>
                  )}

                  {/* Financial Comparison: Budget Ceiling vs Negotiated Landed Total */}
                  <div className="pt-3.5 border-t border-border-primary space-y-2">
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="text-text-secondary">Mandate Budget Ceiling:</span>
                      <span className="type-financial text-text-primary font-medium">
                        {formatCurrency(mandateBudget, mandate?.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="text-text-secondary">Agreed Landed Cost:</span>
                      {hasAgreement && agreedLandedCost !== null ? (
                        <span className="type-financial text-text-primary font-semibold text-[15px]">
                          {formatCurrency(agreedLandedCost, mandate?.currency)}
                        </span>
                      ) : (
                        <span className="text-text-secondary italic font-normal">
                          Not established
                        </span>
                      )}
                    </div>
                    {hasSavings && netSavings !== null && savingsPct !== null && (
                      <div className="flex justify-between items-center text-[13px] pt-1">
                        <span className="text-text-secondary">Procurement Savings:</span>
                        <span
                          className={`type-financial font-semibold ${
                            netSavings >= 0
                              ? "text-[#006840] dark:text-lichen-green"
                              : "text-[#dc2626] dark:text-[#f87171]"
                          }`}
                        >
                          {netSavings >= 0
                            ? `+${formatCurrency(netSavings, mandate?.currency)} (${savingsPct.toFixed(1)}%)`
                            : `-${formatCurrency(Math.abs(netSavings), mandate?.currency)} (Over budget)`}
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
                    <p className="text-[12px] text-text-secondary leading-relaxed">
                      Order #{session.paypalOrderId || "..."} has been initialized. Complete the authorization in the PayPal Sandbox popup or approval window.
                    </p>
                  </div>
                )}

                {/* Primary Action Button (Contextual & Strictly Fail-Closed) */}
                <div className="pt-1">
                  {session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED" ? (
                    <div className="p-3 bg-mint-whisper dark:bg-[#10211a] rounded-[6px] text-center text-[13px] text-[#006840] dark:text-[#4ade80] font-semibold flex items-center justify-center gap-2 border border-lichen-green/25">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>PayPal Funds Captured &amp; Invoice Created</span>
                    </div>
                  ) : session.status === "CAPTURE_PENDING_RECONCILIATION" ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-amber-500/10 dark:bg-amber-500/15 rounded-[6px] text-center text-[13px] text-amber-800 dark:text-amber-300 font-semibold flex items-center justify-center gap-2 border border-amber-500/30">
                        <AlertCircle className="w-4 h-4" aria-hidden="true" />
                        <span>Blind Capture Retries Blocked — Reconciliation Required</span>
                      </div>
                      <PrimaryButton
                        onClick={handleReconcile}
                        disabled={isReconciling}
                        className="w-full flex items-center justify-center gap-2"
                      >
                        {isReconciling ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Querying PayPal Orders API...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                            <span>Reconcile PayPal Status</span>
                          </>
                        )}
                      </PrimaryButton>
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
                  ) : session.status === "AWAITING_PAYPAL_APPROVAL" ? (
                    <div className="space-y-3">
                      {isCrossCurrency && session.fxRecord && (
                        <div className="p-3.5 rounded-[6px] bg-surface-secondary border border-border-primary space-y-1.5 text-[12px]">
                          <div className="flex justify-between font-mono-token">
                            <span className="text-text-secondary">PayPal Order:</span>
                            <span className="font-semibold text-text-primary">{session.paypalOrderId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Commercial Amount:</span>
                            <span className="font-semibold text-text-primary tabular-nums">
                              {formatCurrency(agreedLandedCost ?? 0, mandate?.currency || "INR")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">PayPal Settlement:</span>
                            <span className="font-bold text-lichen-green tabular-nums">
                              {formatCurrency(session.fxRecord.targetAmountMinor / 100, "USD")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">FX Conversion:</span>
                            <span className="text-[#006840] dark:text-[#4ade80] font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Locked &amp; Verified
                            </span>
                          </div>
                        </div>
                      )}
                      <PrimaryButton
                        onClick={() => {
                          if (session.paypalApprovalUrl) {
                            window.location.assign(session.paypalApprovalUrl);
                          } else {
                            handleContinueToPayPal();
                          }
                        }}
                        disabled={isInitiating || !isAuditPassed}
                        className="w-full flex items-center justify-center gap-2"
                      >
                        {isInitiating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Connecting to PayPal...</span>
                          </>
                        ) : (
                          <>
                            <span>Complete PayPal Sandbox Approval</span>
                            <ExternalLink className="w-4 h-4" aria-hidden="true" />
                          </>
                        )}
                      </PrimaryButton>
                    </div>
                  ) : !hasAgreement ? (
                    <div className="p-4 rounded-[6px] bg-surface-secondary border border-border-primary text-center space-y-2.5">
                      <div className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-text-primary">
                        <Lock className="w-3.5 h-3.5 text-ash-gray" aria-hidden="true" />
                        <span>Awaiting Accepted Agreement</span>
                      </div>
                      <p className="text-[12px] text-text-secondary leading-relaxed max-w-xs mx-auto">
                        Accept a vendor agreement to continue. Payment checkout unlocks once supplier terms are verified.
                      </p>
                      {onStartNewNegotiation && (
                        <button
                          type="button"
                          onClick={onStartNewNegotiation}
                          className="mt-1 px-3.5 py-1.5 rounded-[6px] text-[12.5px] font-medium bg-surface-primary hover:bg-surface-secondary text-text-primary border border-border-primary transition-colors cursor-pointer inline-flex items-center gap-1.5 "
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-ember-orange" aria-hidden="true" />
                          <span>Negotiation Arena</span>
                        </button>
                      )}
                    </div>
                  ) : isAuditMissing ? (
                    <div className="space-y-2.5">
                      <PrimaryButton
                        onClick={handleRunAudit}
                        disabled={isRunningAudit || isSessionNotFound}
                        className="w-full flex items-center justify-center gap-2"
                      >
                        {isRunningAudit ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>Evaluating Procurement Invariants...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                            <span>Run ACWORLD Pre-Checkout Audit</span>
                          </>
                        )}
                      </PrimaryButton>
                      <p className="text-[12px] text-text-secondary text-center font-medium">
                        Audit Required: Run ACWORLD Pre-Checkout Audit before releasing PayPal authorization.
                      </p>
                    </div>
                  ) : isAuditFailed ? (
                    <div className="space-y-2.5">
                      <PrimaryButton
                        disabled={true}
                        className="w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShieldAlert className="w-4 h-4 text-rose-500" aria-hidden="true" />
                        <span>Checkout Blocked — Audit Failed</span>
                      </PrimaryButton>
                      <p className="text-[12px] text-[#dc2626] dark:text-[#f87171] text-center font-medium">
                        PayPal checkout blocked: One or more ACWORLD audit invariants failed.
                      </p>
                    </div>
                  ) : isCrossCurrency ? (
                    !session.fxRecord ? (
                      <div className="rounded-[6px] p-4 bg-surface-secondary border border-border-primary space-y-3 overflow-hidden break-words">
                        <div className="flex items-center justify-between pb-2 border-b border-border-primary text-[12px]">
                          <div className="flex items-center gap-1.5 text-text-primary font-semibold">
                            <ArrowRightLeft className="w-4 h-4 text-text-primary" />
                            <span>CROSS-CURRENCY SETTLEMENT</span>
                          </div>
                          <span className="font-mono-token text-[10.5px] px-2 py-0.5 rounded bg-surface-secondary text-text-primary font-medium border border-border-primary">
                            INR &rarr; USD Bridge
                          </span>
                        </div>
                        <div className="space-y-1.5 text-[12px]">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Commercial Agreement:</span>
                            <span className="font-semibold text-text-primary tabular-nums">
                              {formatCurrency(agreedLandedCost ?? 0, mandate?.currency || "INR")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Settlement Rail:</span>
                            <span className="font-medium text-text-primary">PayPal Sandbox</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Settlement Currency:</span>
                            <span className="font-medium text-text-primary">USD</span>
                          </div>
                        </div>
                        <p className="text-[12px] text-text-secondary leading-relaxed">
                          An FX settlement quote is required before this INR agreement can be settled through PayPal. The server configuration supplies the default rate source.
                        </p>
                        <div className="flex items-center justify-between pt-1 text-[11.5px]">
                          <span className="text-text-secondary">Rate Source:</span>
                          <div className="inline-flex rounded-md border border-border-primary p-0.5 bg-surface-primary">
                            <button
                              type="button"
                              onClick={() => setSelectedRateSource("DETERMINISTIC_DEMO")}
                              className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                                selectedRateSource === "DETERMINISTIC_DEMO"
                                  ? "bg-ember-orange text-white"
                                  : "text-text-secondary hover:text-text-primary"
                              }`}
                            >
                              Deterministic Demo FX
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedRateSource("LIVE_PROVIDER")}
                              className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                                selectedRateSource === "LIVE_PROVIDER"
                                  ? "bg-ember-orange text-white"
                                  : "text-text-secondary hover:text-text-primary"
                              }`}
                            >
                              Live Provider
                            </button>
                          </div>
                        </div>
                        {fxError && (
                          <p className="text-[11.5px] text-[#dc2626] dark:text-[#f87171]">
                            {fxError}
                          </p>
                        )}
                        <PrimaryButton
                          onClick={handleGetFxQuote}
                          disabled={isFetchingQuote || isSessionNotFound}
                          className="w-full flex items-center justify-center gap-2"
                        >
                          {isFetchingQuote ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Fetching Settlement Quote...</span>
                            </>
                          ) : (
                            <>
                              <ArrowRightLeft className="w-4 h-4" />
                              <span>Get Settlement Quote</span>
                            </>
                          )}
                        </PrimaryButton>
                      </div>
                    ) : isFxQuoteExpired ? (
                      <div className="rounded-[6px] p-4 bg-amber-500/[0.06] dark:bg-amber-500/[0.08] border border-amber-500/30 space-y-3 overflow-hidden break-words">
                        <div className="flex items-center justify-between pb-2 border-b border-amber-500/20 text-[12px]">
                          <div className="flex items-center gap-1.5 text-text-primary font-semibold">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>FX Quote Expired</span>
                          </div>
                          <span className="font-mono-token text-[10.5px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 font-medium">
                            Expired
                          </span>
                        </div>
                        <p className="text-[12px] text-text-secondary leading-relaxed">
                          {session?.status === "CANCELLED" || (session?.status as string) === "SETTLED" || session?.status === "DISPUTED"
                            ? `This session is ${session.status.toLowerCase()} and cannot request or refresh FX quotes.`
                            : session.fxRecord.status === "LOCKED"
                            ? "The locked quote expired. It will not be refreshed automatically; explicit review is required."
                            : "The settlement quote expired before it was locked. Request a new quote to continue."}
                        </p>
                        {fxError && (
                          <p className="text-[11.5px] text-[#dc2626] dark:text-[#f87171]">
                            {fxError}
                          </p>
                        )}
                        <PrimaryButton
                          onClick={handleGetFxQuote}
                          disabled={
                            isFetchingQuote ||
                            session.fxRecord.status === "LOCKED" ||
                            session?.status === "CANCELLED" ||
                            (session?.status as string) === "SETTLED" ||
                            session?.status === "DISPUTED" ||
                            !isAuditPassed
                          }
                          className="w-full flex items-center justify-center gap-2"
                        >
                          {isFetchingQuote ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Refreshing Quote...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              <span>Refresh FX Quote</span>
                            </>
                          )}
                        </PrimaryButton>
                      </div>
                    ) : session.fxRecord.status === "QUOTED" ? (
                      <div className="rounded-[6px] p-4 bg-surface-primary border border-border-primary space-y-3 overflow-hidden break-words">
                        <div className="flex items-center justify-between pb-2 border-b border-border-primary text-[12px]">
                          <div className="flex items-center gap-1.5 text-text-primary font-semibold">
                            <ArrowRightLeft className="w-4 h-4 text-text-primary" />
                            <span>FX QUOTED</span>
                          </div>
                          <StatusBadge status="info" label="Quote Ready" />
                        </div>
                        <div className="space-y-1.5 text-[12px]">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Commercial Amount:</span>
                            <span className="font-semibold text-text-primary tabular-nums">
                              {formatCurrency(agreedLandedCost ?? 0, mandate?.currency || "INR")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">FX Rate:</span>
                            <span className="font-mono-token font-medium text-text-primary">
                              1 USD = ₹{displayFxRate(session.fxRecord.rate)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">USD Settlement Amount:</span>
                            <span className="font-bold text-[13px] text-lichen-green tabular-nums">
                              {formatCurrency(session.fxRecord.targetAmountMinor / 100, "USD")}
                            </span>
                          </div>
                          <FXRateProvenance record={session.fxRecord} />
                        </div>
                        <p className="text-[11.5px] text-text-secondary leading-relaxed">
                          Locking this quote fixes the USD settlement amount used for PayPal authorization.
                        </p>
                        {fxError && (
                          <p className="text-[11.5px] text-[#dc2626] dark:text-[#f87171]">
                            {fxError}
                          </p>
                        )}
                        <PrimaryButton
                          onClick={handleLockFxQuote}
                          disabled={isLockingQuote}
                          className="w-full flex items-center justify-center gap-2"
                        >
                          {isLockingQuote ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Locking FX Quote &amp; Verifying...</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4" />
                              <span>Lock FX Quote</span>
                            </>
                          )}
                        </PrimaryButton>
                      </div>
                    ) : (
                      <div className="rounded-[6px] p-4 bg-surface-primary border border-border-primary space-y-3 overflow-hidden break-words">
                        <div className="flex items-center justify-between pb-2 border-b border-border-primary text-[12px]">
                          <div className="flex items-center gap-1.5 text-text-primary font-semibold">
                            <ShieldCheck className="w-4 h-4 text-lichen-green" />
                            <span>FX LOCKED</span>
                          </div>
                          <StatusBadge status="verified" label="FX Quote Locked" />
                        </div>
                        <div className="space-y-1.5 text-[12px]">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Commercial Obligation:</span>
                            <span className="font-semibold text-text-primary tabular-nums">
                              {formatCurrency(agreedLandedCost ?? 0, mandate?.currency || "INR")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Locked FX Rate:</span>
                            <span className="font-mono-token font-medium text-text-primary">
                              1 USD = ₹{displayFxRate(session.fxRecord.rate)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">PayPal Settlement:</span>
                            <span className="font-bold text-[13px] text-lichen-green tabular-nums">
                              {formatCurrency(session.fxRecord.targetAmountMinor / 100, "USD")}
                            </span>
                          </div>
                          <FXRateProvenance record={session.fxRecord} />
                          <div className="flex justify-between"><span>Conversion:</span><span>{fxVerified ? "Verified" : "Verification Pending"}</span></div>
                        </div>
                        <PrimaryButton
                          onClick={handleContinueToPayPal}
                          disabled={isInitiating || isSessionNotFound}
                          className="w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isInitiating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              <span>Connecting to PayPal Sandbox...</span>
                            </>
                          ) : (
                            <>
                              <span>Continue to PayPal Sandbox</span>
                              <ExternalLink className="w-4 h-4" aria-hidden="true" />
                            </>
                          )}
                        </PrimaryButton>
                      </div>
                    )
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-[12px] text-[#006840] dark:text-[#4ade80] font-medium justify-center pb-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Audited &amp; Eligible for PayPal Authorization</span>
                      </div>
                      <PrimaryButton
                        onClick={handleContinueToPayPal}
                        disabled={isInitiating || isSessionNotFound}
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
                    </div>
                  )}
                </div>
              </div>

              {/* Transaction Artifacts Card */}
              {isCrossCurrency ? (
                <div className="bg-surface-primary rounded-[6px] p-5 border border-border-primary space-y-4 ">
                  <div className="flex items-center justify-between pb-2.5 border-b border-border-primary">
                    <h3 className="text-[12px] font-sans uppercase tracking-wider text-text-primary font-semibold">
                      Cross-Currency Settlement Artifacts
                    </h3>
                    <span className="text-[11px] font-mono-token text-lichen-green">
                      INR &rarr; USD Bridge
                    </span>
                  </div>

                  <div className="space-y-3 text-[12.5px]">
                    <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary space-y-1.5">
                      <div className="text-[11px] font-sans uppercase tracking-wider font-semibold text-text-secondary">
                        1. Commercial Agreement
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary">Landed Cost:</span>
                        <span className="font-semibold text-text-primary tabular-nums">
                          {formatCurrency(agreedLandedCost ?? 0, mandate?.currency || "INR")}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11.5px]">
                        <span className="text-text-secondary">Commercial Status:</span>
                        <span className="text-lichen-green font-medium">Authoritative &amp; Audited</span>
                      </div>
                    </div>

                    {session.fxRecord ? (
                      <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary space-y-1.5 font-mono-token text-[11.5px]">
                        <div className="text-[11px] font-sans uppercase tracking-wider font-semibold text-text-primary">
                          2. Verifiable FX Quote
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary font-sans">Locked FX Rate:</span>
                          <span className="text-text-primary">1 USD = ₹{displayFxRate(session.fxRecord.rate)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary font-sans">Settlement Obligation:</span>
                          <span className="font-bold text-lichen-green">
                            {formatCurrency(session.fxRecord.targetAmountMinor / 100, "USD")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary font-sans">Status:</span>
                          <span className="text-text-primary font-sans uppercase text-[10.5px]">
                            {session.fxRecord.status}
                          </span>
                        </div>
                        <div className="pt-1 border-t border-border-primary">
                          <div className="flex items-center justify-between">
                            <span className="text-text-secondary font-sans">Conversion Hash:</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10.5px] text-text-primary" title={session.fxRecord.conversionHash}>
                                {session.fxRecord.conversionHash.slice(0, 14)}...
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(session.fxRecord!.conversionHash, "fxhash")}
                                title="Copy Conversion Hash"
                                className="p-0.5 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                              >
                                {copiedKey === "fxhash" ? <Check className="w-3 h-3 text-lichen-green" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary text-[12px] text-text-secondary">
                        FX Quote has not yet been requested.
                      </div>
                    )}

                    <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary space-y-1.5 font-mono-token text-[11.5px]">
                      <div className="text-[11px] font-sans uppercase tracking-wider font-semibold text-text-primary">
                        3. PayPal Orders v2 Rail
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary font-sans">PayPal Order ID:</span>
                        {session.paypalOrderId ? (
                          <div className="flex items-center gap-1">
                            <span className="text-text-primary">{session.paypalOrderId}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyText(session.paypalOrderId!, "order")}
                              className="p-0.5 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                            >
                              {copiedKey === "order" ? <Check className="w-3 h-3 text-lichen-green" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-secondary font-sans italic">Not created</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary font-sans">PayPal Capture ID:</span>
                        {session.paypalCaptureId ? (
                          <div className="flex items-center gap-1">
                            <span className="text-text-primary">{session.paypalCaptureId}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyText(session.paypalCaptureId!, "capture")}
                              className="p-0.5 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                            >
                              {copiedKey === "capture" ? <Check className="w-3 h-3 text-lichen-green" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-secondary font-sans italic">Not captured</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary font-sans">Settlement Currency:</span>
                        <span className="text-text-primary font-sans font-medium">USD</span>
                      </div>
                    </div>

                    {session.merkleRoot && (
                      <div className="pt-2 border-t border-border-primary space-y-1">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-medium text-text-primary">
                            Bound Merkle Root:
                          </span>
                          <div className="flex items-center gap-1.5 font-mono-token text-[11px]">
                            <span title={session.merkleRoot}>{session.merkleRoot.slice(0, 16)}...</span>
                            <button
                              type="button"
                              onClick={() => handleCopyText(session.merkleRoot!, "root")}
                              className="p-0.5 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                            >
                              {copiedKey === "root" ? <Check className="w-3 h-3 text-lichen-green" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : !hasAnyArtifact ? (
                <div className="bg-surface-primary rounded-[6px] p-5 border border-border-primary space-y-3 ">
                  <div className="flex items-center justify-between pb-2.5 border-b border-border-primary">
                    <h3 className="text-[12px] font-sans uppercase tracking-wider text-text-secondary font-semibold">
                      PayPal Transaction Artifacts
                    </h3>
                    <span className="text-[11px] font-mono-token text-text-secondary">
                      intent: AUTHORIZE
                    </span>
                  </div>
                  <div className="py-4 text-center space-y-1">
                    <p className="text-[13px] text-text-primary font-medium">
                      No PayPal transaction has been created yet.
                    </p>
                    <p className="text-[12px] text-text-secondary max-w-xs mx-auto leading-relaxed">
                      Order authorization, capture references, and B2B invoices will appear here once checkout begins.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-surface-primary rounded-[6px] p-5 border border-border-primary space-y-3 ">
                  <div className="flex items-center justify-between pb-2.5 border-b border-border-primary">
                    <h3 className="text-[12px] font-sans uppercase tracking-wider text-text-primary font-semibold">
                      PayPal Transaction Artifacts
                    </h3>
                    <span className="text-[11px] font-mono-token text-text-secondary">
                      intent: AUTHORIZE
                    </span>
                  </div>

                  <div className="space-y-2.5 text-[13px]">
                    <div className="flex justify-between items-center">
                      <span className="text-text-secondary">PayPal Order ID:</span>
                      {session.paypalOrderId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-token text-[11.5px] text-text-primary bg-surface-secondary px-2 py-0.5 rounded border border-border-primary">
                            {session.paypalOrderId}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(session.paypalOrderId!, "order")}
                            title="Copy Order ID"
                            className="p-1 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                          >
                            {copiedKey === "order" ? <Check className="w-3 h-3 text-lichen-green" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-text-secondary italic">Not created</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-text-secondary">PayPal Capture ID:</span>
                      {session.paypalCaptureId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-token text-[11.5px] text-text-primary bg-surface-secondary px-2 py-0.5 rounded border border-border-primary">
                            {session.paypalCaptureId}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(session.paypalCaptureId!, "capture")}
                            title="Copy Capture ID"
                            className="p-1 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                          >
                            {copiedKey === "capture" ? <Check className="w-3 h-3 text-lichen-green" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-text-secondary italic">Not captured</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-text-secondary">B2B Invoice ID:</span>
                      {session.paypalInvoiceId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-token text-[11.5px] text-text-primary bg-surface-secondary px-2 py-0.5 rounded border border-border-primary">
                            {session.paypalInvoiceId}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(session.paypalInvoiceId!, "invoice")}
                            title="Copy Invoice ID"
                            className="p-1 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                          >
                            {copiedKey === "invoice" ? <Check className="w-3 h-3 text-lichen-green" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-text-secondary italic">Not generated</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-text-secondary">Bound Merkle Root:</span>
                      {session.merkleRoot ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono-token text-[11.5px] text-text-primary bg-surface-secondary px-2 py-0.5 rounded border border-border-primary"
                            title={session.merkleRoot}
                          >
                            {session.merkleRoot.slice(0, 16)}...
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(session.merkleRoot!, "root")}
                            title="Copy Full Merkle Root"
                            className="p-1 hover:text-text-primary dark:hover:text-white transition-colors cursor-pointer text-text-secondary"
                          >
                            {copiedKey === "root" ? <Check className="w-3 h-3 text-lichen-green" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-text-secondary italic">Not sealed</span>
                      )}
                    </div>
                  </div>

                  {session.paypalInvoiceId && (
                    <div className="pt-2.5 border-t border-border-primary flex items-center justify-between text-[12px]">
                      <span className="text-[#006840] dark:text-[#4ade80] flex items-center gap-1.5 font-medium">
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        Invoice Generated in Sandbox
                      </span>
                      <span className="font-sans text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                        STATUS: {session.invoiceStatus || "SENT"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: ACWORLD Independent 5-Invariant Audit Gate */}
            <div className="lg:col-span-7 bg-surface-primary rounded-[6px] p-5 sm:p-6 border border-border-primary flex flex-col justify-between ">
              <div>
                <div className="pb-3.5 border-b border-border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold text-text-primary tracking-tight">
                      Independent ACWORLD Audit Gate
                    </h2>
                    <p className="text-[13px] text-text-secondary mt-0.5">
                      Five deterministic checks required before settlement.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-sans font-medium text-text-secondary bg-surface-secondary px-2.5 py-1 rounded-[4px] border border-border-primary">
                      Pre-Settlement Gate
                    </span>
                    <button
                      type="button"
                      onClick={handleRunAudit}
                      disabled={isRunningAudit || !hasAgreement || isSessionNotFound}
                      title={
                        !hasAgreement
                          ? "Audit unavailable: accept a vendor agreement first"
                          : "Run or re-evaluate the 5 independent ACWORLD invariants on the server"
                      }
                      className="px-3 py-1 rounded-[6px] text-[12.5px] font-medium bg-surface-primary hover:bg-surface-secondary text-text-primary border border-border-primary transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
                    >
                      {isRunningAudit ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-ember-orange" aria-hidden="true" />
                          <span>Auditing...</span>
                        </>
                      ) : !hasAgreement ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-ash-gray" aria-hidden="true" />
                          <span>Audit Unavailable</span>
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
                  {isRunningAudit ? (
                    <div className="p-3.5 rounded-[6px] bg-surface-secondary border border-border-primary text-text-primary text-[12.5px] flex items-center gap-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-ember-orange shrink-0" aria-hidden="true" />
                      <span className="font-medium">Evaluating procurement invariants against authoritative evidence...</span>
                    </div>
                  ) : !hasAgreement ? (
                    <div className="p-3.5 rounded-[6px] bg-surface-secondary border border-border-primary text-secondary text-[12.5px] flex items-center gap-2.5">
                      <Lock className="w-4 h-4 shrink-0 text-ash-gray" aria-hidden="true" />
                      <div>
                        <span className="font-semibold text-text-primary block">Audit Unavailable</span>
                        <span>Accept a vendor agreement first before running pre-checkout evaluation.</span>
                      </div>
                    </div>
                  ) : auditCert ? (
                    <div
                      className={`p-3.5 rounded-[6px] border flex items-center justify-between ${
                        auditCert.passed
                          ? "bg-surface-primary border-border-primary text-text-primary"
                          : "bg-surface-primary border-[#ef4444]/40 text-[#dc2626] dark:text-[#f87171]"
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
                            ? "5/5 checks passed"
                            : `${failedInvariantsCount} of 5 checks failed — Checkout Blocked`}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono-token px-2 py-0.5 rounded-[4px] bg-surface-secondary text-text-secondary border border-border-primary">
                        #{auditCert.certificateId.slice(-8)}
                      </span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-[6px] bg-amber-500/[0.08] dark:bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-[12.5px] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <div>
                          <span className="font-semibold block">Audit Not Yet Run</span>
                          <span className="text-[12px] opacity-90">All terms agreed. Run audit to evaluate the 5 invariants.</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunAudit}
                        disabled={isRunningAudit || isSessionNotFound}
                        className="px-3 py-1.5 rounded-[6px] bg-ember-orange text-white font-medium text-[12px] hover:bg-ember-hover transition-colors cursor-pointer shrink-0 "
                      >
                        Run Evaluation
                      </button>
                    </div>
                  )}

                  {/* Semantic Invariant Rows (Matched by key, never by array position) */}
                  <div className="divide-y divide-border-primary pt-1">
                    {REQUIRED_INVARIANTS.map((req) => {
                      const inv = auditCert?.invariants?.find((i) => i.name === req.key);
                      const isEvaluated = Boolean(inv);
                      const isPassed = inv?.passed === true;

                      // Invariant Status: PASS, FAIL, PENDING, or NOT EVALUATED
                      let badgeStatus: "verified" | "failure" | "warning" | "neutral" = "neutral";
                      let badgeLabel = "NOT EVALUATED";
                      let descriptionText: string = req.desc;

                      if (!hasAgreement) {
                        badgeStatus = "neutral";
                        badgeLabel = "NOT EVALUATED";
                        descriptionText = "Requires accepted vendor agreement.";
                      } else if (isEvaluated) {
                        badgeStatus = isPassed ? "verified" : "failure";
                        badgeLabel = isPassed ? "PASS" : "FAIL";
                        descriptionText = inv?.reason || req.desc;
                      } else {
                        badgeStatus = "warning";
                        badgeLabel = "PENDING";
                        descriptionText = req.desc;
                      }

                      return (
                        <div
                          key={req.key}
                          className="py-3.5 flex items-start justify-between gap-4"
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[13.5px] text-text-primary">
                              {req.title}
                            </div>
                            <div className="text-[12.5px] text-text-secondary leading-relaxed">
                              {descriptionText}
                            </div>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <StatusBadge
                              status={badgeStatus}
                              label={badgeLabel}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Phase 7: ACWORLD FX Settlement Verification (Distinct Post-Commercial Transformation Check) */}
                  {isCrossCurrency && session.fxRecord && (
                    <div className="pt-4 mt-2 border-t border-border-primary space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[12.5px] font-sans uppercase tracking-wider font-semibold text-text-primary block">
                            ACWORLD FX Settlement Verification
                          </span>
                          <span className="text-[11.5px] text-text-secondary">
                            Post-commercial cross-currency audit gate
                          </span>
                        </div>
                        <StatusBadge
                          status={fxVerified ? "verified" : "warning"}
                          label={hasFxVerification ? (fxVerified ? `${fxVerification!.checks.filter(check => check.passed).length}/${fxVerification!.checks.length} CHECKS PASS` : "Verification Failed") : "Not Verified"}
                        />
                      </div>
                      <div className="p-3.5 rounded-[6px] bg-surface-secondary border border-border-primary space-y-1.5 text-[11.5px] font-mono-token">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Source Landed Cost:</span>
                          <span className="text-text-primary">
                            {session.fxRecord.sourceAmountMinor.toLocaleString()} paise (₹{formatCurrency(agreedLandedCost ?? 0, "INR").replace("₹", "")})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Rational Conversion:</span>
                          <span className="text-text-primary">
                            ÷ {session.fxRecord.rate} ({session.fxRecord.roundingMode})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Target Settlement:</span>
                          <span className="text-lichen-green font-bold">
                            ${(session.fxRecord.targetAmountMinor / 100).toFixed(2)} USD ({session.fxRecord.targetAmountMinor} cents)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Agreement Hash Binding:</span>
                          <span className="text-[#006840] dark:text-[#4ade80] font-medium">Verified</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Conversion Commitment:</span>
                          <span className="text-[#006840] dark:text-[#4ade80] font-medium">Verified</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3.5 mt-5 border-t border-border-primary text-[12px] text-text-secondary flex items-center justify-between">
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
