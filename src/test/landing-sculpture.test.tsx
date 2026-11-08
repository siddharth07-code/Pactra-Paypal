import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import { HeroSculptureCanvas } from "@/components/landing/HeroSculptureCanvas";
import gsap from "gsap";

const state = { fail: false, renderers: [] as { domElement: HTMLCanvasElement; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setPixelRatio: ReturnType<typeof vi.fn> }[], resize: undefined as (() => void) | undefined, disconnect: () => {} };
vi.mock("three", async () => {
  const actual = await vi.importActual("three");
  return { ...actual as object, WebGLRenderer: vi.fn(), PMREMGenerator: class { fromScene() { return { texture: null, dispose: vi.fn() }; } dispose() {} } };
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

function activeMotion() {
  const tweens: { paused: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn>; scrollTrigger: { disable: ReturnType<typeof vi.fn>; enable: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } }[] = [];
  const updates: (() => void)[] = [];
  const tween = () => {
    const value = { paused: vi.fn(), pause: vi.fn(), kill: vi.fn(), scrollTrigger: { disable: vi.fn(), enable: vi.fn(), kill: vi.fn() } };
    tweens.push(value); return value as unknown as gsap.core.Tween;
  };
  vi.spyOn(gsap, "to").mockImplementation((_target, vars) => { if (vars.onUpdate) updates.push(vars.onUpdate); return tween(); });
  vi.spyOn(gsap, "quickTo").mockImplementation(() => Object.assign(vi.fn(), { tween: tween() }) as ReturnType<typeof gsap.quickTo>);
  let revert: (() => void) | undefined;
  vi.spyOn(gsap, "matchMedia").mockReturnValue({ add: (_query: unknown, run: () => (() => void)) => { revert = run(); }, revert: () => revert?.() } as unknown as gsap.MatchMedia);
  return { tweens, updates };
}

describe("Landing sculpture resource lifecycle", () => {
  it("uses one canvas and renders the reduced-motion pose on resize", () => {
    const { container } = render(<HeroSculptureCanvas />);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(state.renderers).toHaveLength(1);
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
  it("pauses every scene animation and scroll response without recreating WebGL", () => {
    const { tweens } = activeMotion();
    const { rerender, unmount } = render(<HeroSculptureCanvas />);
    rerender(<HeroSculptureCanvas paused />);
    expect(tweens[0].paused).toHaveBeenLastCalledWith(true);
    expect(tweens[1].paused).toHaveBeenLastCalledWith(true);
    expect(tweens[2].scrollTrigger.disable).toHaveBeenCalledWith(false);
    expect(state.renderers).toHaveLength(1);
    rerender(<HeroSculptureCanvas paused={false} />);
    expect(tweens[1].paused).toHaveBeenLastCalledWith(false);
    expect(tweens[2].scrollTrigger.enable).toHaveBeenCalledWith(false, false);
    unmount();
    expect(tweens).toHaveLength(5);
    for (const animation of tweens) expect(animation.kill).toHaveBeenCalled();
  });
  it("does not draw animation frames while the sculpture is offscreen", () => {
    const { updates } = activeMotion();
    let intersection: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof intersection) { intersection = callback; } observe() {} disconnect() {} });
    render(<HeroSculptureCanvas />);
    state.renderers[0].render.mockClear();
    act(() => { intersection?.([{ isIntersecting: false }]); updates[0](); });
    expect(state.renderers[0].render).not.toHaveBeenCalled();
    act(() => { intersection?.([{ isIntersecting: true }]); });
    expect(state.renderers[0].render).toHaveBeenCalledOnce();
  });
});
