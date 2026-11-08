import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

// Mock WebGL canvas component to isolate DOM/editorial layout and accessibility tests
vi.mock("@/components/landing/HeroSculptureCanvas", () => ({
  HeroSculptureCanvas: ({ onLoaded }: { onLoaded?: () => void }) => {
    React.useEffect(() => {
      onLoaded?.();
    }, [onLoaded]);
    return <div data-testid="mock-sculpture-canvas">Mock 3D Hero Sculpture</div>;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WelcomeHeroScreen Editorial Layout & Accessibility", () => {
  it("renders the oversized headline with masked word spans", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Engineered For Certainty.");
  });

  it("renders the high-contrast black pill CTA linking directly to /login", () => {
    render(<WelcomeHeroScreen />);
    const ctas = screen.getAllByRole("link", { name: /enter workspace/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    expect(ctas[0]).toHaveAttribute("href", "/login");
    expect(ctas[0].className).toContain("pactum-pill-cta");
  });

  it("renders the technical baseline metadata rail", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByText(/Architecture: SHA-256 Merkle Engine/i)).toBeInTheDocument();
    expect(screen.getByText("PayPal Orders v2 • Audited Capture Gate")).toBeInTheDocument();
  });

  it("provides an accessible skip link for keyboard navigation", () => {
    render(<WelcomeHeroScreen />);
    const skipLink = screen.getByText(/skip to primary workspace action/i);
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#hero-cta");
  });

  it("includes the 3D sculpture component container without crashing", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByTestId("mock-sculpture-canvas")).toBeInTheDocument();
  });

  it("renders the two-tone editorial thesis statement in the dark section", () => {
    render(<WelcomeHeroScreen />);
    expect(
      screen.getByText(/Autonomous procurement shouldn’t operate in the dark./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We bind multi-vendor negotiation, SHA-256 Merkle proofs/i)
    ).toBeInTheDocument();
  });

  it("renders the 4 monolithic architectural pillars", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByText("SOURCING")).toBeInTheDocument();
    expect(screen.getByText("3 Competing Vendors")).toBeInTheDocument();
    expect(screen.getByText("NEGOTIATE")).toBeInTheDocument();
    expect(screen.getByText("Deterministic Guardrail")).toBeInTheDocument();
    expect(screen.getByText("AUDIT")).toBeInTheDocument();
    expect(screen.getByText("5 Invariant Proofs")).toBeInTheDocument();
    expect(screen.getByText("SETTLE")).toBeInTheDocument();
    expect(screen.getByText("Audited Capture Gate")).toBeInTheDocument();
  });

  it("renders the dark section finale headline and settlement CTA", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByRole("heading", { name: /Settle Verifiably./i })).toBeInTheDocument();
    const finaleCta = document.getElementById("lifecycle-cta");
    expect(finaleCta).toBeInTheDocument();
    expect(finaleCta).toHaveAttribute("href", "/login");
  });
});
