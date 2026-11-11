import { afterEach, describe, expect, it, vi } from "vitest";
import { NegotiationOrchestrator } from "@/lib/negotiation-orchestrator";
import { NATIVE_INR_FIXTURES_BY_CATEGORY, Channel3Client } from "@/lib/channel3-client";
import { CryptographicFlightRecorder } from "@/lib/flight-recorder";
import { verifyFxCommercialSession } from "@/lib/fx-session-verification";
import { computeAgreementHash, computeFxConversion, LiveFXProvider } from "@/lib/fx-settlement";
import { sessionStore } from "@/lib/session-store";
import type { ProcurementMandate } from "@/types/pactum";
import { exactLandedTotal } from "@/lib/currency";

const mandate: ProcurementMandate = { id: "critical-inr", rawPrompt: "Buy 25 monitors in INR", itemQuery: "4K USB-C monitors", quantity: 25, maxTotalBudget: 1000000, maxDeliveryDays: 5, minReturnDays: 30, requiredSpecs: [], currency: "INR", createdAt: new Date().toISOString(), version: 1 };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); sessionStore.clear(); });

describe("Commercial workflow regressions", () => {
  it("certifies the persisted INR chain, preserves accepted money, and verifies the certificate after append and reload", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    const result = await new NegotiationOrchestrator({ maxRounds: 4, onEvent: event => { events.push(event); } }).runNegotiation(mandate, NATIVE_INR_FIXTURES_BY_CATEGORY.monitors);
    const session = structuredClone(sessionStore.getSession(result.session.id)!);
    expect(session.auditCertificate?.passed).toBe(true);
    expect(verifyFxCommercialSession(session)).toBeUndefined();
    expect(session.agreementRecord?.supplierCommitmentVerified).toBe(false);
    expect(session.agreementRecord?.vendorProvenance).toBe("SIMULATED_VENDOR");
    expect(session.agreementRecord?.agreedPrice).toBe(session.finalOffer?.unitPrice);
    expect(session.agreementRecord?.currency).toBe("INR");
    const acceptance = events.filter(event => event.type.includes("ACCEPTANCE"));
    expect(acceptance.length).toBeGreaterThan(0);
    for (const event of acceptance) { expect(event.payload.unitPrice).toBeGreaterThan(0); expect(event.payload.currency).toBe("INR"); }
    for (const turn of session.turns.filter(turn => turn.actor === "VENDOR")) expect(turn.message).not.toContain("$");
    const root = session.auditCertificate!.verifiedRoot;
    const recorder = CryptographicFlightRecorder.fromSerialized(session.flightRecord!);
    recorder.recordEvent("FX_QUOTE_CREATED", { quoteId: "test-prefix", agreementHash: computeAgreementHash(session.agreementRecord!) });
    session.flightRecord = recorder.exportFlightRecord();
    session.preSettlementRoot = session.merkleRoot = recorder.getRootHash();
    expect(session.merkleRoot).not.toBe(root);
    expect(verifyFxCommercialSession(JSON.parse(JSON.stringify(session)))).toBeUndefined();
    const tampered = structuredClone(session);
    tampered.agreementRecord!.acceptedAt = new Date(0).toISOString();
    expect(verifyFxCommercialSession(tampered)).toContain("requires reconciliation");
  });

  it.each([["INR", "USD", "USD", "INR", 10000, 100], ["USD", "INR", "USD", "INR", 100, 10000], ["EUR", "INR", "EUR", "INR", 100, 10000], ["GBP", "GBP", "GBP", "GBP", 100, 100]])("preserves provider direction for %s to %s", async (source, target, base, quote, amount, expected) => {
    const now = Math.floor(Date.now() / 1000);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ result: "success", base_code: base, target_code: quote, conversion_rate: source === target ? 1 : 100, time_last_update_unix: now - 60, time_next_update_unix: now + 86340 }));
    vi.stubGlobal("fetch", fetcher);
    const record = await new LiveFXProvider("test-only-provider-key").getQuote({ sessionId: "test", agreementHash: "test", sourceCurrency: source, targetCurrency: target, sourceAmountMinor: amount });
    expect(record.targetAmountMinor).toBe(expected);
    expect(record.referenceRate?.baseCurrency).toBe(base);
    expect(record.referenceRate?.quoteCurrency).toBe(quote);
    expect(computeFxConversion(amount, record.rate, record.rateConvention)).toBe(expected);
  });

  it("rounds direct conversions HALF_UP using integers and rejects overflow", () => {
    expect(exactLandedTotal(0.29, 3, 0.1)).toBe(0.97);
    expect(() => exactLandedTotal(1.005, 1, 0)).toThrow(/two decimal/);
    expect(computeFxConversion(1, "0.5", "TARGET_PER_SOURCE")).toBe(1);
    expect(computeFxConversion(1, "0.499999999999", "TARGET_PER_SOURCE")).toBe(0);
    expect(() => computeFxConversion(Number.MAX_SAFE_INTEGER, "2", "TARGET_PER_SOURCE")).toThrow(/overflow/);
  });

  it("uses documented Channel3 search without inventing procurement terms or relabelling prices", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ products: [{ id: "p1", title: "Actual API fixture", offers: [{ domain: "merchant.example", url: "https://merchant.example/product", availability: "InStock", price: { price: 100, currency: "INR" } }, { domain: "foreign.example", url: "https://foreign.example/product", availability: "InStock", price: { price: 100, currency: "USD" } }] }] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await new Channel3Client({ apiKey: "test-only" }).sourceQuotes(mandate);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.trychannel3.com/v1/search");
    expect(result.catalogProducts).toHaveLength(1);
    expect(result.catalogProducts![0].currency).toBe("INR");
    expect(result.quotes).toEqual([]);
    expect(result.isFixture).toBe(false);
    expect(result.warning).toContain("verified merchant terms");
  });
});
