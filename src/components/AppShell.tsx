"use client";

import React, { useState, useEffect } from "react";
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

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
    <div className="min-h-screen flex flex-col bg-paper-white text-obsidian font-sans">
      {/* Top Navigation Bar (DESIGN.md Section: Top Navigation Bar)
          White background, full-width, left-aligned wordmark PACTUM in weight 500 at 20px with tracking -0.4px.
          Nav links in weight 400 at 16px, separated by ~24px gap.
          Right-aligned: text link (Sandbox Portal) and ghost button (Dashboard/Status). */}
      <header className="w-full bg-paper-white border-b border-smoke sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-6 h-20 flex items-center justify-between">
          {/* Left: Wordmark */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => onNavigate("overview")}
              className="flex items-center gap-3 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 rounded-smallelements"
            >
              <div className="w-9 h-9 rounded-smallelements bg-obsidian text-paper-white font-medium text-[18px] flex items-center justify-center">
                P
              </div>
              <div className="flex flex-col">
                <span className="text-[20px] font-medium tracking-[-0.4px] text-obsidian leading-none">
                  PACTUM
                </span>
                <span className="text-[12px] text-[#666666] font-normal tracking-[-0.2px] mt-0.5">
                  Verifiable Settlement
                </span>
              </div>
            </button>

            {/* Desktop Center Nav Links */}
            <nav className="hidden md:flex items-center gap-6 pl-4 border-l border-smoke" aria-label="Main navigation">
              {navItems.map((item) => {
                const isActive = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id as NavScreen)}
                    aria-current={isActive ? "page" : undefined}
                    className={`text-[16px] tracking-[-0.32px] transition-colors cursor-pointer relative py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange rounded-smallelements ${
                      isActive
                        ? "font-medium text-obsidian"
                        : "font-normal text-[#666666] hover:text-obsidian"
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

          {/* Right: Active Context & Sandbox Indicator */}
          <div className="hidden sm:flex items-center gap-4">
            {activeSessionId && (
              <div className="flex items-center gap-2 bg-warm-cream px-3.5 py-1.5 rounded-smallelements border border-smoke text-[14px]">
                <span className="text-[#666666]">Session:</span>
                <span className="font-mono-token text-obsidian font-medium">{activeSessionId}</span>
                {activeBudgetString && (
                  <span className="text-architect-violet font-medium pl-1 border-l border-smoke">
                    {activeBudgetString}
                  </span>
                )}
              </div>
            )}

            <a
              href="https://sandbox.paypal.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open PayPal Sandbox Console in new tab"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-smallelements border border-obsidian text-[14px] font-medium text-obsidian hover:bg-obsidian/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian"
            >
              <span>Sandbox Console</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-smallelements text-obsidian hover:bg-warm-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
          </button>
        </div>

        {/* Mobile Dropdown Backdrop & Drawer */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-obsidian/40 z-30 md:hidden backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="md:hidden border-t border-smoke bg-paper-white p-6 space-y-3 relative z-40">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id as NavScreen);
                      setMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full flex items-center justify-between p-3 rounded-smallelements text-[16px] tracking-[-0.32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange ${
                      isActive
                        ? "bg-warm-cream font-medium text-obsidian"
                        : "text-[#666666] font-normal hover:bg-warm-cream/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-architect-violet" aria-hidden="true" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[12px] bg-mint-whisper text-obsidian px-2.5 py-0.5 rounded-full font-medium border border-lichen-green/30">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </header>

      {/* Main Page Canvas Container
          Supports full-bleed sections on Overview while keeping standard 1200px max-width on other views. */}
      <main
        className={`flex-1 w-full ${
          currentScreen === "overview"
            ? "w-full"
            : "max-w-[1200px] mx-auto px-6 py-10 sm:py-16"
        }`}
      >
        {children}
      </main>

      {/* Editorial Footer Bar (DESIGN.md: CTA Footer Bar) */}
      <footer className="w-full bg-warm-cream border-t border-smoke mt-20">
        <div className="max-w-[1200px] mx-auto px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6 text-[14px] text-[#666666]">
          <div className="flex items-center gap-3">
            <span className="font-medium text-obsidian">PACTUM</span>
            <span aria-hidden="true">—</span>
            <span>Negotiate Intelligently. Settle Verifiably.</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-lichen-green" aria-hidden="true" />
              PayPal Orders v2 Verified Gate
            </span>
            <span>Boulware β=3.0</span>
            <span className="text-architect-violet font-medium">SHA-256 Merkle Engine</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
