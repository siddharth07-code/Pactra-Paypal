import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OverviewScreen } from "@/components/OverviewScreen";
import type { ProcurementSession } from "@/types/pactum";

const createMockSession = (overrides?: Partial<ProcurementSession>): ProcurementSession => ({
  id: "session-1",
  status: "NEGOTIATING",
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
    requiredSpecs: [],
    currency: "USD",
    createdAt: "2026-11-09T10:00:00.000Z",
  },
  quotes: [],
  turns: [],
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OverviewScreen Cinematic Motion & Structural Verification", () => {
  it("renders Stage A heading inside an overflow-hidden clipping mask container", () => {
    render(
      <OverviewScreen
        sessions={[createMockSession()]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    const heading = screen.getByRole("heading", { name: "Procurement overview", level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.parentElement?.className).toContain("overflow-hidden");
    expect(heading.className).toContain("workspace-title");
  });

  it("renders Stage B supporting info and action button with proper hierarchy", () => {
    const onStartNew = vi.fn();
    render(
      <OverviewScreen
        sessions={[createMockSession()]}
        onStartNew={onStartNew}
        onOpenSession={vi.fn()}
      />
    );

    expect(
      screen.getByText("Your mandates, outstanding decisions and settlement progress.")
    ).toBeInTheDocument();

    const newBtn = screen.getByRole("button", { name: "New mandate" });
    expect(newBtn).toBeInTheDocument();
    fireEvent.click(newBtn);
    expect(onStartNew).toHaveBeenCalledOnce();
  });

  it("renders Stage C KPI metrics with data-kpi attributes and accurate numbers (no zero interpolation)", () => {
    const active = createMockSession({ id: "s-active", status: "NEGOTIATING" });
    const review = createMockSession({ id: "s-review", status: "AUDIT_PENDING" });
    const settled = createMockSession({ id: "s-settled", status: "SETTLED" });

    render(
      <OverviewScreen
        sessions={[active, review, settled]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    const activeCard = document.querySelector('[data-kpi="active"]');
    const reviewCard = document.querySelector('[data-kpi="review"]');
    const settledCard = document.querySelector('[data-kpi="settled"]');

    expect(activeCard).toBeInTheDocument();
    expect(reviewCard).toBeInTheDocument();
    expect(settledCard).toBeInTheDocument();

    expect(activeCard?.textContent).toContain("Active mandates");
    expect(activeCard?.textContent).toContain("2"); // active + review
    expect(reviewCard?.textContent).toContain("Needs review");
    expect(reviewCard?.textContent).toContain("1");
    expect(settledCard?.textContent).toContain("Settled procurements");
    expect(settledCard?.textContent).toContain("1");
  });

  it("renders Stage D dashboard sections with overview-section class for scroll reveals", () => {
    const review = createMockSession({ id: "s-review", status: "AUDIT_PENDING" });
    render(
      <OverviewScreen
        sessions={[review]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    const sections = document.querySelectorAll(".overview-section");
    expect(sections.length).toBeGreaterThanOrEqual(2);

    const outstandingSection = document.querySelector('[data-section="outstanding"]');
    const recentSection = document.querySelector('[data-section="recent"]');

    expect(outstandingSection).toBeInTheDocument();
    expect(recentSection).toBeInTheDocument();
  });

  it("handles reduced motion preferences gracefully without throwing", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <OverviewScreen
        sessions={[createMockSession()]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Procurement overview", level: 1 })).toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });

  it("updates data smoothly when sessions prop changes after mount", () => {
    const initialSession = createMockSession({ id: "s-1", status: "NEGOTIATING" });
    const { rerender } = render(
      <OverviewScreen
        sessions={[initialSession]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    expect(screen.getByText("Active mandates")).toBeInTheDocument();

    const updatedSession = createMockSession({ id: "s-2", status: "SETTLED" });
    rerender(
      <OverviewScreen
        sessions={[initialSession, updatedSession]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    const settledCard = document.querySelector('[data-kpi="settled"]');
    expect(settledCard?.textContent).toContain("1");
  });
});
