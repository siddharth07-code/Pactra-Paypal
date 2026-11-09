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

export const OrganizationContext = createContext<ActiveOrganization | null>(null);
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
      window.location.replace("/workspace");
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
      <main className="pactum-workspace min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
        <p className="text-text-secondary text-sm">Verifying organization access…</p>
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
          <main className="pactum-workspace min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
            <div className="max-w-md w-full p-6 rounded-[6px] border border-border-primary bg-surface-primary space-y-4">
              <h2 className="text-lg font-semibold text-text-primary">Organization Access</h2>
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </main>
        ) : active ? (
          <div key={active.id}>
            {active.role === "VIEWER" ? <ViewerSummary /> : children}
          </div>
        ) : (
          <main className="max-w-lg mx-auto space-y-6 p-6 sm:p-8">
            <div className="space-y-1.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.08em] font-semibold text-ember-orange block">
                Workspace Multi-Tenancy
              </span>
              <h1 className="workspace-title text-text-primary">
                Choose or create your organization
              </h1>
              <p className="text-xs text-text-secondary">
                PACTUM partitions all procurement mandates, Merkle evidence records, and settlement gates by verified organization boundaries.
              </p>
            </div>

            {error && (
              <p role="alert" className="p-3 rounded-[6px] border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 font-medium">
                {error}
              </p>
            )}

            <div className="p-5 rounded-[6px] border border-border-primary bg-surface-primary space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Create New Organization</h2>
              <form onSubmit={event => { event.preventDefault(); void mutate("", { name }); }} className="flex gap-2.5">
                <input
                  aria-label="Organization name"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="border border-border-primary rounded-[6px] px-3 py-2 bg-surface-secondary text-text-primary text-xs flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                  placeholder="e.g. Acme Procurement Corp"
                />
                <button
                  type="submit"
                  className="bg-ember-orange hover:bg-[#a3351f] rounded-[6px] px-4 py-2 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Create
                </button>
              </form>
            </div>

            <div className="p-5 rounded-[6px] border border-border-primary bg-surface-primary space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Accept Invitation Token</h2>
              <form onSubmit={event => { event.preventDefault(); void mutate("/invitations/accept", { token }); }} className="flex gap-2.5">
                <input
                  aria-label="Invitation token"
                  required
                  value={token}
                  onChange={event => setToken(event.target.value)}
                  className="border border-border-primary rounded-[6px] px-3 py-2 bg-surface-secondary text-text-primary text-xs flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange font-mono"
                  placeholder="Paste invitation token"
                />
                <button
                  type="submit"
                  className="border border-border-primary rounded-[6px] px-4 py-2 bg-surface-secondary hover:bg-surface-secondary/80 text-text-primary text-xs font-medium transition-colors cursor-pointer"
                >
                  Accept
                </button>
              </form>
            </div>
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
    <main className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <span className="text-[11.5px] font-mono uppercase tracking-[0.08em] font-semibold text-ember-orange block">
          Read-Only Audit Access
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Procurement summaries</h1>
        <p className="text-xs text-text-secondary">
          As a viewer, you have read-only access to organization procurement summaries without financial execution privileges.
        </p>
      </div>
      {error && <p role="alert" className="p-3 rounded-[6px] border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}
      <div className="space-y-2.5">
        {sessions.map(s => (
          <article key={s.id} className="p-4 rounded-[6px] border border-border-primary bg-surface-primary flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">{s.itemQuery} · {s.currency} · {s.status}</p>
              <p className="text-xs text-text-secondary font-mono mt-0.5">{s.id}</p>
            </div>
            <span className="px-2.5 py-1 rounded-[6px] border border-border-primary bg-surface-secondary text-[11px] font-mono uppercase text-text-secondary">
              {s.status}
            </span>
          </article>
        ))}
      </div>
    </main>
  );
}
