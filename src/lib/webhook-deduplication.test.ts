import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebhookDeduplicationLedger } from "./webhook-deduplication";

describe("webhook claims and durable completion", () => {
  const directories: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks(); vi.useRealTimers();
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });
  function fileLedger() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pactum-webhook-test-"));
    directories.push(directory);
    const filePath = path.join(directory, "ledger.json");
    return { filePath, ledger: new WebhookDeduplicationLedger({ filePath, processingTimeoutMs: 30_000 }) };
  }

  it("does not expire an active in-process claim while its handler is running", () => {
    vi.useFakeTimers();
    const ledger = new WebhookDeduplicationLedger({ filePath: null, processingTimeoutMs: 30_000 });
    expect(ledger.recordProcessing("EVENT", "TYPE")).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(ledger.recordProcessing("EVENT", "TYPE")).toBe(false);
    ledger.recordProcessed("EVENT");
    expect(ledger.isProcessed("EVENT")).toBe(true);
    expect(ledger.isProcessing("EVENT")).toBe(false);
  });

  it("allows retry after an explicitly failed operation", () => {
    const ledger = new WebhookDeduplicationLedger({ filePath: null });
    ledger.recordProcessing("EVENT", "TYPE");
    ledger.recordFailed("EVENT", "Retry required");
    expect(ledger.recordProcessing("EVENT", "TYPE")).toBe(true);
  });

  it("recovers a timed-out persisted claim after a simulated process restart", () => {
    vi.useFakeTimers();
    const { ledger, filePath } = fileLedger();
    ledger.recordProcessing("EVENT", "TYPE");
    vi.advanceTimersByTime(60_000);
    const restarted = new WebhookDeduplicationLedger({ filePath });
    expect(restarted.recordProcessing("EVENT", "TYPE")).toBe(true);
  });

  it("restores the previous entry when claim persistence fails", () => {
    const { ledger } = fileLedger();
    ledger.recordProcessing("EVENT", "TYPE");
    ledger.recordFailed("EVENT", "Previous failure");
    const previous = ledger.getEntry("EVENT");
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => ledger.recordProcessing("EVENT", "TYPE")).toThrow("persistence failed");
    expect(ledger.getEntry("EVENT")).toEqual(previous);
    expect(ledger.isProcessing("EVENT")).toBe(false);
    expect(ledger.recordProcessing("EVENT", "TYPE")).toBe(true);
  });

  it("does not retain a new claim when the write fails", () => {
    const { ledger } = fileLedger();
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => ledger.recordProcessing("EVENT", "TYPE")).toThrow("persistence failed");
    expect(ledger.getEntry("EVENT")).toBeUndefined();
    expect(ledger.isProcessing("EVENT")).toBe(false);
  });

  it("does not report completion if atomic replacement fails", () => {
    const { ledger, filePath } = fileLedger();
    ledger.recordProcessing("EVENT", "TYPE");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("EIO"); });
    expect(() => ledger.recordProcessed("EVENT")).toThrow("persistence failed");
    expect(ledger.isProcessed("EVENT")).toBe(false);
    expect(new WebhookDeduplicationLedger({ filePath }).isProcessed("EVENT")).toBe(false);
    ledger.recordProcessed("EVENT");
    expect(new WebhookDeduplicationLedger({ filePath }).isProcessed("EVENT")).toBe(true);
  });

  it("propagates failed-status persistence errors and preserves the prior entry", () => {
    const { ledger } = fileLedger();
    ledger.recordProcessing("EVENT", "TYPE");
    const previous = ledger.getEntry("EVENT");
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw new Error("ENOSPC"); });
    expect(() => ledger.recordFailed("EVENT", "Failure")).toThrow("persistence failed");
    expect(ledger.getEntry("EVENT")).toEqual(previous);
    expect(ledger.isProcessed("EVENT")).toBe(false);
  });
});
