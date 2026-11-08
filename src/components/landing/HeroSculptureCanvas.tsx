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

  // Pseudo-random deterministic noise
  const pseudoNoise = (x: number, y: number, z: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  };

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Non-uniform geological deformation
    const n = pseudoNoise(v.x, v.y, v.z);
    const facetNoise = Math.sign(n) * Math.pow(Math.abs(n), 1.4);
    v.multiplyScalar(1 + facetNoise * roughness);
    // Flatten bottom slightly for grounding
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

    // 2. Camera: Match DESIGN.md Section 5 (FOV 38-40, positioned at [0, 0, 5.2])
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 0.1, 5.2);

    // 3. Renderer with powerPreference: "high-performance" & capped DPR
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false; // contact shadow plane used instead
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Lighting Rig (DESIGN.md Section 4: Studio Softbox, Ground Fill, Rim Highlight)
    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0xf5f3ef, 0.85);
    scene.add(ambientLight);

    // Key Light (Azimuth -42 deg, Elevation 55 deg)
    const keyLight = new THREE.DirectionalLight(0xfffbf5, 2.4);
    keyLight.position.set(-3.2, 4.5, 3.8);
    scene.add(keyLight);

    // Low-Right Fill
    const fillLight = new THREE.DirectionalLight(0xe0e4ec, 0.65);
    fillLight.position.set(4.0, -1.8, 2.2);
    scene.add(fillLight);

    // High-Rear Rim Glint for Chamfered Edges
    const rimLight = new THREE.DirectionalLight(0xffffff, 3.2);
    rimLight.position.set(2.5, 3.8, -3.5);
    scene.add(rimLight);

    // 5. Materials (DESIGN.md Section 4 PBR Table)
    // Brushed aerospace aluminum
    const aluminumMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#EAE7E2"),
      metalness: 0.94,
      roughness: 0.22,
    });

    // Mirror chrome for machined chamfer bevels
    const chamferMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#FFFFFF"),
      metalness: 1.0,
      roughness: 0.04,
    });

    // Axial structural graphite spine
    const graphiteMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1C1C1D"),
      metalness: 0.15,
      roughness: 0.68,
    });

    // Restrained laser-etched vermilion alignment seam
    const vermilionMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#C43A1D"),
      metalness: 0.4,
      roughness: 0.3,
      emissive: new THREE.Color("#C43A1D"),
      emissiveIntensity: 0.35,
    });

    // Craggy Basalt Rock
    const basaltMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#121212"),
      metalness: 0.04,
      roughness: 0.88,
      flatShading: true,
    });

    // 6. Root Sculpture Assembly
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    // 7. Geological Basalt Rock Formations (DESIGN.md Section 4.4)
    // Lower grounding ridge
    const lowerBasaltGeom = createCraggyBasaltGeometry(1.6, 1.1, 0.42, 101);
    const lowerBasalt = new THREE.Mesh(lowerBasaltGeom, basaltMaterial);
    lowerBasalt.position.set(0.95, -1.55, -0.2);
    lowerBasalt.rotation.set(0.2, 0.8, -0.15);
    lowerBasalt.scale.set(1.4, 0.9, 1.2);
    scene.add(lowerBasalt);

    // Upper right overhang rock (craggy silhouette occluding rim light)
    const upperBasaltGeom = createCraggyBasaltGeometry(1.2, 0.9, 0.38, 202);
    const upperBasalt = new THREE.Mesh(upperBasaltGeom, basaltMaterial);
    upperBasalt.position.set(2.4, 1.8, -0.6);
    upperBasalt.rotation.set(-0.3, -0.6, 0.4);
    upperBasalt.scale.set(1.1, 1.2, 0.9);
    scene.add(upperBasalt);

    // Soft contact shadow plane beneath the artifact onto the lower rock
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
    // Plate dimensions (ISO A-proportions: 2.1 x 3.0 x 0.04)
    const plateWidth = 2.1;
    const plateHeight = 3.0;
    const plateDepth = 0.045;

    const plateGroup = new THREE.Group();
    heroGroup.add(plateGroup);

    // Plate 1: Top Mandate Plate with beveled edges
    const plate1Geom = new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth);
    const plate1 = new THREE.Mesh(plate1Geom, aluminumMaterial);
    plate1.position.set(0, 0, 0.07);
    plateGroup.add(plate1);

    // Shiny chrome chamfer border on top plate
    const chamferGeom = new THREE.BoxGeometry(plateWidth + 0.015, plateHeight + 0.015, 0.008);
    const chamferEdge = new THREE.Mesh(chamferGeom, chamferMaterial);
    chamferEdge.position.set(0, 0, 0.095);
    plateGroup.add(chamferEdge);

    // Plate 2: Middle Negotiation Plate (subtly shifted to reveal spine)
    const plate2Geom = new THREE.BoxGeometry(plateWidth * 0.98, plateHeight * 0.98, plateDepth);
    const plate2 = new THREE.Mesh(plate2Geom, aluminumMaterial);
    plate2.position.set(0.04, -0.02, 0.0);
    plateGroup.add(plate2);

    // Plate 3: Base Cryptographic Foundation Plate
    const plate3Geom = new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth);
    const plate3 = new THREE.Mesh(plate3Geom, aluminumMaterial);
    plate3.position.set(-0.02, -0.04, -0.07);
    plateGroup.add(plate3);

    // Structural axial graphite spine along the left spine
    const spineGeom = new THREE.CylinderGeometry(0.05, 0.05, plateHeight + 0.2, 16);
    const spine = new THREE.Mesh(spineGeom, graphiteMaterial);
    spine.position.set(-plateWidth / 2 - 0.03, 0, 0);
    plateGroup.add(spine);

    // Precision vermilion alignment seam (anodized optical rail)
    const seamGeom = new THREE.BoxGeometry(0.025, plateHeight * 0.85, 0.01);
    const seam = new THREE.Mesh(seamGeom, vermilionMaterial);
    seam.position.set(-plateWidth / 2 + 0.12, 0, 0.098);
    plateGroup.add(seam);

    // 4 Precision dowel pins connecting the plates
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

    // 9. Initial Pose & Staging (DESIGN.md Section 3: Tilted pitch -18°, yaw 34°, roll -12°)
    heroGroup.position.set(0.85, 0.05, 0.1);
    heroGroup.rotation.set(
      THREE.MathUtils.degToRad(-18),
      THREE.MathUtils.degToRad(34),
      THREE.MathUtils.degToRad(-12)
    );

    // 10. Pointer Parallax Handler (Restrained to +/- 1.5 deg per DESIGN.md Section 5)
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

    // 12. Animation Loop (Smooth gentle floating breathing oscillation)
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (!isVisibleRef.current) return;

      const elapsed = clock.getElapsedTime();

      // Smooth interpolation for mouse parallax
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      const baseRotX = THREE.MathUtils.degToRad(-18);
      const baseRotY = THREE.MathUtils.degToRad(34);
      const baseRotZ = THREE.MathUtils.degToRad(-12);

      // Delicate mechanical breathing oscillation (0.015 rads max)
      const breathFloatY = Math.sin(elapsed * 0.8) * 0.035;
      const breathFloatR = Math.cos(elapsed * 0.6) * 0.015;

      heroGroup.position.y = 0.05 + breathFloatY;
      heroGroup.rotation.x = baseRotX + mouseRef.current.y * 0.025 + breathFloatR;
      heroGroup.rotation.y = baseRotY + mouseRef.current.x * 0.03;
      heroGroup.rotation.z = baseRotZ;

      // Subtle dynamic rim light flare movement
      rimLight.position.x = 2.5 + Math.sin(elapsed * 0.5) * 0.6;

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
      // Adjust camera distance on narrow viewports to preserve framing
      if (newWidth < 640) {
        camera.position.z = 6.2;
        heroGroup.position.x = 0.0;
        lowerBasalt.position.x = 0.0;
        upperBasalt.visible = false;
      } else if (newWidth < 1024) {
        camera.position.z = 5.6;
        heroGroup.position.x = 0.45;
        lowerBasalt.position.x = 0.55;
        upperBasalt.visible = true;
      } else {
        camera.position.z = 5.2;
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

      // Dispose geometries and materials
      [plate1Geom, chamferGeom, plate2Geom, plate3Geom, spineGeom, seamGeom, pinGeom, lowerBasaltGeom, upperBasaltGeom, shadowGeom].forEach(g => g.dispose());
      [aluminumMaterial, chamferMaterial, graphiteMaterial, vermilionMaterial, basaltMaterial, shadowMat].forEach(m => m.dispose());
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
      <div className={`flex items-center justify-center p-8 bg-[#ECE9E2] rounded-[14px] text-center ${className}`}>
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-wider text-[#5A5650]">
            Hardware Acceleration Fallback
          </p>
          <div className="w-48 h-64 mx-auto rounded-[6px] border border-[#111111]/20 bg-gradient-to-br from-[#EAE7E2] to-[#D5D2CC] shadow-md flex items-center justify-center">
            <span className="font-mono text-[11px] text-[#5A5650]">PACTUM ARTIFACT</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[480px] lg:min-h-[640px] select-none pointer-events-auto ${className}`}
      aria-label="3D metallic agreement sculpture resting on craggy basalt geological formation"
      role="img"
    />
  );
}
