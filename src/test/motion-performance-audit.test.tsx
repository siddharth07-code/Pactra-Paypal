import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, renderHook, act } from "@testing-library/react";
import { useWorkspaceTransition } from "@/components/workspace-transition";
import { OverviewScreen } from "@/components/OverviewScreen";
import { SourcingScreen } from "@/components/SourcingScreen";
import { NegotiationArenaScreen } from "@/components/NegotiationArenaScreen";
import { EvidenceVaultScreen } from "@/components/EvidenceVaultScreen";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import { ProcurementHistoryScreen } from "@/components/ProcurementHistoryScreen";
import AccountPage from "@/app/account/page";
import type { ProcurementSession, VendorQuote, NegotiationOffer, AuditCertificate, AgreementRecord } from "@/types/pactum";

vi.mock("@/components/OrganizationBoundary", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/OrganizationBoundary")>(),
  useOrganization: () => ({
    id: "org-1",
    name: "Enterprise Procurement",
    role: "PROCUREMENT_LEAD",
    permissions: ["session.read", "session.write", "negotiation.start"],
  }),
}));

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("view-transition-active");
  window.matchMedia = originalMatchMedia;
});

function createMockSession(): ProcurementSession {
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
    sessionId: "session_audit_001",
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
    sessionId: "session_audit_001",
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
    id: "session_audit_001",
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
  };
}

