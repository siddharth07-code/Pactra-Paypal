# PACTRA — Master Engineering Specification

> Negotiate Intelligently. Settle Verifiably.

## 1. Product Vision

PACTRA combines PactumPay and VeriPay into an autonomous B2B procurement and cryptographic payment-verification platform built on PayPal.

- **PactumPay:** Product sourcing, multi-vendor competition, and rational AI negotiation.
- **VeriPay:** Deterministic negotiation guardrails, SHA-256 Merkle evidence, and independent final-state auditing.
- **PayPal:** Order authorization, audited payment capture, B2B invoicing, and dispute-evidence submission.

The system must prevent irrational negotiations, budget leakage, constraint violations, unauthorized payment capture, and unverifiable procurement histories.

The primary demonstration: purchase 25 4K USB-C monitors under an $8,500 total budget, with delivery within five days and a minimum 30-day return policy.

## 2. Technology Stack

- Frontend: Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS, Shadcn UI, Lucide React.
- Financial cockpit: `ag-grid-react` v32+ and `ag-charts-react`.
- AI: Google Gemini API, Model Context Protocol (MCP).
- Backend: Next.js API routes, Node.js runtime.
- Streaming: Server-Sent Events (SSE).
- Payments: PayPal Orders v2, Invoicing API, Disputes API, PayPal MCP Server, webhooks where applicable.
- Sourcing: Channel3 API.
- Merchant evidence: Kernel Cloud Browser.
- Cryptography: Node.js native `crypto`, SHA-256 binary Merkle tree.
- Persistence: SQLite with Prisma initially.
- Deployment: Render or an appropriate compatible hosting platform.

Use strict TypeScript and compatible dependency versions. Keep all secrets server-side.

## 3. System Architecture

Implement the following transaction pipeline:

1. **Mission Control:** Procurement officer submits a natural-language mandate.
2. **Mandate Parser:** Extracts product requirements, quantity, maximum total budget, delivery deadline, and minimum return window.
3. **Sourcing Engine:** Queries Channel3 for three competing wholesale offers, including SKU, specifications, and baseline prices.
4. **Merchant Attestation:** Kernel captures merchant DOM evidence and return-policy text.
5. **Negotiation Arena:** A Gemini-powered buyer agent negotiates with three vendor agents over MCP.
6. **Mechanism-Design Firewall:** Deterministically validates every outgoing buyer offer and message before transmission.
7. **Merkle Flight Recorder:** Commits procurement events and negotiation history into a SHA-256 Merkle tree.
8. **ACWORLD Auditor:** Independently verifies the final purchase against the original mandate.
9. **PayPal Settlement:** Creates an authorization, performs audited capture, and creates a negotiated invoice.
10. **Dispute Resolver:** Generates and verifies Merkle inclusion proofs and submits supported evidence to PayPal when a vendor breach occurs.

The buyer agent may request authorization but cannot independently authorize capture. Capture must remain behind the server-side audit gate.

External integrations must use real APIs when configured. Missing optional Channel3 or Kernel credentials must trigger clearly identified deterministic fixtures rather than fabricated live responses.

## 4. Shared Domain Types

Define shared interfaces in `src/types/pactum.ts`.

### ProcurementMandate
`id`, `rawPrompt`, `itemQuery`, `quantity`, `maxTotalBudget`, `maxDeliveryDays`, `minReturnDays`, required specifications, currency.

### VendorQuote
`vendorId`, `vendorName`, `sku`, `productTitle`, `initialUnitAsk`, `currentUnitBid`, `shippingCost`, `deliveryDays`, `returnDays`, product condition, status, data source.

### NegotiationTurn
`round`, `vendorId`, `actor`, `message`, `proposedOffer`, `utilityScore`, `boulwareThreshold`, `guardrailStatus`, `guardrailReason`.

### MerkleAuditNode
`index`, `eventType`, `timestamp`, `payloadHash`, `leafHash`.

Use additional typed structures for offers, audit reports, Merkle proofs, procurement sessions, and PayPal operation results as required.

## 5. PactumPay Mechanism-Design Guardrail

Implement `src/lib/mechanism-guardrail.ts`.

The verifier intercepts every outgoing buyer message and structured offer before it reaches a vendor.

Negotiation runs for discrete rounds `t = 1...T`, with default `T = 5`.

Represent an offer as:

`x_t = (p_t, q_t, d_t, r_t)`

