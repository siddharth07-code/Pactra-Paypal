import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthoritativeSessionStore, sessionStore } from "./session-store";
import { MemorySessionPersistenceAdapter } from "./persistence/session-persistence";
import type { ProcurementMandate, ProcurementSessionStatus } from "../types/pactum";

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
    expect(locked.version).toBe(session.version! + 1);
  });

  describe("mandate locking lifecycle protection", () => {
    function setup(status: ProcurementSessionStatus = "MANDATE_PENDING") {
      const adapter = new MemorySessionPersistenceAdapter();
      const store = new AuthoritativeSessionStore(adapter);
      const session = store.createSession(scenarioB_Mandate);
      session.status = status;
      store.saveSession(session);
      return { store, adapter, session: store.getSession(session.id)! };
    }

    it.each<ProcurementSessionStatus>(["MANDATE_PENDING", "SOURCING", "NEGOTIATING", "AUDIT_FAILED"])(
      "allows the existing %s to NEGOTIATING transition",
      (status) => {
        const { store, session } = setup(status);
        const locked = store.lockMandate(session.id);
        expect(locked.status).toBe("NEGOTIATING");
        expect(locked.mandate.isLocked).toBe(true);
        expect(locked.version).toBe(session.version! + 1);
        expect(store.getSession(session.id)).toEqual(locked);
        expect(store.isLocked(session.id)).toBe(false);
      }
    );

    it.each<ProcurementSessionStatus>([
      "AUDIT_PENDING", "AUDIT_PASSED", "AWAITING_PAYPAL_APPROVAL", "PAYPAL_AUTHORIZED",
      "CAPTURE_PENDING_RECONCILIATION", "PAYPAL_CAPTURED", "SETTLED", "DISPUTED", "CANCELLED",
    ])("rejects %s without modifying or persisting the session", (status) => {
      const { store, adapter, session } = setup(status);
      const save = vi.spyOn(adapter, "save");
      expect(() => store.lockMandate(session.id)).toThrow();
      expect(store.getSession(session.id)).toEqual(session);
      expect(save).not.toHaveBeenCalled();
      expect(store.isLocked(session.id)).toBe(false);
    });

    it("rolls back the entire session and releases the lock when persistence fails", () => {
      const { store, adapter, session } = setup();
      const save = vi.spyOn(adapter, "save").mockImplementationOnce(() => { throw new Error("Disk unavailable"); });
      expect(() => store.lockMandate(session.id)).toThrow("Disk unavailable");
      expect(store.getSession(session.id)).toEqual(session);
      expect(adapter.load().sessions[0]).toEqual(session);
      expect(store.isLocked(session.id)).toBe(false);
      save.mockRestore();
      expect(store.lockMandate(session.id).status).toBe("NEGOTIATING");
    });

    it("rejects lock contention without releasing another operation's lock", () => {
      const { store, session } = setup();
      expect(store.acquireLock(session.id)).toBe(true);
      expect(() => store.lockMandate(session.id)).toThrow();
      expect(store.getSession(session.id)).toEqual(session);
      expect(store.isLocked(session.id)).toBe(true);
      store.releaseLock(session.id);
      session.status = "CANCELLED";
      store.saveSession(session);
      expect(() => store.lockMandate(session.id)).toThrow();
      expect(store.getSession(session.id)!.status).toBe("CANCELLED");
    });

    it("rejects a reentrant lock attempt during persistence", () => {
      const { store, adapter, session } = setup();
      const originalSave = adapter.save.bind(adapter);
      vi.spyOn(adapter, "save").mockImplementation((data) => {
        expect(() => store.lockMandate(session.id)).toThrow();
        expect(store.isLocked(session.id)).toBe(true);
        originalSave(data);
      });
      const locked = store.lockMandate(session.id);
      expect(locked.version).toBe(session.version! + 1);
      expect(store.isLocked(session.id)).toBe(false);
    });

    it("preserves optimistic concurrency checks when saving the locked snapshot", () => {
      const { store, session } = setup();
      const staleSnapshot = structuredClone(session);
      store.lockMandate(session.id);
      expect(() => store.saveSession(staleSnapshot)).toThrow("Optimistic concurrency conflict");
      expect(store.getSession(session.id)!.mandate.isLocked).toBe(true);
    });

    it("allows a revised mandate to be locked again", () => {
      const { store, session } = setup("CANCELLED");
      const revised = store.reviseMandate(session.id, { maxTotalBudget: 4500 });
      const locked = store.lockMandate(session.id);
      expect(locked.status).toBe("NEGOTIATING");
      expect(locked.mandate.version).toBe(revised.mandate.version);
      expect(locked.mandate.maxTotalBudget).toBe(4500);
    });

    it("releases the operation lock for an unknown session", () => {
      const { store } = setup();
      expect(() => store.lockMandate("missing")).toThrow("not found");
      expect(store.isLocked("missing")).toBe(false);
    });
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
