"use client";

/**
 * PACTUM — PayPal Sandbox Return Handler
 * Route: /settlement/return?sessionId={sessionId}&token={orderId}&PayerID={payerId}
 * Verifies PayPal Sandbox buyer approval, executes Orders v2 authorization,
 * enforces independent ACWORLD 5-invariant audit gate, and releases audited capture.
 * Follows GEMINI.md Section 8, 9, 11 and SECURITY.md Section 3, 7.
 */

import React, { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShieldAlert,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Lock,
  AlertTriangle,
} from "lucide-react";
import type { AuditCertificate } from "@/types/pactum";

function ReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get("sessionId");
  // PayPal passes order ID as `token` in the return URL
  const token = searchParams.get("token") || searchParams.get("orderId");
  const payerId = searchParams.get("PayerID");

  const [phase, setPhase] = useState<"verifying" | "auditing" | "captured" | "blocked" | "error">(
    "verifying"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captureResult, setCaptureResult] = useState<{
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    invoiceId?: string;
    auditCertificate?: AuditCertificate;
  } | null>(null);

  const verificationAttempted = useRef(false);

  useEffect(() => {
    if (verificationAttempted.current) return;
    verificationAttempted.current = true;

    if (!sessionId || !token) {
      setPhase("error");
      setErrorMessage("Missing required PayPal transaction parameters (sessionId or order token).");
      return;
    }

    const executeVerificationAndCapture = async () => {
      try {
        setPhase("auditing");

        const res = await fetch("/api/paypal/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            orderId: token,
            createInvoice: true,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setCaptureResult(data);
          setPhase("captured");
        } else if (data.blockedAtGate) {
          setCaptureResult(data);
          setPhase("blocked");
          setErrorMessage(data.error || "ACWORLD Audit Gate blocked PayPal capture.");
        } else {
          setPhase("error");
          setErrorMessage(data.error || "Failed to process PayPal settlement capture.");
        }
      } catch (err: unknown) {
        setPhase("error");
        setErrorMessage(err instanceof Error ? err.message : "Network failure during settlement.");
      }
    };

    executeVerificationAndCapture();
  }, [sessionId, token]);

  const auditCert = captureResult?.auditCertificate;

  return (
    <div className="min-h-screen bg-[#f6f3ee] text-[#000000] p-6 sm:p-12 font-sans flex flex-col justify-between">
      <div className="max-w-3xl mx-auto w-full space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e5e5e5]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#000000] text-[#ffffff] flex items-center justify-center font-bold text-[14px]">
              P
            </div>
            <span className="text-[18px] font-medium tracking-tight">PACTUM</span>
            <span className="text-[12px] font-mono-token text-[#888888]">/ Settlement Gate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium px-3 py-1 rounded-[24px] bg-[#fff2e6] text-[#ff6600] border border-[#ff6600]/30">
              PayPal Sandbox Verified
            </span>
          </div>
        </div>

        {/* Status Hero Card */}
        {phase === "verifying" || phase === "auditing" ? (
          <div className="bg-[#ffffff] rounded-[24px] p-10 border border-[#e5e5e5] shadow-[0px_4px_12px_rgba(0,0,0,0.03)] space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#f6f1fe] text-[#5c2999] flex items-center justify-center mx-auto animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[28px] font-medium tracking-[-0.5px] text-[#000000]">
                Verifying PayPal Sandbox Approval
              </h1>
              <p className="text-[15px] text-[#888888] max-w-md mx-auto leading-relaxed">
                Confirming authorization with Orders v2 and running the independent ACWORLD 5-invariant cryptographic audit gate...
              </p>
            </div>
            <div className="bg-[#f6f3ee] rounded-[16px] p-4 text-[13px] text-[#888888] font-mono max-w-md mx-auto space-y-1">
              <div>Session ID: {sessionId}</div>
              <div>PayPal Order ID: {token}</div>
              {payerId && <div>Payer ID: {payerId}</div>}
            </div>
          </div>
        ) : phase === "captured" ? (
          <div className="bg-[#ffffff] rounded-[24px] p-10 border border-[#e5e5e5] shadow-[0px_4px_12px_rgba(0,0,0,0.03)] space-y-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[24px] bg-[#ebfef6] text-[#00cc88] text-[13px] font-medium border border-[#00cc88]/30">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Settlement Authorized &amp; Captured</span>
                </div>
                <h1 className="text-[32px] font-medium tracking-[-0.64px] text-[#000000]">
                  Payment Verified &amp; Settled
                </h1>
                <p className="text-[15px] text-[#888888] leading-relaxed">
                  ACWORLD verified all five invariants. PayPal funds have been captured and bound to the post-audit Merkle root.
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[#ebfef6] text-[#00cc88] flex items-center justify-center shrink-0 border border-[#00cc88]/30">
                <Lock className="w-6 h-6" />
              </div>
            </div>

            {/* Transaction Artifacts */}
            <div className="bg-[#f6f3ee] rounded-[20px] p-6 border border-[#e5e5e5] space-y-4">
              <h3 className="text-[13px] font-medium uppercase tracking-[-0.26px] text-[#5c2999] pb-3 border-b border-[#e5e5e5]">
                Cryptographic &amp; Financial Settlement Artifacts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[14px]">
                <div>
                  <span className="text-[#888888] block text-[12px]">PayPal Order ID</span>
                  <span className="font-mono-token text-[#000000]">{captureResult?.orderId || token}</span>
                </div>
                <div>
                  <span className="text-[#888888] block text-[12px]">Authorization ID</span>
                  <span className="font-mono-token text-[#5c2999]">{captureResult?.authorizationId || "Authorized"}</span>
                </div>
                <div>
                  <span className="text-[#888888] block text-[12px]">Captured Payment ID</span>
                  <span className="font-mono-token text-[#00cc88] font-medium">{captureResult?.captureId}</span>
                </div>
                <div>
                  <span className="text-[#888888] block text-[12px]">B2B Negotiated Invoice</span>
                  <span className="font-mono-token text-[#5c2999]">{captureResult?.invoiceId || "INV-CREATED"}</span>
                </div>
              </div>
            </div>

            {/* Audit Certificate Summary */}
            {auditCert && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-medium text-[#000000]">ACWORLD Audit Certificate</span>
                  <span className="font-mono-token text-[12px] text-[#888888]">#{auditCert.certificateId.slice(-8)}</span>
                </div>
                <div className="space-y-2">
                  {auditCert.invariants.map((inv, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-[12px] bg-[#fbfaf8] border border-[#e5e5e5] flex items-center justify-between text-[13px]"
                    >
                      <span className="text-[#000000] font-medium">
                        {idx + 1}. {inv.name.replace(/_/g, " ")}
                      </span>
                      <span className="text-[#00cc88] font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-[#e5e5e5] flex flex-col sm:flex-row gap-3 justify-end">
              <button
                onClick={() => router.push("/")}
                className="px-6 py-3 rounded-[24px] border border-[#e5e5e5] text-[14px] font-medium text-[#000000] hover:bg-[#f6f3ee] transition-colors"
              >
                Procurement Overview
              </button>
              <button
                onClick={() => router.push(`/?screen=settlement&sessionId=${sessionId}`)}
                className="px-6 py-3 rounded-[24px] bg-[#000000] text-[#ffffff] text-[14px] font-medium hover:bg-[#222222] transition-colors flex items-center justify-center gap-2"
              >
                <span>View Settlement Center</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : phase === "blocked" ? (
          <div className="bg-[#ffffff] rounded-[24px] p-10 border border-[#feeef0] shadow-[0px_4px_12px_rgba(239,68,68,0.06)] space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-[#feeef0] text-[#ef4444] flex items-center justify-center shrink-0 border border-[#ef4444]/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[12px] font-medium text-[#ef4444] uppercase tracking-wider">
                  Fail-Closed Audit Gate Protection
                </span>
                <h1 className="text-[28px] font-medium tracking-[-0.5px] text-[#000000]">
                  Capture Blocked by ACWORLD
                </h1>
                <p className="text-[14px] text-[#888888] leading-relaxed">
                  PayPal authorization was verified, but the independent final-state audit detected an invariant violation. Funds were <strong className="text-[#ef4444]">NOT</strong> captured.
                </p>
              </div>
            </div>

            <div className="bg-[#feeef0]/40 p-4 rounded-[16px] border border-[#ef4444]/20 text-[13px] text-[#ef4444] font-medium">
              {errorMessage}
            </div>

            {auditCert && (
              <div className="space-y-2 pt-2">
                <div className="text-[13px] font-medium text-[#888888]">Invariant Evaluation Details:</div>
                {auditCert.invariants.map((inv, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-[12px] border text-[13px] flex items-center justify-between ${
                      inv.passed
                        ? "bg-[#ebfef6]/40 border-[#00cc88]/30 text-[#00cc88]"
                        : "bg-[#feeef0] border-[#ef4444]/40 text-[#ef4444]"
                    }`}
                  >
                    <span>{idx + 1}. {inv.name.replace(/_/g, " ")}: {inv.reason || "Checked"}</span>
                    <span className="font-semibold">{inv.passed ? "PASS" : "BLOCKED"}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-[#e5e5e5] flex justify-end">
              <button
                onClick={() => router.push(`/?screen=settlement&sessionId=${sessionId}`)}
                className="px-6 py-3 rounded-[24px] bg-[#000000] text-[#ffffff] text-[14px] font-medium hover:bg-[#222222] transition-colors"
              >
                Return to Mission Control
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#ffffff] rounded-[24px] p-10 border border-[#e5e5e5] space-y-6 text-center">
            <div className="w-14 h-14 rounded-full bg-[#feeef0] text-[#ef4444] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[24px] font-medium text-[#000000]">Settlement Error</h1>
              <p className="text-[14px] text-[#888888] max-w-md mx-auto leading-relaxed">
                {errorMessage || "An unexpected error occurred during PayPal settlement verification."}
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => router.push("/")}
                className="px-6 py-3 rounded-[24px] bg-[#000000] text-[#ffffff] text-[14px] font-medium hover:bg-[#222222] transition-colors"
              >
                Return to Overview
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-3xl mx-auto w-full pt-8 text-center text-[12px] text-[#888888]">
        PACTUM — Negotiate Intelligently. Settle Verifiably. Powered by PayPal Orders v2 &amp; SHA-256 Merkle Engine.
      </div>
    </div>
  );
}

export default function SettlementReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f6f3ee] flex items-center justify-center p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#5c2999]" />
        </div>
      }
    >
      <ReturnContent />
    </Suspense>
  );
}
