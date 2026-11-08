"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LifecycleScrollSection } from "./LifecycleScrollSection";
import "./landing.css";

const HeroSculptureCanvas = dynamic(() => import("./HeroSculptureCanvas").then(module => module.HeroSculptureCanvas), {
  ssr: false,
  loading: () => <span className="landing-sculpture-placeholder" aria-hidden="true">Mandate / Terms / Evidence</span>,
});

export function WelcomeHeroScreen() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useGSAP(() => {
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".landing-header", { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: .65, ease: "power2.out" });
      gsap.fromTo(".landing-title-line", { yPercent: 105, rotate: 2 }, { yPercent: 0, rotate: 0, stagger: .12, duration: 1.15, ease: "power4.out", delay: .15 });
      gsap.fromTo(".landing-hero-copy > p, .landing-hero-copy > .landing-actions", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .8, stagger: .1, delay: .55, ease: "power3.out" });
      pageRef.current?.querySelectorAll(".landing-workflow li, .landing-section-intro, .landing-closing").forEach(element => {
        gsap.fromTo(element, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: .8, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 92%", once: true } });
      });
    });
    return () => media.revert();
  }, { scope: pageRef });
  return <div ref={pageRef} className="pactum-landing">
    <a href="#welcome-main" className="landing-skip">Skip to main content</a>
    <header className="landing-container landing-header">
      <span className="landing-brand"><span aria-hidden="true" className="landing-monogram">P</span>PACTUM</span>
      <nav aria-label="Main navigation">
        <Link href="/register" className="landing-text-link landing-register">Create account</Link>
        <Link href="/login" className="landing-sign-in">Sign in</Link>
      </nav>
    </header>
    <main id="welcome-main" tabIndex={-1}>
      <section className="landing-container landing-hero" aria-labelledby="welcome-title">
        <div className="landing-hero-copy">
          <h1 id="welcome-title"><span className="landing-title-mask"><span className="landing-title-line">Procurement,</span></span><span className="landing-title-mask"><span className="landing-title-line">with proof.</span></span></h1>
          <p>Set the buying limits. Negotiate supplier terms. Review the evidence before authorizing payment.</p>
          <div className="landing-actions">
            <Link id="hero-cta" href="/workspace" className="landing-button">Open workspace</Link>
            <a href="#lifecycle-section" className="landing-text-link">See the process</a>
          </div>
          <p className="landing-demo-note">A B2B procurement workspace with PayPal Sandbox settlement.</p>
        </div>
        <figure className="landing-artifact">
          <div className="landing-artifact-scene"><HeroSculptureCanvas paused={paused || reducedMotion} /></div>
          <figcaption><div>Mandate. Negotiated terms. Recorded evidence.<span>An illustrative agreement sculpture.</span></div>{reducedMotion ? <span>Reduced motion enabled</span> : <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Resume sculpture motion" : "Pause sculpture motion"}</button>}</figcaption>
        </figure>
      </section>
      <LifecycleScrollSection />
    </main>
    <footer className="landing-footer">
      <div className="landing-container"><span className="landing-brand">PACTUM</span><p>Procurement, evidence and settlement.</p><a href="#welcome-main" className="landing-text-link">Back to top</a></div>
    </footer>
  </div>;
}
