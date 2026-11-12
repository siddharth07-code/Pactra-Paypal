import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import gsap from "gsap";
import { HeroIllustration } from "@/components/landing/HeroIllustration";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("agreement illustration motion preferences", () => {
  it.each([
    { paused: true, reduced: false },
    { paused: false, reduced: true },
  ])("keeps the signed agreement readable with paused=$paused and reduced=$reduced", ({ paused, reduced }) => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("no-preference") ? !reduced : reduced,
      media: query,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    const { container, getByRole } = render(<HeroIllustration paused={paused} />);
    expect(getByRole("img")).toBeVisible();
    const signature = container.querySelector<SVGPathElement>(".hero-ill-sig-path")!;
    expect(signature.style.strokeDashoffset).toBe("0");
    expect(container.querySelector(".hero-ill-doc")?.getAttribute("style")).toContain("opacity: 1");
    const movingLayers = container.querySelectorAll(".hero-ill-doc-group, .hero-ill-pill, .hero-ill-backdrop, .hero-ill-flare-core");
    expect(gsap.getTweensOf(Array.from(movingLayers), true)).toHaveLength(0);
  });
});
