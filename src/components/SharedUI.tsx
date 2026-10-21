"use client";

import React, { useState, useEffect } from "react";
import {
  Copy,
  Check,
  ArrowRight,
  Sun,
  Moon,
  ArrowUp,
  X,
  AlertTriangle,
} from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

/**
 * Institutional Primary CTA Button
 * Structured 8px radius, consistent 40px height, ember orange brand action,
 * WCAG 2.2 AA compliant contrast, no oversized 24px pill rounding.
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
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 h-10 rounded-[8px] bg-ember-orange hover:bg-[#e65c00] active:scale-[0.99] text-white font-medium text-[14px] tracking-[-0.01em] transition-colors shadow-2xs cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111113] select-none ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0 stroke-[2.2]" aria-hidden="true" />
    </button>
  );
}

/**
 * Institutional Secondary / Ghost Navigation Button
 * Crisp hairline border, neutral surface, 8px radius, 40px height.
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
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 h-10 rounded-[8px] bg-paper-white dark:bg-[#18181b] border border-smoke dark:border-[#2b2b32] hover:bg-smoke/40 dark:hover:bg-[#222227] text-obsidian dark:text-[#f6f4f0] font-medium text-[14px] tracking-[-0.01em] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111113] select-none ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0 opacity-70" aria-hidden="true" />
    </button>
  );
}

/**
 * Editorial Feature Card
 * Standard 12px radius, restrained padding, crisp border, zero AI slop.
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
      className={`bg-paper-white dark:bg-[#18181b] rounded-cards p-6 sm:p-7 border border-smoke dark:border-[#2b2b32] shadow-card transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * VeriPay Panel (Restrained Violet Identifier Accent)
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
      className={`bg-lavender-mist/60 dark:bg-[#1e172a] rounded-cards p-6 sm:p-7 border border-architect-violet/20 dark:border-architect-violet/35 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Metric Callout Panel
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
      className={`bg-mint-whisper dark:bg-[#10211a] rounded-cards p-5 sm:p-6 border border-lichen-green/25 dark:border-lichen-green/35 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Standardized Section Header
 * Coherent typography: 24-28px heading, 14px muted subtitle.
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
        <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.025em] text-obsidian dark:text-[#f6f4f0] leading-[1.2]">
          {title}
        </h2>
        {badge && <div>{badge}</div>}
      </div>
      {subtitle && (
        <p className="text-[14px] text-[#4a4a52] dark:text-[#b8b5af] font-normal leading-[1.5] max-w-3xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * Standardized Form Input with Accessibility Label & Error Feedback
 * Consistent 40px height, 8px radius, high contrast labels, visible focus ring.
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
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-obsidian dark:text-[#f6f4f0] tracking-[-0.01em]"
      >
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span
            className="absolute left-3.5 top-2.5 text-[14px] text-[#6e6e78] dark:text-[#8e8a83] font-medium select-none pointer-events-none"
            aria-hidden="true"
          >
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
          className={`w-full h-10 bg-paper-white dark:bg-[#18181b] rounded-[8px] py-2 text-[14px] text-obsidian dark:text-[#f6f4f0] border transition-colors disabled:opacity-50 placeholder:text-[#8e8a83] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange ${
            prefix ? "pl-8 pr-3.5" : "px-3.5"
          } ${
            error
              ? "border-[#ef4444] bg-[#feeef0]/20 dark:bg-[#feeef0]/10"
              : "border-smoke dark:border-[#2b2b32] hover:border-obsidian/30 dark:hover:border-white/30"
          }`}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-[#dc2626] dark:text-[#f87171] font-normal">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Precision Institutional Status Badge
 * Compact, restrained status indicator with 6px dot + label text.
 * WCAG 2.2 AA non-color dependency compliant.
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
    info: "bg-architect-violet dark:bg-[#a78bfa]",
    neutral: "bg-ash-gray",
  };

  const bgStyles = {
    verified: "bg-mint-whisper dark:bg-[#10211a] border-lichen-green/25 text-[#006840] dark:text-[#4ade80]",
    warning: "bg-[#fff7ed] dark:bg-[#2b1708] border-ember-orange/25 text-[#c2410c] dark:text-[#fb923c]",
    failure: "bg-[#fef2f2] dark:bg-[#2a1012] border-[#ef4444]/25 text-[#b91c1c] dark:text-[#f87171]",
    info: "bg-lavender-mist dark:bg-[#1f162c] border-architect-violet/25 text-architect-violet dark:text-[#c4b5fd]",
    neutral: "bg-warm-cream/80 dark:bg-[#1e1e22] border-smoke dark:border-[#2b2b32] text-[#4a4a52] dark:text-[#b8b5af]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-0.5 border text-[12px] font-medium select-none tracking-[-0.01em] ${bgStyles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[status]}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/**
 * Copyable Cryptographic Hash Badge
 * Monospace token with one-click copy, formatted for high density and technical clarity.
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
      <div className="inline-flex items-center gap-2 bg-warm-cream/60 dark:bg-[#1c1c20] px-3 py-1.5 rounded-[6px] border border-smoke dark:border-[#2b2b32] text-[12px] font-mono-token text-ash-gray">
        {label && <span className="font-sans text-[#6e6e78] dark:text-[#8e8a83] font-medium">{label}:</span>}
        <span className="italic">Uncommitted</span>
      </div>
    );
  }

  const displayHash =
    truncate && hash.length > 20
      ? `${hash.slice(0, 10)}...${hash.slice(-10)}`
      : hash;

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="inline-flex items-center gap-2 bg-paper-white dark:bg-[#18181b] px-3 py-1 rounded-[6px] border border-smoke dark:border-[#2b2b32] text-[12px] font-mono-token shadow-2xs">
      {label && (
        <span className="font-sans text-[#6e6e78] dark:text-[#8e8a83] font-medium">
          {label}:
        </span>
      )}
      <span
        className="text-obsidian dark:text-[#f6f4f0] select-all break-all"
        title={hash}
      >
        {displayHash}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1 rounded hover:bg-smoke/60 dark:hover:bg-[#25252b] text-ash-gray hover:text-ember-orange transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
        aria-label={`Copy hash ${hash}`}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-lichen-green" aria-hidden="true" />
        ) : (
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * CurrencyDisplay formatted with editorial typography and tabular figures
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
    sm: "text-[13px] font-medium tracking-tight",
    md: "text-[15px] font-medium tracking-tight",
    lg: "text-[20px] font-medium tracking-tight",
    xl: "text-[28px] sm:text-[32px] font-semibold tracking-tight",
  };

  return (
    <span
      className={`text-obsidian dark:text-[#f6f4f0] tabular-nums ${sizeStyles[size]} ${className}`}
    >
      {formatter.format(amount)}
    </span>
  );
}

/**
 * Editorial Empty State
 * Clean, restrained, informative without bloated borders or fake illustrations.
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
    <div className="bg-paper-white dark:bg-[#18181b] rounded-cards p-10 text-center flex flex-col items-center justify-center max-w-md mx-auto my-6 border border-smoke dark:border-[#2b2b32] shadow-2xs">
      <div
        className="w-10 h-10 rounded-full bg-warm-cream dark:bg-[#222227] border border-smoke dark:border-[#2e2e34] flex items-center justify-center mb-3 text-architect-violet dark:text-[#a78bfa] text-base font-mono"
        aria-hidden="true"
      >
        ∅
      </div>
      <h3 className="text-[17px] font-semibold text-obsidian dark:text-[#f6f4f0] mb-1.5 tracking-tight">
        {title}
      </h3>
      <p className="text-[13.5px] text-[#4a4a52] dark:text-[#b8b5af] mb-5 max-w-sm leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <PrimaryButton onClick={onAction}>
          {actionLabel}
        </PrimaryButton>
      )}
    </div>
  );
}

/**
 * Institutional Theme Toggle Button (Light / Dark)
 * Compact 50x32px interactive theme switch custom-designed for PACTUM.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={label}
      title={label}
      className={`relative w-[50px] h-[32px] rounded-[8px] border transition-colors motion-reduce:transition-none cursor-pointer flex items-center justify-center shrink-0 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111114] ${
        isDark
          ? "bg-[#18181b] border-[#2b2b32] text-[#dedad4] hover:bg-[#222227] hover:border-[#383842] shadow-2xs"
          : "bg-warm-cream/90 border-smoke/90 text-obsidian hover:bg-paper-white hover:border-smoke shadow-2xs"
      } ${className}`}
    >
      <span className="relative w-4 h-4 flex items-center justify-center pointer-events-none">
        <Sun
          className={`w-4 h-4 text-amber-500 absolute motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none ${
            isDark
              ? "rotate-45 scale-75 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          }`}
          aria-hidden="true"
        />
        <Moon
          className={`w-4 h-4 text-amber-300 absolute motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none ${
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-45 scale-75 opacity-0"
          }`}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

// Export ThemeSelector as alias for backward compatibility
export const ThemeSelector = ThemeToggle;

/**
 * Accessible Confirmation Modal
 * Strict WCAG 2.2 AA dialog semantics, backdrop dismissal, keyboard escape.
 */
