"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Permission, Role } from "@/lib/organizations/permissions";

export interface ActiveOrganization {
  id: string;
  name: string;
  role: Role;
  permissions: Permission[];
}

export interface OrganizationControlContextValue {
  active: ActiveOrganization | null;
  organizations: ActiveOrganization[];
  switchOrganization: (organizationId: string) => Promise<void>;
  error: string;
}

const OrganizationContext = createContext<ActiveOrganization | null>(null);
const OrganizationControlContext = createContext<OrganizationControlContextValue>({
  active: null,
  organizations: [],
  switchOrganization: async () => {},
  error: "",
});

export const useOrganization = () => useContext(OrganizationContext);
export const useOrganizationControl = () => useContext(OrganizationControlContext);

export function OrganizationBoundary({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<ActiveOrganization[]>([]);
  const [active, setActive] = useState<ActiveOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/organizations", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? "Organization access is unavailable.");
        setOrganizations(data.organizations || []);
        setActive(data.active || null);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function mutate(path: string, body: unknown) {
    setError("");
    try {
      const response = await fetch(`/api/organizations${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Organization operation failed.");
      window.location.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Organization access failed.");
    }
  }

  const switchOrganization = async (organizationId: string) => {
    setActive(null);
    await mutate("/switch", { organizationId });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
        <p className="text-secondary text-sm">Verifying organization access…</p>
      </main>
    );
  }

  const controlValue: OrganizationControlContextValue = {
    active,
    organizations,
    switchOrganization,
    error,
  };

  return (
    <OrganizationContext.Provider value={active}>
      <OrganizationControlContext.Provider value={controlValue}>
        {error && !active ? (
          <main className="min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
            <div className="max-w-md w-full p-6 rounded-lg border border-smoke bg-paper-white dark:bg-[#18181b] space-y-4">
              <h2 className="text-lg font-semibold">Organization Access</h2>
              <p role="alert" className="text-sm text-red-600">{error}</p>
            </div>
          </main>
        ) : active ? (
          <div key={active.id}>
            {active.role === "VIEWER" ? <ViewerSummary /> : children}
          </div>
        ) : (
          <main className="max-w-lg mx-auto space-y-5 p-8">
            <h1 className="text-2xl font-semibold">Choose or create your organization</h1>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <form onSubmit={event => { event.preventDefault(); void mutate("", { name }); }} className="flex gap-3">
              <input aria-label="Organization name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} className="border border-smoke rounded p-2 bg-page-bg flex-1" placeholder="Organization name" />
              <button className="bg-ember-orange rounded p-2 text-white font-medium">Create organization</button>
            </form>
            <form onSubmit={event => { event.preventDefault(); void mutate("/invitations/accept", { token }); }} className="flex gap-3">
              <input aria-label="Invitation token" required value={token} onChange={event => setToken(event.target.value)} className="border border-smoke rounded p-2 bg-page-bg flex-1" placeholder="Invitation token" />
              <button className="border border-smoke rounded p-2 hover:bg-smoke/30">Accept invitation</button>
            </form>
          </main>
        )}
      </OrganizationControlContext.Provider>
    </OrganizationContext.Provider>
  );
}

function ViewerSummary() {
  const [sessions, setSessions] = useState<{ id: string; status: string; itemQuery: string; currency: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/procurement/sessions", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error("Session summaries are unavailable.");
        setSessions(data.sessions);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Procurement summaries</h1>
      {error && <p role="alert">{error}</p>}
      {sessions.map(s => (
        <article key={s.id} className="p-4 rounded border border-smoke">
          <p className="font-medium">{s.itemQuery} · {s.currency} · {s.status}</p>
          <p className="text-sm text-secondary font-mono-token">{s.id}</p>
        </article>
      ))}
    </main>
  );
}
