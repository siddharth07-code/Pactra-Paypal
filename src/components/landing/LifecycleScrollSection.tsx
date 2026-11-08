"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Layers, ShieldCheck, FileCheck, CheckCircle2 } from "lucide-react";
import { LifecycleSculptureCanvas } from "./LifecycleSculptureCanvas";

interface StageData {
  id: string;
  number: string;
  title: string;
  metric: string;
  description: string;
  capability: string;
  contextTag: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
}

const LIFECYCLE_STAGES: StageData[] = [
  {
    id: "sourcing",
    number: "01",
    title: "SOURCING",
    metric: "3 Competing Vendors",
    description: "Structured supplier discovery and comparable procurement options.",
    capability:
      "Channel3 wholesale offer ingestion. Extraction of SKU specifications, quantity ceilings, and baseline market pricing.",
    contextTag: "25x 4K USB-C Monitors • Max Budget: $8,500",
    icon: Layers,
  },
  {
    id: "negotiate",
    number: "02",
    title: "NEGOTIATE",
    metric: "100% Policy Enforced",
    description: "AI-assisted negotiation within deterministic policy boundaries.",
    capability:
      "Deterministic mechanism-design firewall. Real-time Boulware decay threshold, reservation-price leakage prevention, and anti-thrashing monotonicity.",
    contextTag: "Round 2 simulated breach visibly blocked & regenerated",
    icon: ShieldCheck,
  },
  {
    id: "audit",
    number: "03",
    title: "AUDIT",
    metric: "5 Authoritative Invariants",
    description: "Evidence-linked audit checks before financial execution.",
    capability:
      "Independent ACWORLD audit gate verifying SKU integrity, price ceilings, return window (>=30d), delivery SLAs (<=5d), and Merkle root equality.",
    contextTag: "SHA-256 binary Merkle flight recorder",
    icon: FileCheck,
  },
  {
    id: "settle",
    number: "04",
    title: "SETTLE",
    metric: "$8,500 Audited Total",
    description: "PayPal-powered authorization and controlled capture workflows.",
    capability:
      "PayPal Orders v2 authorization, audited pre-capture verification gate, B2B invoicing, and cryptographic dispute evidence packages.",
    contextTag: "Readiness verified • Settlement authorized",
    icon: CheckCircle2,
  },
];

