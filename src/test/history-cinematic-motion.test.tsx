import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import gsap from "gsap";
import { ProcurementHistoryScreen } from "@/components/ProcurementHistoryScreen";
import type { ProcurementSession } from "@/types/pactum";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.matchMedia = originalMatchMedia;
});

const mockSessions: ProcurementSession[] = [
  {
    id: "session-hist-001",
    status: "SETTLED",
    createdAt: "2026-11-09T10:00:00.000Z",
    updatedAt: "2026-11-09T10:30:00.000Z",
    mandate: {
      id: "mandate-1",
      rawPrompt: "Purchase 25 4K USB-C monitors under $8,500",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }],
      currency: "USD",
      createdAt: "2026-11-09T10:00:00.000Z",
    },
    quotes: [],
    turns: [],
    selectedQuote: {
      vendorId: "vendor_apex",
      vendorName: "Apex Displays",
      sku: "APEX-4K-USB-C",
      productTitle: "Apex 27-inch 4K USB-C Monitor",
      initialUnitAsk: 340,
      currentUnitBid: 320,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 35,
      condition: "NEW",
      status: "ACTIVE",
      dataSource: "CHANNEL3",
    },
    auditCertificate: {
      certificateId: "cert-001",
      sessionId: "session-hist-001",
      passed: true,
      status: "VALID",
      verifiedRoot: "a".repeat(64),
      timestamp: "2026-11-09T10:20:00.000Z",
      invariants: [
        { name: "SKU_INTEGRITY", passed: true, status: "VALID" },
        { name: "PRICE_CEILING", passed: true, status: "VALID" },
        { name: "RETURN_POLICY", passed: true, status: "VALID" },
        { name: "DELIVERY_SLA", passed: true, status: "VALID" },
        { name: "CRYPTOGRAPHIC_LINEAGE", passed: true, status: "VALID" },
      ],
    },
    paypalOrderId: "PAYPAL-ORD-001",
    paypalCaptureId: "PAYPAL-CAP-001",
  } as unknown as ProcurementSession,
  {
    id: "session-hist-002",
    status: "AUDIT_FAILED",
    createdAt: "2026-11-08T08:00:00.000Z",
    updatedAt: "2026-11-08T08:30:00.000Z",
    mandate: {
      id: "mandate-2",
      rawPrompt: "Purchase 10 Ergonomic Chairs under $3,000",
      itemQuery: "Ergonomic Chairs",
      quantity: 10,
      maxTotalBudget: 3000,
      maxDeliveryDays: 7,
      minReturnDays: 14,
      requiredSpecs: [],
      currency: "USD",
      createdAt: "2026-11-08T08:00:00.000Z",
    },
    quotes: [],
    turns: [],
    auditCertificate: {
      certificateId: "cert-002",
      sessionId: "session-hist-002",
      passed: false,
      status: "FAILED",
      verifiedRoot: "b".repeat(64),
      timestamp: "2026-11-08T08:20:00.000Z",
      invariants: [{ name: "SKU_INTEGRITY", passed: false, status: "FAILED" }],
    },
  } as unknown as ProcurementSession,
];

describe("ProcurementHistoryScreen — Cinematic Motion & Interaction Tests", () => {
  describe("1. Coordinated Entrance Choreography", () => {
    it("coordinates heading mask, filter controls, and table container entrance via GSAP timeline", () => {
      const gsapTimelineSpy = vi.spyOn(gsap, "timeline");

      render(
        <ProcurementHistoryScreen
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );

      // Verify GSAP timeline was initiated for the entrance sequence
      expect(gsapTimelineSpy).toHaveBeenCalled();
    });

    it("renders heading inside an overflow-hidden clipping mask for masked reveal", () => {
      render(
        <ProcurementHistoryScreen
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );

      const heading = screen.getByRole("heading", { name: "Procurement History", level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.parentElement?.className).toContain("overflow-hidden");
    });

    it("respects prefers-reduced-motion and bypasses entrance animations", () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion: reduce"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");

      render(
        <ProcurementHistoryScreen
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );

      // Under reduced motion, standalone fromTo calls must not run
      expect(gsapFromToSpy).not.toHaveBeenCalled();
    });
  });

  describe("2. Filtering & Sorting Transitions", () => {
    it("triggers smooth transition animation when status filter changes", () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");

      render(
        <ProcurementHistoryScreen
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );

      gsapFromToSpy.mockClear();

      const filterSelect = screen.getByLabelText("Filter by session status");
      fireEvent.change(filterSelect, { target: { value: "SETTLED" } });

      // Verifies row animation was triggered on filtered change
      expect(gsapFromToSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ opacity: 0, y: 4 }),
        expect.objectContaining({ opacity: 1, y: 0, clearProps: "transform,opacity" })
      );
    });

    it("animates empty state container when filter matches zero sessions", () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");

      render(
        <ProcurementHistoryScreen
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );

      gsapFromToSpy.mockClear();

      const searchInput = screen.getByLabelText("Search procurement sessions");
      fireEvent.change(searchInput, { target: { value: "NonexistentItemSearchKeywordXYZ" } });

      expect(screen.getByText("No Historical Sessions Found")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ opacity: 0, y: 6 }),
        expect.objectContaining({ opacity: 1, y: 0, clearProps: "transform,opacity" })
      );
    });
  });

  describe("3. Expandable Transaction Details & Inspection Modal", () => {
    it("animates modal backdrop, dialog container, and sections on inspection open", () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");

      render(
        <ProcurementHistoryScreen
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );

      gsapFromToSpy.mockClear();

      const inspectBtns = screen.getAllByLabelText("Inspect session session-hist-001 details");
      fireEvent.click(inspectBtns[0]);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Session Audit Inspection")).toBeInTheDocument();

      // Modal container scale/fade animation was called
      expect(gsapFromToSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ opacity: 0, scale: 0.97, y: 8 }),
        expect.objectContaining({ opacity: 1, scale: 1, y: 0, clearProps: "transform,opacity" })
      );
    });

    it("closes inspection modal smoothly via keyboard Escape key", async () => {
      render(
        <ProcurementHistoryScreen
          sessions={mockSessions}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );

      const inspectBtns = screen.getAllByLabelText("Inspect session session-hist-001 details");
      fireEvent.click(inspectBtns[0]);

      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });
});
