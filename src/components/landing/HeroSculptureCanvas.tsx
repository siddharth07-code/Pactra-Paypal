"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface HeroCanvasProps {
  onLoaded?: () => void;
  className?: string;
  paused?: boolean;
}

/**
 * Procedural low-poly/fissured craggy basalt geometry generator
 */
function createCraggyBasaltGeometry(
  radius: number,
  height: number,
  roughness: number = 0.35,
  seed: number = 42
): THREE.BufferGeometry {
  const geom = new THREE.DodecahedronGeometry(radius, 2);
  const pos = geom.attributes.position;
  const v = new THREE.Vector3();

  const pseudoNoise = (x: number, y: number, z: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  };

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = pseudoNoise(v.x, v.y, v.z);
    const facetNoise = Math.sign(n) * Math.pow(Math.abs(n), 1.4);
    v.multiplyScalar(1 + facetNoise * roughness);
    if (v.y < -radius * 0.4) {
      v.y *= 0.6;
    }
    pos.setXYZ(i, v.x, v.y * (height / radius), v.z);
  }

  geom.computeVertexNormals();
  return geom;
}

export function HeroSculptureCanvas({ onLoaded, className = "", paused = false }: HeroCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);
  const pausedRef = useRef(paused);
  const motionControl = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => {
    pausedRef.current = paused;
    motionControl.current?.(paused);
  }, [paused]);

  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setWebglSupported(false);
      onLoaded?.();
      return;
    }

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 700;

    const scene = new THREE.Scene();
    const createEnvironment = () => {
      const environment = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(renderer);
      try { return pmrem.fromScene(environment, .04); }
      finally { environment.dispose(); pmrem.dispose(); }
    };
    let environmentTarget: THREE.WebGLRenderTarget;
    try { environmentTarget = createEnvironment(); }
    catch { renderer.dispose(); setWebglSupported(false); onLoaded?.(); return; }
    scene.environment = environmentTarget.texture;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 0.1, 5.0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 640 ? 1 : 1.5));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = false;
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xf5f3ef, 0.58);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffbf5, 2.5);
    keyLight.position.set(-3.2, 4.5, 3.8);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0e4ec, 0.55);
    fillLight.position.set(4.0, -1.8, 2.2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 3.2);
    rimLight.position.set(2.5, 3.8, -3.5);
    scene.add(rimLight);

    const aluminumMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#EAE7E2"),
      metalness: 0.88,
      roughness: 0.27,
      clearcoat: 0.2,
      anisotropy: 0.45,
    });

    const chamferMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#FFFFFF"),
      metalness: 1.0,
      roughness: 0.04,
    });

    const graphiteMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1C1C1D"),
      metalness: 0.15,
      roughness: 0.68,
    });

    const vermilionMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#C43A1D"),
      metalness: 0.4,
      roughness: 0.3,
      emissive: new THREE.Color("#C43A1D"),
      emissiveIntensity: 0.32,
    });

    const basaltMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#121212"),
      metalness: 0.04,
      roughness: 0.90,
      flatShading: true,
    });

    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    const lowerBasaltGeom = createCraggyBasaltGeometry(1.6, 1.1, 0.42, 101);
    const lowerBasalt = new THREE.Mesh(lowerBasaltGeom, basaltMaterial);
    lowerBasalt.position.set(0.0, -1.55, -0.2);
    lowerBasalt.rotation.set(0.2, 0.8, -0.15);
    lowerBasalt.scale.set(1.0, 0.65, 0.9);
    scene.add(lowerBasalt);

    const plateWidth = 2.1;
    const plateHeight = 3.0;
    const plateDepth = 0.08;

    const plateGroup = new THREE.Group();
    heroGroup.add(plateGroup);

    const plate1Geom = new RoundedBoxGeometry(plateWidth, plateHeight, plateDepth, 3, .035);
    const plate1 = new THREE.Mesh(plate1Geom, aluminumMaterial);
    plate1.position.set(0, 0, 0.07);
    plateGroup.add(plate1);

    // An edge outline avoids covering the lit plate face with an unlit chrome box.
    const chamferGeom = new THREE.EdgesGeometry(plate1Geom);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: "#d7d4ce", transparent: true, opacity: 0.6 });
    const chamferEdge = new THREE.LineSegments(chamferGeom, edgeMaterial);
    plate1.add(chamferEdge);

    const plate2Geom = new RoundedBoxGeometry(plateWidth * 0.98, plateHeight * 0.98, plateDepth, 3, .035);
    const plate2 = new THREE.Mesh(plate2Geom, aluminumMaterial);
    plate2.position.set(0.04, -0.02, 0.0);
    plateGroup.add(plate2);

    const plate3Geom = new RoundedBoxGeometry(plateWidth, plateHeight, plateDepth, 3, .035);
    const plate3 = new THREE.Mesh(plate3Geom, aluminumMaterial);
    plate3.position.set(-0.02, -0.04, -0.07);
    plateGroup.add(plate3);

    const spineGeom = new THREE.CylinderGeometry(0.05, 0.05, plateHeight + 0.2, 16);
    const spine = new THREE.Mesh(spineGeom, graphiteMaterial);
    spine.position.set(-plateWidth / 2 - 0.03, 0, 0);
    plateGroup.add(spine);

    const seamGeom = new THREE.BoxGeometry(0.025, plateHeight * 0.85, 0.01);
    const seam = new THREE.Mesh(seamGeom, vermilionMaterial);
    seam.position.set(-plateWidth / 2 + 0.12, 0, plateDepth / 2 + .005);
    plate1.add(seam);

    const inscriptionGeometry = new THREE.BoxGeometry(1, .013, .005);
    const inscriptionMaterial = new THREE.MeshStandardMaterial({ color: "#4d4b45", metalness: .45, roughness: .6 });
    [.8, .58, 1.05].forEach((length, index) => {
      const line = new THREE.Mesh(inscriptionGeometry, inscriptionMaterial);
      line.scale.x = length;
      line.position.set(-.05, .85 - index * .15, plateDepth / 2 + .004);
      plate1.add(line);
    });

    const pinGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.24, 16);
    const pinPositions = [
      [-plateWidth / 2 + 0.25, plateHeight / 2 - 0.35],
      [plateWidth / 2 - 0.25, plateHeight / 2 - 0.35],
      [-plateWidth / 2 + 0.25, -plateHeight / 2 + 0.35],
      [plateWidth / 2 - 0.25, -plateHeight / 2 + 0.35],
    ];

    pinPositions.forEach(([px, py]) => {
      const pin = new THREE.Mesh(pinGeom, chamferMaterial);
      pin.rotation.x = Math.PI / 2;
      pin.position.set(px, py, 0.02);
      plateGroup.add(pin);
    });

    heroGroup.position.set(0, 0.05, 0.1);
    heroGroup.rotation.set(
      THREE.MathUtils.degToRad(-18),
      THREE.MathUtils.degToRad(34),
      THREE.MathUtils.degToRad(-12)
    );

    let contextLost = false;
    let visible = true;
    const pose = { reveal: 1, scroll: 0, tiltX: 0, tiltY: 0, float: 0, sweep: 0 };
    const draw = () => {
      if (contextLost || !visible || document.hidden) return;
      const spread = (1 - pose.reveal) * .65 + pose.scroll * .55;
      plate1.position.z = .12 + spread;
      plate2.position.set(.06 + spread * .4, -.025, 0);
      plate3.position.set(-.06 - spread * .25, -.05, -.12 - spread * .35);
      heroGroup.rotation.set(-.25 + pose.tiltX, .62 + pose.tiltY + pose.scroll * .18, -.12);
      heroGroup.position.y = .05 + pose.float - (1 - pose.reveal) * .2;
      rimLight.position.x = -1.5 + pose.reveal * 4 + pose.sweep * .5;
      renderer.render(scene, camera);
    };
    const handleResize = () => {
      if (contextLost) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (newWidth === 0 || newHeight === 0) return;

      camera.aspect = newWidth / newHeight;
      // Fit the complete assembly rather than cropping it to a narrow canvas.
      camera.position.z = Math.max(7.6, 7.2 / camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, newWidth < 640 ? 1 : 1.5));
      renderer.setSize(newWidth, newHeight);
      draw();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();
    onLoaded?.();

    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      pose.reveal = pausedRef.current ? 1 : 0;
      const intro = gsap.to(pose, { reveal: 1, duration: 2.2, ease: "power3.out", onUpdate: draw });
      // The slow light pass exposes the plate edges; pause it whenever the scene cannot be seen.
      const ambient = gsap.to(pose, { float: .035, sweep: 1, duration: 4.5, yoyo: true, repeat: -1, ease: "sine.inOut", onUpdate: draw });
      const scroll = gsap.to(pose, { scroll: 1, ease: "none", onUpdate: draw, scrollTrigger: {
        trigger: container.closest(".landing-hero") ?? container,
        start: "top top", end: "bottom top", scrub: .65,
      } });
      const moveX = gsap.quickTo(pose, "tiltX", { duration: .8, ease: "power3.out", onUpdate: draw });
      const moveY = gsap.quickTo(pose, "tiltY", { duration: .8, ease: "power3.out", onUpdate: draw });
      const sync = () => {
        const stopped = pausedRef.current || !visible || document.hidden || contextLost;
        intro.paused(stopped);
        ambient.paused(stopped);
        if (stopped) {
          scroll.scrollTrigger?.disable(false); scroll.pause(); moveX.tween.pause(); moveY.tween.pause();
        } else scroll.scrollTrigger?.enable(false, false);
      };
      motionControl.current = sync;
      const pointer = (event: PointerEvent) => {
        if (pausedRef.current || event.pointerType !== "mouse") return;
        const bounds = container.getBoundingClientRect();
        moveX(((event.clientY - bounds.top) / bounds.height - .5) * .12);
        moveY(((event.clientX - bounds.left) / bounds.width - .5) * .18);
      };
      const leave = () => { if (!pausedRef.current) { moveX(0); moveY(0); } };
      container.addEventListener("pointermove", pointer);
      container.addEventListener("pointerleave", leave);
      document.addEventListener("visibilitychange", sync);
      const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? false; sync();
        if (visible) draw();
      });
      observer?.observe(container);
      sync();
      return () => {
        motionControl.current = null;
        observer?.disconnect();
        document.removeEventListener("visibilitychange", sync);
        container.removeEventListener("pointermove", pointer);
        container.removeEventListener("pointerleave", leave);
        intro.kill(); ambient.kill(); scroll.scrollTrigger?.kill(); scroll.kill(); moveX.tween.kill(); moveY.tween.kill();
        pose.reveal = 1; pose.scroll = 0; pose.tiltX = 0; pose.tiltY = 0; pose.float = 0; pose.sweep = 0; draw();
      };
    });

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      motionControl.current?.(pausedRef.current);
      setWebglSupported(false);
    };
    const handleContextRestored = () => {
      // Render-target contents are lost with the context; rebuild reflections on the same renderer.
      environmentTarget.dispose();
      try { environmentTarget = createEnvironment(); scene.environment = environmentTarget.texture; }
      catch { setWebglSupported(false); return; }
      contextLost = false;
      setWebglSupported(true);
      handleResize();
      motionControl.current?.(pausedRef.current);
    };

    renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

    return () => {
      media.revert();
      motionControl.current = null;
      resizeObserver.disconnect();

      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);

      [
        plate1Geom,
        chamferGeom,
        plate2Geom,
        plate3Geom,
        spineGeom,
        seamGeom,
        pinGeom,
        lowerBasaltGeom,
        inscriptionGeometry,
      ].forEach((g) => g.dispose());
      [
        aluminumMaterial,
        chamferMaterial,
        graphiteMaterial,
        vermilionMaterial,
        basaltMaterial,
        edgeMaterial,
        inscriptionMaterial,
      ].forEach((m) => m.dispose());
      renderer.dispose();
      environmentTarget.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onLoaded]);

  useEffect(() => {
    const cleanup = initScene();
    return () => {
      cleanup?.();
    };
  }, [initScene]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none ${className}`}
      aria-hidden="true"
    >{!webglSupported && <span className="landing-sculpture-placeholder">Agreement sculpture unavailable</span>}</div>
  );
}
