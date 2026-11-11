# PACTRA deployment readiness

Verified locally on 11 November 2026 on `main`. No deployment, hosted migration, hosted role change, or hosted secret configuration was performed. No commits or pushes were made.

## Phase 1 — Backend finalization

The encrypted backup authenticated successfully. Its full restoration into isolated `supabase/postgres:17.6.1.152` matched all 41 existing table counts. All five migrations deployed through the restricted migrator, preserved existing record contents, and passed 39 security tests against the restored Supabase image. The separate disposable PostgreSQL harness passed all 44 database tests. The image runs PostgreSQL 17.6; the backup records hosted 17.11, so this is a compatible rehearsal rather than an exact hosted-version reproduction.

Rehearsed migrations:

- `202611060001_tenant_core`
- `202611060002_security`
- `202611060003_operation_integrity`
- `202611070004_worker_claims`
- `202611070005_provider_bindings`

Catalog verification found 16 FORCE RLS tables, 62 policies, 52 valid indexes, and 51 validated constraints. All 220 Prisma columns, six enums, 49 modelled indexes, and 32 modelled constraints were present. Extra indexes and constraints implement SQL security/integrity requirements. Prisma's generic schema diff cannot model the intentional cross-schema foreign key to `auth.users`; preserve that foreign key and use catalog checks.

All six PACTRA roles lacked SUPERUSER, BYPASSRLS, CREATEDB, and CREATEROLE. Runtime and worker capabilities remain separate. Neither runtime nor policy-reader roles receive direct access to Supabase Auth tables. Fixed administrator-owned SECURITY DEFINER adapters verify the current session/email with pinned search paths and revoked PUBLIC execution. Restricted policy helpers and worker lease fences passed cross-organization and cross-session denial tests. Supabase-owned platform roles retain their required provider privileges.

The rehearsal summary is stored privately at:

`~/.local/share/pactra/rbac-rehearsals/2026-11-11T12-37-09.155Z/final-2026-11-11T15-01-02.946Z/patched-corrected/recovery-summary.json`

Backup and original recovery instructions remain at:

`~/.local/share/pactra/backups/telhivuqsrsaesjkkxuh/2026-11-11T11-40-33.502Z/RESTORE.md`

The key is stored separately as specified there. No plaintext backup or key is in the repository. Both copies currently reside on this Mac; the operator must arrange secure independent storage and a fresh backup immediately before hosted changes.

Live Gemini generation and PayPal Sandbox OAuth returned HTTP 200. Routine tests cover negotiation fallbacks/deadlines, Merkle tampering, ACWORLD invariants, authentication, settlement, capture recovery, and signed-webhook rejection using mocked provider responses. The two opt-in live PayPal order/payment tests remain skipped. No live purchase, authorization, capture, or hosted Auth mutation was performed.

Operator checklist, to execute personally:

- [ ] Verify the intended Supabase project is `telhivuqsrsaesjkkxuh`, inspect current migration history, and confirm all five migrations are still unapplied. Stop on unexpected drift or previously applied checksums.
- [ ] Refresh the backup, authenticate it, rehearse restoration, and secure an independent copy of the archive and separately protected key. Follow the original recovery instructions; restoration into an active database requires write suspension and provider-outcome reconciliation.
- [ ] Review [DATABASE_CUTOVER.md](DATABASE_CUTOVER.md), `scripts/database/bootstrap.sql`, and the five migrations. Keep `pactum` private and absent from Supabase Data API exposed schemas. Do not grant custom roles direct access to `auth`.
- [ ] Place bootstrap credentials and `DATABASE_CA_FILE` only in a private operator environment. Run `node --env-file=/secure/bootstrap.env scripts/database/provision-roles.mjs` for preflight. Once reviewed, run it with `--apply` personally to create the restricted roles/adapters and private credential files. Existing unrecognized role credentials or unexpected privileges must stop this process.
- [ ] Use the generated `migration.env` only in an operator process. Its `DATABASE_URL` and `DIRECT_URL` must both identify `pactum_migrator.<project-ref>` on the project's Session Pooler, port 5432, database `postgres`, `schema=pactum`, with verified TLS. Run `node --env-file=/secure/migration.env node_modules/prisma/build/index.js migrate status`, then `migrate deploy`, then `migrate status`. Never run reset, db push, or automatic rollback SQL.
- [ ] Verify role memberships, adapter ownership/search paths, Auth access denial, FORCE RLS/policies, indexes/constraints, and two-organization access denial on the intended environment before accepting traffic. Rehearsal evidence does not replace this hosted verification.

## Phase 2 — Frontend and production readiness

Changes made in this finalization:

