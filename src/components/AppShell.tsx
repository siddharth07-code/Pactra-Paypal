"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Compass,
  Search,
  Zap,
  ShieldCheck,
  CreditCard,
  Clock,
  Menu,
  X,
} from "lucide-react";
import { ThemeToggle, BackToTopButton } from "./SharedUI";

export type NavScreen =
  | "overview"
  | "sourcing"
  | "arena"
  | "vault"
  | "settlement"
  | "history";

interface AppShellProps {
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  activeSessionId?: string;
  activeBudgetString?: string;
  isNegotiating?: boolean;
  children: React.ReactNode;
}

export function AppShell({
  currentScreen,
  onNavigate,
  activeSessionId,
  activeBudgetString,
  isNegotiating = false,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  // Close mobile menu on Escape key and restore focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    if (mobileMenuOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  const navItems = [
    { id: "overview", label: "Overview", icon: Compass },
    { id: "sourcing", label: "Sourcing", icon: Search },
    { id: "arena", label: "Negotiation Arena", icon: Zap },
    { id: "vault", label: "Evidence Vault", icon: ShieldCheck },
    { id: "settlement", label: "Settlement Center", icon: CreditCard },
    { id: "history", label: "Procurement History", icon: Clock },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-page-bg text-text-primary font-sans transition-colors duration-150">
      {/* Skip to Main Content Link (WCAG 2.2 AA) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 px-4 py-2.5 rounded-smallelements bg-ember-orange text-white font-medium text-[14px] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip to main content
      </a>

      {/* Top Navigation Bar: Persistent Institutional Fintech Header */}
      <header className="w-full bg-paper-white/95 dark:bg-[#18181b]/95 backdrop-blur-md border-b border-smoke/80 dark:border-[#27272a] sticky top-0 z-40 transition-colors shadow-2xs">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-[64px] flex items-center justify-between gap-4">
          
          {/* ZONE 1 — LEFT: BRAND IDENTITY */}
          <div className="flex items-center gap-3 sm:gap-3.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate("overview")}
              className="group flex items-center gap-2 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111113] rounded-[6px] p-0.5"
              aria-label="PACTUM Home — Return to Overview"
            >
              {/* Brand Monogram */}
              <div
                className="w-7 h-7 rounded-[6px] bg-ember-orange text-white font-semibold text-[14px] flex items-center justify-center shadow-xs transition-transform group-hover:scale-105 duration-150 shrink-0 select-none"
                aria-hidden="true"
              >
                P
              </div>
              {/* Brand Wordmark */}
              <span className="text-[17px] font-semibold tracking-[-0.03em] text-obsidian dark:text-[#f5f3ef] transition-colors group-hover:text-ember-orange select-none">
                PACTUM
              </span>
            </button>

            {/* Subtle Vertical Divider */}
            <span
              className="h-3.5 w-px bg-smoke dark:bg-[#2e2e34] hidden sm:block shrink-0"
              aria-hidden="true"
            />

            {/* VERIPAY Secondary Product Identifier */}
            <div
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-architect-violet/[0.08] dark:bg-architect-violet/15 border border-architect-violet/20 dark:border-architect-violet/30 text-architect-violet dark:text-[#b490f5] text-[10.5px] font-sans font-semibold tracking-[0.06em] uppercase select-none shrink-0"
              title="VeriPay Cryptographic Verification Engine"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-architect-violet dark:bg-[#b490f5]" aria-hidden="true" />
              <span>VeriPay</span>
            </div>
          </div>

          {/* ZONE 2 — CENTER: PRIMARY NAVIGATION */}
          <nav
            className="hidden lg:flex items-center h-full gap-1 xl:gap-1.5"
            aria-label="Primary navigation"
          >
            {navItems.map((item) => {
              const isActive = currentScreen === item.id;
              const isArenaItem = item.id === "arena";
              const showLiveBadge = isArenaItem && isNegotiating;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id as NavScreen)}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative h-full flex items-center px-3 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-150 cursor-pointer select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111113] ${
                    isActive
                      ? "text-obsidian dark:text-white"
                      : "text-secondary hover:text-obsidian dark:hover:text-[#f5f3ef]"
                  }`}
                >
                  <span className={`py-1 px-2 rounded-[6px] transition-colors flex items-center gap-1.5 ${
                    isActive ? "bg-smoke/40 dark:bg-[#222227]" : "hover:bg-smoke/30 dark:hover:bg-[#1f1f24]"
                  }`}>
                    <span>{item.label}</span>
                    {/* Live negotiation indicator — strictly reflects real state */}
                    {showLiveBadge && (
                      <span
                        className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono-token font-medium tracking-wide uppercase border border-emerald-500/25"
                        aria-label="Active autonomous negotiation streaming"
                        title="Autonomous negotiation active"
                      >
                        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        <span>Live</span>
                      </span>
                    )}
                  </span>

                  {/* Refined Institutional Active Underline Indicator */}
                  {isActive && (
                    <span
                      className="absolute bottom-0 inset-x-2.5 h-[2px] bg-ember-orange rounded-full pointer-events-none"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* ZONE 3 — RIGHT: CONTEXT PILL & CONTROLS */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Active Session Indicator Pill if active */}
            {activeSessionId && (
              <div
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-smoke/40 dark:bg-[#202025] border border-smoke dark:border-[#2e2e34] text-[11.5px] font-mono-token text-secondary"
                title={`Active procurement session: ${activeSessionId}${activeBudgetString ? ` (${activeBudgetString})` : ""}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="truncate max-w-[120px]">{activeSessionId}</span>
                {activeBudgetString && (
                  <span className="hidden xl:inline text-obsidian dark:text-[#f6f4f0] font-medium border-l border-smoke dark:border-[#2e2e34] pl-1.5">
                    {activeBudgetString}
                  </span>
                )}
              </div>
            )}

            {/* Compact Institutional Theme Toggle (Light / Dark) */}
            <ThemeToggle />

            {/* Mobile Navigation Trigger Button */}
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-[8px] text-obsidian dark:text-[#f5f3ef] hover:bg-smoke/50 dark:hover:bg-[#202024] border border-smoke dark:border-[#2e2e34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer transition-colors"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Overlay & Drawer */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 top-[64px] bg-black/60 dark:bg-black/75 z-40 lg:hidden backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer */}
            <div
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile Navigation Menu"
              className="fixed top-[64px] inset-x-0 bg-paper-white dark:bg-[#141416] border-b border-smoke dark:border-[#26262a] z-50 p-5 space-y-2 shadow-2xl lg:hidden animate-in slide-in-from-top-2 duration-150"
            >
              <div className="flex items-center justify-between px-3 py-1 pb-2 border-b border-smoke/70 dark:border-[#222226]">
                <span className="text-[11px] font-mono-token uppercase tracking-wider text-[#888888] dark:text-[#77777c]">
                  Navigation
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[#888888] dark:text-[#77777c]">
                    Theme
                  </span>
                  <ThemeToggle />
                </div>
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentScreen === item.id;
                const isArenaItem = item.id === "arena";
                const showLiveBadge = isArenaItem && isNegotiating;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id as NavScreen);
                      setMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full flex items-center justify-between p-3 rounded-[6px] text-[14.5px] tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange cursor-pointer transition-colors ${
                      isActive
                        ? "bg-warm-cream/70 dark:bg-[#1a1a1f] text-obsidian dark:text-white font-medium border-l-2 border-l-ember-orange border-y border-r border-smoke/70 dark:border-[#27272d]"
                        : "text-[#666666] dark:text-[#c4c0ba] font-normal hover:bg-smoke/30 dark:hover:bg-[#1c1c20]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 ${
                          isActive
                            ? "text-ember-orange"
                            : "text-architect-violet dark:text-[#9d6ce6]"
                        }`}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </div>
                    {showLiveBadge && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-mono-token font-medium">
                        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        <span>Live</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </header>

      {/* Main Page Canvas Container */}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 w-full focus:outline-none ${
          currentScreen === "overview"
            ? "w-full"
            : "max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
        }`}
      >
        {children}
      </main>

      {/* Back to Top Floating Button */}
      <BackToTopButton />

      {/* Editorial Footer Bar */}
      <footer className="w-full bg-paper-white dark:bg-[#141417] border-t border-smoke dark:border-[#27272a] mt-16 transition-colors no-print">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-secondary">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-obsidian dark:text-[#f5f3ef]">PACTUM</span>
            <span aria-hidden="true" className="text-ash-gray">/</span>
            <span>Negotiate Intelligently. Settle Verifiably.</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-[12.5px]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-lichen-green" aria-hidden="true" />
              PayPal Orders v2 Verified Gate
            </span>
            <span>Boulware β=3.0</span>
            <span className="text-architect-violet dark:text-[#a78bfa] font-medium font-mono-token">
              SHA-256 Merkle Engine
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
