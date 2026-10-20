"use client";

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
} from "lucide-react";
import type { ProcurementSession, AuditCertificate } from "@/types/pactum";

interface SettlementCenterScreenProps {
  session?: ProcurementSession;
  onRefreshSession?: () => void;
}

export function SettlementCenterScreen({
  session,
  onRefreshSession,
}: SettlementCenterScreenProps) {
  const [isSettling, setIsSettling] = useState(false);
  const [settlementResult, setSettlementResult] = useState<{
    success: boolean;
    orderId?: string;
    captureId?: string;
    invoiceId?: string;
    error?: string;
    blockedAtGate?: boolean;
    auditCertificate?: AuditCertificate;
  } | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const selectedQuote = session?.selectedQuote;
  const finalOffer = session?.finalOffer;
  const mandate = session?.mandate;

  const totalAmount = finalOffer
    ? finalOffer.unitPrice * finalOffer.quantity + finalOffer.shippingCost
    : 0;

  const handleExecuteSettlement = async () => {
    if (!session?.id) return;
    setIsSettling(true);
    setConfirmModalOpen(false);

    try {
      const res = await fetch("/api/paypal/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, createInvoice: true }),
      });

      const data = await res.json();
      setSettlementResult(data);
      if (onRefreshSession) onRefreshSession();
    } catch (err: unknown) {
      setSettlementResult({
        success: false,
        error: err instanceof Error ? err.message : "Settlement request failed.",
      });
    } finally {
      setIsSettling(false);
    }
  };

  const auditCert = settlementResult?.auditCertificate ?? session?.auditCertificate;

  return (
    <div className="space-y-12 animate-in fade-in duration-300">
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
          <StatusBadge
            status={session?.status === "SETTLED" ? "verified" : "info"}
            label={session?.status.replace(/_/g, " ") || "Awaiting Settlement"}
          />
        </div>
      </div>

      {!session ? (
        <div className="bg-[#f6f3ee] rounded-[24px] p-12 text-center text-[#888888] border border-[#e5e5e5]">
          <CreditCard className="w-10 h-10 mx-auto text-[#aa8855] mb-3 opacity-70" />
          <h3 className="text-[20px] font-medium text-[#000000] mb-1">No Active Session Selected</h3>
          <p className="text-[14px] text-[#888888] max-w-sm mx-auto leading-relaxed">
            Please run a procurement negotiation in the Negotiation Arena to select a winning vendor offer before proceeding to settlement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Transaction Breakdown & Settlement Action */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#ffffff] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] space-y-5">
              <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px] pb-4 border-b border-[#e5e5e5]">
                Agreed Transaction Terms
              </h2>

              <div className="space-y-4 text-[15px]">
                <div className="flex justify-between items-center">
                  <span className="text-[#888888]">Selected Supplier:</span>
                  <span className="font-medium text-[#000000]">{selectedQuote?.vendorName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#888888]">SKU / Product:</span>
                  <span className="font-mono-token text-[12px] text-[#5c2999] bg-[#f6f1fe] px-2 py-0.5 rounded">
                    {selectedQuote?.sku}
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
                  <span className="text-[#000000]">{finalOffer?.deliveryDays} Days</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#888888]">Return Policy Window:</span>
                  <span className="text-[#000000]">{finalOffer?.returnDays} Days</span>
                </div>

                <div className="pt-5 border-t border-[#e5e5e5] flex justify-between items-baseline">
                  <span className="font-medium text-[16px] text-[#000000]">Total Landed Amount:</span>
                  <CurrencyDisplay
                    amount={totalAmount}
                    currency={mandate?.currency}
                    size="lg"
                    className="text-[#ff6600]"
                  />
                </div>
              </div>

              {/* Settlement Gate Action */}
              <div className="pt-4">
                {session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED" ? (
                  <div className="p-4 bg-[#ebfef6] rounded-[24px] text-center text-[14px] text-[#00cc88] font-medium flex items-center justify-center gap-2 border border-[#00cc88]/30">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>PayPal Funds Captured &amp; Invoice Created</span>
                  </div>
                ) : (
                  <PrimaryButton
                    onClick={() => setConfirmModalOpen(true)}
                    disabled={isSettling}
                    className="w-full"
                  >
                    {isSettling ? "Auditing Invariants & Capturing..." : "Run ACWORLD Audit & Settle"}
                  </PrimaryButton>
                )}
              </div>
            </div>

            {/* PayPal Identifiers Card */}
            <div className="bg-[#f6f3ee] rounded-[24px] p-8 border border-[#e5e5e5] space-y-4">
              <h3 className="text-[14px] font-medium uppercase tracking-[-0.28px] text-[#5c2999] pb-3 border-b border-[#e5e5e5]">
                PayPal Transaction Artifacts
              </h3>
              <div className="space-y-3 text-[14px]">
                <div className="flex justify-between items-center">
                  <span className="text-[#888888]">Orders v2 Order ID:</span>
                  <span className="font-mono-token text-[#000000]">
                    {session.paypalOrderId || settlementResult?.orderId || "Pending Authorization"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#888888]">Captured Payment ID:</span>
                  <span className="font-mono-token text-[#00cc88]">
                    {session.paypalCaptureId || settlementResult?.captureId || "Awaiting Audit Gate"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#888888]">B2B Invoice ID:</span>
                  <span className="font-mono-token text-[#5c2999]">
                    {session.paypalInvoiceId || settlementResult?.invoiceId || "Draft Generation Pending"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Independent ACWORLD 5-Invariant Audit Gate */}
          <div className="lg:col-span-7 bg-[#f6f3ee] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] flex flex-col justify-between">
            <div>
              <div className="pb-4 border-b border-[#e5e5e5] flex items-center justify-between">
                <div>
                  <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
                    Independent ACWORLD Audit Gate
                  </h2>
                  <p className="text-[14px] text-[#888888] mt-0.5">
                    Server-side verification strictly required prior to releasing PayPal capture
                  </p>
                </div>
                <span className="text-[12px] font-medium text-[#00cc88] bg-[#ebfef6] px-3.5 py-1.5 rounded-[24px] border border-[#00cc88]/30">
                  Zero-Trust Gate
                </span>
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
                            : "FAIL-CLOSED: AUDIT GATE BLOCKED CAPTURE"}
                        </span>
                      </div>
                      <span className="text-[12px] font-mono-token px-3 py-1 rounded-[6px] bg-[#ffffff] text-[#000000] border border-[#e5e5e5]">
                        #{auditCert.certificateId.slice(-8)}
                      </span>
                    </div>

                    {/* Invariant Rows (White cards inside Warm Cream) */}
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

            <div className="pt-4 mt-8 border-t border-[#e5e5e5] text-[13px] text-[#888888] flex items-center justify-between">
              <span>Auditor Policy: Fail-Closed Protection</span>
              <span className="text-[#00cc88] font-medium">Zero-Trust Settlement Gate</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#000000]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#ffffff] rounded-[24px] max-w-md w-full p-8 space-y-6 shadow-[0px_16px_32px_0px_rgba(0,0,0,0.25)] border border-[#e5e5e5] animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-[#ff6600]">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-[20px] font-medium text-[#000000]">Confirm PayPal Settlement</h3>
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
              <PrimaryButton onClick={handleExecuteSettlement}>
                Authorize &amp; Capture
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
