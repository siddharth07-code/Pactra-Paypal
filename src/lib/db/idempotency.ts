import "server-only";
import { randomUUID } from "node:crypto";
import { requestScope } from "@/lib/persistence/request-scope";
import { canonicalBytes, digest } from "./codec";
import { ConcurrentOperationInProgressError, IdempotencyPayloadMismatchError, type IdempotentExecuteOptions } from "@/lib/idempotency";

export async function executeDatabaseIdempotency<TReq, TRes>(options: IdempotentExecuteOptions<TReq, TRes>) {
  const scope = requestScope();
  if (!scope) throw new Error("An authorized database scope is required.");
  const context = scope.organization;
  const fingerprint = digest(canonicalBytes(options.payload));
  const record = await scope.transaction(async tx => {
    const old = await tx.idempotencyRecord.findUnique({ where: { organizationId_scope_key: { organizationId: context.organizationId, scope: options.scope, key: options.key } } });
    if (old) {
      if (old.fingerprint !== fingerprint) throw new IdempotencyPayloadMismatchError();
      if (old.status === "COMPLETED" && old.response) return old;
      // Expiry is not permission to blindly repeat a possibly submitted financial request.
      throw new ConcurrentOperationInProgressError("Existing operation requires completion or reconciliation before retry.");
    }
    return tx.idempotencyRecord.create({ data: { organizationId: context.organizationId, scope: options.scope, key: options.key, fingerprint, status: "IN_PROGRESS", executionId: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60000), expiresAt: new Date(Date.now() + (options.ttlMs ?? 86400000)) } });
  });
  if (record.status === "COMPLETED") return { status: record.responseStatus ?? 200, body: JSON.parse(Buffer.from(record.response!).toString()) as TRes, isReplay: true };
  const outcome = await options.execute();
  scope.completions.push({ id: record.id, executionId: record.executionId, status: "COMPLETED", responseStatus: outcome.status, response: new Uint8Array(canonicalBytes(outcome.body)) });
  return { ...outcome, isReplay: false };
}
