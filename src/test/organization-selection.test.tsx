import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccountPage from "@/app/account/page";
import { OrganizationBoundary } from "@/components/OrganizationBoundary";
import { OrganizationMembers } from "@/components/OrganizationMembers";

const organizations = [
  { id: "org-one", name: "First organization", role: "OWNER", permissions: [] },
  { id: "org-two", name: "Second organization", role: "VIEWER", permissions: [] },
];
function mockAccount(organizationResponse: () => Promise<Response>) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => String(url) === "/api/auth/session"
    ? Response.json({ principal: { email: "buyer@example.test" } }) : organizationResponse());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("account and workspace organization selection", () => {
  it("shows the zero-organization onboarding on the actual login landing page", async () => {
    mockAccount(async () => Response.json({ organizations: [], active: null }));
    render(<AccountPage />);
    expect(await screen.findByText(/do not belong to an organization yet/)).toBeInTheDocument();
    expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    expect(screen.getByLabelText("Invitation token")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it.each([1, 2])("lists %i existing memberships even without a selection cookie", async count => {
    mockAccount(async () => Response.json({ organizations: organizations.slice(0, count), active: null }));
    render(<AccountPage />);
    expect(await screen.findByRole("combobox", { name: "Organization" })).toHaveValue(organizations[0].id);
    expect(screen.getAllByRole("option")).toHaveLength(count);
    expect(screen.getByRole("button", { name: "Open workspace" })).toBeEnabled();
  });
  it("provides selection on the workspace gate without mounting private content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ organizations, active: null })));
    render(<OrganizationBoundary><p>Private procurement</p></OrganizationBoundary>);
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByText("Private procurement")).toBeNull();
  });
  it("keeps account organization controls available to an active VIEWER", async () => {
    mockAccount(async () => Response.json({ organizations, active: organizations[1] }));
    render(<AccountPage />);
    expect(await screen.findByRole("combobox")).toHaveValue(organizations[1].id);
    expect(screen.getByText("Active organization: Second organization")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.queryByText("Procurement summaries")).toBeNull();
  });
  it("posts the selected membership for activation and shows denial without inventing access", async () => {
    let calls = 0;
    const fetchMock = mockAccount(async () => ++calls === 1
      ? Response.json({ organizations, active: null })
      : Response.json({ error: { message: "Membership no longer active." } }, { status: 403 }));
    render(<AccountPage />);
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: organizations[1].id } });
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Membership no longer active");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/organizations/switch", expect.objectContaining({
      method: "POST", credentials: "same-origin", body: JSON.stringify({ organizationId: organizations[1].id }),
    }));
    expect(screen.getByRole("button", { name: "Open workspace" })).toBeEnabled();
  });
  it("submits first-organization creation and retains input on a database failure", async () => {
    let calls = 0;
    const fetchMock = mockAccount(async () => ++calls === 1
      ? Response.json({ organizations: [], active: null })
      : Response.json({ error: { message: "Database unavailable." } }, { status: 503 }));
    render(<AccountPage />);
    fireEvent.change(await screen.findByLabelText("Organization name"), { target: { value: "New organization" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByLabelText("Organization name")).toHaveValue("New organization");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/organizations", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "New organization" }) }));
  });
  it("shows organization loading rather than prematurely offering creation", async () => {
    mockAccount(() => new Promise<Response>(() => {}));
    render(<AccountPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("Verifying organization access");
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  });
  it("allows retry after a failed listing and then displays memberships", async () => {
    let calls = 0;
    mockAccount(async () => ++calls === 1 ? Response.json({ error: { message: "Database unavailable." } }, { status: 503 }) : Response.json({ organizations, active: null }));
    render(<AccountPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry organization access" }));
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });
  it("directs expired sessions to sign in instead of showing empty onboarding", async () => {
    mockAccount(async () => Response.json({ error: { message: "Sign in to continue." } }, { status: 401 }));
    render(<AccountPage />);
    expect(await screen.findByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  });
  it("does not silently swallow membership-management API failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Database unavailable." } }, { status: 503 })));
    render(<OrganizationMembers />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Membership management is unavailable");
  });
  it("fails closed when the session expires during a switch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ organizations, active: organizations[0] }))
      .mockResolvedValueOnce(Response.json({ error: { message: "Sign in again." } }, { status: 401 })));
    const { useOrganizationControl } = await import("@/components/OrganizationBoundary");
    function Workspace() { const control = useOrganizationControl(); return <button onClick={() => void control.switchOrganization(organizations[1].id)}>Switch workspace</button>; }
    render(<OrganizationBoundary><Workspace /></OrganizationBoundary>);
    fireEvent.click(await screen.findByRole("button", { name: "Switch workspace" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Switch workspace" })).toBeNull());
    expect(await screen.findByRole("link", { name: "Sign in again" })).toBeInTheDocument();
  });
});
