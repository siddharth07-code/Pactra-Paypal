import React from "react";
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

afterAll(() => { ScrollTrigger.disable(); });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PACTRA — Professional Workflow Copy Refinement", () => {
  it("renders the exact four required chapter headings and descriptions", () => {
    const { container } = render(<WelcomeHeroScreen />);

    // 1. Sourcing
    const mandateStory = container.querySelector('.cinema-story[data-scene="mandate"]');
    expect(mandateStory).toBeInTheDocument();
    expect(mandateStory?.querySelector("h2")).toHaveTextContent("Define procurement requirements");
    expect(mandateStory?.querySelector("p")).toHaveTextContent(
      "Specify budget limits, delivery conditions, and supplier selection criteria."
    );

    // 2. Negotiation
    const negotiationStory = container.querySelector('.cinema-story[data-scene="negotiation"]');
    expect(negotiationStory).toBeInTheDocument();
    expect(negotiationStory?.querySelector("h2")).toHaveTextContent("Negotiate supplier terms");
    expect(negotiationStory?.querySelector("p")).toHaveTextContent(
      "Evaluate supplier offers and negotiate pricing within established constraints."
    );

    // 3. Verification
    const auditStory = container.querySelector('.cinema-story[data-scene="audit"]');
    expect(auditStory).toBeInTheDocument();
    expect(auditStory?.querySelector("h2")).toHaveTextContent("Verify agreement compliance");
    expect(auditStory?.querySelector("p")).toHaveTextContent(
      "Validate negotiated terms, procurement policies, and cryptographic evidence."
    );

    // 4. Settlement
    const settlementStory = container.querySelector('.cinema-story[data-scene="settlement"]');
    expect(settlementStory).toBeInTheDocument();
    expect(settlementStory?.querySelector("h2")).toHaveTextContent("Process approved payments");
    expect(settlementStory?.querySelector("p")).toHaveTextContent(
      "Initiate PayPal authorization and capture subject to required approvals and verification."
    );
  });

  it("removes decorative chapter numberings and scenes labels", () => {
    const { container } = render(<WelcomeHeroScreen />);

    // No decorative chapter numberings (01 /, 02 /, etc.) in story sections
    const stories = container.querySelectorAll(".cinema-story");
    stories.forEach((story) => {
      expect(story.textContent).not.toMatch(/0[1-4]\s*\//);
      // Each story has exactly one heading and one supporting paragraph
      expect(story.querySelectorAll("h2")).toHaveLength(1);
      expect(story.querySelectorAll("p")).toHaveLength(1);
    });

    // No decorative 'Scenes 01 + 02 + 03 + 04' or 'Chapters 01 + 02 + 03 + 04' labels
    expect(container.textContent).not.toContain("Scenes 01 + 02 + 03 + 04");
    expect(container.textContent).not.toContain("Chapters 01 + 02 + 03 + 04");
  });

  it("preserves animation DOM hooks and structural data-scene attributes", () => {
    const { container } = render(<WelcomeHeroScreen />);

    // Essential GSAP hooks
    expect(container.querySelector(".cinema-chapter")).toBeInTheDocument();
    expect(container.querySelector(".cinema-sticky")).toBeInTheDocument();
    expect(container.querySelector(".cinema-preview")).toBeInTheDocument();
    expect(container.querySelector(".cinema-rail")).toBeInTheDocument();

    // Scene panels
    expect(container.querySelector('.cinema-interface[data-scene="mandate"]')).toBeInTheDocument();
    expect(container.querySelector('.cinema-negotiation[data-scene="negotiation"]')).toBeInTheDocument();
    expect(container.querySelector('.cinema-audit[data-scene="audit"]')).toBeInTheDocument();
    expect(container.querySelector('.cinema-settlement[data-scene="settlement"]')).toBeInTheDocument();

    // Step elements targeted by GSAP
    expect(container.querySelector(".cinema-confirm")).toBeInTheDocument();
    expect(container.querySelectorAll(".cinema-offer").length).toBeGreaterThan(0);
    expect(container.querySelector(".cinema-terms")).toBeInTheDocument();
    expect(container.querySelector(".cinema-agreement")).toBeInTheDocument();
    expect(container.querySelectorAll(".cinema-audit-check").length).toBeGreaterThan(0);
    expect(container.querySelector(".cinema-evidence-leaves")).toBeInTheDocument();
    expect(container.querySelector(".cinema-evidence-join")).toBeInTheDocument();
    expect(container.querySelector(".cinema-evidence-root")).toBeInTheDocument();
    expect(container.querySelector(".cinema-audit-result")).toBeInTheDocument();
    expect(container.querySelector(".cinema-payment-approval")).toBeInTheDocument();
    expect(container.querySelectorAll(".cinema-payment-step").length).toBeGreaterThan(0);
    expect(container.querySelector(".cinema-payment-outcome")).toBeInTheDocument();
  });

  it("simplifies interface panel labels while preserving clear demonstration disclosures", () => {
    render(<WelcomeHeroScreen />);

    // Simplified enterprise labels without decorative 01 / prefixes
    expect(screen.getByText("Procurement mandate")).toBeInTheDocument();
    expect(screen.getByText("Supplier negotiation")).toBeInTheDocument();
    expect(screen.getByText("Compliance verification")).toBeInTheDocument();
    expect(screen.getByText("Payment settlement")).toBeInTheDocument();

    // Clear disclosures preserved
    expect(
      screen.getByText(/Sample requirements\. No live procurement or payment activity\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All amounts and checks below are sample data, not live activity\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sample verification only\. No agreement is created/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All amounts and statuses are examples\. Scrolling does not approve/i)
    ).toBeInTheDocument();
  });
});
