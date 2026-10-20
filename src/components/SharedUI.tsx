"use client";

import React, { useState } from "react";
import { Copy, Check, ArrowRight } from "lucide-react";

/**
 * Lithic Primary CTA Button (DESIGN.md: Primary CTA Button)
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
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2.5 px-9 py-3 rounded-buttons bg-ember-orange hover:bg-[#e65c00] active:scale-[0.99] text-paper-white font-medium text-[16px] tracking-[-0.32px] transition-all shadow-[0px_4px_8px_0px_rgba(0,0,0,0.1)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
    </button>
  );
}

/**
 * Lithic Ghost Navigation Button (DESIGN.md: Ghost Navigation Button)
 * Transparent background with 1px #000000 border, black text weight 500 at 16px,
 * 8px border-radius, 10px vertical and 16px horizontal padding, trailing arrow icon.
 */
export function GhostButton({
  children,
  onClick,
  disabled = false,
  className = "",
  type = "button",
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-smallelements bg-transparent border border-obsidian hover:bg-obsidian/5 text-obsidian font-medium text-[16px] tracking-[-0.32px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian focus-visible:ring-offset-2 ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

/**
 * Warm Feature Card (DESIGN.md: Warm Feature Card)
 * #f6f3ee background, 24px radius, 40px internal padding, subtle hairline border.
 */
export function WarmFeatureCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-warm-cream rounded-cards p-8 sm:p-10 border border-smoke shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Lavender Feature Panel (DESIGN.md: Lavender Feature Panel)
 * #f6f1fe background, 24px radius, 40px padding, violet accent, concentric arc decoration.
 */
export function LavenderFeaturePanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-lavender-mist rounded-cards p-8 sm:p-10 border border-architect-violet/20 concentric-arcs-violet ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Mint Metric Callout (DESIGN.md: Mint Metric Callout)
 * #ebfef6 background, 24px radius, compact padding, green accent border.
 */
export function MintMetricCallout({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-mint-whisper rounded-cards p-6 border border-lichen-green/30 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Standardized Section Header
 */
export function SectionHeader({
  title,
  subtitle,
  badge,
  className = "",
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 pb-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.72px] text-obsidian leading-[1.2]">
          {title}
        </h2>
        {badge && <div>{badge}</div>}
      </div>
      {subtitle && (
        <p className="text-[16px] text-[#555555] font-normal leading-[1.5] tracking-[-0.32px]">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * Standardized Form Input with Accessibility Label & Error Feedback
 */
export function FormInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  min,
  prefix,
  disabled = false,
  className = "",
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  min?: number | string;
  prefix?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-[14px] font-medium text-obsidian tracking-[-0.28px]">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3.5 top-2.5 text-[15px] text-[#666666] font-medium select-none" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={type}
          min={min}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full bg-warm-cream rounded-smallelements py-2.5 text-[15px] text-obsidian border transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:border-transparent ${
            prefix ? "pl-8 pr-3.5" : "px-3.5"
          } ${error ? "border-[#ef4444] bg-[#feeef0]/20" : "border-smoke hover:border-obsidian/30"}`}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-[#ef4444] font-normal tracking-[-0.2px]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Lithic Status Badge (DESIGN.md: Availability Status Badge)
 * Inline badge: 6-8px filled circle followed by label text in #000000 at 14px weight 400.
 */
export function StatusBadge({
  status,
  label,
}: {
  status: "verified" | "warning" | "failure" | "info" | "neutral";
  label: string;
}) {
  const dotColors = {
    verified: "bg-lichen-green",
    warning: "bg-ember-orange",
    failure: "bg-[#ef4444]",
    info: "bg-architect-violet",
    neutral: "bg-ash-gray",
  };

  const bgStyles = {
    verified: "bg-mint-whisper border-lichen-green/30 text-obsidian",
    warning: "bg-[#fff2e6] border-ember-orange/30 text-obsidian",
    failure: "bg-[#feeef0] border-[#ef4444]/30 text-[#ef4444]",
    info: "bg-lavender-mist border-architect-violet/30 text-obsidian",
    neutral: "bg-warm-cream border-smoke text-obsidian",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-cards px-3 py-1 border text-[14px] font-normal select-none tracking-[-0.28px] ${bgStyles[status]}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColors[status]}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/**
 * Copyable cryptographic hash badge
 * Safely handles uncommitted state without displaying mock data.
 */
export function CopyableHash({
  hash,
  label,
  truncate = true,
}: {
  hash?: string;
  label?: string;
  truncate?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!hash) {
    return (
      <div className="inline-flex items-center gap-2 bg-warm-cream px-3 py-1.5 rounded-smallelements border border-smoke text-[13px] font-mono-token text-ash-gray">
        {label && <span className="font-sans text-[#666666] font-medium">{label}:</span>}
        <span className="italic">Uncommitted</span>
      </div>
    );
  }

  const displayHash = truncate && hash.length > 20 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash;

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="inline-flex items-center gap-2 bg-paper-white px-3.5 py-1.5 rounded-smallelements border border-smoke text-xs font-mono-token text-bark-brown">
      {label && <span className="font-sans text-[#666666] font-medium">{label}:</span>}
      <span className="text-obsidian font-mono" title={hash}>
        {displayHash}
      </span>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-warm-cream text-ash-gray hover:text-ember-orange transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
        aria-label={`Copy hash ${hash}`}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-lichen-green" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
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
    sm: "text-[14px] font-medium tracking-[-0.28px]",
    md: "text-[16px] font-medium tracking-[-0.32px]",
    lg: "text-[24px] font-medium tracking-[-0.48px]",
    xl: "text-[36px] font-medium tracking-[-0.72px]",
  };

  return <span className={`text-obsidian ${sizeStyles[size]} ${className}`}>{formatter.format(amount)}</span>;
}

/**
 * Editorial Empty State on Warm Cream (DESIGN.md: Warm Feature Card with circular emblem)
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
    <div className="bg-warm-cream rounded-cards p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-6 border border-smoke">
      <div className="w-12 h-12 rounded-full bg-paper-white border border-smoke flex items-center justify-center mb-4 text-architect-violet shadow-[0px_4px_8px_0px_rgba(0,0,0,0.06)]" aria-hidden="true">
        <span className="text-xl font-normal">∅</span>
      </div>
      <h3 className="text-[20px] font-medium text-obsidian mb-2 tracking-[-0.4px]">{title}</h3>
      <p className="text-[14px] text-[#555555] mb-6 max-w-sm leading-relaxed tracking-[-0.28px]">{description}</p>
      {actionLabel && onAction && (
        <PrimaryButton onClick={onAction}>
          {actionLabel}
        </PrimaryButton>
      )}
    </div>
  );
}
