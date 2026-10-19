/**
 * PACTUM — Shared Domain Types
 * As specified in GEMINI.md Section 4 and SECURITY.md
 *
 * Monetary representation note:
 * To prevent floating-point inaccuracies, monetary totals and prices should be represented
 * safely. In these types, numbers represent standard currency units (e.g. USD dollars and cents as number)
 * with strict finite and non-negative constraints, and helper functions in mechanism-guardrail.ts
 * convert to integer minor units (cents) for exact arithmetic.
 */

export type CurrencyCode = "USD" | "EUR" | "GBP" | string;

export interface RequiredSpecification {
  name: string;
  value: string;
  mandatory: boolean;
}

/**
 * 4.1 ProcurementMandate
 * Natural-language mandate parsed into deterministic constraints
 */
export interface ProcurementMandate {
  id: string;
  rawPrompt: string;
  itemQuery: string;
  quantity: number;
  maxTotalBudget: number; // authoritative budget
  maxDeliveryDays: number;
  minReturnDays: number;
  requiredSpecs: RequiredSpecification[];
  currency: CurrencyCode;
  createdAt: string;
  version?: number; // Revision / version number (default 1)
  isLocked?: boolean; // Locked for negotiation / settlement
  requiredCondition?: ProductCondition; // Condition requirement when specified
}

export type ProductCondition = "NEW" | "REFURBISHED" | "USED";
export type VendorQuoteStatus = "ACTIVE" | "REJECTED" | "ACCEPTED" | "COUNTERED";
export type DataSource = "CHANNEL3" | "MOCK_CATALOG" | "DIRECT_FEED";

/**
 * 4.2 VendorQuote
 * Competing wholesale vendor offer
 */
export interface VendorQuote {
  vendorId: string;
  vendorName: string;
  sku: string;
  productTitle: string;
  initialUnitAsk: number; // Initial asking unit price
  currentUnitBid: number; // Current negotiated unit price
  shippingCost: number; // Shipping cost
  deliveryDays: number; // Delivery SLA in days
  returnDays: number; // Return policy window in days
  condition: ProductCondition;
  status: VendorQuoteStatus;
  dataSource: DataSource;
}

/**
 * Negotiation structured offer vector: x_t = (p_t, q_t, d_t, r_t)
 */
export interface NegotiationOffer {
  unitPrice: number; // p_t: unit price
  quantity: number; // q_t: quantity
  deliveryDays: number; // d_t: delivery time in days
  returnDays: number; // r_t: return window in days
  shippingCost: number; // S_ship(x_t): shipping cost
}

export type NegotiationActor = "BUYER" | "VENDOR";
export type GuardrailStatus = "APPROVED" | "GUARDRAIL_BLOCKED" | "GUARDRAIL_INTERVENTION";

/**
 * 4.3 NegotiationTurn
 * An individual round in multi-agent bargaining
 */
export interface NegotiationTurn {
  id?: string;
  round: number; // discrete round t = 1...T
  vendorId: string;
  actor: NegotiationActor;
  message: string;
  proposedOffer: NegotiationOffer;
  utilityScore?: number; // U_b(x_t)
  boulwareThreshold?: number; // tau(t)
  guardrailStatus: GuardrailStatus;
  guardrailReason?: string;
  timestamp: string;
}

/**
 * 4.4 MerkleAuditNode
 * Committed flight-recorder event in SHA-256 Merkle tree
 */
export type MerkleEventType =
  | "MANDATE_LOCKED"
  | "MANDATE_REVISED"
  | "CHANNEL3_CATALOG_SNAPSHOT"
  | "KERNEL_DOM_ATTESTATION"
  | "VERIFIED_NEGOTIATION_ROUND"
  | "ACWORLD_FINAL_STATE_AUDIT"
  | "SETTLEMENT_AUTHORIZED"
  | "SETTLEMENT_CAPTURED";

export interface MerkleAuditNode {
  index: number;
  eventType: MerkleEventType;
  timestamp: string;
  payloadHash: string; // SHA-256 of canonical event data
  leafHash: string; // SHA-256(0x00 || canonicalJSON(event))
}

