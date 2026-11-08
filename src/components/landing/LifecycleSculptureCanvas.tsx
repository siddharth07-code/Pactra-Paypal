"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

interface LifecycleSculptureProps {
  progress: number; // 0.0 to 1.0 continuous normalized scroll progress
  activeStage?: number; // 0 = Sourcing, 1 = Negotiate, 2 = Audit, 3 = Settlement
  className?: string;
  onLoaded?: () => void;
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

export function LifecycleSculptureCanvas({
  progress,
  className = "",
  onLoaded,
}: LifecycleSculptureProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isVisibleRef = useRef(true);
  const [webglSupported, setWebglSupported] = useState(true);

  // References to 3D elements for dynamic scroll-scrubbed interpolation
  const sceneElementsRef = useRef<{
    plate1?: THREE.Mesh;
    plate2?: THREE.Mesh;
    plate3?: THREE.Mesh;
    chamferEdge?: THREE.Mesh;
    spine?: THREE.Mesh;
    seam?: THREE.Mesh;
    pins?: THREE.Mesh[];
    heroGroup?: THREE.Group;
    camera?: THREE.PerspectiveCamera;
    rimLight?: THREE.DirectionalLight;
    keyLight?: THREE.DirectionalLight;
    vermilionMaterial?: THREE.MeshStandardMaterial;
    pinMaterial?: THREE.MeshStandardMaterial;
  }>({});

  const progressRef = useRef(progress);
  progressRef.current = progress;

  const initScene = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check WebGL availability
    const canvasTest = document.createElement("canvas");
    const gl =
      canvasTest.getContext("webgl2") ||
      canvasTest.getContext("webgl") ||
      canvasTest.getContext("experimental-webgl");
    if (!gl) {
      setWebglSupported(false);
      onLoaded?.();
      return;
    }

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0.2, 0.1, 5.0);
    sceneElementsRef.current.camera = camera;