- `npm run build` now generates Prisma Client before Next.js. Generation also passed with both datasource variables absent, so the Vercel build does not require migration credentials.
- Vercel's existing daily 03:00 UTC schedule invokes authenticated `GET /api/cron/reconcile`. The retention-deletion endpoint remains disabled. Reconciliation only reads PayPal outcomes and uses fenced database writes; it never reissues payments. Negotiation and reconciliation routes request a 300-second function budget.
- Production startup rejects missing/unsafe runtime or worker database URLs, missing webhook/merchant IDs, and the development identity-projection flag. Existing transaction-time catalog guards still enforce actual role privileges.
- Sign-out failures now show an error and allow retry. Organization creation/invitation forms expose saving state, prevent repeat submission, retain input after failure, and allow inputs to shrink on narrow screens. Failed organization switches restore the previously authorized workspace.
- Password recovery now uses server-mediated PKCE, HttpOnly cookies, same-origin/rate-limited endpoints, a fixed recovery callback, and a password completion form. Password updates require provider-verified identity and accept no target user identifier. Unknown-address responses are generic. No browser Supabase configuration is required for these auth workflows.
- The public Supabase CA is included as `prisma/certs/supabase-ca.cer` and explicitly traced into serverless bundles. It is a public trust certificate, not a credential.

Operator configuration checklist:

- [ ] Set server-only `DATABASE_URL` to `pactum_app.<project-ref>` and `WORKER_DATABASE_URL` to `pactum_jobs.<project-ref>` using the project's Transaction Pooler on 6543, database `postgres`, `schema=pactum`, and `pgbouncer=true`. Preserve URL-encoded passwords. Use `sslmode=require`, `sslaccept=strict`, and `sslcert=certs/supabase-ca.cer`. Prisma resolves this certificate relative to `prisma/`. Verify the certificate remains the trusted CA for the intended endpoint. Start with `connection_limit=1` per client and size the aggregate pool for expected function concurrency.
- [ ] Keep `DIRECT_URL`, `MIGRATION_DATABASE_URL`, bootstrap/admin credentials, `LOCAL_AUTH_DATABASE_URL`, and `LOCAL_IDENTITY_PROJECTION` out of the Vercel application environment. Local `.env.local` contains development-only settings and must not be imported wholesale.
- [ ] Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and canonical HTTPS `APP_ORIGIN`. Enable email confirmation, configure SMTP, and allow the exact `<APP_ORIGIN>/auth/callback` and `<APP_ORIGIN>/auth/recovery` redirect URLs. Registration and recovery emails must retain the provider PKCE confirmation link. Complete both flows in the requesting browser. Test expired links and revoked sessions.
- [ ] Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`, and `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`. Configure a Sandbox webhook at `<APP_ORIGIN>/api/paypal/webhook` and supply its `PAYPAL_WEBHOOK_ID`. This identifier was absent during verification. Subscribe to the supported capture-completed, capture-denied/declined, invoice-paid, and dispute-created events. Test actual provider delivery, valid signatures, duplicate delivery, and tenant binding after personal deployment.
- [ ] Set `GEMINI_API_KEY` and optional `GEMINI_MODEL` (default `gemini-2.5-flash`). Match concurrency/rate settings to actual project quotas. Configure `CHANNEL3_API_KEY` if using live sourcing. FX defaults to explicitly labelled deterministic reference data; choose `FX_PROVIDER=LIVE_PROVIDER` and supply `EXCHANGE_RATE_API_KEY` if live reference rates are required.
- [ ] Set a strong `CRON_SECRET`. For multiple Vercel instances, configure the supported shared Redis backend with `RATE_LIMIT_BACKEND=redis`, `REDIS_URL`, and fail-closed behavior. Configure proxy trust only for the trusted platform ingress. Leave `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unset: its optional legacy client verification path has no implemented server endpoint and is not a production CAPTCHA integration.
- [ ] Use `npm run build` as the build command. Confirm the selected Vercel runtime/plan accepts the 300-second route budget and includes Prisma's platform-specific engine and the CA certificate. The local build traced both engine and CA; Vercel/Linux execution remains an operator check. Daily reconciliation is the configured cadence; monitor and manually investigate unresolved financial operations promptly.
- [ ] Run `npm run test:database`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` before publishing the reviewed tree. Database tests create disposable local databases and must never receive Supabase test targets.
- [ ] Personally verify desktop, tablet, and mobile layouts; keyboard navigation; loading/error states; registration, recovery, login/logout; organization switching; sourcing/negotiation; evidence/audit; and Sandbox settlement. Browser automation was denied permission to open the isolated local app, so visual/responsive and browser-to-HTTP end-to-end verification remain uncompleted. Component/API/SDK/database tests do not establish those results.

Release status: local migration, automated security, application, type, lint, and build checks pass. This is not full production certification. Remaining gates are browser verification, hosted schema/privilege checks after personal migration, real Auth email delivery, live Sandbox webhook/payment completion, shared infrastructure configuration, and fresh/off-device recovery readiness. Quarantined legacy/provider events still require reviewed manual reconciliation; do not enable automatic replay or retention deletion.

Final automated results: 1,386 application tests passed, two live PayPal payment tests skipped; 44 disposable PostgreSQL tests passed; 39 additional security tests passed on the restored Supabase image. TypeScript, ESLint, production build, and whitespace checks passed. Browser layout verification was blocked by the browser permission gate, and was not replaced with another browser or network workaround.

References: [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords), [Vercel Cron authorization](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs), and [Prisma 6 PostgreSQL TLS parameters](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql).
