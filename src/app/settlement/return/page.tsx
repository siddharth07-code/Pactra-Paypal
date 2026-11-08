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
    <div className="min-h-screen bg-page-bg text-text-primary p-6 sm:p-12 font-sans flex flex-col justify-between transition-colors">
      <div className="max-w-3xl mx-auto w-full space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-primary">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[6px] bg-ember-orange text-white flex items-center justify-center font-bold text-[14px]">
              P
            </div>
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-text-primary">PACTUM</span>
            <span className="text-[12px] font-mono text-text-secondary">/ Settlement Gate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-mono font-medium px-2.5 py-1 rounded-[6px] bg-surface-secondary text-ember-orange border border-ember-orange/30">
              PayPal Sandbox Verified
            </span>
          </div>
        </div>

        {/* Status Hero Card */}
        {phase === "verifying" || phase === "auditing" ? (
          <div className="bg-surface-primary rounded-[6px] p-8 sm:p-10 border border-border-primary space-y-6 text-center transition-colors">
            <div className="w-14 h-14 rounded-full bg-surface-secondary text-ember-orange flex items-center justify-center mx-auto border border-border-primary">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[26px] font-medium tracking-[-0.02em] text-text-primary">
                Verifying PayPal Sandbox Approval
              </h1>
              <p className="text-[14.5px] text-text-secondary max-w-md mx-auto leading-relaxed">
                Verifying Orders v2 authorization state and executing independent 5-invariant cryptographic audit before releasing capture.
              </p>
            </div>

            <div className="bg-surface-secondary rounded-[6px] p-4 text-[12.5px] text-text-secondary font-mono max-w-md mx-auto space-y-1.5 border border-border-primary text-left">
              <div className="flex justify-between">
                <span>Session ID:</span>
                <span className="text-text-primary font-medium">{sessionId}</span>
              </div>
              <div className="flex justify-between">
                <span>Order Token:</span>
                <span className="text-text-primary font-medium">{token}</span>
              </div>
              {payerId && (
                <div className="flex justify-between">
                  <span>Payer ID:</span>
                  <span className="text-text-primary">{payerId}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-[12px] font-mono text-text-secondary pt-2">
              <Lock className="w-3.5 h-3.5" />
              <span>Independent Invariant Audit In-Progress...</span>
            </div>
          </div>
        ) : phase === "captured" ? (
          <div className="bg-surface-primary rounded-[6px] p-8 sm:p-10 border border-border-primary space-y-6 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-[6px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11.5px] font-mono font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Payment Captured &bull; Audit Certified
                </span>
                <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.03em] text-text-primary">
                  Settlement Finalized
                </h1>
                <p className="text-[14.5px] text-text-secondary leading-relaxed">
                  ACWORLD verified all 5 procurement invariants. PayPal Orders v2 capture was authorized and executed.
                </p>
              </div>
            </div>

            {/* Transaction Ledger Artifacts */}
            <div className="bg-surface-secondary rounded-[6px] p-5 sm:p-6 border border-border-primary space-y-4">
              <h3 className="text-[12px] font-mono font-medium uppercase tracking-[0.06em] text-text-secondary pb-2 border-b border-border-primary">
                Authoritative Transaction Artifacts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
                <div>
                  <span className="text-text-secondary block text-[11px] font-mono">PayPal Order ID</span>
                  <span className="font-mono text-text-primary font-medium">{captureResult?.orderId || token}</span>
                </div>
                <div>
                  <span className="text-text-secondary block text-[11px] font-mono">Authorization ID</span>
                  <span className="font-mono text-text-primary font-medium">{captureResult?.authorizationId || "Authorized"}</span>
                </div>
                <div>
                  <span className="text-text-secondary block text-[11px] font-mono">Capture ID</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{captureResult?.captureId || "COMPLETED"}</span>
                </div>
                <div>
                  <span className="text-text-secondary block text-[11px] font-mono">B2B Invoice ID</span>
                  <span className="font-mono text-text-primary font-medium">{captureResult?.invoiceId || "INV-CREATED"}</span>
                </div>
              </div>

              {auditCert && (
                <div className="pt-3 border-t border-border-primary space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-text-primary">ACWORLD Audit Certificate</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">PASSED</span>
                  </div>
                  <div className="text-[11px] font-mono text-text-secondary break-all">
                    Certificate #{auditCert.certificateId} &bull; Root: {auditCert.verifiedRoot}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 pt-1">
                    {auditCert.invariants.map((inv, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-[6px] bg-surface-primary border border-border-primary flex items-center justify-between text-[13px]"
                      >
                        <span className="text-text-primary font-medium">
                          {inv.name}
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11.5px] font-semibold">
                          VERIFIED
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border-primary flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={() => router.push("/workspace")}
                className="px-5 py-2.5 rounded-[6px] border border-border-primary text-[13.5px] font-medium text-text-primary hover:bg-surface-secondary transition-colors cursor-pointer"
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() =>
                  sessionId
                    ? router.push(`/workspace?screen=vault&sessionId=${sessionId}`)
                    : router.push("/workspace?screen=vault")
                }
                className="px-5 py-2.5 rounded-[6px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#a3351f] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Inspect Evidence Vault</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : phase === "blocked" ? (
          <div className="bg-surface-primary rounded-[6px] p-8 sm:p-10 border border-red-500/20 space-y-6 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-[6px] bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 border border-red-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11.5px] font-mono font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                  Fail-Closed Audit Gate Protection
                </span>
                <h1 className="text-[26px] font-medium tracking-[-0.02em] text-text-primary">
                  Capture Blocked by ACWORLD
                </h1>
                <p className="text-[14px] text-text-secondary leading-relaxed">
                  PayPal authorization was verified, but the independent final-state audit detected an invariant violation. Funds were <strong className="text-red-600 dark:text-red-400">NOT</strong> captured.
                </p>
              </div>
            </div>

            <div className="bg-red-500/10 p-4 rounded-[6px] border border-red-500/20 text-[13px] text-red-600 dark:text-red-400 font-medium font-mono">
              {errorMessage}
            </div>

            {auditCert && (
              <div className="space-y-2 pt-2">
                <div className="text-[13px] font-medium text-text-secondary">Invariant Evaluation Details:</div>
                {auditCert.invariants.map((inv, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-[6px] border text-[13px] flex items-center justify-between ${
                      inv.passed
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                    }`}
                  >
                    <span>{idx + 1}. {inv.name.replace(/_/g, " ")}: {inv.reason || "Checked"}</span>
                    <span className="font-mono font-medium">{inv.passed ? "PASS" : "BLOCKED"}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-border-primary flex justify-end">
              <button
                type="button"
                onClick={() => router.push(`/workspace?screen=settlement&sessionId=${sessionId}`)}
                className="px-5 py-2.5 rounded-[6px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#a3351f] transition-colors cursor-pointer shadow-xs"
              >
                Return to Mission Control
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-surface-primary rounded-[6px] p-8 sm:p-10 border border-border-primary space-y-6 text-center transition-colors">
            <div className="w-14 h-14 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border border-red-500/20">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[24px] font-medium text-text-primary">Settlement Error</h1>
              <p className="text-[14px] text-text-secondary max-w-md mx-auto leading-relaxed">
                {errorMessage || "An unexpected error occurred during PayPal settlement verification."}
              </p>
            </div>
            <div className="pt-4">
              <button
                type="button"
                onClick={() => router.push("/workspace")}
                className="px-5 py-2.5 rounded-[6px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#a3351f] transition-colors cursor-pointer shadow-xs"
              >
                Return to Overview
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-3xl mx-auto w-full pt-8 text-center text-[12px] font-mono text-text-secondary">
        PACTUM — Negotiate Intelligently. Settle Verifiably. Powered by PayPal Orders v2 &amp; SHA-256 Merkle Engine.
      </div>
    </div>
  );
}

export default function SettlementReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-page-bg flex items-center justify-center p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-ember-orange" />
        </div>
      }
    >
      <ReturnContent />
    </Suspense>
  );
}
