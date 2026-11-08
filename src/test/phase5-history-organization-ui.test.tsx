import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProcurementHistoryScreen } from "@/components/ProcurementHistoryScreen";
import type { ProcurementSession } from "@/types/pactum";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mockSessions: ProcurementSession[] = [
  {
    id: "sess-org1-001",
    status: "SETTLED",
    mandate: {
      id: "mandate-1",
      rawPrompt: "Procure 25 4K monitors",
      itemQuery: "4K USB-C Monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [
        { name: "Resolution", value: "4K", mandatory: true },
        { name: "Port", value: "USB-C", mandatory: true },
      ],
      currency: "USD",
      createdAt: "2026-11-08T00:00:00Z",
    },
    quotes: [],
    turns: [],
    selectedQuote: {
      vendorId: "v-apex",
      vendorName: "Apex Wholesale IT",
      sku: "DELL-U2723QE-BULK",
      productTitle: "Dell UltraSharp 27 4K",
      initialUnitAsk: 340,
      currentUnitBid: 320,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW_RETAIL",
      status: "ACCEPTED",
      dataSource: "CHANNEL3",
    },
    agreementRecord: {
      vendorId: "v-apex",
      vendorName: "Apex Wholesale IT",
      unitPrice: 320,
      quantity: 25,
      totalCost: 8150,
      shippingCost: 150,
      deliveryDays: 4,
      returnDays: 30,
      acceptedAt: "2026-11-08T00:05:00Z",
      finalRound: 2,
    },
    auditCertificate: {
      certificateId: "cert-001",
      timestamp: "2026-11-08T00:06:00Z",
      passed: true,
      merkleRoot: "57984f1ab94c207e8a9316d8a7c295719942a6c8b32e1858a2f4ceba6784310d",
      invariants: [
        { name: "1. SKU Integrity", passed: true, details: "Matches" },
        { name: "2. Price Ceiling", passed: true, details: "Under budget" },
        { name: "3. Return Policy", passed: true, details: ">= 30 days" },
        { name: "4. Delivery SLA", passed: true, details: "<= 5 days" },
        { name: "5. Merkle Root", passed: true, details: "Verified" },
      ],
    },
    paypalOrderId: "PAYPAL-ORD-12345",
    paypalCaptureId: "PAYPAL-CAP-67890",
    createdAt: "2026-11-08T00:00:00Z",
  } as unknown as ProcurementSession,
  {
    id: "sess-org1-002",
    status: "AUDIT_FAILED",
    mandate: {
      id: "mandate-2",
      rawPrompt: "Procure 10 Ergonomic Chairs",
      itemQuery: "Ergonomic Chairs",
      quantity: 10,
      maxTotalBudget: 3000,
      maxDeliveryDays: 7,
      minReturnDays: 14,
      requiredSpecs: [],
      currency: "USD",
      createdAt: "2026-11-07T00:00:00Z",
    },
    quotes: [],
    turns: [],
    auditCertificate: {
      certificateId: "cert-002",
      timestamp: "2026-11-07T00:05:00Z",
      passed: false,
      merkleRoot: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      invariants: [
        { name: "1. SKU Integrity", passed: false, details: "SKU mismatch" },
      ],
    },
    createdAt: "2026-11-07T00:00:00Z",
  } as unknown as ProcurementSession,
];

describe("Phase 5: Procurement History & Session Inspection", () => {
  it("renders structured specifications safely without [object Object]", () => {
    const onSelect = vi.fn();
    const onStart = vi.fn();
    render(
      <ProcurementHistoryScreen
        sessions={mockSessions}
        onSelectSession={onSelect}
        onStartNew={onStart}
      />
    );

    // Verify object specs formatting
    expect(screen.getByText("Resolution: 4K, Port: USB-C")).toBeInTheDocument();
    // Verify empty specs fallback to Standard SLA
    expect(screen.getByText("Standard SLA")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Procurement History", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Review saved mandates, supplier agreements, audit evidence and settlement records.")).toBeInTheDocument();
    expect(screen.queryByText("Authoritative Persistence")).not.toBeInTheDocument();
    expect(screen.queryByText(/Authoritative In-Memory Store/i)).toBeNull();
  });

  it("filters sessions by status correctly", () => {
    const onSelect = vi.fn();
    const onStart = vi.fn();
    render(
      <ProcurementHistoryScreen
        sessions={mockSessions}
        onSelectSession={onSelect}
        onStartNew={onStart}
      />
    );

    const filterSelect = screen.getByLabelText("Filter by session status");
    fireEvent.change(filterSelect, { target: { value: "FAILED" } });

    expect(screen.getAllByText("sess-org1-002").length).toBeGreaterThan(0);
    expect(screen.queryByText("sess-org1-001")).toBeNull();
  });

  it("opens session inspector modal and allows keyboard escape dismissal", async () => {
    const onSelect = vi.fn();
    const onStart = vi.fn();
    render(
      <ProcurementHistoryScreen
        sessions={mockSessions}
        onSelectSession={onSelect}
        onStartNew={onStart}
      />
    );

    const inspectBtns = screen.getAllByLabelText("Inspect session sess-org1-001 details");
    fireEvent.click(inspectBtns[0]);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Session Audit Inspection")).toBeInTheDocument();
    expect(screen.getByText("PAYPAL-ORD-12345")).toBeInTheDocument();
    expect(screen.getAllByText("Resolution: 4K, Port: USB-C").length).toBeGreaterThan(0);

    // Escape closes modal
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("hands off to onSelectSession with the authoritative session object", () => {
    const onSelect = vi.fn();
    const onStart = vi.fn();
    render(
      <ProcurementHistoryScreen
        sessions={mockSessions}
        onSelectSession={onSelect}
        onStartNew={onStart}
      />
    );

    const openBtns = screen.getAllByLabelText("Open session sess-org1-001");
    fireEvent.click(openBtns[0]);

    expect(onSelect).toHaveBeenCalledWith(mockSessions[0]);
  });
});
