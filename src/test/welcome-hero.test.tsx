import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";


afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WelcomeHeroScreen Editorial Layout & Accessibility", () => {
  it("renders the product headline without an animation mask", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("From intent.To agreement.");
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
  it("keeps the sample mandate separate from live activity", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("group", { name: "Illustrative procurement mandate" })).toBeInTheDocument();
    expect(screen.getByText(/No live procurement or payment activity/)).toBeVisible();
    expect(screen.getByText("Buyer-defined limit")).toBeVisible();
  });
  it("lets visitors pause motion without losing the mandate or workspace link", () => {
    render(<WelcomeHeroScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(screen.getByRole("button", { name: "Resume motion" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: /Clarity before/ })).toBeVisible();
    expect(screen.getByRole("group", { name: "Illustrative procurement mandate" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Resume motion" }));
    expect(screen.getByRole("button", { name: "Pause motion" })).toHaveAttribute("aria-pressed", "false");
  });
  it("shows sample offers, a failed delivery check and draft terms requiring approval", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("list", { name: "Sample supplier offers" }).children).toHaveLength(2);
    expect(screen.getByText(/All amounts and checks below are sample data/)).toBeVisible();
    expect(screen.getByText(/Delivery exceeds the example limit/)).toBeVisible();
    expect(screen.getByText("USD 3,700 · 8 days")).toBeVisible();
    expect(screen.getByText(/Buyer approval remains required/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Create your procurement mandate" })).toHaveAttribute("href", "/workspace");
  });
  it("retains negotiation content when motion is paused and replayed", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    render(<WelcomeHeroScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(screen.getByRole("heading", { name: "Draft terms for buyer review" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Replay entrance" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(screen.getByRole("button", { name: "Pause motion" })).toHaveAttribute("aria-pressed", "false");
  });
  it("carries the negotiated draft into a disclosed audit example without implying approval", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByText("20 office chairs · USD 3,700 · delivery in 8 days")).toBeVisible();
    expect(screen.getByText("Buyer approval pending · payment not authorized")).toBeVisible();
    expect(screen.getByRole("list", { name: "Illustrative agreement policy checks" }).children).toHaveLength(3);
    expect(screen.getByText("Still required")).toBeVisible();
    expect(screen.getByText(/No agreement is created and no cryptographic verification is executed here/)).toBeVisible();
    expect(screen.getByRole("figure", { name: "SHA-256 / Merkle evidence, simplified" })).toBeVisible();
    expect(screen.getByText("Diagram only · no computed hash")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Audit-verified / Illustrative state" })).toBeVisible();
  });
  it("keeps the audit record readable with motion paused", () => {
    render(<WelcomeHeroScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(screen.getByRole("heading", { name: "A draft with a traceable record." })).toBeVisible();
    expect(screen.getByText(/Buyer approval and PayPal Sandbox settlement remain separate steps/)).toBeVisible();
  });
  it("separates agreement approval, PayPal approval, authorization and capture", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("heading", { name: "Buyer approval / Pending in this example" })).toBeVisible();
    const steps = screen.getByRole("list", { name: "Conditional PayPal payment sequence" });
    expect(steps.children).toHaveLength(3);
    expect(steps.children[0]).toHaveTextContent("Orders v2 order with AUTHORIZE intent");
    expect(steps.children[0]).toHaveTextContent("buyer then approves it separately at PayPal");
    expect(steps.children[1]).toHaveTextContent("does not capture them or confirm settlement");
    expect(steps.children[2]).toHaveTextContent("Payments v2 capture uses the authorization ID");
    expect(screen.getByText("Example status / Not authorized")).toBeVisible();
    expect(screen.getByText("Example status / Not captured")).toBeVisible();
    expect(screen.getByText(/Scrolling does not approve the agreement, open checkout or make a payment/)).toBeVisible();
    expect(screen.getByText(/pending or failed result is not a completed payment/)).toBeVisible();
    expect(screen.getByText(/After buyer approval at PayPal, the server requests authorization/)).toBeVisible();
  });
  it("retains the conditional settlement narrative when paused and replayed", () => {
    vi.stubGlobal("scrollTo", vi.fn());
    render(<WelcomeHeroScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(screen.getByRole("heading", { name: "Settlement / Awaiting payment confirmation" })).toBeVisible();
    expect(screen.getByText(/No funds move in this demonstration/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Review settlement in your workspace" })).toHaveAttribute("href", "/workspace");
    fireEvent.click(screen.getByRole("button", { name: "Replay entrance" }));
    expect(screen.getByText("Example status / Not started")).toBeVisible();
  });
});
