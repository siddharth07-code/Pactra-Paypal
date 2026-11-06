/** Explicit operator tool; dry run by default. Never reads .env. */
import fs from "node:fs";
import { PrismaClient } from "../../src/generated/prisma/client";
import { validateLegacy, validateLegacyLedger, type OwnershipManifest } from "../../src/lib/migration/legacy";
import { persistAggregate } from "../../src/lib/persistence/prisma-session-repository";
import { canonicalBytes, minor } from "../../src/lib/db/codec";
async function main() {
const [source, mapping, ...flags] = process.argv.slice(2);
const flag = flags.includes("--apply") ? "--apply" : undefined;
if (!source || !mapping || flags.some(f => f !== "--apply" && !f.startsWith("--idempotency=") && !f.startsWith("--webhooks="))) throw new Error("Usage: tsx --conditions=react-server scripts/migration/legacy.ts snapshot.json ownership.json [--apply]");
const bytes = fs.readFileSync(source), manifest = JSON.parse(fs.readFileSync(mapping, "utf8")) as OwnershipManifest;
const report = validateLegacy(bytes, manifest);
const sourceData = JSON.parse(bytes.toString()).data as import("../../src/lib/persistence/session-persistence").SessionPersistenceData;
const ledgers = flags.filter(f => f.startsWith("--idempotency=") || f.startsWith("--webhooks=")).map(f => {
  const bytes = fs.readFileSync(f.slice(f.indexOf("=") + 1));
  return { bytes, report: validateLegacyLedger(bytes, f.startsWith("--idempotency=") ? "IDEMPOTENCY" : "WEBHOOK") };
});
const summary = { ledgers: ledgers.map(l => l.report), sourceDigest: report.sourceDigest, manifestDigest: report.manifestDigest, records: report.records.map(({ id, status, reasons }) => ({ id, status, reasons })) };
if (flag === "--apply") {
  if (process.env.PACTUM_LEGACY_IMPORT_APPROVED !== "1" || !process.env.MIGRATION_DATABASE_URL) throw new Error("Explicit migration approval and MIGRATION_DATABASE_URL are required.");
  const db = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  try {
    await db.$transaction(async tx => {
      const previous = await tx.migrationBatch.findUnique({ where: { sourceDigest: report.sourceDigest } });
      if (previous) {
        if (previous.manifestDigest !== report.manifestDigest || JSON.stringify((previous.report as { ledgers?: unknown }).ledgers ?? []) !== JSON.stringify(summary.ledgers)) throw new Error("Ownership mapping or ledger inputs changed for an existing batch.");
        return;
      }
      const batch = await tx.migrationBatch.create({ data: { sourceDigest: report.sourceDigest, manifestDigest: report.manifestDigest, status: "IMPORTED_WITH_QUARANTINE", report: summary } });
      // Retain the exact complete envelope bytes, not a reserialized approximation.
      await tx.migrationSourceRecord.create({ data: { batchId: batch.id, sourceType: "SNAPSHOT_BYTES", sourceKey: report.sourceDigest, sourceDigest: report.sourceDigest, status: "ARCHIVED", originalBytes: bytes } });
      for (const ledger of ledgers) await tx.migrationSourceRecord.create({ data: { batchId: batch.id, sourceType: ledger.report.type, sourceKey: ledger.report.sourceDigest, sourceDigest: ledger.report.sourceDigest, status: "QUARANTINED", originalBytes: ledger.bytes } });
      for (const [sourceIndex, record] of report.records.entries()) {
        let importedId: string | undefined;
        if (record.status === "VALIDATED") {
          if (!await tx.organization.findUnique({ where: { id: record.organizationId! } })) throw new Error("Mapped organization does not exist.");
          const existing = await tx.procurementSession.findUnique({ where: { publicId: record.id } });
          if (existing) throw new Error("Public session identity already exists outside this batch.");
          await persistAggregate(tx, { organizationId: record.organizationId!, userId: null }, structuredClone(record.session), null);
          importedId = (await tx.procurementSession.findUniqueOrThrow({ where: { publicId: record.id } })).id;
          for (const mandate of sourceData.mandateHistory[record.id] ?? []) {
            const revision = mandate.version ?? 1;
            const key = { sessionId: importedId, organizationId: record.organizationId!, revision };
            const canonical = canonicalBytes(Object.fromEntries(Object.entries(mandate).filter(([key]) => key !== "isLocked")));
            const existing = await tx.mandateRevision.findUnique({ where: { sessionId_organizationId_revision: key } });
            if (existing && !Buffer.from(existing.canonicalBytes).equals(canonical)) throw new Error("Historical mandate conflicts with the current revision.");
            if (!existing) await tx.mandateRevision.create({ data: { ...key, currency: mandate.currency, budgetMinor: minor(mandate.maxTotalBudget), quantity: BigInt(mandate.quantity), canonicalBytes: canonical } });
          }
        }
        await tx.migrationSourceRecord.create({ data: { batchId: batch.id, sourceType: "SESSION", sourceKey: `${record.id}:${sourceIndex}`, sourceDigest: record.digest, organizationId: record.organizationId, importedId, status: record.status, originalBytes: canonicalBytes(record.session) } });
      }
    }, { isolationLevel: "Serializable", timeout: 60000 });
  } finally { await db.$disconnect(); }
}
console.log(JSON.stringify({ dryRun: flag !== "--apply", ...summary }, null, 2));

}
void main().catch(() => { console.error("Legacy validation/import failed. Source data remains unchanged; review the manifest, validation report and database privileges."); process.exitCode = 1; });
