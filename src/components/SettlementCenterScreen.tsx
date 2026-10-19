"use client";

import React, { useState } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Lock,
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
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="border-b border-[#203149] pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F1F5F9]">Settlement Center</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Zero-trust ACWORLD audit verification and cryptographically bound PayPal Orders v2 capture.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30">
            PAYPAL SANDBOX
          </span>
          <StatusBadge
            status={session?.status === "SETTLED" ? "verified" : "info"}
            label={session?.status || "AWAITING SETTLEMENT"}
            size="md"
          />
        </div>
      </div>

      {!session ? (
        <div className="bg-[#0B1728] border border-dashed border-[#203149] rounded-xl p-12 text-center text-[#94A3B8]">
          <CreditCard className="w-10 h-10 mx-auto text-[#64748B] mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-[#F1F5F9] mb-1">No Active Session Available</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Please run a procurement negotiation in the Negotiation Arena to select a winning vendor offer before proceeding to settlement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Transaction Breakdown & Settlement Action */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8] pb-3 border-b border-[#203149]">
                Final Agreed Terms
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Selected Vendor:</span>
                  <span className="font-semibold text-[#F1F5F9]">{selectedQuote?.vendorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Product SKU:</span>
                  <span className="font-mono text-xs text-[#4597FF]">{selectedQuote?.sku}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Agreed Unit Price:</span>
                  <CurrencyDisplay
                    amount={finalOffer?.unitPrice || 0}
                    currency={mandate?.currency}
                    size="sm"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Quantity:</span>
                  <span className="font-mono text-[#F1F5F9]">{finalOffer?.quantity || 0} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Shipping SLA:</span>
                  <span className="text-[#F1F5F9]">
                    {finalOffer?.deliveryDays} Days (
                    <CurrencyDisplay
                      amount={finalOffer?.shippingCost || 0}
                      currency={mandate?.currency}
                      size="sm"
                    />
                    )
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94A3B8]">Return Window:</span>
                  <span className="text-[#F1F5F9]">{finalOffer?.returnDays} Days</span>
                </div>

                <div className="pt-3 border-t border-[#203149] flex justify-between items-baseline">
                  <span className="font-semibold text-[#F1F5F9]">Total Landed Amount:</span>
                  <CurrencyDisplay
                    amount={totalAmount}
                    currency={mandate?.currency}
                    size="lg"
                    className="text-[#4597FF]"
                  />
                </div>
              </div>

              {/* Settlement Gate Button */}
              <div className="pt-4">
                {session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED" ? (
                  <div className="p-3 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-center text-xs text-[#22C55E] font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Order Cryptographically Captured &amp; Settled</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmModalOpen(true)}
                    disabled={isSettling}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#0070E0] to-[#4597FF] hover:from-[#005bb5] hover:to-[#3b82f6] text-white font-semibold text-sm transition-all shadow-lg shadow-[#0070E0]/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{isSettling ? "Auditing & Capturing..." : "Run ACWORLD Audit & Settle"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* PayPal Identifiers & Invoicing Status */}
            <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-6 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8] pb-2 border-b border-[#203149]">
                PayPal Transaction Artifacts
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Orders v2 ID:</span>
                  <span className="font-mono text-[#F1F5F9]">
                    {session.paypalOrderId || settlementResult?.orderId || "Pending Authorization"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">Capture ID:</span>
                  <span className="font-mono text-[#22C55E]">
                    {session.paypalCaptureId || settlementResult?.captureId || "Awaiting Audit Gate"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B]">B2B Invoice ID:</span>
                  <span className="font-mono text-[#4597FF]">
                    {session.paypalInvoiceId || settlementResult?.invoiceId || "Draft Generation Pending"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: ACWORLD 5-Invariant Verification Panel */}
          <div className="lg:col-span-7 bg-[#0B1728] border border-[#203149] rounded-xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-6 py-4 border-b border-[#203149] flex items-center justify-between bg-[#101F33]/40">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
                    ACWORLD Independent Audit Gate
                  </h2>
                </div>
                <span className="text-xs font-mono text-[#64748B]">Fail-Closed Policy</span>
              </div>

              <div className="p-6 space-y-4">
                {auditCert ? (
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-xl border flex items-center justify-between ${
                        auditCert.passed
                          ? "bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]"
                          : "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        {auditCert.passed ? (
                          <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                        ) : (
                          <ShieldAlert className="w-5 h-5 text-[#EF4444]" />
                        )}
                        <span>
                          {auditCert.passed
                            ? "ALL 5 INVARIANTS CRYPTOGRAPHICALLY VERIFIED"
                            : "FAIL-CLOSED: AUDIT GATE BLOCKED CAPTURE"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#030B18]">
                        Cert #{auditCert.certificateId.slice(-8)}
                      </span>
                    </div>

                    {/* Invariant Rows */}
                    <div className="space-y-2 pt-2">
                      {auditCert.invariants.map((inv, idx) => (
                        <div
                          key={idx}
                          className="bg-[#101F33]/60 border border-[#203149] rounded-lg p-3 text-xs flex items-start justify-between gap-4"
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[#F1F5F9] flex items-center gap-2">
                              <span>
                                {idx + 1}. {inv.name.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#94A3B8]">
                              {inv.reason || "Strict compliance verified against locked mandate."}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold shrink-0 ${
                              inv.passed
                                ? "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30"
                                : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30"
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
                    <p className="text-xs text-[#94A3B8]">
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
                        className="bg-[#101F33]/40 border border-[#203149] rounded-lg p-3 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-[#F1F5F9]">{item.name}</div>
                          <div className="text-[11px] text-[#64748B]">{item.desc}</div>
                        </div>
                        <span className="text-[10px] font-mono text-[#64748B] bg-[#203149] px-2 py-0.5 rounded">
                          PENDING AUDIT
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-[#030B18]/60 border-t border-[#203149] text-xs text-[#64748B] flex items-center justify-between">
              <span>Auditor Module: src/lib/acworld-auditor.ts</span>
              <span className="font-mono text-[#22C55E]">Zero-Trust Authorization</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#030B18]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B1728] border border-[#203149] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-[#F59E0B]">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-bold text-[#F1F5F9]">Confirm PayPal Settlement</h3>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              You are about to invoke the server-side audited PayPal capture gate for{" "}
              <strong className="text-[#F1F5F9]">{session?.id}</strong>. ACWORLD will independently inspect all five mathematical and cryptographic invariants. If any invariant fails, funds will <strong className="text-[#EF4444]">NOT</strong> be released.
            </p>
            <div className="bg-[#030B18] p-3 rounded-lg border border-[#203149] text-xs space-y-1">
              <div className="flex justify-between text-[#94A3B8]">
                <span>Total Capture:</span>
                <span className="font-semibold text-[#F1F5F9]">
                  ${totalAmount.toLocaleString()} {mandate?.currency}
                </span>
              </div>
              <div className="flex justify-between text-[#94A3B8]">
                <span>Vendor:</span>
                <span className="text-[#F1F5F9]">{selectedQuote?.vendorName}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#101F33] hover:bg-[#203149] text-xs font-semibold text-[#94A3B8]"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSettlement}
                className="px-4 py-2 rounded-lg bg-[#0070E0] hover:bg-[#005bb5] text-white text-xs font-semibold shadow-md shadow-[#0070E0]/30"
              >
                Authorize &amp; Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
