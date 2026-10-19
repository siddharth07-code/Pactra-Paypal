import React from "react";
import type { CapabilityCard } from "@/types";

const CAPABILITIES: CapabilityCard[] = [
  {
    title: "Autonomous Procurement",
    badge: "MULTI-AGENT ENGINE",
    description:
      "Enterprise autonomous agents parse requisition constraints, discover qualified B2B vendors, and negotiate terms using bounded rational game-theoretic strategies.",
    status: "NOT_IMPLEMENTED",
    accent: "blue",
    specs: [
      "Vendor discovery & catalog querying",
      "Dynamic counter-offer negotiation",
      "Strict parameter & budget bounding",
    ],
  },
  {
    title: "Cryptographic Verification",
    badge: "MERKLE PROOF AUDIT",
    description:
      "Independent audit layer verifying SHA-256 evidence trees, deterministic rule compliance, and anti-tamper proofs prior to release of transaction funds.",
    status: "NOT_IMPLEMENTED",
    accent: "emerald",
    specs: [
      "Genuine SHA-256 Merkle leaf hashing",
      "Zero-trust independent auditor agent",
      "Tamper-evident audit transcript verification",
    ],
  },
  {
    title: "PayPal Settlement",
    badge: "DISBURSEMENT & CAPTURE",
    description:
      "Programmable PayPal sandbox integration with conditional two-phase authorization, deterministic capture, and cryptographically verified settlement receipts.",
    status: "NOT_IMPLEMENTED",
    accent: "blue",
    specs: [
      "Sandbox API authorization & capture",
      "Gated disbursement on audit pass only",
      "Deterministic payout execution",
    ],
  },
];

