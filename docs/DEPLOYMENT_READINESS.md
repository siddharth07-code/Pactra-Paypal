# PACTRA final Supabase deployment readiness

Local database/backend preparation is complete on `main` as of 11 November 2026. The next operational step is the user's cutover using [DATABASE_CUTOVER.md](DATABASE_CUTOVER.md). No hosted bootstrap, migration, role change, application deployment, commit, or push was performed.

## Verified results

- **Administrator:** verified TLS connection to the intended project `telhivuqsrsaesjkkxuh`, database `postgres`, hosted PostgreSQL **17.11**. Existing administrator Auth SELECT/REFERENCES and role/schema bootstrap privileges passed. Hosted PACTRA roles remain absent and hosted migrations remain unapplied.
- **Recovery:** AES-256-GCM authentication and manifest SHA-256 verification passed. All **21 original backup/recovery files remain byte-identical** after the user moved the bundle to `~/Desktop/2026-11-11T11-40-33.502Z`. The key remains separate. The first read-only comparison matched all 41 hosted tables. A later comparison detected new Auth sessions/tokens and changed user metadata, and correctly stopped. A **fresh encrypted snapshot** was then captured and fully restored: all **41 counts and content digests match that snapshot**, including the Auth changes. Its database-specific role setting was also restored and checked by name. A final read-only comparison confirmed the refreshed backup matches current hosted records.
- **Full rehearsal:** the existing database was restored into isolated `supabase/postgres:17.6.1.152`; all **five migrations** deployed through the actual restricted migrator using the generated environment file. Existing contents remained unchanged. This is a compatible PostgreSQL 17 rehearsal; the local image is not the exact hosted minor version.
- **Security:** all **39 security tests** passed against the restored Supabase image. The six PACTRA roles lack SUPERUSER, BYPASSRLS, CREATEDB, and CREATEROLE. Runtime/worker capabilities are separate. Auth adapters/policy helpers have fixed ownership/search paths and no PUBLIC execution. Direct Auth access is denied. Verified **16 FORCE RLS tables, 62 policies, 52 valid indexes**, validated named constraints, tenant denial, and worker lease fences.
- **Deployment verifier:** its real `--before` and `--after` commands passed on the complete restored database. It checked preserved records, migration checksums, role/membership settings, security objects, and actual restricted runtime/worker login access. All modelled columns, enums, indexes, and constraints also passed the catalog comparison. Prisma generic diff's intentional cross-schema Auth FK limitation remains documented.
- **Disposable database suite:** **44 tests passed**, with added CLI checks for local-only credential preparation, real environment-file parsing, mode-0600 storage, stable retries, missing credential fields, mismatched passwords, unsafe permissions/memberships, Prisma deployment, and operator verification. Tests enforce SCRAM password authentication and never target Supabase.
- **Application regression:** **1,394 tests passed**; two opt-in live PayPal payment tests remain skipped.
- **Production HTTP smoke:** passed using a production Next.js server, disposable restricted PostgreSQL, a local TLS Auth provider, and secure HttpOnly cookies. It covered unauthenticated denial, verified login/logout, organization creation/persistence, authenticated workspace rendering, cross-organization denial, sourcing persistence, durable negotiation SSE completion, worker cron authorization, and unsigned-webhook denial. The successful smoke contacted no hosted provider.
- **Static/build checks:** Prisma validation/deploy/status, TypeScript, ESLint, production build, and whitespace validation passed. Inspection of **52 build traces found zero references to private local environment/financial files**. Native Prisma engines and the public CA are traced into applicable bundles.
- **External read-only probes:** Supabase Auth settings returned 200 with email confirmation enabled; Gemini returned 200 with generated content; PayPal Sandbox OAuth and webhook listing returned 200. The Sandbox app currently has **zero registered webhooks**. No real payment, hosted Auth mutation, or signed webhook delivery was executed.

## Corrections completed

