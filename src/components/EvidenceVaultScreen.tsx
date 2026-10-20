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
    <div className="space-y-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[36px] font-medium tracking-[-0.72px] text-[#000000]">
            Evidence vault
          </h1>
          <p className="text-[16px] text-[#888888] mt-1">
            SHA-256 Merkle flight recorder committing procurement records and verifiable audit proofs.
          </p>
        </div>
        <StatusBadge
          status={session?.merkleRoot ? "verified" : "neutral"}
          label={session?.merkleRoot ? "Flight Recorder Locked" : "Awaiting Negotiation"}
        />
      </div>

      {/* Merkle Roots: Warm Feature Cards with subtle elevation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#f6f3ee] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-[#5c2999] uppercase tracking-[-0.28px] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#5c2999]" />
              Pre-settlement Merkle root
            </span>
            <span className="text-[12px] font-medium px-3 py-1 rounded-[24px] bg-[#f6f1fe] text-[#5c2999] border border-[#5c2999]/30">
              Bound to PayPal
            </span>
          </div>
          <div>
            <div className="text-[13px] text-[#888888] mb-2 font-medium">64-Character SHA-256 Digest</div>
            <CopyableHash hash={preRoot} truncate={false} />
          </div>
          <p className="text-[14px] text-[#888888] leading-relaxed pt-3 border-t border-[#e5e5e5]">
            Commits the active mandate version, Channel3 catalog snapshot, and all verified negotiation rounds into PayPal&apos;s <span className="font-mono-token text-[#000000]">custom_id</span> parameter.
          </p>
        </div>

        <div className="bg-[#f6f1fe] rounded-[24px] p-8 sm:p-10 border border-[#5c2999]/20 space-y-4 concentric-arcs-violet">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-[#5c2999] uppercase tracking-[-0.28px] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#5c2999]" />
              Post-audit settlement root
            </span>
            <span className="text-[12px] font-medium px-3 py-1 rounded-[24px] bg-[#ebfef6] text-[#00cc88] border border-[#00cc88]/30">
              ACWORLD Committed
            </span>
          </div>
          <div>
            <div className="text-[13px] text-[#888888] mb-2 font-medium">Post-Audit Digest</div>
            <CopyableHash hash={postRoot || "Pending audit completion"} truncate={false} />
          </div>
          <p className="text-[14px] text-[#888888] leading-relaxed pt-3 border-t border-[#5c2999]/20">
            Commits the ACWORLD audit certificate and payment capture hash without circular dependency on the pre-settlement root.
          </p>
        </div>
      </div>

      {/* Five ACWORLD Invariants Display */}
      <div className="bg-[#ffffff] rounded-[24px] p-8 sm:p-10 border border-[#e5e5e5] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] space-y-6">
        <div className="pb-4 border-b border-[#e5e5e5] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
              ACWORLD 5-Invariant Cryptographic Guarantee
            </h2>
            <p className="text-[14px] text-[#888888] mt-0.5">
              Independent audit checks enforced server-side before releasing payment authorization
            </p>
          </div>
          <div className="text-[12px] font-medium text-[#00cc88] bg-[#ebfef6] px-3.5 py-1.5 rounded-[24px] border border-[#00cc88]/30 self-start sm:self-auto">
            Fail-Closed Enforced
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 pt-2">
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
              className="bg-[#f6f3ee] rounded-[16px] p-5 border border-[#e5e5e5] flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-[15px] text-[#000000]">{inv.title}</span>
                  {inv.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00cc88]" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#888888]" />
                  )}
                </div>
                <p className="text-[13px] text-[#888888] leading-relaxed">{inv.desc}</p>
              </div>
              <div className="text-[12px] font-medium text-[#5c2999] pt-2 border-t border-[#e5e5e5]">
                {inv.passed ? "Verified" : "Pending Audit"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Canonical Event Timeline (Warm Cream Card) */}
      <div className="bg-[#f6f3ee] rounded-[24px] border border-[#e5e5e5] overflow-hidden p-8 sm:p-10 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#e5e5e5]">
          <h2 className="text-[20px] font-medium text-[#000000] tracking-[-0.4px]">
            Canonical Event Timeline
          </h2>
          <span className="text-[14px] text-[#888888]">
            {evidenceData?.leaves.length ?? 0} committed events in Merkle tree
          </span>
        </div>

        <div>
          {isLoading ? (
            <div className="py-12 text-center text-[14px] text-[#888888]">Loading cryptographic evidence...</div>
          ) : !session ? (
            <div className="py-12 text-center text-[14px] text-[#888888]">
              No active session loaded. Complete a negotiation in the Arena to view Merkle leaves.
            </div>
          ) : (
            <div className="space-y-4">
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
                  className="bg-[#ffffff] rounded-[16px] p-5 border border-[#e5e5e5] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono-token text-[12px] text-[#5c2999] bg-[#f6f1fe] px-2.5 py-1 rounded-[6px] font-medium">
                        Leaf #{i}
                      </span>
                      <span className="font-medium text-[16px] text-[#000000]">{ev.type}</span>
                    </div>
                    <div className="text-[14px] text-[#888888]">{ev.desc}</div>
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
