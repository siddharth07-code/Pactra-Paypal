import React from "react";
import Link from "next/link";

const stages = [
  { number: "01", title: "Source", description: "Define the product, quantity and buying limits. Compare available supplier quotes before negotiation.", record: "Mandate and supplier quotes" },
  { number: "02", title: "Negotiate", description: "A Gemini buyer proposes terms within the mandate’s constraints. Policy checks can block proposals; deterministic fallback proposals are identified separately.", record: "Offer history and policy decisions" },
  { number: "03", title: "Audit", description: "ACWORLD checks the agreement and its supporting evidence. A recorded agreement alone does not mean the audit has passed.", record: "ACWORLD certificate and VeriPay evidence" },
  { number: "04", title: "Settle", description: "Buyer approval authorizes a PayPal Sandbox order. Capture is a separate operation, subject to server-side audit and settlement checks.", record: "Authorization and capture references" },
];

export function LifecycleScrollSection() {
  return <section id="lifecycle-section" className="landing-process" aria-labelledby="process-title">
    <div className="landing-container">
      <div className="landing-section-intro">
        <h2 id="process-title">One request.<br />A traceable path.</h2>
        <p>From the first supplier quote to the settlement decision, keep the commercial terms and the record behind them together.</p>
      </div>
      <ol className="landing-workflow" aria-label="Procurement lifecycle">
        {stages.map(stage => <li key={stage.number}>
          <span className="landing-step-number" aria-hidden="true">{stage.number}</span>
          <h3>{stage.title}</h3>
          <div><p>{stage.description}</p><p className="landing-record">{stage.record}</p></div>
        </li>)}
      </ol>
      <details className="landing-method">
        <summary>How the checks work</summary>
        <div>
          <p>Negotiation checks include budget and delivery limits, return requirements, private-price disclosure, Boulware utility thresholds and price monotonicity. Model output is a proposal, not an approval.</p>
          <p>ACWORLD evaluates SKU integrity, price arithmetic, return policy, delivery and Merkle root consistency. VeriPay records cryptographic evidence; a hash does not replace commercial verification.</p>
          <p>PayPal Orders v2 uses AUTHORIZE intent. Order metadata binds the evidence root and session through <code>custom_id</code>. Evidence packaged for a dispute remains local unless an actual provider submission is confirmed.</p>
        </div>
      </details>
      <p className="landing-disclosure">Demonstration catalog entries are sample offers, not live supplier commitments. This page displays no live procurement or payment status.</p>
      <div className="landing-closing">
        <div><h2>Start with a mandate.</h2><p>Bring your buying requirements into the workspace.</p></div>
        <div className="landing-actions"><Link id="lifecycle-cta" href="/workspace" className="landing-button">Open workspace</Link><Link href="/register" className="landing-text-link">Create account</Link></div>
      </div>
    </div>
  </section>;
}
