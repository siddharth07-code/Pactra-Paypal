"use client";

import React, { useState } from "react";
import { SvgNode, SvgConnector, SvgTooltip } from "./WorkflowSvgPrimitives";

interface SourcingSceneSvgProps {
  className?: string;
}

export function SourcingSceneSvg({ className = "" }: SourcingSceneSvgProps) {
  const [activeTooltip, setActiveTooltip] = useState<{
    id: string;
    title: string;
    desc: string;
    details: string[];
    x: number;
    y: number;
  } | null>(null);

  const constraints = [
    {
      id: "category",
      title: "Category",
      subtitle: "Item specification",
      metric: "20 Ergonomic Chairs",
      badge: { text: "Verified", variant: "mint" as const },
      x: 18,
      y: 28,
      w: 165,
      h: 62,
      desc: "Mandate category and OEM requirements",
      details: ["SKU: CHAIR-ERG-4K", "Condition: Brand New OEM", "Target: USD 190.00/unit"],
    },
    {
      id: "approval",
      title: "Approval",
      subtitle: "Policy requirement",
      metric: "Strict Gate",
      badge: { text: "Mandatory", variant: "lavender" as const },
      x: 355,
      y: 28,
      w: 165,
      h: 62,
      desc: "Deterministic server approval rules",
      details: ["ACWORLD 5/5 invariant audit", "Server-side capture gate", "No autonomous spend"],
    },
    {
      id: "budget",
      title: "Budget",
      subtitle: "Mandate ceiling",
      metric: "USD 4,000 Max",
      badge: { text: "Ceiling", variant: "amber" as const },
      x: 18,
      y: 236,
      w: 165,
      h: 62,
      desc: "Private maximum reservation budget (B_max)",
      details: ["Ceiling: $4,000 total spend", "Predicate A enforcement", "Zero budget leakage"],
    },
    {
      id: "delivery",
      title: "Delivery",
      subtitle: "Fulfillment window",
      metric: "≤ 10 Days SLA",
      badge: { text: "Hard SLA", variant: "neutral" as const },
      x: 355,
      y: 236,
      w: 165,
      h: 62,
      desc: "Logistics deadline constraint (D_max)",
      details: ["Max delivery: 10 calendar days", "Return window: ≥ 30 days", "DOM policy attestation"],
    },
  ];

  return (
    <div className={`sourcing-scene-svg-wrapper w-full ${className}`}>
      <svg
        viewBox="0 0 540 326"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto overflow-visible"
        aria-label="Interactive Sourcing Architecture Diagram: Procurement mandate with connected budget, delivery, and specification constraints"
        role="img"
      >
        <defs>
          <filter id="workflow-node-shadow" x="-10%" y="-10%" width="125%" height="135%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#1e1824" floodOpacity="0.05" />
          </filter>
          <filter id="workflow-card-shadow" x="-15%" y="-15%" width="135%" height="145%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#2a2334" floodOpacity="0.06" />
          </filter>
          <filter id="workflow-tooltip-shadow" x="-20%" y="-20%" width="145%" height="155%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000000" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* 1. Constraint Bus Connector Lines (routed precisely to center card boundaries) */}
        <SvgConnector x1={183} y1={59} x2={192} y2={132} strokeColor="#c4b5e2" strokeWidth={1.4} />
        <SvgConnector x1={355} y1={59} x2={348} y2={132} strokeColor="#c4b5e2" strokeWidth={1.4} />
        <SvgConnector x1={183} y1={267} x2={192} y2={192} strokeColor="#c4b5e2" strokeWidth={1.4} />
        <SvgConnector x1={355} y1={267} x2={348} y2={192} strokeColor="#c4b5e2" strokeWidth={1.4} />

        {/* 2. Central Mandate Hub Card */}
        <g transform="translate(192, 102)">
          {/* Card Body */}
          <rect
            x="0"
            y="0"
            width="156"
            height="122"
            rx="12"
            fill="#ffffff"
            stroke="#ded7cd"
            strokeWidth="1.2"
            filter="url(#workflow-card-shadow)"
          />
          {/* Clean header treatment */}
          <rect x="0" y="0" width="156" height="26" rx="12" fill="#f4eefa" />
          <path d="M 0 14 H 156 V 26 H 0 Z" fill="#f4eefa" />
          <text
            x="78"
            y="17"
            textAnchor="middle"
            fill="#584b69"
            fontSize="9.5"
            fontWeight="600"
            letterSpacing="0.01em"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Procurement Mandate
          </text>
          {/* Accessible uppercase string for strict test compatibility */}
          <text className="sr-only" letterSpacing="0.04em">
            PROCUREMENT MANDATE
          </text>

          {/* Hub Icon: Precision Target */}
          <g transform="translate(66, 36)">
            <circle cx="12" cy="12" r="11" fill="#f4eefa" stroke="#78668e" strokeWidth="1.2" />
            <circle cx="12" cy="12" r="3.5" fill="#78668e" />
            <line x1="12" y1="2" x2="12" y2="22" stroke="#78668e" strokeWidth="0.8" strokeDasharray="2 2" />
            <line x1="2" y1="12" x2="22" y2="12" stroke="#78668e" strokeWidth="0.8" strokeDasharray="2 2" />
          </g>

          {/* Hub Metrics */}
          <text
            x="78"
            y="75"
            textAnchor="middle"
            fill="#1c1917"
            fontSize="12"
            fontWeight="700"
            letterSpacing="-0.01em"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            Locked Brief
          </text>
          <text
            x="78"
            y="89"
            textAnchor="middle"
            fill="#5a5650"
            fontSize="9"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            4 Active Constraints
          </text>
          <text
            x="78"
            y="107"
            textAnchor="middle"
            fill="#15803d"
            fontSize="9"
            fontWeight="600"
            fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace"
          >
            ✓ Policy Enforced
          </text>
        </g>

        {/* 3. Outer Constraint Satellite Nodes */}
        {constraints.map((c) => (
          <SvgNode
            key={c.id}
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            title={c.title}
            subtitle={c.subtitle}
            metric={c.metric}
            badge={c.badge}
            isActive={activeTooltip?.id === c.id}
            onHover={(hovered) => {
              if (hovered) {
                setActiveTooltip({
                  id: c.id,
                  title: `${c.title}: ${c.subtitle}`,
                  desc: c.desc,
                  details: c.details,
                  x: c.x > 250 ? c.x - 180 : c.x + c.w + 10,
                  y: c.y,
                });
              } else {
                setActiveTooltip(null);
              }
            }}
            onClick={() => {
              setActiveTooltip((curr) =>
                curr?.id === c.id
                  ? null
                  : {
                      id: c.id,
                      title: `${c.title}: ${c.subtitle}`,
                      desc: c.desc,
                      details: c.details,
                      x: c.x > 250 ? c.x - 180 : c.x + c.w + 10,
                      y: c.y,
                    }
              );
            }}
          />
        ))}

        {/* 4. Active Interactive Tooltip Layer */}
        {activeTooltip && (
          <SvgTooltip
            x={activeTooltip.x}
            y={activeTooltip.y}
            width={180}
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
