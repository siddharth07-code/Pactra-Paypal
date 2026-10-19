"use client";

import React, { useState } from "react";
import {
  CurrencyDisplay,
  StatusBadge,
} from "./SharedUI";
import {
  ShieldAlert,
  CreditCard,
  CheckCircle2,
  Lock,
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
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F3F6FC]">Settlement center</h1>
          <p className="text-sm text-[#9AAAC0] mt-1.5">
            Zero-trust ACWORLD audit verification and cryptographically bound PayPal Orders v2 settlement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
            PayPal Sandbox
          </span>
          <StatusBadge
            status={session?.status === "SETTLED" ? "verified" : "info"}
            label={session?.status.replace(/_/g, " ") || "Awaiting Settlement"}
          />
        </div>
      </div>

      {!session ? (
        <div className="bg-[#0D1B2B] rounded-2xl p-12 text-center text-[#9AAAC0] card-shadow border border-[#23354B]/60">
          <CreditCard className="w-10 h-10 mx-auto text-[#64758E] mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-[#F3F6FC] mb-1">No Active Session Selected</h3>
          <p className="text-sm text-[#9AAAC0] max-w-sm mx-auto leading-relaxed">
            Please run a procurement negotiation in the Negotiation Arena to select a winning vendor offer before proceeding to settlement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Transaction Breakdown & Settlement Action */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 space-y-5">
              <h2 className="text-base font-bold text-[#F3F6FC] pb-3 border-b border-[#23354B]/40">
                Selected purchase terms
              </h2>

              <div className="space-y-3.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Selected Supplier:</span>
                  <span className="font-semibold text-[#F3F6FC]">{selectedQuote?.vendorName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">SKU / Product:</span>
                  <span className="font-mono-token text-xs text-[#5B9CFF]">{selectedQuote?.sku}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Agreed Unit Price:</span>
                  <CurrencyDisplay
                    amount={finalOffer?.unitPrice || 0}
                    currency={mandate?.currency}
                    size="sm"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Quantity:</span>
                  <span className="font-semibold text-[#F3F6FC]">{finalOffer?.quantity || 0} units</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Delivery SLA:</span>
                  <span className="text-[#F3F6FC]">{finalOffer?.deliveryDays} Days</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Return Policy Window:</span>
                  <span className="text-[#F3F6FC]">{finalOffer?.returnDays} Days</span>
                </div>

                <div className="pt-4 border-t border-[#23354B]/40 flex justify-between items-baseline">
                  <span className="font-bold text-base text-[#F3F6FC]">Total Landed Amount:</span>
                  <CurrencyDisplay
                    amount={totalAmount}
                    currency={mandate?.currency}
                    size="lg"
                    className="text-[#5B9CFF]"
                  />
                </div>
              </div>

              {/* Settlement Gate Action */}
              <div className="pt-4">
                {session.status === "SETTLED" || session.status === "PAYPAL_CAPTURED" ? (
                  <div className="p-4 bg-[#22C55E]/10 rounded-xl text-center text-xs text-[#22C55E] font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>PayPal Funds Captured &amp; Settled</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmModalOpen(true)}
                    disabled={isSettling}
                    className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#0070E0] to-[#5B9CFF] hover:from-[#005EA6] hover:to-[#458AF0] text-[#07111F] font-bold text-sm transition-all shadow-lg shadow-[#0070E0]/20 flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{isSettling ? "Auditing Invariants & Capturing..." : "Run ACWORLD Audit & Settle"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* PayPal Identifiers & Invoicing */}
            <div className="bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AAAC0] pb-2 border-b border-[#23354B]/40">
                PayPal transaction records
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Orders v2 Order ID:</span>
                  <span className="font-mono-token text-[#F3F6FC]">
                    {session.paypalOrderId || settlementResult?.orderId || "Pending Authorization"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Captured Transaction ID:</span>
                  <span className="font-mono-token text-[#22C55E]">
                    {session.paypalCaptureId || settlementResult?.captureId || "Awaiting Audit Gate"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9AAAC0]">Negotiated B2B Invoice:</span>
                  <span className="font-mono-token text-[#5B9CFF]">
                    {session.paypalInvoiceId || settlementResult?.invoiceId || "Draft Generation Pending"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: ACWORLD 5-Invariant Verification Panel */}
          <div className="lg:col-span-7 bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 flex flex-col justify-between">
            <div>
              <div className="pb-4 border-b border-[#23354B]/40 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#F3F6FC]">Independent ACWORLD audit gate</h2>
                  <p className="text-xs text-[#9AAAC0] mt-0.5">
                    Server-side verification required prior to PayPal payment capture
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#22C55E] bg-[#22C55E]/10 px-3 py-1 rounded-full">
                  Zero-Trust Gate
                </span>
              </div>

              <div className="pt-6 space-y-4">
                {auditCert ? (
                  <div className="space-y-4">
                    <div
                      className={`p-4.5 rounded-xl border flex items-center justify-between ${
                        auditCert.passed
                          ? "bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]"
                          : "bg-[#EF4444]/10 border-[#EF4444]/40 text-[#EF4444]"
                      }`}
                    >
                      <div className="flex items-center gap-3 font-bold text-sm">
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
                      <span className="text-xs font-mono-token px-2.5 py-1 rounded bg-[#07111F]">
                        #{auditCert.certificateId.slice(-8)}
                      </span>
                    </div>

                    {/* Invariant Rows */}
                    <div className="space-y-2.5 pt-2">
                      {auditCert.invariants.map((inv, idx) => (
                        <div
                          key={idx}
                          className="bg-[#132438]/60 rounded-xl p-4 border border-[#23354B]/40 flex items-start justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-xs text-[#F3F6FC]">
                              {idx + 1}. {inv.name.replace(/_/g, " ")}
                            </div>
                            <div className="text-xs text-[#9AAAC0] leading-relaxed">
                              {inv.reason || "Strict compliance verified against active locked mandate."}
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                              inv.passed
                                ? "bg-[#22C55E]/15 text-[#22C55E]"
                                : "bg-[#EF4444]/15 text-[#EF4444]"
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
                    <p className="text-xs text-[#9AAAC0] leading-relaxed">
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
                        className="bg-[#132438]/50 rounded-xl p-4 border border-[#23354B]/40 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-[#F3F6FC]">{item.name}</div>
                          <div className="text-xs text-[#9AAAC0] mt-0.5">{item.desc}</div>
                        </div>
                        <span className="text-xs text-[#64758E] font-medium">Pending Audit</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 mt-6 border-t border-[#23354B]/40 text-xs text-[#64758E] flex items-center justify-between">
              <span>Auditor Policy: Fail-Closed Protection</span>
              <span className="text-[#22C55E] font-medium">Zero-Trust Settlement</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#07111F]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0D1B2B] rounded-2xl max-w-md w-full p-7 space-y-5 card-shadow-elevated border border-[#23354B] animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-[#F59E0B]">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-[#F3F6FC]">Confirm PayPal Settlement</h3>
            </div>
            <p className="text-xs text-[#9AAAC0] leading-relaxed">
              You are about to invoke the server-side audited PayPal capture gate for{" "}
              <strong className="text-[#F3F6FC]">{session?.id}</strong>. ACWORLD will independently inspect all five mathematical and cryptographic invariants. If any invariant fails, funds will <strong className="text-[#EF4444]">NOT</strong> be released.
            </p>
            <div className="bg-[#07111F] p-4 rounded-xl border border-[#23354B]/60 text-xs space-y-2">
              <div className="flex justify-between text-[#9AAAC0]">
                <span>Total Capture Amount:</span>
                <span className="font-bold text-[#F3F6FC]">
                  ${totalAmount.toLocaleString()} {mandate?.currency}
                </span>
              </div>
              <div className="flex justify-between text-[#9AAAC0]">
                <span>Supplier:</span>
                <span className="text-[#F3F6FC] font-semibold">{selectedQuote?.vendorName}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#132438] hover:bg-[#1A293D] text-xs font-semibold text-[#9AAAC0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSettlement}
                className="px-5 py-2.5 rounded-xl bg-[#5B9CFF] hover:bg-[#458AF0] text-[#07111F] text-xs font-bold transition-all shadow-md shadow-[#5B9CFF]/15 cursor-pointer"
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
