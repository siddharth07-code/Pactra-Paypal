import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WelcomeHeroScreen Full-Screen Hero & Scroll Transition", () => {
  it("renders the hero container with full-viewport structural elements", () => {
    const { container } = render(<WelcomeHeroScreen />);
    const hero = container.querySelector(".cinema-hero");
    expect(hero).toBeInTheDocument();
    expect(hero?.tagName.toLowerCase()).toBe("section");
    expect(hero).toHaveAttribute("aria-labelledby", "welcome-title");
  });

  it("preserves the headline, kicker, and supporting copy without the redundant caption", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByText("A new standard for procurement")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("From intent.To agreement.");
    expect(
      screen.getByText(
        "Procurement, negotiation, verification and payment, connected by workflows and governed by your rules."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A B2B procurement workspace with PayPal Sandbox settlement.")
    ).not.toBeInTheDocument();
  });

  it("preserves both primary and secondary CTAs with proper routing", () => {
    render(<WelcomeHeroScreen />);
    const ctas = screen.getAllByRole("link", { name: "Open workspace" });
    const heroCta = ctas[0];
    expect(heroCta).toHaveAttribute("href", "/workspace");
    expect(heroCta.id).toBe("hero-cta");

    const experienceWorkflowLink = screen.getByRole("link", { name: "Experience the workflow" });
    expect(experienceWorkflowLink).toHaveAttribute("href", "#procurement-mandate");
  });

  it("embeds the HeroIllustration within the hero container", () => {
    const { container } = render(<WelcomeHeroScreen />);
    const illustration = container.querySelector(".hero-illustration-wrapper");
    expect(illustration).toBeInTheDocument();
    expect(illustration).toHaveAttribute("role", "img");
    expect(illustration).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Verifiable Procurement Agreement")
    );
  });

  it("renders the architectural transition seam on the lavender chapter", () => {
    const { container } = render(<WelcomeHeroScreen />);
    const chapter = container.querySelector("#procurement-mandate.cinema-chapter");
    expect(chapter).toBeInTheDocument();

    const seam = chapter?.querySelector(".cinema-transition-seam");
    expect(seam).toBeInTheDocument();
    expect(seam).toHaveAttribute("aria-hidden", "true");

    const glow = seam?.querySelector(".cinema-seam-glow");
    const line = seam?.querySelector(".cinema-seam-line");
    expect(glow).toBeInTheDocument();
    expect(line).toBeInTheDocument();
  });

});
