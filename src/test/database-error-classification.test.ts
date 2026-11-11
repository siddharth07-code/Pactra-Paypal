import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { serializable, Prisma } from "@/lib/db/client";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("database authorization preflight failures", () => {
  it("classifies connection failures as database outages without running tenant work", async () => {
    vi.stubEnv("VERCEL", "1");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { $queryRaw: vi.fn().mockRejectedValue(Object.assign(new Error("private-connection-secret"), { errorCode: "P1001" })), $transaction: vi.fn() };
    await expect(serializable(client as unknown as PrismaClient, async () => 1)).rejects.toMatchObject({ status: 503, code: "DATABASE_UNAVAILABLE" });
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain("P1001");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-connection-secret");
  });
  it("reports a missing Prisma runtime engine as a database initialization failure", async () => {
    vi.stubEnv("VERCEL", "1");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Prisma.PrismaClientInitializationError('Prisma Client could not locate the Query Engine for runtime "rhel-openssl-3.0.x". private-build-path', "6.19.3");
    const client = { $queryRaw: vi.fn().mockRejectedValue(error), $transaction: vi.fn() };
    await expect(serializable(client as unknown as PrismaClient, async () => 1)).rejects.toMatchObject({ status: 503, code: "DATABASE_UNAVAILABLE" });
    expect(JSON.stringify(log.mock.calls)).toContain("ENGINE_NOT_FOUND");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-build-path");
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("still rejects unsafe roles before tenant work", async () => {
    const client = { $queryRaw: vi.fn().mockResolvedValue([{ unsafe: true }]), $transaction: vi.fn() };
    await expect(serializable(client as unknown as PrismaClient, async () => 1)).rejects.toMatchObject({ code: "DATABASE_ROLE_UNSAFE" });
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("preserves safe SQLSTATE diagnostics without disclosing query data", async () => {
    vi.stubEnv("VERCEL", "1");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Prisma.PrismaClientKnownRequestError("private-query-secret", { code: "P2010", clientVersion: "6.19.3", meta: { code: "42501", message: "private-query-secret" } });
    const client = { $queryRaw: vi.fn().mockResolvedValue([{ unsafe: false }]), $transaction: vi.fn().mockRejectedValue(error) };
    await expect(serializable(client as unknown as PrismaClient, async () => 1)).rejects.toMatchObject({ status: 503, code: "DATABASE_UNAVAILABLE" });
    expect(JSON.stringify(log.mock.calls)).toContain("42501");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-query-secret");
  });
});
