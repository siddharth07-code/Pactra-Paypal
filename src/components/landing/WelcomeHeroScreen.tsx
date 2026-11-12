"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { HeroIllustration } from "./HeroIllustration";
import { createWorkflowTrace, WorkflowIllustration } from "./workflow/WorkflowIllustration";
import "./landing.css";

export function WelcomeHeroScreen() {
  const pageRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".cinema-entrance", { y: 18, opacity: 0, stagger: .1, duration: .8, ease: "power3.out" });

      // In environments without RAF or ScrollTrigger support, bypass scroll listeners
      if (
        typeof window === "undefined" ||
        typeof window.requestAnimationFrame !== "function"
      ) {
        return;
      }

      // Hero Recession and Workspace Mask Transition
      const heroTransitionTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".cinema-chapter",
          start: "top 98%",
          end: "top top",
          scrub: 0.5,
          invalidateOnRefresh: true,
          onLeave: () => {
            gsap.set(".cinema-chapter", { clearProps: "clipPath" });
          },
          onEnterBack: () => {
            gsap.set(".cinema-chapter", { clipPath: "inset(0% 0% 0% 0%)" });
          },
        },
      });

      // Subtly recede the hero as user scrolls downward toward workspace
      heroTransitionTl.fromTo(
        ".cinema-hero",
        { scale: 1, y: 0, opacity: 1 },
        {
          scale: 0.965,
          y: -36,
          opacity: 0.12,
          ease: "none",
          duration: 1,
          immediateRender: false,
        },
        0
      );

      // Reveal the lavender procurement workspace through a refined vertical mask
      heroTransitionTl.fromTo(
        ".cinema-chapter",
        { clipPath: "inset(44px 0% 0% 0%)" },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          ease: "none",
          duration: 1,
          immediateRender: false,
        },
        0
      );

      // Atmospheric transition seam line
      heroTransitionTl.fromTo(
        ".cinema-seam-line",
        { scaleX: 0.25, opacity: 0 },
        {
          scaleX: 1,
          opacity: 1,
          ease: "none",
          duration: 0.65,
          immediateRender: false,
        },
        0
      );

      heroTransitionTl.to(
        ".cinema-seam-line",
        { opacity: 0, ease: "none", duration: 0.35 },
        0.65
      );

      // Horizon seam ambient glow
      heroTransitionTl.fromTo(
        ".cinema-seam-glow",
        { opacity: 0, scaleY: 0.4 },
        {
          opacity: 0.85,
          scaleY: 1,
          ease: "none",
          duration: 0.65,
          immediateRender: false,
        },
        0
      );

      heroTransitionTl.to(
        ".cinema-seam-glow",
        { opacity: 0, ease: "none", duration: 0.35 },
        0.65
      );
    });
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(pageRef.current, { attr: { "data-enhanced": "true" } });
      const panels = pageRef.current?.querySelectorAll<HTMLElement>("[data-scene]");
      const traces = new Map<string, gsap.core.Timeline>();
      const listeners = new AbortController();
      for (const panel of panels ?? []) {
        const trace = createWorkflowTrace(panel);
        traces.set(panel.dataset.scene!, trace);
        panel.querySelector(".workflow-play")?.addEventListener("click", () => trace.restart(), { signal: listeners.signal });
      }

      let activeTrace: gsap.core.Timeline | undefined;
      const setScene = (scene: "mandate" | "negotiation" | "audit" | "settlement", inView = false) => {
        panels?.forEach(panel => {
          const hidden = panel.dataset.scene !== scene;
          if (hidden && panel.contains(document.activeElement)) {
            pageRef.current?.querySelector<HTMLElement>("#procurement-mandate")?.focus({ preventScroll: true });
          }
          panel.inert = hidden;
          panel.setAttribute("aria-hidden", String(hidden));
          panel.style.pointerEvents = hidden ? "none" : "auto";
        });

        const nextTrace = inView ? traces.get(scene) : undefined;
        if (nextTrace !== activeTrace) {
          activeTrace?.pause(0);
          activeTrace = nextTrace;
          activeTrace?.restart();
        }
      };
      setScene("mandate");

      gsap.set('.cinema-story:not([data-scene="mandate"])', { autoAlpha: 0, pointerEvents: "none" });
      gsap.set('[data-scene="mandate"]', { autoAlpha: 1, pointerEvents: "auto" });

      const timeline = gsap.timeline({
        onUpdate: () => setScene(
          timeline.time() >= 5.65 ? "settlement" :
          timeline.time() >= 3.05 ? "audit" :
          timeline.time() >= 1.75 ? "negotiation" : "mandate",
          timeline.time() >= .25
        ),
        scrollTrigger: {
          trigger: ".cinema-chapter",
          start: "top top",
          end: "bottom bottom",
          scrub: .6,
          invalidateOnRefresh: true,
        }
      });
      timeline.from('.cinema-story[data-scene="mandate"]', { autoAlpha: 0, y: 32, duration: .6 }, .25)
        .to('[data-scene="mandate"]', { autoAlpha: 0, y: -16, duration: .3, pointerEvents: "none" }, 1.45)
        .fromTo('[data-scene="negotiation"]', { autoAlpha: 0, y: 20, pointerEvents: "none" }, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: .4, immediateRender: false }, 1.75)
        .to('[data-scene="negotiation"]', { autoAlpha: 0, y: -16, duration: .3, pointerEvents: "none" }, 2.75)
        .fromTo('[data-scene="audit"]', { autoAlpha: 0, y: 20, pointerEvents: "none" }, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: .4, immediateRender: false }, 3.05)
        .to('[data-scene="audit"]', { autoAlpha: 0, y: -16, duration: .3, pointerEvents: "none" }, 5.35)
        .fromTo('[data-scene="settlement"]', { autoAlpha: 0, y: 20, pointerEvents: "none" }, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: .4, immediateRender: false }, 5.65)
        // Preserve the original total duration after removing diagram-only tweens.
        .to({}, { duration: .6 }, 7.8);

      return () => {
        listeners.abort();
        pageRef.current?.removeAttribute("data-enhanced");
        panels?.forEach(panel => {
          panel.inert = false;
          panel.removeAttribute("aria-hidden");
          panel.style.removeProperty("opacity");
          panel.style.removeProperty("visibility");
          panel.style.removeProperty("pointer-events");
          panel.style.removeProperty("transform");
        });
      };
    });
    return () => media.revert();
  }, { scope: pageRef });

  return <div ref={pageRef} className="pactum-landing pactum-cinema" data-motion="enabled">
    <a href="#welcome-main" className="landing-skip">Skip to main content</a>
    <LandingHeader currentPage="home" />
    <main id="welcome-main" tabIndex={-1}>
      <section className="landing-container cinema-hero" aria-labelledby="welcome-title">
        <div className="cinema-hero-copy">
          <p className="cinema-kicker cinema-entrance">A new standard for procurement</p>
          <h1 id="welcome-title" className="cinema-entrance">From intent.<br />To <em>agreement.</em></h1>
          <p className="cinema-lead cinema-entrance">Procurement, negotiation, verification and payment, connected by workflows and governed by your rules.</p>
          <div className="landing-actions cinema-entrance">
            <Link id="hero-cta" href="/workspace" className="landing-button">Open workspace</Link>
            <a href="#procurement-mandate" className="landing-text-link">Experience the workflow</a>
          </div>
        </div>
        <HeroIllustration />
      </section>
      <section id="procurement-mandate" className="cinema-chapter cinema-text-workflow" tabIndex={-1} aria-labelledby="mandate-title">
        <div className="cinema-transition-seam" aria-hidden="true">
          <div className="cinema-seam-glow" />
          <div className="cinema-seam-line" />
        </div>
        <div className="landing-container cinema-sticky">
          <div className="cinema-scene">
            <section className="cinema-story" data-scene="mandate" aria-labelledby="mandate-title">
              <div className="workflow-copy">
                <h2 id="mandate-title">Define procurement requirements</h2>
                <p>Set your budget, delivery expectations, and supplier criteria. PACTRA structures these requirements into a clear procurement mandate.</p>
              </div>
              <WorkflowIllustration scene="mandate" />
            </section>
            <section className="cinema-story cinema-negotiation-story" data-scene="negotiation" aria-labelledby="negotiation-title">
              <div className="workflow-copy">
                <h2 id="negotiation-title">Negotiate supplier terms</h2>
                <p>Compare supplier offers and negotiate better terms with AI assistance. Every proposal is checked against your purchasing limits.</p>
              </div>
              <WorkflowIllustration scene="negotiation" />
            </section>
            <section className="cinema-story cinema-audit-story" data-scene="audit" aria-labelledby="audit-title">
              <div className="workflow-copy">
                <h2 id="audit-title">Verify agreement compliance</h2>
                <p>Verify negotiated terms against business policies. Cryptographic evidence creates an auditable record of the agreement.</p>
              </div>
              <WorkflowIllustration scene="audit" />
            </section>
            <section className="cinema-story cinema-settlement-story" data-scene="settlement" aria-labelledby="settlement-title">
              <div className="workflow-copy">
                <h2 id="settlement-title">Process approved payments</h2>
                <p>Move verified agreements toward settlement through PayPal. Buyer approval and payment checks keep the process controlled.</p>
              </div>
              <WorkflowIllustration scene="settlement" />
            </section>
          </div>
        </div>
      </section>
    </main>
  </div>;
}
