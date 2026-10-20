"use client";

import React, { useState } from "react";
import { Copy, Check, ArrowRight } from "lucide-react";

/**
 * Lithic Primary CTA Button
 * Filled button: #ff6600 background, white text, 24px border-radius,
 * 12px vertical and 38px horizontal padding, 0px 4px 8px 0px rgba(0,0,0,0.1) shadow.
 * Includes a trailing arrow icon.
 */
export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2.5 px-9 py-3 rounded-[24px] bg-[#ff6600] hover:bg-[#e65c00] active:scale-[0.99] text-[#ffffff] font-medium text-[16px] transition-all shadow-[0px_4px_8px_0px_rgba(0,0,0,0.1)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0 stroke-[2.5]" />
    </button>
  );
}

/**
 * Lithic Ghost Navigation Button
 * Transparent background with 1px #000000 border, black text weight 500 at 16px,
 * 8px border-radius, 10px vertical and 16px horizontal padding, trailing arrow icon.
 */
export function GhostButton({
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[8px] bg-transparent border border-[#000000] hover:bg-[#000000]/5 text-[#000000] font-medium text-[16px] transition-all cursor-pointer disabled:opacity-50 ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0" />
    </button>
  );
}

/**
 * Lithic Status Badge
 * Available Status Badge: small inline group with 6-8px filled circle in #00cc88 or status color
 * followed by label text in #000000 at 14px weight 400.
 */
export function StatusBadge({
  status,
  label,
}: {
  status: "verified" | "warning" | "failure" | "info" | "neutral";
  label: string;
}) {
  const dotColors = {
    verified: "bg-[#00cc88]",
    warning: "bg-[#ff6600]",
    failure: "bg-[#ef4444]",
    info: "bg-[#5c2999]",
    neutral: "bg-[#888888]",
  };

  const bgStyles = {
    verified: "bg-[#ebfef6] border-[#00cc88]/30",
    warning: "bg-[#fff2e6] border-[#ff6600]/30",
    failure: "bg-[#feeef0] border-[#ef4444]/30",
    info: "bg-[#f6f1fe] border-[#5c2999]/30",
    neutral: "bg-[#f6f3ee] border-[#e5e5e5]",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[24px] px-3 py-1 border text-[14px] text-[#000000] font-normal select-none ${bgStyles[status]}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColors[status]}`} />
      <span>{label}</span>
    </span>
  );
}

/**
 * Copyable cryptographic hash badge
 */
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
    <div className="inline-flex items-center gap-2 bg-[#ffffff] px-3.5 py-1.5 rounded-[8px] border border-[#e5e5e5] text-xs font-mono-token text-[#665233]">
      {label && <span className="font-sans text-[#888888] font-medium">{label}:</span>}
      <span className="text-[#000000] font-mono" title={hash}>
        {displayHash}
      </span>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-[#f6f3ee] text-[#888888] hover:text-[#ff6600] transition-colors cursor-pointer"
        aria-label="Copy hash"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[#00cc88]" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/**
 * CurrencyDisplay formatted with editorial typography
 */
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
    sm: "text-[14px] font-medium",
    md: "text-[16px] font-medium",
    lg: "text-[24px] font-medium tracking-tight",
    xl: "text-[36px] font-medium tracking-tight",
  };

  return <span className={`text-[#000000] ${sizeStyles[size]} ${className}`}>{formatter.format(amount)}</span>;
}

/**
 * Editorial Empty State on Warm Cream
 */
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
    <div className="bg-[#f6f3ee] rounded-[24px] p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-6 border border-[#e5e5e5]">
      <div className="w-12 h-12 rounded-[800px] bg-[#ffffff] border border-[#e5e5e5] flex items-center justify-center mb-4 text-[#5c2999] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.06)]">
        <span className="text-xl font-light">∅</span>
      </div>
      <h3 className="text-[20px] font-medium text-[#000000] mb-2">{title}</h3>
      <p className="text-[14px] text-[#888888] mb-6 max-w-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <PrimaryButton onClick={onAction}>
          {actionLabel}
        </PrimaryButton>
      )}
    </div>
  );
}
