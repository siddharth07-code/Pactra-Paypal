import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthoritativeSessionStore } from "@/lib/session-store";
import type { OrganizationContext } from "@/lib/db/authorization";
import type { ProcurementSession } from "@/types/pactum";

export interface RequestScope {
  store: AuthoritativeSessionStore;
  organization: OrganizationContext | { organizationId: string; principal: null; userId: null; role: null };
  permission: import("@/lib/organizations/permissions").Permission;
  persist(session: ProcurementSession): Promise<void>;
  flush(): Promise<void>;
  acceptCommitted(session: ProcurementSession): void;
  completions: { id: string; executionId: string; status: string; responseStatus: number; response: Uint8Array<ArrayBuffer> }[];
  orders: Map<string, import("@/lib/paypal-client").PayPalOrderDetails>;
  verifiedCaptures: Map<string, { id: string; amountMinor: bigint; currency: string }>;
  transaction<T>(work: (tx: import("@/lib/db/client").Transaction) => Promise<T>): Promise<T>;
  worker?: { jobId: string; token: string; eventId?: string; verifiedEventHash?: string; boundSessionId?: string; claimEntered?: boolean; outcome?: "PROCESSED" | "FAILED"; receipt?: Uint8Array<ArrayBuffer> };
}
const storage = new AsyncLocalStorage<RequestScope>();
export const requestScope = () => storage.getStore();
export const withRequestScope = <T>(scope: RequestScope, work: () => T): T => storage.run(scope, work);
