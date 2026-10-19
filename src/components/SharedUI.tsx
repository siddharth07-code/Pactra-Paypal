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
    verified: "bg-[#22C55E]/10 text-[#22C55E]",
    warning: "bg-[#F59E0B]/10 text-[#F59E0B]",
    failure: "bg-[#EF4444]/10 text-[#EF4444]",
    info: "bg-[#5B9CFF]/10 text-[#5B9CFF]",
    neutral: "bg-[#1A293D] text-[#9AAAC0]",
  };

  const dotStyles = {
    verified: "bg-[#22C55E]",
    warning: "bg-[#F59E0B]",
    failure: "bg-[#EF4444]",
    info: "bg-[#5B9CFF]",
    neutral: "bg-[#9AAAC0]",
  };

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs font-medium" : "px-2.5 py-1 text-xs font-medium";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${styles[status]} ${sizeClasses} select-none`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[status]}`} />
      <span>{label}</span>
    </span>
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

  const displayHash = truncate && hash.length > 20 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash;

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="inline-flex items-center gap-2 bg-[#0D1B2B] px-3 py-1.5 rounded-lg border border-[#23354B] text-xs font-mono-token text-[#9AAAC0]">
      {label && <span className="text-[11px] font-sans text-[#64758E] font-medium">{label}:</span>}
      <span className="text-[#F3F6FC]" title={hash}>
        {displayHash}
      </span>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-[#132438] text-[#9AAAC0] hover:text-[#5B9CFF] transition-colors"
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
    sm: "text-sm font-medium",
    md: "text-base font-semibold",
    lg: "text-xl font-bold tracking-tight",
    xl: "text-3xl font-bold tracking-tight",
  };

  return <span className={`text-[#F3F6FC] ${sizeStyles[size]} ${className}`}>{formatter.format(amount)}</span>;
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
    <div className="bg-[#0D1B2B] rounded-2xl p-10 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-6 border border-[#23354B]/60 card-shadow">
      <div className="w-12 h-12 rounded-2xl bg-[#132438] flex items-center justify-center mb-4 text-[#5B9CFF]">
        <span className="text-xl font-light">∅</span>
      </div>
      <h3 className="text-base font-semibold text-[#F3F6FC] mb-1.5">{title}</h3>
      <p className="text-sm text-[#9AAAC0] mb-6 max-w-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 rounded-xl bg-[#5B9CFF] hover:bg-[#458AF0] text-[#07111F] font-semibold text-sm transition-all shadow-md shadow-[#5B9CFF]/15 cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
