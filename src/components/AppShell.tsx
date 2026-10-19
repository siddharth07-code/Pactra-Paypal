"use client";

import React, { useState } from "react";
import {
  Layers,
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
    { id: "overview", label: "Overview", icon: Layers, badge: null },
    { id: "sourcing", label: "Sourcing", icon: Search, badge: null },
    { id: "arena", label: "Negotiation Arena", icon: Zap, badge: "Live" },
    { id: "vault", label: "Evidence Vault", icon: ShieldCheck, badge: null },
    { id: "settlement", label: "Settlement Center", icon: CreditCard, badge: null },
    { id: "history", label: "Procurement History", icon: Clock, badge: null },
  ];

  return (
    <div className="min-h-screen flex fintech-bg text-[#F3F6FC]">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex w-64 flex-col justify-between bg-[#0D1B2B]/95 backdrop-blur-xl border-r border-[#23354B]/60 sticky top-0 h-screen z-30 select-none">
        <div>
          {/* Logo & Wordmark */}
          <div className="h-20 px-6 flex items-center border-b border-[#23354B]/40 gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#005EA6] via-[#0070E0] to-[#5B9CFF] flex items-center justify-center font-bold text-white shadow-md shadow-[#5B9CFF]/15">
              P
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-[#F3F6FC] flex items-center gap-2">
                PACTUM
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#132438] text-[#5B9CFF] border border-[#23354B]/60">
                  B2B
                </span>
              </div>
              <div className="text-xs text-[#9AAAC0] tracking-normal font-normal">Autonomous Settle</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <div className="text-xs text-[#64758E] px-3 pt-2 pb-1.5 font-medium tracking-wide">
              Procurement Lifecycle
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id as NavScreen)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#132438] text-[#5B9CFF] shadow-sm font-semibold"
                      : "text-[#9AAAC0] hover:text-[#F3F6FC] hover:bg-[#132438]/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#5B9CFF]" : "text-[#9AAAC0]"}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#5B9CFF]/15 text-[#5B9CFF]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 mx-3 mb-4 rounded-xl bg-[#07111F]/70 border border-[#23354B]/40 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9AAAC0] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
              Trust Layer
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
              Sandbox
            </span>
          </div>
          <div className="text-[11px] text-[#64758E] flex items-center justify-between pt-1 border-t border-[#23354B]/40">
            <span>PayPal Orders v2</span>
            <span className="text-[#5B9CFF] font-medium">Merkle Gate</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 px-6 lg:px-10 border-b border-[#23354B]/40 bg-[#07111F]/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-[#9AAAC0] hover:bg-[#0D1B2B]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2.5 text-xs">
              <span className="text-[#64758E] font-medium">Session</span>
              <span className="font-mono-token text-[#F3F6FC] bg-[#0D1B2B] px-3 py-1 rounded-lg border border-[#23354B]/60 text-xs">
                {activeSessionId || "None Active"}
              </span>
              {activeBudgetString && (
                <span className="hidden sm:inline text-xs font-medium text-[#22C55E] bg-[#22C55E]/10 px-3 py-1 rounded-lg">
                  {activeBudgetString}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#0D1B2B] border border-[#23354B]/60 text-xs text-[#9AAAC0]">
              <span>Boulware Strategy</span>
              <span className="text-[#64758E]">•</span>
              <span className="text-[#22C55E] font-medium">Audit Gate Enforced</span>
            </div>

            <a
              href="https://sandbox.paypal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#5B9CFF] hover:text-[#458AF0] transition-colors font-medium ml-2"
            >
              <span>Sandbox Console</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-[#23354B] bg-[#0D1B2B] p-4 space-y-1">
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                    isActive ? "bg-[#132438] text-[#5B9CFF]" : "text-[#9AAAC0]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-6 lg:p-10 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
