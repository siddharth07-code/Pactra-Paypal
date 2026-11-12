import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WelcomeHeroScreen workflow", () => {
  it("renders the hero and public navigation without a footer", () => {
    const { container } = render(<WelcomeHeroScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("From intent.To agreement.");
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/workspace");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
    expect(container.querySelector(".cinema-hero .hero-illustration-wrapper svg")).toBeInTheDocument();
  });

  it("renders four illustrated workflow sections without duplicate summaries", () => {
    const { container } = render(<WelcomeHeroScreen />);
    const chapter = container.querySelector(".cinema-text-workflow")!;
    const sections = chapter.querySelectorAll("[data-scene]");
    expect(sections).toHaveLength(4);
    for (const section of sections) {
      expect(section.querySelector(".workflow-copy > h2")).toBeInTheDocument();
      expect(section.querySelector(".workflow-copy > p")).toBeInTheDocument();
      expect(section.querySelectorAll("svg[role=img]")).toHaveLength(1);
    }
    expect(chapter.querySelector("img, canvas, aside, table, .cinema-preview")).toBeNull();
    expect(container.querySelector("#lifecycle-section")).toBeNull();
  });

  it("keeps every anchor connected to a real section or existing route", () => {
    const { container } = render(<WelcomeHeroScreen />);
    for (const anchor of container.querySelectorAll("a")) {
      const href = anchor.getAttribute("href")!;
      if (href.startsWith("#")) expect(container.querySelector(href)).not.toBeNull();
      else expect(["/", "/about", "/login", "/register", "/workspace"]).toContain(href);
    }
  });

  it("removes the workflow label and motion controls", () => {
    const { container } = render(<WelcomeHeroScreen />);
    expect(container.querySelector(".cinema-controls")).toBeNull();
    expect(screen.queryByText("Illustrative workflow")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause motion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replay entrance" })).not.toBeInTheDocument();
  });

  it("preserves reversible scene transitions and their original timing", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("no-preference"),
      media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    const { container } = render(<WelcomeHeroScreen />);
    const trigger = ScrollTrigger.getAll().find(item => item.vars.start === "top top");
    const timeline = trigger?.animation;
    expect(trigger?.vars.scrub).toBe(.6);
    expect(trigger?.vars.end).toBe("bottom bottom");
    expect(timeline?.duration()).toBeCloseTo(8.4);
    for (const [time, scene] of [[1, "mandate"], [2.3, "negotiation"], [4, "audit"], [6.3, "settlement"], [4, "audit"], [2.3, "negotiation"], [1, "mandate"]] as const) {
      timeline!.time(time, false);
      for (const panel of container.querySelectorAll<HTMLElement>("[data-scene]")) {
        expect(panel).toHaveAttribute("aria-hidden", String(panel.dataset.scene !== scene));
        expect(panel.inert).toBe(panel.dataset.scene !== scene);
      }
    }
  });

  it("leaves all text readable for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes(": reduce"),
      media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    const { container } = render(<WelcomeHeroScreen />);
    expect(container.querySelector(".pactum-cinema")).not.toHaveAttribute("data-enhanced");
    for (const panel of container.querySelectorAll("[data-scene]")) {
      expect(panel).not.toHaveAttribute("aria-hidden", "true");
      expect(panel.querySelector("h2")).toBeVisible();
    }
  });
});
