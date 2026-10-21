"use client";

import React, { useState, useEffect } from "react";
import {
  CopyableHash,
  StatusBadge,
  SectionHeader,
  WarmFeatureCard,
  LavenderFeaturePanel,
  EmptyState,
} from "./SharedUI";
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  XCircle,
  GitCommit,
  Layers,
} from "lucide-react";
import type { ProcurementSession, MerkleAuditNode } from "@/types/pactum";

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
  auditNodes?: MerkleAuditNode[];
  levels: string[][];
  isRootMatching: boolean;
}

export function EvidenceVaultScreen({ session }: EvidenceVaultScreenProps) {
  const [evidenceData, setEvidenceData] = useState<EvidenceInspectionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "tree">("timeline");

  useEffect(() => {
    if (!session?.id) {
      setEvidenceData(null);
      return;
    }
    setIsLoading(true);

    fetch(`/api/procurement/evidence?sessionId=${session.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setEvidenceData(data);
        } else {
          setEvidenceData(null);
        }
      })
      .catch(() => setEvidenceData(null))
      .finally(() => setIsLoading(false));
  }, [session?.id]);

  // Authoritative pre-settlement root: only display genuine digest from session or authoritative evidence
  const preRoot =
    session?.preSettlementRoot ??
    session?.merkleRoot ??
    evidenceData?.storedPreSettlementRoot ??
    (evidenceData && evidenceData.leafCount > 0 ? evidenceData.reconstructedRoot : undefined);

  // Authoritative post-audit settlement root
  const postRoot = session?.postAuditRoot ?? evidenceData?.storedPostAuditRoot;

  // Resolve authentic invariant status from authoritative session certificate
  const getInvariantStatus = (
    invariantName: "SKU_INTEGRITY" | "PRICE_CEILING" | "RETURN_POLICY" | "DELIVERY_SLA" | "CRYPTOGRAPHIC_LINEAGE"
  ) => {
    const inv = session?.auditCertificate?.invariants?.find((i) => i.name === invariantName);
    return {
      tested: Boolean(inv),
      passed: Boolean(inv?.passed),
      reason: inv?.reason,
    };
  };

  const skuInvariant = getInvariantStatus("SKU_INTEGRITY");
  const priceInvariant = getInvariantStatus("PRICE_CEILING");
  const returnInvariant = getInvariantStatus("RETURN_POLICY");
  const deliveryInvariant = getInvariantStatus("DELIVERY_SLA");
  const cryptoInvariant = getInvariantStatus("CRYPTOGRAPHIC_LINEAGE");

  // Determine committed nodes to display
  const committedNodes: MerkleAuditNode[] =
    evidenceData?.auditNodes && evidenceData.auditNodes.length > 0
      ? evidenceData.auditNodes
      : [];

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      {/* Header */}
      <SectionHeader
        title="Evidence vault"
        subtitle="SHA-256 Merkle flight recorder committing procurement records and verifiable audit proofs."
        badge={
          <StatusBadge
            status={preRoot ? "verified" : "neutral"}
            label={preRoot ? "Flight Recorder Locked" : "Awaiting Negotiation"}
          />
        }
      />

      {/* Merkle Roots: Warm Feature Cards with subtle elevation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <WarmFeatureCard className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-architect-violet dark:text-[#9d6ce6] uppercase tracking-[-0.28px] flex items-center gap-2">
              <Lock className="w-4 h-4 text-architect-violet dark:text-[#9d6ce6]" aria-hidden="true" />
              Pre-settlement Merkle root
            </span>
            <span className="text-[12px] font-medium px-3 py-1 rounded-cards bg-lavender-mist dark:bg-[#271f33] text-architect-violet dark:text-[#9d6ce6] border border-architect-violet/30">
              Bound to PayPal custom_id
            </span>
          </div>
          <div>
            <div className="text-[13px] text-[#666666] dark:text-[#a5a19b] mb-2 font-medium">64-Character SHA-256 Digest</div>
            {preRoot ? (
              <CopyableHash hash={preRoot} truncate={false} />
            ) : (
              <div className="p-3.5 rounded-smallelements bg-warm-cream dark:bg-[#242424] border border-smoke dark:border-[#333333] text-[14px] text-ash-gray font-mono-token italic">
                Uncommitted — Awaiting verified negotiation completion
              </div>
            )}
          </div>
          <p className="text-[14px] text-[#666666] dark:text-[#c4c0ba] leading-relaxed pt-3 border-t border-smoke dark:border-[#333333]">
            Commits the active mandate version, Channel3 catalog snapshot, and all verified negotiation rounds into PayPal&apos;s <span className="font-mono-token text-obsidian dark:text-white">custom_id</span> parameter.
          </p>
        </WarmFeatureCard>

        <LavenderFeaturePanel className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-architect-violet dark:text-[#9d6ce6] uppercase tracking-[-0.28px] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-architect-violet dark:text-[#9d6ce6]" aria-hidden="true" />
              Post-audit settlement root
            </span>
            <span className="text-[12px] font-medium px-3 py-1 rounded-cards bg-mint-whisper dark:bg-[#132820] text-lichen-green border border-lichen-green/30">
              ACWORLD Committed
            </span>
          </div>
          <div>
            <div className="text-[13px] text-[#666666] dark:text-[#a5a19b] mb-2 font-medium">Post-Audit Digest</div>
            {postRoot ? (
              <CopyableHash hash={postRoot} truncate={false} />
            ) : (
              <div className="p-3.5 rounded-smallelements bg-paper-white dark:bg-[#1a1a1a] border border-architect-violet/20 dark:border-architect-violet/40 text-[14px] text-ash-gray font-mono-token italic">
                Pending ACWORLD final audit completion
              </div>
            )}
          </div>
          <p className="text-[14px] text-[#666666] dark:text-[#c4c0ba] leading-relaxed pt-3 border-t border-architect-violet/20 dark:border-architect-violet/40">
            Commits the ACWORLD audit certificate and payment capture hash without circular dependency on the pre-settlement root.
          </p>
        </LavenderFeaturePanel>
      </div>

      {/* Five ACWORLD Invariants Display */}
      <div className="bg-paper-white dark:bg-[#1a1a1a] rounded-cards p-8 sm:p-10 border border-smoke dark:border-[#333333] shadow-sm space-y-6 transition-colors">
        <div className="pb-4 border-b border-smoke dark:border-[#333333] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.4px]">
              ACWORLD 5-Invariant Cryptographic Guarantee
            </h2>
            <p className="text-[14px] text-[#666666] dark:text-[#a5a19b] mt-0.5 tracking-[-0.2px]">
              Independent audit checks enforced server-side before releasing payment authorization
            </p>
          </div>
          <div className="text-[12px] font-medium text-lichen-green bg-mint-whisper dark:bg-[#132820] px-3.5 py-1.5 rounded-cards border border-lichen-green/30 self-start sm:self-auto">
            Fail-Closed Enforced
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 pt-2">
          {[
            {
              title: "1. SKU Integrity",
              desc: "Matches selected quote SKU & condition against mandate.",
              state: skuInvariant,
            },
            {
              title: "2. Price Ceiling",
              desc: "Landed cost calculation <= dynamic maxTotalBudget.",
              state: priceInvariant,
            },
            {
              title: "3. Return SLA",
              desc: "Return window >= minReturnDays backed by DOM evidence.",
              state: returnInvariant,
            },
            {
              title: "4. Delivery SLA",
              desc: "Estimated days <= mandate maxDeliveryDays.",
              state: deliveryInvariant,
            },
            {
              title: "5. Crypto Lineage",
              desc: "Recomputed Merkle root bound to PayPal custom_id.",
              state: cryptoInvariant,
            },
          ].map((inv, idx) => (
            <div
              key={idx}
              className="bg-warm-cream dark:bg-[#202020] rounded-smallelements p-5 border border-smoke dark:border-[#333333] flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-[15px] text-obsidian dark:text-[#f5f3ef] tracking-[-0.3px]">{inv.title}</span>
                  {inv.state.tested ? (
                    inv.state.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-lichen-green" aria-hidden="true" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#ef4444]" aria-hidden="true" />
                    )
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-ash-gray" aria-hidden="true" />
                  )}
                </div>
                <p className="text-[13px] text-[#666666] dark:text-[#a5a19b] leading-relaxed tracking-[-0.2px]">{inv.desc}</p>
                {inv.state.reason && !inv.state.passed && (
                  <p className="text-[12px] text-[#ef4444] mt-2 font-mono-token">{inv.state.reason}</p>
                )}
              </div>
              <div className="text-[12px] font-medium pt-2 border-t border-smoke dark:border-[#333333]">
                {inv.state.tested ? (
                  inv.state.passed ? (
                    <span className="text-lichen-green">Verified</span>
                  ) : (
                    <span className="text-[#ef4444]">Failed</span>
                  )
                ) : (
                  <span className="text-[#666666] dark:text-[#888888]">Pending Audit</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Merkle Flight Recorder Explorer (Timeline vs Tree Levels View) */}
      <div className="bg-warm-cream dark:bg-[#1f1f1f] rounded-cards border border-smoke dark:border-[#333333] overflow-hidden p-8 sm:p-10 space-y-6 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-smoke dark:border-[#333333]">
          <div>
            <h2 className="text-[20px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.4px]">
              Merkle Evidence Verification
            </h2>
            <span className="text-[14px] text-[#666666] dark:text-[#a5a19b] tracking-[-0.2px]">
              {committedNodes.length > 0
                ? `${committedNodes.length} committed events in Merkle tree`
                : evidenceData?.leaves.length
                ? `${evidenceData.leaves.length} leaves in Merkle tree`
                : "0 committed events"}
            </span>
          </div>

          {/* View toggle */}
          <div className="inline-flex items-center p-1 rounded-smallelements bg-paper-white dark:bg-[#282828] border border-smoke dark:border-[#383838]">
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "timeline"
                  ? "bg-warm-cream dark:bg-[#333333] text-obsidian dark:text-[#f5f3ef]"
                  : "text-[#666666] dark:text-[#a5a19b] hover:text-obsidian"
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Event Timeline</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tree")}
              className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "tree"
                  ? "bg-warm-cream dark:bg-[#333333] text-obsidian dark:text-[#f5f3ef]"
                  : "text-[#666666] dark:text-[#a5a19b] hover:text-obsidian"
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tree Levels</span>
            </button>
          </div>
        </div>

        <div>
          {isLoading ? (
            <div className="py-12 text-center text-[14px] text-[#666666] dark:text-[#a5a19b]">
              Loading cryptographic evidence...
            </div>
          ) : !session ? (
            <EmptyState
              title="No session selected"
              description="Select or start a procurement session to inspect authentic Merkle tree leaves and cryptographic evidence."
            />
          ) : activeTab === "tree" && evidenceData?.levels ? (
            /* Visual Merkle Tree Levels Hierarchy */
            <div className="space-y-6">
              {evidenceData.levels.map((levelHashes, levelIdx) => (
                <div key={levelIdx} className="space-y-2">
                  <div className="text-[13px] font-medium uppercase tracking-wider text-architect-violet dark:text-[#9d6ce6]">
                    {levelIdx === 0
                      ? "Level 0 (Leaf Hashes)"
                      : levelIdx === evidenceData.levels.length - 1
                      ? "Root Level (Final Merkle Root)"
                      : `Level ${levelIdx} (Internal Parent Hashes)`}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {levelHashes.map((hash, nodeIdx) => (
                      <div
                        key={nodeIdx}
                        className="bg-paper-white dark:bg-[#262626] p-3.5 rounded-smallelements border border-smoke dark:border-[#383838] flex items-center justify-between gap-3 text-xs font-mono-token"
                      >
                        <span className="text-[#666666] dark:text-[#a5a19b] shrink-0">
                          [{levelIdx}:{nodeIdx}]
                        </span>
                        <CopyableHash hash={hash} truncate={true} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : committedNodes.length > 0 ? (
            <div className="space-y-4">
              {committedNodes.map((node) => (
                <div
                  key={node.index}
                  className="bg-paper-white dark:bg-[#242424] rounded-smallelements p-5 border border-smoke dark:border-[#383838] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono-token text-[12px] text-architect-violet dark:text-[#9d6ce6] bg-lavender-mist dark:bg-[#332545] px-2.5 py-1 rounded-[6px] font-medium border border-architect-violet/20">
                        Leaf #{node.index}
                      </span>
                      <span className="font-medium text-[16px] text-obsidian dark:text-[#f5f3ef] tracking-[-0.32px]">
                        {node.eventType}
                      </span>
                    </div>
                    <div className="text-[13px] text-[#666666] dark:text-[#a5a19b]">
                      Timestamp: {new Date(node.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                    <CopyableHash hash={node.leafHash} label="Leaf" truncate={true} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No cryptographic leaves committed"
              description="Commencing negotiation in the Arena will commit the locked mandate, catalog snapshot, and negotiation rounds into genuine Merkle tree leaves."
            />
          )}
        </div>
      </div>
    </div>
  );
}
