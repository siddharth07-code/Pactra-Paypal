"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

export function OrganizationBoundary({ children, renderAccount }: { children?: ReactNode; renderAccount?: (selection: ReactNode, active: ActiveOrganization | null) => ReactNode }) {
  const [organizations, setOrganizations] = useState<ActiveOrganization[]>([]);
  const [active, setActive] = useState<ActiveOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessFailed, setAccessFailed] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectionId, setSelectionId] = useState("");
  const [revision, setRevision] = useState(0);
  const [unauthorized, setUnauthorized] = useState(false);
  const mutationPending = useRef(false);
  const mutationAuthFailed = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setAccessFailed(false); setError(""); setUnauthorized(false);
    fetch("/api/organizations", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setUnauthorized(response.status === 401);
          throw new Error(data.error?.message ?? "Organization access is unavailable.");
        }
        if (!Array.isArray(data.organizations)) throw new Error("Organization access returned an invalid response. Please retry.");
        const organizations = data.organizations as ActiveOrganization[];
        const active = organizations.find(org => org.id === data.active?.id) ?? null;
        setOrganizations(organizations);
        setActive(active);
        setSelectionId(active?.id ?? organizations[0]?.id ?? "");
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setAccessFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  async function mutate(path: string, body: unknown) {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    mutationAuthFailed.current = false;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) { mutationAuthFailed.current = true; setActive(null); setUnauthorized(true); setAccessFailed(true); }
        throw new Error(data.error?.message ?? "Organization operation failed.");
      }
      window.location.replace("/workspace");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Organization access failed.");
      setSubmitting(false);
      mutationPending.current = false;
      return false;
    }
    return true;
  }

  const switchOrganization = async (organizationId: string) => {
    if (mutationPending.current) return;
    const previous = active;
    setActive(null);
    if (!await mutate("/switch", { organizationId }) && !mutationAuthFailed.current) setActive(previous);
  };

  const Heading = renderAccount ? "h2" : "h1";
  const selection = loading ? <p role="status">Verifying organization access…</p> : accessFailed ? (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Organization Access</h2>
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      {unauthorized ? <a href="/login" className="underline">Sign in again</a> : <button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-11 rounded-[6px] border border-border-primary px-4 cursor-pointer">Retry organization access</button>}
    </section>
  ) : (
          <section className="space-y-6">
            <div className="space-y-1.5">
              <span className="text-[11.5px] font-mono uppercase tracking-[0.08em] font-semibold text-ember-orange block">
                Workspace Multi-Tenancy
              </span>
              <Heading className="workspace-title text-text-primary">
                Choose or create your organization
              </Heading>
              <p className="text-xs text-text-secondary">
                PACTRA partitions all procurement mandates, Merkle evidence records, and settlement gates by verified organization boundaries.
              </p>
            </div>

            {error && (
              <p role="alert" className="p-3 rounded-[6px] border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 font-medium">
                {error}
              </p>
            )}

            {organizations.length > 0 && (
              <form aria-busy={submitting} onSubmit={event => { event.preventDefault(); if (selectionId) void switchOrganization(selectionId); }} className="space-y-3">
                <label htmlFor="organization-selection" className="block text-sm font-medium">Organization</label>
                <select id="organization-selection" value={selectionId} onChange={event => setSelectionId(event.target.value)} disabled={submitting} className="min-h-11 w-full min-w-0 rounded-[6px] border border-border-primary bg-surface-secondary px-3 text-sm focus-visible:outline-2 focus-visible:outline-ember-orange">
                  {organizations.map(org => <option key={org.id} value={org.id}>{org.name} ({org.role})</option>)}
                </select>
                <button type="submit" disabled={submitting || !selectionId} className="min-h-11 rounded-[6px] bg-ember-orange px-4 py-2 text-sm text-white cursor-pointer disabled:opacity-50">{submitting ? "Opening…" : "Open workspace"}</button>
              </form>
            )}
            {active && <p className="text-sm text-text-secondary">Active organization: {active.name}</p>}
            {organizations.length === 0 && <p className="text-sm text-text-secondary">You do not belong to an organization yet. Create one or accept an invitation to continue.</p>}
            <div className="p-5 rounded-[6px] border border-border-primary bg-surface-primary space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Create New Organization</h2>
              <form aria-busy={submitting} onSubmit={event => { event.preventDefault(); if (!submitting) void mutate("", { name }); }} className="flex gap-2.5">
                <input
                  aria-label="Organization name"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="min-w-0 border border-border-primary rounded-[6px] px-3 py-2 bg-surface-secondary text-text-primary text-xs flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange"
                  placeholder="e.g. Acme Procurement Corp"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-ember-orange hover:bg-[#a3351f] rounded-[6px] px-4 py-2 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  {submitting ? "Saving…" : "Create"}
                </button>
              </form>
            </div>

            <div className="p-5 rounded-[6px] border border-border-primary bg-surface-primary space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Accept Invitation Token</h2>
              <form aria-busy={submitting} onSubmit={event => { event.preventDefault(); if (!submitting) void mutate("/invitations/accept", { token }); }} className="flex gap-2.5">
                <input
                  aria-label="Invitation token"
                  required
                  value={token}
                  onChange={event => setToken(event.target.value)}
                  className="min-w-0 border border-border-primary rounded-[6px] px-3 py-2 bg-surface-secondary text-text-primary text-xs flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-orange font-mono"
                  placeholder="Paste invitation token"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="border border-border-primary rounded-[6px] px-4 py-2 bg-surface-secondary hover:bg-surface-secondary/80 text-text-primary text-xs font-medium transition-colors cursor-pointer"
                >
                  {submitting ? "Saving…" : "Accept"}
                </button>
              </form>
            </div>
          </section>  );

  if (loading && !renderAccount) {
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
        {renderAccount ? renderAccount(selection, active) : accessFailed && !active ? (
          <main className="max-w-lg mx-auto p-6 sm:p-8">{selection}</main>
        ) : active ? (
          <div key={active.id}>
            {active.role === "VIEWER" ? <ViewerSummary /> : children}
          </div>
        ) : (
          <main className="max-w-lg mx-auto p-6 sm:p-8">{selection}</main>
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
        <Link href="/account" className="inline-flex min-h-11 items-center text-sm text-ember-orange underline">Account &amp; Workspace</Link>
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
