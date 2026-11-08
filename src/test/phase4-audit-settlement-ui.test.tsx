/**
 * PACTUM — Phase 4 UI Regression & Delivery Verification Suite
 * Verifies Evidence Vault, ACWORLD Audit Gate presentation,
 * Settlement Center lifecycle states, semantic tokens, and accessibility.
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceVaultScreen } from "@/components/EvidenceVaultScreen";
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
    id: "session_phase4_audit_settle",
    status: "SOURCING",
    mandate: {
      id: "mandate_p4_1",
      rawPrompt: "Purchase 25 4K USB-C monitors under $8,500 total budget",
      itemQuery: "4K USB-C monitors",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [],
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
  agreementId: "agr_apex_p4",
  sessionId: "session_phase4_audit_settle",
  vendorId: "vendor_apex",
  vendorName: "Apex Displays",
  sku: "APEX-4K-USB-C",
  agreedPrice: 320,
  agreedOffer: mockOffer,
  totalCost: 8150,
  agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
  acceptingParty: "VENDOR",
  acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
  round: 3,
  acceptedAt: new Date().toISOString(),
  mandateVersion: 1,
};

const mockPassingAudit: AuditCertificate = {
  certificateId: "cert_audit_p4_pass",
  sessionId: "session_phase4_audit_settle",
  passed: true,
  status: "VALID",
  invariants: [
    { name: "SKU_INTEGRITY", passed: true, reason: "Catalog SKU APEX-4K-USB-C matches" },
    { name: "PRICE_CEILING", passed: true, reason: "Landed cost $8,150 <= $8,500" },
    { name: "RETURN_POLICY", passed: true, reason: "35d >= 30d SLA satisfied", isSupplierAttestation: true },
    { name: "DELIVERY_SLA", passed: true, reason: "4d <= 5d SLA satisfied" },
    { name: "CRYPTOGRAPHIC_LINEAGE", passed: true, reason: "Pre-settlement root matches" },
  ],
  verifiedRoot: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  timestamp: new Date().toISOString(),
  mandateVersion: 1,
  agreementId: "agr_apex_p4",
};

describe("Phase 4: Evidence & Audit Presentation", () => {
  it("renders EvidenceVaultScreen with quiet authority semantic tokens without crashing", () => {
    const session = createMockSession({
      status: "AUDIT_PASSED",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
      preSettlementRoot: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    });

    const { container } = render(<EvidenceVaultScreen session={session} />);

    // Renders primary sections
    expect(screen.getByText("Evidence Vault")).toBeInTheDocument();
    expect(screen.getByText("Pre-Settlement Merkle Root")).toBeInTheDocument();
    expect(screen.getByText("Post-Audit Settlement Root")).toBeInTheDocument();
    expect(screen.getByText("ACWORLD Independent Audit Invariants")).toBeInTheDocument();

    // Verify 5 invariants rendered accurately (both desktop table and mobile card exist)
    expect(screen.getAllByText("1. SKU Integrity").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2. Price Ceiling").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3. Return Window").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("4. Delivery SLA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("5. Cryptographic Lineage").length).toBeGreaterThanOrEqual(1);

    // Verify no legacy raw tokens in rendered container
    expect(container.innerHTML).not.toContain("bg-warm-cream");
    expect(container.innerHTML).not.toContain("bg-paper-white");
    expect(container.innerHTML).not.toContain("text-obsidian");
  });

  it("handles uncommitted / pending state in Evidence Vault honestly", () => {
    const session = createMockSession({ status: "SOURCING" });
    render(<EvidenceVaultScreen session={session} />);

    expect(screen.getByText("Awaiting Negotiation")).toBeInTheDocument();
    expect(screen.getByText("Available after verified negotiation completion.")).toBeInTheDocument();
    expect(screen.getAllByText("Not recorded")).toHaveLength(2);
    expect(screen.queryByText("ACWORLD Certified")).not.toBeInTheDocument();
    expect(screen.queryByText("PayPal custom_id bound")).not.toBeInTheDocument();
    expect(screen.getByText(/Pending ACWORLD final audit completion/i)).toBeInTheDocument();
  });
});

describe("Phase 4: Settlement Center Financial & Authorization Controls", () => {
  it("renders authoritative agreed transaction terms and integer-consistent financial amounts", () => {
    const session = createMockSession({
      status: "AUDIT_PASSED",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
    });

    render(<SettlementCenterScreen session={session} />);

    expect(screen.getByText("Apex Displays")).toBeInTheDocument();
    expect(screen.getByText("APEX-4K-USB-C")).toBeInTheDocument();
    expect(screen.getByText("$320.00")).toBeInTheDocument();
    expect(screen.getByText("25 units")).toBeInTheDocument();
    expect(screen.getByText("$8,150.00")).toBeInTheDocument();
    expect(screen.getByText("+$350.00 (4.1%)")).toBeInTheDocument();

    // Continue to PayPal should be enabled since audit passed
    const continueBtn = screen.getByRole("button", { name: /Continue to PayPal/i });
    expect(continueBtn).toBeEnabled();
  });

  it("strictly disables checkout and displays failed invariants when audit fails", () => {
    const failedAudit: AuditCertificate = {
      ...mockPassingAudit,
      passed: false,
      status: "INVALID",
      invariants: [
        { name: "SKU_INTEGRITY", passed: true },
        { name: "PRICE_CEILING", passed: false, reason: "Landed cost $8,900 exceeds budget $8,500" },
        { name: "RETURN_POLICY", passed: true },
        { name: "DELIVERY_SLA", passed: true },
        { name: "CRYPTOGRAPHIC_LINEAGE", passed: true },
      ],
    };

    const session = createMockSession({
      status: "AUDIT_FAILED",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: failedAudit,
    });

    render(<SettlementCenterScreen session={session} />);

    const blockedBtn = screen.getByRole("button", { name: /Checkout Blocked — Audit Failed/i });
    expect(blockedBtn).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Continue to PayPal/i })).toBeNull();
    expect(screen.getByText(/1 of 5 checks failed — Checkout Blocked/i)).toBeInTheDocument();
  });

  it("blocks blind payment retries when capture outcome is uncertain", () => {
    const session = createMockSession({
      status: "CAPTURE_PENDING_RECONCILIATION",
      selectedQuote: mockQuote,
      finalOffer: mockOffer,
      agreementRecord: mockAgreement,
      auditCertificate: mockPassingAudit,
      paypalOrderId: "ORDER_UNCERTAIN_123",
    });

    render(<SettlementCenterScreen session={session} />);

    expect(screen.getByText(/Blind Capture Retries Blocked — Reconciliation Required/i)).toBeInTheDocument();
    const reconcileBtn = screen.getByRole("button", { name: /Reconcile PayPal Status/i });
    expect(reconcileBtn).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Continue to PayPal/i })).toBeNull();
  });
});
