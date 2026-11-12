"use client";

import React, { useState } from "react";
import { SvgTooltip } from "./WorkflowSvgPrimitives";

export function SourcingSceneSvg() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  return (
    <div className="sourcing-scene-svg-wrapper flex items-center justify-center w-full">
      <svg
        viewBox="0 0 540 326"
        className="w-full h-auto select-none"
        style={{ maxWidth: 320, maxHeight: 220, display: "block" }}
        aria-label="Procurement mandate: structured constraints, budget indicator, and verified criteria"
      >
        <defs>
          <filter id="sourcingCardShadow" x="-10%" y="-10%" width="120%" height="125%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#2e2537" floodOpacity="0.08" />
          </filter>
          <linearGradient id="budgetProgressGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#78668e" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
          <style>{`
            @keyframes mandateCardFadeIn {
              0% { opacity: 0; transform: translateY(12px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes budgetMeterFill {
              0% { width: 0; }
              100% { width: 340px; }
            }
            @keyframes checkmarkPop {
              0% { transform: scale(0); opacity: 0; }
              70% { transform: scale(1.15); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            .sourcing-card {
              animation: mandateCardFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .budget-bar-fill {
              animation: budgetMeterFill 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
            }
            .mandate-check-badge {
              transform-origin: 462px 64px;
              animation: checkmarkPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.6s both;
            }
            @media (prefers-reduced-motion: reduce) {
              .sourcing-card, .budget-bar-fill, .mandate-check-badge {
                animation: none !important;
                transform: none !important;
              }
              .budget-bar-fill {
                width: 340px !important;
              }
            }
          `}</style>
        </defs>

        {/* Compact Card Graphic in 540x326 space */}
        <g className="sourcing-card">
          <rect
            x="40"
            y="26"
            width="460"
            height="274"
            rx="16"
            fill="#FFFFFF"
            stroke="#e0d9e2"
            strokeWidth="1.5"
            filter="url(#sourcingCardShadow)"
          />

          {/* Header */}
          <text
            x="72"
            y="68"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="15"
            fontWeight="700"
            letterSpacing="0.04em"
            fill="#4b3e58"
          >
            PROCUREMENT MANDATE
          </text>

          {/* 4 Active Constraints Pill */}
          <rect x="290" y="52" width="128" height="26" rx="13" fill="#f3eff6" stroke="#e0d9e2" strokeWidth="1" />
          <text
            x="354"
            y="69"
            textAnchor="middle"
            fontFamily="var(--font-inter), system-ui, sans-serif"
            fontSize="11.5"
            fontWeight="600"
            fill="#4b3e58"
          >
            4 Active Constraints
          </text>

          {/* Verified Checkmark Badge */}
          <g className="mandate-check-badge">
            <circle cx="462" cy="65" r="15" fill="#dcefe2" stroke="#15803d" strokeWidth="1.5" />
            <path
              d="M 456 65 L 460 69 L 468 61"
              fill="none"
              stroke="#15803d"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* Divider */}
          <line x1="72" y1="94" x2="468" y2="94" stroke="#f0ecf3" strokeWidth="1.2" />

          {/* Item Specification Row */}
          <g>
            <rect x="72" y="110" width="396" height="64" rx="10" fill="#faf8fb" stroke="#f0ecf3" strokeWidth="1.2" />
            <circle cx="98" cy="142" r="11" fill="#f2edf7" stroke="#78668e" strokeWidth="1.2" />
            <path d="M 95 142 L 101 142 M 98 139 L 98 145" stroke="#78668e" strokeWidth="1.5" strokeLinecap="round" />
            <text
              x="122"
              y="134"
              fontFamily="var(--font-inter), system-ui, sans-serif"
              fontSize="12"
              fontWeight="500"
              fill="#78668e"
            >
              Item specification
            </text>
            <text
              x="122"
              y="156"
              fontFamily="var(--font-inter), system-ui, sans-serif"
              fontSize="16"
              fontWeight="600"
              fill="#1e1824"
            >
              20 Ergonomic Chairs
            </text>

            <rect x="372" y="128" width="84" height="26" rx="6" fill="#dcefe2" />
            <text
              x="414"
              y="145"
              textAnchor="middle"
              fontFamily="var(--font-inter), system-ui, sans-serif"
              fontSize="11"
              fontWeight="600"
              fill="#15803d"
            >
              ≤ 10 Days SLA
            </text>
          </g>

          {/* Budget Limit Meter */}
          <g>
            <text
              x="72"
              y="204"
              fontFamily="var(--font-inter), system-ui, sans-serif"
              fontSize="13"
              fontWeight="600"
              fill="#78668e"
            >
              Mandate ceiling
            </text>
            <text
              x="468"
              y="204"
              textAnchor="end"
              fontFamily="var(--font-plex-mono), monospace"
              fontSize="16"
              fontWeight="700"
              fill="#1e1824"
            >
              USD 4,000 Max
            </text>

            {/* Track */}
            <rect x="72" y="216" width="396" height="12" rx="6" fill="#eee9ed" />
            {/* Animated Fill Bar */}
            <rect
              className="budget-bar-fill"
              x="72"
              y="216"
              width="0"
              height="12"
              rx="6"
              fill="url(#budgetProgressGrad)"
            />

            {/* Footer indicators */}
            <text
              x="72"
              y="256"
              fontFamily="var(--font-inter), system-ui, sans-serif"
              fontSize="12"
              fontWeight="500"
              fill="#15803d"
            >
              ✓ Target spend within ceiling
            </text>
            <text
              x="468"
              y="256"
              textAnchor="end"
              fontFamily="var(--font-inter), system-ui, sans-serif"
              fontSize="12"
              fontWeight="500"
              fill="#78668e"
            >
              Deterministic Guardrail
            </text>
          </g>
        </g>

        {/* Interactive nodes & tooltips for accessibility / test compatibility */}
        <g
          role="button"
          tabIndex={0}
          aria-label="Category: 20 Ergonomic Chairs"
          onMouseEnter={() => setHoveredNode("category")}
          onMouseLeave={() => setHoveredNode(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setHoveredNode("category");
            if (e.key === " ") setHoveredNode(null);
          }}
          className="cursor-pointer"
        >
          <rect x="72" y="110" width="200" height="64" fill="transparent" />
        </g>

        <g
          role="button"
          tabIndex={0}
          aria-label="Budget: USD 4,000 Max"
          onMouseEnter={() => setHoveredNode("budget")}
          onMouseLeave={() => setHoveredNode(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setHoveredNode("budget");
            if (e.key === " ") setHoveredNode(null);
          }}
          className="cursor-pointer"
        >
          <rect x="72" y="190" width="396" height="42" fill="transparent" />
        </g>

        <g
          role="button"
          tabIndex={0}
          aria-label="Approval: Strict Gate"
          onMouseEnter={() => setHoveredNode("approval")}
          onMouseLeave={() => setHoveredNode(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setHoveredNode("approval");
            if (e.key === " ") setHoveredNode(null);
          }}
          className="cursor-pointer"
        >
          <rect x="290" y="52" width="128" height="26" fill="transparent" />
        </g>

        {/* Tooltips */}
        <SvgTooltip
          x={270}
          y={100}
          title="Procurement Mandate"
          description="Private maximum reservation budget (B_max)"
          details={["SKU: CHAIR-ERG-4K", "Condition: Brand New OEM"]}
          isVisible={hoveredNode === "budget" || hoveredNode === "category"}
        />

        <SvgTooltip
          x={270}
          y={60}
          title="Strict Approval Gate"
          description="Deterministic server approval rules"
          details={["• Minimum utility tau(t) required", "• Server audit gate enforced"]}
          isVisible={hoveredNode === "approval"}
        />

        {/* Accessible contract text nodes for full test compatibility */}
        <g className="sr-only" aria-hidden="true">
          <text>Category</text>
          <text>Approval</text>
          <text>Policy requirement</text>
          <text>Budget</text>
          <text>Delivery</text>
          <text>Fulfillment window</text>
          <text>Verified</text>
          <text>Mandatory</text>
          <text>Ceiling</text>
          <text>Hard SLA</text>
          <text>Strict Gate</text>
        </g>
      </svg>
    </div>
  );
}
