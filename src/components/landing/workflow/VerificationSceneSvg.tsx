"use client";

import React, { useState } from "react";
import { SvgTooltip } from "./WorkflowSvgPrimitives";

interface VerificationSceneSvgProps {
  className?: string;
}

export function VerificationSceneSvg({ className = "" }: VerificationSceneSvgProps) {
  const [activeTooltip, setActiveTooltip] = useState<{
    id: string;
    title: string;
    desc: string;
    details: string[];
    x: number;
    y: number;
  } | null>(null);

  const checks = [
    { id: "sku", label: "SKU Integrity", status: "Pass", detail: "CHAIR-ERG-4K verified" },
    { id: "price", label: "Price Arithmetic", status: "Pass", detail: "$3,700 ≤ $4,000 limit" },
    { id: "delivery", label: "Delivery SLA", status: "Pass", detail: "8 days ≤ 10-day SLA" },
    { id: "return", label: "Return Policy", status: "Pass", detail: "30 days ≥ 30d window" },
    { id: "merkle", label: "Merkle Lineage", status: "Pass", detail: "Root custom_id bound" },
  ];

  return (
    <div className={`verification-scene-svg-wrapper w-full ${className}`}>
      <svg
        viewBox="0 0 540 326"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto overflow-visible"
        aria-label="Interactive Verification Architecture Diagram: SHA-256 Merkle flight recorder and ACWORLD 5-invariant final-state audit"
        role="img"
      >
        <defs>
          <filter id="workflow-merkle-shadow" x="-10%" y="-10%" width="125%" height="135%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#2a2334" floodOpacity="0.05" />
          </filter>
        </defs>

        {/* 1. Left Side: Draft Agreement Card (Hook for .cinema-agreement) */}
        <g
          className="cinema-agreement"
          transform="translate(18, 20)"
          tabIndex={0}
          role="button"
          aria-label="Draft agreement: Sample supplier A, 20 office chairs, USD 3,700, delivery in 8 days"
          style={{ cursor: "pointer" }}
          onMouseEnter={() =>
            setActiveTooltip({
              id: "draft-agreement",
              title: "Authoritative Transaction State",
              desc: "Draft terms frozen prior to ACWORLD invariant audit",
              details: [
                "20 office chairs · USD 3,700 · delivery in 8 days",
                "Buyer approval pending · payment not authorized",
                "Immutable event committed to Merkle leaf index 0",
              ],
              x: 180,
              y: 20,
            })
          }
          onMouseLeave={() => setActiveTooltip(null)}
          onFocus={() =>
            setActiveTooltip({
              id: "draft-agreement",
              title: "Authoritative Transaction State",
              desc: "Draft terms frozen prior to ACWORLD invariant audit",
              details: [
                "20 office chairs · USD 3,700 · delivery in 8 days",
                "Buyer approval pending · payment not authorized",
                "Immutable event committed to Merkle leaf index 0",
              ],
              x: 180,
              y: 20,
            })
          }
          onBlur={() => setActiveTooltip(null)}
        >
          <rect
            x="0"
            y="0"
            width="175"
            height="110"
            rx="12"
            fill="#ffffff"
            stroke="#ded7cd"
            strokeWidth="1.2"
            filter="url(#workflow-merkle-shadow)"
          />
          <rect x="0" y="0" width="175" height="24" rx="12" fill="#f6f3ee" />
          <path d="M 0 12 H 175 V 24 H 0 Z" fill="#f6f3ee" />
          <text
            x="12"
            y="16"
            fill="#584b69"
            fontSize="9"
            fontWeight="700"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Draft Agreement
          </text>
          <text className="sr-only" letterSpacing="0.04em">
            DRAFT AGREEMENT
          </text>
          <text
            x="12"
            y="43"
            fill="#1c1917"
            fontSize="10.5"
            fontWeight="700"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Supplier A · 20 office chairs
          </text>
          <text
            x="12"
            y="61"
            fill="#1c1917"
            fontSize="12"
            fontWeight="700"
            fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace"
          >
            USD 3,700 (8d delivery)
          </text>
          <text
            x="12"
            y="78"
            fill="#686056"
            fontSize="9"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Awaiting manual sign-off
          </text>
          <text
            x="12"
            y="94"
            fill="#925043"
            fontSize="8.5"
            fontWeight="600"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Capture gate active
          </text>
        </g>

        {/* 2. Middle-Right: SHA-256 Merkle Flight Recorder Tree */}
        <g transform="translate(210, 16)">
          <rect
            x="0"
            y="0"
            width="312"
            height="146"
            rx="12"
            fill="#f7f3fa"
            stroke="#dcd0f0"
            strokeWidth="1.2"
          />
          <text
            x="14"
            y="20"
            fill="#584b69"
            fontSize="9"
            fontWeight="700"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            SHA-256 Merkle Flight Recorder
          </text>
          <text className="sr-only">SHA-256 / MERKLE FLIGHT RECORDER</text>

          {/* Leaf Nodes Layer (Hook for .cinema-evidence-leaves) */}
          <g className="cinema-evidence-leaves" transform="translate(14, 94)">
            {/* Leaf 0: Mandate */}
            <g
              transform="translate(0, 0)"
              style={{ cursor: "pointer" }}
              tabIndex={0}
              role="button"
              aria-label="Merkle Leaf 0: Mandate record digest"
              onMouseEnter={() =>
                setActiveTooltip({
                  id: "leaf0",
                  title: "Leaf 0: Mandate Hash",
                  desc: "Canonical JSON hash of Procurement Mandate",
                  details: ["Event: MANDATE_LOCKED", "SHA-256: 0x4a8b...1f09", "Sorted key commitment"],
                  x: 180,
                  y: 110,
                })
              }
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <rect x="0" y="0" width="86" height="36" rx="6" fill="#ffffff" stroke="#c4b5e2" strokeWidth="1" />
              <text x="43" y="15" textAnchor="middle" fill="#584b69" fontSize="8.5" fontWeight="600" fontFamily="Inter, system-ui, -apple-system, sans-serif">
                Mandate record
              </text>
              <text x="43" y="27" textAnchor="middle" fill="#78668e" fontSize="7.5" fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace">
                h0: 0x4a8b...
              </text>
            </g>

            {/* Leaf 1: Terms */}
            <g
              transform="translate(98, 0)"
              style={{ cursor: "pointer" }}
              tabIndex={0}
              role="button"
              aria-label="Merkle Leaf 1: Draft terms digest"
              onMouseEnter={() =>
                setActiveTooltip({
                  id: "leaf1",
                  title: "Leaf 1: Terms Hash",
                  desc: "Canonical JSON hash of Negotiated Draft Terms",
                  details: ["Event: AGREEMENT_CREATED", "SHA-256: 0x9e12...b43a", "Pricing & SLA locked"],
                  x: 230,
                  y: 110,
                })
              }
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <rect x="0" y="0" width="86" height="36" rx="6" fill="#ffffff" stroke="#c4b5e2" strokeWidth="1" />
              <text x="43" y="15" textAnchor="middle" fill="#584b69" fontSize="8.5" fontWeight="600" fontFamily="Inter, system-ui, -apple-system, sans-serif">
                Draft terms
              </text>
              <text x="43" y="27" textAnchor="middle" fill="#78668e" fontSize="7.5" fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace">
                h1: 0x9e12...
              </text>
            </g>

            {/* Leaf 2: Kernel DOM */}
            <g
              transform="translate(196, 0)"
              style={{ cursor: "pointer" }}
              tabIndex={0}
              role="button"
              aria-label="Merkle Leaf 2: Merchant DOM evidence attestation"
              onMouseEnter={() =>
                setActiveTooltip({
                  id: "leaf2",
                  title: "Leaf 2: Kernel DOM Attestation",
                  desc: "Merchant web page DOM snapshot digest",
                  details: ["Event: KERNEL_DOM_ATTESTATION", "SHA-256: 0x73c0...fa81", "Return policy verified"],
                  x: 280,
                  y: 110,
                })
              }
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <rect x="0" y="0" width="86" height="36" rx="6" fill="#ffffff" stroke="#c4b5e2" strokeWidth="1" />
              <text x="43" y="15" textAnchor="middle" fill="#584b69" fontSize="8.5" fontWeight="600" fontFamily="Inter, system-ui, -apple-system, sans-serif">
                DOM evidence
              </text>
              <text x="43" y="27" textAnchor="middle" fill="#78668e" fontSize="7.5" fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace">
                h2: 0x73c0...
              </text>
            </g>
          </g>

          {/* Binary Join Connectors (Hook for .cinema-evidence-join) */}
          <g className="cinema-evidence-join">
            <path
              d="M 57 94 L 57 78 L 141 78 L 141 66"
              fill="none"
              stroke="#78668e"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path
              d="M 141 94 L 141 78"
              fill="none"
              stroke="#78668e"
              strokeWidth="1.2"
            />
            <path
              d="M 239 94 L 239 78 L 141 78"
              fill="none"
              stroke="#78668e"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <circle cx="141" cy="66" r="2.2" fill="#78668e" />
          </g>

          {/* Root Digest Commitment Card (Hook for .cinema-evidence-root) */}
          <g
            className="cinema-evidence-root"
            transform="translate(48, 28)"
            tabIndex={0}
            role="button"
            aria-label="Combined Merkle root digest commitment: 0x7f4a...d91c"
            style={{ cursor: "pointer" }}
            onMouseEnter={() =>
              setActiveTooltip({
                id: "root",
                title: "Cryptographic Evidence Root",
                desc: "Immutable SHA-256 binary Merkle root hash",
                details: [
                  "Root: 0x7f4ad91c8342ea...fe3a",
                  "Inclusion Proof: Verified across all leaves",
                  "Bound to PayPal order custom_id",
                ],
                x: 180,
                y: 30,
              })
            }
            onMouseLeave={() => setActiveTooltip(null)}
          >
            <rect
              x="0"
              y="0"
              width="186"
              height="36"
              rx="8"
              fill="#ffffff"
              stroke="#78668e"
              strokeWidth="1.4"
            />
            <text x="93" y="15" textAnchor="middle" fill="#443353" fontSize="9" fontWeight="700" fontFamily="Inter, system-ui, -apple-system, sans-serif">
              Combined evidence root
            </text>
            <text x="93" y="27" textAnchor="middle" fill="#584b69" fontSize="8" fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace">
              0x7f4a...d91c (Audit Bound)
            </text>
          </g>
        </g>

        {/* 3. Lower ACWORLD 5-Invariant Matrix (Hooks for .cinema-audit-checks & .cinema-audit-result) */}
        <g transform="translate(18, 172)">
          {/* Checks Matrix List */}
          <g className="cinema-audit-checks">
            <rect x="0" y="0" width="310" height="96" rx="8" fill="#f4eefa" stroke="#dcd0f0" strokeWidth="1.2" />
            <text
              x="14"
              y="18"
              fill="#584b69"
              fontSize="9"
              fontWeight="700"
              fontFamily="Inter, system-ui, -apple-system, sans-serif"
            >
              ACWORLD 5-Invariant Final-State Audit
            </text>
            <text className="sr-only">ACWORLD INDEPENDENT 5-INVARIANT AUDIT:</text>
            {checks.map((chk, i) => (
              <g
                key={chk.id}
                className="cinema-audit-check"
                transform={`translate(14, ${32 + i * 12})`}
                tabIndex={0}
                role="button"
                aria-label={`Check ${chk.label}: ${chk.status}`}
                onMouseEnter={() =>
                  setActiveTooltip({
                    id: chk.id,
                    title: `Invariant Check: ${chk.label}`,
                    desc: chk.detail,
                    details: ["Independent validation against mandate", "Zero reliance on client assertion", "Fail-closed safety gate"],
                    x: 180,
                    y: 180,
                  })
                }
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <text x="0" y="0" fill="#443353" fontSize="8.5" fontFamily="Inter, system-ui, -apple-system, sans-serif">
                  • {chk.label}:
                </text>
                <text x="96" y="0" fill="#15803d" fontSize="8.5" fontWeight="600" fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace">
                  ✓ {chk.status} ({chk.detail})
                </text>
              </g>
            ))}
          </g>

          {/* Audit Verification Certificate Banner (Hook for .cinema-audit-result) */}
          <g className="cinema-audit-result" transform="translate(322, 0)">
            <rect x="0" y="0" width="182" height="96" rx="8" fill="#dcefe2" stroke="#86efac" strokeWidth="1.2" />
            <g transform="translate(12, 22)">
              <circle cx="12" cy="12" r="11" fill="#22c55e" />
              <path d="M 7 12 L 10 15 L 17 8" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              <text x="30" y="10" fill="#14532d" fontSize="10.5" fontWeight="700" fontFamily="Inter, system-ui, -apple-system, sans-serif">
                Audit status · Verified
              </text>
              <text x="30" y="24" fill="#15803d" fontSize="8.5" fontWeight="600" fontFamily="Inter, system-ui, -apple-system, sans-serif">
                5/5 Invariants passed
              </text>
              <text x="30" y="40" fill="#1e3a1e" fontSize="7.5" fontFamily="Inter, system-ui, -apple-system, sans-serif">
                Authorized for PayPal settlement
              </text>
            </g>
          </g>
        </g>

        {/* Active Interactive Tooltip */}
        {activeTooltip && (
          <SvgTooltip
            x={activeTooltip.x}
            y={activeTooltip.y}
            width={185}
            title={activeTooltip.title}
            description={activeTooltip.desc}
            details={activeTooltip.details}
            isVisible={true}
          />
        )}
      </svg>
    </div>
  );
}
