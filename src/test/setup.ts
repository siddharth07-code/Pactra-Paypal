import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

// Next.js enforces this boundary in builds; Vitest must be able to exercise server modules.
vi.mock("server-only", () => ({}));

// Routine suites are offline even if the invoking shell has real provider credentials.
beforeEach(() => {
  if (process.env.PACTUM_LIVE_TESTS !== "1" && (!vi.isMockFunction(globalThis.fetch) || !vi.mocked(globalThis.fetch).getMockImplementation())) {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("External HTTP is disabled in offline tests. Inject a provider mock.")));
  }
});

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (typeof globalThis.localStorage === "undefined" || !globalThis.localStorage?.clear) {
  let store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  }
}

