"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface HeroIllustrationProps {
  className?: string;
  paused?: boolean;
}

export function HeroIllustration({ className = "", paused = false }: HeroIllustrationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add({ reduced: "(prefers-reduced-motion: reduce)", animated: "(prefers-reduced-motion: no-preference)" }, context => {
        if (paused || context.conditions?.reduced) {
          // Set final static rested states
          gsap.set(
            [
              ".hero-ill-backdrop",
              ".hero-ill-orbits",
              ".hero-ill-doc",
              ".hero-ill-pill",
            ],
            { opacity: 1, scale: 1, y: 0 }
          );
          gsap.set(".hero-ill-doc", { rotation: -6 });
          gsap.set(".hero-ill-doc-group", { y: 0 });
          gsap.set(".hero-ill-flare", { opacity: 1, scale: 1 });
          gsap.set(".hero-ill-flare-core", { scale: 1, opacity: 1 });
          gsap.set(".hero-ill-sig-path", { strokeDashoffset: 0 });
          return;
        }

        // 1. Entrance Choreography
        const entranceTl = gsap.timeline({
          defaults: { ease: "power3.out" },
          delay: 0.2,
        });

        // Background ambient shape
        entranceTl.fromTo(
          ".hero-ill-backdrop",
          { opacity: 0, scale: 0.88 },
          { opacity: 0.92, scale: 1, duration: 1.1 },
          0
        );

        // Orbits and flare
        entranceTl.fromTo(
          ".hero-ill-orbits",
          { opacity: 0, scale: 0.92 },
          { opacity: 1, scale: 1, duration: 1.2 },
          0.15
        );

        // Main agreement document (rises up and settles into isometric tilt)
        entranceTl.fromTo(
          ".hero-ill-doc",
          { opacity: 0, y: 36, rotation: -2 },
          { opacity: 1, y: 0, rotation: -6, duration: 1.1, ease: "power3.out" },
          0.25
        );

        // Signature line drawing effect
        const sigPath = containerRef.current?.querySelector(".hero-ill-sig-path") as SVGPathElement | null;
        if (sigPath) {
          const length = typeof sigPath.getTotalLength === "function" ? sigPath.getTotalLength() : 140;
          gsap.set(sigPath, { strokeDasharray: length, strokeDashoffset: length });
          entranceTl.to(
            sigPath,
            { strokeDashoffset: 0, duration: 0.85, ease: "power2.inOut" },
            0.85
          );
        }

        // Satellite pills pop into view with staggered natural spring
        entranceTl.fromTo(
          ".hero-ill-pill",
          { opacity: 0, y: 20, scale: 0.88 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.8,
            stagger: 0.14,
            ease: "back.out(1.1)",
          },
          0.55
        );

        // Flare twinkle entrance
        entranceTl.fromTo(
          ".hero-ill-flare",
          { opacity: 0, scale: 0.4 },
          { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2)" },
          0.9
        );

        const settledAt = entranceTl.delay() + entranceTl.duration();

        // 2. Continuous Floating & Breathing Loops (Independent Subtle Frequencies)
        // Main agreement document gentle float
        gsap.to(".hero-ill-doc-group", {
          y: -7,
          duration: 4.8,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: settledAt + 0.3,
        });

        // Top-Left "Negotiate" pill
        gsap.to(".hero-ill-pill-negotiate", {
          y: -6,
          rotation: 0.8,
          duration: 4.2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: settledAt + 0.6,
        });

        // Bottom-Left "Verify" pill
        gsap.to(".hero-ill-pill-verify", {
          y: -5,
          rotation: -0.6,
          duration: 4.6,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: settledAt + 1.1,
        });

        // Bottom-Right "Pay with PayPal" pill
        gsap.to(".hero-ill-pill-paypal", {
          y: -8,
          rotation: 0.5,
          duration: 5.2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: settledAt + 0.8,
        });

        // Ambient mauve backdrop gentle breathing
        gsap.to(".hero-ill-backdrop", {
          scale: 1.03,
          duration: 6.5,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: settledAt,
        });

        // Orbital light flare gentle pulsation
        gsap.to(".hero-ill-flare-core", {
          scale: 1.35,
          opacity: 0.95,
          transformOrigin: "center center",
          duration: 2.4,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: settledAt + 0.2,
        });
      });
      return () => media.revert();
    },
    { scope: containerRef, dependencies: [paused], revertOnUpdate: true }
  );

  return (
    <div
      ref={containerRef}
      className={`hero-illustration-wrapper w-full mx-auto select-none ${className}`}
      data-motion={paused ? "paused" : "enabled"}
      aria-label="Illustration: Verifiable Procurement Agreement with AI Negotiation, Verification, and PayPal Settlement"
      role="img"
    >
      <svg
        viewBox="0 0 540 480"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto overflow-visible"
      >
        <defs>
          {/* Document Multi-Stage Shadow Filter */}
          <filter id="hero-doc-shadow" x="-20%" y="-15%" width="150%" height="160%">
            <feDropShadow
              dx="0"
              dy="24"
              stdDeviation="20"
              floodColor="#412D3E"
              floodOpacity="0.12"
            />
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="12"
              floodColor="#292129"
              floodOpacity="0.08"
            />
          </filter>

          {/* Satellite Pill Elevation Shadow */}
          <filter id="hero-pill-shadow" x="-25%" y="-30%" width="160%" height="180%">
            <feDropShadow
              dx="0"
              dy="14"
              stdDeviation="14"
              floodColor="#412D3E"
              floodOpacity="0.10"
            />
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="6"
              floodColor="#15121c"
              floodOpacity="0.07"
            />
          </filter>

          {/* Radial Flare Glow */}
          <radialGradient id="hero-flare-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="40%" stopColor="#EDE3E9" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#B98EAC" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#B98EAC" stopOpacity="0" />
          </radialGradient>

          {/* Ambient Mauve Backdrop Gradient */}
          <linearGradient id="hero-backdrop-grad" x1="120" y1="80" x2="420" y2="400" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#EDE3E9" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#DEC9D7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#B98EAC" stopOpacity="0.7" />
          </linearGradient>

          {/* Document Surface Linear Gradient */}
          <linearGradient id="hero-doc-surf" x1="150" y1="85" x2="390" y2="405" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#F7F3EF" />
          </linearGradient>

          {/* Orbital Arc Stroke Gradient */}
          <linearGradient id="hero-orbit-grad" x1="80" y1="180" x2="480" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B98EAC" stopOpacity="0.3" />
            <stop offset="45%" stopColor="#B98EAC" stopOpacity="0.7" />
            <stop offset="75%" stopColor="#DEC9D7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#B98EAC" stopOpacity="0.35" />
          </linearGradient>

          {/* Subtle Deep Cast Shadow on the corner of the tilted document */}
          <linearGradient id="hero-doc-corner-depth" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#412D3E" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* ========================================================= */}
        {/* LAYER 1: Ambient Organic Lavender Backdrop Shape          */}
        {/* ========================================================= */}
        <path
          className="hero-ill-backdrop"
          d="M 145 155 C 110 85, 235 55, 330 75 C 425 95, 455 165, 435 255 C 415 355, 335 415, 235 405 C 135 395, 125 285, 110 215 C 100 175, 165 195, 145 155 Z"
          fill="url(#hero-backdrop-grad)"
          style={{ transformOrigin: "280px 245px" }}
        />

        {/* ========================================================= */}
        {/* LAYER 2: 3D Orbital Rings (Luminous Perspective Ellipses) */}
        {/* ========================================================= */}
        <g className="hero-ill-orbits" style={{ transformOrigin: "275px 245px" }}>
          {/* Secondary background orbital ellipse */}
          <ellipse
            cx="270"
            cy="245"
            rx="205"
            ry="75"
            transform="rotate(-18 270 245)"
            stroke="#DEC9D7"
            strokeWidth="1.5"
            strokeOpacity="0.65"
          />

          {/* Primary foreground orbital ellipse */}
          <ellipse
            cx="280"
            cy="245"
            rx="215"
            ry="88"
            transform="rotate(-28 280 245)"
            stroke="url(#hero-orbit-grad)"
            strokeWidth="2.2"
          />

          {/* Orbital Light Flare & Sparkle (Catches light along the ellipse) */}
          <g className="hero-ill-flare" transform="translate(422, 172)">
            {/* Ambient diffuse glow */}
            <circle cx="0" cy="0" r="22" fill="url(#hero-flare-glow)" opacity="0.85" />
            {/* Radiant flare diamond */}
            <g className="hero-ill-flare-core">
              <path
                d="M 0 -13 Q 0 0 -13 0 Q 0 0 0 13 Q 0 0 13 0 Q 0 0 0 -13 Z"
                fill="#ffffff"
              />
              <circle cx="0" cy="0" r="3" fill="#ffffff" />
            </g>
          </g>
        </g>

        {/* ========================================================= */}
        {/* LAYER 3: Central Floating Procurement Agreement Document */}
        {/* ========================================================= */}
        <g className="hero-ill-doc-group">
          <g
            className="hero-ill-doc"
            style={{ transformOrigin: "270px 245px", transform: "rotate(-6deg)" }}
          >
            {/* The Document Card with Realistic Drop Shadow */}
            <rect
              x="150"
              y="85"
              width="240"
              height="315"
              rx="24"
              fill="url(#hero-doc-surf)"
              stroke="#ece5dc"
              strokeWidth="1"
              filter="url(#hero-doc-shadow)"
            />
            {/* Inner subtle bevel overlay */}
            <rect
              x="150"
              y="85"
              width="240"
              height="315"
              rx="24"
              fill="url(#hero-doc-corner-depth)"
              pointerEvents="none"
            />

            {/* Top-Right Badge: [Shield] "Verified" */}
            <g transform="translate(284, 105)">
              <rect
                x="0"
                y="0"
                width="88"
                height="28"
                rx="8"
                fill="#ffffff"
                stroke="#22c55e"
                strokeWidth="1.2"
              />
              {/* Green Shield Icon */}
              <g transform="translate(10, 6)">
                <path
                  d="M 7 1 L 1 3.5 V 7 C 1 10.5 3.5 13.5 7 14.5 C 10.5 13.5 13 10.5 13 7 V 3.5 L 7 1 Z"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 4.5 7.5 L 6.5 9.5 L 9.8 5.5"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <text
                x="28"
                y="18"
                fill="#15803d"
                fontSize="14"
                fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="-0.01em"
              >
                Verified
              </text>
            </g>

            {/* Document Title: "Procurement Agreement" */}
            <text
              x="180"
              y="154"
              fill="#292129"
              fontSize="21.5"
              fontWeight="700"
              letterSpacing="-0.035em"
              fontFamily="Inter, system-ui, sans-serif"
            >
              Procurement
            </text>
            <text
              x="180"
              y="180"
              fill="#292129"
              fontSize="21.5"
              fontWeight="700"
              letterSpacing="-0.035em"
              fontFamily="Inter, system-ui, sans-serif"
            >
              Agreement
            </text>

            {/* Clause placeholder lines */}
            <rect x="180" y="206" width="138" height="5" rx="2.5" fill="#ded7cd" />
            <rect x="180" y="221" width="108" height="5" rx="2.5" fill="#ded7cd" />
            <rect x="180" y="236" width="72" height="5" rx="2.5" fill="#ded7cd" />

            {/* Fluid Handwritten Ink Signature */}
            <g transform="translate(180, 268)">
              <path
                className="hero-ill-sig-path"
                d="M 0 16 C 5 4, 12 0, 17 14 C 21 26, 28 -2, 35 12 C 42 24, 48 4, 57 8 C 65 11, 72 3, 80 5"
                fill="none"
                stroke="#412D3E"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Signature baseline rule */}
              <line
                x1="0"
                y1="25"
                x2="88"
                y2="25"
                stroke="#dcd5cc"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>

        {/* ========================================================= */}
        {/* LAYER 4: Floating Satellite Badges (Pills)                */}
        {/* ========================================================= */}

        {/* SATELLITE 1: [Sparkles] "Negotiate" (Top-Left) */}
        <g
          className="hero-ill-pill hero-ill-pill-negotiate"
          style={{ transformOrigin: "115px 166px" }}
        >
          <g filter="url(#hero-pill-shadow)">
            <rect
              x="52"
              y="144"
              width="128"
              height="44"
              rx="13"
              fill="#ffffff"
              stroke="#ece5dc"
              strokeWidth="1"
            />
          </g>
          {/* Sparkles / AI Stars Icon in Plum */}
          <g transform="translate(68, 156)">
            {/* Primary Star */}
            <path
              d="M 8 1 Q 8 8 1 8 Q 8 8 8 15 Q 8 8 15 8 Q 8 8 8 1 Z"
              fill="#412D3E"
            />
            {/* Secondary Star */}
            <path
              d="M 16 11 Q 16 14 13 14 Q 16 14 16 17 Q 16 14 19 14 Q 16 14 16 11 Z"
              fill="#B98EAC"
              opacity="0.85"
            />
          </g>
          <text
            x="96"
            y="171"
            fill="#292129"
            fontSize="16.5"
            fontWeight="600"
            fontFamily="Inter, system-ui, sans-serif"
            letterSpacing="-0.02em"
          >
            Negotiate
          </text>
        </g>

        {/* SATELLITE 2: [Shield Check] "Verify" (Bottom-Left) */}
        <g
          className="hero-ill-pill hero-ill-pill-verify"
          style={{ transformOrigin: "135px 295px" }}
        >
          <g filter="url(#hero-pill-shadow)">
            <rect
              x="78"
              y="274"
              width="114"
              height="44"
              rx="13"
              fill="#ffffff"
              stroke="#ece5dc"
              strokeWidth="1"
            />
          </g>
          {/* Shield Outline Check Icon in Dark Ink */}
          <g transform="translate(94, 286)">
            <path
              d="M 8 1 L 1 3.8 V 8 C 1 12.2 4 15.8 8 17 C 12 15.8 15 12.2 15 8 V 3.8 L 8 1 Z"
              fill="none"
              stroke="#1c1917"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 5 8.5 L 7.2 11 L 11.5 6"
              fill="none"
              stroke="#1c1917"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <text
            x="122"
            y="301"
            fill="#292129"
            fontSize="16.5"
            fontWeight="600"
            fontFamily="Inter, system-ui, sans-serif"
            letterSpacing="-0.02em"
          >
            Verify
          </text>
        </g>

        {/* SATELLITE 3: [PayPal] "Pay with PayPal" [Check] (Bottom-Right) */}
        <g
          className="hero-ill-pill hero-ill-pill-paypal"
          style={{ transformOrigin: "392px 279px" }}
        >
          <g filter="url(#hero-pill-shadow)">
            <rect
              x="292"
              y="254"
              width="196"
              height="50"
              rx="14"
              fill="#ffffff"
              stroke="#eae3d9"
              strokeWidth="1"
            />
          </g>

          {/* Authentic Dual-Tone PayPal Monogram Double-P */}
          <g transform="translate(308, 267)">
            {/* Back P (Deep Navy) */}
            <path
              d="M 2.4 20 L 6.2 1.6 C 6.4 0.7 7.2 0 8.2 0 H 15.8 C 19.5 0 22 2.2 21.2 5.6 C 20.4 9.1 17.5 11.8 14 11.8 H 10.4 L 8.6 20.4 C 8.5 21 8 21.4 7.4 21.4 H 3.8 C 2.8 21.4 2.2 20.7 2.4 20 Z"
              fill="#00457C"
            />
            {/* Front P (Cyan-Cobalt Blue, offset) */}
            <path
              d="M 6.4 23 L 9.8 6.4 C 10 5.6 10.7 5 11.6 5 H 18.5 C 21.8 5 24 7 23.3 10 C 22.5 13.2 20 15.5 16.8 15.5 H 13.6 L 12 23.4 C 11.9 23.9 11.4 24.3 10.9 24.3 H 7.6 C 6.8 24.3 6.2 23.7 6.4 23 Z"
              fill="#0079C1"
            />
          </g>

          {/* Label Text */}
          <text
            x="346"
            y="285"
            fill="#292129"
            fontSize="15"
            fontWeight="600"
            fontFamily="Inter, system-ui, sans-serif"
            letterSpacing="-0.02em"
          >
            Pay with PayPal
          </text>

          {/* Blue Settlement Checkmark Icon */}
          <g transform="translate(458, 273)">
            <path
              d="M 2 8 L 6.5 12.5 L 15 2"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
