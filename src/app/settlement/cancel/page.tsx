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
        <div className="flex items-center justify-between pb-4 border-b border-border-primary">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[5px] bg-ember-orange text-white flex items-center justify-center font-bold text-[13px] tracking-tight shadow-xs">
              P
            </div>
            <span className="text-[17px] font-semibold tracking-[-0.03em] text-text-primary">PACTUM</span>
          </div>
          <span className="text-[11.5px] font-mono-token font-medium px-2.5 py-1 rounded-[6px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            Payment Cancelled
          </span>
        </div>

        {/* Cancellation Notice Card */}
        <div className="bg-surface-primary rounded-[6px] p-8 sm:p-10 border border-border-primary space-y-6 text-center transition-colors">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <XCircle className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              PayPal Checkout Cancelled
            </h1>
            <p className="text-[14.5px] text-text-secondary max-w-sm mx-auto leading-relaxed">
              You exited the PayPal Sandbox approval interface. No funds were authorized or captured.
            </p>
          </div>

          <div className="bg-surface-secondary rounded-[6px] p-3.5 text-[13px] text-text-secondary flex items-center justify-center gap-2 border border-border-primary">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Procurement mandate and negotiated supplier terms remain intact.</span>
          </div>

          {sessionId && (
            <div className="text-[12px] font-mono-token text-text-secondary">
              Session Reference: {sessionId}
            </div>
          )}

          <div className="pt-4 border-t border-border-primary flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="px-4 py-2.5 rounded-[6px] border border-border-primary text-[13.5px] font-medium text-text-primary hover:bg-surface-secondary transition-colors cursor-pointer"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() =>
                sessionId
                  ? router.push(`/?screen=settlement&sessionId=${sessionId}`)
                  : router.push("/")
              }
              className="px-4 py-2.5 rounded-[6px] bg-ember-orange text-white text-[13.5px] font-medium hover:bg-[#a3351f] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Settlement Center</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-xl mx-auto w-full pt-8 text-center text-[12px] font-mono text-text-secondary">
        PACTUM — Negotiate Intelligently. Settle Verifiably.
      </div>
    </div>
  );
}

export default function SettlementCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-page-bg flex items-center justify-center p-6 text-center">
          <div className="text-text-secondary text-[14px]">Loading cancellation details...</div>
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
