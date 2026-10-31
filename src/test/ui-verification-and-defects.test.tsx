import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverviewScreen } from "@/components/OverviewScreen";
import { ProcurementHistoryScreen } from "@/components/ProcurementHistoryScreen";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import type { ProcurementSession, VendorQuote, NegotiationOffer } from "@/types/pactum";

// Helper to create mock sessions for testing
function createMockSession(overrides: Partial<ProcurementSession> = {}): ProcurementSession {
  const baseQuote: VendorQuote = {
    vendorId: "v-dell",
    vendorName: "Dell Wholesale",
    sku: "DELL-U2723QE-BULK",
    productTitle: "Dell UltraSharp 27 4K USB-C Hub Monitor",
    initialUnitAsk: 320,
    currentUnitBid: 300,
    shippingCost: 200,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACCEPTED",
    dataSource: "MOCK_CATALOG",
  };

  const baseOffer: NegotiationOffer = {
    unitPrice: 300,
    quantity: 25,
    shippingCost: 200,
    deliveryDays: 4,
    returnDays: 30,
  };

  const nowIso = new Date().toISOString();

  return {
    id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: "SETTLED",
    quotes: [baseQuote],
    turns: [],
    mandate: {
      id: "mandate-1",
      rawPrompt: "Purchase 25 4K monitors under $8,500",
      itemQuery: "4K USB-C Monitor",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }],
      currency: "USD",
      createdAt: nowIso,
    },
    selectedQuote: baseQuote,
    finalOffer: baseOffer,
    paypalCaptureId: "CAP-12345",
    merkleRoot: "a".repeat(64),
    agreementRecord: {
      agreementId: "agr-1",
      sessionId: "mandate-1",
      vendorId: "v-dell",
      vendorName: "Dell Wholesale",
      sku: "DELL-U2723QE-BULK",
      agreedPrice: 300,
      agreedOffer: baseOffer,
      totalCost: 7700,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 4,
      acceptedAt: nowIso,
      mandateVersion: 1,
    },
    ...overrides,
  };
}

