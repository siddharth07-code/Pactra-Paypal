# Vercel production repair: 12 November 2026

The authenticated CLI is linked to the existing `siddharth-lal-s-projects/pactra` project (`prj_qpRBqEci6uP1YWD6bnisxROzD2f6`). No new project was created. No hosted PostgreSQL migrations, role changes, Redis resets, financial-record changes, or payments were performed.

## Confirmed causes and corrections

Runtime connection metadata established that the deployed Redis connection used the correct hostname and TLS but **port 637**. Upstash's [TCP connection format](https://upstash.com/docs/redis/quickstarts/express) uses port **6379**. The former connection timed out before authentication.

The connection builder now supplies a single explicit ioredis options object, enforces Upstash's provider port 6379, and retains the original username/password, hostname verification, and system CA verification. Other Redis endpoints preserve their configured ports. The source fix does not retrieve, print, or replace the Sensitive Vercel credential.

After the correction, the deployed client authenticated and emitted `ready` on port 6379 in `bom1`. Rate-limiter commands still failed closed, and ioredis reported a Redis ACL denial for `INFO`. Further command failures are classified as safe protocol codes (`NOPERM`, `WRONGPASS`, etc.) without logging command arguments, credentials, or provider error text.

The client skips ioredis's optional INFO readiness check, which is incompatible with limited provider ACLs. This does **not** skip TLS, Redis AUTH, or rate-limiter Lua execution. A denied Lua/rate-limiter command still produces HTTP 503 and prevents authentication. Regression tests and the local TLS/API smoke verify both successful authenticated operation and denial with an incorrect Redis password.

## Regions and Fluid Compute

The initial project API configuration and function build output both specified `bom1`, and Fluid Compute was enabled. A controlled deployment explicitly used `iad1`; it still timed out with port 637. Its `VERCEL_REGION=iad1` and `bom1::iad1` response headers distinguished the actual compute region from the Mumbai edge/log envelope. Region and Fluid Compute were not the cause of the wrong-port failure.

The temporary `iad1` override was removed. The corrected production deployment uses the existing project default `bom1`, with Fluid Compute retained. DNS lookup diagnostics returned IPv4 addresses in both tested regions, and verified TLS authenticated successfully after the port correction.

## Verification and access limits

- 1,445 application tests passed; two opt-in PayPal Sandbox tests skipped.
- 44 database/security tests passed using disposable local PostgreSQL.
- TypeScript, lint, production build, and local production API smoke passed.
- The local API smoke uses disposable PostgreSQL, authenticated TLS Redis, and a local Auth fixture. It covers secure-cookie login, zero/one/multiple organizations, OWNER creation, cross-tenant denial, sourcing persistence, negotiation SSE, agreement/certificate/FX lock recovery/replay, worker cron authorization, unsigned webhook denial, and logout/login persistence. Hosted services are not contacted by that test.
- Duplicate generated Next type artifacts recurred during validation. `tsconfig.json` now excludes only space-suffixed filenames within `.next/types` and `.next-dev/types`; source files and authoritative Next types remain checked.
- All 16 configured Production variables were present in Vercel metadata and marked Sensitive. Their values cannot be downloaded or audited through `env pull`; `[SENSITIVE]` is a placeholder, not an empty production value. No production secret was overwritten with a placeholder.
- A positive production account login and organization check require an authorized existing account. No credentials were supplied during this investigation. A successful local fixture test is not proof of a successful production login.

## Latest live result

Deployment `dpl_5hm89z2mvL56HG79SZG9NNBCSMdx` reached READY and was assigned to `https://pactra-eight.vercel.app` in `bom1`. Its runtime logs show authenticated Redis `ready` on verified TLS port 6379, followed by **NOPERM during rate-limit execution** for session, login, organization, and health routes. The credential lacks a command/key permission required by the rate limiter; the exact missing ACL grant cannot be determined from redacted Vercel values or a bare NOPERM response.

