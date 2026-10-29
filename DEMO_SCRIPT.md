# PACTUM — 5–7 Minute Hackathon Demonstration Script & Presenter Runbook

> **Product Principle:** "Negotiate Intelligently. Settle Verifiably."  
> **Core Message:** "AI negotiates the deal. Deterministic controls decide whether it can settle."

---

## 1. Pre-Demo Checklist & Setup

Before starting the evaluation:

1. **Environment & Server**:
   ```bash
   cd /path/to/Pactum-Paypal
   npm run build # Ensure production bundle is valid
   npm run dev   # Start local Next.js dev server on port 3000
   ```
2. **Verify Port & Browser**:
   - Open browser at `http://localhost:3000`.
   - Verify network connectivity or ensure `.env` has `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` configured for PayPal Sandbox.
3. **Presenter Fallbacks & Contingency Plan**:
   - **Google Gemini API**: If `GEMINI_API_KEY` is not set or rate-limited, PACTUM automatically engages its deterministic Boulware concession engine with transparent fallback provenance attribution.
   - **Channel3 / Kernel**: If partner credentials are absent, deterministic wholesale catalog fixtures and local DOM attestations are used and clearly badged.
   - **PayPal Sandbox**: Real Sandbox orders are created via `api-m.sandbox.paypal.com`. If PayPal Sandbox is temporarily slow or unreachable, the Settlement Center displays the exact error message and prevents capture.

---

## 2. Timed 5–7 Minute Evaluator Walkthrough

```
Timeline Summary:
[0:00 - 0:45] Act 1: The Problem & Opening Thesis
[0:45 - 1:45] Act 2: Mandate Definition & Multi-Vendor Sourcing
[1:45 - 3:00] Act 3: Live Arena & Deterministic Guardrail Interventions
[3:00 - 3:45] Act 4: Agreement Acceptance & Pre-Settlement Merkle Root
[3:45 - 4:45] Act 5: Independent ACWORLD 5-Invariant Pre-Checkout Audit
[4:45 - 5:45] Act 6: PayPal Sandbox Orders v2 Authorization & Settlement Gate
[5:45 - 6:45] Act 7: Post-Audit Capture, B2B Invoice & Evidence Vault Inspection
[6:45 - 7:00] Act 8: Conclusion & Q&A
```

---

### Act 1: The Problem & Opening Thesis (0:00 – 0:45)

- **Screen**: Overview Screen (`http://localhost:3000/?screen=overview`)
- **What Presenter Clicks**: None (stand on Overview).
- **What Evaluator Sees**:
  - The Institutional Command Header with live metric cards: Total Procurement Volume, Active Runs, Verified Realized Savings.
  - Core principle: "Negotiate Intelligently. Settle Verifiably."
- **What Presenter Explains**:
  > "Today, autonomous AI agents can search the web and negotiate wholesale contracts. But in enterprise procurement, LLMs cannot be trusted with company funds. An AI might hallucinate a price, agree to a 2-day delivery SLA that a supplier cannot meet, leak private reservation prices, or skip the procurement return policy.
  >
  > PACTUM solves this with a strict separation of concerns:
  > **AI negotiates the deal. Deterministic controls decide whether it can settle.**"

---

### Act 2: Mandate Definition & Multi-Vendor Sourcing (0:45 – 1:45)

- **Screen**: Sourcing Screen (`http://localhost:3000/?screen=sourcing`)
- **What Presenter Clicks**:
  1. Click **"Sourcing"** in the top navigation bar (or click "Start New Procurement Mandate" on the Overview).
  2. Click **"Scenario A ($8.5k / 25 4K Monitors)"** preset button.
  3. Click **"Source Wholesale Suppliers"**.
- **What Evaluator Sees**:
  - Form fields populate: 25 units, item query "4K USB-C monitors", budget $8,500 USD, max 5-day delivery, min 30-day returns.
  - Sourcing spinner runs, then 3 competing wholesale suppliers appear in a comparison table:
    - **Apex Displays Wholesale**: $350.00 ask, 4-day delivery, 30-day return.
    - **DisplayWorld Direct**: $385.00 ask, 3-day delivery, 35-day return.
    - **NexTech B2B Supplies**: $360.00 ask, 5-day delivery, 30-day return.
  - Each supplier card displays compliance badges: "Eligible • Rank #1", "Within Budget", and explicit source attribution (`Simulated Fixture` or `Channel3 Wholesale`).
- **What Presenter Explains**:
  > "We enter our procurement mandate: Purchase 25 4K USB-C monitors under an $8,500 budget with delivery within 5 days and at least a 30-day return policy.
  > PACTUM locks these requirements into a canonical mandate and sources three competing wholesale offers. Notice that all three offers start near or above $350–$385 per unit. We need rational negotiation to secure discounts without sacrificing our delivery or return SLAs."

---

