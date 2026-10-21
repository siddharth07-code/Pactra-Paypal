"use client";

/**
 * PACTUM — PayPal Sandbox Checkout Cancellation Handler
 * Route: /settlement/cancel?sessionId={sessionId}&token={token}
 * Handles user opting out of PayPal Sandbox approval without falsely recording payment.
 * Follows GEMINI.md Section 8, 9, 11 and SECURITY.md Section 3, 7.
 */

import React, { Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { XCircle, ArrowLeft, Shield } from "lucide-react";

function CancelContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get("sessionId");

  const cancellationAttempted = useRef(false);

  useEffect(() => {
    if (cancellationAttempted.current || !sessionId) return;
    cancellationAttempted.current = true;

    fetch("/api/paypal/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {
      // Ignore background network failure on cancel
    });
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-page-bg text-text-primary p-6 sm:p-12 font-sans flex flex-col justify-between transition-colors">
      <div className="max-w-xl mx-auto w-full space-y-8 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-color">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-ember-orange text-white flex items-center justify-center font-bold text-[14px]">
              P
            </div>
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-obsidian dark:text-[#f5f3ef]">PACTUM</span>
          </div>
          <span className="text-[11.5px] font-mono font-medium px-2.5 py-1 rounded-[6px] bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/40">
            Payment Cancelled
          </span>
        </div>

        {/* Cancellation Notice Card */}
        <div className="bg-card-surface rounded-[12px] p-8 sm:p-10 border border-border-color shadow-xs space-y-6 text-center transition-colors">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border border-red-200 dark:border-red-800/40">
            <XCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-[24px] sm:text-[26px] font-medium tracking-[-0.02em] text-obsidian dark:text-[#f5f3ef]">
              PayPal Checkout Cancelled
            </h1>
            <p className="text-[14.5px] text-text-secondary max-w-sm mx-auto leading-relaxed">
              You exited the PayPal Sandbox approval interface. No funds were authorized or captured.
            </p>
          </div>

          <div className="bg-warm-cream/50 dark:bg-[#141416] rounded-[8px] p-3.5 text-[13px] text-text-secondary flex items-center justify-center gap-2 border border-border-color">
            <Shield className="w-4 h-4 text-lichen-green" />
            <span>Procurement mandate and negotiated supplier terms remain intact.</span>
          </div>

          {sessionId && (
            <div className="text-[12px] font-mono text-text-muted">
              Session Reference: {sessionId}
            </div>
          )}

          <div className="pt-4 border-t border-border-color flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push("/")}
              className="px-5 py-2.5 rounded-[8px] border border-border-color text-[13.5px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#202024] transition-colors cursor-pointer"
            >
              Overview
            </button>
            <button
              onClick={() =>
                sessionId
                  ? router.push(`/?screen=settlement&sessionId=${sessionId}`)
                  : router.push("/")
              }
              className="px-5 py-2.5 rounded-[8px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#e65c00] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Settlement Center</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-xl mx-auto w-full pt-8 text-center text-[12px] font-mono text-text-muted">
        PACTUM — Negotiate Intelligently. Settle Verifiably.
      </div>
    </div>
  );
}

export default function SettlementCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f6f3ee] flex items-center justify-center p-6 text-center">
          <div className="text-[#888888] text-[14px]">Loading cancellation details...</div>
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
