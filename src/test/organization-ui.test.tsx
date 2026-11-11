import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OrganizationBoundary, useOrganizationControl } from "@/components/OrganizationBoundary";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("organization workspace isolation", () => {
  it("disables repeated submissions while saving and allows retry after failure", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ organizations: [], active: null }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OrganizationBoundary><p>Workspace</p></OrganizationBoundary>);
    const input = await screen.findByRole("textbox", { name: "Organization name" });
    fireEvent.change(input, { target: { value: "Test organization" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    for (const button of screen.getAllByRole("button", { name: "Saving…" })) expect(button).toBeDisabled();
    finish(Response.json({ error: { message: "Please retry" } }, { status: 503 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    expect(input).toHaveValue("Test organization");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("restores the authorized workspace when switching organizations fails", async () => {
    const active = { id: "tenant", name: "Tenant", role: "OWNER", permissions: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ organizations: [active], active }))
      .mockResolvedValueOnce(Response.json({ error: { message: "Switch unavailable" } }, { status: 503 })));
    function Workspace() {
      const control = useOrganizationControl();
      return <><p>{control.active?.name}</p><button onClick={() => void control.switchOrganization("other-tenant")}>Switch</button><p role="status">{control.error}</p></>;
    }
    render(<OrganizationBoundary><Workspace /></OrganizationBoundary>);
    fireEvent.click(await screen.findByRole("button", { name: "Switch" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Switch unavailable");
    expect(screen.getByText("Tenant")).toBeInTheDocument();
  });
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
