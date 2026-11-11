# PACTRA Supabase cutover runbook

The operator executes all hosted changes. The operator has completed hosted bootstrap; this execution verified all six restricted roles read-only. Hosted migrations and Vercel deployment remain unexecuted. TLS and recovery were verified locally on `main`; no hosted data/role changes, commits, or pushes were made by this execution. The target is Supabase project `telhivuqsrsaesjkkxuh`, database `postgres`, application schema `pactum`.

## Prepared files and prerequisites

Run from a new terminal in the repository:

```bash
cd ~/Desktop/Pactra-Paypal
OPERATOR_DIR="$HOME/.local/share/pactra/cutover/2026-11-11T17-04-01.655Z"
ROLE_DIR="$HOME/.local/share/pactra/database-credentials/85d2b2a26fc77f96"
BACKUP_DIR="$HOME/.local/share/pactra/backups/telhivuqsrsaesjkkxuh/2026-11-11T20-24-47.707Z"
```

These are actual prepared paths on this Mac. Files are owner-only and outside Git. Do not display, paste into chat, or commit their contents.

- `$OPERATOR_DIR/bootstrap.env`: the existing administrator Session Pooler credential, expected project pin, trusted absolute CA path, deployment baseline path, and verified-backup baseline path. For operator tools only.
- `$ROLE_DIR/credentials.json`: generated role passwords and target identity. Preserve it for idempotent retries. These credentials now authenticate the provisioned Supabase roles; do not regenerate them or rotate passwords during cutover.
- `$ROLE_DIR/migration.env`: both `DATABASE_URL` and `DIRECT_URL` identify the restricted migrator through the Session Pooler on 5432. Operator only.
- `$ROLE_DIR/runtime.env`: `DATABASE_URL` for `pactum_app` and `WORKER_DATABASE_URL` for `pactum_jobs` through the Transaction Pooler on 6543.
- `$OPERATOR_DIR/application.env`: runtime URLs, existing provider credentials, and a newly generated cron secret, without elevated or local-development database credentials. Only three external fields remain empty: `APP_ORIGIN`, `PAYPAL_WEBHOOK_ID`, and `REDIS_URL`.
- `$BACKUP_DIR`: the refreshed authenticated encrypted database/role/configuration backup, including current Auth records and resolved database-role settings. The earlier verified bundle at `~/Desktop/2026-11-11T11-40-33.502Z` remains byte-identical. Its key remains separately protected at the location recorded in `summary.json`.

Use Node 26, the installed locked dependencies, and the reviewed working tree. No automatic commit or push has been made. If deploying through Git, personally publish the reviewed source first; if using the Vercel CLI, deploy this working tree with the included `.vercelignore`.


## Confirmed TLS diagnosis and current recovery state (12 November 2026)

`~/Desktop/Pactum-Paypal` is a symlink to this repository. Both names refer to the same `main` checkout.

