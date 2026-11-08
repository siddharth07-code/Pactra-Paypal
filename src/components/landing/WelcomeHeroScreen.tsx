"use client";

import React, { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
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
    });
    media.add("(min-width: 1000px) and (min-height: 900px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.set(pageRef.current, { attr: { "data-enhanced": "true" } });
      const panels = pageRef.current?.querySelectorAll<HTMLElement>("[data-scene]");
      const setScene = (negotiation: boolean) => panels?.forEach(panel => {
        const hidden = (panel.dataset.scene === "negotiation") !== negotiation;
        panel.inert = hidden;
        panel.setAttribute("aria-hidden", String(hidden));
      });
      setScene(false);
      const timeline = gsap.timeline({ onUpdate: () => setScene(timeline.time() >= 1.75), scrollTrigger: { trigger: ".cinema-chapter", start: "top top", end: "bottom bottom", scrub: .6, invalidateOnRefresh: true } });
      timeline.to(".cinema-preview", { width: "58%", xPercent: 72.4, ease: "none", duration: 1 }, 0)
        .from(".cinema-story", { autoAlpha: 0, y: 32, duration: .6 }, .25)
        .to(".cinema-rail", { autoAlpha: 0, width: 0, padding: 0, duration: .5 }, 0)
        .to(".cinema-interface", { gap: 0, duration: .5 }, 0)
        .from(".cinema-confirm", { autoAlpha: 0, y: 12, duration: .4 }, .6)
        .to({}, { duration: .4 })
        .to('[data-scene="mandate"]', { autoAlpha: 0, y: -16, duration: .3 }, 1.45)
        .fromTo('[data-scene="negotiation"]', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: .4 }, 1.75)
        .from(".cinema-offer", { x: 16, opacity: 0, stagger: .12, duration: .35 }, 1.8)
        .from(".cinema-terms", { y: 12, opacity: 0, duration: .35 }, 2.25)
        .to({}, { duration: .4 });
      return () => panels?.forEach(panel => { panel.inert = false; panel.removeAttribute("aria-hidden"); });
    });
    return () => media.revert();
  }, { scope: pageRef, dependencies: [paused, replay], revertOnUpdate: true });

  return <div ref={pageRef} className="pactum-landing pactum-cinema" data-motion={paused ? "paused" : "enabled"}>
    <a href="#welcome-main" className="landing-skip">Skip to main content</a>
    <header className="landing-container landing-header">
      <span className="landing-brand"><span aria-hidden="true" className="landing-monogram">P</span>PACTUM</span>
      <nav aria-label="Main navigation">
        <Link href="/register" className="landing-text-link landing-register">Create account</Link>
        <Link href="/login" className="landing-sign-in">Sign in</Link>
      </nav>
    </header>
    <main id="welcome-main" tabIndex={-1}>
      <section className="landing-container cinema-hero" aria-labelledby="welcome-title">
        <p className="cinema-kicker cinema-entrance">A new standard for procurement</p>
        <h1 id="welcome-title" className="cinema-entrance">From intent.<br />To <em>agreement.</em></h1>
        <p className="cinema-lead cinema-entrance">Procurement, negotiation, verification and payment, connected by workflows and governed by your rules.</p>
        <div className="landing-actions cinema-entrance">
          <Link id="hero-cta" href="/workspace" className="landing-button">Open workspace</Link>
          <a href="#procurement-mandate" className="landing-text-link">Experience the workflow</a>
        </div>
        <p className="landing-demo-note">A B2B procurement workspace with PayPal Sandbox settlement.</p>
      </section>
      <section id="procurement-mandate" className="cinema-chapter" aria-labelledby="mandate-title">
        <div className="landing-container cinema-sticky">
          <div className="cinema-caption"><span>Introducing the procurement workspace</span><span>Scenes 01 + 02</span></div>
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
              </div>
            </div>
          </div>
          <div className="cinema-controls"><span>Sample workflow / Chapters 01 + 02</span><div><button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Resume motion" : "Pause motion"}</button><button type="button" onClick={() => { setPaused(false); setReplay(value => value + 1); window.scrollTo({ top: 0, behavior: "instant" }); }}>Replay entrance</button></div></div>
        </div>
      </section>
      <LifecycleScrollSection />
    </main>
    <footer className="landing-footer"><div className="landing-container"><span className="landing-brand">PACTUM</span><p>Procurement, evidence and settlement.</p><a href="#welcome-main" className="landing-text-link">Back to top</a></div></footer>
  </div>;
}