Where:
- `p_t`: unit price.
- `q_t`: quantity.
- `d_t`: delivery time in days.
- `r_t`: return window in days.

### 5.1 Predicate A — Budget and Constraint Feasibility

Let:
- `B_max`: private maximum total budget.
- `S_ship(x_t)`: shipping cost.
- `D_max`: maximum delivery time.
- `R_min`: minimum return window.

Require:

`Total(x_t) = (p_t * q_t) + S_ship(x_t) <= B_max`

Also require:

`d_t <= D_max`

`r_t >= R_min`

Reject the offer immediately if any hard constraint fails.

Validate positive quantities, finite nonnegative prices, shipping costs, and all required fields. Use safe monetary arithmetic.

### 5.2 Predicate B — Reservation-Price Leakage

The buyer's private reservation unit price is:

`p_max = B_max / q_t`

Inspect outgoing message `m_t` using deterministic regex and numeric-token scanning.

Reject messages containing:
- The private maximum budget.
- Numeric representations of the budget within the specified ±3% range.
- Other explicitly prohibited reservation-price disclosures.

Apply the PDF's budget-leak rule faithfully, and document its limitations. Regex scanning alone cannot guarantee detection of every semantic disclosure.

Never expose private budget information in vendor-facing prompts or messages unnecessarily.

### 5.3 Predicate C — Multi-Attribute Utility

Calculate buyer utility:

`U_b(x_t) = w_p * P_t + w_d * D_t + w_r * R_t`

Where:

`P_t = (p_ask - p_t) / (p_ask - p_target)`

`D_t = (D_max - d_t) / (D_max - 1)`

`R_t = (r_t - R_min) / (60 - R_min)`

Weights:

- `w_p = 0.70`
- `w_d = 0.15`
- `w_r = 0.15`

Implement the PDF's normalization exactly. Explicitly handle zero denominators, invalid ranges, and utility bounds rather than silently producing `NaN` or infinity.

### 5.4 Predicate D — Boulware Threshold

Use the Boulware time-decay threshold:

`tau(t) = U_min + (1 - U_min) * (1 - (t / T)^beta)`

Where:
- `beta = 3.0`.
- `T` is the maximum number of rounds.
- `U_min` is the configured minimum utility.

Require:

`U_b(x_t) >= tau(t)`

This implements a strategy that holds firm early and relaxes its minimum utility threshold toward the deadline.

### 5.5 Predicate E — Anti-Thrashing

Enforce the PDF's price monotonicity rule:

`p_(t-1) <= p_t <= p_(vendor,t-1)`

Reject offers that violate the configured relationship between the previous buyer offer, the proposed offer, and the vendor's previous ask.

Do not silently reverse the inequality or change the meaning of the rule.

If the offer fails any predicate:
- Reject it before transmission.
- Emit a `GUARDRAIL_BLOCKED` or `GUARDRAIL_INTERVENTION` event.
- Record the mathematical reason and computed values.
- Ask Gemini to regenerate under tighter constraints.

Implement deterministic tests for all predicates and edge cases.

## 6. Multi-Agent Negotiation Arena

Implement `src/app/api/negotiate/stream/route.ts`.

Use SSE to stream negotiation events to the financial cockpit.

Run four negotiation rounds for the hackathon demonstration across three competing vendors. The guardrail's configured maximum-round parameter must remain explicit and consistent with the selected demonstration configuration.

The buyer agent proposes structured offers. Vendor agents return counteroffers. Every outgoing buyer offer passes the mechanism-design verifier.

The system should:
- Track every offer and counteroffer.
- Calculate utility and threshold values.
- Record approved and rejected turns.
- Compare vendor terms and total costs.
- Select a feasible Pareto-optimal or best-scoring offer according to an explicit deterministic selection policy.
- Stop when the negotiation policy reaches its configured termination condition.

For the demo, deliberately simulate an invalid offer in Round 2 with Vendor B. The guardrail must visibly reject it and trigger regeneration.

Clearly identify simulated vendor behavior. Do not represent fixture responses as live external negotiation APIs.

## 7. VeriPay SHA-256 Merkle Flight Recorder

Implement `src/lib/veripay-merkle.ts` using Node.js native `crypto.createHash('sha256')`.

Maintain an append-only canonical event sequence:

