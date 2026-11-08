"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LifecycleScrollSection } from "./LifecycleScrollSection";
import "./landing.css";

const HeroSculptureCanvas = dynamic(() => import("./HeroSculptureCanvas").then(module => module.HeroSculptureCanvas), {
  ssr: false,
  loading: () => <span className="landing-sculpture-placeholder" aria-hidden="true">Mandate / Terms / Evidence</span>,
});

export function WelcomeHeroScreen() {
  return <div className="pactum-landing">
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
          <h1 id="welcome-title">Procurement,<br />with proof.</h1>
          <p>Set the buying limits. Negotiate supplier terms. Review the evidence before authorizing payment.</p>
          <div className="landing-actions">
            <Link id="hero-cta" href="/login" className="landing-button">Open workspace</Link>
            <a href="#lifecycle-section" className="landing-text-link">See the process</a>
          </div>
          <p className="landing-demo-note">A B2B procurement workspace with PayPal Sandbox settlement.</p>
        </div>
        <figure className="landing-artifact">
          <div className="landing-artifact-scene"><HeroSculptureCanvas /></div>
          <figcaption>Mandate. Negotiated terms. Recorded evidence.<span>An illustrative agreement sculpture.</span></figcaption>
        </figure>
      </section>
      <LifecycleScrollSection />
    </main>
    <footer className="landing-footer">
      <div className="landing-container"><span className="landing-brand">PACTUM</span><p>Procurement, evidence and settlement.</p><a href="#welcome-main" className="landing-text-link">Back to top</a></div>
    </footer>
  </div>;
}