export function LifecycleScrollSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setIsReducedMotion(mediaQuery.matches);

    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    return () => mediaQuery.removeEventListener("change", handleMediaChange);
  }, []);

  // Native scroll tracking without hijacking
  useEffect(() => {
    if (isReducedMotion) return;

    const handleScroll = () => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const totalScrollable = rect.height - windowHeight;

      if (totalScrollable <= 0) return;

      // Calculate progress 0.0 to 1.0 based on track visibility
      const rawProgress = -rect.top / totalScrollable;
      const clampedProgress = Math.min(Math.max(rawProgress, 0), 1);

      setScrollProgress(clampedProgress);

      const stageIdx = Math.min(3, Math.floor(clampedProgress * 4));
      setActiveStageIndex(stageIdx);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [isReducedMotion]);

  const selectStage = (idx: number) => {
    setActiveStageIndex(idx);
    const targetProgress = idx * 0.33;
    setScrollProgress(targetProgress);

    if (!isReducedMotion && trackRef.current) {
      const track = trackRef.current;
      const totalScrollable = track.offsetHeight - window.innerHeight;
      const targetScrollY =
        window.scrollY + track.getBoundingClientRect().top + targetProgress * totalScrollable;
      window.scrollTo({ top: targetScrollY, behavior: "smooth" });
    }
  };

  return (
    <section
      id="lifecycle-section"
      ref={sectionRef}
      className="editorial-obsidian-section w-full relative z-10"
      aria-label="Procurement Lifecycle Architecture"
    >
      {/* 1. Transition Header & Two-Tone Thesis Statement (DESIGN.md Section 1 & 5) */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 pt-24 sm:pt-32 pb-16 lg:pb-24">
        <div className="max-w-4xl space-y-6 sm:space-y-8">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.08em] text-[#7A7670]">
            <span className="w-2 h-0.5 bg-[#C43A1D]" />
            <span>01—04 / Verifiable Lifecycle</span>
          </div>

          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-medium tracking-[-0.03em] leading-[1.08]">
            <span className="two-tone-thesis-lead block">
              Autonomous procurement shouldn’t operate in the dark.
            </span>
            <span className="two-tone-thesis-sub block mt-3 font-sans text-xl sm:text-2xl lg:text-3xl font-normal leading-[1.3] text-[#7A7670]">
              We bind multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement
              into one verifiable system.
            </span>
          </h2>
        </div>

        {/* Stage Selector Pills (Accessible Stage Switcher) */}
        <div className="flex flex-wrap gap-2.5 pt-10 sm:pt-12" role="tablist" aria-label="Lifecycle Stages">
          {LIFECYCLE_STAGES.map((st, idx) => (
            <button
              key={st.id}
              role="tab"
              aria-selected={activeStageIndex === idx}
              onClick={() => selectStage(idx)}
              className={`stage-tab-btn ${activeStageIndex === idx ? "active" : ""}`}
            >
              <span className="text-[#C43A1D] font-bold">{st.number}</span>
              <span>{st.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Scroll-Scrubbed Track: Desktop Sticky Split & Mobile Stack */}
      <div ref={trackRef} className="relative w-full min-h-[220vh] lg:min-h-[280vh]">
        <div className="sticky top-20 w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start py-8">
          {/* Left Column: Active Lifecycle Information Panel */}
          <div className="lg:col-span-6 space-y-6 order-2 lg:order-1">
            <div className="lifecycle-card active p-6 sm:p-8 lg:p-10 space-y-6">
              {/* Card Header & Icon */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-[4px] bg-[#C43A1D]/15 border border-[#C43A1D]/30 text-xs font-mono text-[#C43A1D] font-semibold">
                    STAGE {LIFECYCLE_STAGES[activeStageIndex].number}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-wider text-[#7A7670]">
                    {LIFECYCLE_STAGES[activeStageIndex].title}
                  </span>
                </div>
                {React.createElement(LIFECYCLE_STAGES[activeStageIndex].icon, {
                  className: "w-5 h-5 text-[#ECE9E2]",
                  "aria-hidden": true,
                })}
              </div>

              {/* Metric & Title */}
              <div className="space-y-2">
                <div className="lifecycle-metric text-white">
                  {LIFECYCLE_STAGES[activeStageIndex].metric}
                </div>
                <h3 className="text-lg sm:text-xl font-medium text-[#ECE9E2]">
                  {LIFECYCLE_STAGES[activeStageIndex].description}
                </h3>
              </div>

              {/* Concrete Capability Narrative */}
              <p className="text-sm sm:text-base leading-[1.6] text-[#A09C94] font-normal">
                {LIFECYCLE_STAGES[activeStageIndex].capability}
              </p>

              {/* Context Tag */}
              <div className="pt-2 border-t border-white/5 flex items-center gap-2 text-xs font-mono text-[#7A7670]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{LIFECYCLE_STAGES[activeStageIndex].contextTag}</span>
              </div>
            </div>

            {/* Scroll Navigation Micro-Indicator */}
            <div className="flex items-center justify-between text-xs font-mono text-[#7A7670] px-2">
              <span>Scroll to scrub verification</span>
              <span>{Math.round(scrollProgress * 100)}% Verified</span>
            </div>
          </div>

          {/* Right Column: 3D Mechanical Agreement Sculpture (Evolves with Scroll Scrub) */}
          <div className="lg:col-span-6 relative w-full h-[380px] sm:h-[460px] lg:h-[540px] rounded-[14px] overflow-hidden order-1 lg:order-2 border border-white/5 bg-[#0D0D0D]">
            <LifecycleSculptureCanvas
              progress={scrollProgress}
              activeStage={activeStageIndex}
            />

            {/* Micro Mechanical Attestation Badge */}
            <div className="absolute left-4 bottom-4 z-20 pointer-events-none hidden sm:block">
              <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-xs border border-white/10 text-[11px] font-mono text-[#A09C94]">
                &bull; Mechanical Stage:{" "}
                <span className="text-white font-medium">
                  {LIFECYCLE_STAGES[activeStageIndex].title}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Dark Section Finale & Action (DESIGN.md Section 5 - Sequence 3) */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 py-24 sm:py-32 border-t border-white/10">
        <div className="max-w-3xl space-y-8">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.08em] text-[#C43A1D]">
            <span>Deterministic Finality</span>
          </div>

          <h2 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-medium tracking-[-0.03em] leading-[0.98] text-white">
            Settle Verifiably.
          </h2>

          <p className="text-base sm:text-xl leading-[1.6] text-[#A09C94] max-w-xl">
            Every mandate locked. Every offer verified. Every settlement cryptographically provable.
          </p>

          <div className="pt-2">
            <Link
              id="lifecycle-cta"
              href="/login"
              className="pactum-pill-cta-dark h-[54px] px-9 text-[15px]"
            >
              <span>Enter Workspace</span>
              <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Link>
          </div>

          {/* Compliance & Demonstration Footnote */}
          <p className="text-xs font-mono text-[#5A5650] max-w-lg leading-relaxed pt-6">
            Illustrative demonstration workflow. PayPal Orders v2, Invoicing, and Dispute evidence
            workflows require verified credentials.
          </p>
        </div>
      </div>
    </section>
  );
}
