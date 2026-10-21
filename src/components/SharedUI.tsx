"use client";

import React, { useState, useEffect } from "react";
import {
  Copy,
  Check,
  ArrowRight,
  Sun,
  Moon,
  Monitor,
  ArrowUp,
  X,
  AlertTriangle,
} from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme-provider";

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
      className={`inline-flex items-center justify-center gap-2.5 px-9 py-3 rounded-buttons bg-ember-orange hover:bg-[#e65c00] dark:hover:bg-[#ff771a] active:scale-[0.99] text-white font-medium text-[16px] tracking-[-0.32px] transition-all shadow-[0px_4px_8px_0px_rgba(0,0,0,0.1)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111111] ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
    </button>
  );
}

/**
 * Lithic Ghost Navigation Button (DESIGN.md: Ghost Navigation Button)
 * Transparent background with 1px border, text weight 500 at 16px,
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
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-smallelements bg-transparent border border-obsidian dark:border-smoke hover:bg-obsidian/5 dark:hover:bg-white/5 text-obsidian dark:text-[#f5f3ef] font-medium text-[16px] tracking-[-0.32px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111111] ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

/**
 * Warm Feature Card (DESIGN.md: Warm Feature Card)
 * 24px radius, 40px internal padding, subtle hairline border, adaptive surface.
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
      className={`bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-8 sm:p-10 border border-smoke dark:border-[#333333] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.03)] dark:shadow-[0px_4px_12px_0px_rgba(0,0,0,0.3)] transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Lavender Feature Panel (DESIGN.md: Lavender Feature Panel)
 * 24px radius, 40px padding, violet accent, concentric arc decoration.
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
      className={`bg-lavender-mist dark:bg-[#271f33] rounded-cards p-8 sm:p-10 border border-architect-violet/20 dark:border-architect-violet/40 concentric-arcs-violet transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Mint Metric Callout (DESIGN.md: Mint Metric Callout)
 * 24px radius, compact padding, green accent border.
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
      className={`bg-mint-whisper dark:bg-[#132820] rounded-cards p-6 border border-lichen-green/30 dark:border-lichen-green/40 transition-colors ${className}`}
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
        <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.72px] text-obsidian dark:text-[#f5f3ef] leading-[1.2]">
          {title}
        </h2>
        {badge && <div>{badge}</div>}
      </div>
      {subtitle && (
        <p className="text-[16px] text-[#555555] dark:text-[#c4c0ba] font-normal leading-[1.5] tracking-[-0.32px]">
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
      <label htmlFor={id} className="block text-[14px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.28px]">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3.5 top-2.5 text-[15px] text-[#666666] dark:text-[#a5a19b] font-medium select-none" aria-hidden="true">
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
          className={`w-full bg-warm-cream dark:bg-[#242424] rounded-smallelements py-2.5 text-[15px] text-obsidian dark:text-[#f5f3ef] border transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:border-transparent ${
            prefix ? "pl-8 pr-3.5" : "px-3.5"
          } ${error ? "border-[#ef4444] bg-[#feeef0]/20 dark:bg-[#feeef0]/10" : "border-smoke dark:border-[#383838] hover:border-obsidian/30 dark:hover:border-white/30"}`}
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
 * Inline badge: 6-8px filled circle followed by label text in theme-safe color.
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
    info: "bg-architect-violet dark:bg-[#9d6ce6]",
    neutral: "bg-ash-gray",
  };

  const bgStyles = {
    verified: "bg-mint-whisper dark:bg-[#132c22] border-lichen-green/30 dark:border-lichen-green/40 text-obsidian dark:text-[#f5f3ef]",
    warning: "bg-[#fff2e6] dark:bg-[#331c0e] border-ember-orange/30 text-obsidian dark:text-[#f5f3ef]",
    failure: "bg-[#feeef0] dark:bg-[#331417] border-[#ef4444]/30 text-[#ef4444]",
    info: "bg-lavender-mist dark:bg-[#271f33] border-architect-violet/30 dark:border-architect-violet/40 text-obsidian dark:text-[#f5f3ef]",
    neutral: "bg-warm-cream dark:bg-[#222222] border-smoke dark:border-[#333333] text-obsidian dark:text-[#f5f3ef]",
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
      <div className="inline-flex items-center gap-2 bg-warm-cream dark:bg-[#222222] px-3 py-1.5 rounded-smallelements border border-smoke dark:border-[#333333] text-[13px] font-mono-token text-ash-gray dark:text-[#888888]">
        {label && <span className="font-sans text-[#666666] dark:text-[#a5a19b] font-medium">{label}:</span>}
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
    <div className="inline-flex items-center gap-2 bg-paper-white dark:bg-[#222222] px-3.5 py-1.5 rounded-smallelements border border-smoke dark:border-[#383838] text-xs font-mono-token text-bark-brown dark:text-[#ded0bc] shadow-sm">
      {label && <span className="font-sans text-[#666666] dark:text-[#a5a19b] font-medium">{label}:</span>}
      <span className="text-obsidian dark:text-[#f5f3ef] font-mono" title={hash}>
        {displayHash}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1 rounded hover:bg-warm-cream dark:hover:bg-[#2e2e2e] text-ash-gray hover:text-ember-orange transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
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

  return <span className={`text-obsidian dark:text-[#f5f3ef] ${sizeStyles[size]} ${className}`}>{formatter.format(amount)}</span>;
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
    <div className="bg-warm-cream dark:bg-[#1f1f1f] rounded-cards p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto my-6 border border-smoke dark:border-[#333333]">
      <div className="w-12 h-12 rounded-full bg-paper-white dark:bg-[#282828] border border-smoke dark:border-[#383838] flex items-center justify-center mb-4 text-architect-violet dark:text-[#9d6ce6] shadow-[0px_4px_8px_0px_rgba(0,0,0,0.06)]" aria-hidden="true">
        <span className="text-xl font-normal">∅</span>
      </div>
      <h3 className="text-[20px] font-medium text-obsidian dark:text-[#f5f3ef] mb-2 tracking-[-0.4px]">{title}</h3>
      <p className="text-[14px] text-[#555555] dark:text-[#c4c0ba] mb-6 max-w-sm leading-relaxed tracking-[-0.28px]">{description}</p>
      {actionLabel && onAction && (
        <PrimaryButton onClick={onAction}>
          {actionLabel}
        </PrimaryButton>
      )}
    </div>
  );
}

/**
 * Polished Theme Selector Segmented Control (Light, Dark, System)
 * Section 5: Meets WCAG 2.2 AA contrast, accessible names, visible focus, no layout shift.
 */
export function ThemeSelector({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const options: Array<{ id: Theme; label: string; icon: typeof Sun }> = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Color appearance preference"
      className={`inline-flex items-center p-1 rounded-smallelements bg-warm-cream dark:bg-[#222222] border border-smoke dark:border-[#333333] ${className}`}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${opt.label} appearance`}
            onClick={() => setTheme(opt.id)}
            className={`p-1.5 rounded-[6px] text-[13px] font-medium transition-all cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange ${
              isActive
                ? "bg-paper-white dark:bg-[#333333] text-obsidian dark:text-[#f5f3ef] shadow-xs"
                : "text-[#666666] dark:text-[#a5a19b] hover:text-obsidian dark:hover:text-[#f5f3ef]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline text-xs">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Accessible Confirmation Modal
 * Section 15: Dialog semantics, backdrop dismissal, keyboard escape, light & dark support.
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
      <div className="relative bg-paper-white dark:bg-[#1a1a1a] rounded-cards p-8 max-w-md w-full border border-smoke dark:border-[#363636] shadow-xl space-y-6 z-10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDestructive ? "bg-[#feeef0] text-[#ef4444]" : "bg-warm-cream dark:bg-[#262626] text-ember-orange"}`}>
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 id="confirm-modal-title" className="text-[20px] font-medium text-obsidian dark:text-[#f5f3ef] tracking-[-0.4px]">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded text-[#888888] hover:text-obsidian dark:hover:text-[#f5f3ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p id="confirm-modal-desc" className="text-[14px] text-[#555555] dark:text-[#c4c0ba] leading-relaxed">
          {description}
        </p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-smallelements border border-smoke dark:border-[#383838] text-[14px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#262626] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 rounded-buttons text-[14px] font-medium text-white transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              isDestructive
                ? "bg-[#ef4444] hover:bg-[#dc2626] focus-visible:ring-[#ef4444]"
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
 * Section 16: Appears when scroll > 300px, smooth scrolls unless prefers-reduced-motion is active.
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
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-paper-white dark:bg-[#222222] border border-smoke dark:border-[#363636] text-obsidian dark:text-[#f5f3ef] shadow-lg hover:border-ember-orange hover:text-ember-orange transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange no-print"
    >
      <ArrowUp className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
