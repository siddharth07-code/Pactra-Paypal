import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourcingSceneSvg } from "@/components/landing/workflow/SourcingSceneSvg";
import { NegotiationSceneSvg } from "@/components/landing/workflow/NegotiationSceneSvg";
import { VerificationSceneSvg } from "@/components/landing/workflow/VerificationSceneSvg";
import { SettlementSceneSvg } from "@/components/landing/workflow/SettlementSceneSvg";
import { SvgNode, SvgTooltip } from "@/components/landing/workflow/WorkflowSvgPrimitives";

describe("PACTRA — Workflow Content & Typography Refinement", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  describe("1. Content Reduction & Text Conciseness", () => {
    it("renders clean labels in SettlementSceneSvg without ellipsis string-truncation hacks", () => {
      const { container } = render(<SettlementSceneSvg />);
      const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent || "");
      // None of the text elements should contain an ugly "..." truncation
      const hasUglyTruncation = texts.some((t) => t.endsWith("...") && !t.includes("0x") && !t.includes("h0:") && !t.includes("h1:") && !t.includes("h2:") && !t.includes("orders"));
      expect(hasUglyTruncation).toBe(false);
    });

    it("presents clean, non-redundant labels across Sourcing constraints", () => {
      render(<SourcingSceneSvg />);
      expect(screen.getByText("Category")).toBeInTheDocument();
      expect(screen.getByText("Item specification")).toBeInTheDocument();
      expect(screen.getByText("Approval")).toBeInTheDocument();
      expect(screen.getByText("Policy requirement")).toBeInTheDocument();
      expect(screen.getByText("Budget")).toBeInTheDocument();
      expect(screen.getByText("Mandate ceiling")).toBeInTheDocument();
      expect(screen.getByText("Delivery")).toBeInTheDocument();
      expect(screen.getByText("Fulfillment window")).toBeInTheDocument();
    });

    it("keeps status badges concise and meaningful", () => {
      render(<SourcingSceneSvg />);
      expect(screen.getByText("Verified")).toBeInTheDocument();
      expect(screen.getByText("Mandatory")).toBeInTheDocument();
      expect(screen.getByText("Ceiling")).toBeInTheDocument();
      expect(screen.getByText("Hard SLA")).toBeInTheDocument();
    });
  });

  describe("2. Typography Consistency & Visual Hierarchy", () => {
    it("uses standardized Inter and Plex Mono font families in SvgNode primitives", () => {
      render(
        <svg>
          <SvgNode
            x={0}
            y={0}
            width={160}
            height={60}
            title="Test Node"
            subtitle="Testing subtitle"
            metric="USD 1,000"
            badge={{ text: "Active", variant: "mint" }}
          />
        </svg>
      );
      const title = screen.getByText("Test Node");
      expect(title).toHaveAttribute("font-family", expect.stringContaining("Inter"));
      expect(title).toHaveAttribute("font-weight", "600");

      const metric = screen.getByText("USD 1,000");
      expect(metric).toHaveAttribute("font-family", expect.stringContaining("font-plex-mono"));
      expect(metric).toHaveAttribute("font-weight", "700");
    });

    it("applies consistent dark theme and typography to SvgTooltip", () => {
      const { container } = render(
        <svg>
          <SvgTooltip
            x={10}
            y={10}
            title="Tooltip Title"
            description="Tooltip description message"
            details={["Detail item 1", "Detail item 2"]}
            isVisible={true}
          />
        </svg>
      );
      const tooltipBg = container.querySelector(".workflow-svg-tooltip rect");
      expect(tooltipBg).toHaveAttribute("fill", "#111111");

      const title = screen.getByText("Tooltip Title");
      expect(title).toHaveAttribute("fill", "#f5f3ef");

      const detail = screen.getByText("• Detail item 1");
      expect(detail).toHaveAttribute("font-family", expect.stringContaining("font-plex-mono"));
    });

    it("maintains strict uppercase tracking for scene card headers", () => {
      const { container: sourcing } = render(<SourcingSceneSvg />);
      const sourcingHeader = sourcing.querySelector("text[letter-spacing='0.04em']");
      expect(sourcingHeader).toBeInTheDocument();
      expect(sourcingHeader?.textContent).toBe("PROCUREMENT MANDATE");

      const { container: negotiation } = render(<NegotiationSceneSvg />);
      const negHeader = negotiation.querySelector("text[letter-spacing='0.04em']");
      expect(negHeader).toBeInTheDocument();
      expect(negHeader?.textContent).toBe("NEGOTIATED DRAFT");

      const { container: verification } = render(<VerificationSceneSvg />);
      const verHeader = verification.querySelector("text[letter-spacing='0.04em']");
      expect(verHeader).toBeInTheDocument();
      expect(verHeader?.textContent).toBe("DRAFT AGREEMENT");
    });
  });

  describe("3. SVG Refinement & Geometry Consistency", () => {
    it("renders all four scenes with standard 540x326 responsive viewBox", () => {
      const { container: c1 } = render(<SourcingSceneSvg />);
      expect(c1.querySelector("svg")).toHaveAttribute("viewBox", "0 0 540 326");

      const { container: c2 } = render(<NegotiationSceneSvg />);
      expect(c2.querySelector("svg")).toHaveAttribute("viewBox", "0 0 540 326");

      const { container: c3 } = render(<VerificationSceneSvg />);
      expect(c3.querySelector("svg")).toHaveAttribute("viewBox", "0 0 540 326");

      const { container: c4 } = render(<SettlementSceneSvg />);
      expect(c4.querySelector("svg")).toHaveAttribute("viewBox", "0 0 540 326");
    });

    it("provides accessible keyboard navigation with tabIndex 0 and role button on interactive nodes", () => {
      const { container } = render(<NegotiationSceneSvg />);
      const interactiveElements = container.querySelectorAll("[role='button']");
      expect(interactiveElements.length).toBeGreaterThanOrEqual(3);
      interactiveElements.forEach((el) => {
        expect(el).toHaveAttribute("tabindex", "0");
      });
    });
  });

  describe("4. Terminology Verification", () => {
    it("accurately presents Mechanism Guardrail mathematical indicators", () => {
      render(<NegotiationSceneSvg />);
      expect(screen.getByText("Mechanism Guardrail:")).toBeInTheDocument();
      expect(screen.getByText(/Ub\(x\) = 0\.84 ≥ τ\(t\) \(Boulware Pass\)/)).toBeInTheDocument();
      expect(screen.getByText(/Anti-Thrashing: Monotonic price verified/)).toBeInTheDocument();
      expect(screen.getByText("✓ Guardrail OK")).toBeInTheDocument();
    });

    it("accurately presents ACWORLD 5-invariant final-state checks", () => {
      render(<VerificationSceneSvg />);
      expect(screen.getByText("ACWORLD INDEPENDENT 5-INVARIANT AUDIT:")).toBeInTheDocument();
      expect(screen.getByText(/SKU Integrity/)).toBeInTheDocument();
      expect(screen.getByText(/Price Arithmetic/)).toBeInTheDocument();
      expect(screen.getByText(/Delivery SLA/)).toBeInTheDocument();
      expect(screen.getByText(/Return Policy/)).toBeInTheDocument();
      expect(screen.getByText(/Merkle Lineage/)).toBeInTheDocument();
      expect(screen.getByText("5/5 Invariants passed")).toBeInTheDocument();
      expect(screen.getByText("Authorized for PayPal settlement")).toBeInTheDocument();
    });

    it("accurately presents PayPal two-stage authorization and audited capture", () => {
      render(<SettlementSceneSvg />);
      expect(screen.getByText("POST /v2/checkout/orders")).toBeInTheDocument();
      expect(screen.getByText("POST /v2/checkout/orders/{id}/authorize")).toBeInTheDocument();
      expect(screen.getByText("POST /v2/payments/authorizations/{id}/capture")).toBeInTheDocument();
      expect(screen.getByText("AUTHORIZE")).toBeInTheDocument();
      expect(screen.getByText("RESERVE")).toBeInTheDocument();
      expect(screen.getByText("CAPTURE")).toBeInTheDocument();
      expect(screen.getByText("VERIPAY_ROOT committed to custom_id")).toBeInTheDocument();
    });
  });

  describe("5. Interaction Copy & Contextual Tooltips", () => {
    it("displays rich technical details on hover and hides cleanly on mouseLeave", () => {
      const { container } = render(<SourcingSceneSvg />);
      const categoryNode = screen.getByRole("button", { name: /Category: 20 Ergonomic Chairs/i });
      expect(categoryNode).toBeInTheDocument();

      // Hover
      fireEvent.mouseEnter(categoryNode);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeInTheDocument();
      expect(screen.getByText("• SKU: CHAIR-ERG-4K")).toBeInTheDocument();
      expect(screen.getByText("• Condition: Brand New OEM")).toBeInTheDocument();

      // Leave
      fireEvent.mouseLeave(categoryNode);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeNull();
    });
  });
});
