import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NegotiationArenaScreen, type StreamEventItem } from "@/components/NegotiationArenaScreen";
const event = (type: string, payload: Record<string, unknown>): StreamEventItem => ({ id: type, type, payload, timestamp: "2026-11-01T00:00:00Z" });
describe("negotiation failure presentation", () => {
  it("shows a safe diagnostic and recovery action without exposing raw provider errors", () => {
    render(<NegotiationArenaScreen quotes={[]} events={[event("NEGOTIATION_FAILED", { code: "DATABASE_UNAVAILABLE", reference: "diagnostic-reference", detail: "secret provider stack" })]} isStreaming={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not save its progress");
    expect(screen.getByText(/Diagnostic reference: diagnostic-reference/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload saved session" })).toBeInTheDocument(); expect(screen.queryByText(/secret provider stack/)).not.toBeInTheDocument();
  });
  it("never advertises consensus or settlement after a later failure", () => {
    render(<NegotiationArenaScreen quotes={[]} events={[event("NEGOTIATION_COMPLETED", { selectedVendor: "Test supplier", totalCost: 100 }), event("NEGOTIATION_FAILED", { code: "STREAM_INTERRUPTED" })]} isStreaming={false} onProceedToSettlement={vi.fn()} />);
    expect(screen.queryByText(/Consensus Reached/)).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Proceed to Settlement/ })).not.toBeInTheDocument();
  });
  it("distinguishes policy stops from unexpected failures", () => {
    render(<NegotiationArenaScreen quotes={[]} events={[event("NEGOTIATION_ABORTED", { reason: "The mandate changed during negotiation." })]} isStreaming={false} />);
    expect(screen.getByText("Negotiation stopped")).toBeInTheDocument(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("labels deterministic fallback honestly", () => {
    render(<NegotiationArenaScreen quotes={[]} events={[event("BUYER_PROPOSAL", { generator: "DETERMINISTIC_FALLBACK", vendorName: "Test supplier" })]} isStreaming />);
    expect(screen.getByText(/They are not live model results/)).toBeInTheDocument(); expect(screen.queryByText(/Buyer Agent \(Gemini\)/)).not.toBeInTheDocument();
  });
});
