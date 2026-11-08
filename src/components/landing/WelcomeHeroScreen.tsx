"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { HeroSculptureCanvas } from "./HeroSculptureCanvas";
import { LifecycleScrollSection } from "./LifecycleScrollSection";
import "./landing.css";

export function WelcomeHeroScreen() {
  const heroRef = useRef<HTMLDivElement>(null);
  const headlineWordsRef = useRef<HTMLSpanElement[]>([]);
  const subtextRef = useRef<HTMLParagraphElement>(null);
  const ctaClusterRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const [canvasReady, setCanvasReady] = useState(false);

  // GSAP Entrance Choreography (DESIGN.md Section 5 - Sequence 1)
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
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

      tl.to(headlineWordsRef.current, {
        y: "0%",
        opacity: 1,
        duration: 0.85,
        stagger: 0.06,
        ease: "power4.out",
        delay: 0.1,
      });

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

      tl.fromTo(
        baselineRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.8 },
        "-=0.4"
      );

      if (canvasReady) {
        tl.to(canvasWrapperRef.current, { opacity: 1, duration: 0.5 }, "-=0.2");
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
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-black text-white rounded-[4px] text-xs font-mono"
      >
        Skip to primary workspace action
      </a>

      {/* 1. Quiet Editorial Header */}
      <header className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 h-20 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <span
            className="w-7 h-7 rounded-[4px] bg-[#111111] text-[#F5F3EF] font-bold text-xs flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            P
          </span>
          <span className="font-semibold text-lg tracking-[-0.04em] text-[#111111]">
            PACTUM
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <Link
            href="/login"
            className="px-4 py-2 rounded-full border border-[#111111]/20 hover:border-[#111111] hover:bg-[#111111] hover:text-[#F5F3EF] text-[#111111] font-medium transition-colors cursor-pointer"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* 2. Main Hero Composition */}
      <main className="relative w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 flex-1 flex flex-col justify-center py-6 sm:py-12 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center min-h-[560px] lg:min-h-[660px]">
          {/* Left Column (Cols 1-7): Oversized Editorial Typography */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 z-20">
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

            {/* Supporting Statement */}
            <p
              ref={subtextRef}
              className="text-base sm:text-lg lg:text-[19px] leading-[1.55] text-[#5A5650] max-w-lg font-normal opacity-0"
            >
              Autonomous B2B procurement governed by deterministic mechanism design. Multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement.
            </p>

            {/* Action CTA: High-Contrast Black Pill */}
            <div
              ref={ctaClusterRef}
              className="pt-2 opacity-0"
            >
              <Link
                id="hero-cta"
                href="/login"
                className="pactum-pill-cta h-[52px] px-8 text-[15px]"
              >
                <span>Enter Workspace</span>
              </Link>
            </div>
          </div>

          {/* Right Column (Cols 7-12): 3D Agreement Sculpture Floating in Atmospheric Space */}
          <div className="lg:col-span-5 relative w-full h-[460px] sm:h-[540px] lg:h-[700px] flex items-center justify-center">
            <div
              ref={canvasWrapperRef}
              className="absolute inset-0 w-full h-full opacity-0 transition-opacity duration-500"
            >
              <HeroSculptureCanvas onLoaded={() => setCanvasReady(true)} />
            </div>
          </div>
        </div>
      </main>

      {/* 3. Baseline Metadata Rail */}
      <footer
        id="baseline-rail"
        ref={baselineRef}
        className="pactum-baseline-rail w-full py-4 sm:py-5 z-20 opacity-0"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-[#5A5650]">
          <div>Architecture: SHA-256 Merkle Engine</div>
          <div className="hidden md:block">Mechanism Guardrail: Deterministic Boulware &amp; Monotonicity</div>
          <div>PayPal Orders v2 &bull; Audited Capture Gate</div>
        </div>
      </footer>

      {/* 4. Cinematic Dark Editorial Section */}
      <LifecycleScrollSection />
    </div>
  );
}
