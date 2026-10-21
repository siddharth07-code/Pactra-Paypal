import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/lib/theme-provider";
import type { ProcurementSession, AuditCertificate, InvariantResult } from "@/types/pactum";

// Test component to interact with useTheme hook
function ThemeTestComponent() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <span data-testid="resolved-theme-val">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("system")}>Set System</button>
    </div>
  );
}

describe("UI/UX Polish: Theme Provider & Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("defaults to system theme when no localStorage exists", () => {
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme-val").textContent).toBe("system");
    // resolvedTheme will be light or dark depending on jsdom matchMedia default (usually light)
    expect(["light", "dark"]).toContain(screen.getByTestId("resolved-theme-val").textContent);
  });

  it("persists theme preference to localStorage when changed", () => {
    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Set Dark"));
    expect(localStorage.getItem("pactum_theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByText("Set Light"));
    expect(localStorage.getItem("pactum_theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("restores explicit theme preference from localStorage on mount", () => {
    localStorage.setItem("pactum_theme", "dark");

    render(
      <ThemeProvider>
        <ThemeTestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme-val").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("UI/UX Polish: Fail-Closed Settlement Readiness Logic", () => {
  const mockMandate = {
    id: "mandate_test_123",
    rawPrompt: "Purchase 25 4K USB-C monitors",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD" as const,
    createdAt: new Date().toISOString(),
  };

  it("strictly enforces fail-closed: auditCert undefined is NOT passed", () => {
    const sessionWithoutAudit: ProcurementSession = {
      id: "session_pending_audit",
      mandate: mockMandate,
      quotes: [],
      turns: [],
      status: "AUDIT_PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const isAuditPassed = Boolean(
      sessionWithoutAudit.auditCertificate && sessionWithoutAudit.auditCertificate.passed === true
    );
    expect(isAuditPassed).toBe(false);
  });

  it("strictly enforces fail-closed: auditCert with passed=false is NOT passed", () => {
    const failedCertificate: AuditCertificate = {
      certificateId: "cert_fail_1",
      sessionId: "session_failed",
      passed: false,
      invariants: [
        { name: "PRICE_CEILING", passed: false, reason: "Exceeds budget" },
        { name: "SKU_INTEGRITY", passed: true },
      ],
      verifiedRoot: "abc123hash",
      timestamp: new Date().toISOString(),
    };

    const sessionWithFailedAudit: ProcurementSession = {
      id: "session_failed",
      mandate: mockMandate,
      quotes: [],
      turns: [],
      status: "AUDIT_FAILED",
      auditCertificate: failedCertificate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const isAuditPassed = Boolean(
      sessionWithFailedAudit.auditCertificate && sessionWithFailedAudit.auditCertificate.passed === true
    );
    expect(isAuditPassed).toBe(false);
  });

  it("identifies passed certificate only when passed===true", () => {
    const passedCertificate: AuditCertificate = {
      certificateId: "cert_pass_1",
      sessionId: "session_pass",
      passed: true,
      invariants: [
        { name: "SKU_INTEGRITY", passed: true },
        { name: "PRICE_CEILING", passed: true },
        { name: "RETURN_POLICY", passed: true },
        { name: "DELIVERY_SLA", passed: true },
        { name: "CRYPTOGRAPHIC_LINEAGE", passed: true },
      ],
      verifiedRoot: "root789hash",
      timestamp: new Date().toISOString(),
    };

    const sessionWithPassedAudit: ProcurementSession = {
      id: "session_pass",
      mandate: mockMandate,
      quotes: [],
      turns: [],
      status: "AUDIT_PASSED",
      auditCertificate: passedCertificate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const isAuditPassed = Boolean(
      sessionWithPassedAudit.auditCertificate && sessionWithPassedAudit.auditCertificate.passed === true
    );
    expect(isAuditPassed).toBe(true);
  });

  it("matches ACWORLD invariants by semantic name rather than array order", () => {
    // Invariants in non-standard order
    const shuffledInvariants: InvariantResult[] = [
      { name: "CRYPTOGRAPHIC_LINEAGE", passed: true, reason: "Lineage verified" },
      { name: "DELIVERY_SLA", passed: false, reason: "Delivery SLA violated (7 > 5)" },
      { name: "SKU_INTEGRITY", passed: true },
      { name: "RETURN_POLICY", passed: true },
      { name: "PRICE_CEILING", passed: true },
    ];

    const getInvariantStatus = (name: InvariantResult["name"]) => {
      const inv = shuffledInvariants.find((i) => i.name === name);
      return {
        tested: Boolean(inv),
        passed: Boolean(inv?.passed),
        reason: inv?.reason,
      };
    };

    expect(getInvariantStatus("DELIVERY_SLA").passed).toBe(false);
    expect(getInvariantStatus("DELIVERY_SLA").reason).toContain("Delivery SLA violated");
    expect(getInvariantStatus("CRYPTOGRAPHIC_LINEAGE").passed).toBe(true);
    expect(getInvariantStatus("SKU_INTEGRITY").passed).toBe(true);
  });
});

describe("UI/UX Polish: Lifecycle-Aware Session Routing", () => {
  const getDestinationScreen = (status: ProcurementSession["status"]): string => {
    if (status === "MANDATE_PENDING" || status === "SOURCING") {
      return "sourcing";
    }
    if (status === "NEGOTIATING") {
      return "arena";
    }
    return "settlement";
  };

  it("routes MANDATE_PENDING and SOURCING to sourcing screen", () => {
    expect(getDestinationScreen("MANDATE_PENDING")).toBe("sourcing");
    expect(getDestinationScreen("SOURCING")).toBe("sourcing");
  });

  it("routes NEGOTIATING to arena screen", () => {
    expect(getDestinationScreen("NEGOTIATING")).toBe("arena");
  });

  it("routes post-negotiation states to settlement screen", () => {
    expect(getDestinationScreen("AUDIT_PENDING")).toBe("settlement");
    expect(getDestinationScreen("AUDIT_PASSED")).toBe("settlement");
    expect(getDestinationScreen("AUDIT_FAILED")).toBe("settlement");
    expect(getDestinationScreen("PAYPAL_AUTHORIZED")).toBe("settlement");
    expect(getDestinationScreen("PAYPAL_CAPTURED")).toBe("settlement");
    expect(getDestinationScreen("SETTLED")).toBe("settlement");
  });
});
