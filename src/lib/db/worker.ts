import "server-only";
import { database, serializable, type Transaction } from "./client";
import { AuthError } from "@/lib/auth/config";
export async function withWorkerTransaction<T>(organizationId: string, jobId: string, token: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return serializable(database(true), async tx => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true), set_config('app.job_id', ${jobId}, true), set_config('app.lease_token', ${token}, true)`;
    const [owned] = await tx.$queryRaw<{ owned: boolean }[]>`SELECT pactum.worker_scope(${organizationId}::uuid) AS owned`;
    if (!owned?.owned) throw new AuthError(409, "LEASE_LOST", "Worker no longer owns this operation.");
    return work(tx);
  });
}