export function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDestructive = false,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative bg-paper-white dark:bg-[#18181b] rounded-cards p-7 max-w-md w-full border border-smoke dark:border-[#2b2b32] shadow-xl space-y-5 z-10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${
                isDestructive
                  ? "bg-[#feeef0] text-[#ef4444]"
                  : "bg-warm-cream dark:bg-[#242429] text-ember-orange"
              }`}
            >
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            </div>
            <h3
              id="confirm-modal-title"
              className="text-[18px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded text-[#8e8a83] hover:text-obsidian dark:hover:text-[#f6f4f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p
          id="confirm-modal-desc"
          className="text-[14px] text-[#4a4a52] dark:text-[#b8b5af] leading-relaxed"
        >
          {description}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 h-9 rounded-[8px] border border-smoke dark:border-[#2b2b32] text-[13px] font-medium text-obsidian dark:text-[#f6f4f0] hover:bg-smoke/40 dark:hover:bg-[#222227] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 h-9 rounded-[8px] text-[13px] font-medium text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              isDestructive
                ? "bg-[#dc2626] hover:bg-[#b91c1c] focus-visible:ring-[#dc2626]"
                : "bg-ember-orange hover:bg-[#e65c00] focus-visible:ring-ember-orange"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Back to Top Floating Button
 */
export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-40 p-2.5 rounded-[8px] bg-paper-white dark:bg-[#1f1f24] border border-smoke dark:border-[#2b2b32] text-obsidian dark:text-[#f6f4f0] shadow-md hover:border-ember-orange hover:text-ember-orange transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange no-print"
    >
      <ArrowUp className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}
