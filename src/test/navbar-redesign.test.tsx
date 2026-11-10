import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell, type NavScreen } from "@/components/AppShell";
import { ThemeProvider } from "@/lib/theme-provider";
import { readFileSync } from "node:fs";

describe("PACTUM Premium Fixed Navigation Bar Redesign", () => {
  it("does not redefine numeric Tailwind spacing utilities as pixel tokens", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).not.toMatch(/--spacing-\d+\s*:/);
  });
  const onNavigateMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderNavbar = (
    currentScreen: NavScreen = "overview",
    isNegotiating: boolean = false
  ) => {
    return render(
      <ThemeProvider>
        <AppShell
          currentScreen={currentScreen}
          onNavigate={onNavigateMock}
          isNegotiating={isNegotiating}
        >
          <div data-testid="page-content">Test Page Content</div>
        </AppShell>
      </ThemeProvider>
    );
  };

  it("renders PACTRA brand lockup without a secondary product label", () => {
    renderNavbar("overview");

    // Monogram 'P'
    expect(screen.getByText("P")).toBeInTheDocument();

    // Brand Wordmark
    const brandBtn = screen.getByRole("button", {
      name: /PACTRA Home — Return to Overview/i,
    });
    expect(brandBtn).toBeInTheDocument();
    expect(brandBtn).toHaveTextContent("PACTRA");

    expect(screen.queryByText("VeriPay", { selector: "header *" })).not.toBeInTheDocument();

    // Clicking brand triggers navigation to Overview
    fireEvent.click(brandBtn);
    expect(onNavigateMock).toHaveBeenCalledWith("overview");
  });

  it("renders all 6 primary navigation destinations in the desktop header", () => {
    renderNavbar("overview");

    const expectedDestinations = [
      "Overview",
      "Sourcing",
      "Negotiations",
      "Evidence",
      "Settlements",
      "History",
    ];

    expectedDestinations.forEach((label) => {
      const btn = screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
      expect(btn).toBeInTheDocument();
    });
  });

  it("uses a single flex row with navigation after the brand and 40px targets", () => {
    const { container } = renderNavbar("overview");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const menuTrigger = screen.getByRole("button", { name: /Open navigation menu/i });
    const accountTrigger = screen.getByRole("button", { name: /Account menu for Account/i });
    const overview = screen.getByRole("button", { name: /^Overview$/i });
    const headerInner = container.querySelector("header > div");

    expect(headerInner?.className).toContain("h-full flex items-center");
    expect(headerInner?.className).not.toContain("grid-cols-");
    expect(nav.className).toContain("min-[1180px]:flex");
    expect(nav.className).toContain("ml-8");
    expect(menuTrigger.className).toContain("min-[1180px]:hidden");
    expect(accountTrigger.className).toContain("h-10");
    expect(overview.className).toContain("h-10");
    expect(accountTrigger.parentElement?.parentElement?.className).toContain("gap-3");
  });

  it("sets aria-current='page' on the active navigation destination", () => {
    const { rerender } = renderNavbar("overview");

    const overviewBtn = screen.getByRole("button", { name: /^Overview/i });
    expect(overviewBtn).toHaveAttribute("aria-current", "page");

    // Switch to Sourcing
    rerender(
      <ThemeProvider>
        <AppShell
          currentScreen="sourcing"
          onNavigate={onNavigateMock}
          isNegotiating={false}
        >
          <div>Content</div>
        </AppShell>
      </ThemeProvider>
    );

    const sourcingBtn = screen.getByRole("button", { name: /^Sourcing/i });
    expect(sourcingBtn).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /^Overview/i })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("does not render decorative LIVE badge in the navigation bar", () => {
    renderNavbar("arena", true);

    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Active autonomous negotiation streaming/i)
    ).not.toBeInTheDocument();
  });

  it("does not render session ID or budget in the header", () => {
    render(
      <ThemeProvider>
        <AppShell
          currentScreen="overview"
          onNavigate={onNavigateMock}
          activeSessionId="proc_sess_12345"
          activeBudgetString="$8,500.00"
        >
          <div>Content</div>
        </AppShell>
      </ThemeProvider>
    );
    expect(screen.queryByText("proc_sess_12345")).not.toBeInTheDocument();
    expect(screen.queryByText("$8,500.00")).not.toBeInTheDocument();
  });

  it("does not render thick orange underline for active navigation items", () => {
    const { container } = renderNavbar("overview");
    const orangeUnderline = container.querySelector(".bg-ember-orange.rounded-full");
    expect(orangeUnderline).not.toBeInTheDocument();
  });

  it("renders functional account control menu with dismissal", () => {
    renderNavbar("overview");
    const accountBtn = screen.getByRole("button", { name: /Account menu for Account/i });
    expect(accountBtn).toBeInTheDocument();
    expect(accountBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(accountBtn);
    expect(accountBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: /Account options/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Account & Workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Sign out/i })).toBeInTheDocument();

    // Dismiss with Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: /Account options/i })).not.toBeInTheDocument();
    expect(accountBtn).toHaveFocus();
  });

  it("opens visible account actions, toggles closed, and dismisses outside", () => {
    renderNavbar();
    const trigger = screen.getByRole("button", { name: /Account menu for Account/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();
    expect(screen.getByRole("menu").className).toContain("w-[320px]");
    expect(screen.getByRole("menu").className).toContain("max-w-[calc(100vw-32px)]");
    expect(screen.getByRole("menu").className).toContain("top-[calc(100%+8px)]");
    expect(screen.getByRole("menuitem", { name: /Account & Workspace/i })).toHaveAttribute("href", "/account");
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByTestId("page-content"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports keyboard opening and movement between account actions", () => {
    renderNavbar();
    const trigger = screen.getByRole("button", { name: /Account menu for Account/i });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /Account & Workspace/i })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("menuitem", { name: /Sign out/i })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("integrates compact interactive ThemeToggle switching between Light and Dark", () => {
    // Start with explicit light theme
    localStorage.setItem("pactum_theme", "light");
    renderNavbar("overview");

    const toggle = screen.getByRole("button", {
      name: "Switch to dark mode",
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("title", "Switch to dark mode");
    expect(toggle.className).toContain("w-[50px]");
    expect(toggle.className).toContain("h-10");

    // Click to switch to dark
    fireEvent.click(toggle);

    expect(localStorage.getItem("pactum_theme")).toBe("dark");
    expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");
    expect(toggle).toHaveAttribute("title", "Switch to light mode");

    // Click again to switch back to light
    fireEvent.click(toggle);
    expect(localStorage.getItem("pactum_theme")).toBe("light");
    expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");
    expect(toggle).toHaveAttribute("title", "Switch to dark mode");
  });

  it("handles initial System mode by toggling to opposite explicit theme on click", () => {
    // No localStorage set => defaults to system
    localStorage.clear();
    renderNavbar("overview");

    const toggle = screen.getByRole("button", {
      name: /Switch to (dark|light) mode/i,
    });
    expect(toggle).toBeInTheDocument();

    // In jsdom without dark media match, resolvedTheme defaults to light, so label is "Switch to dark mode"
    expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");

    // Clicking it should set explicit "dark" theme in localStorage
    fireEvent.click(toggle);
    expect(localStorage.getItem("pactum_theme")).toBe("dark");
    expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");
  });

  it("renders a sticky header container spanning full width with 64px height", () => {
    const { container } = renderNavbar("overview");

    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
    expect(header?.className).toContain("sticky top-0");
    expect(header?.className).toContain("z-40");

    const headerInner = header?.querySelector("div");
    expect(header?.className).toContain("h-16");
    expect(headerInner?.className).toContain("h-full");
  });

  it("handles mobile menu open, link selection, and Escape key dismissal", () => {
    renderNavbar("overview");

    const menuTrigger = screen.getByRole("button", {
      name: /Open navigation menu/i,
    });
    expect(menuTrigger).toHaveAttribute("aria-expanded", "false");

    // Open mobile menu
    fireEvent.click(menuTrigger);
    expect(menuTrigger).toHaveAttribute("aria-expanded", "true");

    const mobileDrawer = screen.getByRole("dialog", {
      name: /Mobile Navigation Menu/i,
    });
    expect(mobileDrawer).toBeInTheDocument();

    // Close via Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: /Mobile Navigation Menu/i })
    ).not.toBeInTheDocument();
  });
});
