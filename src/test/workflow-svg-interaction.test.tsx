import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourcingSceneSvg } from "@/components/landing/workflow/SourcingSceneSvg";
import { NegotiationSceneSvg } from "@/components/landing/workflow/NegotiationSceneSvg";
import { VerificationSceneSvg } from "@/components/landing/workflow/VerificationSceneSvg";
import { SettlementSceneSvg } from "@/components/landing/workflow/SettlementSceneSvg";
import { WelcomeHeroScreen } from "@/components/landing/WelcomeHeroScreen";

describe("Interactive SVG Workflow Redesign", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  describe("Scene 1: SourcingSceneSvg", () => {
    it("renders with responsive viewBox and semantic ARIA labeling", () => {
      const { container } = render(<SourcingSceneSvg />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("viewBox", "0 0 540 326");
      expect(svg).toHaveAttribute("aria-label", expect.stringContaining("Procurement mandate"));
    });

    it("displays the central Mandate Hub and four satellite constraint nodes", () => {
      render(<SourcingSceneSvg />);
      expect(screen.getByText("PROCUREMENT MANDATE")).toBeInTheDocument();
      expect(screen.getByText("4 Active Constraints")).toBeInTheDocument();
      expect(screen.getByText("20 Ergonomic Chairs")).toBeInTheDocument();
      expect(screen.getByText("Strict Gate")).toBeInTheDocument();
      expect(screen.getByText("USD 4,000 Max")).toBeInTheDocument();
      expect(screen.getByText("≤ 10 Days SLA")).toBeInTheDocument();
    });

    it("shows interactive tooltip on node hover and dismisses on leave", () => {
      const { container } = render(<SourcingSceneSvg />);
      const budgetNode = screen.getByRole("button", { name: /Budget: USD 4,000 Max/i });
      expect(budgetNode).toBeInTheDocument();

      // Tooltip is not initially visible
      expect(container.querySelector(".workflow-svg-tooltip")).toBeNull();

      // Mouse enter triggers tooltip
      fireEvent.mouseEnter(budgetNode);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeInTheDocument();
      expect(screen.getByText("Private maximum reservation budget (B_max)")).toBeInTheDocument();

      // Mouse leave removes tooltip
      fireEvent.mouseLeave(budgetNode);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeNull();
    });

    it("supports keyboard focus and activation for accessibility", () => {
      const { container } = render(<SourcingSceneSvg />);
      const approvalNode = screen.getByRole("button", { name: /Approval: Strict Gate/i });
      expect(approvalNode).toHaveAttribute("tabindex", "0");

      fireEvent.keyDown(approvalNode, { key: "Enter" });
      expect(container.querySelector(".workflow-svg-tooltip")).toBeInTheDocument();
      expect(screen.getByText("Deterministic server approval rules")).toBeInTheDocument();

      fireEvent.keyDown(approvalNode, { key: " " });
      expect(container.querySelector(".workflow-svg-tooltip")).toBeNull();
    });
  });

  describe("Scene 2: NegotiationSceneSvg", () => {
    it("renders multi-supplier comparison network and mechanism guardrail", () => {
      const { container } = render(<NegotiationSceneSvg />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("viewBox", "0 0 540 326");

      expect(screen.getByText("Sample supplier A")).toBeInTheDocument();
      expect(screen.getByText("Sample supplier B")).toBeInTheDocument();
      expect(screen.getByText("USD 3,600 · 14 days")).toBeInTheDocument();
      expect(screen.getByText("SLA Breach")).toBeInTheDocument();
      expect(screen.getByText("BUYER AGENT")).toBeInTheDocument();
      expect(screen.getByText("Guardrail OK")).toBeInTheDocument();
      expect(screen.getByText("NEGOTIATED DRAFT")).toBeInTheDocument();
      expect(screen.getByText("USD 3,700 · 8d")).toBeInTheDocument();
    });

    it("interactively inspects supplier B breach via tooltip", () => {
      const { container } = render(<NegotiationSceneSvg />);
      const supplierB = screen.getByRole("button", { name: /Sample supplier B: USD 3,600 · 14 days/i });
      expect(supplierB).toBeInTheDocument();

      fireEvent.mouseEnter(supplierB);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeInTheDocument();
      expect(screen.getByText("Delivery exceeds maximum 10-day constraint")).toBeInTheDocument();

      fireEvent.mouseLeave(supplierB);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeNull();
    });
  });

  describe("Scene 3: VerificationSceneSvg", () => {
    it("renders the SHA-256 Merkle tree commitment and ACWORLD audit matrix", () => {
      render(<VerificationSceneSvg />);

      // Merkle leaf hashes
      expect(screen.getByText("h0: 0x4a8b...")).toBeInTheDocument();
      expect(screen.getByText("h1: 0x9e12...")).toBeInTheDocument();
      expect(screen.getByText("h2: 0x73c0...")).toBeInTheDocument();
      expect(screen.getByText(/0x7f4a\.\.\.d91c/)).toBeInTheDocument();

      // ACWORLD 5 invariants
      expect(screen.getByText(/SKU Integrity/)).toBeInTheDocument();
      expect(screen.getByText(/Price Arithmetic/)).toBeInTheDocument();
      expect(screen.getByText(/Delivery SLA/)).toBeInTheDocument();
      expect(screen.getByText(/Return Policy/)).toBeInTheDocument();
      expect(screen.getByText(/Merkle Lineage/)).toBeInTheDocument();
      expect(screen.getByText("5/5 Invariants passed")).toBeInTheDocument();
    });

    it("shows interactive details on Merkle root inspection", () => {
      const { container } = render(<VerificationSceneSvg />);
      const rootCard = screen.getByRole("button", { name: /Combined Merkle root digest commitment/i });
      expect(rootCard).toBeInTheDocument();

      fireEvent.mouseEnter(rootCard);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeInTheDocument();
      expect(screen.getByText("Cryptographic Evidence Root")).toBeInTheDocument();

      fireEvent.mouseLeave(rootCard);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeNull();
    });
  });

  describe("Scene 4: SettlementSceneSvg", () => {
    it("renders PayPal Orders v2 two-stage lifecycle and outcome gate", () => {
      render(<SettlementSceneSvg />);

      expect(screen.getByText("POST /v2/checkout/orders")).toBeInTheDocument();
      expect(screen.getByText("POST /v2/checkout/orders/{id}/authorize")).toBeInTheDocument();
      expect(screen.getByText("POST /v2/payments/authorizations/{id}/capture")).toBeInTheDocument();
      expect(screen.getByText("Buyer approval / Pending in this example")).toBeInTheDocument();
      expect(screen.getByText("Settlement / Verified Gate")).toBeInTheDocument();
    });

    it("displays tooltip on step card hover", () => {
      const { container } = render(<SettlementSceneSvg />);
      const step1 = screen.getByRole("button", { name: /Order authorization: Lifecycle: Not started/i });
      expect(step1).toBeInTheDocument();

      fireEvent.mouseEnter(step1);
      const tooltip = container.querySelector(".workflow-svg-tooltip");
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent("Order authorization");
      expect(tooltip).toHaveTextContent("POST /v2/checkout/orders");

      fireEvent.mouseLeave(step1);
      expect(container.querySelector(".workflow-svg-tooltip")).toBeNull();
    });
  });

  describe("Integration in WelcomeHeroScreen", () => {
    it("mounts all four interactive SVG scenes inside their respective cinema-panels", () => {
      const { container } = render(<WelcomeHeroScreen />);

      // Verify presence of all 4 SVG components in the cinema panels
      expect(container.querySelector(".sourcing-scene-svg-wrapper")).toBeInTheDocument();
      expect(container.querySelector(".negotiation-scene-svg-wrapper")).toBeInTheDocument();
      expect(container.querySelector(".verification-scene-svg-wrapper")).toBeInTheDocument();
      expect(container.querySelector(".settlement-scene-svg-wrapper")).toBeInTheDocument();

      // Verify presence of cinema animation hooks on SVG elements
      expect(container.querySelector(".cinema-preview")).toBeInTheDocument();
      expect(container.querySelector(".cinema-offer")).toBeInTheDocument();
      expect(container.querySelector(".cinema-terms")).toBeInTheDocument();
      expect(container.querySelector(".cinema-agreement")).toBeInTheDocument();
      expect(container.querySelector(".cinema-audit-check")).toBeInTheDocument();
      expect(container.querySelector(".cinema-payment-step")).toBeInTheDocument();
    });
  });
});
