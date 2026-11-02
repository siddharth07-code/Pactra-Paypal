/**
 * PACTUM — Settlement Center Semantic Lifecycle Tests
 * Phase 6.2 Test Suite
 *
 * Covers all 12 required lifecycle scenarios:
 * 1. No agreement.
 * 2. Vendor selected but no agreement.
 * 3. Agreement accepted.
 * 4. Audit pending.
 * 5. Audit failed.
 * 6. Audit passed.
 * 7. PayPal order created.
 * 8. PayPal approval completed (authorized).
 * 9. Uncertain capture (reconciliation required).
 * 10. Capture completed.
 * 11. Settlement completed.
 * 12. No fabricated financial values or identifiers.
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import type {
  ProcurementSession,
  VendorQuote,
  NegotiationOffer,
  AuditCertificate,
  AgreementRecord,
} from "@/types/pactum";

function createMockSession(overrides: Partial<ProcurementSession> = {}): ProcurementSession {
  return {
    id: "session_test_12345678",
    status: "SOURCING",
    mandate: {
      id: "mandate_1",
      rawPrompt: "Purchase 25 4K monitors under $8,500 total budget",
      itemQuery: "4K USB-C Monitor",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [{ name: "Resolution", value: "4K", mandatory: true }],
      currency: "USD",
      createdAt: new Date().toISOString(),
    },
    quotes: [],
    turns: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const mockQuote: VendorQuote = {
  vendorId: "vendor_apex",
  vendorName: "Apex Displays",
  sku: "APEX-4K-USB-C",
  productTitle: "Apex 27-inch 4K USB-C Monitor",
  initialUnitAsk: 340,
  currentUnitBid: 320,
  shippingCost: 150,
  deliveryDays: 4,
  returnDays: 35,
  condition: "NEW",
  status: "ACTIVE",
  dataSource: "CHANNEL3",
};

const mockOffer: NegotiationOffer = {
  unitPrice: 320,
  quantity: 25,
  deliveryDays: 4,
  returnDays: 35,
  shippingCost: 150,
};

const mockAgreement: AgreementRecord = {
  agreementId: "agr_apex_round3_test",
  sessionId: "session_test_12345678",
  vendorId: "vendor_apex",
  vendorName: "Apex Displays",
  sku: "APEX-4K-USB-C",
  agreedPrice: 320,
  agreedOffer: mockOffer,
  totalCost: 8150, // 320 * 25 + 150 = 8150
  agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
  acceptingParty: "VENDOR",
  acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
  round: 3,
  acceptedAt: new Date().toISOString(),
  mandateVersion: 1,
};

const mockPassingAudit: AuditCertificate = {
  certificateId: "cert_audit_pass_123",
  sessionId: "session_test_12345678",
  passed: true,
  status: "VALID",
  verifiedRoot: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
  timestamp: new Date().toISOString(),
  invariants: [
    { name: "SKU_INTEGRITY", passed: true, reason: "SKU and condition match mandate requirements exactly." },
    { name: "PRICE_CEILING", passed: true, reason: "Landed cost $8,150 <= max budget $8,500." },
    { name: "RETURN_POLICY", passed: true, reason: "Return policy of 35 days satisfies mandate 30 days." },
    { name: "DELIVERY_SLA", passed: true, reason: "Delivery SLA 4 days satisfies mandate 5 days." },
    { name: "CRYPTOGRAPHIC_LINEAGE", passed: true, reason: "Merkle root matches authoritative lineage." },
  ],
};

const mockFailingAudit: AuditCertificate = {
  certificateId: "cert_audit_fail_456",
  sessionId: "session_test_12345678",
  passed: false,
  status: "INVALID",
  verifiedRoot: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
  timestamp: new Date().toISOString(),
  invariants: [
    { name: "SKU_INTEGRITY", passed: true, reason: "SKU matches." },
    { name: "PRICE_CEILING", passed: false, reason: "Total landed cost $9,200 exceeds max budget $8,500." },
    { name: "RETURN_POLICY", passed: true, reason: "Return policy verified." },
    { name: "DELIVERY_SLA", passed: false, reason: "Delivery SLA 7 days exceeds mandate 5 days." },
    { name: "CRYPTOGRAPHIC_LINEAGE", passed: true, reason: "Lineage valid." },
  ],
};

describe("SettlementCenterScreen — Semantic Lifecycle Verification", () => {
  // Scenario 1: No agreement
  it("Scenario 1: No agreement shows 'Not established' values and no misleading savings or continue button", () => {
    const session = createMockSession({
      status: "SOURCING",
      selectedQuote: undefined,
      finalOffer: undefined,
      agreementRecord: undefined,
    });

    render(<SettlementCenterScreen session={session} />);

    // Supplier & terms
    expect(screen.getByText("Awaiting agreement")).toBeDefined();
    // Unit price is "Not established", NOT "$0.00"
    expect(screen.queryByText("$0.00")).toBeNull();
    // Quantity reflects the authoritative mandate quantity (25 units), NOT 0 units
    expect(screen.getByText("25 units")).toBeDefined();
    expect(screen.queryByText("0 units")).toBeNull();
    // Landed cost is "Not established", NOT "$0 USD"
    expect(screen.queryByText("$0 USD")).toBeNull();
    // Savings must NOT be shown
    expect(screen.queryByText(/Procurement Savings/i)).toBeNull();
    expect(screen.queryByText(/100.0%/i)).toBeNull();

    // Primary action must show Awaiting Accepted Agreement, NOT Continue to PayPal
    expect(screen.getByText(/Awaiting Accepted Agreement/i)).toBeDefined();
    expect(screen.getByText(/Accept a vendor agreement to continue/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /Continue to PayPal/i })).toBeNull();

    // Header badge reflects settlement lifecycle
    expect(screen.getByText("Awaiting Vendor Selection")).toBeDefined();

    // Invariants show NOT EVALUATED
    const notEvaluatedBadges = screen.getAllByText("NOT EVALUATED");
    expect(notEvaluatedBadges.length).toBe(5);

    // PayPal artifacts empty state
    expect(screen.getByText("No PayPal transaction has been created yet.")).toBeDefined();
    expect(screen.queryByText("Pending Authorization")).toBeNull();
    expect(screen.queryByText("Pending Server Capture")).toBeNull();
  });

  // Scenario 2: Vendor selected but no agreement
  it("Scenario 2: Vendor selected but no agreement indicates awaiting agreement and displays mandate quantity", () => {
    const session = createMockSession({
      status: "NEGOTIATING",
      selectedQuote: mockQuote,
      finalOffer: undefined,
      agreementRecord: undefined,
    });

    render(<SettlementCenterScreen session={session} />);

    // Supplier indicates selected but awaiting agreement
    expect(screen.getByText("Apex Displays (Awaiting Agreement)")).toBeDefined();
    // Unit price not established
    expect(screen.queryByText("$0.00")).toBeNull();
    // Authoritative mandate quantity
    expect(screen.getByText("25 units")).toBeDefined();
    // Header badge shows negotiation in progress
    expect(screen.getByText("Negotiation In Progress")).toBeDefined();
    // Continue to PayPal not available
    expect(screen.queryByRole("button", { name: /Continue to PayPal/i })).toBeNull();
    expect(screen.getByText(/Awaiting Accepted Agreement/i)).toBeDefined();
  });

  // Scenario 3: Agreement accepted
  it("Scenario 3: Agreement accepted displays real agreed terms, landed cost, and calculated savings", () => {
    const session = createMockSession({
      status: "AUDIT_PENDING",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
    });

    render(<SettlementCenterScreen session={session} />);

    // Supplier
    expect(screen.getByText("Apex Displays")).toBeDefined();
    // Agreed unit price ($320.00)
    expect(screen.getByText("$320.00")).toBeDefined();
    // Agreed quantity
    expect(screen.getByText("25 units")).toBeDefined();
    // Delivery SLA and Return window
    expect(screen.getByText("4 days (max 5 days)")).toBeDefined();
    expect(screen.getByText("35 days (min 30 days)")).toBeDefined();
    // Agreed landed cost: 320 * 25 + 150 = $8,150.00
    expect(screen.getByText("$8,150.00")).toBeDefined();
    // Savings: 8,500 - 8,150 = $350 (4.1%)
    expect(screen.getByText("+$350.00 (4.1%)")).toBeDefined();
    // Header badge reflects awaiting audit
    expect(screen.getByText("Awaiting Audit")).toBeDefined();
  });

  // Scenario 4: Audit pending
  it("Scenario 4: Audit pending provides single clear audit trigger and shows PENDING invariants", () => {
    const session = createMockSession({
      status: "AUDIT_PENDING",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: undefined,
    });

    render(<SettlementCenterScreen session={session} />);

    // Primary action is to run ACWORLD Pre-Checkout Audit
    expect(screen.getByRole("button", { name: /Run ACWORLD Pre-Checkout Audit/i })).toBeDefined();
    // Banner indicates audit not yet run
    expect(screen.getByText("Audit Not Yet Run")).toBeDefined();
    // Invariants show PENDING
    const pendingBadges = screen.getAllByText("PENDING");
    expect(pendingBadges.length).toBe(5);
    // Continue to PayPal must NOT be available yet
    expect(screen.queryByRole("button", { name: /Continue to PayPal/i })).toBeNull();
  });

  // Scenario 5: Audit failed
  it("Scenario 5: Audit failed displays failed invariants and blocks checkout", () => {
    const session = createMockSession({
      status: "AUDIT_FAILED",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockFailingAudit,
    });

    render(<SettlementCenterScreen session={session} />);

    // Header badge shows Audit Blocked
    expect(screen.getByText("Audit Blocked")).toBeDefined();
    // Card banner shows 2 failed invariants
    expect(screen.getByText("2 of 5 checks failed — Checkout Blocked")).toBeDefined();
    // Invariant badges show PASS and FAIL
    expect(screen.getAllByText("PASS").length).toBe(3);
    expect(screen.getAllByText("FAIL").length).toBe(2);
    // Primary action button is blocked
    const blockedBtn = screen.getByRole("button", { name: /Checkout Blocked — Audit Failed/i });
    expect(blockedBtn.hasAttribute("disabled")).toBe(true);
    // Continue to PayPal is NOT clickable
    expect(screen.queryByRole("button", { name: /Continue to PayPal/i })).toBeNull();
  });

  // Scenario 6: Audit passed
  it("Scenario 6: Audit passed displays 5/5 verified and enables Continue to PayPal", () => {
    const session = createMockSession({
      status: "AUDIT_PASSED",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
    });

    render(<SettlementCenterScreen session={session} />);

    // Header badge shows Audit Passed
    expect(screen.getByText("Audit Passed")).toBeDefined();
    // Banner shows 5/5 verified
    expect(screen.getByText("5/5 checks passed")).toBeDefined();
    // All 5 invariants show PASS
    expect(screen.getAllByText("PASS").length).toBe(5);
    // Continue to PayPal button is enabled
    const continueBtn = screen.getByRole("button", { name: /Continue to PayPal/i });
    expect(continueBtn.hasAttribute("disabled")).toBe(false);
  });

  // Scenario 7: PayPal order created
  it("Scenario 7: PayPal order created displays approval action and actual order ID", () => {
    const session = createMockSession({
      status: "AWAITING_PAYPAL_APPROVAL",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
      paypalOrderId: "9AB12345CD678901E",
      paypalApprovalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=9AB12345CD678901E",
      merkleRoot: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
    });

    render(<SettlementCenterScreen session={session} />);

    // Header badge
    expect(screen.getByText("Awaiting PayPal Approval")).toBeDefined();
    // Approval button
    expect(screen.getByRole("button", { name: /Complete PayPal Sandbox Approval/i })).toBeDefined();
    // Order ID artifact is displayed
    expect(screen.getByText("9AB12345CD678901E")).toBeDefined();
    // Merkle root is displayed
    expect(screen.getByText("a1b2c3d4e5f67890...")).toBeDefined();
  });

  // Scenario 8: PayPal approval completed (authorized)
  it("Scenario 8: PayPal authorization completed presents Run ACWORLD Audit & Capture", () => {
    const session = createMockSession({
      status: "PAYPAL_AUTHORIZED",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
      paypalOrderId: "9AB12345CD678901E",
      paypalAuthorizationId: "AUTH_789XYZ",
      merkleRoot: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
    });

    render(<SettlementCenterScreen session={session} />);

    // Header badge
    expect(screen.getByText("Authorized by Buyer")).toBeDefined();
    // Capture action
    expect(screen.getByRole("button", { name: /Run ACWORLD Audit & Capture/i })).toBeDefined();
  });

  // Scenario 9: Uncertain capture (reconciliation required)
  it("Scenario 9: Uncertain capture blocks blind retries and offers reconciliation only", () => {
    const session = createMockSession({
      status: "CAPTURE_PENDING_RECONCILIATION",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
      paypalOrderId: "9AB12345CD678901E",
    });

    render(<SettlementCenterScreen session={session} />);

    // Header badge
    expect(screen.getByText("Awaiting Reconciliation")).toBeDefined();
    // Warning banner and blind retry block notice
    expect(screen.getByText("Blind Capture Retries Blocked — Reconciliation Required")).toBeDefined();
    // Reconcile button is present
    expect(screen.getByRole("button", { name: /Reconcile PayPal Status/i })).toBeDefined();
    // Capture button must NOT be present
    expect(screen.queryByRole("button", { name: /Audit & Capture/i })).toBeNull();
  });

  // Scenario 10 & 11: Capture completed & Settlement completed
  it("Scenario 10 & 11: Completed capture and settlement display completion state and transaction artifacts", () => {
    const session = createMockSession({
      status: "SETTLED",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
      paypalOrderId: "9AB12345CD678901E",
      paypalCaptureId: "CAP_987654321",
      paypalInvoiceId: "INV2-XYZ-123",
      invoiceStatus: "PAID",
      merkleRoot: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
    });

    render(<SettlementCenterScreen session={session} />);

    // Header badge
    expect(screen.getByText("Settlement Completed")).toBeDefined();
    // Completion notice
    expect(screen.getByText("PayPal Funds Captured & Invoice Created")).toBeDefined();
    // Artifacts rendered
    expect(screen.getByText("9AB12345CD678901E")).toBeDefined();
    expect(screen.getByText("CAP_987654321")).toBeDefined();
    expect(screen.getByText("INV2-XYZ-123")).toBeDefined();
    expect(screen.getByText("STATUS: PAID")).toBeDefined();
  });

  // Scenario 12: No fabricated financial values or identifiers
  it("Scenario 12: Never fabricates identifiers or financial values", () => {
    const session = createMockSession({
      status: "SOURCING",
      selectedQuote: undefined,
      finalOffer: undefined,
      agreementRecord: undefined,
      paypalOrderId: undefined,
      paypalCaptureId: undefined,
      paypalInvoiceId: undefined,
      merkleRoot: undefined,
    });

    render(<SettlementCenterScreen session={session} />);

    // No fake IDs or placeholder records looking like transaction IDs
    expect(screen.queryByText(/Pending Authorization/i)).toBeNull();
    expect(screen.queryByText(/Pending Server Capture/i)).toBeNull();
    expect(screen.queryByText(/Pending Invoice Generation/i)).toBeNull();
    expect(screen.queryByText(/Pending Tree Seal/i)).toBeNull();

    // No fake $0.00 agreed unit price
    expect(screen.queryByText("$0.00")).toBeNull();
    // No fake 0 units
    expect(screen.queryByText("0 units")).toBeNull();
    // No fake $0 landed cost
    expect(screen.queryByText("$0 USD")).toBeNull();
    // No fake 100% savings
    expect(screen.queryByText("100.0%")).toBeNull();
  });
});
