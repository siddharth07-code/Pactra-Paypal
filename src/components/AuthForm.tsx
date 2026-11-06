"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const registration = mode === "register";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error?.message ?? "Authentication failed. Please retry."); return; }
      if (registration) setNotice("If your address is eligible, check your email and open the confirmation link in this browser.");
      else window.location.assign("/account");
    } catch { setError("Authentication is unavailable. Please retry."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
    <section className="w-full max-w-md rounded-xl border border-smoke dark:border-[#27272a] bg-paper-white dark:bg-[#18181b] p-8 space-y-6">
      <Link href="/login" className="font-mono text-ember-orange tracking-widest font-semibold">PACTUM</Link>
      <h1 className="text-2xl font-semibold">{registration ? "Create your account" : "Sign in"}</h1>
      <p className="text-sm text-secondary">Secure access to PACTUM. Organization permissions are configured separately.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">Email<input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1 block w-full rounded border border-smoke bg-transparent p-3" /></label>
        <label className="block text-sm">Password<input name="password" type="password" required minLength={registration ? 12 : 1} maxLength={128} autoComplete={registration ? "new-password" : "current-password"} className="mt-1 block w-full rounded border border-smoke bg-transparent p-3" /></label>
        {registration && <p className="text-xs text-secondary">Use 12–128 characters. Email confirmation is required.</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <button disabled={busy} className="w-full rounded bg-ember-orange p-3 text-white font-medium disabled:opacity-50">{busy ? "Please wait…" : registration ? "Register" : "Sign in"}</button>
      </form>
      <Link href={registration ? "/login" : "/register"} className="block text-sm underline">{registration ? "Already registered? Sign in" : "Create an account"}</Link>
    </section>
  </main>;
}
