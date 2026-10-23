import { describe, it, expect, beforeEach } from "vitest";
import { LifecycleHarness } from "./e2e-harness";
import { sessionStore } from "./session-store";

describe("End-to-End Lifecycle Scenarios (Phase 5)", () => {
  let harness: LifecycleHarness;

  beforeEach(() => {
    sessionStore.clear();
    harness = new LifecycleHarness();
  });

  it("Scenario A: executes successful procurement lifecycle to audited settlement", async () => {
    const result = await harness.runScenarioA();

    expect(result.scenario).toBe("A");
    expect(result.success).toBe(true);
    expect(result.details.auditPassed).toBe(true);
    expect(result.details.totalCost).toBeLessThanOrEqual(8500);
    expect(result.details.merkleRoot).toMatch(/^[0-9a-fA-F]{64}$/);
    expect(result.details.orderId).toBeDefined();
    expect(result.details.captureId).toBeDefined();
    expect(result.details.eventsRecorded).toBeGreaterThanOrEqual(5);
  });

  it("Scenario B: enforces NO_DEAL outcome and strictly blocks settlement when budget is unfeasible", async () => {
    const result = await harness.runScenarioB();

    expect(result.scenario).toBe("B");
    expect(result.success).toBe(true);
    expect(result.details.outcome).toBe("NO_DEAL");
    expect(result.details.sessionStatus).toBe("AUDIT_FAILED");
    expect(result.details.settlementBlocked).toBe(true);
    expect(result.details.agreementCreated).toBe(false);
  });

  it("Scenario C: detects adversarial tampering of committed event and blocks settlement capture", async () => {
    const result = await harness.runScenarioC();

    expect(result.scenario).toBe("C");
    expect(result.success).toBe(true);
    expect(result.details.tamperDetected).toBe(true);
    expect(result.details.auditPassed).toBe(false);
    expect(result.details.settlementBlocked).toBe(true);
    expect(result.details.auditReason).toContain("integrity failed");
  });

  it("Scenario D: invalidates stale agreement from previous mandate revision and blocks settlement", async () => {
    const result = await harness.runScenarioD();

    expect(result.scenario).toBe("D");
    expect(result.success).toBe(true);
    expect(result.details.initialMandateVersion).toBe(1);
    expect(result.details.revisedMandateVersion).toBe(2);
    expect(result.details.staleAgreementRejected).toBe(true);
    expect(result.details.settlementBlocked).toBe(true);
  });

  it("Scenario E: fails ACWORLD Invariant 3 and blocks settlement when merchant DOM attestation is missing", async () => {
    const result = await harness.runScenarioE();

    expect(result.scenario).toBe("E");
    expect(result.success).toBe(true);
    expect(result.details.missingAttestationDetected).toBe(true);
    expect(result.details.auditPassed).toBe(false);
    expect(result.details.settlementBlocked).toBe(true);
    expect(result.details.auditReason).toContain("Merchant DOM attestation evidence missing");
  });

  it("Scenario F: executes dispute resolution workflow, verifies breach, and generates Merkle proofs", async () => {
    const result = await harness.runScenarioF();

    expect(result.scenario).toBe("F");
    expect(result.success).toBe(true);
    expect(result.details.disputeCategory).toBe("WRONG_ITEM");
    expect(result.details.disputeStatus).toBe("VERIFIED");
    expect(result.details.breachVerified).toBe(true);
    expect(result.details.proofCount).toBeGreaterThanOrEqual(1);
    expect(result.details.evidenceRoot).toMatch(/^[0-9a-fA-F]{64}$/);
    expect(result.details.resolutionRationale).toContain("Wrong item breach verified");
  });

  it("executes all 6 scenarios sequentially via runAllScenarios", async () => {
    const results = await harness.runAllScenarios();

    expect(results.A.success).toBe(true);
    expect(results.B.success).toBe(true);
    expect(results.C.success).toBe(true);
    expect(results.D.success).toBe(true);
    expect(results.E.success).toBe(true);
    expect(results.F.success).toBe(true);
  });
});
