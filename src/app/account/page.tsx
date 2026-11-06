"use client";
import { useEffect, useState } from "react";

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
  return <main className="min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
    <section className="max-w-lg space-y-5 rounded-xl border border-smoke p-8">
      <p className="font-mono text-ember-orange">PACTUM</p><h1 className="text-2xl font-semibold">Your account</h1>
      <p>{email ? `Signed in as ${email}` : "Checking your verified session…"}</p>
      <p>Organization authorization is not available yet. Procurement, evidence, and settlement APIs are disabled until organization access is implemented.</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={logout} className="rounded bg-ember-orange p-3 text-white disabled:opacity-50">{busy ? "Signing out…" : "Sign out"}</button>
    </section>
  </main>;
}
