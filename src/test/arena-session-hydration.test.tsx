import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { ProcurementSession } from "@/types/pactum";

vi.mock("@/components/OrganizationBoundary", () => ({ OrganizationBoundary: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children, onNavigate }: { children: React.ReactNode; onNavigate: (screen: string) => void }) => <><button onClick={() => onNavigate("history")}>History</button><button onClick={() => onNavigate("arena")}>Negotiations</button>{children}</> }));
vi.mock("@/components/OverviewScreen", () => ({ OverviewScreen: () => null }));
vi.mock("@/components/SourcingScreen", () => ({ SourcingScreen: () => null }));
vi.mock("@/components/EvidenceVaultScreen", () => ({ EvidenceVaultScreen: () => null }));
vi.mock("@/components/SettlementCenterScreen", () => ({ SettlementCenterScreen: () => <p>Settlement screen</p> }));
vi.mock("@/components/ProcurementHistoryScreen", () => ({ ProcurementHistoryScreen: ({ sessions, onSelectSession }: { sessions: ProcurementSession[]; onSelectSession: (session: ProcurementSession) => void }) => <button onClick={() => onSelectSession(sessions[0])}>Open saved record</button> }));
import Page from "@/app/workspace/page";

const session = { id: "selected", status: "AUDIT_PASSED", mandate: { itemQuery: "Saved procurement", quantity: 2, maxTotalBudget: 1000, maxDeliveryDays: 5, minReturnDays: 30, currency: "USD" }, quotes: [], turns: [{ id: "turn", round: 1, actor: "BUYER", turnType: "PROPOSAL", generator: "DETERMINISTIC_FALLBACK", timestamp: "2026-11-08T00:00:00Z" }], agreementRecord: { vendorName: "Saved supplier", vendorId: "v", totalCost: 600, acceptedAt: "2026-11-08T00:01:00Z" } } as unknown as ProcurementSession;
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ sessions: [session] }) }); window.history.replaceState({}, "", "/workspace?screen=arena&sessionId=selected"); });

describe("Arena authoritative session hydration", () => {
  it("restores the selected agreement without budget-derived savings", async () => {
    render(<Page />);
    expect(await screen.findByText("Saved procurement")).toBeInTheDocument();
    expect(await screen.findByText("$600.00")).toBeInTheDocument();
    expect(screen.queryByText(/savings|\$400.00/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Buyer proposal \(deterministic fallback\)/)).toBeInTheDocument();
  });
  it("does not replace an explicit missing session with the organization's first record", async () => {
    window.history.replaceState({}, "", "/workspace?screen=arena&sessionId=missing");
    render(<Page />);
    await waitFor(() => expect(screen.queryByText(/Loading saved negotiation/)).not.toBeInTheDocument());
    expect(screen.queryByText("Saved procurement")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("selected procurement session is unavailable");
    expect(screen.queryByRole("button", { name: "Review audit and settlement" })).not.toBeInTheDocument();
    expect(window.location.search).toContain("sessionId=missing");
  });
  it("does not hand off to a different session if the selected record disappears", async () => {
    render(<Page />);
    const handoff = await screen.findByRole("button", { name: "Review audit and settlement" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sessions: [{ ...session, id: "unrelated" }] }) });
    fireEvent.click(handoff);
    expect(await screen.findByRole("alert")).toHaveTextContent("selected session could not be loaded");
    expect(screen.queryByText("Settlement screen")).not.toBeInTheDocument();
    expect(window.location.search).toContain("sessionId=selected");
  });
  it("does not invent turn timestamps or a maximum round count for legacy records", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sessions: [{ ...session, turns: [{ ...session.turns[0], timestamp: undefined }], agreementRecord: { ...session.agreementRecord, acceptedAt: undefined } }] }) });
    const { container } = render(<Page />);
    expect(await screen.findByText("Saved procurement")).toBeInTheDocument();
    expect(container.querySelectorAll("time")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: /^Round 1$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Round 1 of 4/)).not.toBeInTheDocument();
  });
  it("clears a missing-session error after reopening a valid record from History", async () => {
    window.history.replaceState({}, "", "/workspace?screen=arena&sessionId=missing");
    render(<Page />);
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: "Open saved record" }));
    fireEvent.click(screen.getByRole("button", { name: "Negotiations" }));
    expect(await screen.findByText("Saved procurement")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(window.location.search).toContain("sessionId=selected");
  });
});
