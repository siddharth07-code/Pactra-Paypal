"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ShieldCheck, Cpu } from "lucide-react";
import gsap from "gsap";
import { HeroSculptureCanvas } from "./HeroSculptureCanvas";
import "./landing.css";

export function WelcomeHeroScreen() {
  const heroRef = useRef<HTMLDivElement>(null);
  const headlineWordsRef = useRef<HTMLSpanElement[]>([]);
  const subtextRef = useRef<HTMLParagraphElement>(null);
  const ctaClusterRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const [canvasReady, setCanvasReady] = useState(false);

  // GSAP Entrance Choreography (DESIGN.md Section 5 - Sequence 1)
  useEffect(() => {
    // Check user preference for reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      // Immediate presentation without motion
      headlineWordsRef.current.forEach((word) => {
        if (word) {
          word.style.transform = "none";
          word.style.opacity = "1";
        }
      });
      if (subtextRef.current) subtextRef.current.style.opacity = "1";
      if (ctaClusterRef.current) ctaClusterRef.current.style.opacity = "1";
      if (baselineRef.current) baselineRef.current.style.opacity = "1";
      if (canvasWrapperRef.current) canvasWrapperRef.current.style.opacity = "1";
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // 1. Staggered headline reveal
      tl.to(headlineWordsRef.current, {
        y: "0%",
        opacity: 1,
        duration: 0.85,
        stagger: 0.06,
        ease: "power4.out",
        delay: 0.1,
      });

      // 2. Supporting text & CTA cluster fade + translate up
      tl.fromTo(
        subtextRef.current,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7 },
        "-=0.5"
      );

      tl.fromTo(
        ctaClusterRef.current,
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7 },
        "-=0.55"
      );

      // 3. Baseline metadata rail reveal
      tl.fromTo(
        baselineRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.8 },
        "-=0.4"
      );

      // 4. Canvas crossfade over poster
      if (canvasReady) {
        tl.to(posterRef.current, { opacity: 0, duration: 0.4 }, "-=0.2");
        tl.to(canvasWrapperRef.current, { opacity: 1, duration: 0.5 }, "<");
      }
    }, heroRef);

    return () => ctx.revert();
  }, [canvasReady]);

  const addWordRef = (el: HTMLSpanElement | null) => {
    if (el && !headlineWordsRef.current.includes(el)) {
      headlineWordsRef.current.push(el);
    }
  };

  return (
    <div ref={heroRef} className="pactum-landing relative w-full overflow-hidden flex flex-col justify-between">
      {/* Skip Link for Accessibility (WCAG 2.2 AA) */}
      <a
        href="#hero-cta"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-black text-white rounded-[6px] text-xs font-mono"
      >
        Skip to primary workspace action
      </a>

      {/* 1. Header (DESIGN.md Section 3) */}
      <header className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 h-20 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-[5px] bg-[#111111] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs"
            aria-hidden="true"
          >
            P
          </span>
          <span className="font-semibold text-xl tracking-[-0.04em] text-[#111111]">
            PACTUM
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-xs font-mono">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] border border-[#111111]/10 bg-[#ECE9E2] text-[#5A5650]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Sandbox v2.4
          </span>
          <Link
            href="/login"
            className="px-4 py-2 rounded-full border border-[#111111]/15 hover:border-[#111111] hover:bg-[#111111] hover:text-white text-[#111111] font-medium transition-colors cursor-pointer"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* 2. Main Hero Grid Canvas Container */}
      <main className="relative w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 flex-1 flex flex-col justify-center py-6 sm:py-10 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center min-h-[580px] lg:min-h-[680px]">
          {/* Left Column (Cols 1-7): Oversized Editorial Typography */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 z-20">
            {/* Micro Caption */}
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.08em] text-[#5A5650]">
              <span className="w-2 h-0.5 bg-[#C43A1D]" />
              <span>Verified B2B Procurement Infrastructure</span>
            </div>

            {/* Oversized Headline with Masked Word Animation */}
            <h1 className="text-[44px] sm:text-[68px] lg:text-[88px] xl:text-[98px] font-semibold tracking-[-0.04em] leading-[0.96] text-[#111111]">
              <span className="hero-word-mask block">
                <span ref={addWordRef} className="hero-word">
                  Engineered
                </span>
              </span>{" "}
              <span className="hero-word-mask block">
                <span ref={addWordRef} className="hero-word">
                  For Certainty.
                </span>
              </span>
            </h1>

            {/* Supporting Paragraph */}
            <p
              ref={subtextRef}
              className="text-base sm:text-lg lg:text-[19px] leading-[1.55] text-[#5A5650] max-w-lg font-normal opacity-0"
            >
              Autonomous B2B procurement meets deterministic payment verification. Multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement.
            </p>

            {/* Action Buttons: High-Contrast Black Pill CTA */}
            <div
              ref={ctaClusterRef}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2 opacity-0"
            >
              <Link
                id="hero-cta"
                href="/login"
                className="pactum-pill-cta h-[52px] px-8 text-[15px]"
              >
                <span>Enter Workspace</span>
                <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
              </Link>

              <a
                href="#baseline-rail"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-mono uppercase tracking-wider text-[#5A5650] hover:text-[#111111] transition-colors"
              >
                <span>Explore Architecture</span>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Right Column (Cols 7-12): Cinematic 3D Sculpture & Basalt Framing */}
          <div className="lg:col-span-5 relative w-full h-[460px] sm:h-[540px] lg:h-[700px] flex items-center justify-center">
            {/* Static Matching Poster / Fallback */}
            <div
              ref={posterRef}
              className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
              aria-hidden="true"
            >
              <div className="w-56 h-80 rounded-[10px] bg-gradient-to-br from-[#ECE9E2] via-[#E2DFD8] to-[#CFCAC0] border border-[#111111]/15 shadow-xl rotate-[-12deg] skew-x-3 flex flex-col justify-between p-5">
                <div className="flex justify-between items-center text-[11px] font-mono text-[#5A5650]">
                  <span>PACTUM</span>
                  <span className="w-2 h-2 rounded-full bg-[#C43A1D]" />
                </div>
                <div className="font-mono text-xs text-center text-[#5A5650]">
                  AGREEMENT ARTIFACT
                </div>
                <div className="text-[10px] font-mono text-[#8A857D] truncate">
                  SHA-256 FLIGHT RECORDER
                </div>
              </div>
            </div>

            {/* WebGL Canvas */}
            <div
              ref={canvasWrapperRef}
              className="absolute inset-0 w-full h-full opacity-0 transition-opacity duration-500"
            >
              <HeroSculptureCanvas onLoaded={() => setCanvasReady(true)} />
            </div>

            {/* Floating Micro-Badge */}
            <div className="absolute right-2 bottom-4 sm:bottom-8 z-20 pointer-events-none hidden sm:block">
              <div className="px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-xs border border-[#111111]/10 text-[11px] font-mono uppercase tracking-wider text-[#5A5650] shadow-xs">
                &bull; Built For Verifiable B2B
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Baseline Metadata Rail (DESIGN.md Section 3) */}
      <footer
        id="baseline-rail"
        ref={baselineRef}
        className="pactum-baseline-rail w-full py-4 sm:py-5 z-20 opacity-0"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-[#5A5650]">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-[#C43A1D]" aria-hidden="true" />
            <span>Architecture: SHA-256 Merkle Engine</span>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            <span>Autonomous Mechanism Guardrail: Active</span>
          </div>

          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#111111]" aria-hidden="true" />
            <span>PayPal Orders v2 &bull; Audited Capture Gate</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
