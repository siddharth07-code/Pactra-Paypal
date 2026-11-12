# PACTRA

PACTRA is a procurement and settlement prototype for the PayPal hackathon. A buyer defines purchasing requirements, compares offers, and reviews a negotiated agreement before starting PayPal Sandbox checkout. The app records the terms and the audit evidence behind each settlement decision.

## How it works

1. **Define a mandate.** Enter a product, quantity, total budget, currency, delivery deadline, and minimum return period.
2. **Source and negotiate.** Start with the demo catalog and choose a simulated supplier. PACTRA generates buyer-side proposals and applies deterministic checks to price, quantity, delivery, and returns. The supplier simulator produces the counteroffers.
3. **Review the agreement.** The Flight Recorder links procurement events with SHA-256 hashes and commits the agreement to a Merkle evidence tree. The ACWORLD audit checks product and condition, price arithmetic, return terms, delivery terms, and evidence lineage. This verifies the recorded workflow and its data integrity. Supplier claims require separate merchant evidence.
4. **Settle in Sandbox.** The buyer approves the order in PayPal. PACTRA checks the provider response and gates capture on the final audit.

## Gemini AI

The server calls the Gemini API through Google's `@google/genai` SDK. [Mandate intelligence](src/lib/mandate-intelligence.ts) extracts structured requirements from natural-language input and can flag missing or ambiguous terms. The [negotiation client](src/lib/gemini-client.ts) generates structured buyer-side offers. Both paths validate model output and have deterministic fallback paths. The negotiation record identifies Gemini-backed proposals and fallback activity by provenance. The application enforces mandate constraints and controls settlement independently of the model.

## PayPal Sandbox

- **OAuth and order creation.** The [PayPal client](src/lib/paypal-client.ts) exchanges server-side Sandbox app credentials for an OAuth 2.0 access token at `/v1/oauth2/token`. Checkout creates an Orders v2 order with `intent: AUTHORIZE` and returns PayPal's buyer approval link.
- **Approve and authorize.** The buyer signs into PayPal with a Sandbox personal account and approves the order. The server retrieves the order and checks its amount, currency, and evidence binding before authorizing an approved order through Orders v2.
- **Audit and capture.** The [settlement service](src/lib/settlement-service.ts) runs its final audit before calling Payments v2 to capture against the authorization ID. Review the recorded capture status separately from approval and authorization. Pending or uncertain outcomes require reconciliation.
- **Webhooks.** Register a reachable HTTPS URL ending in `/api/paypal/webhook` on the same Sandbox app, then set `PAYPAL_WEBHOOK_ID` to the registered ID. The [handler](src/app/api/paypal/webhook/route.ts) verifies PayPal signatures and deduplicates events. It handles completed and denied or declined captures, paid invoices, and created disputes. For a capture demo, subscribe to `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.DENIED`. Localhost can receive the browser return from approval. Provider webhook delivery requires a PayPal-reachable endpoint. [PayPal authorization and capture guide](https://developer.paypal.com/checkout/delay-capture/) · [PayPal webhooks](https://developer.paypal.com/api/rest/webhooks/)

The payment client targets Sandbox. Provider-confirmed order, authorization, and capture states represent activity with test funds. Mock identifiers and test fixtures represent simulated state. An OAuth success confirms that the credentials work for token issuance. Verify each later stage against its own PayPal response or a verified webhook.

## Tech stack

- **Application:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, GSAP, and Three.js
- **Identity and data:** Supabase Auth, PostgreSQL, and Prisma. Redis can provide distributed rate limiting.
- **External APIs:** Gemini and PayPal Sandbox. Optional Channel3 catalog search supplies product listings for review, and optional ExchangeRate-API supplies FX reference rates. The catalog listings lack the verified supplier terms needed for settlement.
- **Tests:** Vitest, Testing Library, and disposable PostgreSQL integration checks

## Local setup

Use Node.js 22.12 or later and npm. From a fresh checkout:

```sh
git clone https://github.com/siddharth07-code/Pactra-Paypal.git
cd Pactra-Paypal
npm ci
cp -n .env.example .env.local
```

Edit your local copy of [`.env.example`](.env.example):

- Set `APP_ORIGIN=http://localhost:3000`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` for your development Supabase Auth project. Allow `http://localhost:3000/auth/callback` in its redirect settings.
- Set `GEMINI_API_KEY` and `GEMINI_MODEL` to exercise Gemini. Keep `CHANNEL3_API_KEY` empty to use the demo catalog.
- For PayPal checkout, set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MERCHANT_ID` from your Sandbox app and business account. Set `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`. Configure `PAYPAL_WEBHOOK_ID` when testing webhooks.
- Keep API keys, PayPal secrets, and database connection strings in local server configuration outside version control.

Start the local PostgreSQL setup in one terminal. It applies Prisma migrations and writes the local database settings to `.env.local`. Keep it running while you use the app.

```sh
npm run db:local
```

In another terminal, generate the Prisma client and start Next.js:

```sh
npm run db:generate
npm run dev
```

Open [localhost:3000](http://localhost:3000). Sign up or sign in, then create or select an organization in the workspace. See the [database runbook](docs/DATABASE_CUTOVER.md) for hosted configuration.

## Demo and tests

1. Start a fresh USD procurement session. Try: “Buy 10 USB-C monitors for a total budget of USD 3,500, with delivery within 7 days and returns for at least 30 days.” Review the extracted constraints and adjust them to the offers shown in the demo catalog if needed.
2. Select a demo offer, run the negotiation, and review the recorded agreement and audit in the workspace. The agreement is simulated even when Gemini produced the buyer's proposals.
3. With Sandbox credentials configured, proceed to settlement and approve the order as a Sandbox buyer. Return to PACTRA and inspect the authorization, audit, and capture outcome. For provider verification, compare the recorded order and capture IDs with PayPal Sandbox. Confirm webhook receipt separately if you configured an HTTPS listener.

```sh
npm test
npm run test:database
npm run test:local-api
npm run lint
npm run typecheck
```

The routine suites use mocks or local fixtures at provider boundaries. Database and local API checks use a disposable PostgreSQL instance. Leave `PACTUM_LIVE_TESTS` unset or disabled for routine checks. The [functional audit](docs/CRITICAL_FUNCTIONAL_AUDIT.md#verification-evidence) records successful Gemini, FX reference-rate, and PayPal Sandbox OAuth probes. It tested payment lifecycle handling with mocks and recorded no provider-backed Sandbox purchase, authorization, or capture during that audit.

## License

PACTRA's original project code and documentation are licensed under the [Apache License, Version 2.0](LICENSE), an [OSI-approved license](https://opensource.org/license/apache-2.0).

Third-party dependencies and assets retain their own terms and notices. In particular, `gsap` and `@gsap/react` use the [GSAP Standard License](https://gsap.com/standard-license). The project license covers only material the project has rights to license. Third-party marks and service use remain subject to the applicable terms.