The pooler presents a valid `*.pooler.supabase.com` certificate (12 March 2025–11 March 2030), via Supabase Intermediate 2021 CA to the packaged Supabase Root 2021 CA (expires 26 April 2031). Root SHA-256 fingerprint: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`. OpenSSL verifies its chain and actual hostname. An unrelated hostname is rejected. The PEM CA was neither missing nor expired.

Prisma 6.19.3's native macOS engine returns P1011 even with an absolute `sslcert` path; `sslrootcert` and using the intermediate alone do not fix it. macOS `security verify-cert` also reports `CSSMERR_TP_CERT_SUSPENDED`. This establishes a macOS native trust-evaluation failure, not an incorrect endpoint/path; it does not establish a public revocation finding. The same version's Linux/OpenSSL engine connects with `sslmode=require&sslaccept=strict` and the same CA and reports all five migrations pending. No trust-store edits or verification bypasses are needed. Keep the single published root certificate; concatenating PEM certificates is not a portable fix for this Prisma native TLS loader.

The permanent macOS command is `scripts/database/hosted-prisma.mjs`; it invokes the installed Prisma CLI using the matching Linux schema engine. `migrate status` intentionally exits **1** when unapplied migrations are present; listing the five pending names without P1011 demonstrates successful connectivity. Never respond to this exit status with `migrate dev`, reset, or `db push` on Supabase. On Linux, the runner uses the normal installed engine. The Vercel runtime uses its Linux query engine and the packaged public CA; both restricted runtime/worker logins have also been queried with that engine over strict TLS.

The prior backup still passes AES-GCM/SHA-256 verification but no longer matched current Auth records. It is preserved. The refreshed backup at `$BACKUP_DIR` was restored to an isolated Supabase container: all **41 table counts and content digests** match; all five migrations applied, post-migration security verification passed, and existing contents were unchanged. Evidence is in:

```text
$BACKUP_DIR/rehearsals/final-2026-11-11T20-29-59.261Z/patched-corrected/recovery-summary.json
```

Its separate key is `~/.config/pactra-backup/keys/2026-11-11T20-24-47.707Z.key`. `bootstrap.env` now points to that rehearsal's restored baseline and the new, not-yet-created `$OPERATOR_DIR/cutover-baseline-tls-2026-11-12.json`. The final read-only hosted comparison matched the refreshed snapshot. Freeze application/Auth writers before running section 2 and keep them stopped through post-migration verification. If records change again, the guard must stop deployment; do not overwrite the baseline or bypass the guard. Retain the backup and key independently as described below.

The refreshed bundle preserves its original recovery instructions and includes `rehearse-post-bootstrap.cjs`, the tested rehearsal helper for snapshots containing the completed bootstrap. Its generated passwords and role changes apply only to the disposable restoration, never to Supabase. The original two backup bundles remain untouched.

## 1. Complete external dashboard configuration

These actions require the operator's accounts. Do not substitute invented values.

1. Vercel: choose the project and final canonical HTTPS domain. Put that exact origin, without a path or trailing slash, in `APP_ORIGIN` in the private `application.env`. Select Node 26 and Next.js, install with `npm ci`, build with `npm run build`, and use the normal Next.js output settings. Use a runtime/plan supporting the configured 300-second negotiation and reconciliation functions.
2. Supabase: verify the project reference above. In Data API settings, keep `pactum` out of exposed schemas. Keep email confirmation enabled; it was confirmed enabled by the read-only Auth settings probe. Configure production SMTP and the Site URL. Allow the exact `<APP_ORIGIN>/auth/callback` and `<APP_ORIGIN>/auth/recovery` redirect URLs. Preserve the provider's PKCE confirmation links in registration/recovery email templates. Recovery links must open in the requesting browser.
3. PayPal Developer Dashboard: open the **Sandbox REST app matching the prepared client credentials**. Verify the prepared merchant ID belongs to its Sandbox business account. Register `<APP_ORIGIN>/api/paypal/webhook`. Select `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `INVOICING.INVOICE.PAID`, and `CUSTOMER.DISPUTE.CREATED` from the available subscriptions. The handler also accepts the declined variant if PayPal lists it. Copy the registered webhook's ID into `PAYPAL_WEBHOOK_ID` in `application.env`. Read-only inspection found zero registered webhooks for this app.
4. Create/select a shared Redis service reachable from Vercel and place its Redis TCP/TLS connection URL in `REDIS_URL`. Use `rediss://` for a public cloud endpoint. This backend uses ioredis; a provider's HTTP/REST URL or REST token is not interchangeable. `RATE_LIMIT_BACKEND=redis` and fail-closed behavior are already prepared. Configure trusted ingress/proxy settings for Vercel only.
5. Secure an independent encrypted recovery copy of the entire backup directory and a separately protected copy of its key. They are currently on this Mac; no independent copy was made by the agent. Supabase managed backup/PITR settings require dashboard access and must be checked by the operator. A baseline digest file is not a backup.

Edit the private file using a local editor, then check its format without making network requests or printing secrets:

```bash
node --conditions=react-server --import tsx \
  --env-file="$OPERATOR_DIR/application.env" \
  scripts/database/check-production.mjs
```

Require `valid: true`. The checker validates production requirements, separate restricted role identities, project pin, pooler ports, strict TLS parameters, forbidden administrator/development variables, and the packaged CA. It does not authenticate Redis or verify a newly registered webhook remotely; use the provider dashboards and post-deployment checks below.

## 2. Freeze writes and confirm recovery

Stop application traffic, scheduled jobs, payment initiation, and other development apps/browser sessions or automation using this project’s Auth; prevent concurrent user/Auth writes during the baseline/migration verification window. Retain original legacy JSON/evidence files securely. Never infer historical organization ownership from user registration order or automatically activate legacy financial records.