Live `/` and `/login` return HTTP 200. Session/login, organizations, and protected health remain HTTP 503 because fail-closed Redis protection is working. A positive production login, runtime PostgreSQL check, and organization access cannot be claimed until the Redis credential permissions are corrected. No replacement Redis credential or authorized account file was provided.

## Required operator credential action

The deployed command log confirms `NOPERM`: the configured credential cannot execute the commands needed by the rate limiter. Do not disable rate limiting or grant database/application-wide privileges to work around it.

In the existing Upstash database's Connect → TCP panel, obtain its standard **read/write Redis credential**, not a read-only REST token. In the existing Vercel project's **Production** environment, replace only `REDIS_URL` with that database's TCP URL, using:

```text
rediss://default:<URL-encoded TCP password>@thorough-collie-197783.upstash.io:6379
```

Keep `RATE_LIMIT_BACKEND=redis`. Preserve the existing restricted PostgreSQL URLs, Supabase settings, TLS certificate, and all payment/authentication settings. Do not print or commit the URL. Sensitive variables cannot be decrypted for local inspection; the user must supply the valid credential or update the dashboard value.

To provide the credential securely for an authenticated operator check, create `/private/tmp/pactra-production/redis.env` with mode 600 and a single `REDIS_URL=...` entry. Do not paste it into chat. Then:

```sh
cd ~/Desktop/Pactra-Paypal
node --import tsx --env-file=/private/tmp/pactra-production/redis.env scripts/check-redis.mjs
```

The check verifies authenticated TLS, PING, and a read-only Lua invocation, prints only a safe result/code, and disconnects. The actual rate-limiter requests after deployment must also succeed; PING alone does not prove write-command permissions. The runtime requires Lua and the sorted-set/expiry commands used by its atomic sliding window. Do not run FLUSHDB, FLUSHALL, or Redis/Supabase resets.

After updating the Production secret, redeploy **only the existing linked project**:

```sh
npx vercel whoami
npx vercel inspect https://pactra-eight.vercel.app --scope siddharth-lal-s-projects
npx vercel deploy --prod --yes --scope siddharth-lal-s-projects
curl --silent --show-error -o /dev/null -w '%{http_code}\n' https://pactra-eight.vercel.app
curl --silent --show-error https://pactra-eight.vercel.app/api/auth/session
npx vercel logs --environment production --scope siddharth-lal-s-projects --since 1m --json
```

A logged-out session should return 401, not infrastructure 503. Then sign in with an authorized existing account, verify HttpOnly/Secure cookies, refresh/session recovery, organization access, and logout. For an automated authorized check, provide `/private/tmp/pactra-production/login.json` with mode 600 and JSON fields `email` and `password`; never commit it or paste its contents into chat. A protected read-only `/api/cron/health` check can verify the worker's PostgreSQL operational-health function using the configured `CRON_SECRET`. Do not use reconciliation endpoints merely as read-only health checks.

## Modified files

- `src/lib/redis-connection.ts`: explicit connection options, fixed Upstash port, authenticated readiness, credential-free metadata/DNS diagnostics, and safe Redis error codes.
- `src/lib/rate-limiter.ts`, `src/lib/cron-coordinator.ts`: shared connection builder; rate-limit command failures remain fail-closed.
- `scripts/check-redis.mjs`: authenticated TLS/PING/Lua credential check without exposing the URL.
- `src/lib/redis-connection.test.ts`: port/credential/TLS preservation, sanitized diagnostics, ACL rejection, and failure classification regression tests.
- `scripts/database/smoke-local-api.mjs`: verifies a bad Redis password remains denied when INFO readiness is disabled.
- `tsconfig.json`: excludes duplicate generated type artifacts without excluding source or official generated types.
- `docs/PRODUCTION_REPAIR.md`, `docs/DEPLOYMENT_READINESS.md`: current evidence and operator handoff.
