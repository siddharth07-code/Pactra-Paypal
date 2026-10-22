"use client";

import React, { useState, useEffect } from "react";
import {
  CopyableHash,
  StatusBadge,
  SectionHeader,
} from "./SharedUI";
import {
  ShieldCheck,
  Lock,
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
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <SectionHeader
        title="Evidence Vault"
        subtitle="SHA-256 Merkle flight recorder committing procurement records and verifiable audit proofs."
        badge={
          <StatusBadge
            status={preRoot ? "verified" : "neutral"}
            label={preRoot ? "Flight Recorder Locked" : "Awaiting Negotiation"}
          />
        }
      />

      {/* Merkle Roots: Clean Side-by-Side Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-6 border border-smoke dark:border-[#2b2b32] shadow-2xs space-y-3.5 transition-colors">
          <div className="flex items-center justify-between pb-2 border-b border-smoke/70 dark:border-[#242429]">
            <span className="text-[12px] font-mono-token font-medium text-architect-violet dark:text-[#a78bfa] uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              Pre-Settlement Merkle Root
            </span>
            <span className="text-[11px] font-mono-token font-medium px-2 py-0.5 rounded-[4px] bg-smoke/40 dark:bg-[#202025] text-obsidian dark:text-[#f6f4f0] border border-smoke dark:border-[#2e2e34]">
              PayPal custom_id bound
            </span>
          </div>
          <div>
            <div className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mb-1.5 font-medium">
              64-Character SHA-256 Digest
            </div>
            {preRoot ? (
              <CopyableHash hash={preRoot} truncate={false} />
            ) : (
              <div className="p-3 rounded-[6px] bg-smoke/30 dark:bg-[#141416] border border-smoke dark:border-[#242429] text-[13px] text-ash-gray font-mono-token italic">
                Uncommitted — Awaiting verified negotiation completion
              </div>
            )}
          </div>
          <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed pt-2.5 border-t border-smoke/70 dark:border-[#242429]">
            Cryptographically commits the mandate requirements, Channel3 baseline quotes, and all approved negotiation rounds.
          </p>
        </div>

        <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-6 border border-smoke dark:border-[#2b2b32] shadow-2xs space-y-3.5 transition-colors">
          <div className="flex items-center justify-between pb-2 border-b border-smoke/70 dark:border-[#242429]">
            <span className="text-[12px] font-mono-token font-medium text-architect-violet dark:text-[#a78bfa] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Post-Audit Settlement Root
            </span>
            <span className="text-[11px] font-mono-token font-medium px-2 py-0.5 rounded-[4px] bg-smoke/40 dark:bg-[#202025] text-obsidian dark:text-[#f6f4f0] border border-smoke dark:border-[#2e2e34]">
              ACWORLD Certified
            </span>
          </div>
          <div>
            <div className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83] mb-1.5 font-medium">
              Post-Audit Digest
            </div>
            {postRoot ? (
              <CopyableHash hash={postRoot} truncate={false} />
            ) : (
              <div className="p-3 rounded-[6px] bg-smoke/30 dark:bg-[#141416] border border-smoke dark:border-[#242429] text-[13px] text-ash-gray font-mono-token italic">
                Pending ACWORLD final audit completion
              </div>
            )}
          </div>
          <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] leading-relaxed pt-2.5 border-t border-smoke/70 dark:border-[#242429]">
            Cryptographically commits the ACWORLD audit certificate and payment capture without circular dependency on the pre-settlement root.
          </p>
        </div>
      </div>

      {/* 5 ACWORLD Invariants Structured Verification Checklist */}
      <div className="bg-paper-white dark:bg-[#18181b] rounded-cards border border-smoke dark:border-[#2b2b32] shadow-2xs overflow-hidden transition-colors">
        <div className="p-5 sm:p-6 border-b border-smoke/80 dark:border-[#28282e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight">
              ACWORLD Independent Audit Invariants
            </h2>
            <p className="text-[12.5px] text-[#6e6e78] dark:text-[#8e8a83] mt-0.5">
              Deterministic, fail-closed verification gate required before PayPal capture release
            </p>
          </div>
          <StatusBadge
            status={
              session?.auditCertificate?.passed === true
                ? "verified"
                : session?.auditCertificate?.passed === false
                ? "failure"
                : "neutral"
            }
            label={
              session?.auditCertificate?.passed === true
                ? "Audit Passed (5/5)"
                : session?.auditCertificate?.passed === false
                ? "Audit Blocked"
                : "Pending Audit"
            }
          />
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-smoke dark:border-[#28282e] bg-warm-cream/30 dark:bg-[#151518] text-[11px] font-mono-token uppercase tracking-wider text-[#6e6e78] dark:text-[#8e8a83]">
                <th scope="col" className="py-3 pl-6 pr-4 font-medium">Invariant</th>
                <th scope="col" className="py-3 px-4 font-medium">Evaluation Rule</th>
                <th scope="col" className="py-3 px-4 font-medium">Authoritative Evaluated Value</th>
                <th scope="col" className="py-3 pl-4 pr-6 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-smoke/80 dark:divide-[#242429]">
              {[
                {
                  name: "1. SKU Integrity",
                  inv: skuInvariant,
                  rule: "Item SKU & condition match mandate requirements exactly",
                  evaluated: session?.selectedQuote ? `${session.selectedQuote.sku} (${session.selectedQuote.condition})` : "—",
                },
                {
                  name: "2. Price Ceiling",
                  inv: priceInvariant,
                  rule: "Landed Cost (Unit × Qty + Shipping) <= Mandate Budget",
                  evaluated: session?.finalOffer && session?.mandate
                    ? `$${(session.finalOffer.unitPrice * session.finalOffer.quantity + session.finalOffer.shippingCost).toLocaleString()} <= $${session.mandate.maxTotalBudget.toLocaleString()}`
                    : "—",
                },
                {
                  name: "3. Return Window",
                  inv: returnInvariant,
                  rule: "Agreed Return SLA >= Mandate Min Return Days",
                  evaluated: session?.finalOffer && session?.mandate
                    ? `${session.finalOffer.returnDays}d >= ${session.mandate.minReturnDays}d`
                    : "—",
                },
                {
                  name: "4. Delivery SLA",
                  inv: deliveryInvariant,
                  rule: "Agreed Delivery SLA <= Mandate Max Delivery Days",
                  evaluated: session?.finalOffer && session?.mandate
                    ? `${session.finalOffer.deliveryDays}d <= ${session.mandate.maxDeliveryDays}d`
                    : "—",
                },
                {
                  name: "5. Cryptographic Lineage",
                  inv: cryptoInvariant,
                  rule: "Authoritative Merkle root matches PayPal Orders v2 custom_id",
                  evaluated: preRoot ? `${preRoot.slice(0, 16)}...` : "—",
                },
              ].map((item, idx) => (
                <tr key={idx} className="hover:bg-warm-cream/30 dark:hover:bg-[#1f1f23] transition-colors">
                  <td className="py-3.5 pl-6 pr-4 whitespace-nowrap font-semibold text-obsidian dark:text-[#f6f4f0]">
                    {item.name}
                  </td>
                  <td className="py-3.5 px-4 text-[#6e6e78] dark:text-[#8e8a83] max-w-xs">
                    {item.rule}
                  </td>
                  <td className="py-3.5 px-4 font-mono-token text-[12px] text-obsidian dark:text-[#f6f4f0]">
                    {item.inv.reason ? (
                      <span className={item.inv.passed ? "text-obsidian dark:text-[#f6f4f0]" : "text-[#dc2626] dark:text-[#f87171]"}>
                        {item.inv.reason}
                      </span>
                    ) : (
                      item.evaluated
                    )}
                  </td>
                  <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                    {item.inv.tested ? (
                      item.inv.passed ? (
                        <StatusBadge status="verified" label="PASSED" />
                      ) : (
                        <StatusBadge status="failure" label="FAILED" />
                      )
                    ) : (
                      <StatusBadge status="neutral" label="PENDING" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="sm:hidden p-4 divide-y divide-smoke/80 dark:divide-[#242429]">
          {[
            {
              name: "1. SKU Integrity",
              inv: skuInvariant,
              rule: "Item SKU & condition match mandate",
            },
            {
              name: "2. Price Ceiling",
              inv: priceInvariant,
              rule: "Landed cost <= Mandate budget",
            },
            {
              name: "3. Return Window",
              inv: returnInvariant,
              rule: "Return SLA >= Min return days",
            },
            {
              name: "4. Delivery SLA",
              inv: deliveryInvariant,
              rule: "Delivery SLA <= Max delivery days",
            },
            {
              name: "5. Lineage",
              inv: cryptoInvariant,
              rule: "Merkle root matches PayPal custom_id",
            },
          ].map((item, idx) => (
            <div key={idx} className="py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[13.5px] text-obsidian dark:text-[#f6f4f0]">
                  {item.name}
                </span>
                {item.inv.tested ? (
                  item.inv.passed ? (
                    <StatusBadge status="verified" label="PASSED" />
                  ) : (
                    <StatusBadge status="failure" label="FAILED" />
                  )
                ) : (
                  <StatusBadge status="neutral" label="PENDING" />
                )}
              </div>
              <p className="text-[12px] text-[#6e6e78] dark:text-[#8e8a83]">
                {item.inv.reason || item.rule}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Flight Recorder Ledger & Tree Inspector */}
      <div className="bg-paper-white dark:bg-[#18181b] rounded-cards border border-smoke dark:border-[#2b2b32] overflow-hidden shadow-2xs transition-colors">
        {/* Tab Controls */}
        <div className="px-6 py-4 border-b border-smoke/80 dark:border-[#2b2b32] flex items-center justify-between bg-warm-cream/30 dark:bg-[#151518]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange ${
                activeTab === "timeline"
                  ? "bg-paper-white dark:bg-[#202025] text-obsidian dark:text-[#f6f4f0] shadow-2xs border border-smoke dark:border-[#2e2e34]"
                  : "text-[#6e6e78] dark:text-[#8e8a83] hover:text-obsidian dark:hover:text-[#f6f4f0]"
              }`}
            >
              Committed Event Ledger ({committedNodes.length || evidenceData?.leaves?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tree")}
              className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange ${
                activeTab === "tree"
                  ? "bg-paper-white dark:bg-[#202025] text-obsidian dark:text-[#f6f4f0] shadow-2xs border border-smoke dark:border-[#2e2e34]"
                  : "text-[#6e6e78] dark:text-[#8e8a83] hover:text-obsidian dark:hover:text-[#f6f4f0]"
              }`}
            >
              Merkle Tree Levels ({evidenceData?.levels?.length || 0})
            </button>
          </div>

          <span className="text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
            {session?.id || "No Session Selected"}
          </span>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="py-12 text-center text-[13.5px] text-[#6e6e78] dark:text-[#8e8a83]">
              Loading authoritative Merkle evidence...
            </div>
          ) : activeTab === "timeline" ? (
            committedNodes.length > 0 ? (
              <div className="divide-y divide-smoke/70 dark:divide-[#25252b]" role="list">
                {committedNodes.map((node) => (
                  <div
                    key={node.index}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-[4px] bg-warm-cream dark:bg-[#222227] text-architect-violet dark:text-[#a78bfa] font-mono-token text-[11px] font-medium flex items-center justify-center shrink-0">
                        {node.index}
                      </span>
                      <div>
                        <div className="font-semibold text-obsidian dark:text-[#f6f4f0]">
                          {node.eventType}
                        </div>
                        <div className="text-[11.5px] text-[#6e6e78] dark:text-[#8e8a83]">
                          {new Date(node.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <CopyableHash hash={node.leafHash} label="Leaf" />
                    </div>
                  </div>
                ))}
              </div>
            ) : evidenceData?.leaves && evidenceData.leaves.length > 0 ? (
              <div className="space-y-2.5">
                {evidenceData.leaves.map((leaf, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-[6px] bg-warm-cream/40 dark:bg-[#141416] border border-smoke/70 dark:border-[#25252b] flex items-center justify-between gap-3"
                  >
                    <span className="text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83]">
                      Leaf #{idx}
                    </span>
                    <CopyableHash hash={leaf} truncate={false} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-[#8e8a83] text-[13.5px]">
                No Merkle events recorded for this session yet. Launch a procurement run to generate cryptographic proof.
              </div>
            )
          ) : evidenceData?.levels && evidenceData.levels.length > 0 ? (
            <div className="space-y-4">
              {evidenceData.levels.map((lvl, levelIdx) => (
                <div key={levelIdx} className="space-y-2">
                  <div className="text-[12px] font-mono-token text-[#6e6e78] dark:text-[#8e8a83] uppercase tracking-wider font-medium">
                    Level {levelIdx} ({lvl.length} node{lvl.length > 1 ? "s" : ""})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {lvl.map((hash, hIdx) => (
                      <div
                        key={hIdx}
                        className="p-2.5 rounded-[6px] bg-warm-cream/30 dark:bg-[#141416] border border-smoke/70 dark:border-[#25252b]"
                      >
                        <CopyableHash hash={hash} truncate={false} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-[#8e8a83] text-[13.5px]">
              Tree levels unavailable. Complete negotiation rounds to inspect internal Merkle nodes.
            </div>
          )}
        </div>
      </div>

      {/* Integrity Attestation Note */}
      <div className="pt-2 text-[12px] text-[#6e6e78] dark:text-[#8e8a83] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-t border-smoke/70 dark:border-[#242429]">
        <span>Cryptographic Lineage: SHA-256 Merkle Flight Recorder</span>
        <span className="text-[11.5px]">Merkle root proves chronological record integrity; merchant performance is subject to external SLA verification.</span>
      </div>
    </div>
  );
}
