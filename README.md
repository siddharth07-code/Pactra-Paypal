# PACTUM

**Negotiate Intelligently. Settle Verifiably.**

Autonomous B2B procurement with rational AI negotiation, cryptographic evidence, independent verification, and PayPal-powered settlement.

---

## Current Implementation Status: Phase 0 Foundation

> [!IMPORTANT]
> **Phase 0 Notice**: The current state of this repository is the project foundation.
> **Vendor negotiation, Merkle tree cryptographic verification, and PayPal Sandbox integration are NOT YET IMPLEMENTED.**
> There are intentionally no fabricated transactions, fake vendors, synthetic payment IDs, or mock verification results in this repository.

### Subsystem Implementation Roadmap
| Subsystem | Scope | Status |
| :--- | :--- | :--- |
| **Project Foundation** | Next.js 15 App Router, React 19, TypeScript Strict Mode, Tailwind CSS, Vitest | **VERIFIED** |
| **Vendor Negotiation Engine** | Multi-round autonomous bargaining with bounded budget constraints | **NOT IMPLEMENTED** |
| **Merkle Verification Audit** | SHA-256 evidence tree computation and zero-trust independent audit | **NOT IMPLEMENTED** |
| **PayPal Sandbox Settlement** | Two-phase authorization, conditional capture, and verified disbursement | **NOT IMPLEMENTED** |

---

## Prerequisites

- **Node.js**: `v20.x` or higher (verified with Node `v24.15.0`)
- **npm**: `v10.x` or higher (verified with npm `v11.12.1`)
- **Git**

---

## Environment Variable Setup

1. Copy the example environment template:
   ```bash
   cp .env.example .env.local
   ```
2. Configure credentials in `.env.local` when integrating subsequent phases:
   ```env
   GEMINI_API_KEY=
   PAYPAL_CLIENT_ID=
   PAYPAL_CLIENT_SECRET=
   PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
   CHANNEL3_API_KEY=
   KERNEL_API_KEY=
   ```
   > [!NOTE]
   > All secret-bearing files (`.env`, `.env*.local`) are ignored by Git. Never commit API keys or PayPal credentials.

---

## Installation & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the Phase 0 landing page.

### 3. Run Quality & Verification Checks
- **TypeScript Type Check**:
  ```bash
  npm run typecheck
  ```
- **Linting (ESLint)**:
  ```bash
  npm run lint
  ```
- **Unit & Integration Tests (Vitest)**:
  ```bash
  npm run test
  ```
- **Production Build**:
  ```bash
  npm run build
  ```

---

## Project Structure

```text
src/
  app/
    api/              # Server-side API route handlers
    globals.css       # Tailwind CSS & fintech design tokens
    layout.tsx        # Root HTML layout and metadata
    page.tsx          # Phase 0 landing page and subsystem tracker
  components/         # Reusable UI components
  lib/                # Core utilities, cryptographic functions, and client helpers
  types/              # Strict TypeScript interface declarations
.antigravity/
  rules.md            # Authoritative development rules and constraints
.env.example          # Environment variable documentation template
.gitignore            # Strict Git exclusion definitions
README.md             # Project documentation
package.json          # Dependencies and verified scripts
tsconfig.json         # Strict TypeScript compiler configuration
vitest.config.ts      # Vitest test runner configuration
```
