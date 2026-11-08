import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { NegotiationArenaScreen, type StreamEventItem } from "@/components/NegotiationArenaScreen";
import type { ProcurementMandate, ProcurementSession, VendorQuote } from "@/types/pactum";

const mandate: ProcurementMandate = { id: "m", itemQuery: "Rack servers", quantity: 25, maxTotalBudget: 8000, maxDeliveryDays: 5, minReturnDays: 30, currency: "USD", rawPrompt: "Server request", requiredSpecs: [], requiredCondition: "NEW", createdAt: "2026-11-08T00:00:00Z", version: 1, isLocked: true };
const quote: VendorQuote = { vendorId: "v", vendorName: "Recorded supplier", sku: "S1", productTitle: "Rack server", initialUnitAsk: 300, currentUnitBid: 300, shippingCost: 250, deliveryDays: 4, returnDays: 30, condition: "NEW", status: "ACTIVE", dataSource: "MOCK_CATALOG", currency: "USD" };
const event = (type: string, payload: Record<string, unknown>, id = type): StreamEventItem => ({ id, type, payload, timestamp: "2026-11-08T10:00:00Z" });
const completed = event("NEGOTIATION_COMPLETED", { selectedVendor: quote.vendorName, winningVendorId: "v", totalCost: 7269.5, savings: 999999 });
const defaults = { mandate, quotes: [quote], events: [] as StreamEventItem[], isStreaming: false };

