"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export function StatusBadge({
  status,
  label,
  size = "md",
}: {
  status: "verified" | "warning" | "failure" | "info" | "neutral";
  label: string;
  size?: "sm" | "md";
}) {
  const styles = {
    verified: "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30",
    warning: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30",
    failure: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30",
    info: "bg-[#4597FF]/10 text-[#4597FF] border-[#4597FF]/30",
    neutral: "bg-[#203149]/40 text-[#94A3B8] border-[#203149]",
  };

  const dotStyles = {
    verified: "bg-[#22C55E]",
    warning: "bg-[#F59E0B]",
    failure: "bg-[#EF4444]",
    info: "bg-[#4597FF]",
    neutral: "bg-[#94A3B8]",
  };

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs font-medium";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${styles[status]} ${sizeClasses} tracking-wide select-none`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[status]}`} />
      <span>{label}</span>
    </span>
  );
}

export function MetricCard({
  title,
  value,
  subvalue,
  badge,
  icon: Icon,
  accent = "blue",
}: {
  title: string;
  value: string;
  subvalue?: string;
  badge?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: "blue" | "purple" | "emerald" | "amber";
}) {
  const accentBorders = {
    blue: "hover:border-[#4597FF]/40",
    purple: "hover:border-[#B58CDB]/40",
    emerald: "hover:border-[#22C55E]/40",
    amber: "hover:border-[#F59E0B]/40",
  };

  return (
    <div
      className={`bg-[#0B1728] border border-[#203149] rounded-xl p-5 transition-all duration-200 ${accentBorders[accent]}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">{title}</span>
        {badge && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#203149]/60 text-[#4597FF] border border-[#203149]">
            {badge}
          </span>
        )}
        {Icon && <Icon className="w-4 h-4 text-[#94A3B8]" />}
      </div>
      <div className="text-2xl font-semibold text-[#F1F5F9] tracking-tight">{value}</div>
      {subvalue && <div className="text-xs text-[#94A3B8] mt-1.5">{subvalue}</div>}
    </div>
  );
}

export function CopyableHash({
  hash,
  label,
  truncate = true,
}: {
  hash: string;
  label?: string;
  truncate?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const displayHash = truncate && hash.length > 20 ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : hash;

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="inline-flex items-center gap-2 bg-[#030B18] px-2.5 py-1 rounded-md border border-[#203149] text-xs font-crypto text-[#94A3B8]">
      {label && <span className="text-[10px] font-sans uppercase text-[#64748B]">{label}:</span>}
      <span className="text-[#F1F5F9]" title={hash}>
        {displayHash}
      </span>
      <button
        onClick={handleCopy}
        className="p-0.5 rounded hover:bg-[#203149] text-[#94A3B8] hover:text-[#4597FF] transition-colors"
        aria-label="Copy hash"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[#22C55E]" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export function CurrencyDisplay({
  amount,
  currency = "USD",
  size = "md",
  className = "",
}: {
  amount: number;
  currency?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2,
  });

  const sizeStyles = {
    sm: "text-sm",
    md: "text-base font-semibold",
    lg: "text-xl font-bold",
    xl: "text-3xl font-extrabold tracking-tight",
  };

  return <span className={`font-mono text-[#F1F5F9] ${sizeStyles[size]} ${className}`}>{formatter.format(amount)}</span>;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-[#0B1728] border border-dashed border-[#203149] rounded-xl p-10 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-8">
      <div className="w-12 h-12 rounded-full bg-[#101F33] flex items-center justify-center border border-[#203149] mb-4 text-[#4597FF]">
        <span className="text-xl font-mono">∅</span>
      </div>
      <h3 className="text-lg font-semibold text-[#F1F5F9] mb-1.5">{title}</h3>
      <p className="text-sm text-[#94A3B8] mb-6 max-w-md">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-lg bg-[#4597FF] hover:bg-[#4597FF]/90 text-white text-sm font-medium transition-colors shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
