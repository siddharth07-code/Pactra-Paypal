import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/veripay-merkle";
import type { ProcurementSession } from "@/types/pactum";

const moneyKeys = new Set(["maxTotalBudget", "unitPrice", "shippingCost", "initialUnitAsk", "currentUnitBid", "agreedPrice", "totalCost", "captureAmount", "amount"]);
export function minor(value: number | string): bigint {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Monetary values must be nonnegative exact cents/paise.");
  const [whole, fraction = ""] = text.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Monetary value exceeds the supported safe-integer boundary.");
  return result;
}
export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export const canonicalBytes = (value: unknown) => Buffer.from(canonicalJson(value));
export function encodeSession(session: ProcurementSession): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(JSON.stringify(session, (key, value: unknown) => {
    if (moneyKeys.has(key) && typeof value === "number") return { $minor: minor(value).toString() };
    return value;
  })));
}
export function decodeSession(bytes: Uint8Array): ProcurementSession {
  return JSON.parse(Buffer.from(bytes).toString(), (_key, value: unknown) => {
    if (value && typeof value === "object" && "$minor" in value) {
      const encoded = String(value.$minor);
      if (!/^\d+$/.test(encoded) || BigInt(encoded) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid persisted money.");
      const amount = Number(BigInt(encoded)) / 100;
      if (minor(amount) !== BigInt(encoded)) throw new Error("Persisted money cannot be represented by the current domain DTO.");
      return amount;
    }
    return value;
  }) as ProcurementSession;
}
