"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Password update failed. Open a new recovery link and try again.");
      setPassword(""); setConfirmation(""); setComplete(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Password update is unavailable. Please retry.");
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
      <section className="w-full max-w-md space-y-5 rounded-[6px] border border-border-primary bg-surface-primary p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        {complete ? <><p role="status">Your password has been updated.</p><Link href="/account" className="text-ember-orange underline">Continue to account</Link></> : (
          <form onSubmit={submit} aria-busy={saving} className="space-y-4">
            <p className="text-sm text-text-secondary">Open the recovery link in the browser where you requested it, then choose a password with 12–128 characters.</p>
            <label className="block text-sm">New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 block min-h-11 w-full rounded-[6px] border border-border-primary bg-surface-secondary p-3 focus-visible:outline-2 focus-visible:outline-ember-orange" /></label>
            <label className="block text-sm">Confirm password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 block min-h-11 w-full rounded-[6px] border border-border-primary bg-surface-secondary p-3 focus-visible:outline-2 focus-visible:outline-ember-orange" /></label>
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button type="submit" disabled={saving} className="min-h-11 rounded-[6px] bg-ember-orange px-4 py-2 text-white cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-orange">{saving ? "Updating…" : "Update password"}</button>
            <Link href="/login" className="block text-sm underline">Return to sign in</Link>
          </form>
        )}
      </section>
    </main>
  );
}
