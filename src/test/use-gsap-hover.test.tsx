import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useGsapHoverLift } from "@/lib/use-gsap-hover";
import gsap from "gsap";

function TestCard({
  disabled,
  liftY = -5,
}: {
  disabled?: boolean;
  liftY?: number;
}) {
  const cardRef = useGsapHoverLift<HTMLDivElement>({
    y: liftY,
    disabled,
  });

  return (
    <div
      ref={cardRef}
      data-testid="interactive-card"
      className="p-4 border rounded"
    >
      Card Content
    </div>
  );
}

describe("useGsapHoverLift hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches mouseenter and mouseleave listeners and invokes gsap.to on hover", () => {
    const gsapToSpy = vi.spyOn(gsap, "to");

    const { getByTestId } = render(<TestCard liftY={-5} />);
    const card = getByTestId("interactive-card");

    // Simulate mouseenter
    fireEvent.mouseEnter(card);
    expect(gsapToSpy).toHaveBeenCalledWith(
      card,
      expect.objectContaining({
        y: -5,
        duration: 0.28,
        ease: "power2.out",
        overwrite: "auto",
      })
    );

    // Simulate mouseleave
    fireEvent.mouseLeave(card);
    expect(gsapToSpy).toHaveBeenCalledWith(
      card,
      expect.objectContaining({
        y: 0,
        duration: 0.25,
        ease: "power2.out",
        overwrite: "auto",
      })
    );
  });

  it("does not attach hover animation when disabled is true", () => {
    const gsapToSpy = vi.spyOn(gsap, "to");

    const { getByTestId } = render(<TestCard disabled={true} />);
    const card = getByTestId("interactive-card");

    fireEvent.mouseEnter(card);
    expect(gsapToSpy).not.toHaveBeenCalled();
  });

  it("cleans up tweens and resets y to 0 on unmount", () => {
    const killTweensSpy = vi.spyOn(gsap, "killTweensOf");
    const gsapSetSpy = vi.spyOn(gsap, "set");

    const { getByTestId, unmount } = render(<TestCard />);
    const card = getByTestId("interactive-card");

    unmount();

    expect(killTweensSpy).toHaveBeenCalledWith(card);
    expect(gsapSetSpy).toHaveBeenCalledWith(card, expect.objectContaining({ y: 0 }));
  });

  it("respects prefers-reduced-motion media query", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => {
      if (query === "(prefers-reduced-motion: reduce)") {
        return { matches: true };
      }
      return { matches: false };
    });

    const gsapToSpy = vi.spyOn(gsap, "to");
    const { getByTestId } = render(<TestCard />);
    const card = getByTestId("interactive-card");

    fireEvent.mouseEnter(card);
    expect(gsapToSpy).not.toHaveBeenCalled();

    window.matchMedia = originalMatchMedia;
  });

  it("does not attach hover animation on touch-only devices where (hover: none) matches", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => {
      if (query === "(hover: none)") {
        return { matches: true };
      }
      return { matches: false };
    });

    const gsapToSpy = vi.spyOn(gsap, "to");
    const { getByTestId } = render(<TestCard />);
    const card = getByTestId("interactive-card");

    fireEvent.mouseEnter(card);
    expect(gsapToSpy).not.toHaveBeenCalled();

    window.matchMedia = originalMatchMedia;
  });

  it("handles rapid mouseenter and mouseleave with overwrite auto", () => {
    const gsapToSpy = vi.spyOn(gsap, "to");
    const { getByTestId } = render(<TestCard liftY={-4} />);
    const card = getByTestId("interactive-card");

    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    fireEvent.mouseEnter(card);

    expect(gsapToSpy).toHaveBeenCalledTimes(3);
    expect(gsapToSpy).toHaveBeenLastCalledWith(
      card,
      expect.objectContaining({
        y: -4,
        overwrite: "auto",
      })
    );
  });
});
