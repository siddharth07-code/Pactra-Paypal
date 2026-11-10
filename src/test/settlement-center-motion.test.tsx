import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import gsap from "gsap";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import type { ProcurementSession, AuditCertificate, AgreementRecord, VendorQuote, NegotiationOffer } from "@/types/pactum";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.matchMedia = originalMatchMedia;
});

function createMockSession(overrides: Partial<ProcurementSession> = {}): ProcurementSession {
  const quote: VendorQuote = {
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

  const offer: NegotiationOffer = {
    unitPrice: 320,
    quantity: 25,
    deliveryDays: 4,
    returnDays: 35,
    shippingCost: 150,
  };

  const agreement: AgreementRecord = {
    agreementId: "agr_apex_round3_test",
    sessionId: "session_motion_001",
    vendorId: "vendor_apex",
    vendorName: "Apex Displays",
    sku: "APEX-4K-USB-C",
    agreedPrice: 320,
    agreedOffer: offer,
    totalCost: 8150,
    agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
    acceptingParty: "VENDOR",
    acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
    round: 3,
    acceptedAt: new Date().toISOString(),
    mandateVersion: 1,
  };

  const passingAudit: AuditCertificate = {
    certificateId: "cert_audit_pass_123",
    sessionId: "session_motion_001",
    passed: true,
    status: "VALID",
    verifiedRoot: "a".repeat(64),
    timestamp: new Date().toISOString(),
    invariants: [
      { name: "SKU_INTEGRITY", passed: true, status: "VALID" },
      { name: "PRICE_CEILING", passed: true, status: "VALID" },
      { name: "RETURN_POLICY", passed: true, status: "VALID" },
      { name: "DELIVERY_SLA", passed: true, status: "VALID" },
      { name: "CRYPTOGRAPHIC_LINEAGE", passed: true, status: "VALID" },
    ],
  };

  return {
    id: "session_motion_001",
    status: "AUDIT_PASSED",
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
      version: 1,
    },
    selectedQuote: quote,
    finalOffer: offer,
    agreementRecord: agreement,
    auditCertificate: passingAudit,
    quotes: [quote],
    turns: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("SettlementCenterScreen — Cinematic Motion & Interaction Tests", () => {
  describe("1. Coordinated Entrance Choreography", () => {
    it("coordinates heading, panels, and invariant row entrance via GSAP timeline", () => {
      const gsapTimelineSpy = vi.spyOn(gsap, "timeline");
      const session = createMockSession();

      render(<SettlementCenterScreen session={session} />);

      // Verify GSAP timeline was created for entrance elements
      expect(gsapTimelineSpy).toHaveBeenCalled();
    });

    it("respects prefers-reduced-motion and bypasses entrance timeline", () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion: reduce"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession();

      render(<SettlementCenterScreen session={session} />);

      // With reduced motion, GSAP entrance calls must not be initiated
      expect(gsapFromToSpy).not.toHaveBeenCalled();
    });
  });

  describe("2. Payment-State Transitions", () => {
    it("animates buyer approval notice when session transitions to AWAITING_PAYPAL_APPROVAL", async () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession({
        status: "AUDIT_PASSED",
      });

      const { rerender } = render(<SettlementCenterScreen session={session} />);
      gsapFromToSpy.mockClear();

      // Transition genuine state to AWAITING_PAYPAL_APPROVAL
      const awaitingSession: ProcurementSession = {
        ...session,
        status: "AWAITING_PAYPAL_APPROVAL",
        paypalOrderId: "ORDER_SANDBOX_12345",
      };

      act(() => {
        rerender(<SettlementCenterScreen session={awaitingSession} />);
      });

      expect(screen.getByText("Awaiting PayPal Sandbox Approval")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalled();
    });

    it("animates capture trigger when session transitions to PAYPAL_AUTHORIZED", async () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession({
        status: "AWAITING_PAYPAL_APPROVAL",
        paypalOrderId: "ORDER_SANDBOX_12345",
      });

      const { rerender } = render(<SettlementCenterScreen session={session} />);
      gsapFromToSpy.mockClear();

      // Transition genuine state to PAYPAL_AUTHORIZED
      const authorizedSession: ProcurementSession = {
        ...session,
        status: "PAYPAL_AUTHORIZED",
      };

      act(() => {
        rerender(<SettlementCenterScreen session={authorizedSession} />);
      });

      expect(screen.getByText("Run ACWORLD Audit & Capture")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalled();
    });

    it("provides restrained confirmation animation only after verified capture / settlement", async () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession({
        status: "PAYPAL_AUTHORIZED",
        paypalOrderId: "ORDER_SANDBOX_12345",
      });

      const { rerender } = render(<SettlementCenterScreen session={session} />);
      gsapFromToSpy.mockClear();

      // Transition genuine state to SETTLED
      const settledSession: ProcurementSession = {
        ...session,
        status: "SETTLED",
        paypalCaptureId: "CAP_SANDBOX_998877",
        paypalInvoiceId: "INV2-SANDBOX-1122",
      };

      act(() => {
        rerender(<SettlementCenterScreen session={settledSession} />);
      });

      expect(screen.getByText("PayPal Funds Captured & Invoice Created")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalled();
    });

    it("animates reconciliation warning when session enters CAPTURE_PENDING_RECONCILIATION", async () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession({
        status: "PAYPAL_AUTHORIZED",
        paypalOrderId: "ORDER_SANDBOX_12345",
      });

      const { rerender } = render(<SettlementCenterScreen session={session} />);
      gsapFromToSpy.mockClear();

      const reconciliationSession: ProcurementSession = {
        ...session,
        status: "CAPTURE_PENDING_RECONCILIATION",
      };

      act(() => {
        rerender(<SettlementCenterScreen session={reconciliationSession} />);
      });

      expect(screen.getByText("Blind Capture Retries Blocked — Reconciliation Required")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalled();
    });
  });

  describe("3. ACWORLD Verification Feedback", () => {
    it("animates verification highlight and invariant cascade when audit passes", async () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession({
        auditCertificate: undefined,
        status: "AUDIT_PENDING",
      });

      const { rerender } = render(<SettlementCenterScreen session={session} />);
      gsapFromToSpy.mockClear();

      // Complete audit with pass
      const passingAudit: AuditCertificate = {
        certificateId: "cert_audit_pass_new",
        sessionId: session.id,
        passed: true,
        status: "VALID",
        verifiedRoot: "b".repeat(64),
        timestamp: new Date().toISOString(),
        invariants: [
          { name: "SKU_INTEGRITY", passed: true, status: "VALID" },
          { name: "PRICE_CEILING", passed: true, status: "VALID" },
          { name: "RETURN_POLICY", passed: true, status: "VALID" },
          { name: "DELIVERY_SLA", passed: true, status: "VALID" },
          { name: "CRYPTOGRAPHIC_LINEAGE", passed: true, status: "VALID" },
        ],
      };

      const auditedSession: ProcurementSession = {
        ...session,
        auditCertificate: passingAudit,
        status: "AUDIT_PASSED",
      };

      act(() => {
        rerender(<SettlementCenterScreen session={auditedSession} />);
      });

      expect(screen.getByText("5/5 checks passed")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalled();
    });

    it("animates attention pulse when audit fails or is blocked", async () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession({
        auditCertificate: undefined,
        status: "AUDIT_PENDING",
      });

      const { rerender } = render(<SettlementCenterScreen session={session} />);
      gsapFromToSpy.mockClear();

      // Complete audit with failure
      const failingAudit: AuditCertificate = {
        certificateId: "cert_audit_fail_new",
        sessionId: session.id,
        passed: false,
        status: "INVALID",
        verifiedRoot: "c".repeat(64),
        timestamp: new Date().toISOString(),
        invariants: [
          { name: "SKU_INTEGRITY", passed: false, reason: "SKU mismatch" },
          { name: "PRICE_CEILING", passed: true },
          { name: "RETURN_POLICY", passed: true },
          { name: "DELIVERY_SLA", passed: true },
          { name: "CRYPTOGRAPHIC_LINEAGE", passed: true },
        ],
      };

      const failedSession: ProcurementSession = {
        ...session,
        auditCertificate: failingAudit,
        status: "AUDIT_FAILED",
      };

      act(() => {
        rerender(<SettlementCenterScreen session={failedSession} />);
      });

      expect(screen.getByText("1 of 5 checks failed — Checkout Blocked")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalled();
    });
  });

  describe("4. Smooth Reveal of Transaction Artifacts", () => {
    it("animates newly populated artifacts when PayPal order and capture IDs appear", async () => {
      const gsapFromToSpy = vi.spyOn(gsap, "fromTo");
      const session = createMockSession({
        paypalOrderId: undefined,
        paypalCaptureId: undefined,
        paypalInvoiceId: undefined,
        merkleRoot: undefined,
      });

      const { rerender } = render(<SettlementCenterScreen session={session} />);
      gsapFromToSpy.mockClear();

      // Populate PayPal order
      const sessionWithOrder: ProcurementSession = {
        ...session,
        paypalOrderId: "ORDER_CREATED_7788",
        status: "AWAITING_PAYPAL_APPROVAL",
      };

      act(() => {
        rerender(<SettlementCenterScreen session={sessionWithOrder} />);
      });

      expect(screen.getByText("ORDER_CREATED_7788")).toBeInTheDocument();
      expect(gsapFromToSpy).toHaveBeenCalled();
    });
  });

  describe("5. Safeguard & Prerequisite Preservation", () => {
    it("strictly blocks checkout when agreement is stale across mandate revisions", () => {
      const session = createMockSession();
      // Introduce mandate revision mismatch
      session.mandate.version = 2;
      session.agreementRecord!.mandateVersion = 1;

      render(<SettlementCenterScreen session={session} />);

      expect(screen.getByText(/Stale Agreement:/)).toBeInTheDocument();
      expect(screen.getByText("Checkout Blocked — Audit Failed")).toBeInTheDocument();
      expect(screen.queryByText("Continue to PayPal")).not.toBeInTheDocument();
    });

    it("strictly requires accepted agreement before audit evaluation can be run", () => {
      const session = createMockSession({
        agreementRecord: undefined,
        finalOffer: undefined,
      });

      render(<SettlementCenterScreen session={session} />);

      expect(screen.getByText("Awaiting Accepted Agreement")).toBeInTheDocument();
      expect(screen.getAllByText("Audit Unavailable").length).toBeGreaterThanOrEqual(1);
    });
  });
});
