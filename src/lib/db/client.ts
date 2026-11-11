import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
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
    if (process.env.VERCEL === "1" && process.platform === "linux") {
      const engine = path.join(process.cwd(), "src/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node");
      if (!existsSync(engine)) throw new AuthError(503, "DATABASE_ENGINE_MISSING", "The deployment is missing its PostgreSQL query engine.");
      // Custom-output clients can retain the build directory in their engine search path.
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
    }
    let verifiedUrl: string;
    try { verifiedUrl = runtimeTlsUrl(url); }
    catch { throw new AuthError(503, "DATABASE_TLS_CONFIGURATION", "Strict database TLS or its packaged CA is unavailable."); }
    if (process.env.VERCEL === "1") {
      const target = new URL(verifiedUrl);
      console.info("[Database] connection configuration", JSON.stringify({ kind: worker ? "worker" : "runtime", host: target.hostname, port: target.port, role: decodeURIComponent(target.username).split(".")[0], schema: target.searchParams.get("schema"), pgbouncer: target.searchParams.get("pgbouncer"), sslmode: target.searchParams.get("sslmode"), sslaccept: target.searchParams.get("sslaccept"), packagedCa: target.searchParams.get("sslcert")?.endsWith("/prisma/certs/supabase-ca.cer") }));
    }
    clients.set(name, new PrismaClient({ datasources: { db: { url: verifiedUrl } } }));
  }
  return clients.get(name)!;
}
export type Transaction = Prisma.TransactionClient;
export { Prisma };

export async function serializable<T>(client: PrismaClient, work: (tx: Transaction) => Promise<T>): Promise<T> {
  let role: { unsafe: boolean } | undefined;
  try {
    [role] = await client.$queryRaw<{ unsafe: boolean }[]>`
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
  } catch (error) {
    reportDatabaseFailure(error, "role_preflight");
    throw new AuthError(503, "DATABASE_UNAVAILABLE", "The database connection could not be verified.");
  }
  if (!role || role.unsafe) throw new AuthError(503, "DATABASE_ROLE_UNSAFE", "Restricted runtime or worker database credentials are required.");
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(work, { isolationLevel: "Serializable", timeout: 15000, maxWait: 5000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      if (error instanceof AuthError || error instanceof IdempotencyConflictError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025"].includes(error.code)) throw new AuthError(409, "DATABASE_CONFLICT", "The resource changed or this operation already exists.");
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2004" || error.code === "P2010" && error.meta?.code === "23514")) throw new AuthError(409, "DATABASE_CONSTRAINT", "The operation violates a lifecycle or integrity constraint.");
      reportDatabaseFailure(error, "transaction");
      throw new AuthError(503, "DATABASE_UNAVAILABLE", "The database operation could not be committed.");
    }
  }
}

export function reportDatabaseFailure(error: unknown, stage: "role_preflight" | "transaction") {
  if (process.env.VERCEL !== "1") return;
  const failure = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = String(failure.code ?? failure.errorCode ?? "");
  const meta = failure.meta && typeof failure.meta === "object" ? failure.meta as Record<string, unknown> : {};
  const sqlstate = typeof meta.code === "string" && /^[0-9A-Z]{5}$/.test(meta.code) ? meta.code : undefined;
  const message = error instanceof Error ? error.message : "";
  const reason = /could not locate the Query Engine|Query engine library.*not found/i.test(message) ? "ENGINE_NOT_FOUND" : /Unable to require|Unable to load.*engine|libssl|GLIBC_|OPENSSL_/.test(message) ? "ENGINE_LOAD_FAILURE" : /Error opening a TLS connection|certificate|TLS/.test(message) ? "DATABASE_TLS" : /Can't reach database server/.test(message) ? "DATABASE_UNREACHABLE" : /Authentication failed|password authentication failed/.test(message) ? "DATABASE_AUTHENTICATION" : "UNCLASSIFIED_DATABASE_FAILURE";
  const type = ["PrismaClientInitializationError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientValidationError", "TypeError", "Error"].includes(String(failure.name)) ? String(failure.name) : "DatabaseError";
  console.error("[Database] operation failed", JSON.stringify({ stage, code: /^P[0-9]{4}$/.test(code) ? code : "DATABASE_ERROR", type, reason, sqlstate }));
}
