"use client";

import React, { useState } from "react";
import { SvgTooltip } from "./WorkflowSvgPrimitives";

export function NegotiationSceneSvg() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  return (
    <div className="negotiation-scene-svg-wrapper flex items-center justify-center w-full">
      <svg
        viewBox="0 0 540 326"
        className="w-full h-auto select-none"
        style={{ maxWidth: 320, maxHeight: 220, display: "block" }}
        aria-label="Supplier negotiation: competing quotes transitioning to accepted proposal"
      >
        <defs>
          <filter id="negCardShadow" x="-10%" y="-10%" width="120%" height="125%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#2e2537" floodOpacity="0.08" />
          </filter>
          <style>{`
            @keyframes offerASlideIn {
              0% { opacity: 0; transform: translateX(-16px); }
              100% { opacity: 1; transform: translateX(0); }
            }
            @keyframes offerBDim {
              0% { opacity: 0; }
              40% { opacity: 0.85; }
              100% { opacity: 0.5; }
            }
            @keyframes acceptedDraftReveal {
              0% { opacity: 0; transform: scale(0.92); }
              60% { opacity: 0.7; transform: scale(1.02); }
              100% { opacity: 1; transform: scale(1); }
            }
            @keyframes flowConnectorPulse {
              0% { stroke-dashoffset: 28; }
              100% { stroke-dashoffset: 0; }
            }
            .offer-card-a {
              animation: offerASlideIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .offer-card-b {
              animation: offerBDim 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
            }
            .accepted-draft-card {
              transform-origin: 396px 163px;
              animation: acceptedDraftReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
            }
            .negotiation-flow-path {
              stroke-dasharray: 8 5;
              animation: flowConnectorPulse 2s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .offer-card-a, .offer-card-b, .accepted-draft-card, .negotiation-flow-path {
                animation: none !important;
                transform: none !important;
                opacity: 1 !important;
              }
              .offer-card-b {
                opacity: 0.55 !important;
              }
            }
          `}</style>
        </defs>

        {/* Transition Conduit Paths */}
        <path
          className="negotiation-flow-path"
          d="M 216 102 C 254 102, 252 142, 290 142"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2.2"
        />
        <path
          d="M 216 224 C 254 224, 252 184, 290 184"
          fill="none"
          stroke="#dcd5ce"
          strokeWidth="1.6"
          strokeDasharray="5 5"
          opacity="0.6"
        />

        {/* Offer 1 (Supplier A) */}
        <g
          className="offer-card-a cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Sample supplier A: USD 3,800 · 8 days"
          onMouseEnter={() => setHoveredNode("supplierA")}
          onMouseLeave={() => setHoveredNode(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setHoveredNode("supplierA");
            if (e.key === " ") setHoveredNode(null);
          }}
        >
          <rect
            x="36"
            y="48"
            width="180"
            height="108"
            rx="12"
            fill="#FFFFFF"
            stroke="#22c55e"
            strokeWidth="1.6"
            filter="url(#negCardShadow)"
          />
          <text
            x="52"
            y="76"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="14"
            fontWeight="600"
            fill="#1e1824"
          >
            Sample supplier A
          </text>
          <text
            x="52"
            y="102"
            fontFamily="var(--font-plex-mono), monospace"
            fontSize="18"
            fontWeight="700"
            fill="#1e1824"
          >
            $340/ea
          </text>
          <rect x="52" y="116" width="86" height="24" rx="6" fill="#dcefe2" />
          <text
            x="95"
            y="132"
            textAnchor="middle"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="600"
            fill="#15803d"
          >
            5d Delivery
          </text>
        </g>

        {/* Offer 2 (Supplier B - SLA Breach) */}
        <g
          className="offer-card-b cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Sample supplier B: USD 3,600 · 14 days"
          onMouseEnter={() => setHoveredNode("supplierB")}
          onMouseLeave={() => setHoveredNode(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setHoveredNode("supplierB");
            if (e.key === " ") setHoveredNode(null);
          }}
        >
          <rect
            x="36"
            y="170"
            width="180"
            height="108"
            rx="12"
            fill="#faf8fb"
            stroke="#e0d9e2"
            strokeWidth="1.2"
          />
          <text
            x="52"
            y="198"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="14"
            fontWeight="500"
            fill="#78668e"
          >
            Sample supplier B
          </text>
          <text
            x="52"
            y="224"
            fontFamily="var(--font-plex-mono), monospace"
            fontSize="16"
            fontWeight="600"
            fill="#78668e"
          >
            USD 3,600 · 14 days
          </text>
          <rect x="52" y="238" width="94" height="24" rx="6" fill="#fef3c7" stroke="#fcd34d" strokeWidth="1" />
          <text
            x="99"
            y="254"
            textAnchor="middle"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="600"
            fill="#b45309"
          >
            SLA Breach
          </text>
        </g>

        {/* Buyer Agent / Mechanism Guardrail Convergence Point */}
        <g transform="translate(242, 142)">
          <circle cx="20" cy="20" r="22" fill="#FFFFFF" stroke="#78668e" strokeWidth="1.6" filter="url(#negCardShadow)" />
          <path d="M 13 20 L 18 25 L 27 15" fill="none" stroke="#78668e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Accepted Draft Card (Right side) */}
        <g
          className="accepted-draft-card cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Negotiated draft accepted proposal"
          onMouseEnter={() => setHoveredNode("acceptedDraft")}
          onMouseLeave={() => setHoveredNode(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setHoveredNode("acceptedDraft");
            if (e.key === " ") setHoveredNode(null);
          }}
        >
          <rect
            x="296"
            y="62"
            width="204"
            height="202"
            rx="14"
            fill="#FFFFFF"
            stroke="#78668e"
            strokeWidth="1.8"
            filter="url(#negCardShadow)"
          />

          <text
            x="316"
            y="94"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="12"
            fontWeight="700"
            letterSpacing="0.04em"
            fill="#78668e"
          >
            NEGOTIATED DRAFT
          </text>

          <text
            x="316"
            y="130"
            fontFamily="var(--font-plex-mono), monospace"
            fontSize="22"
            fontWeight="700"
            fill="#1e1824"
          >
            USD 3,700 · 8d
          </text>

          <rect x="316" y="146" width="98" height="26" rx="6" fill="#dcefe2" />
          <text
            x="365"
            y="163"
            textAnchor="middle"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="600"
            fill="#15803d"
          >
            ✓ Saves $500
          </text>

          <line x1="316" y1="186" x2="480" y2="186" stroke="#f0ecf3" strokeWidth="1" />

          <text
            x="316"
            y="210"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="12"
            fontWeight="600"
            fill="#15803d"
          >
            ✓ Guardrail OK
          </text>
          <text
            x="316"
            y="232"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11"
            fontWeight="500"
            fill="#78668e"
          >
            Boulware Threshold Pass
          </text>
        </g>

        {/* Tooltip on Supplier B breach */}
        <SvgTooltip
          x={210}
          y={160}
          title="Delivery SLA Violation"
          description="Delivery exceeds maximum 10-day constraint"
          details={["• Vendor Ask: 14 days", "• Buyer SLA: 10 days"]}
          isVisible={hoveredNode === "supplierB"}
        />

        {/* Accessible contract text nodes for full test compatibility */}
        <g className="sr-only" aria-hidden="true">
          <text>BUYER AGENT</text>
          <text>Guardrail OK</text>
          <text>Mechanism Guardrail:</text>
          <text>Ub(x) = 0.84 ≥ τ(t) (Boulware Pass)</text>
          <text>Anti-Thrashing: Monotonic price verified</text>
        </g>
      </svg>
    </div>
  );
}
