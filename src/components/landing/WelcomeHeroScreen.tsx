"use client";

import React, { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import Image from "next/image";
import { HeroIllustration } from "./HeroIllustration";
import { LifecycleScrollSection } from "./LifecycleScrollSection";
import "./landing.css";

const fields = [
  ["Category", "Office equipment"], ["Approval", "Policy required"],
  ["Budget", "Buyer-defined limit"], ["Delivery", "Defined by buyer"],
];

export function WelcomeHeroScreen() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  useGSAP(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (paused) return;
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
    media.add("(min-width: 1000px) and (min-height: 900px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.set(pageRef.current, { attr: { "data-enhanced": "true" } });
      const panels = pageRef.current?.querySelectorAll<HTMLElement>("[data-scene]");
      const setScene = (scene: "mandate" | "negotiation" | "audit" | "settlement") => panels?.forEach(panel => {
        const hidden = panel.dataset.scene !== scene;
        if (hidden && panel.contains(document.activeElement)) {
          pageRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed]")?.focus({ preventScroll: true });
        }
        panel.inert = hidden;
        panel.setAttribute("aria-hidden", String(hidden));
        panel.style.pointerEvents = hidden ? "none" : "auto";
      });
      setScene("mandate");

      gsap.set('.cinema-story:not([data-scene="mandate"])', { autoAlpha: 0, pointerEvents: "none" });
      gsap.set('.cinema-panels > :not([data-scene="mandate"])', { autoAlpha: 0, pointerEvents: "none" });
      gsap.set('[data-scene="mandate"]', { autoAlpha: 1, pointerEvents: "auto" });

      const timeline = gsap.timeline({
        onUpdate: () => setScene(
          timeline.time() >= 5.65 ? "settlement" :
          timeline.time() >= 3.05 ? "audit" :
          timeline.time() >= 1.75 ? "negotiation" : "mandate"
        ),
        scrollTrigger: {
          trigger: ".cinema-chapter",
          start: "top top",
          end: "bottom bottom",
          scrub: .6,
          invalidateOnRefresh: true,
        }
      });
      timeline.to(".cinema-preview", { width: "58%", xPercent: 72.4, ease: "none", duration: 1 }, 0)
        .from('.cinema-story[data-scene="mandate"]', { autoAlpha: 0, y: 32, duration: .6 }, .25)
        .to(".cinema-rail", { autoAlpha: 0, width: 0, padding: 0, duration: .5 }, 0)
        .to(".cinema-interface", { gap: 0, duration: .5 }, 0)
        .from(".cinema-confirm", { autoAlpha: 0, y: 12, duration: .4 }, .6)
        .to({}, { duration: .4 })
        .to('[data-scene="mandate"]', { autoAlpha: 0, y: -16, duration: .3, pointerEvents: "none" }, 1.45)
        .fromTo('[data-scene="negotiation"]', { autoAlpha: 0, y: 20, pointerEvents: "none" }, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: .4, immediateRender: false }, 1.75)
        .from(".cinema-offer", { x: 16, opacity: 0, stagger: .12, duration: .35 }, 1.8)
        .from(".cinema-terms", { y: 12, opacity: 0, duration: .35 }, 2.25)
        .to({}, { duration: .4 })
        .to('[data-scene="negotiation"]', { autoAlpha: 0, y: -16, duration: .3, pointerEvents: "none" }, 2.75)
        .fromTo('[data-scene="audit"]', { autoAlpha: 0, y: 20, pointerEvents: "none" }, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: .4, immediateRender: false }, 3.05)
        .from(".cinema-agreement", { y: 12, opacity: 0, duration: .35 }, 3.15)
        .from(".cinema-audit-check", { opacity: 0, x: 12, stagger: .15, duration: .3 }, 3.5)
        .from(".cinema-evidence-leaves", { opacity: 0, duration: .3 }, 4)
        .from(".cinema-evidence-join", { scaleY: 0, transformOrigin: "top", duration: .3 }, 4.2)
        .from(".cinema-evidence-root", { opacity: 0, duration: .3 }, 4.5)
        .from(".cinema-audit-result", { opacity: 0, y: 8, duration: .35 }, 4.8)
        .to('[data-scene="audit"]', { autoAlpha: 0, y: -16, duration: .3, pointerEvents: "none" }, 5.35)
        .fromTo('[data-scene="settlement"]', { autoAlpha: 0, y: 20, pointerEvents: "none" }, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: .4, immediateRender: false }, 5.65)
        .from(".cinema-payment-approval", { opacity: 0, y: 12, duration: .35 }, 6.05)
        .from(".cinema-payment-step", { opacity: 0, x: 12, stagger: .3, duration: .35 }, 6.4)
        .from(".cinema-payment-outcome", { opacity: 0, y: 8, duration: .35 }, 7.45)
        .to({}, { duration: .6 });

      return () => {
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
  }, { scope: pageRef, dependencies: [paused, replay], revertOnUpdate: true });

  return <div ref={pageRef} className="pactum-landing pactum-cinema" data-motion={paused ? "paused" : "enabled"}>
    <a href="#welcome-main" className="landing-skip">Skip to main content</a>
    <header className="landing-container landing-header">
      <span className="landing-brand"><span aria-hidden="true" className="landing-monogram"><Image src="/brand/pactra-mark.png" alt="" width={28} height={28} className="w-full h-full object-contain" priority /></span>PACTRA</span>
      <nav aria-label="Main navigation">
        <Link href="/register" className="landing-text-link landing-register">Create account</Link>
        <Link href="/login" className="landing-sign-in">Sign in</Link>
      </nav>
    </header>
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
          <p className="landing-demo-note">A B2B procurement workspace with PayPal Sandbox settlement.</p>
        </div>
        <HeroIllustration />
      </section>
      <section id="procurement-mandate" className="cinema-chapter" aria-labelledby="mandate-title">
        <div className="cinema-transition-seam" aria-hidden="true">
          <div className="cinema-seam-glow" />
          <div className="cinema-seam-line" />
        </div>
        <div className="landing-container cinema-sticky">
          <div className="cinema-caption"><span>Introducing the procurement workspace</span><span>Scenes 01 + 02 + 03 + 04</span></div>
          <div className="cinema-scene">
            <div className="cinema-story" data-scene="mandate">
              <p className="cinema-kicker">01 / Procurement mandate</p>
              <h2 id="mandate-title">Clarity before<br />the first offer.</h2>
              <p>Transform a business requirement into a structured mandate. Define the limits, record the conditions, and give negotiation a clear starting point.</p>
            </div>
            <div className="cinema-story cinema-negotiation-story" data-scene="negotiation">
              <p className="cinema-kicker">02 / AI negotiation</p>
              <h2 id="negotiation-title">Compare the offer.<br />Keep the boundaries.</h2>
              <p>Evaluate supplier proposals against the mandate, then review a counteroffer with the conditions still in view.</p>
            </div>
            <div className="cinema-story cinema-audit-story" data-scene="audit">
              <p className="cinema-kicker">03 / Audit verification</p>
              <h2 id="audit-title">Keep the terms.<br />Trace the evidence.</h2>
              <p>Bring the draft agreement and its policy checks into one record. SHA-256 Merkle evidence helps check record integrity; commercial review still matters.</p>
            </div>
            <div className="cinema-story cinema-settlement-story" data-scene="settlement">
              <p className="cinema-kicker">04 / PayPal settlement</p>
              <h2 id="settlement-title">Approval first.<br />Then payment.</h2>
              <p>Carry the reviewed terms into PayPal Sandbox checkout. Buyer approval, authorization and capture are separate steps, each requiring its own confirmation.</p>
            </div>
            <div className="cinema-preview" role="group" aria-label="Illustrative procurement mandate">
              <div className="cinema-toolbar"><span>Procurement workspace</span><span className="cinema-sample">Illustrative workflow</span></div>
              <div className="cinema-panels">
              <div className="cinema-interface" data-scene="mandate">
                <div className="cinema-info">
                  <p className="cinema-label">01 / Define the requirement</p>
                  <h3>One clear brief.<br />Every constraint accounted for.</h3>
                  <p className="cinema-sub">Sample requirements. No live procurement or payment activity.</p>
                  <dl className="cinema-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                  <div className="cinema-confirm"><span aria-hidden="true">✓</span><p>Mandate defined<span>Ready for supplier evaluation in this example.</span></p></div>
                </div>
                <aside className="cinema-rail" aria-label="Agreement lifecycle preview">
                  <p>Agreement lifecycle</p>
                  <ol>{["Define procurement", "Negotiate terms", "Verify evidence", "Authorize payment"].map((step, index) => <li key={step} className={index === 0 ? "is-current" : ""}><span aria-hidden="true">0{index + 1}</span>{step}</li>)}</ol>
                  <p className="cinema-rail-note">Your requirements set the boundaries.</p>
                </aside>
              </div>
              <section className="cinema-negotiation" data-scene="negotiation" aria-labelledby="offers-title">
                <p className="cinema-label">02 / Evaluate and negotiate</p>
                <h3 id="offers-title">Terms shaped by the mandate.</h3>
                <p className="cinema-sub">Illustrative supplier offers and negotiated terms. All amounts and checks below are sample data, not live activity.</p>
                <p className="cinema-policy">Example mandate: 20 office chairs · USD 4,000 limit · delivery within 10 days · buyer approval required.</p>
                <ul className="cinema-offers" aria-label="Sample supplier offers">
                  <li className="cinema-offer"><div><strong>Sample supplier A</strong><span>USD 3,800 · 8 days</span></div><p>Within example budget and delivery limits.</p></li>
                  <li className="cinema-offer"><div><strong>Sample supplier B</strong><span>USD 3,600 · 14 days</span></div><p>Delivery exceeds the example limit. Request revised terms.</p></li>
                </ul>
                <div className="cinema-terms">
                  <p className="cinema-label">Illustrative negotiation / Supplier A</p>
                  <h4>Draft terms for buyer review</h4>
                  <dl><div><dt>Opening offer</dt><dd>USD 3,800</dd></div><div><dt>Negotiated draft</dt><dd>USD 3,700 · 8 days</dd></div></dl>
                  <p>Example policy checks: budget within limit; delivery within limit. Buyer approval remains required.</p>
                </div>
                <p className="cinema-review-note">This demonstration does not contact suppliers or approve an agreement.</p>
                <Link href="/workspace" className="landing-text-link">Create your procurement mandate</Link>
              </section>
              <section className="cinema-audit" data-scene="audit" aria-labelledby="agreement-title">
                <p className="cinema-label">03 / Agreement verification · Illustrative demo</p>
                <h3 id="agreement-title">A draft with a traceable record.</h3>
                <p className="cinema-sub">Sample verification only. No agreement is created and no cryptographic verification is executed here.</p>
                <div className="cinema-agreement">
                  <h4>Draft agreement / Sample supplier A</h4>
                  <p>20 office chairs · USD 3,700 · delivery in 8 days</p>
                  <p>Buyer approval pending · payment not authorized</p>
                </div>
                <ul className="cinema-audit-checks" aria-label="Illustrative agreement policy checks">
                  <li className="cinema-audit-check"><span>Budget / USD 4,000 limit</span><strong>Sample pass</strong></li>
                  <li className="cinema-audit-check"><span>Delivery / 10-day limit</span><strong>Sample pass</strong></li>
                  <li className="cinema-audit-check"><span>Buyer approval</span><strong>Still required</strong></li>
                </ul>
                <figure className="cinema-evidence" aria-labelledby="evidence-caption">
                  <figcaption id="evidence-caption">SHA-256 / Merkle evidence, simplified</figcaption>
                  <div className="cinema-evidence-leaves"><span>Mandate record</span><span>Draft terms</span></div>
                  <div className="cinema-evidence-join" aria-hidden="true" />
                  <div className="cinema-evidence-root">Combined evidence root <span>Diagram only · no computed hash</span></div>
                  <p>Recorded events become leaf hashes, combined into a Merkle root. Inclusion proofs can check whether a record belongs to that root.</p>
                </figure>
                <div className="cinema-audit-result">
                  <h4>Audit-verified / Illustrative state</h4>
                  <p>Example evidence integrity: shown as valid. Buyer approval and PayPal Sandbox settlement remain separate steps.</p>
                </div>
              </section>
              <section className="cinema-settlement" data-scene="settlement" aria-labelledby="payment-title">
                <p className="cinema-label">04 / PayPal settlement · Illustrative demo</p>
                <h3 id="payment-title">From reviewed terms to payment.</h3>
                <p className="cinema-sub">All amounts and statuses are examples. Scrolling does not approve the agreement, open checkout or make a payment.</p>
                <div className="cinema-payment-approval">
                  <h4>Buyer approval / Pending in this example</h4>
                  <p>Sample supplier A · 20 office chairs</p>
                  <p>USD 3,700 · delivery in 8 days</p>
                  <p>Audit evidence shown as valid. Buyer approval still required.</p>
                </div>
                <ol className="cinema-payment-steps" aria-label="Conditional PayPal payment sequence">
                  <li className="cinema-payment-step">
                    <h4>Create order, then buyer approves at PayPal</h4>
                    <p>After agreement approval, create an Orders v2 order with AUTHORIZE intent. The buyer then approves it separately at PayPal.</p>
                    <span>Example status / Not started</span>
                  </li>
                  <li className="cinema-payment-step">
                    <h4>Authorize the approved order</h4>
                    <p>Orders v2 reserves funds if authorization succeeds. It does not capture them or confirm settlement.</p>
                    <span>Example status / Not authorized</span>
                  </li>
                  <li className="cinema-payment-step">
                    <h4>Capture the authorization later</h4>
                    <p>A separate Payments v2 capture uses the authorization ID. A pending or failed result is not a completed payment.</p>
                    <span>Example status / Not captured</span>
                  </li>
                </ol>
                <div className="cinema-payment-outcome">
                  <h4>Settlement / Awaiting payment confirmation</h4>
                  <p>No funds move in this demonstration. Only a confirmed completed capture records payment; seller funds may still be held.</p>
                  <Link href="/workspace" className="landing-text-link">Review settlement in your workspace</Link>
                </div>
              </section>
              </div>
            </div>
          </div>
          <div className="cinema-controls"><span>Sample workflow / Chapters 01 + 02 + 03 + 04</span><div><button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Resume motion" : "Pause motion"}</button><button type="button" onClick={() => { setPaused(false); setReplay(value => value + 1); window.scrollTo({ top: 0, behavior: "instant" }); }}>Replay entrance</button></div></div>
        </div>
      </section>
      <LifecycleScrollSection />
    </main>
    <footer className="landing-footer"><div className="landing-container"><span className="landing-brand"><span aria-hidden="true" className="landing-monogram"><Image src="/brand/pactra-mark.png" alt="" width={28} height={28} className="w-full h-full object-contain" /></span>PACTRA</span><p>Procurement, evidence and settlement.</p><a href="#welcome-main" className="landing-text-link">Back to top</a></div></footer>
  </div>;
}