- `MANDATE_LOCKED`: User mandate, budget, required specifications, timestamp.
- `CHANNEL3_CATALOG_SNAPSHOT`: Raw catalog payload and baseline pricing.
- `KERNEL_DOM_ATTESTATION`: Merchant URL, DOM evidence, return-policy text, timestamp.
- `VERIFIED_NEGOTIATION_ROUND`: Offers, counteroffers, and guardrail results.
- `ACWORLD_FINAL_STATE_AUDIT`: Final audit result and evidence.

Each event is canonicalized with sorted JSON keys.

Leaf hash:

`h_i = SHA256(0x00 || CanonicalJSON(e_i))`

Internal parent hash:

`h_parent = SHA256(0x01 || left_hash || right_hash)`

Produce a 64-character hexadecimal Merkle root.

Use actual hash bytes for internal-node hashing, with consistent encoding.

Define and test the odd-node handling rule. Keep proof generation and verification consistent with the tree construction.

Required methods:

- `addEvent(eventType, data)`
- `getRootHash()`
- `getTreeLevels()`
- `generateInclusionProof(leafIndex)`
- `verifyProof(leafHash, proof, rootHash)`

Test deterministic hashing, empty trees, one leaf, odd and even leaf counts, modified events, invalid indices, tampered proofs, and incorrect roots.

The Merkle root commits to recorded evidence; it does not establish the truth of a merchant's claims independently.

## 8. ACWORLD Final-State Auditor

Implement `src/lib/acworld-auditor.ts`.

Before PayPal capture, run an independent audit against the original mandate and authoritative transaction state.

Verify all five invariants:

1. **SKU Integrity:** `finalCart.sku === selectedChannel3Item.sku`. Verify product condition when mandated.
2. **Price Ceiling and Arithmetic:** Recalculate unit price × quantity + shipping and applicable charges. Verify the result equals the final amount and does not exceed `B_max`.
3. **Return Policy:** `finalCart.returnWindowDays >= mandate.minReturnDays`, supported by the recorded merchant-attestation evidence.
4. **Delivery SLA:** `finalCart.estimatedDeliveryDays <= mandate.maxDeliveryDays`.
5. **Cryptographic Lineage:** Recompute the Merkle root from authoritative events and verify equality with the root associated with the PayPal order's `custom_id`.

Use integer minor units or decimal-safe monetary arithmetic.

The auditor must not trust client-supplied audit results or a caller-provided `passed: true` value.

Return an audit certificate containing individual invariant results, failure reasons, verified root, timestamp, and session/order references.

Any mandatory failure must block capture.

## 9. PayPal Sandbox Integration

Implement `src/lib/paypal-client.ts`.

Sandbox endpoint:

`https://api-m.sandbox.paypal.com`

Use OAuth 2.0 credentials from environment variables, with safe in-memory token caching.

### 9.1 Order Authorization

Create an Orders v2 order using `intent: "AUTHORIZE"`.

Include the procurement session reference and a root reference such as:

`VERIPAY_ROOT:<merkle_root>`

in the appropriate supported order metadata field.

Use the correct supported amount breakdown for the original price and negotiated discount. Ensure all amounts reconcile with the actual amount payable.

Do not assume PayPal supports arbitrary metadata or arbitrary discount fields. Validate requests against the API schema.

### 9.2 Audited Capture

Capture only after the server independently verifies:
- The procurement session and order association.
- The order's current state.
- The expected amount.
- The audit result.
- The Merkle root.

Use the correct supported capture endpoint for the current authorization state. Handle duplicate requests and retries safely.

### 9.3 B2B Invoice

Create a negotiated invoice using the PayPal Invoicing API.

Include itemized quantities, prices, negotiated discounts, and a Merkle-root reference in supported fields.

Distinguish draft creation, sending, and payment status.

### 9.4 Dispute Evidence

Implement the supported PayPal Disputes evidence workflow.

Prepare evidence including:
- Original mandate.
- Merchant DOM/return-policy attestation.
- Negotiation transcript.
- Final-state audit.
- Relevant Merkle inclusion proofs.
- Details of the observed vendor breach.

Use the documented evidence schema and multipart requirements where applicable.

Only report successful submission when the API confirms it. Cryptographic evidence does not guarantee a favorable dispute outcome.

### 9.5 Webhooks and MCP

Use PayPal webhooks for supported transaction-state synchronization, validating webhook authenticity.

Integrate the PayPal MCP Server and `@paypal/agent-toolkit` where compatible and useful. MCP tools must not bypass server-side authorization and audit controls.

## 10. Partner Integrations and Environment