describe("PACTUM Phase 8: Motion, Accessibility & Performance Audit", () => {
  describe("1. View Transition Coordination & State Hygiene", () => {
    it("adds view-transition-active class during active transitions and removes it upon completion", async () => {
      let finishCallback: () => void = () => {};
      let startCallback: () => void = () => {};
      const mockTransition = {
        ready: Promise.resolve(),
        finished: new Promise<void>((resolve) => {
          finishCallback = resolve;
        }),
        skipTransition: vi.fn(),
      };

      (document as unknown as { startViewTransition: unknown }).startViewTransition = vi
        .fn()
        .mockImplementation((cb: () => void) => {
          startCallback = cb;
          return mockTransition;
        });

      const { result } = renderHook(() => useWorkspaceTransition());
      const transitionFn = result.current;

      const updateCallback = vi.fn();
      act(() => {
        transitionFn(updateCallback, true);
      });

      expect(document.documentElement.classList.contains("view-transition-active")).toBe(true);

      // Execute view transition DOM update callback
      act(() => {
        startCallback();
      });
      expect(updateCallback).toHaveBeenCalled();

      // Complete transition
      await act(async () => {
        finishCallback();
      });

      expect(document.documentElement.classList.contains("view-transition-active")).toBe(false);
    });

    it("cleans up view-transition-active and skips prior transition when rapid navigation occurs", () => {
      const skipSpy = vi.fn();
      const mockTransition1 = {
        ready: Promise.resolve(),
        finished: new Promise<void>(() => {}),
        skipTransition: skipSpy,
      };

      const mockTransition2 = {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
        skipTransition: vi.fn(),
      };

      let callCount = 0;
      (document as unknown as { startViewTransition: unknown }).startViewTransition = vi
        .fn()
        .mockImplementation((cb: () => void) => {
          cb();
          callCount++;
          return callCount === 1 ? mockTransition1 : mockTransition2;
        });

      const { result } = renderHook(() => useWorkspaceTransition());
      const transitionFn = result.current;

      act(() => {
        transitionFn(vi.fn(), true);
      });

      expect(document.documentElement.classList.contains("view-transition-active")).toBe(true);

      // Trigger second rapid transition before the first finished
      act(() => {
        transitionFn(vi.fn(), true);
      });

      expect(skipSpy).toHaveBeenCalled();
    });

    it("immediately commits without starting view transition when prefers-reduced-motion is active", () => {
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

      const startSpy = vi.fn();
      (document as unknown as { startViewTransition: unknown }).startViewTransition = startSpy;

      const { result } = renderHook(() => useWorkspaceTransition());
      const transitionFn = result.current;

      const updateCallback = vi.fn();
      act(() => {
        transitionFn(updateCallback, true);
      });

      expect(updateCallback).toHaveBeenCalled();
      expect(startSpy).not.toHaveBeenCalled();
      expect(document.documentElement.classList.contains("view-transition-active")).toBe(false);
    });
  });

  describe("2. Clean Lifecycle & Teardown Across All 7 Workspace Screens", () => {
    it("mounts and unmounts OverviewScreen cleanly", () => {
      const session = createMockSession();
      const { unmount } = render(
        <OverviewScreen
          sessions={[session]}
          onStartNew={vi.fn()}
          onOpenSession={vi.fn()}
        />
      );
      expect(screen.getByRole("heading", { name: "Procurement overview", level: 1 })).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();
    });

    it("mounts and unmounts SourcingScreen cleanly", () => {
      const session: ProcurementSession = {
        ...createMockSession(),
        status: "SOURCING",
      };
      const { unmount } = render(
        <SourcingScreen
          session={session}
          onStartNegotiation={vi.fn()}
          onSessionCreated={vi.fn()}
        />
      );
      expect(screen.getByRole("heading", { name: "Source a procurement request", level: 1 })).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();
    });

    it("mounts and unmounts NegotiationArenaScreen cleanly", () => {
      const session = createMockSession();
      const { unmount } = render(
        <NegotiationArenaScreen
          mandate={session.mandate}
          quotes={session.quotes}
          events={[]}
          isStreaming={false}
          session={session}
        />
      );
      expect(screen.getByRole("heading", { name: "Negotiation Arena", level: 1 })).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();
    });

    it("mounts and unmounts EvidenceVaultScreen cleanly", () => {
      const session = createMockSession();
      const { unmount } = render(<EvidenceVaultScreen session={session} />);
      expect(screen.getByRole("heading", { name: "Evidence Vault", level: 1 })).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();
    });

    it("mounts and unmounts SettlementCenterScreen cleanly", () => {
      const session = createMockSession();
      const { unmount } = render(<SettlementCenterScreen session={session} />);
      expect(screen.getByRole("heading", { name: "Settlement Center", level: 1 })).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();
    });

    it("mounts and unmounts ProcurementHistoryScreen cleanly", () => {
      const session = createMockSession();
      const { unmount } = render(
        <ProcurementHistoryScreen
          sessions={[session]}
          onSelectSession={vi.fn()}
          onStartNew={vi.fn()}
        />
      );
      expect(screen.getByRole("heading", { name: "Procurement History", level: 1 })).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();
    });

    it("mounts and unmounts AccountPage cleanly", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (String(url).includes("/api/auth/session")) {
            return Promise.resolve(Response.json({ principal: { email: "officer@pactum.b2b" } }));
          }
          return Promise.resolve(Response.json({ organizations: [], active: null }));
        })
      );
      const { unmount } = render(<AccountPage />);
      expect(screen.getByRole("heading", { name: "Account & Workspace", level: 1 })).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();
    });
  });

  describe("3. Authoritative Backend State Guardrails", () => {
    it("ensures SettlementCenterScreen only animates valid passed certificate and genuine order/capture", () => {
      const sessionWithoutAudit: ProcurementSession = {
        ...createMockSession(),
        status: "NEGOTIATING",
        auditCertificate: undefined,
        paypalOrderId: undefined,
        paypalCaptureId: undefined,
      };

      const { rerender } = render(<SettlementCenterScreen session={sessionWithoutAudit} />);
      expect(screen.queryByText("AUDIT PASSED")).toBeNull();
      expect(screen.queryByText("Settlement Completed")).toBeNull();

      const passingSession: ProcurementSession = {
        ...sessionWithoutAudit,
        status: "SETTLED",
        auditCertificate: createMockSession().auditCertificate,
        paypalOrderId: "AUTH-ORD-9999",
        paypalCaptureId: "AUTH-CAP-8888",
      };

      rerender(<SettlementCenterScreen session={passingSession} />);
      expect(screen.getAllByText("PASS").length).toBeGreaterThan(0);
      expect(screen.getByText("AUTH-ORD-9999")).toBeInTheDocument();
      expect(screen.getByText("AUTH-CAP-8888")).toBeInTheDocument();
    });
  });
});