```bash
node "$BACKUP_DIR/recover.cjs" verify
node --env-file="$OPERATOR_DIR/bootstrap.env" scripts/database/provision-roles.mjs
node --env-file="$OPERATOR_DIR/bootstrap.env" scripts/database/verify-deployment.mjs --before
```

The preflight is read-only. It verifies PostgreSQL 16+ compatibility, expected Supabase administrator/project, CREATEROLE, schema ownership/creation prerequisites, and pre-existing SELECT/REFERENCES privileges on the required Auth columns. It rejects unexpected role attributes and membership options. Do not grant custom roles access to Supabase-owned Auth tables to work around a failure.

`--before` uses a read-only repeatable-read transaction. It compares current record counts/content digests with the verified restored backup, then writes `$OPERATOR_DIR/cutover-baseline.json` with mode 0600. Preparation detected a real Auth sign-in/refresh after the first comparison and created/rehearsed the refreshed backup above. Its 41 table counts and content digests match the restored snapshot. If more data has changed, stop the remaining writers and obtain a fresh recoverable backup before proceeding. The existing backup's `RESTORE.md` contains the tested restoration procedure. Supabase Dashboard backups/PITR are the supported hosted recovery mechanism. Do not overwrite a failed or stale cutover baseline blindly; preserve it, re-establish recovery, and choose a new baseline path in the private operator file.

If the backup guard reports further drift **before bootstrap**, refresh using the already implemented tools after stopping the writers:

```bash
node --env-file="$OPERATOR_DIR/bootstrap.env" scripts/database/backup.cjs
# Set BACKUP_DIR to the new private directory printed by that command.
node "$BACKUP_DIR/recover.cjs" verify
PACTRA_BACKUP_DIRECTORY="$BACKUP_DIR" node "$BACKUP_DIR/rehearse-post-bootstrap.cjs"
```

Require `fullRestorePassed: true`, matching counts/content digests, all five migrations, and passing security/operator verification in the printed rehearsal directory. Set `VERIFIED_BACKUP_BASELINE_FILE` in the private `bootstrap.env` to that directory's `restored-baseline.json`, secure independent copies of the new bundle/key, and rerun the preflight/`--before` commands. These tools take a consistent read-only exported snapshot and restore only to a disposable local container. They never bootstrap/migrate hosted Supabase. Do not use the initial-cutover replay to repair an already partially migrated hosted schema.

The baseline file is created exclusively, so a repeated `--before` will stop if it already exists. After successful bootstrap/migrations, do not recapture the initial-cutover baseline. Verify with `--after` instead.

## 3. Bootstrap is complete — do not provision again

All six roles and the Auth adapters have already been provisioned by the operator and verified read-only. Skip hosted `--apply`; proceed to migration status/deployment after the frozen-write backup guard passes.

This transaction creates the six PACTRA roles, schema ownership, three fixed Auth adapters, grants, and new login passwords. It does not deploy migrations or change existing records or Supabase-owned Auth tables.

- `pactum_app` inherits only the NOLOGIN `pactum_runtime` capability.
- `pactum_jobs` inherits only the NOLOGIN `pactum_worker` capability.
- `pactum_migrator` owns `pactum`, inherits/sets `pactum_policy_reader`, and has no role ADMIN option.
- All six roles are NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE. The three capability roles are NOLOGIN.
- The administrator-owned, SECURITY DEFINER Auth adapters return only the verified transaction context's active-session boolean/email. A fixed no-argument adapter installs and validates the identity FK. They pin `search_path=pg_catalog`, qualify relations, and revoke PUBLIC execution. Application/policy roles receive no direct Auth schema privileges.
- Role names are explicitly identifier-quoted; no grant uses PostgreSQL's problematic `TO CURRENT_USER` role specification.

Retries reuse the existing private registry, authenticate already-provisioned logins, and do not rotate their passwords. Unknown logins, mismatched passwords, unsafe memberships, wrong owners, or insecure/symlink credential paths stop execution. Files are written atomically with mode 0600 under mode-0700 directories. `--prepare` generates local credential files without executing database changes; it has already been completed for this target. Do not regenerate/remove the registry between preparation and provisioning.

If a process is killed and leaves `provision.lock` in `ROLE_DIR`, first establish that no provisioning process is running. Only then remove that stale local lock and retry the same command. Do not delete the registry or reset database roles.

## 4. Apply the five pending Prisma migrations

