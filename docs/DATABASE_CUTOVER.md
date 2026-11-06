# PACTUM database cutover

These changes are uncommitted and require review. They do not establish production readiness.

## Credentials and capability roles

Use a dedicated schema migration login for reviewed deployment of `prisma/migrations` through Prisma. Never pass this login to the Next.js runtime. The migrations create NOLOGIN capabilities `pactum_runtime`, `pactum_worker`, and the narrow policy predicate owner `pactum_policy_reader`. Provision separate LOGIN identities manually with generated secrets using your database administration system; grant runtime/worker membership respectively and CONNECT only to the application database. Do not grant either login ownership, CREATE, CREATEROLE, CREATEDB, superuser, or BYPASSRLS. Runtime transactions reject unsafe role configuration. No credentials are included here.

Migrations reference Supabase-owned `auth.users(id,email,deleted_at)` and `auth.sessions(id,user_id,not_after)`. Verify these columns and required narrow SELECT grants on the target Supabase project before applying. Supabase may restrict administration of auth schema privileges; this must be verified in staging. Never alter Supabase auth tables using application code.

`pactum` is private: remove it from Supabase exposed schemas. PUBLIC has no application table access. All business tables have ENABLE/FORCE RLS. Migration credentials intentionally bypass runtime policies and must not be exposed through the application. Read-only SECURITY DEFINER policy functions have fixed pg_catalog search paths, explicit schema qualification and a dedicated owner; PUBLIC EXECUTE is revoked. They do not perform business mutations.

## Configuration

Server: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP_ORIGIN (HTTPS), DATABASE_URL (restricted runtime), WORKER_DATABASE_URL (restricted worker), CRON_SECRET. PayPal stays Sandbox: PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_MERCHANT_ID. Secrets must never use NEXT_PUBLIC names. DIRECT_URL belongs only in schema deployment jobs. Runtime transactions use transaction-local tenant, user, verified auth session and lease context; pooled connections do not retain these values.

Organization registration explicitly creates one OWNER; no existing financial record is automatically assigned to a new user. Invitations are generated locally and require secure manual delivery; no email delivery integration is claimed. Membership revocation, role changes and last-owner protection execute against PostgreSQL on every transaction.

## Verification before cutover

Run `npm run db:validate`, `npm run db:generate`, `npm run test:database`, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`. The database harness provisions an isolated local PostgreSQL cluster and real restricted logins, without reading .env or existing database URLs. Routine tests mock provider HTTP. Live PayPal diagnostics are opt-in and must not be part of routine CI.

Freeze legacy writes and take immutable backups of session, idempotency and webhook JSON files plus any supporting evidence. Calculate the SHA-256 digest of the exact session file. Create an explicitly reviewed ownership manifest `{ "sourceDigest": "...", "sessions": { "public-session-id": "organization-uuid" } }`. Never infer ownership from registration order.

Dry-run: `node --conditions=react-server --import tsx scripts/migration/legacy.ts snapshot.json ownership.json`. The validator never renames or writes the source. It requires a checksummed v1 envelope and validates money, FX hashes, agreement binding, Flight Recorder integrity and duplicate provider identities. Unsupported/uncertain/provider-bearing records are quarantined; offline import cannot confirm remote outcomes. Original complete envelope bytes are archived unchanged.

Import requires separate approval and explicit `PACTUM_LEGACY_IMPORT_APPROVED=1` plus `MIGRATION_DATABASE_URL` in the operator process, with `--apply`. The batch is transactional and digest-idempotent; a changed ownership mapping for an imported source is rejected. No live import has been performed by this implementation. Legacy idempotency/webhook formats and complex historical agreements require separate reviewed archival/reconciliation; they are not silently activated by the session importer.

## Operations and rollback

`POST /api/cron/reconcile` uses CRON_SECRET and a restricted worker login. It only reads remote PayPal orders; it never authorizes/captures/reissues payment. Fenced leases protect commits. Captures with exact remote order, merchant, authorization, amount and currency evidence can recover. Unknown order-create/authorization/invoice outcomes require manual reconciliation and remain blocked. Do not assume the provider retains request IDs forever. Outstanding idempotency requests are conservatively blocked until reconciled; never delete an unresolved key to force dispatch.

Verified unknown webhooks are durably quarantined. Supported bound events use atomic session/evidence/completion transactions. Quarantined events require a reviewed operator reprocessing tool (not implemented); they are not automatically revived. Do not reinterpret HTTP 202 quarantine as successful business processing.

Back up PostgreSQL, enable PITR, validate restore procedures, monitor unresolved operations/leases and database failures, then perform a staged tenant cutover. Rollback means stopping writes and routing to a reviewed database-compatible version. Never restore a stale JSON financial source after an external operation may have occurred. Do not downgrade to unauthenticated legacy APIs. Reconcile all remote outcomes before any data restoration or replay.

Remaining release gates include full provider-mocked crash/capture coverage, multi-process stress testing, staging Supabase schema/privilege validation, and reviewed operator tooling for legacy financial/quarantined events. Local tests alone do not verify these conditions.

Database retention cleanup deliberately returns 503 rather than running the legacy file deletion coordinator. Read-only cron health reports aggregate PostgreSQL counts. Define a separately reviewed legal retention policy and deletion mechanism before enabling database cleanup.

The importer also accepts `--idempotency=/path/to/ledger.json` and `--webhooks=/path/to/ledger.json`. Both require valid checksummed v1 envelopes and are archived with exact original bytes as QUARANTINED source records in the same transaction. They are never promoted to authenticated operational events: legacy ledger entries lack the complete signed provider event and explicit tenant ownership. Reruns must use the same ledger inputs. Operational activation remains a manual reconciliation gate.