const DEV_PIPELINE = [
  {
    name: "Vendor Negotiation Engine",
    subsystem: "Autonomous Agent Core",
    status: "NOT IMPLEMENTED",
    detail: "Multi-round pricing & delivery schedule dialogue",
  },
  {
    name: "Merkle Tree Verification Audit",
    subsystem: "Cryptographic Evidence Layer",
    status: "NOT IMPLEMENTED",
    detail: "SHA-256 tree root computation and leaf proofs",
  },
  {
    name: "PayPal Sandbox Integration",
    subsystem: "Settlement Gateway",
    status: "NOT IMPLEMENTED",
    detail: "Orders v2 authorization, capture & payout endpoints",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen fintech-grid-pattern text-slate-100 flex flex-col justify-between selection:bg-blue-600/30 selection:text-white">
      {/* A. Header */}
      <header className="w-full border-b border-slate-800/80 bg-[#050b14]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#00457c] via-[#0070e0] to-[#009cde] flex items-center justify-center shadow-lg shadow-blue-500/10 border border-blue-400/20">
              <span className="font-extrabold text-white text-lg tracking-wider">P</span>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold tracking-tight text-white">PACTUM</span>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-mono">B2B Core</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Development Environment Indicator */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span>DEV SANDBOX • PHASE 0 FOUNDATION</span>
            </div>
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full border border-slate-700/60 bg-slate-900/60 text-slate-400 text-xs font-mono">
              <span>Next.js 15 App Router</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-16 flex-1 flex flex-col justify-center">
        {/* B. Hero Section */}
        <section className="text-center max-w-4xl mx-auto mb-20">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 text-emerald-400 text-xs font-medium tracking-wide mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>RATIONAL PROCUREMENT • VERIFIABLE SETTLEMENT</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6">
            Negotiate Intelligently. <br />
            <span className="bg-gradient-to-r from-[#009cde] via-[#0070e0] to-[#10b981] bg-clip-text text-transparent">
              Settle Verifiably.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed font-normal mb-10 max-w-3xl mx-auto">
            Autonomous B2B procurement with rational AI negotiation, cryptographic evidence, independent
            verification, and PayPal-powered settlement.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Disabled Launch Procurement Button */}
            <div className="relative group">
              <button
                type="button"
                disabled
                aria-disabled="true"
                id="launch-procurement-btn"
                className="cursor-not-allowed px-8 py-3.5 rounded-xl font-semibold text-sm bg-slate-800/80 text-slate-400 border border-slate-700/80 shadow-inner flex items-center space-x-2 select-none"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Launch Procurement</span>
                <span className="ml-2 text-[10px] font-mono uppercase bg-slate-900 text-slate-500 px-2 py-0.5 rounded border border-slate-800">
                  Phase 1
                </span>
              </button>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-slate-400 font-mono bg-slate-900 px-2.5 py-1 rounded border border-slate-800 pointer-events-none">
                Workflow unavailable in Phase 0 foundation
              </div>
            </div>

            <a
              href="#development-status"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700 transition-colors duration-150 flex items-center space-x-2"
            >
              <span>View System Architecture</span>
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>
        </section>

        {/* C. Three Capability Cards */}
        <section className="mb-20">
          <div className="flex flex-col sm:flex-row items-baseline justify-between mb-8 border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">System Capabilities</h2>
              <p className="text-sm text-slate-400 mt-1">
                Core architectural pillars planned across PACTUM implementation phases
              </p>
            </div>
            <div className="mt-2 sm:mt-0 text-xs font-mono text-slate-400">
              ARCHITECTURE SPECIFICATION • GEMINI.MD
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.title}
                className="fintech-card rounded-2xl p-7 flex flex-col justify-between transition-all duration-200 hover:translate-y-[-2px]"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-mono tracking-wider text-slate-400 font-medium uppercase">
                      {cap.badge}
                    </span>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700">
                      {cap.status}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-3 tracking-tight flex items-center space-x-2">
                    <span>{cap.title}</span>
                  </h3>

                  <p className="text-sm text-slate-300 leading-relaxed mb-6 font-normal">
                    {cap.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80">
                  <div className="text-[11px] font-mono text-slate-400 mb-2 uppercase tracking-wide">
                    Planned Specifications:
                  </div>
                  <ul className="space-y-1.5">
                    {cap.specs.map((spec) => (
                      <li key={spec} className="text-xs text-slate-300 flex items-start space-x-2">
                        <span className="text-blue-400 mt-0.5 font-bold">›</span>
                        <span>{spec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* D. Development Status Section */}
        <section id="development-status" className="mb-12">
          <div className="rounded-2xl border border-slate-800 bg-[#070e1c]/80 backdrop-blur-md p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-800/80 gap-4">
              <div>
                <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded text-[11px] font-mono bg-blue-950/60 border border-blue-800/50 text-blue-300 mb-2">
                  <span>FOUNDATION STAGE</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Subsystem Implementation Status
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Honest tracking of subsystem readiness. No fabricated transactions or mocked success states.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono text-slate-400">Phase 0 Status:</span>
                <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                  FOUNDATION VERIFIED
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {DEV_PIPELINE.map((subsystem) => (
                <div
                  key={subsystem.name}
                  className="rounded-xl p-5 bg-slate-900/60 border border-slate-800/90 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        {subsystem.subsystem}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/50 text-rose-300">
                        {subsystem.status}
                      </span>
                    </div>
                    <div className="text-base font-semibold text-white mb-1.5">
                      {subsystem.name}
                    </div>
                    <div className="text-xs text-slate-400 leading-normal">
                      {subsystem.detail}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Target Execution:</span>
                    <span className="text-slate-400">Scheduled in Roadmap</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start space-x-3">
              <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-amber-300 font-semibold font-mono">Phase 0 Guardrail:</strong> In adherence to PACTUM rules, vendor data, negotiation transcripts, Merkle trees, and payment IDs are not fabricated. Live sandbox endpoints and autonomous agent loops will be introduced in subsequent execution phases.
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-[#050b14] py-8 text-xs text-slate-400 font-mono">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-slate-200 font-semibold">PACTUM</span>
            <span>—</span>
            <span>Enterprise Autonomous B2B Settlement</span>
          </div>
          <div>
            <span>Next.js 15 • React 19 • Strict TypeScript • Vitest</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
