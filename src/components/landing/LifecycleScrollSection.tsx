"use client";

import React from "react";
import Link from "next/link";

interface Pillar {
  number: string;
  stage: string;
  metric: string;
  description: string;
  specification: string;
  benchmark: string;
}

const PILLARS: Pillar[] = [
  {
    number: "01",
    stage: "SOURCING",
    metric: "3 Competing Vendors",
    description: "Structured supplier discovery and comparable procurement options.",
    specification:
      "Channel3 wholesale catalog ingestion extracts verified SKUs, technical specifications, and baseline market pricing across competing distributors.",
    benchmark: "25x 4K USB-C Monitors • Max Budget: $8,500",
  },
  {
    number: "02",
    stage: "NEGOTIATE",
    metric: "Deterministic Guardrail",
    description: "AI-assisted negotiation within deterministic policy boundaries.",
    specification:
      "Deterministic mechanism-design firewall enforces real-time Boulware decay thresholds, reservation-price leakage rules, and price monotonicity before transmission.",
    benchmark: "Round 2 simulated breach visibly blocked & regenerated",
  },
  {
    number: "03",
    stage: "AUDIT",
    metric: "5 Invariant Proofs",
    description: "Evidence-linked audit checks before financial execution.",
    specification:
      "Independent ACWORLD audit gate verifies SKU integrity, price ceilings, return windows (>=30d), delivery SLAs (<=5d), and Merkle root equality before capture.",
    benchmark: "SHA-256 binary Merkle flight recorder",
  },
  {
    number: "04",
    stage: "SETTLE",
    metric: "Audited Capture Gate",
    description: "PayPal-powered authorization and controlled capture workflows.",
    specification:
      "PayPal Orders v2 authorization locks immutable custom_id root references, executing capture only behind the independent audit gate. Generates B2B invoices and dispute evidence.",
    benchmark: "Readiness verified • Settlement authorized",
  },
];

export function LifecycleScrollSection() {
  return (
    <section
      id="lifecycle-section"
      className="editorial-obsidian-section w-full relative z-10"
      aria-label="Procurement Lifecycle Architecture"
    >
      {/* 1. Transition Header & Two-Tone Thesis Statement */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 pt-24 sm:pt-32 pb-16 lg:pb-20">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          <div className="text-xs font-mono uppercase tracking-[0.08em] text-[#7A7670]">
            01—04 / System Architecture
          </div>

          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-medium tracking-[-0.03em] leading-[1.08]">
            <span className="text-white block">
              Autonomous procurement shouldn’t operate in the dark.
            </span>
            <span className="block mt-4 font-sans text-xl sm:text-2xl lg:text-3xl font-normal leading-[1.35] text-[#7A7670]">
              We bind multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement
              into one verifiable system.
            </span>
          </h2>
        </div>
      </div>

      {/* 2. Four Monolithic Architectural Pillars Gallery */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 pb-24 sm:pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PILLARS.map((p) => (
            <article
              key={p.number}
              className="monolithic-pillar-card p-6 sm:p-7 flex flex-col justify-between space-y-8"
            >
              {/* Pillar Header */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs font-mono">
                  <span className="text-[#C43A1D] font-bold">{p.number}</span>
                  <span className="text-[#7A7670] uppercase tracking-wider">{p.stage}</span>
                </div>

                <div className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {p.metric}
                </div>

                <p className="text-sm font-medium text-[#ECE9E2] leading-snug">
                  {p.description}
                </p>

                <p className="text-xs text-[#8A857D] leading-relaxed">
                  {p.specification}
                </p>
              </div>

              {/* Benchmark Tag */}
              <div className="pt-3 border-t border-white/5 text-[11px] font-mono text-[#7A7670] leading-normal">
                {p.benchmark}
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

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-medium tracking-[-0.03em] leading-[0.98] text-white">
            Settle Verifiably.
          </h2>

          <p className="text-base sm:text-lg leading-[1.6] text-[#A09C94]">
            Every mandate locked. Every offer verified. Every settlement cryptographically provable.
          </p>

          <div className="pt-2">
            <Link
              id="lifecycle-cta"
              href="/login"
              className="pactum-pill-cta-dark h-[52px] px-8 text-[15px]"
            >
              <span>Enter Workspace</span>
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
