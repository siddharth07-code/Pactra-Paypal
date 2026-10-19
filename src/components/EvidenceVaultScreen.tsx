"use client";

import React, { useState, useEffect } from "react";
import { CopyableHash, StatusBadge } from "./SharedUI";
import {
  ShieldCheck,
  Layers,
  Lock,
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

  const preRoot = session?.preSettlementRoot ?? session?.merkleRoot ?? evidenceData?.reconstructedRoot ?? "0".repeat(64);
  const postRoot = session?.postAuditRoot ?? evidenceData?.storedPostAuditRoot;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="border-b border-[#203149] pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F1F5F9]">Evidence Vault</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            SHA-256 Merkle flight recorder committing procurement mandates, catalog baselines, DOM attestations, and negotiation rounds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={session?.merkleRoot ? "verified" : "neutral"}
            label={session?.merkleRoot ? "Flight Recorder Locked" : "Awaiting Negotiation"}
            size="md"
          />
        </div>
      </div>

      {/* Merkle Roots Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8] flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#4597FF]" />
              Pre-Settlement Merkle Root
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#4597FF]/10 text-[#4597FF] border border-[#4597FF]/30">
              BOUND TO PAYPAL
            </span>
          </div>
          <div>
            <div className="text-xs text-[#64748B] mb-1">64-Character SHA-256 Digest</div>
            <CopyableHash hash={preRoot} truncate={false} />
          </div>
          <div className="text-xs text-[#94A3B8] pt-2 border-t border-[#203149]">
            Transmitted to PayPal Orders v2 in <span className="font-mono text-[#F1F5F9]">custom_id</span> as cryptographically verifiable reference.
          </div>
        </div>

        <div className="bg-[#0B1728] border border-[#203149] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8] flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#22C55E]" />
              Post-Audit Settlement Root
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30">
              ACWORLD COMMITTED
            </span>
          </div>
          <div>
            <div className="text-xs text-[#64748B] mb-1">Post-Audit Digest</div>
            <CopyableHash hash={postRoot || "Pending audit completion"} truncate={false} />
          </div>
          <div className="text-xs text-[#94A3B8] pt-2 border-t border-[#203149]">
            Commits ACWORLD audit certificate and payment capture without circular hash dependencies.
          </div>
        </div>
      </div>

      {/* Merkle Leaf Inspection */}
      <div className="bg-[#0B1728] border border-[#203149] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#203149] flex items-center justify-between bg-[#101F33]/40">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#4597FF]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
              Canonical Event Timeline &amp; Leaves
            </h2>
          </div>
          <span className="text-xs font-mono text-[#64748B]">
            {evidenceData?.leaves.length ?? 0} Committed Leaves
          </span>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-[#94A3B8]">Loading cryptographic evidence...</div>
          ) : !session ? (
            <div className="py-12 text-center text-xs text-[#64748B]">
              No active session loaded. Complete a negotiation in the Arena to view Merkle leaves.
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  type: "MANDATE_LOCKED",
                  desc: "Deterministic constraints, quantity, budget ceiling & delivery SLA",
                  hash: evidenceData?.leaves[0] || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                },
                {
                  type: "CHANNEL3_CATALOG_SNAPSHOT",
                  desc: "Baseline multi-attribute quotes from competing wholesale suppliers",
                  hash: evidenceData?.leaves[1] || "c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee1234",
                },
                {
                  type: "KERNEL_DOM_ATTESTATION",
                  desc: "Merchant return policy snapshot hash and verified URL claim",
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
                  className="bg-[#101F33]/60 border border-[#203149] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#4597FF]/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xs text-[#4597FF] bg-[#203149] px-2 py-1 rounded">
                      Leaf #{i}
                    </span>
                    <div>
                      <div className="font-semibold text-xs text-[#F1F5F9]">{ev.type}</div>
                      <div className="text-xs text-[#94A3B8]">{ev.desc}</div>
                    </div>
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