    // 3. Renderer with powerPreference: "high-performance" & capped DPR
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffbf5, 2.6);
    keyLight.position.set(-3.2, 4.5, 3.8);
    scene.add(keyLight);
    sceneElementsRef.current.keyLight = keyLight;

    const fillLight = new THREE.DirectionalLight(0xe0e4ec, 0.7);
    fillLight.position.set(4.0, -1.8, 2.2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 3.4);
    rimLight.position.set(2.5, 3.8, -3.5);
    scene.add(rimLight);
    sceneElementsRef.current.rimLight = rimLight;

    // 5. Materials
    const aluminumMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#EAE7E2"),
      metalness: 0.95,
      roughness: 0.22,
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
      emissiveIntensity: 0.25,
    });
    sceneElementsRef.current.vermilionMaterial = vermilionMaterial;

    const pinMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ECEFF1"),
      metalness: 0.98,
      roughness: 0.08,
      emissive: new THREE.Color("#C43A1D"),
      emissiveIntensity: 0.0,
    });
    sceneElementsRef.current.pinMaterial = pinMaterial;

    const basaltMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0F0F0F"),
      metalness: 0.04,
      roughness: 0.92,
      flatShading: true,
    });

    // 6. Basalt Grounding
    const lowerBasaltGeom = createCraggyBasaltGeometry(1.6, 1.1, 0.42, 101);
    const lowerBasalt = new THREE.Mesh(lowerBasaltGeom, basaltMaterial);
    lowerBasalt.position.set(0.65, -1.6, -0.2);
    lowerBasalt.rotation.set(0.2, 0.8, -0.15);
    lowerBasalt.scale.set(1.4, 0.9, 1.2);
    scene.add(lowerBasalt);

    const upperBasaltGeom = createCraggyBasaltGeometry(1.2, 0.9, 0.38, 202);
    const upperBasalt = new THREE.Mesh(upperBasaltGeom, basaltMaterial);
    upperBasalt.position.set(2.4, 1.9, -0.7);
    upperBasalt.rotation.set(-0.3, -0.6, 0.4);
    upperBasalt.scale.set(1.0, 1.1, 0.9);
    scene.add(upperBasalt);

    // 7. Sculpture Hierarchy
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);
    sceneElementsRef.current.heroGroup = heroGroup;

    const plateWidth = 2.1;
    const plateHeight = 3.0;
    const plateDepth = 0.045;

    const plateGroup = new THREE.Group();
    heroGroup.add(plateGroup);

    // Plate 1: Mandate Plate
    const plate1Geom = new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth);
    const plate1 = new THREE.Mesh(plate1Geom, aluminumMaterial);
    plate1.position.set(0, 0, 0.28);
    plateGroup.add(plate1);
    sceneElementsRef.current.plate1 = plate1;

    // Beveled Chamfer
    const chamferGeom = new THREE.BoxGeometry(plateWidth + 0.015, plateHeight + 0.015, 0.008);
    const chamferEdge = new THREE.Mesh(chamferGeom, chamferMaterial);
    chamferEdge.position.set(0, 0, 0.305);
    plateGroup.add(chamferEdge);
    sceneElementsRef.current.chamferEdge = chamferEdge;

    // Plate 2: Middle Negotiation Plate
    const plate2Geom = new THREE.BoxGeometry(plateWidth * 0.98, plateHeight * 0.98, plateDepth);
    const plate2 = new THREE.Mesh(plate2Geom, aluminumMaterial);
    plate2.position.set(-0.18, 0, 0.0);
    plateGroup.add(plate2);
    sceneElementsRef.current.plate2 = plate2;

    // Plate 3: Base Plate
    const plate3Geom = new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth);
    const plate3 = new THREE.Mesh(plate3Geom, aluminumMaterial);
    plate3.position.set(0, 0, -0.28);
    plateGroup.add(plate3);
    sceneElementsRef.current.plate3 = plate3;

    // Structural axial graphite spine
    const spineGeom = new THREE.CylinderGeometry(0.05, 0.05, plateHeight + 0.2, 16);
    const spine = new THREE.Mesh(spineGeom, graphiteMaterial);
    spine.position.set(-plateWidth / 2 - 0.03, 0, 0);
    plateGroup.add(spine);
    sceneElementsRef.current.spine = spine;

    // Precision vermilion alignment seam
    const seamGeom = new THREE.BoxGeometry(0.025, plateHeight * 0.85, 0.01);
    const seam = new THREE.Mesh(seamGeom, vermilionMaterial);
    seam.position.set(-plateWidth / 2 + 0.12, 0, 0.098);
    plateGroup.add(seam);
    sceneElementsRef.current.seam = seam;

    // 4 Titanium Dowel Pins
    const pinGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.26, 16);
    const pinPositions = [
      [-plateWidth / 2 + 0.25, plateHeight / 2 - 0.35],
      [plateWidth / 2 - 0.25, plateHeight / 2 - 0.35],
      [-plateWidth / 2 + 0.25, -plateHeight / 2 + 0.35],
      [plateWidth / 2 - 0.25, -plateHeight / 2 + 0.35],
    ];

    const pins: THREE.Mesh[] = [];
    pinPositions.forEach(([px, py]) => {
      const pin = new THREE.Mesh(pinGeom, pinMaterial);
      pin.rotation.x = Math.PI / 2;
      pin.position.set(px, py, 0.2);
      plateGroup.add(pin);
      pins.push(pin);
    });
    sceneElementsRef.current.pins = pins;

    // 8. Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisibleRef.current = entry.isIntersecting;
        });
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    // 9. Dynamic Animation & Scrub Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (!isVisibleRef.current) return;

      const p = THREE.MathUtils.clamp(progressRef.current, 0, 1);
      const elapsed = clock.getElapsedTime();

      // Mechanical transformation math across the 4 stages:
      // Sourcing (0.0): Separated plates, spine exposed, 3/4 perspective
      // Negotiation (0.33): Plates aligning, seam visible, rotating to reveal connection
      // Audit (0.66): Pins lock down, macro perspective, restrained seam
      // Settlement (1.0): Unified monolithic structure, flush alignment, hero angle

      // 1. Plate Z separation (fanned out -> flush)
      const p1z = THREE.MathUtils.lerp(0.28, 0.045, p);
      const p3z = THREE.MathUtils.lerp(-0.28, -0.045, p);
      if (plate1) plate1.position.z = p1z;
      if (chamferEdge) chamferEdge.position.z = p1z + 0.025;
      if (plate3) plate3.position.z = p3z;

      // 2. Plate 2 horizontal sliding (revealing/locking spine)
      const p2x = THREE.MathUtils.lerp(-0.18, 0.0, p);
      if (plate2) plate2.position.x = p2x;

      // 3. Plate rotation fan (Sourcing -> aligned)
      const fanAngle = THREE.MathUtils.lerp(0.14, 0.0, p);
      if (plate1) plate1.rotation.y = fanAngle;
      if (chamferEdge) chamferEdge.rotation.y = fanAngle;
      if (plate3) plate3.rotation.y = -fanAngle;

      // 4. Evidence Pins extension & inspection emphasis
      // Pins extend out during sourcing/negotiation, snap inward during audit/settlement
      let pinZ = 0.22 * (1 - p);
      let pinEmissive = 0.0;
      if (p >= 0.5 && p < 0.8) {
        // Audit stage pin emphasis
        pinEmissive = (1 - Math.abs(p - 0.65) / 0.15) * 0.45;
        pinZ = 0.06 * (1 - (p - 0.5) / 0.3);
      } else if (p >= 0.8) {
        pinZ = 0.0;
        pinEmissive = 0.05;
      }
      pins.forEach((pin) => {
        pin.position.z = pinZ;
      });
      if (pinMaterial) {
        pinMaterial.emissiveIntensity = pinEmissive;
      }

      // 5. Vermilion Seam (Anodized optical alignment rail)
      if (vermilionMaterial) {
        // Seam grows gradually from subtle (0.2) to verified lock (0.45), never blinding neon
        const seamIntensity = THREE.MathUtils.lerp(0.2, 0.45, p);
        vermilionMaterial.emissiveIntensity = seamIntensity;
      }

      // 6. Camera & Stage Staging (Interpolated smoothly)
      // Subtle float breathing (0.015 rad max)
      const floatY = Math.sin(elapsed * 0.7) * 0.02;

      // Camera coordinates interpolation:
      // Sourcing (p=0.0): [0.35, 0.15, 5.2]
      // Negotiation (p=0.33): [0.15, 0.1, 4.8]
      // Audit (p=0.66): [-0.15, 0.05, 4.3] (macro inspection)
      // Settlement (p=1.0): [0.0, 0.1, 4.6] (hero lock)
      let camX = 0.2;
      let camY = 0.1;
      let camZ = 5.0;
      let rotX = THREE.MathUtils.degToRad(-16);
      let rotY = THREE.MathUtils.degToRad(32);
      const rotZ = THREE.MathUtils.degToRad(-10);

      if (p < 0.33) {
        const t = p / 0.33;
        camX = THREE.MathUtils.lerp(0.35, 0.15, t);
        camY = THREE.MathUtils.lerp(0.15, 0.1, t);
        camZ = THREE.MathUtils.lerp(5.2, 4.8, t);
        rotX = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(-14), THREE.MathUtils.degToRad(-12), t);
        rotY = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(36), THREE.MathUtils.degToRad(26), t);
      } else if (p < 0.66) {
        const t = (p - 0.33) / 0.33;
        camX = THREE.MathUtils.lerp(0.15, -0.15, t);
        camY = THREE.MathUtils.lerp(0.1, 0.05, t);
        camZ = THREE.MathUtils.lerp(4.8, 4.3, t);
        rotX = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(-12), THREE.MathUtils.degToRad(-6), t);
        rotY = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(26), THREE.MathUtils.degToRad(48), t);
      } else {
        const t = (p - 0.66) / 0.34;
        camX = THREE.MathUtils.lerp(-0.15, 0.0, t);
        camY = THREE.MathUtils.lerp(0.05, 0.1, t);
        camZ = THREE.MathUtils.lerp(4.3, 4.6, t);
        rotX = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(-6), THREE.MathUtils.degToRad(-18), t);
        rotY = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(48), THREE.MathUtils.degToRad(34), t);
      }

      camera.position.set(camX, camY + floatY, camZ);
      heroGroup.rotation.set(rotX, rotY, rotZ);

      // Studio rim light movement
      rimLight.position.x = 2.5 + Math.sin(elapsed * 0.4) * 0.4;

      renderer.render(scene, camera);
    };

    animate();
    onLoaded?.();

    // 10. Resize handler
    const handleResize = () => {
      if (!container || !renderer) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (newWidth === 0 || newHeight === 0) return;

      camera.aspect = newWidth / newHeight;
      if (newWidth < 640) {
        camera.position.z = 5.8;
        heroGroup.position.x = 0.0;
        lowerBasalt.position.x = 0.0;
        upperBasalt.visible = false;
      } else if (newWidth < 1024) {
        camera.position.z = 5.2;
        heroGroup.position.x = 0.2;
        lowerBasalt.position.x = 0.3;
        upperBasalt.visible = true;
      } else {
        camera.position.z = 4.6;
        heroGroup.position.x = 0.4;
        lowerBasalt.position.x = 0.65;
        upperBasalt.visible = true;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize, { passive: true });
    handleResize();

    // Context loss handling
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    const handleContextRestored = () => {
      initScene();
    };

    renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

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
        upperBasaltGeom,
      ].forEach((g) => g.dispose());
      [
        aluminumMaterial,
        chamferMaterial,
        graphiteMaterial,
        vermilionMaterial,
        pinMaterial,
        basaltMaterial,
      ].forEach((m) => m.dispose());
      renderer.dispose();
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

  if (!webglSupported) {
    return (
      <div
        className={`flex items-center justify-center p-8 bg-[#141414] border border-white/10 rounded-[14px] text-center ${className}`}
      >
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-wider text-[#7A7670]">
            Lifecycle Stage Visualization Fallback
          </p>
          <div className="w-52 h-72 mx-auto rounded-[8px] border border-white/20 bg-gradient-to-br from-[#242424] to-[#121212] flex flex-col justify-between p-4 text-left">
            <span className="text-[11px] font-mono text-[#C43A1D]">
              STAGE {Math.min(4, Math.floor(progress * 4) + 1).toString().padStart(2, "0")}
            </span>
            <div className="text-xs font-mono text-[#F5F3EF]">
              {progress < 0.25
                ? "SOURCING ARTIFACT"
                : progress < 0.5
                ? "NEGOTIATION ARTIFACT"
                : progress < 0.75
                ? "AUDIT ARTIFACT"
                : "SETTLEMENT ARTIFACT"}
            </div>
            <span className="text-[10px] font-mono text-[#7A7670]">
              SHA-256 DETERMINISTIC VERIFICATION
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[460px] lg:min-h-[580px] select-none ${className}`}
      aria-label="Interactive 3D lifecycle agreement sculpture undergoing scroll-scrubbed mechanical verification"
      role="img"
    />
  );
}
