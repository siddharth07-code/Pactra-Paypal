"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  Boxes,
  Swords,
  ShieldCheck,
  CreditCard,
  History,
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
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "sourcing", label: "Sourcing", icon: Boxes },
    { id: "arena", label: "Negotiation Arena", icon: Swords },
    { id: "vault", label: "Evidence Vault", icon: ShieldCheck },
    { id: "settlement", label: "Settlement Center", icon: CreditCard },
    { id: "history", label: "Procurement History", icon: History },
  ];

  return (
    <div className="min-h-screen flex bg-[#030B18] text-[#F1F5F9] selection:bg-[#4597FF]/30 selection:text-white">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex w-64 flex-col justify-between border-r border-[#203149] bg-[#0B1728]/70 backdrop-blur-md sticky top-0 h-screen z-30">
        <div>
          {/* Logo & Brand */}
          <div className="h-18 px-6 flex items-center border-b border-[#203149]/80 gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#00457C] via-[#0070E0] to-[#4597FF] flex items-center justify-center font-extrabold text-white shadow-md border border-[#4597FF]/30">
              P
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                PACTUM
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#203149] text-[#4597FF] rounded">v0.3</span>
              </div>
              <div className="text-[10px] text-[#94A3B8] font-mono tracking-wider uppercase">Institutional Core</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <div className="text-[10px] font-mono uppercase text-[#64748B] px-3 py-2 font-semibold tracking-wider">
              Procurement Workflow
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id as NavScreen)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[#101F33] text-[#4597FF] border border-[#203149] shadow-sm"
                      : "text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#101F33]/40 border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#4597FF]" : "text-[#94A3B8]"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Status */}
        <div className="p-4 border-t border-[#203149]/80 bg-[#030B18]/40 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#94A3B8] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              Engine Online
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30">
              SANDBOX
            </span>
          </div>
          <div className="text-[11px] font-mono text-[#64748B] flex items-center justify-between pt-1 border-t border-[#203149]/40">
            <span>PayPal Orders v2</span>
            <span className="text-[#4597FF]">SHA-256 Gate</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 px-6 border-b border-[#203149] bg-[#0B1728]/60 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-[#94A3B8] hover:bg-[#101F33]"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[#64748B]">SESSION:</span>
              <span className="text-xs font-mono text-[#F1F5F9] bg-[#030B18] px-2.5 py-1 rounded border border-[#203149]">
                {activeSessionId || "None Selected"}
              </span>
              {activeBudgetString && (
                <span className="hidden sm:inline text-xs font-mono text-[#22C55E] bg-[#22C55E]/10 px-2.5 py-1 rounded border border-[#22C55E]/30">
                  {activeBudgetString}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-[#203149] bg-[#030B18] text-xs font-mono text-[#94A3B8]">
              <span className="text-[#4597FF]">Boulware β=3.0</span>
              <span className="text-[#64748B]">|</span>
              <span className="text-[#22C55E]">Fail-Closed</span>
            </div>

            <a
              href="https://sandbox.paypal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 text-xs text-[#4597FF] hover:underline"
            >
              <span>Sandbox Portal</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </header>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-[#203149] bg-[#0B1728] p-4 space-y-1">
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
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    isActive ? "bg-[#101F33] text-[#4597FF]" : "text-[#94A3B8]"
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
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