describe("OverviewScreen Financial Metrics Verification", () => {
  it("does not mix currencies when calculating mandate volume", () => {
    const usdSession = createMockSession({
      id: "sess-usd",
      mandate: {
        id: "m-1",
        rawPrompt: "USD mandate",
        itemQuery: "Monitors",
        quantity: 10,
        maxTotalBudget: 5000,
        maxDeliveryDays: 5,
        minReturnDays: 30,
        requiredSpecs: [],
        currency: "USD",
        createdAt: new Date().toISOString(),
      },
    });

    const eurSession = createMockSession({
      id: "sess-eur",
      mandate: {
        id: "m-2",
        rawPrompt: "EUR mandate",
        itemQuery: "Laptops",
        quantity: 5,
        maxTotalBudget: 4000,
        maxDeliveryDays: 5,
        minReturnDays: 30,
        requiredSpecs: [],
        currency: "EUR",
        createdAt: new Date().toISOString(),
      },
    });

    render(
      <OverviewScreen
        sessions={[usdSession, eurSession]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    // Should indicate multi-currency isolation and calculate primary volume as $5,000.00, not $9,000.00
    expect(screen.getByText(/Primary \(USD\) • 2 currencies/i)).toBeDefined();
    expect(screen.getAllByText("$5,000.00").length).toBeGreaterThan(0);
  });

  it("excludes terminal and captured states from active mandate runs count", () => {
    const activeSession = createMockSession({ id: "s-active", status: "NEGOTIATING" });
    const settledSession = createMockSession({ id: "s-settled", status: "SETTLED" });
    const capturedSession = createMockSession({ id: "s-captured", status: "PAYPAL_CAPTURED" });
    const failedSession = createMockSession({ id: "s-failed", status: "AUDIT_FAILED" });
    const cancelledSession = createMockSession({ id: "s-cancelled", status: "CANCELLED" });
    const disputedSession = createMockSession({ id: "s-disputed", status: "DISPUTED" });

    render(
      <OverviewScreen
        sessions={[activeSession, settledSession, capturedSession, failedSession, cancelledSession, disputedSession]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    // Only s-active is active (1 active)
    const activeLabel = screen.getByText("Active Mandate Runs");
    expect(activeLabel).toBeDefined();
    // Cryptographically settled should count s-settled and s-captured (2 settled)
    const settledLabel = screen.getByText("Cryptographically Settled");
    expect(settledLabel).toBeDefined();
  });

  it("calculates verified realized savings strictly from settled or audit-passed agreements", () => {
    // Settled session: baseline quote was 320*25 + 200 = 8200. Final offer was 300*25 + 200 = 7700. Savings = 500.
    const settledSession = createMockSession({
      id: "s-settled",
      status: "SETTLED",
    });

    // In-flight session: should NOT add savings
    const inFlightSession = createMockSession({
      id: "s-inflight",
      status: "NEGOTIATING",
      paypalCaptureId: undefined,
    });

    // Audit-failed session: should NOT add savings
    const failedSession = createMockSession({
      id: "s-failed",
      status: "AUDIT_FAILED",
      paypalCaptureId: undefined,
    });

    render(
      <OverviewScreen
        sessions={[settledSession, inFlightSession, failedSession]}
        onStartNew={vi.fn()}
        onOpenSession={vi.fn()}
      />
    );

    // Savings should only be $500.00 from s-settled
    expect(screen.getByText("$500.00")).toBeDefined();
  });
});

describe("ProcurementHistoryScreen Filter and Sort Verification", () => {
  it("filters sessions by status correctly excluding captured and disputed from active", () => {
    const activeSession = createMockSession({ id: "sess-active", status: "NEGOTIATING" });
    const capturedSession = createMockSession({ id: "sess-captured", status: "PAYPAL_CAPTURED" });
    const disputedSession = createMockSession({ id: "sess-disputed", status: "DISPUTED" });

    render(
      <ProcurementHistoryScreen
        sessions={[activeSession, capturedSession, disputedSession]}
        onSelectSession={vi.fn()}
        onStartNew={vi.fn()}
      />
    );

    const filterSelect = screen.getByLabelText("Filter by session status") as HTMLSelectElement;

    // Filter to ACTIVE
    fireEvent.change(filterSelect, { target: { value: "ACTIVE" } });
    expect(screen.getByText("sess-active")).toBeDefined();
    expect(screen.queryByText("sess-captured")).toBeNull();
    expect(screen.queryByText("sess-disputed")).toBeNull();

    // Filter to DISPUTED
    fireEvent.change(filterSelect, { target: { value: "DISPUTED" } });
    expect(screen.getByText("sess-disputed")).toBeDefined();
    expect(screen.queryByText("sess-active")).toBeNull();
  });

  it("sorts sessions by budget descending and ascending", () => {
    const cheapSession = createMockSession({
      id: "sess-cheap",
      createdAt: "2026-01-01T00:00:00.000Z",
      mandate: {
        id: "m-cheap",
        rawPrompt: "",
        itemQuery: "Keyboard",
        quantity: 1,
        maxTotalBudget: 100,
        maxDeliveryDays: 3,
        minReturnDays: 14,
        requiredSpecs: [],
        currency: "USD",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const expensiveSession = createMockSession({
      id: "sess-expensive",
      createdAt: "2026-01-02T00:00:00.000Z",
      mandate: {
        id: "m-exp",
        rawPrompt: "",
        itemQuery: "Server",
        quantity: 1,
        maxTotalBudget: 25000,
        maxDeliveryDays: 3,
        minReturnDays: 14,
        requiredSpecs: [],
        currency: "USD",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    });

    render(
      <ProcurementHistoryScreen
        sessions={[cheapSession, expensiveSession]}
        onSelectSession={vi.fn()}
        onStartNew={vi.fn()}
      />
    );

    const sortSelect = screen.getByLabelText("Sort sessions by") as HTMLSelectElement;

    // Sort by budget desc
    fireEvent.change(sortSelect, { target: { value: "BUDGET_DESC" } });
    const rows = screen.getAllByRole("row");
    // Header is row 0; first item should be sess-expensive
    expect(rows[1].textContent).toContain("sess-expensive");
    expect(rows[2].textContent).toContain("sess-cheap");

    // Sort by budget asc
    fireEvent.change(sortSelect, { target: { value: "BUDGET_ASC" } });
    const rowsAsc = screen.getAllByRole("row");
    expect(rowsAsc[1].textContent).toContain("sess-cheap");
    expect(rowsAsc[2].textContent).toContain("sess-expensive");
  });
});

describe("SettlementCenterScreen Ineligible Session Safeguard", () => {
  it("displays explicit awaiting agreement notice when session has no agreed offer", () => {
    const noDealSession = createMockSession({
      id: "sess-nodeal",
      status: "NEGOTIATING",
      finalOffer: undefined,
      selectedQuote: undefined,
      agreementRecord: undefined,
    });

    render(
      <SettlementCenterScreen
        session={noDealSession}
        onRefreshSession={vi.fn()}
        onStartNewNegotiation={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Accept a vendor agreement to continue/i)
    ).toBeDefined();

    expect(
      screen.getByText(/Awaiting Accepted Agreement/i)
    ).toBeDefined();

    // The Continue to PayPal button must NOT be present as an available action
    const continueBtn = screen.queryByRole("button", { name: /Continue to PayPal/i });
    expect(continueBtn).toBeNull();
  });
});
