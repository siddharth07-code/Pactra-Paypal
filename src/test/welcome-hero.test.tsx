import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

// WebGL resources have a separate lifecycle suite; this suite exercises public content.
vi.mock("next/dynamic", () => ({ default: () => ({ paused }: { paused: boolean }) => <div data-testid="mock-sculpture-canvas" data-paused={paused} aria-hidden="true" /> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WelcomeHeroScreen Editorial Layout & Accessibility", () => {
  it("renders the product headline without an animation mask", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Procurement,with proof.");
    expect(screen.getByRole("heading", { level: 1 }).className).not.toContain("opacity-0");
  });

  it("links the primary CTA to the protected workspace", () => {
    render(<WelcomeHeroScreen />);
    const ctas = screen.getAllByRole("link", { name: /open workspace/i });
    expect(ctas).toHaveLength(2);
    expect(ctas[0]).toHaveAttribute("href", "/workspace");
    expect(ctas[0].className).toContain("landing-button");
  });

  it("clearly labels the sandbox and avoids fabricated live attestations", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByText(/A B2B procurement workspace with PayPal Sandbox settlement/)).toBeInTheDocument();
    expect(screen.getByText(/sample offers, not live supplier commitments/)).toBeInTheDocument();
    expect(screen.queryByText(/System Attestation|5\/5 invariants verified|3 Competing Vendors/)).not.toBeInTheDocument();
  });

  it("provides an accessible skip link for keyboard navigation", () => {
    render(<WelcomeHeroScreen />);
    const skipLink = screen.getByText(/skip to main content/i);
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#welcome-main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "welcome-main");
  });

  it("includes the 3D sculpture component container without crashing", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByTestId("mock-sculpture-canvas")).toBeInTheDocument();
  });

  it("renders a readable product explanation in the dark section", () => {
    render(<WelcomeHeroScreen />);
    expect(
      screen.getByRole("heading", { name: /One request. A traceable path./i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/keep the commercial terms and the record behind them together/i)
    ).toBeInTheDocument();
  });

  it("renders four ordered stages without invented supplier examples", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("list", { name: "Procurement lifecycle" }).children).toHaveLength(4);
    for (const stage of ["Source", "Negotiate", "Audit", "Settle"]) expect(screen.getByRole("heading", { name: stage })).toBeInTheDocument();
    expect(screen.queryByText(/8,500|Dell P2723QE|LG 27UK850|Lenovo T27p/)).not.toBeInTheDocument();
  });

  it("renders the dark section finale headline and settlement CTA", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("heading", { name: /Start with a mandate./i })).toBeInTheDocument();
    const finaleCta = document.getElementById("lifecycle-cta");
    expect(finaleCta).toBeInTheDocument();
    expect(finaleCta).toHaveAttribute("href", "/workspace");
  });
  it("keeps technical explanations optional and distinguishes packaging from submission", () => {
    render(<WelcomeHeroScreen />);
    const summary = screen.getByText("How the checks work");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(screen.getByText(/Evidence packaged for a dispute remains local/)).toBeVisible();
    expect(screen.getByText(/deterministic fallback proposals are identified separately/)).toBeVisible();
  });
  it("keeps every anchor local to a real section or existing authentication route", () => {
    const { container } = render(<WelcomeHeroScreen />);
    for (const anchor of container.querySelectorAll("a")) {
      const href = anchor.getAttribute("href")!;
      if (href.startsWith("#")) expect(container.querySelector(href)).not.toBeNull();
      else expect(["/login", "/register", "/workspace"]).toContain(href);
    }
  });
  it("pauses and resumes the sculpture without replacing its canvas", () => {
    render(<WelcomeHeroScreen />);
    const canvas = screen.getByTestId("mock-sculpture-canvas");
    fireEvent.click(screen.getByRole("button", { name: "Pause sculpture motion" }));
    expect(canvas).toHaveAttribute("data-paused", "true");
    expect(screen.getByRole("button", { name: "Resume sculpture motion" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Resume sculpture motion" }));
    expect(screen.getByTestId("mock-sculpture-canvas")).toBe(canvas);
    expect(canvas).toHaveAttribute("data-paused", "false");
  });
  it("honors the system reduced-motion preference", () => {
    const original = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...original(query), matches: query === "(prefers-reduced-motion: reduce)" }));
    render(<WelcomeHeroScreen />);
    expect(screen.getByText("Reduced motion enabled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sculpture motion/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-sculpture-canvas")).toHaveAttribute("data-paused", "true");
    vi.restoreAllMocks();
  });
});
