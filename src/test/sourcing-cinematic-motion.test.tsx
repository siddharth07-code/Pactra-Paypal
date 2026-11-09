import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SourcingScreen } from "@/components/SourcingScreen";
import type { ProcurementSession, VendorQuote } from "@/types/pactum";

// Mock organization boundary to allow procurement permissions
vi.mock("@/components/OrganizationBoundary", () => ({
  useOrganization: () => ({
    id: "org-1",
    name: "Enterprise Procurement",
    role: "PROCUREMENT_LEAD",
    permissions: ["session.read", "session.write", "negotiation.start"],
  }),
}));

const mockQuotes: VendorQuote[] = [
  {
    vendorId: "vendor-monitors-direct",
    vendorName: "Monitors Direct Wholesale",
    sku: "SKU-MON-4K-01",
    productTitle: "Dell UltraSharp 27 4K USB-C Hub Monitor (U2723QE)",
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

const mockSession: ProcurementSession = {
  id: "session-sourcing-1",
  status: "SOURCING",
  createdAt: "2026-11-09T10:00:00.000Z",
  updatedAt: "2026-11-09T10:15:00.000Z",
  mandate: {
    id: "mandate-1",
    rawPrompt: "Purchase 25 4K monitors under $8,500 with 5-day delivery",
    itemQuery: "4K USB-C Monitor",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: "2026-11-09T10:00:00.000Z",
  },
  quotes: mockQuotes,
  quoteEvaluations: {},
  turns: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SourcingScreen Cinematic Interactions & Structural Verification", () => {
  it("renders Stage A heading inside an overflow-hidden clipping mask container", () => {
    render(<SourcingScreen onStartNegotiation={vi.fn()} />);

    const heading = screen.getByRole("heading", { name: "Source a procurement request", level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.parentElement?.className).toContain("overflow-hidden");
    expect(heading.className).toContain("workspace-title");
  });

  it("renders Stage B supporting text with proper typography", () => {
    render(<SourcingScreen onStartNegotiation={vi.fn()} />);

    expect(
      screen.getByText("Define your requirements, compare available offers and begin negotiation.")
    ).toBeInTheDocument();
  });

  it("renders Stage C requirements form and request review sidebar", () => {
    render(<SourcingScreen onStartNegotiation={vi.fn()} />);

    expect(screen.getByRole("form", { name: "Procurement requirements" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Request review" })).toBeInTheDocument();
  });

  it("renders supplier quotes with supplier-row class and allows selection expansion", () => {
    render(<SourcingScreen onStartNegotiation={vi.fn()} session={mockSession} />);

    expect(screen.getByText("Monitors Direct Wholesale")).toBeInTheDocument();
    expect(screen.getByText("Tech Distributors Global")).toBeInTheDocument();

    const supplierRows = document.querySelectorAll("tr.supplier-row");
    expect(supplierRows.length).toBe(2);

    // Click first supplier to expand details drawer
    fireEvent.click(supplierRows[0]);

    // Detail drawer becomes visible
    expect(screen.getByText(/Supplier offer details · Monitors Direct Wholesale/i)).toBeInTheDocument();
    expect(screen.getByText(/SKU: SKU-MON-4K-01/i)).toBeInTheDocument();
    expect(screen.getByText(/Landed Cost Formula/i)).toBeInTheDocument();
    expect(screen.getByText(/Delivery & Returns SLA/i)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(supplierRows[0]);
    expect(screen.queryByText(/Supplier offer details · Monitors Direct Wholesale/i)).not.toBeInTheDocument();
  });

  it("handles reduced-motion preference without throwing", () => {
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

    render(<SourcingScreen onStartNegotiation={vi.fn()} session={mockSession} />);
    expect(screen.getByRole("heading", { name: "Source a procurement request", level: 1 })).toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });

  it("triggers onStartNegotiation when clicking Start negotiation", async () => {
    const onStartNegotiation = vi.fn();
    render(<SourcingScreen onStartNegotiation={onStartNegotiation} session={mockSession} />);

    const startBtn = screen.getByRole("button", { name: "Start negotiation" });
    expect(startBtn).toBeInTheDocument();
    expect(startBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(startBtn);
    });
    expect(onStartNegotiation).toHaveBeenCalledOnce();
  });
});
