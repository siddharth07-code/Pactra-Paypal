"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Permission, Role } from "@/lib/organizations/permissions";
export interface ActiveOrganization { id: string; name: string; role: Role; permissions: Permission[] }
const OrganizationContext = createContext<ActiveOrganization | null>(null);
export const useOrganization = () => useContext(OrganizationContext);
export function OrganizationBoundary({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<ActiveOrganization[]>([]);
  const [active, setActive] = useState<ActiveOrganization | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [name, setName] = useState(""), [token, setToken] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/organizations", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Organization access is unavailable.");
      setOrganizations(data.organizations); setActive(data.active);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function mutate(path: string, body: unknown) {
    setError("");
    try {
      const response = await fetch(`/api/organizations${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Organization operation failed.");
      // Destroy every organization-specific component, URL session selector and cached workspace.
      // No business records are stored in browser storage by this boundary.
      window.location.replace("/");
    } catch (error) { setError(error instanceof Error ? error.message : "Organization access failed."); }
  }
  if (loading) return <main className="p-8">Verifying organization access…</main>;
  return <OrganizationContext.Provider value={active}>
    <aside className="border-b border-smoke bg-page-bg px-6 py-3 flex flex-wrap gap-3 items-center text-sm">
      <a href="/account">Account</a>
      <label>Organization <select aria-label="Organization" value={active?.id ?? ""} onChange={event => { setActive(null); void mutate("/switch", { organizationId: event.target.value }); }} className="border border-smoke rounded p-1 bg-page-bg">
        <option value="" disabled>Select organization</option>
        {organizations.map(org => <option key={org.id} value={org.id}>{org.name} · {org.role}</option>)}
      </select></label>
      {active?.permissions.includes("membership.manage") && <a href="/account">Manage members</a>}
      {error && <p role="alert">{error}</p>}
    </aside>
    {active ? <div key={active.id}>{active.role === "VIEWER" ? <ViewerSummary /> : children}</div> : <main className="max-w-lg mx-auto space-y-5 p-8">
      <h1 className="text-2xl">Choose or create your organization</h1>
      <form onSubmit={event => { event.preventDefault(); void mutate("", { name }); }} className="flex gap-3">
        <input aria-label="Organization name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} className="border border-smoke rounded p-2 bg-page-bg" />
        <button className="bg-ember-orange rounded p-2 text-white">Create organization</button>
      </form>
      <form onSubmit={event => { event.preventDefault(); void mutate("/invitations/accept", { token }); }} className="flex gap-3">
        <input aria-label="Invitation token" required value={token} onChange={event => setToken(event.target.value)} className="border border-smoke rounded p-2 bg-page-bg" />
        <button>Accept invitation</button>
      </form>
    </main>}
  </OrganizationContext.Provider>;
}

function ViewerSummary() {
  const [sessions, setSessions] = useState<{ id: string; status: string; itemQuery: string; currency: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/procurement/sessions", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error("Session summaries are unavailable."); setSessions(data.sessions);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  return <main className="p-8 space-y-4"><h1 className="text-2xl">Procurement summaries</h1>{error && <p role="alert">{error}</p>}{sessions.map(s => <article key={s.id}><p>{s.itemQuery} · {s.currency} · {s.status}</p><p className="text-sm">{s.id}</p></article>)}</main>;
}
