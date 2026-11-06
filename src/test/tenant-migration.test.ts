import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { roles, permissions, permitted, canGrant } from "@/lib/organizations/permissions";
import { minor, encodeSession, decodeSession, digest } from "@/lib/db/codec";
import { validateLegacy, validateLegacyLedger } from "@/lib/migration/legacy";
import { computePersistenceChecksum } from "@/lib/persistence/session-persistence";
import { AuthoritativeSessionStore } from "@/lib/session-store";
import { MemorySessionPersistenceAdapter } from "@/lib/persistence/session-persistence";
function fixture() {
  const store = new AuthoritativeSessionStore(new MemorySessionPersistenceAdapter());
  const session = store.createSession({ id: randomUUID(), rawPrompt: "Monitors", itemQuery: "Monitors", quantity: 1, maxTotalBudget: 1000, maxDeliveryDays: 5, minReturnDays: 14, requiredSpecs: [], currency: "USD", createdAt: new Date().toISOString() });
  const data = { sessions: [session], mandateHistory: {} };
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, checksum: computePersistenceChecksum(data), data }));
  return { session, bytes, manifest: { sourceDigest: digest(bytes), sessions: { [session.id]: randomUUID() } } };
}
describe("organization role matrix", () => {
  for (const role of roles) for (const permission of Object.keys(permissions) as (keyof typeof permissions)[]) {
    it(`${role}: ${permission}`, () => expect(permitted(role, permission)).toBe((permissions[permission] as readonly string[]).includes(role)));
  }
  it("limits administrator grants", () => { expect(canGrant("ADMIN", "OWNER")).toBe(false); expect(canGrant("ADMIN", "FINANCE_MANAGER")).toBe(false); expect(canGrant("ADMIN", "ADMIN")).toBe(false); expect(canGrant("ADMIN", "VIEWER")).toBe(true); });
});
describe("exact snapshots and read-only legacy validation", () => {
  it.each([[-1], [NaN], [Infinity], [1.001], [90071992547410]])("rejects unsafe monetary value %s", value => expect(() => minor(value)).toThrow());
  it("persists exact decimal minor units", () => { expect(minor("658234.25")).toBe(65823425n); const { session } = fixture(); expect(decodeSession(encodeSession(session))).toEqual(session); });
  it("validates explicit ownership and source checksum", () => { const f = fixture(); expect(validateLegacy(f.bytes, f.manifest).records[0].status).toBe("VALIDATED"); });
  it("quarantines unknown ownership", () => { const f = fixture(); expect(validateLegacy(f.bytes, { ...f.manifest, sessions: {} }).records[0].status).toBe("QUARANTINED"); });
  it("rejects changed source bytes", () => { const f = fixture(); expect(() => validateLegacy(Buffer.from(f.bytes.toString() + " "), f.manifest)).toThrow("exact source"); });
  it("rejects a corrupted checksum", () => { const f = fixture(); const bytes = Buffer.from(f.bytes.toString().replace('"checksum":"sha256:', '"checksum":"invalid:')); expect(() => validateLegacy(bytes, { ...f.manifest, sourceDigest: digest(bytes) })).toThrow("checksummed"); });
  it("does not activate unverifiable provider identities", () => { const f = fixture(); const data = { sessions: [{ ...f.session, paypalOrderId: "UNVERIFIED-ORDER" }], mandateHistory: {} }; const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, data, checksum: computePersistenceChecksum(data) })); expect(validateLegacy(bytes, { ...f.manifest, sourceDigest: digest(bytes) }).records[0].reasons).toContain("Provider identity must be independently reconciled before activation."); });
});

describe("legacy ledger quarantine", () => {
  it.each(["IDEMPOTENCY", "WEBHOOK"] as const)("archives %s without inventing tenant/provider evidence", type => {
    const records = { legacy: { status: "PROCESSED" } };
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, checksum: computePersistenceChecksum(records), [type === "IDEMPOTENCY" ? "records" : "entries"]: records }));
    expect(validateLegacyLedger(bytes, type)).toMatchObject({ status: "QUARANTINED", count: 1 });
  });
  it("rejects corrupt ledger bytes", () => expect(() => validateLegacyLedger(Buffer.from('{}'), "WEBHOOK")).toThrow());
});