Use the restricted migration environment; never inject it into Vercel. Start the trusted local Docker daemon on macOS. The runner downloads the matching Prisma engine with checksum verification and runs only that engine in a pinned Linux container, with read-only mounts of the public Prisma files and engine cache. It never starts a database server. The `migrate deploy` line below is a hosted write reserved for the user; it was not executed during preparation:

```bash
export EXPECTED_SUPABASE_PROJECT_REF=telhivuqsrsaesjkkxuh
```

```bash
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs validate
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs migrate status
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs migrate deploy
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs migrate status
node --env-file="$OPERATOR_DIR/bootstrap.env" scripts/database/verify-deployment.mjs --after
```

The first status must show exactly these five pending migrations; Prisma exits nonzero for pending migrations, which is expected **only before deploy**:

1. `202611060001_tenant_core`
2. `202611060002_security`
3. `202611060003_operation_integrity`
4. `202611070004_worker_claims`
5. `202611070005_provider_bindings`

Stop on any unexpected history, failed migration, or changed checksum. After deployment, require zero pending/failed migrations and `verified: true` from the read-only verifier. It checks all existing baseline records, five migration names/checksums, six role configurations, membership options, 16 forced-RLS tables, 62 policies, helper ownership/search paths/PUBLIC access, 52 valid indexes, all named migration constraints, restricted login authentication, direct Auth denial, and unscoped tenant-data denial. Local tests additionally exercised legitimate and cross-tenant operations using real restricted roles.

The intentional `User.authId` FK references `auth.users`. Prisma generic schema diff reports P4002 for that cross-schema reference because Auth is outside the application datasource. Do not remove the FK or change `pactum` to silence the diff. Prisma validate, deploy/status, catalog comparisons, and security checks are the applicable verification.

## 5. Import application configuration and deploy personally

Import **only** `$OPERATOR_DIR/application.env` into the intended Vercel project/environment using its Environment Variables UI. Do not import every private `.env` file or the repository's development `.env.local`. Provider/database/cron secrets remain server-only; never use NEXT_PUBLIC names for them. Limit these secrets to the intended production environment; do not reuse them for preview deployments.

Connection requirements are already encoded in the prepared files:

- Runtime and worker: separate `pactum_app.<project-ref>` / `pactum_jobs.<project-ref>` logins, actual Session Pooler hostname with transaction port **6543**, database `postgres`, `schema=pactum`, `pgbouncer=true`, `connection_limit=1` per client, and strict TLS.
- Migrator: `pactum_migrator.<project-ref>`, Session Pooler **5432**, no `pgbouncer=true`, same database/schema and strict TLS. Both Prisma datasource variables point here in the operator process.
- TLS: `sslmode=require&sslaccept=strict&sslcert=certs/supabase-ca.cer`. Prisma 6 CLI resolves the certificate relative to the `prisma/` directory. The migration runner resolves it to an absolute packaged path before launching the engine. Runtime and worker clients resolve the same portable URL value against `process.cwd()/prisma` at application startup, so Vercel never receives a Mac filesystem path. The public CA is packaged and traced into all serverless bundles; operator pg tools use the absolute `DATABASE_CA_FILE` from `bootstrap.env`. Do not paste the old Mac backup path into Vercel URLs or disable certificate verification.

