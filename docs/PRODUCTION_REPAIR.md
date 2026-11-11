# Production repair and redeployment

This change has not been deployed. The saved Vercel login expired: both the API (HTTP 403) and CLI (`login_required`) reject it. No hosted database migrations, role changes, or data changes were performed.

## Confirmed defects repaired

- Rate-limiter connection setup did not validate Redis URLs or explicitly set TLS server identity. Upstash and production now require authenticated `rediss://`, verified certificates, and an explicit TLS server name. URLs containing query overrides, fragments, malformed database paths, or surrounding whitespace are rejected without printing credentials.
- Concurrent requests during Redis reconnect immediately failed. Requests now share a bounded readiness wait, with bounded connection retries and command timeouts. Exhausted clients can reconnect on a later request. Rate limiter and cron singletons are reused across warm invocations.
- Redis infrastructure failures were reported as genuine authentication quota violations. They now deny access with HTTP 503; genuine exhausted quotas retain HTTP 429. Production cannot opt into a memory fallback through `RATE_LIMIT_FAIL_OPEN`.
- Cron coordination could silently fall back to process-local locks. Production distributed-lock failures now stop execution.

The particular cause of the deployed `ETIMEDOUT` is not yet proven: Production environment values, Upstash authentication, network allowlists, and function regions cannot be inspected without renewed Vercel access. A local TCP/TLS success does not prove Vercel-to-Upstash authenticated connectivity.

## Verified evidence

- Deployed `/`, `/login`, `/signup`: HTTP 200. `/account` and `/workspace`: redirect to login. Deployed `/api/auth/session` returns `AUTH_RATE_LIMITED`; `/api/organizations` returns 429. These observations precede redeployment.
- Application tests: 1,441 passed; two opt-in PayPal Sandbox tests skipped. Disposable database/security tests: 44 passed. TypeScript, lint, and production build passed.
- Production API smoke passed against disposable PostgreSQL and authenticated TLS Redis: secure-cookie login, zero/one/multiple organizations, OWNER creation, cross-tenant denial, sourcing, negotiation SSE, certificate/FX lock recovery and replay, worker cron, unsigned webhook denial, and logout/login persistence. Hosted services were not contacted by this test.
- Public Supabase CA remains included in server tracing; private env files and local databases remain excluded.
- Private local operator database URLs connect using verified TLS as `pactum_app` and `pactum_jobs`, neither superuser nor BYPASSRLS nor CREATEROLE. This does not attest to Production variable values.
- Private local operator provider checks: Supabase Auth settings, ExchangeRate-API INR/USD, Gemini model discovery, and PayPal Sandbox OAuth each returned HTTP 200. No payment was created, captured, or represented as successful. Gemini model discovery is not a completed negotiation.

## Operator access and exact deployment commands

Run from this repository:

```sh
cd ~/Desktop/Pactra-Paypal
npx vercel login
npx vercel link
```

In `link`, select the **existing** project whose Production domain is `pactra-eight.vercel.app`. Do not create a project. Verify the owner/team and project before continuing.

Pull Production variables into a protected file outside the repository. Sensitive non-downloadable values must be verified in the Vercel dashboard; do not replace them with empty pulled values.

```sh
umask 077
PROD_ENV_DIR="$(mktemp -d "$HOME/.pactra-production.XXXXXX")"
npx vercel env pull "$PROD_ENV_DIR/production.env" --environment=production
node --import tsx --env-file="$PROD_ENV_DIR/production.env" scripts/database/check-production.mjs
node --import tsx --env-file="$PROD_ENV_DIR/production.env" scripts/check-redis.mjs
```

`EXPECTED_SUPABASE_PROJECT_REF` must identify the intended project for the first check. Never print the env file. The Redis command performs only authenticated TLS connection and PING, and disconnects afterward. If it times out locally, check the URL, Upstash database availability, credential, IP allowlist, and endpoint. If it passes locally but production still times out, inspect the deployed function's logs/region and Upstash network restrictions; do not disable TLS or rate limiting.

Vercel **Production** scope requirements:

- `REDIS_URL=rediss://default:<URL-encoded-password>@thorough-collie-197783.upstash.io:6379`, entered as the value itself, without quotes, newline, CLI command text, or `REDIS_URL=` prefix. Obtain the real password from Upstash; a REST token is not a Redis TCP password. Keep `RATE_LIMIT_BACKEND=redis` and `RATE_LIMIT_FAIL_CLOSED=true`; remove fail-open overrides.
- `DATABASE_URL`: restricted `pactum_app` transaction-pooler connection. `WORKER_DATABASE_URL`: restricted `pactum_jobs` transaction-pooler connection. Both preserve `schema=pactum`, `pgbouncer=true`, `sslmode=require`, `sslaccept=strict`, and `sslcert=certs/supabase-ca.cer`. Do not add migrator/admin credentials or `DIRECT_URL` to runtime. The public CA is packaged and resolved inside the deployed application.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN=https://pactra-eight.vercel.app`. Configure Supabase Auth Site URL and callback/recovery redirect allowlist for this origin. Keep email confirmation enabled. No local identity projection or local Auth database settings.
- `GEMINI_API_KEY`, `FX_PROVIDER=LIVE_PROVIDER`, `EXCHANGE_RATE_API_KEY`. Optional configured model/catalog settings must match their actual providers; absent catalog credentials must not be presented as live sourcing.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`. Verify the Sandbox app webhook points to `https://pactra-eight.vercel.app/api/paypal/webhook` and its ID matches that Sandbox app. Do not enable live mode.
- `CRON_SECRET` with at least 32 random characters; `TRUST_PROXY=true` (Vercel also supplies its platform marker). The configured daily cron is `/api/cron/reconcile` at 03:00 UTC. Configure the same secret for Vercel's bearer authorization. Never invoke reconciliation merely as a read-only health check.

Update only confirmed incorrect values in the existing project's Production settings, then:

```sh
npm run test:database
npm test
npm run typecheck
npm run lint
npm run build
npm run test:local-api
npx vercel deploy --prod
npx vercel inspect https://pactra-eight.vercel.app
curl --fail --silent --show-error -o /dev/null -w '%{http_code}\n' https://pactra-eight.vercel.app
```

The API smoke test requires local `redis-server` with TLS support (or `REDIS_SERVER_BINARY` pointing to it). It provisions disposable local PostgreSQL and Redis, uses test Auth fixtures and a temporary trusted certificate, and never contacts hosted services.

After deployment, inspect runtime logs and confirm a logged-out session returns 401 rather than 429/503. Sign in with an authorized existing test account and verify secure cookies, refresh, logout/login, organization selection, and organization isolation. Use only authorized Sandbox test workflows for sourcing, negotiation provenance, canonical agreements, Merkle/ACWORLD evidence, FX locking, and settlement/history. Do not infer success from mocked application tests or create real-money payments. Protected workflows and production Redis health remain unverified until these checks run with renewed access.

If the deployment regresses, roll back to the previous deployment through the existing project's Vercel dashboard. Never reset PostgreSQL or weaken authorization as a rollback mechanism. Keep secret files outside Git and delete the temporary pulled environment securely when finished. No commit or push is necessary for CLI deployment; uncommitted local source changes are uploaded by the CLI, subject to `.vercelignore`.

## Modified files

- `src/lib/redis-connection.ts`, `src/lib/redis-connection.test.ts`: strict connection options, bounded concurrent readiness, reconnect and outage regression tests.
- `src/lib/rate-limiter.ts`, `src/lib/cron-coordinator.ts`: distributed-client lifecycle, failure classification, fail-closed behavior, warm-instance reuse.
- `src/lib/auth/handlers.ts`, `src/lib/auth/password-recovery.ts`, `src/lib/auth/business-access.ts`: infrastructure 503 versus genuine quota 429.
- `src/lib/env-validator.ts`, `src/lib/env-validator.test.ts`, `scripts/database/check-production.mjs`: production Redis and TLS validation.
- `scripts/check-redis.mjs`, `scripts/database/smoke-local-api.mjs`: read-only operator connectivity probe and disposable authenticated TLS Redis/API verification.
- `src/test/authentication-foundation.test.ts`: login outage classification regression.
- `src/test/workflow-copy-refinement.test.tsx`: stop GSAP ScrollTrigger timers before test-environment teardown; fixes an observed uncaught timer error during full regression testing.
- `docs/PRODUCTION_REPAIR.md`, `docs/DEPLOYMENT_READINESS.md`: evidence, remaining access blocker, environment audit requirements, and exact deployment commands.
