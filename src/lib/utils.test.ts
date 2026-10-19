import { describe, it, expect } from "vitest";
import { getEnvironmentLabel } from "./utils";

describe("Phase 0 Environment & Foundation Checks", () => {
  it("provides deterministic environment labels", () => {
    const label = getEnvironmentLabel();
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});
