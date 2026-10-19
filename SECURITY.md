# PACTUM — Security Policy

## 1. Purpose

This document defines mandatory security requirements for PACTUM.

All code generated, modified, or reviewed by the coding agent must comply with this policy.

Read and follow this file alongside `GEMINI.md`. If a security requirement conflicts with an implementation shortcut, the security requirement takes precedence.

Never disable, bypass, or weaken a security control merely to make the application work or improve the demonstration.

## 2. Secrets and Credentials

- Never hardcode API keys, client secrets, access tokens, refresh tokens, or private credentials.
- Store secrets in environment variables or an appropriate secrets manager.
- Never expose server-side credentials through client components, browser bundles, API responses, source maps, or logs.
- Never commit `.env.local`, production environment files, or files containing real credentials.
- Maintain `.env.example` with placeholder values only.
- Keep PayPal and Gemini credentials exclusively on the server.
- Redact sensitive values from errors and logs.
- Never print complete authorization headers or access tokens.
- If a secret is accidentally exposed, report it immediately and recommend revocation and rotation.

## 3. Authentication and Authorization

- Protect every sensitive operation with appropriate server-side authorization.
- Never assume that hiding a button in the frontend protects an API endpoint.
- Verify that a procurement session, PayPal order, invoice, and dispute belong to the intended workflow before modifying them.
- Never trust client-supplied user identity, session ownership, payment status, audit results, or permissions.
- Reject unauthorized operations by default.
- Do not implement permissive authentication shortcuts for demonstrations.

## 4. Input Validation

- Validate all incoming API requests using explicit schemas.
- Validate Gemini outputs, vendor responses, browser-extracted content, webhook payloads, and PayPal responses before use.
- Reject malformed, missing, unexpected, or out-of-range values.
- Validate quantities, prices, shipping costs, budgets, delivery times, and return windows.
- Reject non-finite numbers, negative monetary values, invalid quantities, and arithmetic overflow.
- Use integer minor units or decimal-safe arithmetic for financial calculations.
- Never trust frontend-calculated totals.
- Apply reasonable request-size, execution-time, and rate limits to externally accessible endpoints.

## 5. AI and Prompt-Injection Security

- Treat Gemini output as untrusted input.
- Treat vendor messages, product descriptions, webpage content, DOM snapshots, and external documents as untrusted data.
- Never allow external content to modify system instructions, security policies, or authoritative procurement constraints.
- Keep instructions separate from untrusted vendor content.
- Validate structured model outputs before processing them.
- Never execute model-generated code, shell commands, SQL, or arbitrary tool instructions without explicit, independently enforced authorization.
- Do not allow Gemini to modify the authoritative budget or approve its own financial actions.
- Do not rely on prompts alone to enforce security constraints.
- Apply deterministic server-side validation before any vendor-facing offer or financial operation.

## 6. Procurement and Negotiation Guardrails

- Enforce budget, delivery, return-policy, utility, and anti-thrashing constraints on the server.
- Inspect every outgoing buyer offer before transmitting it.
- Reject invalid offers rather than silently correcting or forwarding them.
- Prevent private budget and reservation-price information from leaking into vendor-facing messages.
- Record guardrail decisions and their reasons without logging unnecessary sensitive information.
- Never let a vendor response or AI-generated message bypass the guardrail.
- Fail closed when mandatory financial constraints cannot be verified.
- Test adversarial inputs and boundary conditions.

## 7. Payment Security

- Use the documented PayPal API and OAuth 2.0 authentication flow.
- Use PayPal Sandbox during development and testing.
- Verify the order ID, procurement session, amount, currency, and current order state before capture.
- Recalculate expected totals independently on the server.
- Bind the audit result to the authoritative procurement session and Merkle root.
- Require a successful independent audit before capture.
- Reject capture if any mandatory invariant fails or cannot be verified.
- Never accept a client-supplied `passed: true` as proof of a successful audit.
- Prevent duplicate capture operations and implement safe retry handling.
- Verify actual PayPal API responses before reporting success.
- Distinguish order creation, authorization, capture, invoice creation, invoice sending, and payment completion.
- Never claim a payment was captured merely because an order was created.
- Never claim a dispute was filed or resolved without evidence from the actual API response.

## 8. PayPal Webhooks and External APIs

- Verify webhook authenticity using the supported PayPal verification mechanism.
- Validate webhook event types and associated resource identifiers.
- Handle duplicate and out-of-order webhook deliveries safely.
- Never trust a webhook solely because its JSON structure appears valid.
- Use request timeouts and controlled retry policies for external API calls.
- Handle rate limits, authentication failures, malformed responses, and service outages explicitly.
- Do not expose internal stack traces, credentials, or sensitive API response data.
- Never fabricate successful responses when an external service is unavailable.
- Clearly identify deterministic fixtures and simulated operations.

