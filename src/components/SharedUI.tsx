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
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { formatCurrency } from "@/lib/currency";

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
  showArrow = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
  showArrow?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 h-10 rounded-[8px] bg-ember-orange hover:bg-ember-hover active:scale-[0.99] text-white font-medium text-[13.5px] tracking-[-0.01em] transition-colors shadow-2xs cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111113] select-none ${className}`}
    >
      <span>{children}</span>
      {showArrow && <ArrowRight className="w-3.5 h-3.5 shrink-0 stroke-[2.2]" aria-hidden="true" />}
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
  showArrow = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
  showArrow?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 h-10 rounded-[8px] bg-paper-white dark:bg-[#18181b] border border-smoke dark:border-[#27272a] hover:bg-smoke/40 dark:hover:bg-[#222227] text-obsidian dark:text-[#f5f3ef] font-medium text-[13.5px] tracking-[-0.01em] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111113] select-none ${className}`}
    >
      <span>{children}</span>
      {showArrow && <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />}
    </button>
  );
}

/**
 * Editorial Feature Card
 * Standard 8px radius, restrained padding, crisp 1px hairline border, zero AI slop.
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
      className={`bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 sm:p-6 border border-smoke dark:border-[#27272a] transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * VeriPay Panel (Restrained Technical Identifier Panel)
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
      className={`bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 sm:p-6 border border-smoke dark:border-[#27272a] transition-colors ${className}`}
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
      className={`bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 sm:p-6 border border-smoke dark:border-[#27272a] transition-colors ${className}`}
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
        <h2 className="type-section-heading text-obsidian dark:text-[#f6f4f0]">
          {title}
        </h2>
        {badge && <div>{badge}</div>}
      </div>
      {subtitle && (
        <p className="type-body text-[#4a4a52] dark:text-[#b8b5af] max-w-3xl">
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
        className="block type-form-label text-obsidian dark:text-[#f6f4f0]"
      >
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span
            className="absolute left-3.5 top-2.5 type-body text-[#6e6e78] dark:text-[#8e8a83] font-medium select-none pointer-events-none"
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
          className={`w-full h-10 bg-paper-white dark:bg-[#18181b] rounded-[8px] py-2 type-body text-obsidian dark:text-[#f6f4f0] border transition-colors disabled:opacity-50 placeholder:text-[#8e8a83] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange ${
            prefix ? "pl-8 pr-3.5" : "px-3.5"
          } ${
            error
              ? "border-[#ef4444] bg-[#feeef0]/20 dark:bg-[#feeef0]/10"
              : "border-smoke dark:border-[#27272a] hover:border-obsidian/30 dark:hover:border-white/30"
          }`}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="type-secondary-meta text-[#dc2626] dark:text-[#f87171]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Precision Institutional Status Badge
 * Compact, restrained status indicator with 6px dot + label text.
 * Muted, neutral background with semantic dot for high clarity without AI rainbow noise.
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
    verified: "bg-[#00a86b] dark:bg-[#00cc88]",
    warning: "bg-[#d97706] dark:bg-[#f59e0b]",
    failure: "bg-[#dc2626] dark:bg-[#ef4444]",
    info: "bg-architect-violet dark:bg-[#a78bfa]",
    neutral: "bg-[#71717a] dark:bg-[#a1a1aa]",
  };

  const textStyles = {
    verified: "text-[#065f46] dark:text-[#34d399]",
    warning: "text-[#92400e] dark:text-[#fbbf24]",
    failure: "text-[#991b1b] dark:text-[#f87171]",
    info: "text-architect-violet dark:text-[#c4b5fd]",
    neutral: "text-[#52525b] dark:text-[#a1a1aa]",
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 border border-smoke/80 dark:border-[#27272a] bg-smoke/30 dark:bg-[#1f1f23] text-[11.5px] font-medium select-none tracking-[-0.01em]"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[status]}`} aria-hidden="true" />
      <span className={textStyles[status]}>{label}</span>
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
      <div className="inline-flex items-center gap-2 bg-warm-cream/60 dark:bg-[#1c1c20] px-3 py-1.5 rounded-[6px] border border-smoke dark:border-[#27272a] text-[12px] font-mono-token text-ash-gray">
        {label && <span className="font-sans text-[#737373] dark:text-[#a3a3a3] font-medium">{label}:</span>}
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
    <div className="inline-flex items-center gap-2 bg-paper-white dark:bg-[#18181b] px-3 py-1 rounded-[6px] border border-smoke dark:border-[#27272a] text-[12px] font-mono-token shadow-2xs">
      {label && (
        <span className="font-sans text-[#737373] dark:text-[#a3a3a3] font-medium">
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
  const sizeStyles = {
    sm: "text-[13px] font-medium tracking-tight",
    md: "text-[15px] font-medium tracking-tight",
    lg: "text-[20px] font-semibold tracking-tight",
    xl: "text-[28px] sm:text-[30px] font-bold tracking-tight",
  };

  return (
    <span
      className={`type-financial text-obsidian dark:text-[#f6f4f0] ${sizeStyles[size]} ${className}`}
    >
      {formatCurrency(amount, currency)}
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
    <div className="bg-paper-white dark:bg-[#18181b] rounded-[8px] p-10 text-center flex flex-col items-center justify-center max-w-md mx-auto my-6 border border-smoke dark:border-[#27272a] shadow-2xs">
      <div
        className="w-10 h-10 rounded-full bg-warm-cream dark:bg-[#222227] border border-smoke dark:border-[#27272a] flex items-center justify-center mb-3 text-architect-violet dark:text-[#a78bfa] text-base font-sans font-medium"
        aria-hidden="true"
      >
        ∅
      </div>
      <h3 className="type-card-heading text-obsidian dark:text-[#f6f4f0] mb-1.5">
        {title}
      </h3>
      <p className="type-body text-[#4a4a52] dark:text-[#b8b5af] mb-5 max-w-sm">
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
          ? "bg-[#18181b] border-[#27272a] text-[#dedad4] hover:bg-[#222227] hover:border-[#383842] shadow-2xs"
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
      <div className="relative bg-paper-white dark:bg-[#18181b] rounded-[8px] p-6 sm:p-7 max-w-md w-full border border-smoke dark:border-[#27272a] shadow-xl space-y-5 z-10 animate-in fade-in zoom-in-95 duration-150">
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
            className="p-1 rounded text-[#737373] dark:text-[#a3a3a3] hover:text-obsidian dark:hover:text-[#f6f4f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
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
            className="px-4 py-2 h-9 rounded-[8px] border border-smoke dark:border-[#27272a] text-[13px] font-medium text-obsidian dark:text-[#f6f4f0] hover:bg-smoke/40 dark:hover:bg-[#222227] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
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
      className="fixed bottom-6 right-6 z-40 p-2.5 rounded-[8px] bg-paper-white dark:bg-[#1f1f24] border border-smoke dark:border-[#27272a] text-obsidian dark:text-[#f6f4f0] shadow-md hover:border-ember-orange hover:text-ember-orange transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange no-print"
    >
      <ArrowUp className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

// Re-export GSAP hover hook
export { useGsapHoverLift } from "@/lib/use-gsap-hover";
export type { GsapHoverOptions } from "@/lib/use-gsap-hover";

import { useGsapHoverLift } from "@/lib/use-gsap-hover";

export interface InteractiveHoverCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  liftY?: number;
  durationIn?: number;
  durationOut?: number;
  disabled?: boolean;
}

/**
 * InteractiveHoverCard
 *
 * GSAP-powered card with a refined hover lift (y = -5px), smooth border transition,
 * and elevated surface shadow. Replaces Framer Motion's whileHover={{ y: -5 }} with
 * lightweight GSAP tweens, prefers-reduced-motion compatibility, and touch-safety.
 */
