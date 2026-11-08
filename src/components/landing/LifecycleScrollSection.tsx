"use client";

import React from "react";
import Link from "next/link";

interface WorkflowStage {
  number: string;
  stage: string;
  metric: string;
  heading: string;
  description: string;
  evidenceLines: string[];
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    number: "01",
    stage: "SOURCING",
    metric: "3 Competing Vendors",
    heading: "Wholesale Market Discovery",
    description:
      "Channel3 wholesale catalog ingestion extracts verified SKUs, technical specifications, and baseline market pricing across competing distributors.",
    evidenceLines: [
      "MANDATE: 25x 4K USB-C Monitors",
      "CEILING: $8,500.00 | SLA <= 5d | RETURN >= 30d",
      "QUOTES: Dell P2723QE • LG 27UK850 • Lenovo T27p",
    ],
  },
  {
    number: "02",
    stage: "NEGOTIATE",
    metric: "Deterministic Guardrail",
    heading: "Mechanism-Design Firewall",
    description:
      "A Gemini buyer agent negotiates with supplier agents over MCP. Outgoing proposals are intercept-validated against Boulware decay, leakage rules, and price monotonicity before transmission.",
    evidenceLines: [
      "FEASIBILITY: Total(x_t) <= B_max && d_t <= D_max",
      "UTILITY: U_b(x_t) >= tau(t) [Boulware beta = 3.0]",
      "SAFETY: Round 2 simulated breach blocked & regenerated",
    ],
  },
  {
    number: "03",
    stage: "AUDIT",
    metric: "5 Invariant Proofs",
    heading: "Cryptographic Flight Recorder",
    description:
      "The independent ACWORLD auditor verifies all 5 invariants before capture: SKU integrity, price arithmetic, return policy, delivery SLA, and Merkle root equality.",
    evidenceLines: [
      "LEAF: SHA256(0x00 || CanonicalJSON(event_i))",
      "MERKLE ROOT: 64-hex binary tree committed",
      "VERIFICATION: 5/5 invariants verified pre-capture",
    ],
  },
  {
    number: "04",
    stage: "SETTLE",
    metric: "Audited Capture Gate",
    heading: "PayPal Orders v2 Settlement",
    description:
      "Order authorized with immutable custom_id root references. Server-side audited capture executes only after invariant verification. Generates B2B invoices and Merkle dispute evidence.",
    evidenceLines: [
      "INTENT: AUTHORIZE [PayPal Orders v2 API]",
      "METADATA: VERIPAY_ROOT:<merkle_root>",
      "SETTLEMENT: Audited pre-capture verification passed",
    ],
  },
];

export function LifecycleScrollSection() {
  return (
    <section
      id="lifecycle-section"
      className="editorial-obsidian-section w-full relative z-10"
      aria-label="Procurement Lifecycle Architecture"
    >
      {/* 1. Transition Header & Two-Tone Statement */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 pt-24 sm:pt-32 pb-16 lg:pb-24">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          <div className="text-xs font-mono uppercase tracking-[0.08em] text-[#7A7670]">
            01—04 / Verifiable Lifecycle Architecture
          </div>

          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.035em] leading-[1.08]">
            <span className="text-white block">
              Autonomous procurement shouldn’t operate in the dark.
            </span>
            <span className="block mt-4 text-xl sm:text-2xl lg:text-3xl font-normal leading-[1.4] text-[#8E8A82]">
              We bind multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement
              into one verifiable system.
            </span>
          </h2>
        </div>
      </div>

      {/* 2. Four Monolithic Stages with Authentic System Evidence */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 pb-24 sm:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {WORKFLOW_STAGES.map((s) => (
            <article
              key={s.number}
              className="monolithic-stage-card p-6 sm:p-8 flex flex-col justify-between space-y-6"
            >
              {/* Header */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs font-mono">
                  <span className="text-[#C43A1D] font-bold">STAGE {s.number}</span>
                  <span className="text-[#7A7670] uppercase tracking-wider">{s.stage}</span>
                </div>

                <div className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                  {s.metric}
                </div>

                <h3 className="text-base sm:text-lg font-medium text-[#ECE9E2]">
                  {s.heading}
                </h3>

                <p className="text-sm text-[#8E8A82] leading-relaxed">
                  {s.description}
                </p>
              </div>

              {/* System Evidence Terminal Box */}
              <div className="pactum-evidence-box p-3.5 sm:p-4 space-y-1.5 text-xs">
                <div className="text-[10px] uppercase font-mono text-[#7A7670] pb-1 border-b border-white/5 flex items-center justify-between">
                  <span>System Attestation</span>
                  <span className="text-emerald-500">Active</span>
                </div>
                {s.evidenceLines.map((line, idx) => (
                  <div key={idx} className="text-[#ECE9E2] font-mono leading-relaxed truncate">
                    {line}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* 3. Dark Section Finale & Action */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-20 sm:py-28 border-t border-white/10">
        <div className="max-w-2xl space-y-6">
          <div className="text-xs font-mono uppercase tracking-[0.08em] text-[#C43A1D]">
            Deterministic Finality
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.035em] leading-[0.98] text-white">
            Settle Verifiably.
          </h2>

          <p className="text-base sm:text-lg leading-[1.6] text-[#8E8A82]">
            Every mandate locked. Every offer verified. Every settlement cryptographically provable.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
            <Link
              id="lifecycle-cta"
              href="/login"
              className="pactum-pill-cta-dark h-[52px] px-8 text-[15px]"
            >
              <span>Enter Workspace</span>
            </Link>

            <Link
              href="/register"
              className="px-4 py-2 text-xs font-mono text-[#8E8A82] hover:text-white transition-colors"
            >
              Create an account &rarr;
            </Link>
          </div>

          <p className="text-xs font-mono text-[#5A5650] leading-relaxed pt-4">
            Demonstration architecture. PayPal Orders v2, Invoicing, and Dispute evidence workflows
            require verified credentials.
          </p>
        </div>
      </div>
    </section>
  );
}