Keep `DIRECT_URL`, `MIGRATION_DATABASE_URL`, `BOOTSTRAP_DATABASE_URL`, `LOCAL_AUTH_DATABASE_URL`, and `LOCAL_IDENTITY_PROJECTION` absent from Vercel. Keep the optional legacy `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unset; it has no implemented server verification endpoint. Supabase Auth is server-mediated and needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, not a service-role key.

`GEMINI_API_KEY` and optional `GEMINI_MODEL` are server configuration; the default model is `gemini-2.5-flash`. Match quotas to the actual Google project. PayPal remains Sandbox exclusively. Sourcing without a Channel3 key is visibly labelled fixture data. FX defaults to labelled deterministic reference data; select `FX_PROVIDER=LIVE_PROVIDER` with its real API key only if live FX references are required.

Build with `npm run build`. It generates Prisma Client on Vercel's platform and requires no migration credentials. The production traces include the native engine and public CA, and exclude local `.env` files and legacy financial JSON. `.vercelignore` also excludes these files from CLI uploads. Deploy the reviewed source personally through your selected Vercel workflow. For CLI deployment, personally run `npx vercel link` to select the intended project, then `npx vercel --prod` after configuring its environment. No agent command has deployed it.

## 6. Verify the personal deployment before reopening traffic

1. Confirm startup has no configuration errors and the intended restricted database logins are in use. Repeat the configuration checker against the exact imported application environment.
2. Register/confirm a test account using the real SMTP flow. Test login, expired/revoked sessions, logout, password recovery in the requesting browser, and cookie flags. Use two controlled organizations and verify each can access its own workspace and cannot read the other's sessions. Do not assign existing records to a test organization.
3. Exercise sourcing, negotiation completion, Merkle evidence, ACWORLD audit, and Sandbox settlement with controlled test accounts. The two opt-in live payment tests were not run automatically; complete a real Sandbox approval/capture flow personally. Never run the destructive database test harness against Supabase.
4. Verify the real registered PayPal webhook is delivered to `/api/paypal/webhook`, signature-verified, tenant-bound, and duplicate-safe. Unsigned events must be denied. Unknown verified events are quarantined with HTTP 202 and are not treated as completed business processing. Simulator events alone do not prove a bound real-payment workflow.
5. Vercel Cron calls authenticated `GET /api/cron/reconcile` daily at 03:00 UTC using `CRON_SECRET`. Inspect the function logs for successful authenticated runs. Unauthenticated requests must return 401. Reconciliation reads PayPal outcomes and commits fenced database updates; it never creates, authorizes, or captures a payment. Monitor unresolved financial operations between runs and investigate unknown outcomes manually.
6. Verify Redis connectivity/fail-closed behavior and inspect desktop/mobile loading/error states with the actual deployment. These are operator acceptance checks using external infrastructure; no further development stage is prescribed.

`/api/cron/cleanup` intentionally returns 503 in database mode. Do not enable the legacy deletion coordinator. Unresolved idempotency/financial records must not be removed to force retries, and quarantined events must not be automatically replayed.

## Failure handling and rollback

Keep traffic stopped if bootstrap, migration, baseline comparison, or security verification fails. Preserve logs and the private credential registry. Bootstrap is transactional and retry-safe. Prisma SQL migrations can leave partially applied DDL on statement failure; do not mark a failed migration resolved or retry deployment blindly. Compare the precise failed statement/history with the verified rehearsal and use the documented Supabase restore/PITR operation if recovery is required. Never reset, db push, delete migration history, drop roles/schemas, or run improvised rollback SQL.

For application rollback, stop workers/payment initiation and select the previous **database-compatible** Vercel deployment. Leave the database and records intact. Do not route to unauthenticated legacy APIs or restore stale JSON financial state. After any external PayPal operation, reconcile provider outcomes before restoring/replaying database state. A pre-cutover backup cannot recover writes made after its snapshot; preserve the current state and use PITR where configured.

The selected `$BACKUP_DIR/RESTORE.md` remains authoritative for the tested logical restore, including role definitions without passwords and the two-step `ensure_rls` event-trigger ownership handling. Database-specific role settings are resolved by role/database name and their restored values were checked. On another recovery machine, place the separately copied key at the recorded path or change only `summary.json`’s `keyPath` to its protected new location before running `recover.cjs verify`. Do not edit encrypted payloads. The restore was rehearsed on an isolated Supabase image, not executed against hosted Supabase. Hosted managed schemas and Auth ownership must be restored through supported Supabase recovery controls; never replay a full superuser dump blindly into an active project.

## Local validation and evidence

```bash
npm run test:database
npm test
npm run typecheck
npm run lint
npm run build
npm run test:local-api
```

The database harness creates only disposable loopback PostgreSQL, exercises preparation/provisioning and failure guards, deploys all five migrations through the restricted migrator, tests the before/after verifier, and runs RLS/integration tests. The API smoke uses a production Next.js server, disposable PostgreSQL, a local TLS Auth provider, and fixture sourcing/Gemini fallback. It exercises real HTTP authentication, organization isolation, sourcing persistence, negotiation SSE, cron, webhook rejection, and logout without hosted service calls. It generates no video or browser automation.

See [DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md) for the final validation results and exact remaining dashboard values. References: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma 6 TLS](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql), [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and [PayPal webhook management](https://developer.paypal.com/api/webhooks/v1), and [Vercel CLI deployment](https://vercel.com/docs/cli/deploy).