/**
 * Merkle Tree inclusion proof for a specific leaf
 */
export interface MerkleInclusionProofStep {
  position: "left" | "right";
  hash: string;
}

export interface MerkleInclusionProof {
  leafIndex: number;
  leafHash: string;
  proof: MerkleInclusionProofStep[];
  rootHash: string;
}

/**
 * Guardrail verification outcome returned by mechanism-guardrail.ts
 */
export interface GuardrailCheckDetail {
  passed: boolean;
  predicate: "A_FEASIBILITY" | "B_RESERVATION_LEAK" | "C_UTILITY" | "D_BOULWARE" | "E_ANTI_THRASHING";
  reason?: string;
  computedValues?: Record<string, number | string | boolean | undefined | null>;
}

export interface GuardrailResult {
  passed: boolean;
  status: GuardrailStatus;
  reason?: string;
  predicateFailed?: GuardrailCheckDetail["predicate"];
  details: GuardrailCheckDetail[];
  utilityScore?: number;
  boulwareThreshold?: number;
}

/**
 * ACWORLD Audit Invariant verification report
 */
export interface InvariantResult {
  name: "SKU_INTEGRITY" | "PRICE_CEILING" | "RETURN_POLICY" | "DELIVERY_SLA" | "CRYPTOGRAPHIC_LINEAGE";
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface AuditCertificate {
  certificateId: string;
  sessionId: string;
  passed: boolean;
  invariants: InvariantResult[];
  verifiedRoot: string;
  timestamp: string;
  orderReference?: string;
}

export type ProcurementSessionStatus =
  | "MANDATE_PENDING"
  | "SOURCING"
  | "NEGOTIATING"
  | "AUDIT_PENDING"
  | "AUDIT_PASSED"
  | "AUDIT_FAILED"
  | "PAYPAL_AUTHORIZED"
  | "PAYPAL_CAPTURED"
  | "SETTLED"
  | "DISPUTED";

/**
 * Authoritative procurement session
 */
export interface ProcurementSession {
  id: string;
  mandate: ProcurementMandate;
  quotes: VendorQuote[];
  turns: NegotiationTurn[];
  selectedQuote?: VendorQuote;
  finalOffer?: NegotiationOffer;
  status: ProcurementSessionStatus;
  merkleRoot?: string; // Pre-settlement evidence root
  preSettlementRoot?: string; // Explicit pre-settlement evidence root
  postAuditRoot?: string; // Root after ACWORLD_FINAL_STATE_AUDIT event is recorded
  auditCertificate?: AuditCertificate;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalInvoiceId?: string;
  captureAmount?: number;
  invoiceStatus?: "DRAFT" | "SENT" | "PAID" | "FAILED";
  merchantAttestation?: {
    merchantUrl: string;
    domSnapshotHash?: string;
    returnPolicyText: string;
    timestamp: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type PayPalOperationType = "AUTHORIZE" | "CAPTURE" | "CREATE_INVOICE" | "SEND_INVOICE" | "DISPUTE_EVIDENCE";

export interface PayPalOperationResult {
  operation: PayPalOperationType;
  success: boolean;
  orderId?: string;
  captureId?: string;
  invoiceId?: string;
  customIdRootReference?: string;
  error?: string;
  timestamp: string;
}

/**
 * SSE Negotiation Stream Event Types
 */
export type NegotiationStreamEventType =
  | "SESSION_INITIALIZED"
  | "SOURCING_COMPLETED"
  | "ROUND_STARTED"
  | "BUYER_PROPOSAL"
  | "GUARDRAIL_INTERVENTION"
  | "GUARDRAIL_BLOCKED"
  | "VENDOR_COUNTEROFFER"
  | "ROUND_COMPLETED"
  | "NEGOTIATION_COMPLETED"
  | "NEGOTIATION_FAILED";

export interface NegotiationStreamEvent {
  type: NegotiationStreamEventType;
  sessionId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}
