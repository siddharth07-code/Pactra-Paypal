# PACTRA final Supabase deployment readiness

The latest organization-access repair is documented in [AUTH_PROVIDER_REPAIR.md](./AUTH_PROVIDER_REPAIR.md): production session verification succeeded, but a missing Prisma runtime engine prevented database membership checks.

For the current Vercel authentication/Redis repair, verified local results, access blocker, and exact redeployment commands, see [PRODUCTION_REPAIR.md](./PRODUCTION_REPAIR.md). Vercel access is now authenticated. The Redis port correction has been deployed; consult that report for the remaining production command-permission and positive-login verification requirements.

Database TLS and refreshed recovery verification are complete on `main` as of 12 November 2026. Hosted bootstrap was completed by the operator; this execution performed read-only hosted checks only. The next operational step is the user's cutover using [DATABASE_CUTOVER.md](DATABASE_CUTOVER.md). No hosted migrations, data/role changes, deployment, commit, or push were performed by this execution.


## Final TLS verification and operator next commands

Confirmed cause: macOS native trust evaluation rejects the otherwise valid Supabase private CA chain (`CSSMERR_TP_CERT_SUSPENDED`); Prisma 6.19.3's native macOS engine returns P1011 even with an absolute path. OpenSSL verifies the chain and hostname; the matching Linux Prisma engine succeeds with the same CA and strict verification. The pooler hostname and certificate dates are correct. No TLS bypass, trust-store change, new CA, or database change was used.

Permanent fixes:

- `scripts/database/hosted-prisma.mjs` uses the installed version's checksum-verified Linux schema engine through a pinned local Docker image on macOS. It allows only validation, migration status, and the operator's migration deploy command, pins the intended restricted migrator, and requires strict TLS. Status lists five pending migrations and exits 1 because they are pending, not because connectivity failed.
- Runtime and worker clients resolve portable `sslcert=certs/supabase-ca.cer` to the deployed `process.cwd()/prisma/certs/supabase-ca.cer`. The public CA is explicitly traced into serverless packages. Never put an absolute Mac CA path into Vercel environment variables.
- The post-bootstrap backup rehearsal now provisions fresh passwords **only inside the isolated local restoration**, since recovery dumps intentionally omit passwords. Hosted credentials are preserved.

Verified: all three restricted logins authenticate with encrypted, authorized TLS; actual Linux Prisma query-engine reads succeed for runtime and worker; the hosted Prisma migration status lists the exact five reviewed migrations. All six roles remain NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE. The refreshed encrypted snapshot restored all 41 table counts and content digests, rehearsed all five migrations, passed post-migration operator/security checks, preserved existing contents, and matched a final read-only hosted comparison. The older backups remain untouched. The prepared operator file points to the refreshed baseline and a new exclusive cutover-baseline path.

Run from a clean operator terminal, with trusted local Docker running:

```bash
cd ~/Desktop/Pactum-Paypal
OPERATOR_DIR="$HOME/.local/share/pactra/cutover/2026-11-11T17-04-01.655Z"
ROLE_DIR="$HOME/.local/share/pactra/database-credentials/85d2b2a26fc77f96"
BACKUP_DIR="$HOME/.local/share/pactra/backups/telhivuqsrsaesjkkxuh/2026-11-11T20-24-47.707Z"
export EXPECTED_SUPABASE_PROJECT_REF=telhivuqsrsaesjkkxuh
# First stop application, worker, and Auth writers; retain independent backup/key copies.
node "$BACKUP_DIR/recover.cjs" verify
node --env-file="$OPERATOR_DIR/bootstrap.env" scripts/database/verify-deployment.mjs --before
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs validate
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs migrate status
# USER ONLY: the next line changes the hosted database. It has NOT been run by the agent.
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs migrate deploy
node --env-file="$ROLE_DIR/migration.env" scripts/database/hosted-prisma.mjs migrate status
node --env-file="$OPERATOR_DIR/bootstrap.env" scripts/database/verify-deployment.mjs --after
```

Do not chain commands with `&&` across the pre-deploy `migrate status`: Prisma exits 1 for the expected pending state. Inspect its output and proceed only when the five names match the runbook and no connection/failed-migration error appears. The initial `--before` baseline is exclusive: if already created, preserve it and use the runbook's recovery guidance rather than overwriting it.

Then complete the real dashboard values in the private `application.env`: `APP_ORIGIN`, `PAYPAL_WEBHOOK_ID`, and `REDIS_URL` were still absent at this execution's check. Configure Supabase Auth redirects/SMTP and the Sandbox webhook for that actual domain; obtain a Redis TCP/TLS URL. These are operator configuration actions, not missing code. Run the production configuration checker until it returns `valid: true`, import only the application variables into Vercel, and deploy personally using the existing runbook. Never import `DIRECT_URL`, migrator/admin credentials, or local identity variables. No Vercel deployment was executed.

## Verified results (earlier preparation, updated where applicable)

- **Administrator:** verified TLS connection to the intended project `telhivuqsrsaesjkkxuh`, database `postgres`, hosted PostgreSQL **17.11**. Existing administrator Auth SELECT/REFERENCES and role/schema bootstrap privileges passed. All six hosted PACTRA roles are provisioned and verified; all five migrations remain unapplied.
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

The production checker currently reports these external requirements and correctly refuses `valid: true` until they are supplied. Database credentials now authenticate the already-provisioned restricted roles. Do not rerun hosted provisioning. Do not import administrator, migration, or local identity-projection configuration into Vercel.

The runbook specifies the external dashboard actions for SMTP/redirects, private Supabase schema exposure, Redis, webhook subscriptions, independent backup storage and managed recovery settings, Vercel runtime/build settings, and the exact hosted command sequence. These are operator configuration/deployment actions; no additional development stage is required. Actual provider email delivery, signed webhook/payment completion, hosted post-migration verification, and browser acceptance occur during the user's deployment.

## Evidence and recovery locations

Latest full restoration/migration/security/verifier evidence:

`~/.local/share/pactra/backups/telhivuqsrsaesjkkxuh/2026-11-11T20-24-47.707Z/rehearsals/final-2026-11-11T20-29-59.261Z/patched-corrected/recovery-summary.json`

Private read-only hosted preparation baseline:

`~/.local/share/pactra/cutover/2026-11-11T17-04-01.655Z/fresh-verified-preparation-baseline.json`

Refreshed, fully rehearsed encrypted bundle and recovery instructions:

`~/.local/share/pactra/backups/telhivuqsrsaesjkkxuh/2026-11-11T20-24-47.707Z/RESTORE.md`

Earlier verified bundle and unchanged original instructions:

`~/Desktop/2026-11-11T11-40-33.502Z/RESTORE.md`

Preserve the bundle, independent recovery copy, and separately protected key. Auth records changed during preparation. Pause Auth clients/automation and follow the runbook's freeze/baseline checks immediately before deployment. The implemented backup/rehearsal commands support a further refresh if the guard detects drift, without another development step. Never reset, db push, weaken RLS, delete unresolved financial records, replay quarantined events automatically, or restore stale state over subsequent provider outcomes.