Implement:
- `src/lib/channel3-client.ts`
- `src/lib/kernel-browser.ts`
- `src/lib/gemini-client.ts`

Environment variables:

- `GEMINI_API_KEY`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_BASE_URL`
- `CHANNEL3_API_KEY`
- `KERNEL_API_KEY`

Maintain `.env.example`; never commit actual credentials.

Channel3 retrieves product SKUs, specifications, and baseline market prices. Kernel captures merchant DOM and return-policy evidence. Gemini proposes negotiation actions using validated structured outputs.

If optional partner credentials are unavailable, use deterministic catalog fixtures and an explicitly identified local HTML snapshotter. Never fabricate successful external API calls.

## 11. API Routes and Persistence

Use this core route structure:

- `POST /api/procurement/init`: Parse mandate, validate constraints, source three quotes, and record evidence.
- `GET/POST /api/negotiate/stream`: Stream negotiation rounds and guardrail results over SSE.
- `POST /api/paypal/settle`: Run the authoritative audit, authorize the order, capture only after successful verification, and create the invoice.
- `POST /api/paypal/dispute`: Generate inclusion proofs and prepare or submit dispute evidence.
- `POST /api/paypal/webhook`: Synchronize verified PayPal events.

Persist procurement sessions, negotiation turns, evidence events, Merkle trees/proofs, audit reports, and PayPal identifiers using SQLite/Prisma initially.

The server is authoritative for all financial and cryptographic state. Never trust a client-supplied Merkle root, negotiation transcript, audit result, price, or payment status.

## 12. Financial Cockpit

Build the main dashboard with:

- `ProcurementHeader.tsx`
- `MandateForm.tsx`
- `VendorArenaGrid.tsx`
- `NegotiationFeed.tsx`
- `MerkleInspector.tsx`
- `PayPalSettlementModal.tsx`
- `src/app/page.tsx`

Display:
- Mandate budget and negotiated spend.
- Savings in currency and percentage.
- Guardrail interventions.
- Three vendor offers.
- Live bid/ask updates and utility indicators.
- Delivery and return SLAs.
- Negotiation transcript with mathematical rejection reasons.
- Merkle leaves, parent hashes, root, and inclusion-proof verification.
- ACWORLD audit certificate.
- Actual PayPal order and invoice results.
- Dispute evidence preparation and submission status.

Use AG Grid for the vendor arena. Keep real data, fixtures, and simulated actions clearly distinguishable. Never fabricate transaction identifiers or operational success indicators.

## 13. Testing and Security

Test the mechanism guardrail, Merkle engine, auditor, and payment gate independently.

Include adversarial tests for budget leaks, invalid offers, utility-threshold violations, price thrashing, wrong SKUs, incorrect totals, inadequate return policies, delivery violations, tampered proofs, and Merkle-root mismatches.

Verify that a failed audit never invokes PayPal capture.

Use mocked APIs for unit tests and separate real Sandbox integration tests.

Never expose credentials, trust unvalidated model output, execute vendor-provided instructions as system instructions, or bypass server-side controls. Validate external responses, prevent duplicate payment operations, and handle failures explicitly.

## 14. Demo Requirements

Prepare a repeatable three-minute demonstration:

- **0:00–0:35:** Explain irrational bargaining, final-state blindness, and the lack of verifiable evidence.
- **0:35–1:30:** Source three vendor offers and demonstrate the Round 2 guardrail rejection.
- **1:30–2:20:** Show the Merkle root, successful ACWORLD audit, PayPal Sandbox authorization/capture, and negotiated invoice.
- **2:20–3:00:** Simulate a vendor breach, generate and verify Merkle inclusion proofs, and demonstrate the supported PayPal evidence workflow.

The interface must distinguish simulated breach conditions from actual PayPal API submissions.

## 15. Implementation Rules

1. Inspect the repository before modifying files.
2. Follow this specification as the authoritative source of truth.
3. Implement incrementally, verifying each subsystem before proceeding.
4. Use strict TypeScript, focused modules, and automated tests.
5. Verify external API contracts instead of inventing behavior.
6. Never claim a real integration works without verifying its response.
7. Never allow Gemini to bypass the guardrail or audit gate.
8. Keep the README, environment example, and implementation synchronized.
9. Report implemented functionality, test results, and unresolved issues honestly.
10. Preserve the mathematical formulas and architecture defined here; flag ambiguities instead of silently changing them.