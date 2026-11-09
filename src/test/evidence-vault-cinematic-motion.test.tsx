import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { EvidenceVaultScreen } from "@/components/EvidenceVaultScreen";
import type { ProcurementSession, AuditCertificate } from "@/types/pactum";

const mockPassingAudit: AuditCertificate = {
  certificateId: "CERT-VAULT-DEMO-001",
  sessionId: "session-vault-test",
  mandateVersion: 1,
  agreementId: "agreement-vault-1",
  passed: true,
  status: "VALID",
  auditType: "PRE_SETTLEMENT",
  verifiedRoot: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  timestamp: "2026-11-09T12:00:00.000Z",
  invariants: [
    {
      name: "SKU_INTEGRITY",
      passed: true,
      status: "VALID",
      reason: "Item SKU & condition match mandate",
    },
    {
      name: "PRICE_CEILING",
      passed: true,
      status: "VALID",
      reason: "Landed cost <= budget",
    },
    {
      name: "RETURN_POLICY",
      passed: true,
      status: "VALID",
      reason: "Return SLA >= 30 days",
      isSupplierAttestation: true,
    },
    {
      name: "DELIVERY_SLA",
      passed: true,
      status: "VALID",
      reason: "Delivery SLA <= 5 days",
    },
    {
      name: "CRYPTOGRAPHIC_LINEAGE",
      passed: true,
      status: "VALID",
      reason: "Merkle lineage matches custom_id",
    },
  ],
};

const mockSessionWithEvidence: ProcurementSession = {
  id: "session-vault-test",
  status: "AUDIT_PASSED",
  createdAt: "2026-11-09T10:00:00.000Z",
  updatedAt: "2026-11-09T12:00:00.000Z",
  preSettlementRoot: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  postAuditRoot: "f9e8d7c6b5a43210f9e8d7c6b5a43210f9e8d7c6b5a43210f9e8d7c6b5a43210",
  mandate: {
    id: "mandate-vault-1",
    createdAt: "2026-11-09T10:00:00.000Z",
    rawPrompt: "Purchase 25 4K monitors under $8,500 total budget",
    itemQuery: "Dell UltraSharp 27 4K USB-C Hub Monitor",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
  },
  selectedQuote: {
    vendorId: "vendor-monitors-direct",
    vendorName: "Monitors Direct",
    sku: "DELL-U2723QE-BULK",
    productTitle: "Dell UltraSharp 27 4K USB-C Hub Monitor",
    initialUnitAsk: 340,
    currentUnitBid: 320,
    shippingCost: 25,
    deliveryDays: 4,
    returnDays: 30,
    condition: "NEW",
    status: "ACCEPTED",
    dataSource: "CHANNEL3",
  },
  finalOffer: {
    unitPrice: 320,
    quantity: 25,
    shippingCost: 25,
    deliveryDays: 4,
    returnDays: 30,
  },
  agreementRecord: {
    agreementId: "agreement-vault-1",
    sessionId: "session-vault-test",
    vendorId: "vendor-monitors-direct",
    vendorName: "Monitors Direct",
    sku: "DELL-U2723QE-BULK",
    agreedPrice: 320,
    agreedOffer: {
      unitPrice: 320,
      quantity: 25,
      shippingCost: 25,
      deliveryDays: 4,
      returnDays: 30,
    },
    totalCost: 8025,
    currency: "USD",
    agreedBy: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
    acceptingParty: "BUYER",
    acceptanceMechanism: "BUYER_ACCEPTED_VENDOR_COUNTEROFFER",
    round: 3,
    acceptedAt: "2026-11-09T11:45:00.000Z",
    mandateVersion: 1,
  },
  auditCertificate: mockPassingAudit,
  quotes: [],
  turns: [],
  paypalOrderId: "PAYPAL-ORDER-VAULT-123",
  paypalCaptureId: "PAYPAL-CAPTURE-VAULT-456",
};

