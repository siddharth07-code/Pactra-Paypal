import Link from "next/link";
export default function ConfirmationPage() {
  return <main className="min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
    <section className="max-w-md space-y-5 rounded-xl border border-smoke p-8">
      <p className="font-mono text-ember-orange">PACTUM</p><h1 className="text-2xl font-semibold">Email confirmation</h1>
      <p>Continue to your account to check your verified session. If you have not confirmed your email, open the link sent to your inbox in the browser used to register.</p>
      <Link className="block underline" href="/account">Continue to account</Link><Link className="block underline" href="/login">Sign in</Link>
    </section>
  </main>;
}