1. Fixed provisioning's literal `\\n` separators so exported environment files contain two real variables and load correctly in Node/Prisma. Tests now consume those files directly.
2. Added an expected-project pin, checked the actual administrator/version and required Auth-column permissions, and strengthened existing role/membership/schema checks. Supabase's `TO CURRENT_USER` role-grant crash is avoided with explicit identifier-quoted role identities.
3. Added `--prepare` to generate inactive credentials locally without executing database writes. Storage validates ownership/permissions, rejects symlinks, uses a local provisioning lock and atomic file replacement, saves retry credentials before database commit, and rejects incomplete registries. Existing login passwords must authenticate; they are never silently rotated on retry.
4. Generate separate runtime/worker transaction-pooler URLs and a restricted session-pooler migration URL. Bootstrap query options are not inherited. Runtime clients start with one pooled connection; strict TLS uses the packaged, Vercel-compatible relative CA path.
5. Repaired the stale local CA reference in the prepared operator file without changing the original backup or private source credential. Generated a strong local cron secret and assembled the actual application environment outside Git.
6. Added repeatable encrypted backup/recovery helpers, read-only before/after verification and an offline production-configuration checker. Backup comparison blocks cutover if original records have diverged. No automatic restoration, migration-history rewriting, or data cleanup is performed.
7. Fixed the smoke-discovered webhook defect: missing PayPal signature headers are rejected before requesting provider credentials. Regression tests cover each required header. Valid complete events still use PayPal verification; retryable provider failures remain retryable.
8. Excluded `.env` files, legacy financial JSON, and local database files from Next.js tracing and Vercel CLI uploads, while retaining the public CA and generated native engine.

No migration SQL needed additional changes in this execution. Schema identifier `pactum`, existing data, RLS, payment guards, and Auth ownership boundaries are preserved. Unrelated working-tree modifications were preserved.

## Prepared operator handoff

Actual private locations:

```text
~/.local/share/pactra/cutover/2026-11-11T17-04-01.655Z/bootstrap.env
~/.local/share/pactra/cutover/2026-11-11T17-04-01.655Z/application.env
~/.local/share/pactra/database-credentials/85d2b2a26fc77f96/credentials.json
~/.local/share/pactra/database-credentials/85d2b2a26fc77f96/runtime.env
~/.local/share/pactra/database-credentials/85d2b2a26fc77f96/migration.env
```

All contain real prepared configuration or existing credentials; no unavailable external secret was invented. The three application fields deliberately left empty are:

- `APP_ORIGIN`: choose the final HTTPS domain in Vercel.
- `PAYPAL_WEBHOOK_ID`: register that domain's webhook in the existing PayPal Sandbox app and copy its ID.
- `REDIS_URL`: obtain a real ioredis-compatible TCP/TLS URL from the selected Redis service.

The production checker currently reports these external requirements and correctly refuses `valid: true` until they are supplied. Database credentials are fully prepared but become active only when the **user** runs hosted provisioning. Do not import administrator, migration, or local identity-projection configuration into Vercel.

The runbook specifies the external dashboard actions for SMTP/redirects, private Supabase schema exposure, Redis, webhook subscriptions, independent backup storage and managed recovery settings, Vercel runtime/build settings, and the exact hosted command sequence. These are operator configuration/deployment actions; no additional development stage is required. Actual provider email delivery, signed webhook/payment completion, hosted post-migration verification, and browser acceptance occur during the user's deployment.

## Evidence and recovery locations

Latest full restoration/migration/security/verifier evidence:

`~/.local/share/pactra/backups/telhivuqsrsaesjkkxuh/2026-11-11T17-41-19.710Z/rehearsals/final-2026-11-11T17-46-54.918Z/patched-corrected/recovery-summary.json`

Private read-only hosted preparation baseline:

`~/.local/share/pactra/cutover/2026-11-11T17-04-01.655Z/fresh-verified-preparation-baseline.json`

Refreshed, fully rehearsed encrypted bundle and recovery instructions:

`~/.local/share/pactra/backups/telhivuqsrsaesjkkxuh/2026-11-11T17-41-19.710Z/RESTORE.md`

Earlier verified bundle and unchanged original instructions:

`~/Desktop/2026-11-11T11-40-33.502Z/RESTORE.md`

Preserve the bundle, independent recovery copy, and separately protected key. Auth records changed during preparation. Pause Auth clients/automation and follow the runbook's freeze/baseline checks immediately before deployment. The implemented backup/rehearsal commands support a further refresh if the guard detects drift, without another development step. Never reset, db push, weaken RLS, delete unresolved financial records, replay quarantined events automatically, or restore stale state over subsequent provider outcomes.
