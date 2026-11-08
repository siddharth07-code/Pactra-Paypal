"use client";
import Link from "next/link";
import { OrganizationMembers } from "@/components/OrganizationMembers";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (response.ok) setEmail(data.principal.email);
        else setError(data.error?.message ?? "Sign in to continue.");
      }).catch(() => { if (!controller.signal.aborted) setError("Authentication is unavailable. Please retry."); });
    return () => controller.abort();
  }, []);

  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) { setError("Logout could not be confirmed. Please retry."); return; }
      window.location.assign("/login");
    } catch { setError("Logout is unavailable. Please retry."); }
    finally { setBusy(false); }
  }

  return (
    <main className="pactum-workspace min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-4 sm:p-6">
      <section className="max-w-xl w-full space-y-6 rounded-[6px] border border-border-primary bg-surface-primary p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-border-primary pb-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-[5px] bg-ember-orange text-white font-semibold text-[13.5px] flex items-center justify-center shrink-0 select-none shadow-xs">
              P
            </span>
            <span className="text-[16px] tracking-[-0.02em] font-semibold text-text-primary">
              PACTUM
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-[6px] border border-border-primary bg-surface-secondary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Workspace</span>
          </Link>
        </div>

        <div className="space-y-1.5">
          <h1 className="workspace-title text-text-primary">
            Account &amp; Workspace
          </h1>
          <p className="text-sm text-text-secondary">
            {email ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Signed in as {email}
              </span>
            ) : (
              "Checking your verified session…"
            )}
          </p>
        </div>

        <div className="rounded-[6px] border border-border-primary bg-surface-secondary p-4 text-xs text-text-secondary leading-relaxed">
          Select an organization to access procurement and settlement. Your active membership and permissions are verified by the server for every operation.
        </div>

        <OrganizationMembers />

        {error && (
          <div role="alert" className="p-3 rounded-[6px] border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        <div className="pt-2 border-t border-border-primary flex items-center justify-between">
          <button
            type="button"
            disabled={busy}
            onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] bg-surface-secondary hover:bg-surface-secondary/80 text-text-primary border border-border-primary text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{busy ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