export function InteractiveHoverCard({
  children,
  className = "",
  liftY = -2,
  durationIn = 0.28,
  durationOut = 0.25,
  disabled = false,
  ...props
}: InteractiveHoverCardProps) {
  const cardRef = useGsapHoverLift<HTMLDivElement>({
    y: liftY,
    durationIn,
    durationOut,
    disabled,
  });

  return (
    <div
      ref={cardRef}
      className={`transition-[border-color,box-shadow,background-color] duration-250 ease-out will-change-transform ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  liftY?: number;
  durationIn?: number;
  durationOut?: number;
  disabled?: boolean;
}

/**
 * InteractiveHoverButton
 *
 * Clickable card button with the same GSAP-powered hover lift (y = -2px) and
 * keyboard accessibility.
 */
export function InteractiveHoverButton({
  children,
  className = "",
  liftY = -2,
  durationIn = 0.28,
  durationOut = 0.25,
  disabled = false,
  type = "button",
  ...props
}: InteractiveHoverButtonProps) {
  const buttonRef = useGsapHoverLift<HTMLButtonElement>({
    y: liftY,
    durationIn,
    durationOut,
    disabled,
  });

  return (
    <button
      ref={buttonRef}
      type={type}
      disabled={disabled}
      className={`transition-[border-color,box-shadow,background-color] duration-250 ease-out will-change-transform ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Secondary Button (alias to GhostButton with explicit styling)
 */
export const SecondaryButton = GhostButton;

/**
 * Skeleton Loader Primitive
 * Subtle pulse animation for loading states without layout shifts.
 */
export function SkeletonLoader({
  className = "",
  width = "w-full",
  height = "h-4",
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={`bg-smoke/60 dark:bg-[#25252b] rounded-[6px] animate-pulse ${width} ${height} ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Accessible Institutional Notice / Warning Banner
 */
export function NoticeBanner({
  variant = "info",
  title,
  children,
  className = "",
}: {
  variant?: "info" | "warning" | "error" | "success";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: {
      bg: "bg-architect-violet/[0.06] dark:bg-architect-violet/10 border-architect-violet/25 dark:border-architect-violet/30 text-architect-violet dark:text-[#c4b5fd]",
      icon: Info,
      iconColor: "text-architect-violet dark:text-[#a78bfa]",
    },
    warning: {
      bg: "bg-amber-500/[0.08] dark:bg-amber-500/10 border-amber-500/30 dark:border-amber-500/35 text-amber-900 dark:text-amber-200",
      icon: AlertTriangle,
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    error: {
      bg: "bg-red-500/[0.08] dark:bg-red-500/10 border-red-500/30 dark:border-red-500/35 text-red-900 dark:text-red-200",
      icon: AlertCircle,
      iconColor: "text-red-600 dark:text-red-400",
    },
    success: {
      bg: "bg-emerald-500/[0.08] dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/35 text-emerald-900 dark:text-emerald-200",
      icon: CheckCircle2,
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
  }[variant];

  const Icon = styles.icon;

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`rounded-[8px] p-3.5 border flex items-start gap-3 text-[13px] leading-relaxed ${styles.bg} ${className}`}
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${styles.iconColor}`} aria-hidden="true" />
      <div className="space-y-0.5 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        <div className="opacity-95">{children}</div>
      </div>
    </div>
  );
}

/**
 * Standardized Financial Stat Card
 */
export function StatCard({
  title,
  value,
  subtitle,
  action,
  icon: Icon,
  iconColor = "text-ember-orange",
  onClick,
  className = "",
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  action?: { label: string; onClick?: () => void };
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <InteractiveHoverCard
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={onClick ? `View ${title}` : undefined}
      className={`bg-paper-white dark:bg-[#18181b] rounded-[8px] p-5 sm:p-6 border border-smoke dark:border-[#27272a] shadow-2xs hover:shadow-xs transition-colors select-none group ${
        onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange" : ""
      } ${className}`}
    >
      <div className="flex items-center justify-between text-secondary text-[12.5px] mb-2 font-medium">
        <span>{title}</span>
        {Icon && <Icon className={`w-4 h-4 ${iconColor} group-hover:scale-105 transition-transform`} aria-hidden="true" />}
      </div>
      <div className="text-[26px] sm:text-[30px] font-semibold text-obsidian dark:text-[#f6f4f0] tracking-tight tabular-nums">
        {value}
      </div>
      {(subtitle || action) && (
        <div className="flex items-center justify-between text-[12px] text-secondary mt-2 pt-2 border-t border-smoke/70 dark:border-[#242429]">
          <span>{subtitle}</span>
          {action && (
            <span
              onClick={(e) => {
                if (action.onClick) {
                  e.stopPropagation();
                  action.onClick();
                }
              }}
              className="text-ember-orange font-medium text-[11.5px] opacity-90 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
            >
              {action.label} <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </InteractiveHoverCard>
  );
}


