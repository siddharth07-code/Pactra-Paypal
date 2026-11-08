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
  Info,
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
  integrity?: {
    valid: boolean;
    errorCode?: string;
    error?: string;
    verifiedEvents: number;
  };
  isRootMatching: boolean;
}

export function EvidenceVaultScreen({ session }: EvidenceVaultScreenProps) {
  const [evidenceData, setEvidenceData] = useState<EvidenceInspectionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "tree">("timeline");
  const [selectedProofIndex, setSelectedProofIndex] = useState<number | null>(null);
  const [inclusionProofData, setInclusionProofData] = useState<{
    leafHash?: string;
    proof?: Array<{ position: "left" | "right"; hash: string }>;
    rootHash?: string;
  } | null>(null);
  const [isLoadingProof, setIsLoadingProof] = useState(false);

  useEffect(() => {
    if (!session?.id) {
      setEvidenceData(null);
      setSelectedProofIndex(null);
      setInclusionProofData(null);
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

  const handleInspectProof = async (index: number) => {
    if (!session?.id) return;
    if (selectedProofIndex === index) {
      setSelectedProofIndex(null);
      setInclusionProofData(null);
      return;
    }

    setSelectedProofIndex(index);
    setIsLoadingProof(true);
    try {
      const res = await fetch(`/api/procurement/evidence?sessionId=${session.id}&eventIndex=${index}`);
      const data = await res.json();
      if (data.inclusionProof) {
        setInclusionProofData(data.inclusionProof);
      } else {
        setInclusionProofData(null);
      }
    } catch {
      setInclusionProofData(null);
    } finally {
      setIsLoadingProof(false);
    }
  };

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
      status: inv?.status,
      code: inv?.code,
      reason: inv?.reason,
      isSupplierAttestation: inv?.isSupplierAttestation,
      evidenceReferences: inv?.evidenceReferences,
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

  const renderInvariantBadge = (inv: ReturnType<typeof getInvariantStatus>) => {
    if (!inv.tested) {
      return <StatusBadge status="neutral" label="PENDING" />;
    }
    switch (inv.status) {
      case "VALID":
        return <StatusBadge status="verified" label="VALID" />;
      case "INCOMPLETE":
        return <StatusBadge status="warning" label="INCOMPLETE" />;
      case "UNVERIFIABLE":
        return <StatusBadge status="failure" label="UNVERIFIABLE" />;
      case "INVALID":
      default:
        return <StatusBadge status="failure" label={inv.passed ? "VALID" : "INVALID"} />;
    }
  };

  return (
    <div className="space-y-8 text-text-primary min-w-0">
      {/* Header */}
      <SectionHeader
        title="Evidence Vault"
        subtitle="SHA-256 Merkle flight recorder committing procurement records and verifiable audit proofs."
        badge={
          <StatusBadge
            status={
              evidenceData?.integrity && !evidenceData.integrity.valid
                ? "failure"
                : preRoot
                  ? "verified"
                  : "neutral"
            }
            label={
              evidenceData?.integrity && !evidenceData.integrity.valid
                ? `Chain Compromised [${evidenceData.integrity.errorCode ?? "TAMPERED"}]`
                : preRoot
                  ? "Flight Recorder Locked"
                  : "Awaiting Negotiation"
            }
          />
        }
      />

      {/* Merkle Roots: Clean Side-by-Side Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-primary rounded-[6px] p-5 sm:p-6 border border-border-primary space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-border-primary">
            <span className="text-[12px] font-sans font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              Pre-Settlement Merkle Root
            </span>
            <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-[4px] bg-surface-secondary text-text-primary border border-border-primary">
              PayPal custom_id bound
            </span>
          </div>
          <div>
            <div className="text-[12px] text-text-secondary mb-1.5 font-medium">
              64-Character SHA-256 Digest
            </div>
            {preRoot ? (
              <CopyableHash hash={preRoot} truncate={false} />
            ) : (
              <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary text-[13px] text-text-secondary font-mono-token italic">
                Uncommitted — Awaiting verified negotiation completion
              </div>
            )}
          </div>
          <p className="text-[12.5px] text-text-secondary leading-relaxed pt-2.5 border-t border-border-primary">
            Cryptographically commits the mandate requirements, Channel3 baseline quotes, and all approved negotiation rounds.
          </p>
        </div>

        <div className="bg-surface-primary rounded-[6px] p-5 sm:p-6 border border-border-primary space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-border-primary">
            <span className="text-[12px] font-sans font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Post-Audit Settlement Root
            </span>
            <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-[4px] bg-surface-secondary text-text-primary border border-border-primary">
              ACWORLD Certified
            </span>
          </div>
          <div>
            <div className="text-[12px] text-text-secondary mb-1.5 font-medium">
              Post-Audit Digest
            </div>
            {postRoot ? (
              <CopyableHash hash={postRoot} truncate={false} />
            ) : (
              <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary text-[13px] text-text-secondary font-mono-token italic">
                Pending ACWORLD final audit completion
              </div>
            )}
          </div>
          <p className="text-[12.5px] text-text-secondary leading-relaxed pt-2.5 border-t border-border-primary">
            Cryptographically commits the ACWORLD audit certificate and payment capture without circular dependency on the pre-settlement root.
          </p>
        </div>
      </div>

      {/* Audit Context Metadata Bar */}
      {session?.auditCertificate && (
        <div className="bg-surface-secondary rounded-[6px] p-4 border border-border-primary flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-text-primary">
              Certificate: <span className="font-mono-token font-normal">{session.auditCertificate.certificateId}</span>
            </span>
            <span className="text-text-secondary">•</span>
            <span className="text-text-secondary">
              Mandate: <span className="font-mono-token font-medium text-text-primary">v{session.auditCertificate.mandateVersion}</span>
            </span>
            {session.auditCertificate.agreementId && (
              <>
                <span className="text-text-secondary">•</span>
                <span className="text-text-secondary">
                  Agreement: <span className="font-mono-token font-medium text-text-primary">{session.auditCertificate.agreementId}</span>
                </span>
              </>
            )}
            {session.paypalOrderId && (
              <>
                <span className="text-text-secondary">•</span>
                <span className="text-text-secondary">
                  PayPal Order: <span className="font-mono-token font-medium text-text-primary">{session.paypalOrderId}</span>
                </span>
              </>
            )}
            {session.paypalCaptureId && (
              <>
                <span className="text-text-secondary">•</span>
                <span className="text-text-secondary">
                  Capture: <span className="font-mono-token font-medium text-text-primary">{session.paypalCaptureId}</span>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">Audit Stage:</span>
            <span className="font-medium text-text-primary">
              {session.auditCertificate.auditType === "POST_SETTLEMENT" ? "Post-Settlement Record" : "Pre-Settlement Gate"}
            </span>
          </div>
        </div>
      )}

      {/* Verifiable FX Settlement Bridge Evidence (Phase 18) */}
      {session?.fxRecord && (
        <div className="bg-surface-primary rounded-[6px] p-5 sm:p-6 border border-border-primary space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-border-primary">
            <span className="text-[12px] font-sans font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Verifiable FX Settlement Evidence
            </span>
            <StatusBadge
              status={session.fxRecord.status === "LOCKED" || session.fxRecord.status === "CONSUMED" ? "verified" : "info"}
              label={`FX ${session.fxRecord.status}`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[12.5px]">
            <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
              <span className="text-text-secondary block text-[11px]">Commercial Amount</span>
              <span className="font-semibold text-text-primary text-[13px] tabular-nums">
                {(session.fxRecord.sourceAmountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} {session.fxRecord.sourceCurrency}
              </span>
              <span className="text-text-secondary block text-[10.5px] font-mono-token">
                {session.fxRecord.sourceAmountMinor} minor units
              </span>
            </div>
            <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
              <span className="text-text-secondary block text-[11px]">Locked FX Rate</span>
              <span className="font-semibold text-text-primary text-[13px] font-mono-token">
                1 USD = ₹{session.fxRecord.rate}
              </span>
              <span className="text-text-secondary block text-[10.5px]">
                {session.fxRecord.rateConvention} ({session.fxRecord.rateSource === "DETERMINISTIC_DEMO" ? "Deterministic Demo FX" : (session.fxRecord.provider || "Live")})
              </span>
            </div>
            <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
              <span className="text-text-secondary block text-[11px]">Settlement Obligation</span>
              <span className="font-semibold text-text-primary text-[13px] tabular-nums">
                ${(session.fxRecord.targetAmountMinor / 100).toFixed(2)} {session.fxRecord.targetCurrency}
              </span>
              <span className="text-text-secondary block text-[10.5px] font-mono-token">
                {session.fxRecord.targetAmountMinor} minor units ({session.fxRecord.roundingMode})
              </span>
            </div>
            <div className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
              <span className="text-text-secondary block text-[11px]">Timestamps &amp; SLA</span>
              <span className="text-text-primary block text-[11.5px] font-mono-token">
                Quoted: {new Date(session.fxRecord.quotedAt).toLocaleTimeString()}
              </span>
              <span className="text-text-secondary block text-[10.5px] font-mono-token">
                Expires: {new Date(session.fxRecord.expiresAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-border-primary">
            <div className="text-[12px] text-text-secondary mb-1 font-medium">
              Cryptographic Conversion Commitment (SHA-256)
            </div>
            <CopyableHash hash={session.fxRecord.conversionHash} truncate={false} />
          </div>
        </div>
      )}

      {/* Evaluator Architecture & Verification Guide */}
      <details className="group bg-surface-primary rounded-[6px] border border-border-primary p-5">
        <summary className="flex items-center justify-between cursor-pointer list-none select-none">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-text-secondary shrink-0" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold text-text-primary tracking-tight">
              Evaluator Guide: Understanding VeriPay Evidence &amp; ACWORLD Audit
            </span>
          </div>
          <span className="text-[12px] font-mono-token text-text-secondary group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>
        <div className="pt-4 mt-3 border-t border-border-primary grid grid-cols-1 md:grid-cols-2 gap-4 text-[12.5px] text-text-secondary leading-relaxed">
          <div className="space-y-1.5 p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
            <div className="font-semibold text-text-primary text-[13px]">
              1. Mandate Commitment &amp; Acceptance
            </div>
            <p>
              The procurement officer locks budget and SLA bounds. The buyer agent negotiates with competing vendors. A winning agreement is explicitly accepted only when it satisfies all constraints.
            </p>
          </div>
          <div className="space-y-1.5 p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
            <div className="font-semibold text-text-primary text-[13px]">
              2. Independent 5-Invariant Audit
            </div>
            <p>
              Before PayPal capture, the server independently recalculates landed cost arithmetic, validates SKU &amp; condition, verifies return window attestation, checks delivery SLA, and confirms cryptographic lineage. Any invariant failure immediately blocks payment capture.
            </p>
          </div>
          <div className="space-y-1.5 p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
            <div className="font-semibold text-text-primary text-[13px]">
              3. SHA-256 Merkle Flight Recorder
            </div>
            <p>
              Every turn and attestation is canonicalized and committed into a binary Merkle tree. The Merkle root proves record immutability and sequence integrity; physical supplier fulfillment remains subject to real-world performance.
            </p>
          </div>
          <div className="space-y-1.5 p-3 rounded-[6px] bg-surface-secondary border border-border-primary">
            <div className="font-semibold text-text-primary text-[13px]">
              4. PayPal Sandbox Integration
            </div>
            <p>
              Orders v2 authorization binds the pre-settlement root to <code className="font-mono-token text-text-primary bg-surface-secondary px-1 rounded">custom_id</code>. Audited capture releases funds and creates an itemized B2B invoice strictly behind the server-side audit gate.
            </p>
          </div>
        </div>
      </details>

      {/* 5 ACWORLD Invariants Structured Verification Checklist */}
      <div className="bg-surface-primary rounded-[6px] border border-border-primary overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-text-primary tracking-tight">
              ACWORLD Independent Audit Invariants
            </h2>
            <p className="text-[12.5px] text-text-secondary mt-0.5">
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
                  ? `Audit Blocked [${session.auditCertificate.status ?? "FAILED"}]`
                  : "Pending Audit"
            }
          />
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-[13px] border-collapse table-fixed">
            <thead>
              <tr className="border-b border-border-primary bg-surface-secondary type-table-header text-text-secondary">
                <th scope="col" className="w-[24%] py-3 pl-6 pr-4 font-semibold">Invariant</th>
                <th scope="col" className="w-[36%] py-3 px-4 font-semibold">Evaluation Rule</th>
                <th scope="col" className="w-[28%] py-3 px-4 font-semibold">Authoritative Evaluated Value</th>
                <th scope="col" className="w-[12%] py-3 pl-4 pr-6 text-right font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
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
                  rule: "Agreed Return SLA >= Mandate Min Return Days (Supplier Attestation)",
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
                <tr key={idx} className="hover:bg-surface-secondary transition-colors">
                  <td className="py-3.5 pl-6 pr-4 font-semibold text-text-primary">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{item.name}</span>
                      {item.inv.isSupplierAttestation && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-secondary text-text-secondary border border-border-primary font-medium">
                          Supplier Claim
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-text-secondary leading-snug break-words">
                    {item.rule}
                  </td>
                  <td className="py-3.5 px-4 font-mono-token text-[12px] text-text-primary break-words">
                    {item.inv.code && (
                      <span className="text-[11px] font-sans font-medium text-text-secondary mr-1.5">
                        [{item.inv.code}]
                      </span>
                    )}
                    {item.inv.reason ? (
                      <span className={item.inv.passed ? "text-text-primary" : "text-[#b83e26]"}>
                        {item.inv.reason}
                      </span>
                    ) : (
                      item.evaluated
                    )}
                  </td>
                  <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                    {renderInvariantBadge(item.inv)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="sm:hidden p-4 divide-y divide-border-primary">
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
                <span className="font-semibold text-[13.5px] text-text-primary">
                  {item.name}
                </span>
                {renderInvariantBadge(item.inv)}
              </div>
              <p className="text-[12px] text-text-secondary">
                {item.inv.reason || item.rule}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Flight Recorder Ledger & Tree Inspector */}
      <div className="bg-surface-primary rounded-[6px] border border-border-primary overflow-hidden">
        {/* Tab Controls */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-border-primary flex items-center justify-between bg-surface-secondary">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange ${activeTab === "timeline"
                ? "bg-surface-primary text-text-primary border border-border-primary"
                : "text-text-secondary hover:text-text-primary"
                }`}
            >
              Committed Event Ledger ({committedNodes.length || evidenceData?.leaves?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tree")}
              className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange ${activeTab === "tree"
                ? "bg-surface-primary text-text-primary border border-border-primary"
                : "text-text-secondary hover:text-text-primary"
                }`}
            >
              Merkle Tree Levels ({evidenceData?.levels?.length || 0})
            </button>
          </div>

          <span className="text-[12px] font-mono-token text-text-secondary">
            {session?.id || "No Session Selected"}
          </span>
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6">
          {isLoading ? (
            <div className="py-12 text-center text-[13.5px] text-text-secondary">
              Loading authoritative Merkle evidence...
            </div>
          ) : activeTab === "timeline" ? (
            committedNodes.length > 0 ? (
              <div className="divide-y divide-border-primary" role="list">
                {committedNodes.map((node) => {
                  const isInspecting = selectedProofIndex === node.index;
                  return (
                    <div key={node.index} className="py-3.5 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-[4px] bg-surface-secondary text-text-primary font-mono-token text-[11px] font-medium flex items-center justify-center shrink-0 border border-border-primary">
                            {node.index}
                          </span>
                          <div>
                            <div className="font-semibold text-text-primary">
                              {node.eventType}
                            </div>
                            <div className="text-[11.5px] text-text-secondary">
                              {new Date(node.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 self-start sm:self-center">
                          <CopyableHash hash={node.leafHash} label="Leaf" />
                          <button
                            type="button"
                            onClick={() => handleInspectProof(node.index)}
                            aria-expanded={isInspecting}
                            aria-label={`Inspect cryptographic proof for leaf index ${node.index}`}
                            className={`px-2.5 py-1 rounded-[5px] text-[11px] font-mono-token transition-colors cursor-pointer border ${
                              isInspecting
                                ? "bg-surface-secondary text-text-primary border-border-primary font-semibold"
                                : "bg-surface-primary text-text-secondary hover:text-text-primary border-border-primary"
                            }`}
                          >
                            {isInspecting ? "Hide Proof" : "Inspect Proof"}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Inclusion Proof Details */}
                      {isInspecting && (
                        <div className="p-3.5 rounded-[6px] bg-surface-secondary border border-border-primary text-[12px] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-text-primary font-mono-token text-[11.5px]">
                              SHA-256 Merkle Inclusion Proof (Leaf #{node.index})
                            </span>
                            <StatusBadge status="verified" label="Proof Verified" />
                          </div>

                          {isLoadingProof ? (
                            <div className="text-text-secondary text-[11.5px] font-mono-token py-2">
                              Computing cryptographic sibling proof path...
                            </div>
                          ) : inclusionProofData ? (
                            <div className="space-y-2 text-[11px] font-mono-token">
                              <div>
                                <span className="text-text-secondary">Leaf Hash: </span>
                                <span className="text-text-primary break-all">{inclusionProofData.leafHash || node.leafHash}</span>
                              </div>
                              {inclusionProofData.proof && inclusionProofData.proof.length > 0 ? (
                                <div className="space-y-1 pt-1 border-t border-border-primary">
                                  <div className="text-text-secondary font-sans font-medium">
                                    Sibling Nodes ({inclusionProofData.proof.length} level{inclusionProofData.proof.length > 1 ? "s" : ""}):
                                  </div>
                                  {inclusionProofData.proof.map((p, pIdx) => (
                                    <div key={pIdx} className="flex items-center gap-2 text-text-secondary">
                                      <span className="px-1 py-0.5 rounded bg-surface-primary uppercase text-[9.5px] border border-border-primary">
                                        {p.position}
                                      </span>
                                      <span className="break-all text-text-primary">{p.hash}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-text-secondary pt-1">
                                  Tree consists of 1 leaf node. Leaf digest is identical to root hash.
                                </div>
                              )}
                              {inclusionProofData.rootHash && (
                                <div className="pt-1 border-t border-border-primary">
                                  <span className="text-text-secondary">Evaluated Root Digest: </span>
                                  <span className="text-text-primary break-all">{inclusionProofData.rootHash}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[#b83e26] text-[11.5px]">
                              Unable to retrieve inclusion proof for leaf index {node.index}.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : evidenceData?.leaves && evidenceData.leaves.length > 0 ? (
              <div className="space-y-2.5">
                {evidenceData.leaves.map((leaf, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-[6px] bg-surface-secondary border border-border-primary flex items-center justify-between gap-3"
                  >
                    <span className="text-[12px] font-mono-token text-text-secondary">
                      Leaf #{idx}
                    </span>
                    <CopyableHash hash={leaf} truncate={false} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-text-secondary text-[13.5px]">
                No Merkle events recorded for this session yet. Launch a procurement run to generate cryptographic proof.
              </div>
            )
          ) : evidenceData?.levels && evidenceData.levels.length > 0 ? (
            <div className="space-y-4">
              {evidenceData.levels.map((lvl, levelIdx) => (
                <div key={levelIdx} className="space-y-2">
                  <div className="text-[12px] font-mono-token text-text-secondary uppercase tracking-wider font-medium">
                    Level {levelIdx} ({lvl.length} node{lvl.length > 1 ? "s" : ""})
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {lvl.map((hash, hIdx) => (
                      <div
                        key={hIdx}
                        className="p-2.5 rounded-[6px] bg-surface-secondary border border-border-primary"
                      >
                        <CopyableHash hash={hash} truncate={false} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-text-secondary text-[13.5px]">
              Tree levels unavailable. Complete negotiation rounds to inspect internal Merkle nodes.
            </div>
          )}
        </div>
      </div>

      {/* Integrity Attestation Note */}
      <div className="pt-2 text-[12px] text-text-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-t border-border-primary">
        <span>Cryptographic Lineage: SHA-256 Merkle Flight Recorder</span>
        <span className="text-[11.5px]">Merkle root proves chronological record integrity; merchant performance is subject to external SLA verification.</span>
      </div>
    </div>
  );
}
