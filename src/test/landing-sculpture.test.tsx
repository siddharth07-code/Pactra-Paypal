import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import { HeroSculptureCanvas } from "@/components/landing/HeroSculptureCanvas";

const state = { fail: false, renderers: [] as { domElement: HTMLCanvasElement; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setPixelRatio: ReturnType<typeof vi.fn> }[], resize: undefined as (() => void) | undefined, disconnect: () => {} };
vi.mock("three", async () => {
  const actual = await vi.importActual("three");
  return { ...actual as object, WebGLRenderer: vi.fn() };
});

beforeEach(() => {
  state.fail = false; state.renderers = []; state.disconnect = vi.fn();
  vi.mocked(THREE.WebGLRenderer).mockImplementation(function () {
    if (state.fail) throw new Error("WebGL unavailable");
    const renderer = { domElement: document.createElement("canvas"), render: vi.fn(), dispose: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(), shadowMap: { enabled: false } };
    state.renderers.push(renderer);
    return renderer as unknown as THREE.WebGLRenderer;
  });
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { state.resize = callback; } observe() {} disconnect = state.disconnect; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Landing sculpture resource lifecycle", () => {
  it("uses one canvas and renders on resize without a continuous animation loop", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { container } = render(<HeroSculptureCanvas />);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(state.renderers).toHaveLength(1); expect(raf).not.toHaveBeenCalled();
    expect(state.renderers[0].domElement).toHaveAttribute("aria-hidden", "true");
    const host = container.firstElementChild!;
    Object.defineProperties(host, { clientWidth: { configurable: true, value: 400 }, clientHeight: { configurable: true, value: 340 } });
    act(() => state.resize?.());
    expect(state.renderers[0].render).toHaveBeenCalledOnce();
    expect(state.renderers[0].setPixelRatio).toHaveBeenLastCalledWith(1);
  });
  it("restores a lost context without allocating a second renderer", () => {
    const { container } = render(<HeroSculptureCanvas />);
    const canvas = container.querySelector("canvas")!;
    act(() => { canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
    expect(container).toHaveTextContent("Agreement sculpture unavailable");
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(state.renderers).toHaveLength(1);
    expect(container).not.toHaveTextContent("unavailable");
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });
  it("disposes GPU resources and the resize observer when leaving the route", async () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const { unmount } = render(<HeroSculptureCanvas />);
    unmount();
    expect(state.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalled(); expect(materialDispose).toHaveBeenCalled();
    expect(state.renderers[0].domElement.isConnected).toBe(false);
  });
  it("degrades to a reserved, decorative fallback when WebGL is unavailable", () => {
    state.fail = true;
    const { container } = render(<HeroSculptureCanvas />);
    expect(container).toHaveTextContent("Agreement sculpture unavailable");
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
  it("does not recreate the scene on an ordinary parent rerender", () => {
    const { rerender } = render(<HeroSculptureCanvas />);
    rerender(<HeroSculptureCanvas className="updated" />);
    expect(state.renderers).toHaveLength(1);
    expect(state.renderers[0].dispose).not.toHaveBeenCalled();
  });
});
