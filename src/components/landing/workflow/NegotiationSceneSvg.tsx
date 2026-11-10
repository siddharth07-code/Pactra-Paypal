"use client";

import React, { useState } from "react";
import { SvgNode, SvgConnector, SvgTooltip } from "./WorkflowSvgPrimitives";

interface NegotiationSceneSvgProps {
  className?: string;
}

export function NegotiationSceneSvg({ className = "" }: NegotiationSceneSvgProps) {
  const [activeTooltip, setActiveTooltip] = useState<{
    id: string;
    title: string;
    desc: string;
    details: string[];
    x: number;
    y: number;
  } | null>(null);

  const suppliers = [
    {
      id: "supplier-a",
      title: "Sample supplier A",
      subtitle: "Initial quote · Round 1",
      metric: "USD 3,800 · 8 days",
      badge: { text: "Compliant", variant: "mint" as const },
      x: 18,
      y: 24,
      w: 195,
      h: 68,
      desc: "Within budget and delivery SLA",
      details: ["Unit ask: $190.00", "Delivery: 8 days (≤ 10d SLA)", "Return policy: 30 days valid"],
    },
    {
      id: "supplier-b",
      title: "Sample supplier B",
      subtitle: "Lower quote · Round 1",
      metric: "USD 3,600 · 14 days",
      badge: { text: "SLA Breach", variant: "amber" as const },
      x: 18,
      y: 110,
      w: 195,
      h: 68,
      desc: "Delivery exceeds maximum 10-day constraint",
      details: [
        "Unit ask: $180.00 (Lower price)",
        "Delivery: 14 days (FAILED > 10d limit)",
        "Predicate A: BLOCKED before transmission",
      ],
    },
  ];

  return (
    <div className={`negotiation-scene-svg-wrapper w-full ${className}`}>
      <svg
        viewBox="0 0 540 326"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto overflow-visible"
        aria-label="Interactive Negotiation Architecture Diagram: Multi-vendor comparison network and deterministic guardrail checks"
        role="img"
      >
        <defs>
          <filter id="workflow-node-shadow-neg" x="-10%" y="-10%" width="125%" height="135%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#1e1824" floodOpacity="0.05" />
          </filter>
          <filter id="workflow-draft-shadow" x="-12%" y="-12%" width="130%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#163820" floodOpacity="0.07" />
          </filter>
        </defs>

        {/* 1. Network Connectors */}
        {/* Supplier A to Buyer Agent (Compliant green) */}
        <SvgConnector x1={213} y1={58} x2={254} y2={100} strokeColor="#22c55e" strokeWidth={1.5} />
        {/* Supplier B to Buyer Agent (Amber dashed SLA breach) */}
        <SvgConnector
          x1={213}
          y1={144}
          x2={254}
          y2={120}
          variant="dashed"
          strokeColor="#f59e0b"
          strokeWidth={1.4}
        />
        {/* Buyer Agent to Negotiated Draft */}
        <SvgConnector x1={324} y1={110} x2={352} y2={110} strokeColor="#15803d" strokeWidth={1.8} />

        {/* 2. Competing Supplier Nodes (Hooks for .cinema-offer) */}
        {suppliers.map((s) => (
          <g key={s.id} className="cinema-offer">
            <SvgNode
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              title={s.title}
              subtitle={s.subtitle}
              metric={s.metric}
              badge={s.badge}
              isActive={activeTooltip?.id === s.id}
              onHover={(hovered) => {
                if (hovered) {
                  setActiveTooltip({
                    id: s.id,
                    title: s.title,
                    desc: s.desc,
                    details: s.details,
                    x: s.x + s.w + 10,
                    y: s.y,
                  });
                } else {
                  setActiveTooltip(null);
                }
              }}
              onClick={() => {
                setActiveTooltip((curr) =>
                  curr?.id === s.id
                    ? null
                    : {
                        id: s.id,
                        title: s.title,
                        desc: s.desc,
                        details: s.details,
                        x: s.x + s.w + 10,
                        y: s.y,
                      }
                );
              }}
            />
          </g>
        ))}

        {/* 3. Central Gemini Buyer Agent & Mechanism Guardrail Node */}
        <g
          transform="translate(254, 75)"
          tabIndex={0}
          role="button"
          aria-label="Gemini Buyer Agent: Guardrail OK"
          style={{ cursor: "pointer" }}
          onMouseEnter={() =>
            setActiveTooltip({
              id: "buyer-agent",
              title: "Gemini Buyer Agent",
              desc: "Autonomous multi-attribute negotiation engine",
              details: [
                "Boulware time-decay threshold tau(t)",
                "Multi-attribute utility Ub(x) = 0.84",
                "Monotonic price anti-thrashing verified",
              ],
              x: 180,
              y: 75,
            })
          }
          onMouseLeave={() => setActiveTooltip(null)}
        >
          <rect
            x="0"
            y="0"
            width="70"
            height="70"
            rx="14"
            fill="#ffffff"
            stroke="#78668e"
            strokeWidth="1.4"
            filter="url(#workflow-node-shadow-neg)"
          />
          {/* AI Sparkle Icon */}
          <g transform="translate(23, 13)">
            <path d="M 12 2 Q 12 12 2 12 Q 12 12 12 22 Q 12 12 22 12 Q 12 12 12 2 Z" fill="#7c3aed" />
            <circle cx="20" cy="5" r="2.2" fill="#a855f7" />
          </g>
          <text
            x="35"
            y="46"
            textAnchor="middle"
            fill="#1c1917"
            fontSize="9"
            fontWeight="700"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Buyer Agent
          </text>
          <text className="sr-only">BUYER AGENT</text>
          <text
            x="35"
            y="58"
            textAnchor="middle"
            fill="#15803d"
            fontSize="8"
            fontWeight="600"
            fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace"
          >
            Guardrail OK
          </text>
        </g>

        {/* 4. Negotiated Draft Card (Hook for .cinema-terms) */}
        <g
          className="cinema-terms"
          transform="translate(352, 24)"
          tabIndex={0}
          role="button"
          aria-label="Negotiated Draft Terms: Supplier A, USD 3,700 for 8 days delivery, saves USD 100"
          onMouseEnter={() =>
            setActiveTooltip({
              id: "draft",
              title: "Negotiated Agreement Draft",
              desc: "Pareto-optimal terms approved by mechanism guardrail",
              details: [
                "Opening ask: USD 3,800.00",
                "Negotiated draft: USD 3,700.00 (8 days)",
                "Buyer utility score Ub(x) = 0.84",
                "Boulware threshold satisfied: Ub ≥ tau(t)",
                "Status: Awaiting buyer checkout approval",
              ],
              x: 165,
              y: 80,
            })
          }
          onMouseLeave={() => setActiveTooltip(null)}
          onFocus={() =>
            setActiveTooltip({
              id: "draft",
              title: "Negotiated Agreement Draft",
              desc: "Pareto-optimal terms approved by mechanism guardrail",
              details: [
                "Opening ask: USD 3,800.00",
                "Negotiated draft: USD 3,700.00 (8 days)",
                "Buyer utility score Ub(x) = 0.84",
                "Boulware threshold satisfied: Ub ≥ tau(t)",
                "Status: Awaiting buyer checkout approval",
              ],
              x: 165,
              y: 80,
            })
          }
          onBlur={() => setActiveTooltip(null)}
          style={{ cursor: "pointer" }}
        >
          {/* Card Body in Light Mint */}
          <rect
            x="0"
            y="0"
            width="172"
            height="154"
            rx="12"
            fill="#dcefe2"
            stroke="#86efac"
            strokeWidth="1.2"
            filter="url(#workflow-draft-shadow)"
          />
          <rect x="0" y="0" width="172" height="25" rx="12" fill="#cbf1d5" />
          <path d="M 0 13 H 172 V 25 H 0 Z" fill="#cbf1d5" />
          <text
            x="86"
            y="17"
            textAnchor="middle"
            fill="#166534"
            fontSize="9"
            fontWeight="700"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Negotiated Draft
          </text>
          <text className="sr-only" letterSpacing="0.04em">
            NEGOTIATED DRAFT
          </text>

          {/* Supplier A Tag */}
          <text
            x="14"
            y="43"
            fill="#14532d"
            fontSize="10.5"
            fontWeight="700"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Supplier A Draft Terms
          </text>

          {/* Comparison Row 1: Opening */}
          <text x="14" y="63" fill="#3f6212" fontSize="9" fontFamily="Inter, system-ui, -apple-system, sans-serif">
            Opening offer:
          </text>
          <text
            x="158"
            y="63"
            textAnchor="end"
            fill="#4b5563"
            fontSize="9.5"
            fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace"
            style={{ textDecoration: "line-through" }}
          >
            USD 3,800
          </text>

          {/* Comparison Row 2: Negotiated (Clear separate columns to eliminate overlap) */}
          <text
            x="14"
            y="83"
            fill="#166534"
            fontSize="9"
            fontWeight="600"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Negotiated:
          </text>
          <text
            x="158"
            y="83"
            textAnchor="end"
            fill="#14532d"
            fontSize="11.5"
            fontWeight="700"
            fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace"
          >
            USD 3,700 · 8d
          </text>

          {/* Savings Badge */}
          <rect x="14" y="97" width="144" height="21" rx="5" fill="#ffffff" stroke="#bbf7d0" strokeWidth="0.8" />
          <text
            x="86"
            y="111"
            textAnchor="middle"
            fill="#15803d"
            fontSize="8.5"
            fontWeight="600"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            ✓ Saves USD 100 · Within limits
          </text>

          {/* Policy Verification Micro-pill */}
          <text
            x="86"
            y="136"
            textAnchor="middle"
            fill="#1e3a1e"
            fontSize="8"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Buyer sign-off pending
          </text>
        </g>

        {/* 5. Lower Policy Rail / Mathematical Guardrail Indicator */}
        <g transform="translate(18, 202)">
          <rect
            x="0"
            y="0"
            width="506"
            height="44"
            rx="7"
            fill="#f6f3ee"
            stroke="#ded7cd"
            strokeWidth="1"
          />
          <text x="14" y="18" fill="#584b69" fontSize="9.5" fontWeight="700" fontFamily="Inter, system-ui, -apple-system, sans-serif">
            Mechanism Guardrail:
          </text>
          <text x="148" y="18" fill="#1c1917" fontSize="9" fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace">
            Ub(x) = 0.84 ≥ τ(t) (Boulware Pass)
          </text>
          <text x="14" y="33" fill="#686056" fontSize="8.5" fontFamily="Inter, system-ui, -apple-system, sans-serif">
            Anti-Thrashing: Monotonic price verified · Budget disclosure scan: 0 leaks
          </text>
          <text x="492" y="26" textAnchor="end" fill="#15803d" fontSize="9.5" fontWeight="700" fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace">
            ✓ Guardrail OK
          </text>
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
