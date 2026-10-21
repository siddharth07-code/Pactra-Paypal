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
  ExternalLink,
} from "lucide-react";
import { ThemeSelector, BackToTopButton } from "./SharedUI";

export type NavScreen = "overview" | "sourcing" | "arena" | "vault" | "settlement" | "history";

interface AppShellProps {
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  activeSessionId?: string;
  activeBudgetString?: string;
  children: React.ReactNode;
}

export function AppShell({
  currentScreen,
  onNavigate,
  activeSessionId,
  activeBudgetString,
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
    { id: "overview", label: "Overview", icon: Compass, badge: null },
    { id: "sourcing", label: "Sourcing", icon: Search, badge: null },
    { id: "arena", label: "Negotiation Arena", icon: Zap, badge: "Live" },
    { id: "vault", label: "Evidence Vault", icon: ShieldCheck, badge: null },
    { id: "settlement", label: "Settlement Center", icon: CreditCard, badge: null },
    { id: "history", label: "Procurement History", icon: Clock, badge: null },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-page-bg text-text-primary font-sans transition-colors duration-150">
      {/* Skip to Main Content Link (Section 6 & 20) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 px-4 py-2.5 rounded-smallelements bg-ember-orange text-white font-medium text-[14px] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip to main content
      </a>

      {/* Top Navigation Bar (DESIGN.md Section: Top Navigation Bar) */}
      <header className="w-full bg-paper-white dark:bg-[#1a1a1a] border-b border-smoke dark:border-[#333333] sticky top-0 z-40 transition-colors">
        <div className="max-w-[1200px] mx-auto px-6 h-20 flex items-center justify-between">
          {/* Left: Wordmark */}
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => onNavigate("overview")}
              className="flex items-center gap-3 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1a1a1a] rounded-smallelements"
            >
              <div className="w-9 h-9 rounded-smallelements bg-obsidian dark:bg-ember-orange text-paper-white dark:text-white font-medium text-[18px] flex items-center justify-center shadow-xs">
                P
              </div>
              <div className="flex flex-col">
                <span className="text-[20px] font-medium tracking-[-0.4px] text-obsidian dark:text-[#f5f3ef] leading-none">
                  PACTUM
                </span>
                <span className="text-[12px] text-[#666666] dark:text-[#c4c0ba] font-normal tracking-[-0.2px] mt-0.5">
                  Verifiable Settlement
                </span>
              </div>
            </button>

            {/* Desktop Center Nav Links */}
            <nav className="hidden md:flex items-center gap-6 pl-4 border-l border-smoke dark:border-[#333333]" aria-label="Main navigation">
              {navItems.map((item) => {
                const isActive = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id as NavScreen)}
                    aria-current={isActive ? "page" : undefined}
                    className={`text-[16px] tracking-[-0.32px] transition-colors cursor-pointer relative py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange rounded-smallelements ${
                      isActive
                        ? "font-medium text-obsidian dark:text-[#f5f3ef]"
                        : "font-normal text-[#666666] dark:text-[#c4c0ba] hover:text-obsidian dark:hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-ember-orange" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: Active Context, Theme Selector & Sandbox Indicator */}
          <div className="hidden lg:flex items-center gap-3.5">
            {activeSessionId && (
              <div className="flex items-center gap-2 bg-warm-cream dark:bg-[#222222] px-3.5 py-1.5 rounded-smallelements border border-smoke dark:border-[#333333] text-[13px]">
                <span className="text-[#666666] dark:text-[#a5a19b]">Session:</span>
                <span className="font-mono-token text-obsidian dark:text-[#f5f3ef] font-medium">{activeSessionId}</span>
                {activeBudgetString && (
                  <span className="text-architect-violet dark:text-[#9d6ce6] font-medium pl-1 border-l border-smoke dark:border-[#333333]">
                    {activeBudgetString}
                  </span>
                )}
              </div>
            )}

            {/* Theme Selector */}
            <ThemeSelector />

            <a
              href="https://sandbox.paypal.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open PayPal Sandbox Console in new tab"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-smallelements border border-obsidian dark:border-smoke text-[14px] font-medium text-obsidian dark:text-[#f5f3ef] hover:bg-obsidian/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            >
              <span>Sandbox Console</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>

          {/* Tablet & Mobile Right Controls */}
          <div className="flex lg:hidden items-center gap-2">
            <ThemeSelector />
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-smallelements text-obsidian dark:text-[#f5f3ef] hover:bg-warm-cream dark:hover:bg-[#222222] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Backdrop & Drawer */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="md:hidden border-t border-smoke dark:border-[#333333] bg-paper-white dark:bg-[#1a1a1a] p-6 space-y-3 relative z-40 shadow-xl">
              {activeSessionId && (
                <div className="p-3 mb-2 rounded-smallelements bg-warm-cream dark:bg-[#222222] border border-smoke dark:border-[#333333] text-[13px] text-[#666666] dark:text-[#a5a19b]">
                  <div>Active: <span className="font-mono-token text-obsidian dark:text-[#f5f3ef]">{activeSessionId}</span></div>
                  {activeBudgetString && <div className="text-architect-violet dark:text-[#9d6ce6] font-medium mt-0.5">{activeBudgetString}</div>}
                </div>
              )}
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id as NavScreen);
                      setMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full flex items-center justify-between p-3 rounded-smallelements text-[16px] tracking-[-0.32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer ${
                      isActive
                        ? "bg-warm-cream dark:bg-[#262626] font-medium text-obsidian dark:text-[#f5f3ef]"
                        : "text-[#666666] dark:text-[#c4c0ba] font-normal hover:bg-warm-cream/50 dark:hover:bg-[#222222]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-architect-violet dark:text-[#9d6ce6]" aria-hidden="true" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[12px] bg-mint-whisper dark:bg-[#132c22] text-obsidian dark:text-[#f5f3ef] px-2.5 py-0.5 rounded-full font-medium border border-lichen-green/30 dark:border-lichen-green/40">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="pt-3 border-t border-smoke dark:border-[#333333]">
                <a
                  href="https://sandbox.paypal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-smallelements border border-obsidian dark:border-smoke text-[14px] font-medium text-obsidian dark:text-[#f5f3ef]"
                >
                  <span>PayPal Sandbox Console</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
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
            : "max-w-[1200px] mx-auto px-6 py-10 sm:py-16"
        }`}
      >
        {children}
      </main>

      {/* Back to Top Floating Button */}
      <BackToTopButton />

      {/* Editorial Footer Bar (DESIGN.md: CTA Footer Bar) */}
      <footer className="w-full bg-warm-cream dark:bg-[#151515] border-t border-smoke dark:border-[#2a2a2a] mt-20 transition-colors no-print">
        <div className="max-w-[1200px] mx-auto px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6 text-[14px] text-[#666666] dark:text-[#a5a19b]">
          <div className="flex items-center gap-3">
            <span className="font-medium text-obsidian dark:text-[#f5f3ef]">PACTUM</span>
            <span aria-hidden="true">—</span>
            <span>Negotiate Intelligently. Settle Verifiably.</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-lichen-green" aria-hidden="true" />
              PayPal Orders v2 Verified Gate
            </span>
            <span>Boulware β=3.0</span>
            <span className="text-architect-violet dark:text-[#9d6ce6] font-medium">SHA-256 Merkle Engine</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
