# .antigravity/rules.md — PACTUM Architectural & Development Rules

These rules govern the development of the PACTUM project and MUST be followed strictly across all development phases.

1. **Authoritative Specification**
   - `GEMINI.md` is the authoritative project specification and single source of truth. All implementations, models, and workflows must conform strictly to its directives.

2. **Strict TypeScript**
   - Use strict TypeScript everywhere with full type coverage (`strict: true`, `noImplicitAny: true`). Avoid `any` types; prefer strict interfaces and type guards.

3. **Inspect Existing Code First**
   - Inspect existing code, project structure, and dependencies before modifying or adding files. Avoid destructive overwrites.

4. **Security & Credential Management**
   - Keep API keys, private keys, and payment credentials strictly server-side.
   - Never expose secrets (PayPal client secrets, Gemini keys, Channel3/Kernel API keys) to client bundles or commit them to source control.

5. **Deterministic Financial Safeguards**
   - Enforce financial constraints, budget limits, price tolerances, and ceiling thresholds using deterministic server-side code.
   - Never delegate financial decision boundaries or enforcement logic solely to nondeterministic LLM outputs.

6. **Mandatory Independent Verification Before Settlement**
   - Never allow payment capture or fund disbursement without an independent, successful audit and verification check.
   - Settlement flows must be cryptographically verified and gatechecked.

7. **Genuine Cryptographic Verification**
   - Use genuine SHA-256 hashing and verifiable cryptographic operations for Merkle trees, audit trails, and state hashes.
   - Do not use mock hashes or fake checksums in cryptographic verification code.

8. **Integrity of External API Integrations**
   - Never fabricate successful external API responses.
   - Real integrations (PayPal, Gemini, Kernel, Channel3) must handle failures, latency, and status codes explicitly.

9. **Clear Delineation of Real vs. Simulated Integrations**
   - Clearly distinguish real live integrations from fixtures, test stubs, and simulations in both code naming and user-facing status indicators.
   - Never label a planned or mocked feature as complete or live.

10. **Honest Testing & Failure Reporting**
    - Run automated tests, type checks, and linters faithfully.
    - Report test and build failures honestly without suppressing or obscuring issues.