describe("EvidenceVaultScreen Cinematic Motion Verification", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("eventIndex=0")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              inclusionProof: {
                leafHash: "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
                proof: [
                  { position: "right", hash: "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff" },
                  { position: "left", hash: "2222333344445555666677778888999900001111bbbbccccddddeeeeffffaaaa" },
                ],
                rootHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sessionId: "session-vault-test",
            reconstructedRoot: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
            storedPreSettlementRoot: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
            leafCount: 2,
            leaves: [
              "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
              "c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
            ],
            auditNodes: [
              {
                index: 0,
                eventType: "MANDATE_LOCKED",
                timestamp: "2026-11-09T10:00:00.000Z",
                payloadHash: "hash-payload-0",
                leafHash: "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
              },
              {
                index: 1,
                eventType: "VERIFIED_NEGOTIATION_ROUND",
                timestamp: "2026-11-09T11:30:00.000Z",
                payloadHash: "hash-payload-1",
                leafHash: "c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
              },
            ],
            levels: [
              [
                "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
                "c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
              ],
              ["a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"],
            ],
            integrity: { valid: true, verifiedEvents: 2 },
            isRootMatching: true,
          }),
        });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders Stage A heading inside an overflow-hidden clipping mask container", () => {
    render(<EvidenceVaultScreen session={mockSessionWithEvidence} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Evidence Vault" });
    expect(heading).toBeInTheDocument();
    expect(heading.parentElement).toHaveClass("overflow-hidden");
  });

  it("renders Stage B subtitle and Flight Recorder Locked status badge", () => {
    render(<EvidenceVaultScreen session={mockSessionWithEvidence} />);

    expect(
      screen.getByText("Review the records behind this agreement and verify their integrity.")
    ).toBeInTheDocument();
    expect(screen.getByText("Flight Recorder Locked")).toBeInTheDocument();
  });

  it("renders Stage C pre-settlement and post-audit Merkle roots side-by-side", () => {
    render(<EvidenceVaultScreen session={mockSessionWithEvidence} />);

    expect(screen.getByText("Pre-Settlement Merkle Root")).toBeInTheDocument();
    expect(screen.getByText("Post-Audit Settlement Root")).toBeInTheDocument();
    expect(screen.getAllByText("Root recorded")).toHaveLength(2);
  });

  it("renders Stage E ACWORLD Invariants Card with 5/5 passed status and mint border accent", () => {
    const { container } = render(<EvidenceVaultScreen session={mockSessionWithEvidence} />);

    const invariantsSection = screen.getByRole("region", {
      name: "ACWORLD Independent Audit Invariants",
    });
    expect(invariantsSection).toBeInTheDocument();
    expect(invariantsSection).toHaveClass("border-l-mint-primary");

    expect(screen.getByText("Audit Passed (5/5)")).toBeInTheDocument();
    expect(screen.getAllByText("1. SKU Integrity").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2. Price Ceiling").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3. Return Window").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("4. Delivery SLA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("5. Cryptographic Lineage").length).toBeGreaterThanOrEqual(1);

    // Verify invariant rows have hover transition classes
    const invariantRows = container.querySelectorAll(".vault-invariant-row");
    expect(invariantRows.length).toBeGreaterThanOrEqual(5);
  });

  it("renders committed ledger events and expands inclusion proof with smooth container", async () => {
    render(<EvidenceVaultScreen session={mockSessionWithEvidence} />);

    // Wait for mock fetch to populate audit nodes
    const inspectBtn = await screen.findByRole("button", {
      name: /Inspect cryptographic proof for leaf index 0/i,
    });
    expect(inspectBtn).toBeInTheDocument();
    expect(inspectBtn).toHaveAttribute("aria-expanded", "false");

    // Click inspect proof to trigger expandable container
    fireEvent.click(inspectBtn);
    expect(inspectBtn).toHaveAttribute("aria-expanded", "true");

    // Verify expanded proof container renders
    const proofHeader = await screen.findByText(/SHA-256 Merkle Inclusion Proof \(Leaf #0\)/i);
    expect(proofHeader).toBeInTheDocument();

    const proofContainer = proofHeader.closest(".vault-proof-expanded");
    expect(proofContainer).toBeInTheDocument();
    expect(within(proofContainer as HTMLElement).getByText("Proof Verified")).toBeInTheDocument();
    expect(within(proofContainer as HTMLElement).getByText(/Sibling Nodes/i)).toBeInTheDocument();
  });

  it("switches tabs between Committed Event Ledger and Merkle Tree Levels cleanly", async () => {
    render(<EvidenceVaultScreen session={mockSessionWithEvidence} />);

    const timelineTab = screen.getByRole("tab", { name: /Committed Event Ledger/i });
    const treeTab = screen.getByRole("tab", { name: /Merkle Tree Levels/i });

    expect(timelineTab).toHaveAttribute("aria-selected", "true");
    expect(treeTab).toHaveAttribute("aria-selected", "false");

    // Switch to Tree Levels tab
    fireEvent.click(treeTab);
    expect(treeTab).toHaveAttribute("aria-selected", "true");
    expect(timelineTab).toHaveAttribute("aria-selected", "false");

    // Verify tree levels are rendered
    const levelLabel = await screen.findByText(/Level 0 \(2 nodes\)/i);
    expect(levelLabel).toBeInTheDocument();
    expect(screen.getByText(/Level 1 \(1 node\)/i)).toBeInTheDocument();
  });

  it("handles reduced motion preferences gracefully without throwing", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(() => {
      render(<EvidenceVaultScreen session={mockSessionWithEvidence} />);
    }).not.toThrow();

    expect(screen.getByText("Evidence Vault")).toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });
});
