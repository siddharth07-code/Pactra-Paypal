import "server-only";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { IdempotencyConflictError } from "@/lib/idempotency";
import { AuthError } from "@/lib/auth/config";
import { runtimeTlsUrl } from "./tls-url";

const clients = new Map<string, PrismaClient>();
export function database(worker = false): PrismaClient {
  const name = worker ? "WORKER_DATABASE_URL" : "DATABASE_URL";
  const url = process.env[name];
  if (!url) throw new AuthError(503, "DATABASE_UNAVAILABLE", "Required database infrastructure is unavailable.");
  try {
    const parsed = new URL(url);
    const role = decodeURIComponent(parsed.username).split(".")[0];
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || ["postgres", "supabase_admin", "service_role"].includes(role) || role.endsWith("_migrator")) throw new Error();
  } catch {
    throw new AuthError(503, "DATABASE_ROLE_UNSAFE", "Restricted runtime or worker database credentials are required.");
  }
  if (!clients.has(name)) {
    let verifiedUrl: string;
    try { verifiedUrl = runtimeTlsUrl(url); }
    catch { throw new AuthError(503, "DATABASE_TLS_CONFIGURATION", "Strict database TLS or its packaged CA is unavailable."); }
    clients.set(name, new PrismaClient({ datasources: { db: { url: verifiedUrl } } }));
  }
  return clients.get(name)!;
}
export type Transaction = Prisma.TransactionClient;
export { Prisma };

export async function serializable<T>(client: PrismaClient, work: (tx: Transaction) => Promise<T>): Promise<T> {
  const [role] = await client.$queryRaw<{ unsafe: boolean }[]>`
    SELECT (
      r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
      OR has_schema_privilege(current_user,'pactum','CREATE')
      OR EXISTS (
        SELECT 1 FROM pg_roles privileged
        WHERE privileged.rolname IN('pactum_policy_reader','pactum_migrator')
        AND pg_has_role(current_user,privileged.oid,'MEMBER')
      )
      OR (
        SELECT count(*)<>1 FROM pg_roles capability
        WHERE capability.rolname IN('pactum_runtime','pactum_worker')
        AND pg_has_role(current_user,capability.oid,'MEMBER')
      )
    ) AS unsafe FROM pg_roles r WHERE r.rolname=current_user`;
  if (!role || role.unsafe) throw new AuthError(503, "DATABASE_ROLE_UNSAFE", "Restricted runtime or worker database credentials are required.");
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(work, { isolationLevel: "Serializable", timeout: 15000, maxWait: 5000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      if (error instanceof AuthError || error instanceof IdempotencyConflictError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025"].includes(error.code)) throw new AuthError(409, "DATABASE_CONFLICT", "The resource changed or this operation already exists.");
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2004" || error.code === "P2010" && error.meta?.code === "23514")) throw new AuthError(409, "DATABASE_CONSTRAINT", "The operation violates a lifecycle or integrity constraint.");
      throw new AuthError(503, "DATABASE_UNAVAILABLE", "The database operation could not be committed.");
    }
  }
}
