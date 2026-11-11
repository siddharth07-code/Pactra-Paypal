# Production organization-access repair

## Confirmed failure

An authenticated refresh on 12 November 2026 produced HTTP 200 from `/account` and `/api/auth/session`, but HTTP 503 from `/api/organizations`.

Sanitized Vercel traces established this sequence:

1. Redis authenticated and completed the rate-limit check on verified TLS port 6379 in `bom1`.
2. Supabase Auth verified the user and JWT claims against `telhivuqsrsaesjkkxuh.supabase.co`. The configured origin was `https://pactra-eight.vercel.app`; the publishable key was accepted by the provider. No credential value was logged.
3. Organization handling reached restricted database access using `pactum_app`, the intended Supabase transaction pooler on 6543, `schema=pactum`, `pgbouncer=true`, strict TLS, and the packaged CA.
4. The database role preflight failed with `PrismaClientInitializationError`, classified as **ENGINE_NOT_FOUND**. The Prisma query engine could not be resolved in the deployed runtime. This occurred before database authorization or membership lookup could complete.

The original database preflight ran outside its database error handler. Its unclassified exception fell through the generic authentication error response, producing the misleading `AUTH_PROVIDER_UNAVAILABLE` code. This was not an observed Supabase Auth outage, incorrect Auth key, or RLS denial.

## Permanent correction

- Prisma generates both the local native engine and `rhel-openssl-3.0.x` for the current Vercel Linux runtime. Only generator configuration changed; database models and migrations are unchanged.
- Next file tracing explicitly includes the Linux engine alongside the existing public Supabase CA.
- The Vercel database factory resolves the packaged engine through Prisma's supported `PRISMA_QUERY_ENGINE_LIBRARY` setting before constructing the client, avoiding custom-output build-directory search failures. It fails closed with `DATABASE_ENGINE_MISSING` if the required artifact is absent.
- `npm run build` now checks actual route traces for the Linux engine and CA. A deployment with missing database artifacts cannot pass that build check.
- Database preflight exceptions are classified as `DATABASE_UNAVAILABLE`. Unsafe roles still fail authorization, and tenant transactions do not run after failed preflight.
- Sanitized Auth/database diagnostics record only fixed endpoint categories, stages, protocol/error codes, and public connection metadata. Provider bodies, query contents, passwords, tokens, cookies, and complete connection URLs remain excluded.

[Prisma's serverless deployment documentation](https://docs.prisma.io/docs/orm/v6/prisma-client/deployment/serverless/deploy-to-aws-lambda) describes supplying the compatible Linux engine. [Vercel's file-tracing documentation](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions) describes including runtime artifacts.

## Validation

- Application tests: 1,451 passed; two opt-in PayPal Sandbox tests skipped.
- Disposable local PostgreSQL database/security tests: 44 passed.
- TypeScript and lint: passed.
- Production build: passed, including Linux Prisma engine and public CA verification in 34 database route traces.
- Local production API smoke: passed with disposable PostgreSQL, authenticated TLS Redis, and a local Auth fixture. This covers secure-cookie login, zero/one/multiple organizations, OWNER creation, tenant denial, sourcing persistence, negotiation SSE, persisted evidence and FX-lock recovery, worker authorization, unsigned webhook denial, and logout/login persistence.
- Regression tests specifically cover missing engine initialization, failed database preflight, unsafe-role denial, safe SQLSTATE diagnostics, and transport-error sanitization.

## Live verification

Use the existing authenticated account to refresh Account & Workspace after deployment, then inspect only the existing PACTRA project:

```sh
cd ~/Desktop/Pactra-Paypal
npx vercel inspect https://pactra-eight.vercel.app --scope siddharth-lal-s-projects
npx vercel logs requests --environment production --scope siddharth-lal-s-projects --since 1m --json
npx vercel logs --environment production --scope siddharth-lal-s-projects --since 1m --json
```

Authenticated `/api/auth/session` and `/api/organizations` should return 200. An empty authorized organization list is valid for a new user; creation still requires the normal OWNER onboarding flow. A logged-out request should return 401. Verify any existing workspace and organization selection through the UI; do not infer memberships from an HTTP status alone.

Production session cookies and credentials were not extracted. Browser access was declined, so the authenticated production request must be triggered by the user. The final handoff reports the actual post-deployment responses available from Vercel logs.

No hosted database migration, role change, reset, payment, or financial-record modification is part of this repair. RBAC, forced RLS, live Auth-session validation, tenant checks, strict TLS, and fail-closed Redis protection remain in place. Production payments, webhook events, and reconciliation writes are not exercised by the read-only health investigation.
