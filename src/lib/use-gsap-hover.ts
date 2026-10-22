"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";

export interface GsapHoverOptions {
  /**
   * Vertical lift distance in pixels (negative raises the element).
   * Default: -5
   */
  y?: number;
  /**
   * Duration of the lift animation on pointer enter in seconds.
   * Default: 0.28s
   */
  durationIn?: number;
  /**
   * Duration of the return animation on pointer leave in seconds.
   * Default: 0.25s
   */
  durationOut?: number;
  /**
   * GSAP easing function.
   * Default: "power2.out"
   */
  ease?: string;
  /**
   * Whether the hover lift is disabled.
   * Default: false
   */
  disabled?: boolean;
}

/**
 * Custom hook to apply a refined GSAP hover lift to any interactive element.
 * Inspired by whileHover={{ y: -5 }} but with scoped GSAP tweens, automatic tween
 * overwriting to prevent thrashing, prefers-reduced-motion checks, and pointer-capability detection.
 */
export function useGsapHoverLift<T extends HTMLElement = HTMLDivElement>(
  options: GsapHoverOptions = {}
): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const {
    y = -5,
    durationIn = 0.28,
    durationOut = 0.25,
    ease = "power2.out",
    disabled = false,
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    // Check accessibility and input device capabilities
    if (typeof window !== "undefined") {
      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Do not attach hover-only behavior to touch-only devices
      const isTouchOnly =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: none)").matches;

      if (prefersReducedMotion || isTouchOnly) {
        return;
      }
    }

    const handleMouseEnter = () => {
      gsap.to(el, {
        y,
        duration: durationIn,
        ease,
        overwrite: "auto",
      });
    };

    const handleMouseLeave = () => {
      gsap.to(el, {
        y: 0,
        duration: durationOut,
        ease,
        overwrite: "auto",
      });
    };

    el.addEventListener("mouseenter", handleMouseEnter);
    el.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      el.removeEventListener("mouseenter", handleMouseEnter);
      el.removeEventListener("mouseleave", handleMouseLeave);
      gsap.killTweensOf(el);
      gsap.set(el, { y: 0 });
    };
  }, [y, durationIn, durationOut, ease, disabled]);

  return ref;
}
