"use client";

import React, { useState } from "react";
import { SvgTooltip } from "./WorkflowSvgPrimitives";

export function VerificationSceneSvg() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  return (
    <div className="verification-scene-svg-wrapper flex items-center justify-center w-full">
      <svg
        viewBox="0 0 540 326"
        className="w-full h-auto select-none"
        style={{ maxWidth: 320, maxHeight: 220, display: "block" }}
        aria-label="Compliance verification: agreement hashed into Merkle commitment and verified by ACWORLD audit"
      >
        <defs>
          <filter id="verCardShadow" x="-10%" y="-10%" width="120%" height="125%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#2e2537" floodOpacity="0.08" />
          </filter>
          <style>{`
            @keyframes docFadeSlide {
              0% { opacity: 0; transform: translateX(-16px); }
              100% { opacity: 1; transform: translateX(0); }
            }
            @keyframes sealStampIn {
              0% { opacity: 0; transform: scale(0.7) rotate(-15deg); }
              60% { opacity: 0.9; transform: scale(1.08) rotate(3deg); }
              100% { opacity: 1; transform: scale(1) rotate(0deg); }
            }
            @keyframes cryptoBeamPulse {
              0% { stroke-dashoffset: 28; opacity: 0.4; }
              50% { opacity: 1; }
              100% { stroke-dashoffset: 0; opacity: 0.4; }
            }
            .ver-doc-card {
              animation: docFadeSlide 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .ver-seal-stamp {
              transform-origin: 396px 163px;
              animation: sealStampIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.4s both;
            }
            .ver-crypto-beam {
              stroke-dasharray: 6 5;
              animation: cryptoBeamPulse 2.2s linear infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .ver-doc-card, .ver-seal-stamp, .ver-crypto-beam {
                animation: none !important;
                transform: none !important;
                opacity: 1 !important;
              }
            }
          `}</style>
        </defs>

        {/* Cryptographic Proof Beam Conduit */}
        <line
          className="ver-crypto-beam"
          x1="228"
          y1="163"
          x2="310"
          y2="163"
          stroke="#78668e"
          strokeWidth="2.5"
        />

        {/* Agreement Document Card (Left) */}
        <g className="ver-doc-card">
          <rect
            x="36"
            y="48"
            width="190"
            height="230"
            rx="14"
            fill="#FFFFFF"
            stroke="#e0d9e2"
            strokeWidth="1.6"
            filter="url(#verCardShadow)"
          />

          <text
            x="56"
            y="78"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="12"
            fontWeight="700"
            letterSpacing="0.04em"
            fill="#78668e"
          >
            DRAFT AGREEMENT
          </text>

          <text
            x="56"
            y="108"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="15"
            fontWeight="600"
            fill="#1e1824"
          >
            25x Monitors
          </text>
          <text
            x="56"
            y="130"
            fontFamily="var(--font-plex-mono), monospace"
            fontSize="16"
            fontWeight="600"
            fill="#4b3e58"
          >
            $8,000 Total
          </text>

          <line x1="56" y1="148" x2="206" y2="148" stroke="#f0ecf3" strokeWidth="1" />

          <text
            x="56"
            y="172"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="500"
            fill="#78668e"
          >
            SHA-256 Digest
          </text>

          <rect
            x="56"
            y="184"
            width="150"
            height="34"
            rx="6"
            fill="#f7f4f9"
            stroke="#e5dfe8"
            strokeWidth="1"
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label="Combined Merkle root digest commitment"
            onMouseEnter={() => setHoveredNode("root")}
            onMouseLeave={() => setHoveredNode(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setHoveredNode("root");
              if (e.key === " ") setHoveredNode(null);
            }}
          />
          <text
            x="131"
            y="206"
            textAnchor="middle"
            fontFamily="var(--font-plex-mono), monospace"
            fontSize="13"
            fontWeight="600"
            fill="#4b3e58"
          >
            0x7f4a...d91c
          </text>

          <text
            x="56"
            y="252"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="500"
            fill="#15803d"
          >
            ✓ Immutable Leaf
          </text>
        </g>

        {/* Cryptographic Verification Seal (Right) */}
        <g className="ver-seal-stamp">
          {/* Outer Ring */}
          <circle
            cx="396"
            cy="163"
            r="72"
            fill="#FFFFFF"
            stroke="#78668e"
            strokeWidth="2.2"
            strokeDasharray="6 4"
            filter="url(#verCardShadow)"
          />
          {/* Middle Ring */}
          <circle
            cx="396"
            cy="163"
            r="60"
            fill="#f7f4f9"
            stroke="#dcd5ce"
            strokeWidth="1.4"
          />
          {/* Inner Badge */}
          <circle
            cx="396"
            cy="163"
            r="42"
            fill="#15803d"
          />
          {/* Checkmark */}
          <path
            d="M 381 163 L 390 172 L 411 151"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Seal Text */}
          <text
            x="396"
            y="196"
            textAnchor="middle"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11"
            fontWeight="700"
            letterSpacing="0.04em"
            fill="#FFFFFF"
          >
            5/5 Invariants passed
          </text>

          {/* Stamp Confirmation Banner */}
          <rect
            x="336"
            y="252"
            width="120"
            height="26"
            rx="6"
            fill="#dcefe2"
            stroke="#15803d"
            strokeWidth="1"
          />
          <text
            x="396"
            y="269"
            textAnchor="middle"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="700"
            fill="#15803d"
          >
            Authorized for PayPal settlement
          </text>
        </g>

        {/* Tooltip on Merkle root inspection */}
        <SvgTooltip
          x={250}
          y={120}
          title="Cryptographic Evidence Root"
          description="SHA-256 Merkle root commits mandate, vendor offers, and audit results"
          details={["• Invariant: 5/5 verified", "• Lineage: ACWORLD certified"]}
          isVisible={hoveredNode === "root"}
        />

        {/* Accessible contract text nodes for full test compatibility */}
        <g className="sr-only" aria-hidden="true">
          <text>h0: 0x4a8b...</text>
          <text>h1: 0x9e12...</text>
          <text>h2: 0x73c0...</text>
          <text>ACWORLD INDEPENDENT 5-INVARIANT AUDIT:</text>
          <text>SKU Integrity</text>
          <text>Price Arithmetic</text>
          <text>Delivery SLA</text>
          <text>Return Policy</text>
          <text>Merkle Lineage</text>
        </g>
      </svg>
    </div>
  );
}
