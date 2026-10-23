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
 * Mandate intelligence status contracts
 */
export type MandateStatus = "READY" | "NEEDS_CLARIFICATION" | "INVALID";
export type MandateExtractorType = "GEMINI_LIVE" | "DETERMINISTIC_PARSER";

/**
 * Structured mandate intelligence extraction output
 */
export interface MandateIntelligenceResult {
  status: MandateStatus;
  mandate?: ProcurementMandate;
  extractor: MandateExtractorType;
  itemQuery?: string;
  quantity?: number;
  maxTotalBudget?: number;
  unitPriceBudget?: number;
  currency?: CurrencyCode;
  maxDeliveryDays?: number;
  minReturnDays?: number;
  requiredSpecs?: RequiredSpecification[];
  requiredCondition?: ProductCondition;
  statedConstraints?: string[];
  missingFields: string[];
  ambiguities: string[];
  contradictions: string[];
  clarificationQuestions: string[];
  suggestedSpecs?: RequiredSpecification[];
  rawPrompt: string;
  latencyMs?: number;
  error?: string;
}

/**
 * 4.2 VendorQuote
 * Competing wholesale vendor offer
 */
export interface VendorQuote {
  vendorId: string;
  vendorName: string;
  sku: string;
  productTitle: string;
  category?: string; // Product commercial category (e.g. "monitors", "laptops", "servers")
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
 * Phase 3: Sourcing & Vendor Evaluation Intelligence Types
 */
export type CompatibilityAssessmentStatus = "MATCH" | "MISMATCH" | "UNKNOWN";
export type QuoteEligibilityStatus = "ELIGIBLE" | "INELIGIBLE" | "NEEDS_REVIEW";
export type EvaluationProvenance = "DETERMINISTIC_RULES" | "GEMINI_ASSISTED" | "SIMULATED_FIXTURE";

export interface SpecificationMatchResult {
  specName: string;
  mandatedValue: string;
  actualValue?: string;
  mandatory: boolean;
  matchStatus: CompatibilityAssessmentStatus;
  evidence?: string;
}

export interface QuoteFinancialEvaluation {
  unitPrice: number;
  quantity: number;
  shippingCost: number;
  landedCost: number;
  maxTotalBudget: number;
  withinBudget: boolean;
  budgetVariance: number; // landedCost - maxTotalBudget (negative = savings)
  currency: string;
  currencySupported: boolean;
}

export interface QuoteSlaEvaluation {
  offeredDeliveryDays: number;
  mandatedMaxDeliveryDays: number;
  deliveryCompliant: boolean;
  offeredReturnDays: number;
  mandatedMinReturnDays: number;
  returnCompliant: boolean;
  offeredCondition: ProductCondition;
  mandatedCondition?: ProductCondition;
  conditionCompliant: boolean;
}

export interface QuoteProductCompatibility {
  categoryMatch: boolean;
  detectedCategory: string;
  mandatedCategory: string;
  specificationMatches: SpecificationMatchResult[];
  overallCompatibility: CompatibilityAssessmentStatus;
  explanation: string;
}

export interface QuoteEvaluation {
  vendorId: string;
  vendorName: string;
  sku: string;
  productTitle: string;
  status: QuoteEligibilityStatus;
  financials: QuoteFinancialEvaluation;
  sla: QuoteSlaEvaluation;
  compatibility: QuoteProductCompatibility;
  evidence: {
    dataSource: DataSource;
    isFixture: boolean;
    hasMerchantAttestation: boolean;
    merchantAttestationWarning?: string;
  };
  disqualificationReasons: string[];
  reviewReasons: string[];
  rankingScore?: number; // 0 to 100, computed only for ELIGIBLE quotes
  rankingBreakdown?: {
    costScore: number; // 0 - 50 pts
    specScore: number; // 0 - 25 pts
    deliveryScore: number; // 0 - 15 pts
    returnScore: number; // 0 - 10 pts
  };
  rankingExplanation?: string;
  evaluationProvenance: EvaluationProvenance;
  evaluatedAt: string;
}

export interface SourcingEvaluationResult {
  evaluations: Record<string, QuoteEvaluation>;
  rankedQuotes: Array<{ quote: VendorQuote; evaluation: QuoteEvaluation }>;
  eligibleQuotes: VendorQuote[];
  ineligibleQuotes: VendorQuote[];
  reviewQuotes: VendorQuote[];
  hasEligibleQuotes: boolean;
  bestQuote?: VendorQuote;
  summary: {
    totalQuotesEvaluated: number;
    eligibleCount: number;
    ineligibleCount: number;
    reviewCount: number;
    evaluatedAt: string;
  };
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
 * Phase 4.1: Agreement Semantics and Offer States
 * Explicit distinction between proposed, counteroffered, accepted, rejected, and expired offers.
 */
export type NegotiationOfferState = "PROPOSED" | "COUNTEROFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
export type AgreementType = "VENDOR_ACCEPTED_BUYER_OFFER" | "BUYER_ACCEPTED_VENDOR_COUNTEROFFER";
export type NegotiationTurnType = "PROPOSAL" | "COUNTEROFFER" | "ACCEPTANCE" | "REJECTION";

export interface AgreementRecord {
  agreementId: string;
  sessionId: string;
  vendorId: string;
  vendorName: string;
  sku: string;
  agreedPrice: number;
  agreedOffer: NegotiationOffer;
  totalCost: number;
  agreedBy: AgreementType;
  round: number;
  acceptedAt: string;
  mandateVersion: number;
}

/**
 * Proposal provenance indicating whether an offer was generated by live Gemini AI or deterministic fallback
 */
export type ProposalGenerator = "GEMINI_LIVE" | "DETERMINISTIC_FALLBACK";

/**
 * Vendor response provenance distinguishing simulated deterministic vendors from live external suppliers
 */
export type VendorResponseProvenance = "SIMULATED_VENDOR" | "LIVE_SUPPLIER";

/**
 * Commercial negotiation strategy types for vendor simulations
 */
export type VendorStrategyType = "FIRM" | "BALANCED" | "FLEXIBLE";

/**
 * Summary of a competing eligible vendor offer for cross-vendor intelligence
 */
export interface CompetingVendorOfferSummary {
  vendorId: string;
  vendorName: string;
  sku: string;
  currentUnitBid: number;
  initialUnitAsk: number;
  shippingCost: number;
  deliveryDays: number;
  returnDays: number;
  currentLandedCost: number;
  dataSource: DataSource;
  eligibilityStatus: QuoteEligibilityStatus;
  compatibilityExplanation?: string;
}

/**
 * Summary of a previous guardrail intervention in the session
 */
export interface GuardrailInterventionSummary {
  round: number;
  vendorId: string;
  status: GuardrailStatus;
  predicateFailed?: string;
  reason: string;
  timestamp: string;
}

/**
 * Phase 4: Structured Negotiation State
 * Authoritative server-side state constructed per vendor and round.
 */
export interface StructuredNegotiationState {
  sessionId: string;
  mandateId: string;
  mandateVersion: number;
  round: number;
  maxRounds: number;
  remainingRounds: number;
  activeVendorId: string;
  originalQuote: VendorQuote;
  currentVendorAsk: number;
  currentBuyerOffer?: NegotiationOffer;
  previousBuyerOffers: NegotiationOffer[];
  previousVendorCounteroffers: Array<{
    round: number;
    unitAsk: number;
    message: string;
    accepted?: boolean;
  }>;
  competingEligibleOffers: CompetingVendorOfferSummary[];
  currentLandedCost: number;
  mandateConstraints: {
    quantity: number;
    maxTotalBudget: number;
    maxDeliveryDays: number;
    minReturnDays: number;
    currency: CurrencyCode;
    requiredSpecs?: RequiredSpecification[];
    requiredCondition?: ProductCondition;
  };
  previousGuardrailInterventions: GuardrailInterventionSummary[];
  agreementRecord?: AgreementRecord;
  status: "ACTIVE" | "TERMINATED_DEAL" | "TERMINATED_NO_DEAL";
}

/**
 * 4.3 NegotiationTurn
 * An individual round in multi-agent bargaining
 */
export interface NegotiationTurn {
  id?: string;
  round: number; // discrete round t = 1...T
  vendorId: string;
  actor: NegotiationActor;
  turnType?: NegotiationTurnType;
  offerState?: NegotiationOfferState;
  agreementId?: string;
  message: string;
  proposedOffer: NegotiationOffer;
  utilityScore?: number; // U_b(x_t)
  boulwareThreshold?: number; // tau(t)
  guardrailStatus: GuardrailStatus;
  guardrailReason?: string;
  generator?: ProposalGenerator;
  vendorProvenance?: VendorResponseProvenance;
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
  | "AWAITING_PAYPAL_APPROVAL"
  | "PAYPAL_AUTHORIZED"
  | "PAYPAL_CAPTURED"
  | "SETTLED"
  | "CANCELLED"
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
  agreementRecord?: AgreementRecord;
  quoteEvaluations?: Record<string, QuoteEvaluation>;
  sourcingSummary?: SourcingEvaluationResult["summary"];
  status: ProcurementSessionStatus;
  merkleRoot?: string; // Pre-settlement evidence root
  preSettlementRoot?: string; // Explicit pre-settlement evidence root
  postAuditRoot?: string; // Root after ACWORLD_FINAL_STATE_AUDIT event is recorded
  auditCertificate?: AuditCertificate;
  paypalOrderId?: string;
  paypalAuthorizationId?: string;
  paypalApprovalUrl?: string;
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
