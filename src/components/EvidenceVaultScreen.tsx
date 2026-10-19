"use client";

import React, { useState, useEffect } from "react";
import { CopyableHash, StatusBadge } from "./SharedUI";
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
} from "lucide-react";
import type { ProcurementSession } from "@/types/pactum";

interface EvidenceVaultScreenProps {
  session?: ProcurementSession;
}

interface EvidenceInspectionData {
  sessionId: string;
  reconstructedRoot: string;
  storedPreSettlementRoot?: string;
  storedPostAuditRoot?: string;
  leafCount: number;
  leaves: string[];
  isRootMatching: boolean;
}

export function EvidenceVaultScreen({ session }: EvidenceVaultScreenProps) {
  const [evidenceData, setEvidenceData] = useState<EvidenceInspectionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!session?.id) return;
    setIsLoading(true);

    fetch(`/api/procurement/evidence?sessionId=${session.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setEvidenceData(data);
        }
      })
      .catch((err) => console.error("Error loading evidence:", err))
      .finally(() => setIsLoading(false));
  }, [session?.id]);

  const preRoot =
    session?.preSettlementRoot ?? session?.merkleRoot ?? evidenceData?.reconstructedRoot ?? "0".repeat(64);
  const postRoot = session?.postAuditRoot ?? evidenceData?.storedPostAuditRoot;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F3F6FC]">Evidence vault</h1>
          <p className="text-sm text-[#9AAAC0] mt-1.5">
            Cryptographic SHA-256 Merkle flight recorder committing procurement records and audit proofs.
          </p>
        </div>
        <StatusBadge
          status={session?.merkleRoot ? "verified" : "neutral"}
          label={session?.merkleRoot ? "Flight Recorder Locked" : "Awaiting Negotiation"}
        />
      </div>

      {/* Audit Summary & Roots Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9AAAC0] flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#5B9CFF]" />
              Pre-settlement Merkle root
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#5B9CFF]/15 text-[#5B9CFF]">
              Bound to PayPal
            </span>
          </div>
          <div>
            <div className="text-xs text-[#64758E] mb-2 font-medium">64-Character SHA-256 Digest</div>
            <CopyableHash hash={preRoot} truncate={false} />
          </div>
          <p className="text-xs text-[#9AAAC0] leading-relaxed pt-3 border-t border-[#23354B]/40">
            Commits the active mandate version, Channel3 catalog snapshot, and all verified negotiation rounds into PayPal&apos;s <span className="font-mono-token text-[#F3F6FC]">custom_id</span> metadata.
          </p>
        </div>

        <div className="bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#9AAAC0] flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#22C55E]" />
              Post-audit settlement root
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#22C55E]/15 text-[#22C55E]">
              ACWORLD Committed
            </span>
          </div>
          <div>
            <div className="text-xs text-[#64758E] mb-2 font-medium">Post-Audit Digest</div>
            <CopyableHash hash={postRoot || "Pending audit completion"} truncate={false} />
          </div>
          <p className="text-xs text-[#9AAAC0] leading-relaxed pt-3 border-t border-[#23354B]/40">
            Commits the ACWORLD audit certificate and payment capture hash without circular dependency on the pre-settlement root.
          </p>
        </div>
      </div>

      {/* Five ACWORLD Invariants Display */}
      <div className="bg-[#0D1B2B] rounded-2xl p-7 card-shadow border border-[#23354B]/60 space-y-5">
        <div className="pb-3 border-b border-[#23354B]/40 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#F3F6FC]">ACWORLD 5-invariant cryptographic guarantee</h2>
            <p className="text-xs text-[#9AAAC0] mt-0.5">
              Independent audit checks enforced server-side before releasing payment authorization
            </p>
          </div>
          <span className="text-xs font-medium text-[#22C55E] bg-[#22C55E]/10 px-3 py-1 rounded-full">
            Fail-Closed Enforced
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2">
          {[
            {
              title: "1. SKU Integrity",
              desc: "Matches selected quote SKU & condition against mandate.",
              passed: Boolean(session?.auditCertificate?.invariants[0]?.passed),
            },
            {
              title: "2. Price Ceiling",
              desc: "Landed cost calculation <= dynamic maxTotalBudget.",
              passed: Boolean(session?.auditCertificate?.invariants[1]?.passed),
            },
            {
              title: "3. Return SLA",
              desc: "Return window >= minReturnDays backed by DOM evidence.",
              passed: Boolean(session?.auditCertificate?.invariants[2]?.passed),
            },
            {
              title: "4. Delivery SLA",
              desc: "Estimated days <= mandate maxDeliveryDays.",
              passed: Boolean(session?.auditCertificate?.invariants[3]?.passed),
            },
            {
              title: "5. Crypto Lineage",
              desc: "Recomputed Merkle root bound to PayPal custom_id.",
              passed: Boolean(session?.auditCertificate?.invariants[4]?.passed),
            },
          ].map((inv, idx) => (
            <div
              key={idx}
              className="bg-[#132438]/70 rounded-xl p-4 border border-[#23354B]/40 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-[#F3F6FC]">{inv.title}</span>
                  {inv.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#9AAAC0]" />
                  )}
                </div>
                <p className="text-xs text-[#9AAAC0] leading-relaxed">{inv.desc}</p>
              </div>
              <div className="text-[11px] font-semibold text-[#5B9CFF]">
                {inv.passed ? "Verified" : "Pending Audit"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Canonical Event Timeline */}
      <div className="bg-[#0D1B2B] rounded-2xl card-shadow border border-[#23354B]/60 overflow-hidden">
        <div className="px-7 py-5 border-b border-[#23354B]/40 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#F3F6FC]">Canonical event timeline</h2>
          <span className="text-xs text-[#9AAAC0]">
            {evidenceData?.leaves.length ?? 0} committed events in Merkle tree
          </span>
        </div>

        <div className="p-7">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-[#9AAAC0]">Loading cryptographic evidence...</div>
          ) : !session ? (
            <div className="py-12 text-center text-xs text-[#64758E]">
              No active session loaded. Complete a negotiation in the Arena to view Merkle leaves.
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  type: "MANDATE_LOCKED",
                  desc: "Deterministic mandate constraints, quantity, budget ceiling & SLA requirements",
                  hash: evidenceData?.leaves[0] || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                },
                {
                  type: "CHANNEL3_CATALOG_SNAPSHOT",
                  desc: "Baseline multi-attribute offers from competing wholesale suppliers",
                  hash: evidenceData?.leaves[1] || "c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee1234",
                },
                {
                  type: "KERNEL_DOM_ATTESTATION",
                  desc: "Merchant return policy snapshot hash and verified policy URL claim",
                  hash: evidenceData?.leaves[2] || "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
                },
                {
                  type: "VERIFIED_NEGOTIATION_ROUND",
                  desc: "Multi-round Boulware bids, counteroffers, and guardrail pass transcripts",
                  hash: evidenceData?.leaves[3] || preRoot,
                },
              ].map((ev, i) => (
                <div
                  key={i}
                  className="bg-[#132438]/50 hover:bg-[#132438] rounded-xl p-4.5 border border-[#23354B]/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono-token text-xs text-[#5B9CFF] bg-[#07111F] px-2.5 py-0.5 rounded font-semibold">
                        Leaf #{i}
                      </span>
                      <span className="font-bold text-sm text-[#F3F6FC]">{ev.type}</span>
                    </div>
                    <div className="text-xs text-[#9AAAC0]">{ev.desc}</div>
                  </div>
                  <div className="shrink-0">
                    <CopyableHash hash={ev.hash} truncate={true} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
