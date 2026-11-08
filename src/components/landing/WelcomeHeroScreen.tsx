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
    media.add("(min-width: 1000px) and (min-height: 720px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.set(pageRef.current, { attr: { "data-enhanced": "true" } });
      const timeline = gsap.timeline({ scrollTrigger: { trigger: ".cinema-chapter", start: "top top", end: "bottom bottom", scrub: .6, invalidateOnRefresh: true } });
      timeline.to(".cinema-preview", { width: "58%", xPercent: 72.4, ease: "none", duration: 1 }, 0)
        .from(".cinema-story", { autoAlpha: 0, y: 32, duration: .6 }, .25)
        .to(".cinema-rail", { autoAlpha: 0, width: 0, padding: 0, duration: .5 }, 0)
        .to(".cinema-interface", { gap: 0, duration: .5 }, 0)
        .from(".cinema-confirm", { autoAlpha: 0, y: 12, duration: .4 }, .6);
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
          <div className="cinema-caption"><span>Introducing the procurement workspace</span><span>01 / 04</span></div>
          <div className="cinema-scene">
            <div className="cinema-story">
              <p className="cinema-kicker">01 / Procurement mandate</p>
              <h2 id="mandate-title">Clarity before<br />the first offer.</h2>
              <p>Transform a business requirement into a structured mandate. Define the limits, record the conditions, and give negotiation a clear starting point.</p>
            </div>
            <div className="cinema-preview" role="group" aria-label="Illustrative procurement mandate">
              <div className="cinema-toolbar"><span>Procurement workspace</span><span className="cinema-sample">Illustrative workflow</span></div>
              <div className="cinema-interface">
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
            </div>
          </div>
          <div className="cinema-controls"><span>Sample workflow / Chapter 01</span><div><button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Resume motion" : "Pause motion"}</button><button type="button" onClick={() => { setPaused(false); setReplay(value => value + 1); window.scrollTo({ top: 0, behavior: "instant" }); }}>Replay entrance</button></div></div>
        </div>
      </section>
      <LifecycleScrollSection />
    </main>
    <footer className="landing-footer"><div className="landing-container"><span className="landing-brand">PACTUM</span><p>Procurement, evidence and settlement.</p><a href="#welcome-main" className="landing-text-link">Back to top</a></div></footer>
  </div>;
}