describe("Negotiation Arena product lock", () => {
  it("does not invent a procurement request before hydration", () => {
    render(<NegotiationArenaScreen quotes={[]} events={[]} isStreaming={false} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading saved negotiation");
    expect(screen.queryByText(/4K Monitors|25 units|8,500|Round 1/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start/ })).not.toBeInTheDocument();
  });
  it("uses the persisted mandate rather than stale handoff details", () => {
    const session = { mandate: { ...mandate, itemQuery: "Saved request" }, status: "SOURCING" } as ProcurementSession;
    render(<NegotiationArenaScreen {...defaults} session={session} />);
    expect(screen.getByText("Saved request")).toBeInTheDocument();
    expect(screen.queryByText("Rack servers")).not.toBeInTheDocument();
  });
  it("removes unverified savings in both live and restored agreement views", () => {
    const { rerender } = render(<NegotiationArenaScreen {...defaults} events={[completed]} onProceedToSettlement={vi.fn()} />);
    expect(within(screen.getByRole("region", { name: "Final agreement" })).getByText("$7,269.50")).toBeInTheDocument();
    expect(screen.queryByText(/savings|999,999/i)).not.toBeInTheDocument();
    const session = { id: "s", mandate, status: "AUDIT_PASSED", turns: [], agreementRecord: { vendorId: "v", vendorName: quote.vendorName, totalCost: 7269.5, agreedOffer: { unitPrice: 280.78, deliveryDays: 4, returnDays: 30 } } } as unknown as ProcurementSession;
    rerender(<NegotiationArenaScreen {...defaults} session={session} />);
    expect(within(screen.getByRole("region", { name: "Final agreement" })).getByText("$7,269.50")).toBeInTheDocument();
    expect(screen.queryByText(/savings/i)).not.toBeInTheDocument();
  });
  it("has one handoff action and never starts payment on render", () => {
    const handoff = vi.fn(); render(<NegotiationArenaScreen {...defaults} events={[completed]} onProceedToSettlement={handoff} />);
    const buttons = screen.getAllByRole("button", { name: "Review audit and settlement" });
    expect(buttons).toHaveLength(1); expect(handoff).not.toHaveBeenCalled();
    fireEvent.click(buttons[0]); expect(handoff).toHaveBeenCalledTimes(1);
  });
  it("renders actual supplier progress with exact display minor units", () => {
    render(<NegotiationArenaScreen {...defaults} events={[event("VENDOR_COUNTEROFFER", { vendorId: "v", newUnitAsk: 280.78 })]} />);
    expect(screen.getByText("Counteroffer recorded")).toBeInTheDocument();
    expect(screen.getByText("$7,269.50")).toBeInTheDocument();
    expect(screen.getByText("Demonstration supplier")).toBeInTheDocument();
  });
  it("does not infer a policy predicate or retry from a reason string", () => {
    render(<NegotiationArenaScreen {...defaults} events={[event("GUARDRAIL_BLOCKED", { vendorId: "v", reason: "Budget exceeded" })]} />);
    expect(screen.getByText("Policy blocked proposal")).toBeInTheDocument();
    expect(screen.getByText("Budget exceeded")).toBeInTheDocument();
    expect(screen.queryByText(/Predicate A|regenerated|Purged/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Verification details"));
    expect(screen.getByText("Recorded decision: GUARDRAIL_BLOCKED")).toBeVisible();
  });
  it("distinguishes model, fallback and unknown proposal provenance", () => {
    render(<NegotiationArenaScreen {...defaults} events={[event("BUYER_PROPOSAL", { generator: "GEMINI_LIVE", vendorId: "v" }, "a"), event("BUYER_PROPOSAL", { generator: "DETERMINISTIC_FALLBACK", vendorId: "v" }, "b"), event("BUYER_PROPOSAL", { vendorId: "v" }, "c")]} />);
    expect(screen.getByText(/Buyer proposal \(Gemini\)/)).toBeInTheDocument();
    expect(screen.getByText(/Buyer proposal \(deterministic fallback\)/)).toBeInTheDocument();
    expect(screen.getByText(/Buyer proposal \(source not recorded\)/)).toBeInTheDocument();
  });
  it("claims a pending start immediately to prevent rapid duplicate submissions", async () => {
    let resolve!: () => void;
    const start = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    render(<NegotiationArenaScreen {...defaults} onStartNegotiation={start} />);
    fireEvent.click(screen.getByRole("button", { name: "Start Negotiation" }));
    const pending = screen.getByRole("button", { name: /Initializing/ });
    expect(pending).toBeDisabled(); fireEvent.click(pending); expect(start).toHaveBeenCalledTimes(1);
    resolve(); await waitFor(() => expect(screen.getByRole("button", { name: "Start Negotiation" })).toBeEnabled());
  });
  it("reports a rejected start without inventing events", async () => {
    render(<NegotiationArenaScreen {...defaults} onStartNegotiation={vi.fn().mockRejectedValue(new Error("secret"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Start Negotiation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not start");
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
  it.each(["CANCELLED", "PAYPAL_CAPTURED", "SETTLED", "DISPUTED"] as const)("does not offer a new run in %s", status => {
    render(<NegotiationArenaScreen {...defaults} session={{ mandate, status, turns: [] } as unknown as ProcurementSession} onStartNegotiation={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start Negotiation" })).toBeDisabled();
  });
  it("shows missing financial evidence as unknown rather than zero", () => {
    render(<NegotiationArenaScreen {...defaults} events={[event("NEGOTIATION_COMPLETED", { selectedVendor: "Recorded supplier" })]} />);
    expect(within(screen.getByRole("region", { name: "Final agreement" })).getByText("Not recorded")).toBeInTheDocument();
  });
  it("retains cancelled agreement history without offering settlement handoff", () => {
    render(<NegotiationArenaScreen {...defaults} session={{ mandate, status: "CANCELLED", turns: [] } as unknown as ProcurementSession} events={[completed]} onProceedToSettlement={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Session cancelled");
    expect(screen.getByRole("region", { name: "Final agreement" })).toHaveTextContent("retained for review");
    expect(screen.queryByRole("button", { name: "Review audit and settlement" })).not.toBeInTheDocument();
  });
  it("keeps saved history visible when session retrieval fails", () => {
    const retry = vi.fn(); render(<NegotiationArenaScreen {...defaults} events={[event("ROUND_STARTED", { round: 2, maxRounds: 4 })]} error="Records could not be retrieved." onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Records could not be retrieved");
    expect(screen.getByRole("heading", { name: "Round 2 of 4" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved session" })); expect(retry).toHaveBeenCalledOnce();
  });
});
