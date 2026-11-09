import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NegotiationArenaScreen, type StreamEventItem } from "@/components/NegotiationArenaScreen";
import type { ProcurementMandate, VendorQuote } from "@/types/pactum";

const mockMandate: ProcurementMandate = {
  id: "mandate-arena-1",
  rawPrompt: "Purchase 25 4K monitors under $8,500 total budget",
  itemQuery: "Dell UltraSharp 27 4K USB-C Hub Monitor (U2723QE)",
  quantity: 25,
  maxTotalBudget: 8500,
  maxDeliveryDays: 5,
  minReturnDays: 30,
  requiredSpecs: [],
  currency: "USD",
  createdAt: "2026-11-09T10:00:00.000Z",
};

const mockQuotes: VendorQuote[] = [
  {
    vendorId: "vendor-monitors-direct",
    vendorName: "Monitors Direct Wholesale",
    sku: "SKU-MON-4K-01",
    productTitle: "Dell UltraSharp 27 4K USB-C Hub Monitor",
    initialUnitAsk: 330,
    currentUnitBid: 310,
    shippingCost: 150,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "CHANNEL3",
    currency: "USD",
  },
  {
    vendorId: "vendor-tech-distributors",
    vendorName: "Tech Distributors Global",
    sku: "SKU-MON-4K-02",
    productTitle: "Dell UltraSharp 27 4K USB-C Hub Monitor",
    initialUnitAsk: 350,
    currentUnitBid: 320,
    shippingCost: 200,
    deliveryDays: 5,
    returnDays: 30,
    condition: "NEW",
    status: "ACTIVE",
    dataSource: "MOCK_CATALOG",
    currency: "USD",
  },
];

const mockEvents: StreamEventItem[] = [
  {
    id: "evt-round-1",
    type: "ROUND_STARTED",
    timestamp: "2026-11-09T10:05:00.000Z",
    payload: { round: 1, maxRounds: 4 },
  },
  {
    id: "evt-buyer-1",
    type: "BUYER_PROPOSAL",
    timestamp: "2026-11-09T10:05:02.000Z",
    payload: {
      round: 1,
      vendorId: "vendor-monitors-direct",
      proposedOffer: { unitPrice: 300, deliveryDays: 4, returnDays: 30 },
      utilityScore: 0.88,
      threshold: 0.75,
      generator: "GEMINI_LIVE",
    },
  },
  {
    id: "evt-policy-blocked",
    type: "GUARDRAIL_BLOCKED",
    timestamp: "2026-11-09T10:05:05.000Z",
    payload: {
      round: 1,
      vendorId: "vendor-tech-distributors",
      reason: "Proposed price violates anti-thrashing monotonicity",
    },
  },
  {
    id: "evt-vendor-1",
    type: "VENDOR_COUNTEROFFER",
    timestamp: "2026-11-09T10:05:10.000Z",
    payload: {
      round: 1,
      vendorId: "vendor-monitors-direct",
      newUnitAsk: 315,
      turn: { message: "We can do $315 per unit with expedited 4-day delivery." },
    },
  },
  {
    id: "evt-acceptance",
    type: "BUYER_ACCEPTANCE",
    timestamp: "2026-11-09T10:05:15.000Z",
    payload: {
      round: 1,
      vendorId: "vendor-monitors-direct",
      unitPrice: 315,
      message: "Terms accepted within mandate ceiling.",
    },
  },
  {
    id: "evt-completed",
    type: "NEGOTIATION_COMPLETED",
    timestamp: "2026-11-09T10:05:20.000Z",
    payload: {
      outcome: "AGREEMENT_REACHED",
      selectedVendor: "Monitors Direct Wholesale",
      winningVendorId: "vendor-monitors-direct",
      totalCost: 8025,
      finalOffer: {
        unitPrice: 315,
        shippingCost: 150,
        deliveryDays: 4,
        returnDays: 30,
      },
    },
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NegotiationArenaScreen Cinematic Motion Verification", () => {
  it("renders Stage A heading inside an overflow-hidden clipping mask container", () => {
    render(
      <NegotiationArenaScreen
        mandate={mockMandate}
        quotes={mockQuotes}
        events={[]}
        isStreaming={false}
      />
    );

    const heading = screen.getByRole("heading", { name: "Negotiation Arena", level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.parentElement?.className).toContain("overflow-hidden");
    expect(heading.className).toContain("workspace-title");
  });

  it("renders Stage B subtitle and status badge with proper hierarchy", () => {
    render(
      <NegotiationArenaScreen
        mandate={mockMandate}
        quotes={mockQuotes}
        events={[]}
        isStreaming={false}
      />
    );

    expect(
      screen.getByText("Compare supplier terms and review the recorded negotiation.")
    ).toBeInTheDocument();

    const statusBadge = screen.getByRole("status");
    expect(statusBadge).toHaveTextContent("Not started");
  });

  it("renders Stage C procurement mandate summary", () => {
    render(
      <NegotiationArenaScreen
        mandate={mockMandate}
        quotes={mockQuotes}
        events={[]}
        isStreaming={false}
      />
    );

    expect(screen.getByText("Procurement request")).toBeInTheDocument();
    expect(screen.getByText("25 units")).toBeInTheDocument();
    expect(screen.getByText(/8,500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Delivery ≤ 5 days/)).toBeInTheDocument();
  });

  it("renders live streaming events with arena-event-item classes and policy feedback styling", () => {
    render(
      <NegotiationArenaScreen
        mandate={mockMandate}
        quotes={mockQuotes}
        events={mockEvents}
        isStreaming={false}
      />
    );

    const eventItems = document.querySelectorAll(".arena-event-item");
    expect(eventItems.length).toBeGreaterThanOrEqual(4);

    // Guardrail blocked policy item has red border styling
    const blockedItem = Array.from(eventItems).find((el) =>
      el.textContent?.includes("Policy blocked proposal")
    );
    expect(blockedItem).toBeDefined();
    expect(blockedItem?.className).toContain("border-l-red-500");

    // Acceptance item has mint border styling
    const acceptedItem = Array.from(eventItems).find((el) =>
      el.textContent?.includes("Buyer Accepted Counteroffer")
    );
    expect(acceptedItem).toBeDefined();
    expect(acceptedItem?.className).toContain("border-l-mint-primary");
  });

  it("renders Stage 5 agreement formation banner when consensus is reached", () => {
    const onProceed = vi.fn();
    render(
      <NegotiationArenaScreen
        mandate={mockMandate}
        quotes={mockQuotes}
        events={mockEvents}
        isStreaming={false}
        onProceedToSettlement={onProceed}
      />
    );

    const agreementSection = screen.getByRole("region", { name: "Final agreement" });
    expect(agreementSection).toBeInTheDocument();
    expect(agreementSection.className).toContain("border-l-ember-orange");
    expect(screen.getByText(/Consensus Reached with Monitors Direct Wholesale/i)).toBeInTheDocument();
    expect(within(agreementSection).getByText(/8,025\.00/)).toBeInTheDocument();

    const proceedBtn = screen.getByRole("button", { name: "Review audit and settlement" });
    expect(proceedBtn).toBeInTheDocument();
    fireEvent.click(proceedBtn);
    expect(onProceed).toHaveBeenCalledOnce();
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
      <NegotiationArenaScreen
        mandate={mockMandate}
        quotes={mockQuotes}
        events={mockEvents}
        isStreaming={false}
      />
    );

    expect(screen.getByRole("heading", { name: "Negotiation Arena", level: 1 })).toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });
});
