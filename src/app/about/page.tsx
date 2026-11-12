import type { Metadata } from "next";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "About PACTRA",
  description: "Learn how PACTRA helps buyers negotiate supplier terms, review agreements, and approve test payments.",
};

export default function AboutPage() {
  return (
    <div className="pactum-landing landing-about-page">
      <a href="#about-main" className="landing-skip">Skip to main content</a>
      <LandingHeader currentPage="about" />
      <main id="about-main" className="landing-container landing-about" tabIndex={-1}>
        <header className="landing-about-intro">
          <h1>About PACTRA</h1>
          <p>PACTRA is a procurement workspace that brings purchasing requirements, supplier terms, and payment approvals into one record.</p>
        </header>

        <section className="landing-about-record" aria-labelledby="about-record-title">
          <h2 id="about-record-title">How it works</h2>
          <dl>
            <div>
              <dt>Set purchasing requirements</dt>
              <dd>Define your budget, delivery deadline, and supplier criteria. PACTRA uses those limits to evaluate offers.</dd>
            </div>
            <div>
              <dt>Negotiate and review terms</dt>
              <dd>Use AI assistance to compare offers and negotiate. Review the final terms, policy checks, and cryptographic evidence before approving the agreement.</dd>
            </div>
            <div>
              <dt>Approve and track payment</dt>
              <dd>The buyer approves payment. PayPal Sandbox handles test settlement, and the payment status appears in the workspace.</dd>
            </div>
          </dl>
        </section>

        <div className="landing-actions">
          <Link href="/workspace" className="landing-button">Open workspace</Link>
          <Link href="/#procurement-mandate" className="landing-text-link">See the workflow</Link>
        </div>
      </main>
    </div>
  );
}