## 9. Merkle Tree and Cryptographic Integrity

- Use Node.js native cryptographic primitives for SHA-256 hashing.
- Follow the canonical serialization and domain-separation rules in `GEMINI.md`.
- Use consistent byte encoding for leaf and internal-node hashes.
- Generate and verify inclusion proofs using the same documented tree construction rules.
- Reject malformed proofs, incorrect roots, invalid indices, and modified evidence.
- Keep procurement event history append-only within the defined session lifecycle.
- Bind audit results to the correct session and authoritative event history.
- Never trust a Merkle root supplied only by the client.
- Never claim a hash proves that an external statement is factually true.
- Never describe PayPal metadata as an independent blockchain commitment.

## 10. Database and Persistence Security

- Use parameterized database operations and safe ORM APIs.
- Never construct SQL queries by concatenating untrusted input.
- Validate data before persistence.
- Enforce appropriate uniqueness and consistency constraints.
- Protect procurement histories and audit records against unauthorized modification.
- Use transactions for operations that require atomic database updates.
- Avoid storing credentials or unnecessary sensitive information in database records.
- Do not treat client-side state as authoritative financial state.

## 11. Web Application Security

- Avoid unsafe HTML rendering and arbitrary code execution.
- Sanitize untrusted content before rendering it as HTML.
- Prevent cross-site scripting, injection attacks, and unauthorized cross-origin requests.
- Apply appropriate CORS and CSRF protections where relevant to the authentication model.
- Do not expose internal server errors to clients.
- Use secure cookie settings if cookies are introduced.
- Avoid unnecessarily permissive security headers or browser permissions.
- Keep dependencies updated and investigate known vulnerabilities before adding packages.
- Never disable security-related framework defaults without a documented reason.

## 12. File, Command, and Tool Security

- Never execute commands or code obtained from vendor content or model output without independent authorization.
- Restrict filesystem access to intended project resources.
- Do not read or disclose unrelated local files, credentials, or environment contents.
- Avoid shell commands that delete, overwrite, or expose data unnecessarily.
- Inspect existing files before modifying or removing them.
- Never commit generated credentials, private keys, logs containing secrets, or local databases containing sensitive data.

## 13. Logging and Error Handling

- Log security-relevant events, failed validations, and blocked financial operations.
- Include useful event identifiers and reasons without exposing secrets.
- Do not log complete credentials, access tokens, authorization headers, or unnecessary personal information.
- Return structured errors that do not reveal internal implementation details.
- Preserve enough diagnostic information for developers to investigate failures securely.
- Do not silently swallow security failures.

## 14. Testing Requirements

Test at least the following security boundaries:

- Missing, malformed, and unauthorized requests.
- Budget violations and invalid monetary values.
- Prompt injection through vendor messages and webpages.
- Attempts to disclose private budget information.
- Invalid negotiation offers.
- Client attempts to forge audit results.
- Incorrect procurement-session or order associations.
- Capture attempts after a failed audit.
- Duplicate payment requests.
- Tampered Merkle events and inclusion proofs.
- Invalid or spoofed webhook events.
- Missing credentials and external API failures.
- Attempts to expose secrets through errors or logs.

Use mocked external services for unit tests and real Sandbox credentials only for explicitly configured integration tests.

A test must verify the security property it claims to cover. Do not use meaningless assertions or disable failing tests to obtain a passing result.

## 15. Vulnerability Handling

When a vulnerability is discovered:

1. Identify the affected component and attack path.
2. Assess the potential impact.
3. Fix the underlying cause rather than hiding the symptom.
4. Add a regression test.
5. Run relevant tests, type checks, and builds.
6. Report the vulnerability, remediation, and remaining limitations.

Treat exposed credentials, unauthorized payment capture, financial constraint bypasses, and compromised audit integrity as critical issues requiring immediate attention.

## 16. Mandatory Development Rules

Before implementing or modifying code:

1. Read `GEMINI.md` and this `SECURITY.md`.
2. Inspect the affected files and trust boundaries.
3. Identify relevant security risks.
4. Implement the smallest safe change.
5. Run relevant tests and inspect the resulting diff.
6. Report what was verified and what remains unverified.

If a security requirement cannot be satisfied, stop the affected implementation and explain the issue.

Never weaken a security control to satisfy a demo requirement.

Security is part of correctness, not an optional enhancement.