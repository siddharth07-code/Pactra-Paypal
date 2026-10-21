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
        <div className="flex items-center justify-between pb-4 border-b border-border-color">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-ember-orange text-white flex items-center justify-center font-bold text-[14px]">
              P
            </div>
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-obsidian dark:text-[#f5f3ef]">PACTUM</span>
            <span className="text-[12px] font-mono text-text-muted">/ Settlement Gate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-mono font-medium px-2.5 py-1 rounded-[6px] bg-warm-cream dark:bg-[#1a1a1e] text-ember-orange border border-ember-orange/30">
              PayPal Sandbox Verified
            </span>
          </div>
        </div>

        {/* Status Hero Card */}
        {phase === "verifying" || phase === "auditing" ? (
          <div className="bg-card-surface rounded-[12px] p-8 sm:p-10 border border-border-color shadow-xs space-y-6 text-center transition-colors">
            <div className="w-14 h-14 rounded-full bg-lavender-mist dark:bg-architect-violet/15 text-architect-violet dark:text-[#b490f5] flex items-center justify-center mx-auto border border-architect-violet/20">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[26px] font-medium tracking-[-0.02em] text-obsidian dark:text-[#f5f3ef]">
                Verifying PayPal Sandbox Approval
              </h1>
              <p className="text-[14.5px] text-text-secondary max-w-md mx-auto leading-relaxed">
                Confirming authorization with Orders v2 and running the independent ACWORLD 5-invariant cryptographic audit gate...
              </p>
            </div>
            <div className="bg-warm-cream/50 dark:bg-[#141416] rounded-[8px] p-4 text-[12.5px] text-text-secondary font-mono max-w-md mx-auto space-y-1.5 border border-border-color text-left">
              <div className="flex justify-between">
                <span className="text-text-muted">Session ID:</span>
                <span className="text-obsidian dark:text-[#f5f3ef] font-medium">{sessionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">PayPal Order ID:</span>
                <span className="text-obsidian dark:text-[#f5f3ef] font-medium">{token}</span>
              </div>
              {payerId && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Payer ID:</span>
                  <span className="text-obsidian dark:text-[#f5f3ef]">{payerId}</span>
                </div>
              )}
            </div>
          </div>
        ) : phase === "captured" ? (
          <div className="bg-card-surface rounded-[12px] p-8 sm:p-10 border border-border-color shadow-xs space-y-8 animate-in fade-in zoom-in-95 duration-150 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[6px] bg-mint-whisper dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[12px] font-mono font-medium border border-emerald-300 dark:border-emerald-800/40">
                  <CheckCircle2 className="w-3.5 h-3.5 text-lichen-green" />
                  <span>Settlement Authorized &amp; Captured</span>
                </div>
                <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.03em] text-obsidian dark:text-[#f5f3ef]">
                  Payment Verified &amp; Settled
                </h1>
                <p className="text-[14.5px] text-text-secondary leading-relaxed">
                  ACWORLD verified all five invariants. PayPal funds have been captured and bound to the post-audit Merkle root.
                </p>
              </div>
              <div className="w-12 h-12 rounded-[10px] bg-mint-whisper dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-300 dark:border-emerald-800/40">
                <Lock className="w-6 h-6 text-lichen-green" />
              </div>
            </div>

            {/* Transaction Artifacts */}
            <div className="bg-warm-cream/40 dark:bg-[#141416] rounded-[10px] p-5 sm:p-6 border border-border-color space-y-4">
              <h3 className="text-[12px] font-mono font-medium uppercase tracking-[0.06em] text-architect-violet dark:text-[#b490f5] pb-2 border-b border-border-color">
                Cryptographic &amp; Financial Settlement Artifacts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13.5px]">
                <div>
                  <span className="text-text-muted block text-[11.5px] font-mono">PayPal Order ID</span>
                  <span className="font-mono text-obsidian dark:text-[#f5f3ef] font-medium">{captureResult?.orderId || token}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11.5px] font-mono">Authorization ID</span>
                  <span className="font-mono text-architect-violet dark:text-[#b490f5] font-medium">{captureResult?.authorizationId || "Authorized"}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11.5px] font-mono">Captured Payment ID</span>
                  <span className="font-mono text-lichen-green font-medium">{captureResult?.captureId}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11.5px] font-mono">B2B Negotiated Invoice</span>
                  <span className="font-mono text-architect-violet dark:text-[#b490f5] font-medium">{captureResult?.invoiceId || "INV-CREATED"}</span>
                </div>
              </div>
            </div>

            {/* Audit Certificate Summary */}
            {auditCert && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-[13.5px]">
                  <span className="font-medium text-obsidian dark:text-[#f5f3ef]">ACWORLD Audit Certificate</span>
                  <span className="font-mono text-[12px] text-text-muted">#{auditCert.certificateId.slice(-8)}</span>
                </div>
                <div className="space-y-2">
                  {auditCert.invariants.map((inv, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-[8px] bg-warm-cream/30 dark:bg-[#18181b] border border-border-color flex items-center justify-between text-[13px]"
                    >
                      <span className="text-obsidian dark:text-[#f5f3ef] font-medium">
                        {idx + 1}. {inv.name.replace(/_/g, " ")}
                      </span>
                      <span className="text-lichen-green font-medium font-mono text-[12px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-border-color flex flex-col sm:flex-row gap-3 justify-end">
              <button
                onClick={() => router.push("/")}
                className="px-5 py-2.5 rounded-[8px] border border-border-color text-[13.5px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#202024] transition-colors cursor-pointer"
              >
                Procurement Overview
              </button>
              <button
                onClick={() => router.push(`/?screen=settlement&sessionId=${sessionId}`)}
                className="px-5 py-2.5 rounded-[8px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#e65c00] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>View Settlement Center</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : phase === "blocked" ? (
          <div className="bg-card-surface rounded-[12px] p-8 sm:p-10 border border-red-200 dark:border-red-900/40 shadow-xs space-y-6 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-[10px] bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-800/40">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11.5px] font-mono font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                  Fail-Closed Audit Gate Protection
                </span>
                <h1 className="text-[26px] font-medium tracking-[-0.02em] text-obsidian dark:text-[#f5f3ef]">
                  Capture Blocked by ACWORLD
                </h1>
                <p className="text-[14px] text-text-secondary leading-relaxed">
                  PayPal authorization was verified, but the independent final-state audit detected an invariant violation. Funds were <strong className="text-red-600 dark:text-red-400">NOT</strong> captured.
                </p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-[8px] border border-red-200 dark:border-red-800/40 text-[13px] text-red-700 dark:text-red-300 font-medium font-mono">
              {errorMessage}
            </div>

            {auditCert && (
              <div className="space-y-2 pt-2">
                <div className="text-[13px] font-medium text-text-muted">Invariant Evaluation Details:</div>
                {auditCert.invariants.map((inv, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-[8px] border text-[13px] flex items-center justify-between ${
                      inv.passed
                        ? "bg-mint-whisper/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300"
                        : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300"
                    }`}
                  >
                    <span>{idx + 1}. {inv.name.replace(/_/g, " ")}: {inv.reason || "Checked"}</span>
                    <span className="font-mono font-medium">{inv.passed ? "PASS" : "BLOCKED"}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-border-color flex justify-end">
              <button
                onClick={() => router.push(`/?screen=settlement&sessionId=${sessionId}`)}
                className="px-5 py-2.5 rounded-[8px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#e65c00] transition-colors cursor-pointer shadow-xs"
              >
                Return to Mission Control
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-card-surface rounded-[12px] p-8 sm:p-10 border border-border-color space-y-6 text-center transition-colors">
            <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border border-red-200 dark:border-red-800/40">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[24px] font-medium text-obsidian dark:text-[#f5f3ef]">Settlement Error</h1>
              <p className="text-[14px] text-text-secondary max-w-md mx-auto leading-relaxed">
                {errorMessage || "An unexpected error occurred during PayPal settlement verification."}
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => router.push("/")}
                className="px-5 py-2.5 rounded-[8px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#e65c00] transition-colors cursor-pointer shadow-xs"
              >
                Return to Overview
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-3xl mx-auto w-full pt-8 text-center text-[12px] font-mono text-text-muted">
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
