"use client";

import React, { useState } from "react";
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

  const navItems = [
    { id: "overview", label: "Overview", icon: Compass, badge: null },
    { id: "sourcing", label: "Sourcing", icon: Search, badge: null },
    { id: "arena", label: "Negotiation Arena", icon: Zap, badge: "Live" },
    { id: "vault", label: "Evidence Vault", icon: ShieldCheck, badge: null },
    { id: "settlement", label: "Settlement Center", icon: CreditCard, badge: null },
    { id: "history", label: "Procurement History", icon: Clock, badge: null },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#000000]">
      {/* Top Navigation Bar (DESIGN.md Section: Top Navigation Bar)
          White background, full-width, left-aligned wordmark PACTUM in weight 500 at 20px with tracking -0.4px.
          Nav links in weight 400 at 16px, separated by ~24px gap.
          Right-aligned: text link (Sandbox Portal) and ghost button (Dashboard/Status). */}
      <header className="w-full bg-[#ffffff] border-b border-[#e5e5e5] sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-6 h-20 flex items-center justify-between">
          {/* Left: Wordmark */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => onNavigate("overview")}
              className="flex items-center gap-3 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-[8px] bg-[#000000] text-[#ffffff] font-medium text-[18px] flex items-center justify-center">
                P
              </div>
              <div className="flex flex-col">
                <span className="text-[20px] font-medium tracking-[-0.4px] text-[#000000] leading-none">
                  PACTUM
                </span>
                <span className="text-[12px] text-[#888888] font-normal tracking-[-0.2px] mt-0.5">
                  Verifiable Settlement
                </span>
              </div>
            </button>

            {/* Desktop Center Nav Links */}
            <nav className="hidden md:flex items-center gap-6 pl-4 border-l border-[#e5e5e5]">
              {navItems.map((item) => {
                const isActive = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id as NavScreen)}
                    className={`text-[16px] tracking-[-0.32px] transition-colors cursor-pointer relative py-2 ${
                      isActive
                        ? "font-medium text-[#000000]"
                        : "font-normal text-[#888888] hover:text-[#000000]"
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ff6600]" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: Active Context & Sandbox Indicator */}
          <div className="hidden sm:flex items-center gap-4">
            {activeSessionId && (
              <div className="flex items-center gap-2 bg-[#f6f3ee] px-3.5 py-1.5 rounded-[8px] border border-[#e5e5e5] text-[14px]">
                <span className="text-[#888888]">Session:</span>
                <span className="font-mono-token text-[#000000] font-medium">{activeSessionId}</span>
                {activeBudgetString && (
                  <span className="text-[#5c2999] font-medium pl-1 border-l border-[#e5e5e5]">
                    {activeBudgetString}
                  </span>
                )}
              </div>
            )}

            <a
              href="https://sandbox.paypal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-[#000000] text-[14px] font-medium text-[#000000] hover:bg-[#000000]/5 transition-colors"
            >
              <span>Sandbox Console</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-[8px] text-[#000000] hover:bg-[#f6f3ee]"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#e5e5e5] bg-[#ffffff] p-6 space-y-3">
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
                  className={`w-full flex items-center justify-between p-3 rounded-[8px] text-[16px] ${
                    isActive
                      ? "bg-[#f6f3ee] font-medium text-[#000000]"
                      : "text-[#888888] font-normal"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-[#5c2999]" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[12px] bg-[#ebfef6] text-[#00cc88] px-2 py-0.5 rounded-full font-medium">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Page Canvas Container (Max 1200px as per DESIGN.md Layout) */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-6 py-10 sm:py-16">{children}</main>

      {/* Editorial Footer Bar (DESIGN.md: CTA Footer Bar) */}
      <footer className="w-full bg-[#f6f3ee] border-t border-[#e5e5e5] mt-20">
        <div className="max-w-[1200px] mx-auto px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6 text-[14px] text-[#888888]">
          <div className="flex items-center gap-3">
            <span className="font-medium text-[#000000]">PACTUM</span>
            <span>—</span>
            <span>Negotiate Intelligently. Settle Verifiably.</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00cc88]" />
              PayPal Orders v2 Verified Gate
            </span>
            <span>Boulware β=3.0</span>
            <span className="text-[#5c2999]">SHA-256 Merkle Engine</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
