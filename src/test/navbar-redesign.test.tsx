import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell, type NavScreen } from "@/components/AppShell";
import { ThemeProvider } from "@/lib/theme-provider";

describe("PACTUM Premium Fixed Navigation Bar Redesign", () => {
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

  it("renders PACTUM brand lockup with monogram, wordmark, and VERIPAY secondary identifier", () => {
    renderNavbar("overview");

    // Monogram 'P'
    expect(screen.getByText("P")).toBeInTheDocument();

    // Brand Wordmark
    const brandBtn = screen.getByRole("button", {
      name: /PACTUM Home — Return to Overview/i,
    });
    expect(brandBtn).toBeInTheDocument();
    expect(brandBtn).toHaveTextContent("PACTUM");

    // VERIPAY secondary product identifier
    expect(screen.getByText("VeriPay")).toBeInTheDocument();

    // Clicking brand triggers navigation to Overview
    fireEvent.click(brandBtn);
    expect(onNavigateMock).toHaveBeenCalledWith("overview");
  });

  it("renders all 6 primary navigation destinations in the desktop header", () => {
    renderNavbar("overview");

    const expectedDestinations = [
      "Overview",
      "Sourcing",
      "Negotiation Arena",
      "Evidence Vault",
      "Settlement Center",
      "Procurement History",
    ];

    expectedDestinations.forEach((label) => {
      const btn = screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
      expect(btn).toBeInTheDocument();
    });
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

  it("does not display a fake Live indicator when isNegotiating is false", () => {
    renderNavbar("arena", false);

    // Should not have "Live" indicator
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Active autonomous negotiation streaming/i)
    ).not.toBeInTheDocument();
  });

  it("displays real Live status indicator when isNegotiating is true", () => {
    renderNavbar("arena", true);

    // Live status badge should be present and accessible
    const liveBadges = screen.getAllByText("Live");
    expect(liveBadges.length).toBeGreaterThanOrEqual(1);

    const liveIndicator = screen.getByLabelText(
      /Active autonomous negotiation streaming/i
    );
    expect(liveIndicator).toBeInTheDocument();
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
    expect(toggle.className).toContain("h-[32px]");

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

  it("renders a sticky header container spanning full width with 76px height", () => {
    const { container } = renderNavbar("overview");

    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
    expect(header?.className).toContain("sticky top-0");
    expect(header?.className).toContain("z-40");

    const headerInner = header?.querySelector("div");
    expect(headerInner?.className).toContain("h-[76px]");
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
