"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

interface HeroCanvasProps {
  onLoaded?: () => void;
  className?: string;
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

export function HeroSculptureCanvas({ onLoaded, className = "" }: HeroCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isVisibleRef = useRef(true);
  const [webglSupported, setWebglSupported] = useState(true);

  // Mouse parallax state
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

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
    const height = container.clientHeight || 700;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera: Match DESIGN.md Section 5 (FOV 38, positioned at [0, 0.1, 5.0])
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 0.1, 5.0);

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
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Lighting Rig (Studio Softbox, Ground Fill, Razor-sharp Rim Glint)
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

    // 5. Materials (DESIGN.md Section 4 PBR Table)
    const aluminumMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#EAE7E2"),
      metalness: 0.94,
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
      emissiveIntensity: 0.32,
    });

    const basaltMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#121212"),
      metalness: 0.04,
      roughness: 0.90,
      flatShading: true,
    });

    // 6. Root Sculpture Assembly
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    // 7. Geological Basalt Rock Formations (Grounding ridge & overhang)
    const lowerBasaltGeom = createCraggyBasaltGeometry(1.6, 1.1, 0.42, 101);
    const lowerBasalt = new THREE.Mesh(lowerBasaltGeom, basaltMaterial);
    lowerBasalt.position.set(0.95, -1.55, -0.2);
    lowerBasalt.rotation.set(0.2, 0.8, -0.15);
    lowerBasalt.scale.set(1.4, 0.9, 1.2);
    scene.add(lowerBasalt);

    const upperBasaltGeom = createCraggyBasaltGeometry(1.2, 0.9, 0.38, 202);
    const upperBasalt = new THREE.Mesh(upperBasaltGeom, basaltMaterial);
    upperBasalt.position.set(2.4, 1.8, -0.6);
    upperBasalt.rotation.set(-0.3, -0.6, 0.4);
    upperBasalt.scale.set(1.1, 1.2, 0.9);
    scene.add(upperBasalt);

    // Soft contact shadow plane
    const shadowGeom = new THREE.PlaneGeometry(2.4, 3.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#000000"),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadowGeom, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2.3;
    shadowPlane.position.set(0.7, -1.05, -0.1);
    scene.add(shadowPlane);

    // 8. Machined Agreement Artifact (3 Precision Aluminum Plates + Spine + Seam)
    const plateWidth = 2.1;
    const plateHeight = 3.0;
    const plateDepth = 0.045;

    const plateGroup = new THREE.Group();
    heroGroup.add(plateGroup);

    // Plate 1: Top Mandate Plate
    const plate1Geom = new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth);
    const plate1 = new THREE.Mesh(plate1Geom, aluminumMaterial);
    plate1.position.set(0, 0, 0.07);
    plateGroup.add(plate1);

    // Shiny chrome chamfer border
    const chamferGeom = new THREE.BoxGeometry(plateWidth + 0.015, plateHeight + 0.015, 0.008);
    const chamferEdge = new THREE.Mesh(chamferGeom, chamferMaterial);
    chamferEdge.position.set(0, 0, 0.095);
    plateGroup.add(chamferEdge);

    // Plate 2: Middle Negotiation Plate
    const plate2Geom = new THREE.BoxGeometry(plateWidth * 0.98, plateHeight * 0.98, plateDepth);
    const plate2 = new THREE.Mesh(plate2Geom, aluminumMaterial);
    plate2.position.set(0.04, -0.02, 0.0);
    plateGroup.add(plate2);

    // Plate 3: Base Plate
    const plate3Geom = new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth);
    const plate3 = new THREE.Mesh(plate3Geom, aluminumMaterial);
    plate3.position.set(-0.02, -0.04, -0.07);
    plateGroup.add(plate3);

    // Structural axial graphite spine
    const spineGeom = new THREE.CylinderGeometry(0.05, 0.05, plateHeight + 0.2, 16);
    const spine = new THREE.Mesh(spineGeom, graphiteMaterial);
    spine.position.set(-plateWidth / 2 - 0.03, 0, 0);
    plateGroup.add(spine);

    // Precision vermilion alignment seam
    const seamGeom = new THREE.BoxGeometry(0.025, plateHeight * 0.85, 0.01);
    const seam = new THREE.Mesh(seamGeom, vermilionMaterial);
    seam.position.set(-plateWidth / 2 + 0.12, 0, 0.098);
    plateGroup.add(seam);

    // 4 Precision dowel pins
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

    // 9. Initial Pose & Staging
    heroGroup.position.set(0.85, 0.05, 0.1);
    heroGroup.rotation.set(
      THREE.MathUtils.degToRad(-18),
      THREE.MathUtils.degToRad(34),
      THREE.MathUtils.degToRad(-12)
    );

    // 10. Pointer Parallax Handler (Subtle, limited to +/- 1.5 deg)
    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      mouseRef.current.targetX = THREE.MathUtils.clamp(nx, -1, 1);
      mouseRef.current.targetY = THREE.MathUtils.clamp(ny, -1, 1);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // 11. Intersection Observer for Offscreen Rendering Pause
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisibleRef.current = entry.isIntersecting;
        });
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    // 12. Animation Loop (Smooth gentle breathing oscillation)
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (!isVisibleRef.current) return;

      const elapsed = clock.getElapsedTime();

      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      const baseRotX = THREE.MathUtils.degToRad(-18);
      const baseRotY = THREE.MathUtils.degToRad(34);
      const baseRotZ = THREE.MathUtils.degToRad(-12);

      const breathFloatY = Math.sin(elapsed * 0.75) * 0.025;
      const breathFloatR = Math.cos(elapsed * 0.55) * 0.01;

      heroGroup.position.y = 0.05 + breathFloatY;
      heroGroup.rotation.x = baseRotX + mouseRef.current.y * 0.025 + breathFloatR;
      heroGroup.rotation.y = baseRotY + mouseRef.current.x * 0.03;
      heroGroup.rotation.z = baseRotZ;

      rimLight.position.x = 2.5 + Math.sin(elapsed * 0.45) * 0.5;

      renderer.render(scene, camera);
    };

    animate();
    onLoaded?.();

    // 13. Responsive Resize Handler
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
        camera.position.z = 5.3;
        heroGroup.position.x = 0.35;
        lowerBasalt.position.x = 0.45;
        upperBasalt.visible = true;
      } else {
        camera.position.z = 5.0;
        heroGroup.position.x = 0.85;
        lowerBasalt.position.x = 0.95;
        upperBasalt.visible = true;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize, { passive: true });
    handleResize();

    // Context loss handling
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    const handleContextRestored = () => {
      initScene();
    };

    renderer.domElement.addEventListener("webglcontextlost", handleContextLost, false);
    renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
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
        shadowGeom,
      ].forEach((g) => g.dispose());
      [
        aluminumMaterial,
        chamferMaterial,
        graphiteMaterial,
        vermilionMaterial,
        basaltMaterial,
        shadowMat,
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
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[380px] lg:min-h-[640px] select-none pointer-events-auto ${className}`}
      aria-hidden="true"
    />
  );
}
