import Link from "next/link";
export default function ConfirmationPage() {
  return (
    <main className="min-h-screen bg-page-bg text-text-primary flex items-center justify-center p-6">
      <section className="max-w-md space-y-5 rounded-[6px] border border-border-primary bg-surface-primary p-8">
        <p className="font-mono text-ember-orange font-semibold tracking-widest">PACTUM</p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Email confirmation</h1>
        <p className="text-xs text-text-secondary leading-relaxed">
          Continue to your account to check your verified session. If you have not confirmed your email, open the link sent to your inbox in the browser used to register.
        </p>
        <div className="pt-2 space-y-2">
          <Link className="block text-sm text-ember-orange hover:underline font-medium" href="/account">
            Continue to account &rarr;
          </Link>
          <Link className="block text-sm text-text-secondary hover:text-text-primary underline" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
