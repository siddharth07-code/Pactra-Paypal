"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Compass,
  Search,
  Zap,
  ShieldCheck,
  CreditCard,
  Clock,
  Menu,
  X,
  ChevronDown,
  Building2,
  LogOut,
  Settings,
  Shield,
} from "lucide-react";
import { ThemeToggle, BackToTopButton } from "./SharedUI";
import Link from "next/link";
import { useOrganization, useOrganizationControl } from "./OrganizationBoundary";

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

interface UserSessionInfo {
  email: string;
  userId: string;
}

export function AppShell({
  currentScreen,
  onNavigate,
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

  const organization = useOrganization();
  const navItems = [
    { id: "overview", label: "Overview", icon: Compass },
    { id: "sourcing", label: "Sourcing", icon: Search },
    { id: "arena", label: "Negotiation Arena", icon: Zap },
    { id: "vault", label: "Evidence Vault", icon: ShieldCheck },
    { id: "settlement", label: "Settlement Center", icon: CreditCard },
    { id: "history", label: "Procurement History", icon: Clock },
  ].filter(
    (item) =>
      !organization ||
      item.id === "overview" ||
      item.id === "history" ||
      ((item.id === "sourcing" || item.id === "arena") &&
        organization.permissions.includes("session.write")) ||
      (item.id === "vault" && organization.permissions.includes("evidence.read")) ||
      (item.id === "settlement" && organization.permissions.includes("payment.checkout"))
  );

  return (
    <div className="min-h-screen flex flex-col bg-page-bg text-text-primary font-sans transition-colors duration-150">
      {/* Skip to Main Content Link (WCAG 2.2 AA) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 px-4 py-2.5 rounded-[6px] bg-ember-orange text-white font-medium text-[13.5px] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip to main content
      </a>

      {/* Persistent Single-Row Institutional Fintech Header */}
      <header className="w-full bg-paper-white dark:bg-[#121214] border-b border-smoke dark:border-[#27272a] sticky top-0 z-40 transition-colors">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-[64px] flex items-center justify-between gap-4">
          
          {/* ZONE 1 — LEFT: BRAND IDENTITY */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate("overview")}
              className="group flex items-center gap-2.5 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121214] rounded-[6px] p-0.5"
              aria-label="PACTUM Home — Return to Overview"
            >
              {/* Brand Monogram */}
              <div
                className="w-7 h-7 rounded-[5px] bg-ember-orange text-white font-semibold text-[13.5px] flex items-center justify-center shrink-0 select-none shadow-xs"
                aria-hidden="true"
              >
                P
              </div>
              {/* Brand Wordmark */}
              <span className="text-[16px] font-semibold tracking-[-0.02em] text-obsidian dark:text-[#f4f4f5] select-none">
                PACTUM
              </span>
            </button>

            {/* Subtle Vertical Divider */}
            <span
              className="h-3.5 w-px bg-smoke dark:bg-[#27272a] hidden sm:block shrink-0"
              aria-hidden="true"
            />

            {/* VeriPay Secondary Product Identifier */}
            <span
              className="hidden sm:inline-block text-[11px] font-mono-token font-medium tracking-[0.05em] text-secondary uppercase select-none"
              title="VeriPay Cryptographic Verification Engine"
            >
              VeriPay
            </span>
          </div>

          {/* ZONE 2 — CENTER: PRIMARY NAVIGATION */}
          <nav
            className="hidden xl:flex items-center h-full gap-1"
            aria-label="Primary navigation"
          >
            {navItems.map((item) => {
              const isActive = currentScreen === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id as NavScreen)}
                  aria-current={isActive ? "page" : undefined}
                  className={`h-8 px-3 rounded-[6px] text-[13px] font-medium tracking-[-0.01em] transition-colors cursor-pointer select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121214] ${
                    isActive
                      ? "bg-smoke/60 dark:bg-[#222226] text-obsidian dark:text-white"
                      : "text-secondary hover:text-obsidian dark:hover:text-[#f4f4f5] hover:bg-smoke/30 dark:hover:bg-[#1b1b1f]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* ZONE 3 — RIGHT: THEME TOGGLE & ACCOUNT CONTROL */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Theme Toggle */}
            <ThemeToggle className="shrink-0" />

            {/* Functional Institutional Account Control */}
            <AccountControl />

            {/* Mobile Navigation Trigger Button */}
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-1.5 rounded-[6px] text-obsidian dark:text-[#f4f4f5] hover:bg-smoke/40 dark:hover:bg-[#1e1e22] border border-smoke dark:border-[#27272a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer transition-colors shrink-0"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Menu className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Overlay & Drawer */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 top-[64px] bg-black/50 dark:bg-black/70 z-40 xl:hidden transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer */}
            <div
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile Navigation Menu"
              className="fixed top-[64px] inset-x-0 bg-paper-white dark:bg-[#141416] border-b border-smoke dark:border-[#27272a] z-50 p-4 space-y-1.5 shadow-xl xl:hidden max-h-[calc(100vh-64px)] overflow-y-auto"
            >
              <div className="px-3 py-1.5 pb-2 text-[11px] font-mono-token uppercase tracking-wider text-secondary border-b border-smoke/70 dark:border-[#222226]">
                Navigation
              </div>

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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13.5px] tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer transition-colors ${
                      isActive
                        ? "bg-smoke/60 dark:bg-[#222226] text-obsidian dark:text-white font-medium"
                        : "text-secondary hover:text-obsidian dark:hover:text-white hover:bg-smoke/30 dark:hover:bg-[#1b1b1f]"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="pt-2 border-t border-smoke/70 dark:border-[#222226]">
                <Link
                  href="/account"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13.5px] text-secondary hover:text-obsidian dark:hover:text-white hover:bg-smoke/30 dark:hover:bg-[#1b1b1f] transition-colors"
                >
                  <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Account &amp; Settings</span>
                </Link>
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
            : "max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
        }`}
      >
        {children}
      </main>

      {/* Back to Top Floating Button */}
      <BackToTopButton />

      {/* Editorial Footer Bar */}
      <footer className="w-full bg-paper-white dark:bg-[#141417] border-t border-smoke dark:border-[#27272a] mt-16 transition-colors no-print">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-secondary">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-obsidian dark:text-[#f4f4f5]">PACTUM</span>
            <span aria-hidden="true" className="text-secondary/40">/</span>
            <span>Autonomous Procurement &amp; Verifiable Settlement</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[12px] font-mono-token">
            <span>PayPal Orders v2</span>
            <span>Boulware β=3.0</span>
            <span className="text-secondary">SHA-256 Merkle Engine</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Institutional Account Control Dropdown
 * Handles user profile preview, active organization status, organization switching,
 * members access, and session termination.
 */
function AccountControl() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserSessionInfo | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const orgControl = useOrganizationControl();
  const activeOrg = orgControl.active;
  const organizations = orgControl.organizations;

  // Fetch verified user session identity on mount
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.principal) {
            setUser({ email: data.principal.email, userId: data.principal.userId });
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Dismiss menu on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      window.location.assign("/login");
    } catch {
      window.location.assign("/login");
    } finally {
      setLoggingOut(false);
    }
  }, []);

  // Derive initial for display
  const initial = user?.email
    ? user.email[0].toUpperCase()
    : activeOrg?.name
    ? activeOrg.name[0].toUpperCase()
    : "A";

  const displayName = activeOrg?.name || user?.email?.split("@")[0] || "Account";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account and organization menu"
        className="h-8 px-2.5 rounded-[6px] border border-smoke dark:border-[#27272a] bg-paper-white dark:bg-[#18181b] hover:bg-smoke/30 dark:hover:bg-[#202024] text-obsidian dark:text-[#f4f4f5] text-[12.5px] font-medium flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer select-none"
      >
        <span
          className="w-5 h-5 rounded-[4px] bg-smoke/80 dark:bg-[#27272a] flex items-center justify-center text-[11px] font-mono-token font-semibold uppercase text-secondary shrink-0"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="max-w-[130px] truncate hidden sm:inline text-left">
          {displayName}
        </span>
        {activeOrg?.role && (
          <span className="text-[10px] font-mono-token text-secondary uppercase hidden md:inline px-1 py-0.2 rounded bg-smoke/40 dark:bg-[#27272a] shrink-0">
            {activeOrg.role}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-secondary shrink-0 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Institutional Dropdown Menu */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account options"
          className="absolute right-0 top-[calc(100%+6px)] w-64 rounded-[8px] bg-paper-white dark:bg-[#18181b] border border-smoke dark:border-[#27272a] shadow-xl z-50 p-2 space-y-1 text-[13px] animate-in fade-in duration-100"
        >
          {/* User Identity Section */}
          <div className="px-2.5 py-2 border-b border-smoke/70 dark:border-[#27272a] select-none">
            <p className="text-[11px] font-mono-token uppercase tracking-wider text-secondary">
              Signed in
            </p>
            <p className="font-medium text-obsidian dark:text-[#f4f4f5] truncate">
              {user?.email || "Authenticated Session"}
            </p>
          </div>

          {/* Active Organization Section */}
          {activeOrg && (
            <div className="px-2.5 py-2 border-b border-smoke/70 dark:border-[#27272a] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono-token uppercase tracking-wider text-secondary">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" aria-hidden="true" />
                  Organization
                </span>
                <span className="px-1 py-0.2 rounded bg-smoke/60 dark:bg-[#27272a] text-secondary">
                  {activeOrg.role}
                </span>
              </div>
              <p className="font-medium text-obsidian dark:text-[#f4f4f5] truncate">
                {activeOrg.name}
              </p>

              {/* Organization Switcher if user belongs to multiple organizations */}
              {organizations.length > 1 && (
                <div className="pt-1">
                  <label htmlFor="org-switcher" className="sr-only">Switch organization</label>
                  <select
                    id="org-switcher"
                    aria-label="Switch organization"
                    value={activeOrg.id}
                    onChange={(e) => {
                      void orgControl.switchOrganization(e.target.value);
                      setOpen(false);
                    }}
                    className="w-full text-[12px] p-1.5 rounded-[4px] border border-smoke dark:border-[#27272a] bg-paper-white dark:bg-[#121214] text-obsidian dark:text-[#f4f4f5] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange cursor-pointer"
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Navigation Links */}
          <div className="py-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[5px] text-secondary hover:text-obsidian dark:hover:text-[#f4f4f5] hover:bg-smoke/30 dark:hover:bg-[#222227] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Account &amp; Workspace</span>
            </Link>

            {activeOrg?.permissions.includes("membership.manage") && (
              <Link
                href="/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[5px] text-secondary hover:text-obsidian dark:hover:text-[#f4f4f5] hover:bg-smoke/30 dark:hover:bg-[#222227] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
              >
                <Shield className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Manage Members</span>
              </Link>
            )}
          </div>

          {/* Sign Out Action */}
          <div className="pt-1 border-t border-smoke/70 dark:border-[#27272a]">
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[5px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