### Act 3: Live Arena & Deterministic Guardrail Interventions (1:45 – 3:00)

- **Screen**: Negotiation Arena (`http://localhost:3000/?screen=arena`)
- **What Presenter Clicks**:
  1. Click **"Commence Multi-Vendor Negotiation"** (or "Enter Arena").
- **What Evaluator Sees**:
  - Real-time Server-Sent Events (SSE) stream into the transcript.
  - Active vendor quote cards dynamically update bid/ask prices on each turn.
  - **Round 1**: Rational buyer opening offers are submitted. Vendors return concessions.
  - **Round 2 (Guardrail Demonstration)**:
    - A highlighted intervention block appears: `GUARDRAIL_BLOCKED` / `GUARDRAIL_INTERVENTION`.
    - Mathematical reason displayed: The proposed offer failed the Boulware time-decay threshold or triggered boundary constraint protection.
    - The outbound message was **purged before transmission** to the supplier, and the buyer agent was forced to regenerate within mathematical feasibility bounds.
  - **Rounds 3 & 4**: Monotonic price concessions continue until consensus is reached.
- **What Presenter Explains**:
  > "Watch Round 2 carefully. This is PACTUM's Mechanism-Design Firewall. If the buyer agent proposes an irrational offer, tries to leak our reservation price, or violates anti-thrashing bounds ($p_{t-1} \le p_t \le p_{vendor,t-1}$), the guardrail intercepts and blocks the packet before it leaves the server.
  > The evaluator can see the mathematical proof right in the transcript. The model cannot bypass this firewall."

---

### Act 4: Agreement Acceptance & Pre-Settlement Merkle Root (3:00 – 3:45)

- **Screen**: Negotiation Arena (`http://localhost:3000/?screen=arena`)
- **What Presenter Clicks**: None (let stream conclude).
- **What Evaluator Sees**:
  - Final consensus event appears:
    - `Consensus Reached with DisplayWorld Direct` (or optimal scoring vendor).
    - Final unit price: ~$326.39.
    - Final landed cost: $8,259.75 (within $8,500 budget ceiling).
    - Net realized procurement savings: +$240.25 (or greater vs. baseline).
    - `Agreement Accepted: Mutual agreement recorded and committed to pre-settlement Merkle tree.`
  - Button unlocks: **"Proceed to Settlement Gate"**.
- **What Presenter Explains**:
  > "Negotiation has concluded. An authoritative agreement record is formed with mutual acceptance between the buyer agent and the winning supplier.
  > All rounds, quotes, and attestations are immediately committed to a binary SHA-256 Merkle tree, yielding a 64-character Pre-Settlement Merkle Root. But payment is still NOT approved. Now we enter the zero-trust settlement gate."

---

### Act 5: Independent ACWORLD 5-Invariant Pre-Checkout Audit (3:45 – 4:45)

- **Screen**: Settlement Center (`http://localhost:3000/?screen=settlement`)
- **What Presenter Clicks**:
  1. Click **"Proceed to Settlement Gate"** (or click "Settlement Center" in navigation).
  2. In the right panel, observe the **"Independent ACWORLD Audit Gate"**.
  3. Click **"Run Evaluation"** (or "Re-Run Audit").
- **What Evaluator Sees**:
  - Audit spinner evaluates server-side invariants.
  - Status updates to `All 5 Invariants Independently Verified` (`Audit Passed 5/5`):
    1. **SKU & Condition Integrity**: PASSED (Matches `DWD-4K-27-UB`, condition `NEW`).
    2. **Price Ceiling & Arithmetic**: PASSED ($8,259.75 landed <= $8,500.00 budget ceiling).
    3. **Return Policy SLA**: PASSED (35 days >= 30 days mandated; marked with `Supplier Claim`).
    4. **Delivery SLA**: PASSED (3 days <= 5 days mandated).
    5. **Cryptographic Lineage**: PASSED (Pre-settlement Merkle root verified).
  - The primary action button changes from disabled to enabled: **"Continue to PayPal"**.
- **What Presenter Explains**:
  > "Before touching PayPal, the server executes ACWORLD—an independent zero-trust auditor. It does not trust the LLM, the frontend, or client claims. It independently recomputes all arithmetic in safe minor units and verifies all five invariants.
  > If any invariant fails, the settlement button remains strictly locked. Because all five pass, the gate opens."

---

### Act 6: PayPal Sandbox Orders v2 Authorization & Settlement Gate (4:45 – 5:45)

- **Screen**: Settlement Center -> PayPal Sandbox Checkout -> Return Handler
- **What Presenter Clicks**:
  1. Click **"Continue to PayPal"**.
  2. The browser navigates to the authentic PayPal Sandbox approval URL (`https://www.sandbox.paypal.com/checkoutnow?token=...`).
  3. Presenter points out the browser URL bar: `www.sandbox.paypal.com`.
  4. (Optional in live demo, or use test buyer credentials): Log in to Sandbox and click "Authorize" / "Continue".
  5. Upon redirection back to `http://localhost:3000/settlement/return?sessionId=...&token=...`:
     - The page displays: "Verifying PayPal Sandbox Approval..."
     - Then displays: "Payment Verified & Settled".
