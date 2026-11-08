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
    { id: "arena", label: "Negotiations", icon: Zap },
    { id: "vault", label: "Evidence", icon: ShieldCheck },
    { id: "settlement", label: "Settlements", icon: CreditCard },
    { id: "history", label: "History", icon: Clock },
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
    <div className="pactum-workspace min-h-screen flex flex-col bg-page-bg text-text-primary font-sans transition-colors duration-150">
      {/* Skip to Main Content Link (WCAG 2.2 AA) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 px-4 py-2.5 rounded-[6px] bg-ember-orange text-white font-medium text-[13.5px] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Skip to main content
      </a>

      {/* Persistent Single-Row Institutional Fintech Header */}
      <header className="h-16 w-full bg-page-bg border-b border-border-primary sticky top-0 z-40 transition-colors">
        <div className="max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
          {/* Brand stays anchored in the same natural row as navigation. */}
          <button
            type="button"
            onClick={() => onNavigate("overview")}
            className="group h-10 shrink-0 flex items-center gap-2.5 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121214] rounded-[6px] px-1"
            aria-label="PACTUM Home — Return to Overview"
          >
            <span
              className="w-7 h-7 rounded-[5px] bg-ember-orange text-white font-semibold text-[13.5px] flex items-center justify-center shrink-0 select-none shadow-xs"
              aria-hidden="true"
            >
              P
            </span>
            <span className="hidden min-[400px]:inline text-[16px] font-semibold tracking-[-0.02em] text-text-primary select-none">
              PACTUM
            </span>
          </button>

          {/* Navigation follows the brand and collapses before the row gets tight. */}
          <nav
            className="hidden min-[1180px]:flex shrink-0 items-center h-full gap-1 ml-8"
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
                  className={`h-10 px-3 rounded-[6px] text-[13px] font-medium tracking-[-0.01em] transition-colors cursor-pointer select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121214] ${
                    isActive
                      ? "bg-surface-secondary text-text-primary border border-border-primary/60 font-semibold"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary/70"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 min-w-4" aria-hidden="true" />

          {/* Theme and account controls remain a compact right-aligned group. */}
          <div className="h-full shrink-0 flex items-center gap-3">
            <ThemeToggle className="shrink-0" />
            <AccountControl />
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="min-[1180px]:hidden h-10 w-10 flex items-center justify-center rounded-[6px] text-text-primary hover:bg-surface-secondary border border-border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer transition-colors shrink-0"
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
              className="fixed inset-0 top-[64px] bg-black/50 dark:bg-black/70 z-40 min-[1180px]:hidden transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer */}
            <div
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile Navigation Menu"
              className="fixed top-[64px] inset-x-0 bg-surface-primary border-b border-border-primary z-50 p-4 space-y-1.5 shadow-xl min-[1180px]:hidden max-h-[calc(100vh-64px)] overflow-y-auto"
            >
              <div className="px-3 py-1.5 pb-2 text-[11px] font-mono-token uppercase tracking-wider text-text-secondary border-b border-border-primary">
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
                    className={`h-10 w-full flex items-center gap-3 px-3 rounded-[6px] text-[13.5px] tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer transition-colors ${
                      isActive
                        ? "bg-surface-secondary text-text-primary font-medium border border-border-primary/60"
                        : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary/70"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="pt-2 border-t border-border-primary">
                <Link
                  href="/account"
                  onClick={() => setMobileMenuOpen(false)}
                  className="h-10 flex items-center gap-3 px-3 rounded-[6px] text-[13.5px] text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-colors"
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
            : "max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
        }`}
      >
        {children}
      </main>

      {/* Back to Top Floating Button */}
      <BackToTopButton />

      {/* Editorial Footer Bar */}
      <footer className="w-full bg-page-bg border-t border-border-primary mt-16 transition-colors no-print">
        <div className="max-w-[1344px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-text-secondary">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">PACTUM</span>
            <span>Procurement operations</span>
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
    menuRef.current?.querySelector<HTMLElement>('select, [role="menuitem"]')?.focus();
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
  const displayName = activeOrg?.name || "Account";

  return (
    <div className="relative shrink-0 h-full flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${displayName}`}
        className="h-10 max-w-[120px] sm:max-w-[220px] px-3 rounded-[6px] hover:bg-surface-secondary text-text-primary text-[13px] font-medium flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange cursor-pointer select-none"
      >
        <span className="min-w-0 max-w-[170px] truncate text-left">
          {displayName}
        </span>
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
          onKeyDown={(event) => {
            if (event.target instanceof HTMLSelectElement) return;
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('select, [role="menuitem"]:not([disabled])'));
            if (!items.length) return;
            event.preventDefault();
            const index = items.indexOf(document.activeElement as HTMLElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
            items[next].focus();
          }}
          className="fixed right-4 top-[72px] sm:absolute sm:right-0 sm:top-[calc(100%+8px)] w-[320px] max-w-[calc(100vw-32px)] max-h-[calc(100dvh-88px)] overflow-y-auto shrink-0 rounded-[8px] bg-surface-primary border border-border-primary shadow-xl z-50 p-2 space-y-1 text-[13px]"
        >
          {/* User identity, avatar and permission context belong inside the menu. */}
          <div className="flex items-center gap-3 px-2.5 py-3 border-b border-border-primary select-none">
            <span className="h-10 w-10 rounded-full bg-surface-secondary flex items-center justify-center font-semibold text-text-secondary shrink-0" aria-hidden="true">{user?.email?.[0]?.toUpperCase() ?? "A"}</span>
            <div className="min-w-0">
              <p className="text-[11px] text-text-secondary">Signed in</p>
              <p className="font-medium text-text-primary truncate">{user?.email || "Authenticated Session"}</p>
              {activeOrg?.role && <p className="text-[11px] text-text-secondary">{activeOrg.role.replaceAll("_", " ")}</p>}
            </div>
          </div>

          {/* Active Organization Section */}
          {activeOrg && (
            <div className="px-2.5 py-2 border-b border-border-primary space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono-token uppercase tracking-wider text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" aria-hidden="true" />
                  Organization
                </span>
              </div>
              <p className="font-medium text-text-primary truncate">
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
                    className="h-10 w-full text-[12px] px-2 rounded-[6px] border border-border-primary bg-surface-secondary text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange cursor-pointer"
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
              className="h-10 flex items-center gap-2.5 whitespace-nowrap px-2.5 py-1.5 rounded-[6px] text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Account &amp; Workspace</span>
            </Link>

            {activeOrg?.permissions.includes("membership.manage") && (
              <Link
                href="/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="h-10 flex items-center gap-2.5 whitespace-nowrap px-2.5 py-1.5 rounded-[6px] text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ember-orange"
              >
                <Shield className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Manage Members</span>
              </Link>
            )}
          </div>

          {/* Sign Out Action */}
          <div className="pt-1 border-t border-border-primary">
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={handleLogout}
              className="h-10 w-full flex items-center gap-2.5 whitespace-nowrap px-2.5 py-1.5 rounded-[6px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 disabled:opacity-50"
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
