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
    <div className="min-h-screen bg-[#f6f3ee] text-[#000000] p-6 sm:p-12 font-sans flex flex-col justify-between">
      <div className="max-w-xl mx-auto w-full space-y-8 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#e5e5e5]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#000000] text-[#ffffff] flex items-center justify-center font-bold text-[14px]">
              P
            </div>
            <span className="text-[18px] font-medium tracking-tight">PACTUM</span>
          </div>
          <span className="text-[12px] font-medium px-3 py-1 rounded-[24px] bg-[#feeef0] text-[#ef4444] border border-[#ef4444]/30">
            Payment Cancelled
          </span>
        </div>

        {/* Cancellation Notice Card */}
        <div className="bg-[#ffffff] rounded-[24px] p-10 border border-[#e5e5e5] shadow-[0px_4px_12px_rgba(0,0,0,0.03)] space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#feeef0] text-[#ef4444] flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-[26px] font-medium tracking-[-0.5px] text-[#000000]">
              PayPal Checkout Cancelled
            </h1>
            <p className="text-[15px] text-[#888888] max-w-sm mx-auto leading-relaxed">
              You exited the PayPal Sandbox approval interface. No funds were authorized or captured.
            </p>
          </div>

          <div className="bg-[#f6f3ee] rounded-[16px] p-4 text-[13px] text-[#888888] flex items-center justify-center gap-2">
            <Shield className="w-4 h-4 text-[#00cc88]" />
            <span>Procurement mandate &amp; negotiation offer remain safely intact.</span>
          </div>

          {sessionId && (
            <div className="text-[12px] font-mono-token text-[#888888]">
              Session Reference: {sessionId}
            </div>
          )}

          <div className="pt-4 border-t border-[#e5e5e5] flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push("/")}
              className="px-6 py-3 rounded-[24px] border border-[#e5e5e5] text-[14px] font-medium text-[#000000] hover:bg-[#f6f3ee] transition-colors"
            >
              Overview
            </button>
            <button
              onClick={() =>
                sessionId
                  ? router.push(`/?screen=settlement&sessionId=${sessionId}`)
                  : router.push("/")
              }
              className="px-6 py-3 rounded-[24px] bg-[#000000] text-[#ffffff] text-[14px] font-medium hover:bg-[#222222] transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Settlement Center</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-xl mx-auto w-full pt-8 text-center text-[12px] text-[#888888]">
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
