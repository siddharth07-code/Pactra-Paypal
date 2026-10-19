import { describe, it, expect, beforeEach } from "vitest";
import { sessionStore } from "./session-store";
import type { ProcurementMandate } from "../types/pactum";

describe("Dynamic Procurement Mandates & Session Store Tests", () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  const scenarioA_Mandate: ProcurementMandate = {
    id: "m_scenario_a",
    rawPrompt: "Purchase 25 4K USB-C monitors under $8,500",
    itemQuery: "4K USB-C monitors",
    quantity: 25,
    maxTotalBudget: 8500,
    maxDeliveryDays: 5,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  const scenarioB_Mandate: ProcurementMandate = {
    id: "m_scenario_b",
    rawPrompt: "Purchase 10 office headsets under $4,000",
    itemQuery: "Wireless Office Headsets",
    quantity: 10,
    maxTotalBudget: 4000,
    maxDeliveryDays: 3,
    minReturnDays: 14,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  const scenarioC_Mandate: ProcurementMandate = {
    id: "m_scenario_c",
    rawPrompt: "Purchase 50 ergonomic chairs under $15,000",
    itemQuery: "Ergonomic Chairs",
    quantity: 50,
    maxTotalBudget: 15000,
    maxDeliveryDays: 7,
    minReturnDays: 30,
    requiredSpecs: [],
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  it("handles independent scenarios without defaulting to USD 8,500 demo constants", () => {
    const sessionA = sessionStore.createSession(scenarioA_Mandate);
    const sessionB = sessionStore.createSession(scenarioB_Mandate);
    const sessionC = sessionStore.createSession(scenarioC_Mandate);

    expect(sessionA.mandate.maxTotalBudget).toBe(8500);
    expect(sessionA.mandate.quantity).toBe(25);

    expect(sessionB.mandate.maxTotalBudget).toBe(4000);
    expect(sessionB.mandate.quantity).toBe(10);

    expect(sessionC.mandate.maxTotalBudget).toBe(15000);
    expect(sessionC.mandate.quantity).toBe(50);
  });

  it("locks the mandate when negotiation begins", () => {
    const session = sessionStore.createSession(scenarioB_Mandate);
    expect(session.mandate.isLocked).toBe(false);

    const locked = sessionStore.lockMandate(session.id);
    expect(locked.mandate.isLocked).toBe(true);
    expect(locked.status).toBe("NEGOTIATING");
  });

  it("invalidates stale offers and increments version upon mandate revision", () => {
    const session = sessionStore.createSession(scenarioA_Mandate);
    session.finalOffer = {
      unitPrice: 320,
      quantity: 25,
      deliveryDays: 4,
      returnDays: 30,
      shippingCost: 150,
    };
    session.merkleRoot = "a".repeat(64);
    sessionStore.saveSession(session);

    // Revise budget down to $7,500
    const revised = sessionStore.reviseMandate(session.id, { maxTotalBudget: 7500 });

    expect(revised.mandate.version).toBe(2);
    expect(revised.mandate.maxTotalBudget).toBe(7500);
    expect(revised.mandate.isLocked).toBe(false);
    // Assert stale offer and root are invalidated
    expect(revised.finalOffer).toBeUndefined();
    expect(revised.merkleRoot).toBeUndefined();
    expect(revised.status).toBe("MANDATE_PENDING");

    const history = sessionStore.getMandateHistory(session.id);
    expect(history.length).toBe(2);
    expect(history[0].maxTotalBudget).toBe(8500);
    expect(history[1].maxTotalBudget).toBe(7500);
  });

  it("rejects invalid negative or non-finite budget revisions", () => {
    const session = sessionStore.createSession(scenarioA_Mandate);
    expect(() => sessionStore.reviseMandate(session.id, { maxTotalBudget: -100 })).toThrow("Invalid budget revision");
    expect(() => sessionStore.reviseMandate(session.id, { maxTotalBudget: NaN })).toThrow("Invalid budget revision");
  });
});
