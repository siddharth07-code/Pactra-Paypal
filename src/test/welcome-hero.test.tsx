import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

// Mock WebGL canvas to isolate DOM/editorial layout and accessibility tests
vi.mock("@/components/landing/HeroSculptureCanvas", () => ({
  HeroSculptureCanvas: ({ onLoaded }: { onLoaded?: () => void }) => {
    // simulate immediate load
    React.useEffect(() => {
      onLoaded?.();
    }, [onLoaded]);
    return <div data-testid="mock-sculpture-canvas">Mock 3D Sculpture</div>;
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
    const cta = screen.getByRole("link", { name: /enter workspace/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/login");
    expect(cta.className).toContain("pactum-pill-cta");
  });

  it("renders the technical baseline metadata rail", () => {
    render(<WelcomeHeroScreen />);
    expect(screen.getByText(/Architecture: SHA-256 Merkle Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/PayPal Orders v2/i)).toBeInTheDocument();
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
});