- **What Evaluator Sees**:
  - The PayPal Order is created with `intent: "AUTHORIZE"`.
  - The Orders v2 `custom_id` contains `VERIPAY_ROOT:<merkle_root>`, cryptographically binding the payment to the procurement flight recorder.
  - Return screen shows:
    - PayPal Order ID (`286654348T599554P` or live sandbox token).
    - PayPal Capture ID.
    - PayPal B2B Invoice ID (status: `SENT`).
    - Post-audit Merkle digest.
- **What Presenter Explains**:
  > "Notice where we were redirected: `sandbox.paypal.com`. We created an authentic PayPal Orders v2 order with `intent: AUTHORIZE`.
  > We bound our 64-character Merkle root directly into PayPal's `custom_id`. Even after buyer approval, funds are not released until the server verifies the authorization and runs the final capture gate."

---

### Act 7: Post-Audit Capture, B2B Invoice & Evidence Vault Inspection (5:45 – 6:45)

- **Screen**: Evidence Vault (`http://localhost:3000/?screen=vault`)
- **What Presenter Clicks**:
  1. Click **"Evidence Vault"** in top navigation.
  2. Expand the **"Evaluator Guide: Understanding VeriPay Evidence & ACWORLD Audit"** accordion.
  3. Toggle between **"Event Sequence Timeline"** and **"Binary Merkle Tree Levels"**.
- **What Evaluator Sees**:
  - **Side-by-side Merkle Roots**:
    - Pre-Settlement Merkle Root (bound to PayPal order).
    - Post-Audit Settlement Root (commits the audit certificate and capture receipt).
  - **Audit Context Metadata**: Certificate ID, Mandate Version `v1`, Agreement ID.
  - **5-Invariant Table**: Complete rule breakdown, authoritative values, and status badges.
  - **Canonical Event Timeline**:
    - `MANDATE_LOCKED`
    - `CHANNEL3_CATALOG_SNAPSHOT`
    - `KERNEL_DOM_ATTESTATION`
    - `VERIFIED_NEGOTIATION_ROUND` (Rounds 1–4)
    - `ACWORLD_FINAL_STATE_AUDIT`
    - `PAYPAL_SETTLEMENT`
  - **Integrity Footer Disclaimer**:
    > "Merkle root proves chronological record integrity; merchant performance is subject to external SLA verification."
- **What Presenter Explains**:
  > "Finally, let's open the Evidence Vault. Here is the complete cryptographic flight recorder.
  > Notice that we distinguish the pre-settlement root from the post-audit root to avoid circular dependencies.
  > If any participant later claims the price was different or delivery was 2 days, we can produce a SHA-256 Merkle inclusion proof verifying the exact state committed at the time of payment.
  > And we are transparent: the Merkle root proves record integrity; it doesn't magically guarantee real-world supplier behavior, which is why return policies and dispute evidence packaging are built into the platform."

---

### Act 8: Conclusion & Q&A (6:45 – 7:00)

- **Screen**: Overview Screen (`http://localhost:3000/?screen=overview`)
- **What Presenter Clicks**: Click **"Overview"**.
- **What Evaluator Sees**: Realized savings updated, session recorded in history.
- **Closing Statement**:
  > "PACTUM bridges the gap between autonomous AI agents and fiduciary financial safety.
  > AI negotiates the deal. Deterministic controls decide whether it can settle.
  > Thank you, and I look forward to your questions."

---

## 3. Contingency Handling & Frequently Asked Questions

| Scenario | Presenter Action / System Behavior |
| :--- | :--- |
| **Evaluator asks: "Can the AI hallucinate an approval?"** | Point to `SettlementCenterScreen.tsx` and `acworld-auditor.ts`. Explain that the AI has no tool to capture funds; capture requires a signed, server-side audit certificate evaluating 5 deterministic invariants. |
| **Evaluator asks: "What if Gemini API has an outage or rate limit?"** | Explain and demonstrate `GeminiNegotiationClient`: PACTUM detects 429/timeouts and seamlessly engages its deterministic Boulware concession curve with complete provenance transparency. |
| **Evaluator asks: "Is this real money?"** | Clarify: "No, this operates strictly on PayPal Sandbox (`api-m.sandbox.paypal.com`). Live money movement is strictly prohibited in this phase." |
| **Evaluator asks: "Does the Merkle tree guarantee the supplier actually delivers?"** | Point out the explicit disclaimer on the Evidence Vault: "The Merkle tree commits to recorded evidence and timestamps. Physical delivery remains subject to real-world performance, which is why PACTUM includes dispute evidence generation." |
