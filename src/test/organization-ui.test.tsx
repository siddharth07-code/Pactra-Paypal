import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OrganizationBoundary } from "@/components/OrganizationBoundary";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("organization workspace isolation", () => {
  it("never renders the financial workspace before organization authorization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ organizations: [], active: null })));
    render(<OrganizationBoundary><p>Private settlement details</p></OrganizationBoundary>);
    expect(screen.queryByText("Private settlement details")).toBeNull();
    expect(await screen.findByText("Choose or create your organization")).toBeInTheDocument();
    expect(screen.queryByText("Private settlement details")).toBeNull();
  });
  it("fails closed when organization infrastructure is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Database unavailable" } }, { status: 503 })));
    render(<OrganizationBoundary><p>Private settlement details</p></OrganizationBoundary>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.queryByText("Private settlement details")).toBeNull();
  });
  it("gives a VIEWER only redacted summaries and no financial workspace", async () => {
    const active = { id: "tenant", name: "Tenant", role: "VIEWER", permissions: ["session.read"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ organizations: [active], active })).mockResolvedValueOnce(Response.json({ sessions: [{ id: "session", status: "SETTLED", itemQuery: "Monitors", currency: "USD" }], summaryOnly: true })));
    render(<OrganizationBoundary><p>Capture payment</p></OrganizationBoundary>);
    expect(await screen.findByText("Procurement summaries")).toBeInTheDocument();
    expect(screen.queryByText("Capture payment")).toBeNull(); expect(screen.queryByText("Manage members")).toBeNull();
    expect(await screen.findByText("Monitors · USD · SETTLED")).toBeInTheDocument();
  });
});
