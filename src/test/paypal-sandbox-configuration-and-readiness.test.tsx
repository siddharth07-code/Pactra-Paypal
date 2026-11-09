import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SettlementCenterScreen } from "@/components/SettlementCenterScreen";
import { PayPalClient } from "@/lib/paypal-client";
import type { ProcurementSession } from "@/types/pactum";

function createPassingAuditedSession(): ProcurementSession {
  return {
    id: "sess_sandbox_ready_001",
    status: "AUDIT_PASSED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mandate: {
      id: "mand_001",
      rawPrompt: "25 4K monitors under $8500 total within 5 days",
      itemQuery: "4K USB-C Monitor",
      quantity: 25,
      maxTotalBudget: 8500,
      maxDeliveryDays: 5,
      minReturnDays: 30,
      requiredSpecs: [
        { name: "Resolution", value: "4K", mandatory: true },
        { name: "Port", value: "USB-C", mandatory: true },
      ],
      createdAt: new Date().toISOString(),
      currency: "USD",
      isLocked: true,
      version: 1,
    },
    selectedQuote: {
      vendorId: "vendor_apex",
      vendorName: "Apex Displays Wholesale",
      sku: "SKU-4K-MON-27",
      productTitle: "27-inch 4K USB-C Professional Monitor",
      initialUnitAsk: 340,
      currentUnitBid: 320,
      shippingCost: 200,
      deliveryDays: 4,
      returnDays: 30,
      condition: "NEW",
      status: "COUNTERED",
      dataSource: "CHANNEL3",
    },
    finalOffer: {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 200,
    },
    quotes: [],
    turns: [],
    agreementRecord: {
      agreementId: "agr_test_001",
      mandateVersion: 1,
      sessionId: "sess_sandbox_ready_001",
      vendorId: "vendor_apex",
      vendorName: "Apex Displays Wholesale",
      sku: "SKU-4K-MON-27",
      agreedOffer: {
        unitPrice: 320,
        quantity: 25,
        deliveryDays: 4,
        returnDays: 30,
        shippingCost: 200,
      },
      agreedPrice: 320,
      totalCost: 8200,
      agreedBy: "VENDOR_ACCEPTED_BUYER_OFFER",
      acceptingParty: "VENDOR",
      acceptanceMechanism: "VENDOR_ACCEPTED_BUYER_OFFER",
      round: 3,
      acceptedAt: new Date().toISOString(),
      currency: "USD",
    },
    auditCertificate: {
      certificateId: "cert_test_001",
      sessionId: "sess_sandbox_ready_001",
      agreementId: "agr_test_001",
      mandateVersion: 1,
      passed: true,
      verifiedRoot: "0000000000000000000000000000000000000000000000000000000000000000",
      invariants: [
        { name: "SKU_INTEGRITY", passed: true },
        { name: "PRICE_CEILING", passed: true },
        { name: "RETURN_POLICY", passed: true },
        { name: "DELIVERY_SLA", passed: true },
        { name: "CRYPTOGRAPHIC_LINEAGE", passed: true },
      ],
      timestamp: new Date().toISOString(),
    },
  };
}

describe("PayPal Sandbox Configuration & Readiness Gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("PayPalClient accurately exposes sandbox configuration state and merchant ID", () => {
    const client = new PayPalClient({
      clientId: "test_client_id",
      clientSecret: "test_client_secret",
      baseUrl: "https://api-m.sandbox.paypal.com",
    });

    expect(client.isConfigured()).toBe(true);
    expect(client.getMerchantId()).toBeDefined();

    const emptyClient = new PayPalClient({
      clientId: "",
      clientSecret: "",
      baseUrl: "https://api-m.sandbox.paypal.com",
    });
    expect(emptyClient.isConfigured()).toBe(false);
  });

  it("renders enabled Continue to PayPal when audit passes and merchant is configured", async () => {
    const session = createPassingAuditedSession();

    // Mock GET /api/paypal/checkout returning healthy sandbox configuration
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (typeof url === "string" && url.includes("/api/paypal/checkout")) {
        return {
          ok: true,
          json: async () => ({
            configured: true,
            environment: "SANDBOX",
            merchantConfigured: true,
            hasCredentials: true,
            merchantId: "WJV...QW",
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    render(<SettlementCenterScreen session={session} />);

    await waitFor(() => {
      expect(
        screen.getByText("Audited & Eligible for PayPal Authorization")
      ).toBeInTheDocument();
    });

    const continueBtn = screen.getByRole("button", { name: /Continue to PayPal/i });
    expect(continueBtn).toBeEnabled();
    expect(screen.queryByText(/Checkout Blocked — Merchant Unconfigured/i)).not.toBeInTheDocument();
  });

  it("blocks checkout and shows actionable error when PayPal merchant configuration error occurs", async () => {
    const session = createPassingAuditedSession();

    // First fetch for readiness returns unconfigured
    vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
      const method = init?.method ?? "GET";
      if (typeof url === "string" && url.includes("/api/paypal/checkout")) {
        if (method === "GET") {
          return {
            ok: true,
            json: async () => ({
              configured: false,
              environment: "SANDBOX",
              merchantConfigured: false,
              hasCredentials: true,
              merchantId: null,
            }),
          } as Response;
        }

        // POST checkout fails with merchant configuration required
        return {
          ok: false,
          status: 503,
          json: async () => ({
            success: false,
            error: "PayPal Sandbox merchant configuration is required.",
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    render(<SettlementCenterScreen session={session} />);

    // Proactively blocks checkout instead of claiming false eligibility
    await waitFor(() => {
      expect(
        screen.getByText("Merchant Setup Required — PayPal Sandbox")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Checkout Blocked — Merchant Unconfigured")
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Audited & Eligible for PayPal Authorization")).not.toBeInTheDocument();
  });

  it("proactively renders merchant setup required when server reports unconfigured sandbox", async () => {
    const session = createPassingAuditedSession();

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        configured: false,
        environment: "SANDBOX",
        merchantConfigured: false,
        hasCredentials: false,
        merchantId: null,
      }),
    } as Response);

    render(<SettlementCenterScreen session={session} />);

    await waitFor(() => {
      expect(screen.getByText("Merchant Setup Required — PayPal Sandbox")).toBeInTheDocument();
    });

    const blockedBtn = screen.getByLabelText("Checkout Blocked — Merchant Unconfigured");
    expect(blockedBtn).toBeDisabled();
  });
});
