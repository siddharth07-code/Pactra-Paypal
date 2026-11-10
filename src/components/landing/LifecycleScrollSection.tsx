"use client";

import React, { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

const stages = [
  {
    number: "01",
    title: "Source",
    description:
      "Define the product, quantity and buying limits. Compare available supplier quotes before negotiation.",
    record: "Mandate and supplier quotes",
  },
  {
    number: "02",
    title: "Negotiate",
    description:
      "A Gemini buyer proposes terms within the mandate’s constraints. Policy checks can block proposals; deterministic fallback proposals are identified separately.",
    record: "Offer history and policy decisions",
  },
  {
    number: "03",
    title: "Audit",
    description:
      "ACWORLD checks the agreement and its supporting evidence. A recorded agreement alone does not mean the audit has passed.",
    record: "ACWORLD certificate and VeriPay evidence",
  },
  {
    number: "04",
    title: "Settle",
    description:
      "After buyer approval at PayPal, the server requests authorization of the Sandbox order. Capture is a separate operation, subject to server-side audit and settlement checks.",
    record: "Authorization and capture references",
  },
];

export function LifecycleScrollSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const workflowRef = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      // In SSR or JSDOM environments without RAF, bypass ScrollTrigger listeners
      if (
        typeof window === "undefined" ||
        typeof window.requestAnimationFrame !== "function"
      ) {
        return;
      }

      gsap.registerPlugin(ScrollTrigger);

      // Respect user's motion preferences
      const prefersReducedMotion =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) {
        return;
      }

      // 1. Seamless Lavender to Charcoal Scroll-Driven Wipe & Heading Reveal
      const transitionTl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 96%",
          end: "top 30%",
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });

      // Subtle vertical mask / layered wipe reveal of dark section
      transitionTl.fromTo(
        sectionRef.current,
        { clipPath: "inset(48px 0% 0% 0%)" },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          ease: "none",
          duration: 0.35,
          immediateRender: false,
        },
        0
      );

      // Atmospheric seam glow & hairline entrance
      transitionTl.fromTo(
        ".landing-process-seam-glow",
        { opacity: 0, scaleY: 0.5 },
        { opacity: 1, scaleY: 1, ease: "none", duration: 0.35, immediateRender: false },
        0
      );

      transitionTl.fromTo(
        ".landing-process-seam-line",
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, ease: "none", duration: 0.4, immediateRender: false },
        0.05
      );

      // Masked upward reveal of heading lines
      transitionTl.fromTo(
        ".process-title-line",
        { yPercent: 110, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          stagger: 0.1,
          ease: "power2.out",
          duration: 0.45,
          immediateRender: false,
        },
        0.2
      );

      // Supporting intro text reveal
      transitionTl.fromTo(
        ".process-intro-text",
        { y: 22, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          ease: "power2.out",
          duration: 0.4,
          immediateRender: false,
        },
        0.38
      );

      // 2. Staggered Source -> Negotiate -> Audit -> Settle rows
      // Triggered as the workflow enters the viewport, fully reversible when scrolling upward
      const rowsTl = gsap.timeline({
        scrollTrigger: {
          trigger: workflowRef.current,
          start: "top 85%",
          end: "top 25%",
          toggleActions: "play reverse play reverse",
          invalidateOnRefresh: true,
        },
      });

      rowsTl.fromTo(
        ".landing-workflow-item",
        { y: 32, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.65,
          ease: "power3.out",
          stagger: 0.12,
          immediateRender: false,
        }
      );

      return () => {
        transitionTl.scrollTrigger?.kill();
        transitionTl.kill();
        rowsTl.scrollTrigger?.kill();
        rowsTl.kill();
      };
    },
    { scope: sectionRef }
  );

  return (
    <section
      id="lifecycle-section"
      ref={sectionRef}
      className="landing-process"
      aria-labelledby="process-title"
    >
      <div className="landing-process-transition-seam" aria-hidden="true">
        <div className="landing-process-seam-glow" />
        <div className="landing-process-seam-line" />
      </div>
      <div className="landing-container">
        <div className="landing-section-intro">
          <h2 id="process-title" className="process-headline">
            <span className="process-title-mask">
              <span className="process-title-line">One request.</span>
            </span>
            <br />
            <span className="process-title-mask">
              <span className="process-title-line">A traceable path.</span>
            </span>
          </h2>
          <p className="process-intro-text">
            From the first supplier quote to the settlement decision, keep the
            commercial terms and the record behind them together.
          </p>
        </div>
        <ol
          ref={workflowRef}
          className="landing-workflow"
          aria-label="Procurement lifecycle"
        >
          {stages.map((stage) => (
            <li key={stage.number} className="landing-workflow-item">
              <span className="landing-step-number" aria-hidden="true">
                {stage.number}
              </span>
              <h3>{stage.title}</h3>
              <div>
                <p>{stage.description}</p>
                <p className="landing-record">{stage.record}</p>
              </div>
            </li>
          ))}
        </ol>
        <details className="landing-method">
          <summary>How the checks work</summary>
          <div>
            <p>
              Negotiation checks include budget and delivery limits, return
              requirements, private-price disclosure, Boulware utility
              thresholds and price monotonicity. Model output is a proposal, not
              an approval.
            </p>
            <p>
              ACWORLD evaluates SKU integrity, price arithmetic, return policy,
              delivery and Merkle root consistency. VeriPay records
              cryptographic evidence; a hash does not replace commercial
              verification.
            </p>
            <p>
              PayPal Orders v2 uses AUTHORIZE intent. Order metadata binds the
              evidence root and session through <code>custom_id</code>. Evidence
              packaged for a dispute remains local unless an actual provider
              submission is confirmed.
            </p>
          </div>
        </details>
        <p className="landing-disclosure">
          Demonstration catalog entries are sample offers, not live supplier
          commitments. This page displays no live procurement or payment status.
        </p>
        <div className="landing-closing">
          <div>
            <h2>Start with a mandate.</h2>
            <p>Bring your buying requirements into the workspace.</p>
          </div>
          <div className="landing-actions">
            <Link
              id="lifecycle-cta"
              href="/workspace"
              className="landing-button"
            >
              Open workspace
            </Link>
            <Link href="/register" className="landing-text-link">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
