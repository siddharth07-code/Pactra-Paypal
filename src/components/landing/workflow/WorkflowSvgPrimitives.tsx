"use client";

import React from "react";

export interface SvgNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  title: string;
  subtitle?: string;
  metric?: string;
  badge?: {
    text: string;
    variant: "mint" | "lavender" | "amber" | "neutral";
  };
  isActive?: boolean;
  isFocused?: boolean;
  className?: string;
  onClick?: () => void;
  onHover?: (hovered: boolean) => void;
  ariaLabel?: string;
}

export function SvgNode({
  x,
  y,
  width,
  height,
  rx = 10,
  title,
  subtitle,
  metric,
  badge,
  isActive = false,
  isFocused = false,
  className = "",
  onClick,
  onHover,
  ariaLabel,
}: SvgNodeProps) {
  const badgeColors = {
    mint: { bg: "#dcefe2", text: "#15803d", stroke: "#86efac" },
    lavender: { bg: "#f2edf7", text: "#584b69", stroke: "#c4b5e2" },
    amber: { bg: "#fef3c7", text: "#92400e", stroke: "#fcd34d" },
    neutral: { bg: "#f5f3ef", text: "#5a5650", stroke: "#ded7cd" },
  };

  const badgeStyle = badge ? badgeColors[badge.variant] : badgeColors.neutral;

  // Reserve monospace strictly for financial values, hashes, and mathematical expressions
  const isMonospaceMetric =
    metric && (metric.includes("USD") || metric.includes("$") || metric.includes("0x") || metric.includes("Ub"));

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={`workflow-svg-node select-none transition-transform duration-200 cursor-pointer ${className}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel || `${title}${metric ? `: ${metric}` : ""}`}
    >
      {/* Node Base Surface */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx={rx}
        fill={isActive ? "#ffffff" : "#fbf9f6"}
        stroke={isFocused || isActive ? "#78668e" : "#ded7cd"}
        strokeWidth={isFocused || isActive ? "1.5" : "1"}
        filter="url(#workflow-node-shadow)"
      />

      {/* Title */}
      <text
        x="12"
        y={metric ? 20 : height / 2 + 4}
        fill="#1c1917"
        fontSize="11.5"
        fontWeight="600"
        letterSpacing="-0.01em"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
      >
        {title}
      </text>

      {/* Subtitle / Description */}
      {subtitle && (
        <text
          x="12"
          y="34"
          fill="#686056"
          fontSize="9"
          fontFamily="Inter, system-ui, -apple-system, sans-serif"
        >
          {subtitle}
        </text>
      )}

      {/* Metric Callout */}
      {metric && (
        <text
          x="12"
          y={subtitle ? 50 : 38}
          fill="#1c1917"
          fontSize={isMonospaceMetric ? "12" : "11.5"}
          fontWeight={isMonospaceMetric ? "700" : "600"}
          fontFamily={
            isMonospaceMetric
              ? "var(--font-plex-mono), SFMono-Regular, Menlo, monospace"
              : "Inter, system-ui, -apple-system, sans-serif"
          }
        >
          {metric}
        </text>
      )}

      {/* Status Badge */}
      {badge && (
        <g transform={`translate(${width - 64}, 8)`}>
          <rect
            x="0"
            y="0"
            width="54"
            height="17"
            rx="4"
            fill={badgeStyle.bg}
            stroke={badgeStyle.stroke}
            strokeWidth="0.8"
          />
          <text
            x="27"
            y="11.5"
            textAnchor="middle"
            fill={badgeStyle.text}
            fontSize="8"
            fontWeight="600"
            letterSpacing="0.01em"
            fontFamily="Inter, system-ui, -apple-system, sans-serif"
          >
            {badge.text}
          </text>
        </g>
      )}
    </g>
  );
}

export interface SvgConnectorProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  variant?: "solid" | "dashed" | "pulse";
  strokeColor?: string;
  strokeWidth?: number;
  showTerminalDots?: boolean;
  className?: string;
}

export function SvgConnector({
  x1,
  y1,
  x2,
  y2,
  variant = "solid",
  strokeColor = "#c4b5e2",
  strokeWidth = 1.4,
  showTerminalDots = true,
  className = "",
}: SvgConnectorProps) {
  // Orthogonal path generation
  const midX = (x1 + x2) / 2;
  const pathD = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

  return (
    <g className={`workflow-svg-connector pointer-events-none ${className}`}>
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={variant === "dashed" ? "4 3" : undefined}
        strokeLinecap="round"
      />
      {showTerminalDots && (
        <>
          <circle cx={x1} cy={y1} r="2.2" fill={strokeColor} />
          <circle cx={x2} cy={y2} r="2.2" fill={strokeColor} />
        </>
      )}
    </g>
  );
}

export interface SvgTooltipProps {
  x: number;
  y: number;
  width?: number;
  height?: number;
  title: string;
  description: string;
  details?: string[];
  isVisible: boolean;
}

export function SvgTooltip({
  x,
  y,
  width = 190,
  height = 46,
  title,
  description,
  details = [],
  isVisible,
}: SvgTooltipProps) {
  if (!isVisible) return null;

  const totalHeight = height + details.length * 13;

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className="workflow-svg-tooltip pointer-events-none transition-opacity duration-150"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <rect
        x="0"
        y="0"
        width={width}
        height={totalHeight}
        rx="6"
        fill="#111111"
        stroke="#2e2b26"
        strokeWidth="1"
        filter="url(#workflow-tooltip-shadow)"
      />
      <text
        x="10"
        y="16"
        fill="#f5f3ef"
        fontSize="10"
        fontWeight="600"
        letterSpacing="-0.01em"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
      >
        {title}
      </text>
      <text
        x="10"
        y="29"
        fill="#8a857d"
        fontSize="8.5"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
      >
        {description}
      </text>
      {details.map((detail, idx) => (
        <text
          key={idx}
          x="10"
          y={42 + idx * 13}
          fill="#d5cfc5"
          fontSize="8"
          fontFamily="var(--font-plex-mono), SFMono-Regular, Menlo, monospace"
        >
          • {detail}
        </text>
      ))}
    </g>
  );
}
