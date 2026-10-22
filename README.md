# PACTUM
### Negotiate Intelligently. Settle Verifiably.

PACTUM is an AI-powered procurement and settlement platform that helps businesses source products, negotiate with vendors within predefined constraints, and execute settlements only after independently verifiable evidence satisfies mandatory procurement rules.

Instead of treating procurement as a conversation followed by a payment, PACTUM makes the entire process accountable—from defining purchasing requirements and comparing vendors to validating negotiated terms, recording tamper-evident evidence, and authorizing settlement.

**Source intelligently. Negotiate within constraints. Settle only when the evidence checks out.**

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [Core Features](#core-features)
- [How It Works](#how-it-works)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Application Screens](#application-screens)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Procurement Guardrails](#procurement-guardrails)
- [Evidence and Verification](#evidence-and-verification)
- [Payment Integration](#payment-integration)
- [Security Considerations](#security-considerations)
- [Testing](#testing)
- [Current Limitations](#current-limitations)
- [Future Improvements](#future-improvements)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Traditional procurement workflows involve disconnected sourcing tools, manual negotiations, fragmented documentation, and payment approvals that can be difficult to audit.

PACTUM brings these operations into a unified workflow.

A buyer defines a procurement mandate in natural language. The platform converts that mandate into structured constraints, discovers potential vendors, compares available offers, and facilitates AI-assisted negotiations. A deterministic guardrail engine evaluates proposed terms against the buyer's requirements, while a cryptographic evidence trail records important events.

Before settlement, an independent audit evaluates the final procurement state. Payment authorization and capture are permitted only when the required checks have passed and the configured payment workflow supports the operation.

### Design Principles

- **Autonomous, but constrained:** AI assists with sourcing and negotiation without overriding procurement rules.
- **Deterministic enforcement:** Financial and contractual constraints are evaluated by application logic rather than relying on an AI model's judgment.
- **Verifiable evidence:** Important procurement events can be linked through a tamper-evident evidence structure.
- **Fail-closed settlement:** Missing, failed, or incomplete mandatory verification must not be treated as approval.
- **Transparent execution:** Simulated integrations and unavailable external services must be distinguishable from real operations.

---

## The Problem

AI-assisted procurement introduces several challenges:

1. **Uncontrolled negotiations:** An AI agent may propose terms that exceed a buyer's budget or violate delivery and return requirements.
2. **Fragmented evidence:** Quotes, negotiation decisions, contractual conditions, and payment records may exist in separate systems.
3. **Unverifiable outcomes:** A successful negotiation does not automatically establish that the final agreement satisfies every purchasing requirement.
4. **Premature settlement:** Payment should not proceed merely because a negotiation has ended.
5. **Limited accountability:** Procurement decisions need traceable evidence that can be inspected and independently evaluated.

PACTUM addresses these challenges by combining AI-assisted procurement with deterministic validation, cryptographic evidence, and a gated settlement workflow.

---

## Our Solution

PACTUM separates intelligent decision-making from deterministic enforcement.

The AI layer helps interpret purchasing requirements, identify suitable vendors, and generate negotiation proposals. The enforcement layer independently checks proposed terms against the active procurement mandate.

The evidence layer records relevant events and establishes cryptographic relationships between them. An audit layer evaluates the resulting procurement state before the settlement workflow can proceed.

This separation is fundamental: **AI can recommend a deal, but it cannot authorize a deal that violates mandatory procurement constraints.**

---

## Core Features

### 1. Natural-Language Procurement Mandates

Describe purchasing requirements using natural language.

For example:

> Procure 25 4K USB-C monitors within a total budget of $8,500. Delivery must be completed within five days, and the vendor must offer a return policy of at least 30 days.

The application can use this description to establish structured procurement requirements, including:

- Product and quantity
- Maximum total budget
- Delivery deadline
- Minimum return-policy duration
- Currency
- Negotiation parameters

The example above represents a demonstration scenario, not a universal policy. Actual constraints should come from the validated mandate associated with the procurement session.

### 2. Intelligent Vendor Sourcing

Discover and compare potential suppliers based on product requirements, pricing, delivery commitments, and return conditions.

Where supported by the configured integrations, the sourcing workflow can collect vendor information and supporting evidence.

The interface should distinguish live vendor responses from fixture-based or simulated results.

### 3. AI-Assisted Negotiation

PACTUM facilitates structured negotiations between a buyer-side agent and vendor-side agents.

The negotiation workflow evaluates proposals against the active mandate and tracks changes to relevant commercial terms.

Negotiation rounds can consider:

- Unit price
- Quantity
- Shipping costs
- Delivery time
- Return-policy duration

The objective is to identify a commercially acceptable offer without violating mandatory purchasing requirements.

### 4. Deterministic Guardrail Engine

The guardrail engine evaluates proposed offers independently of the AI model.

It checks applicable constraints such as:

- Budget compliance
- Price and quantity arithmetic
- Delivery requirements
- Return-policy requirements
- Negotiation progression
- Offer validity

Invalid proposals should be rejected or prevented from advancing according to the configured negotiation rules.

### 5. Cryptographic Evidence Trail

PACTUM uses SHA-256 hashing and a Merkle-based evidence structure to support integrity verification.

Relevant procurement events can be linked into an evidence chain so that modifications to recorded data can be detected when the verification process is correctly implemented.

The evidence interface is intended to make the procurement history inspectable rather than presenting opaque transaction identifiers without context.

### 6. Independent Procurement Audit

Before settlement, an audit evaluates the final procurement state against mandatory invariants.

The audit must evaluate actual session data and recorded evidence rather than relying on presentation-layer status indicators.

An incomplete audit must never be represented as a successful audit.

### 7. Gated Payment Workflow

PACTUM is designed to integrate with PayPal for payment operations.

The intended workflow connects the verified procurement outcome to payment authorization, capture, and associated records where the relevant integrations are configured.

The existence of a PayPal API credential or a successful OAuth request alone does not establish that the complete payment workflow has been executed successfully.

### 8. Procurement History

Review previous procurement sessions, negotiation outcomes, evidence records, audit results, and available transaction details.

Historical records should reflect the actual persisted state and distinguish completed operations from pending, failed, or simulated actions.

---

## How It Works

```text
┌──────────────────────────────────────────┐
│            BUYER MANDATE                 │
│  Products, budget, delivery, returns     │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│       MANDATE VALIDATION                 │
│  Parse, validate, and lock constraints   │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│         VENDOR SOURCING                  │
│  Discover suppliers and collect quotes   │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│       AI-ASSISTED NEGOTIATION            │
│  Buyer agent ↔ Vendor agents             │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│      DETERMINISTIC GUARDRAILS            │
│  Validate every proposed offer           │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│       CRYPTOGRAPHIC EVIDENCE             │
│  Record events and verify lineage        │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│       INDEPENDENT AUDIT                  │
│  Verify mandatory procurement invariants │
└────────────────────┬─────────────────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │ Audit requirements  │
          │       satisfied?    │
          └─────────┬───────────┘
                    │
             ┌──────┴──────┐
             │             │
             ▼             ▼
       ┌──────────┐  ┌──────────────┐
       │  BLOCK   │  │  SETTLEMENT  │
       │  REVIEW  │  │  AUTHORIZED  │
       └──────────┘  └──────┬───────┘
                            │
                            ▼
                 ┌────────────────────┐
                 │ PayPal Integration │
                 │ Payment Operations │
                 └────────────────────┘
```

The diagram describes the intended workflow. The availability of each stage depends on the implemented code, configured integrations, and current session state.

---

## System Architecture

PACTUM uses a web application architecture that separates the user interface, server-side orchestration, procurement rules, evidence verification, and external integrations.

```text
PACTUM
│
├── Frontend
│   ├── Overview
│   ├── Sourcing
│   ├── Negotiation Arena
│   ├── Evidence Vault
│   ├── Settlement Center
│   └── Procurement History
│
├── Application Layer
│   ├── Mandate Validation
│   ├── Procurement Session Management
│   ├── Negotiation Orchestration
│   ├── Guardrail Evaluation
│   ├── Evidence Management
│   └── Settlement Coordination
│
├── AI and External Integrations
│   ├── Google Gemini
│   ├── Vendor Sourcing Integration
│   ├── Browser-Based Evidence Collection
│   └── PayPal APIs
│
├── Verification Layer
│   ├── Deterministic Constraints
│   ├── SHA-256 Hashing
│   ├── Merkle Evidence Verification
│   └── ACWORLD Audit
│
└── Data Layer
    ├── Procurement Sessions
    ├── Negotiation Events
    ├── Evidence Records
    └── Payment References
```

### Architectural Responsibilities

| Component | Responsibility |
|---|---|
| Frontend | Display procurement state and provide user interactions |
| Application layer | Orchestrate sourcing, negotiation, and settlement workflows |
| AI services | Assist with mandate interpretation and negotiation |
| Guardrail engine | Enforce deterministic procurement constraints |
| Evidence layer | Record and verify cryptographic evidence |
| ACWORLD audit | Independently evaluate mandatory invariants |
| PayPal integration | Execute supported payment operations |
| Data layer | Persist session state and related records where configured |

The architecture describes component responsibilities. Refer to the source code and configuration to determine which integrations and persistence mechanisms are currently operational.

---

## Technology Stack

### Frontend

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS v4
- Shadcn UI
- Lucide React
- AG Grid and AG Charts, where implemented

### AI and Orchestration

- Google Gemini API
- Server-side agent orchestration
- Server-Sent Events (SSE), where configured

### Backend

- Next.js App Router and server-side API routes
- Node.js
- TypeScript
- REST API patterns

### Evidence and Verification

- Node.js cryptographic APIs
- SHA-256 hashing
- Merkle-based evidence verification
- Deterministic procurement guardrails
- ACWORLD audit

### External Integrations

- PayPal APIs
- Channel3 sourcing integration, where configured
- Kernel Cloud Browser evidence collection, where configured

### Data and Persistence

- Session storage and persistence mechanisms present in the repository
- SQLite and Prisma, if enabled by the current implementation
- JSON-based local persistence, if enabled by the current implementation

The stack above describes the project's technology and integration targets. Not every listed integration should be assumed to be configured or production-ready in every environment.

---

## Application Screens

PACTUM is organized around six primary screens.

### Overview

Provides a summary of procurement activity and entry points into the workflow.

### Sourcing

Allows users to define procurement requirements, discover vendors, and compare available offers.

### Negotiation Arena

Displays negotiation activity, proposed terms, and guardrail decisions.

### Evidence Vault

Provides access to procurement evidence, event history, and available cryptographic verification details.

### Settlement Center

Presents audit readiness and the next available settlement actions.

Settlement actions must remain unavailable until the mandatory audit requirements have been satisfied.

### Procurement History

Provides access to previous sessions and their available negotiation, audit, evidence, and payment details.

The interface should accurately represent the underlying application state rather than displaying fabricated metrics, placeholder hashes, or unverified transaction outcomes.

---

## Getting Started

### Prerequisites

Install the following tools:

- Node.js compatible with the project's dependencies
- npm
- Git

You may also need API credentials for the external services you intend to enable.

### 1. Clone the Repository

```bash
git clone https://github.com/siddharth07-code/Pactum-Paypal.git
cd Pactum-Paypal
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Inspect the repository for `.env.example` and follow the variable names expected by the current implementation.

Create a local environment file if required:

```bash
cp .env.example .env
```

Copying the example file does not populate valid API credentials. Add the required values locally.

### 4. Start the Development Server

```bash
npm run dev
```

Open the local address printed by Next.js, usually:

```text
http://localhost:3000
```

### 5. Run Available Checks

Inspect the scripts in `package.json` before running the project's checks.

Common commands, when defined, include:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

A command should only be run if the corresponding script exists in the repository.

---

## Environment Configuration

The following names are illustrative. Always use the actual variable names defined in `.env.example` and referenced by the source code.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API authentication |
| `PAYPAL_CLIENT_ID` | PayPal application client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal application secret |
| `PAYPAL_BASE_URL` | PayPal API environment endpoint |
| Vendor integration credentials | Authentication for configured sourcing services |
| Browser evidence credentials | Authentication for configured browser evidence services |

For PayPal Sandbox, the API base URL is commonly:

```text
https://api-m.sandbox.paypal.com
```

Use the endpoint appropriate to the environment in which you are testing.

### Credential Safety

- Never commit `.env` files containing secrets.
- Keep API credentials on the server.
- Never expose private keys or client secrets through `NEXT_PUBLIC_` variables.
- Keep `.env.example` limited to variable names and safe placeholder values.
- Rotate credentials if they are accidentally exposed.
- Verify that secret files are excluded by `.gitignore`.

---

## Procurement Guardrails

PACTUM's deterministic guardrail engine evaluates proposals against the active procurement mandate.

For a mandate with a total budget $begin:math:text$B\_\{\\max\}$end:math:text$, quantity $begin:math:text$q$end:math:text$, maximum delivery time $begin:math:text$D\_\{\\max\}$end:math:text$, and minimum return period $begin:math:text$R\_\{\\min\}$end:math:text$, a proposed offer must satisfy the applicable constraints.

### Budget Constraint

For unit price $begin:math:text$p$end:math:text$ and shipping cost $begin:math:text$s$end:math:text$:

$begin:math:display$
\\text\{Total Cost\} \= \(p \\times q\) \+ s
$end:math:display$

The budget requirement is:

$begin:math:display$
\(p \\times q\) \+ s \\leq B\_\{\\max\}
$end:math:display$

All monetary calculations should use integer minor units or an appropriate decimal-safe representation.

### Delivery Constraint

$begin:math:display$
d \\leq D\_\{\\max\}
$end:math:display$

The proposed delivery time must not exceed the mandate's maximum.

### Return Policy Constraint

$begin:math:display$
r \\geq R\_\{\\min\}
$end:math:display$

The proposed return-policy duration must satisfy the minimum requirement.

The implementation should also establish the required merchant attestation where applicable.

### Negotiation Utility

The configured negotiation mechanism combines price, delivery, and return-policy preferences:

$begin:math:display$
U\_b \= 0\.70P \+ 0\.15D \+ 0\.15R
$end:math:display$

Where:

- $begin:math:text$P$end:math:text$ represents normalized price utility.
- $begin:math:text$D$end:math:text$ represents normalized delivery utility.
- $begin:math:text$R$end:math:text$ represents normalized return-policy utility.

The Boulware-style concession threshold is:

$begin:math:display$
\\tau\(t\) \=
U\_\{\\min\} \+
\(1\-U\_\{\\min\}\)
\\left\(
1\-\\left\(\\frac\{t\}\{T\}\\right\)\^\\beta
\\right\)
$end:math:display$

Where:

- $begin:math:text$t$end:math:text$ is the current negotiation round.
- $begin:math:text$T$end:math:text$ is the configured maximum number of rounds.
- $begin:math:text$\\beta$end:math:text$ controls the concession curve.

The documented default is $begin:math:text$\\beta\=3$end:math:text$. The implementation must handle invalid inputs and zero denominators explicitly.

### Offer Progression

The anti-thrashing rule is:

$begin:math:display$
p\_\{t\-1\} \\leq p\_t \\leq p\_\{\\text\{vendor\}\,t\-1\}
$end:math:display$

This inequality is applied according to the defined negotiation semantics. Round-one handling must be treated separately because there is no previous buyer offer.

The guardrail engine must reject invalid or out-of-range proposals rather than silently altering them.

---

## Evidence and Verification

PACTUM's evidence system is intended to provide an auditable record of procurement events.

### Evidence Lifecycle

1. Record a relevant procurement event.
2. Serialize its data deterministically.
3. Calculate its cryptographic hash.
4. Link it to the appropriate evidence lineage.
5. Recompute and verify the evidence structure when auditing.
6. Associate the verified evidence with the correct procurement session and payment context.

### ACWORLD Audit

Before settlement, the audit evaluates five mandatory invariants.

| Invariant | Verification Requirement |
|---|---|
| SKU and condition integrity | The final offer matches the required product and condition |
| Price arithmetic | The total is correct and remains within the mandate budget |
| Return-policy compliance | The required return period is satisfied and supported by the required merchant attestation |
| Delivery compliance | The delivery commitment satisfies the mandate |
| Evidence lineage | The evidence root is valid and bound to the correct procurement session and PayPal order |

The audit must derive its results from actual session state and evidence.

**A missing audit, incomplete invariant, invalid evidence root, or failed verification must not be interpreted as a successful audit.**

Cryptographic hashes provide evidence of data integrity only when the hashing, canonicalization, storage, and verification processes are implemented correctly. They do not independently prove that a vendor's original claims are truthful.

---

## Payment Integration

PACTUM is designed to connect verified procurement outcomes with PayPal payment operations.

Depending on the implemented integration and configured credentials, the intended workflow may involve:

1. Preparing a payment order.
2. Obtaining the required buyer approval.
3. Authorizing payment where supported by the selected flow.
4. Rechecking the procurement session and audit gate.
5. Capturing payment only when all mandatory conditions are satisfied.
6. Recording the resulting payment reference.
7. Associating available invoices, disputes, and webhook events with the relevant procurement record.

These operations are distinct. An OAuth token, an order creation response, an authorization, a capture, and an invoice represent different stages of a payment workflow.

The application must report the actual state returned by PayPal and must not fabricate transaction identifiers or claim a payment succeeded without confirmation.

For development, use PayPal Sandbox credentials and verify each supported operation independently.

---

## Security Considerations

PACTUM handles procurement mandates, commercial terms, evidence records, and payment-related workflows. These require careful server-side enforcement.

### Required Safeguards

- Validate all incoming requests on the server.
- Enforce mandate constraints independently of AI-generated output.
- Prevent the client from bypassing guardrail or audit checks.
- Bind evidence and payment references to the correct session.
- Invalidate stale offers and audits when the mandate changes.
- Keep credentials out of client-side bundles and version control.
- Verify webhook authenticity before accepting payment events.
- Use appropriate authorization checks before exposing or modifying session data.
- Avoid trusting client-supplied prices, audit statuses, or payment statuses.
- Treat external API responses as untrusted input.
- Fail closed when mandatory verification cannot be completed.
- Record failures and important state transitions without leaking secrets.

### Important Distinction

Cryptographic evidence and deterministic rules do not automatically make an application secure. Authentication, authorization, session isolation, persistence integrity, rate limiting, and production deployment controls must also be implemented and tested.

---

## Testing

The project should be validated at several levels.

### Unit Tests

Test individual components, including:

- Mandate parsing and validation
- Budget arithmetic
- Delivery and return-policy checks
- Negotiation utility calculations
- Boulware threshold calculations
- Offer progression rules
- Hash generation
- Merkle proof verification
- ACWORLD invariant evaluation

### Integration Tests

Verify interactions between:

- Procurement sessions and sourcing
- Sourcing results and negotiation
- Negotiation and guardrail enforcement
- Evidence generation and audit verification
- Audit readiness and settlement authorization
- Payment responses and recorded transaction state

### Failure and Edge-Case Tests

Include cases such as:

- Missing or malformed mandates
- Invalid monetary values
- Unsupported currencies
- Budget overruns
- Missing vendor attestations
- Excessive delivery times
- Insufficient return periods
- Modified evidence records
- Invalid or mismatched evidence roots
- Missing audit results
- Failed external API requests
- Duplicate webhook events
- Stale negotiations after a mandate change

Tests should use mocks or fixtures when external credentials are unavailable. Such tests demonstrate the behavior of the mocked workflow, not the successful operation of the corresponding live service.

---

## Current Limitations

The operational status of integrations depends on the current repository state and environment configuration.

Potential limitations include:

- Some sourcing and browser evidence operations may rely on fixtures when external services are unavailable.
- AI-generated responses may be simulated in demonstration mode.
- Live PayPal operations require valid credentials and successful execution of the relevant API workflows.
- Local session persistence may not provide the durability or concurrency guarantees required for production.
- Authentication and tenant-level authorization require explicit implementation and verification.
- Cryptographic evidence cannot independently establish the truth of externally supplied vendor claims.
- Production readiness requires security testing, deployment configuration, observability, and operational validation.

These limitations should be updated as the implementation evolves. Do not present planned features as completed functionality.

---

## Future Improvements

Potential next steps include:

- Durable database-backed procurement sessions
- Authentication and role-based access control
- Multi-tenant procurement isolation
- Richer vendor comparison and filtering
- Improved evidence visualization and proof inspection
- Expanded audit reports and exportable evidence packages
- More comprehensive payment lifecycle handling
- Webhook reconciliation and idempotency
- Improved error recovery and observability
- Automated end-to-end tests for configured external integrations
- Production deployment hardening

---

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a focused feature branch.
3. Make the smallest coherent change that addresses the intended improvement.
4. Add or update tests for affected behavior.
5. Run the available lint, type-check, test, and build commands.
6. Review the diff for accidental changes, leaked secrets, and unrelated formatting.
7. Open a pull request with a clear description of the change and its verification.

Changes affecting financial constraints, evidence integrity, or settlement authorization should include explicit tests demonstrating that invalid states cannot bypass enforcement.

---

## License

Check the repository for an existing `LICENSE` file and follow its terms. If no license has been selected, the project's licensing status should be clarified before the code is redistributed or reused.

---

<div align="center">

**PACTUM**

*Negotiate Intelligently. Settle Verifiably.*

</div>