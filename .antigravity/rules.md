# .antigravity/rules.md — PACTUM Architectural, Security & Development Rules

These rules govern the development of the PACTUM project and MUST be followed strictly across all development phases.

> **CRITICAL DIRECTIVE**:
> Before modifying or implementing any code, the agent MUST read and strictly follow BOTH `GEMINI.md` and `SECURITY.md`.
> - `GEMINI.md` is the authoritative project and engineering specification.
> - `SECURITY.md` defines mandatory, non-negotiable security requirements.
> If a security requirement conflicts with an implementation shortcut or demo requirement, the security requirement ALWAYS takes precedence. Never disable, bypass, or weaken security controls.

---

### Core Development Principles

1. **Dual Policy Precedence**
   - Read and adhere to both `GEMINI.md` and `SECURITY.md` before making any changes. All models, workflows, and code must conform to both documents.

2. **Strict TypeScript**
   - Enforce strict TypeScript across the entire codebase (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`). Avoid `any` types; prefer strict interfaces and type guards.

3. **Inspect Existing Code First**
   - Inspect existing code, dependencies, and configuration before modifying or adding files. Avoid destructive overwrites.

4. **Security & Credential Management**
   - Store all credentials server-side. Never expose API keys, client secrets, access tokens, or private keys to client bundles, browser code, logs, or Git.
   - Maintain `.env.example` with placeholders only. Ensure secret-bearing files remain strictly excluded by `.gitignore`.

5. **Deterministic Financial Safeguards**
   - Enforce financial constraints, budget limits, price tolerances, and ceiling thresholds using deterministic server-side code.
   - Never delegate financial decision boundaries, validations, or enforcement logic solely to nondeterministic LLM outputs.

6. **Mandatory Independent Verification Before Settlement**
   - Never allow payment capture or fund disbursement without an independent, successful audit and verification check.
   - Settlement flows must be cryptographically verified and gatechecked. Never trust client-supplied audit or payment status.

7. **Genuine Cryptographic Verification**
   - Use genuine Node.js native cryptographic primitives (`crypto`) for SHA-256 Merkle trees, audit trails, and state hashing.
   - Never use mock hashes or fake checksums in cryptographic code.

8. **Integrity of External API Integrations**
   - Never fabricate successful external API responses.
   - Real integrations (PayPal, Gemini, Kernel, Channel3) must handle failures, latency, and status codes explicitly.

9. **Clear Delineation of Real vs. Simulated Integrations**
   - Clearly distinguish real live integrations from fixtures, test stubs, and simulations in both code naming and user-facing status indicators.
   - Never label a planned or mocked feature as complete or live.

10. **Honest Testing & Failure Reporting**
    - Run automated tests, type checks, and linters faithfully.
    - Report test and build failures honestly without suppressing or obscuring issues. Never use meaningless assertions or skip checks.
