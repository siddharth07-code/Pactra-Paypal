import type { Metadata } from "next";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "About PACTRA",
  description: "How PACTRA connects purchasing requirements, supplier agreements, and approval for PayPal Sandbox settlement.",
};

export default function AboutPage() {
  return (
    <div className="pactum-landing pactum-cinema">
      <a href="#about-main" className="landing-skip">Skip to main content</a>
      <LandingHeader currentPage="about" />
      <main id="about-main" className="landing-container landing-about" tabIndex={-1}>
        <div className="landing-about-intro">
          <h1>About PACTRA</h1>
          <p>PACTRA connects the terms a buyer sets at the start of a purchase with the agreement they approve at the end.</p>
          <p>AI helps compare offers and negotiate terms within the buyer’s limits. The buyer reviews the agreement and approves payment before it moves to PayPal Sandbox for test settlement.</p>
          <div className="landing-actions">
            <Link href="/workspace" className="landing-button">Open workspace</Link>
            <Link href="/#procurement-mandate" className="landing-text-link">See the workflow</Link>
          </div>
        </div>
        <section className="landing-about-record" aria-labelledby="about-record-title">
          <h2 id="about-record-title">What the buyer can review</h2>
          <dl>
            <div>
              <dt>Purchasing requirements</dt>
              <dd>The budget, delivery expectations, and supplier criteria used to evaluate offers.</dd>
            </div>
            <div>
              <dt>Agreement and evidence</dt>
              <dd>The negotiated terms, policy check results, and cryptographic evidence tied to the agreement.</dd>
            </div>
            <div>
              <dt>Settlement status</dt>
              <dd>Buyer approval and the status of the test payment in PayPal Sandbox.</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
