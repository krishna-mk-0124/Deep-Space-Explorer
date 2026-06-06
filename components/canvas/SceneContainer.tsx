"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls, Stars } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { useExplorer } from "@/store/explorerStore";
import OrbitalSystem from "./simulations/OrbitalSystem";
import BinarySystem from "./simulations/BinarySystem";
import BlackHole from "./simulations/BlackHole";
import Pulsar from "./simulations/Pulsar";
import NBodyCluster from "./simulations/NBodyCluster";
import GalaxyCollision from "./simulations/GalaxyCollision";
import Supernova from "./simulations/Supernova";

function SimulationSwitch() {
  const { selectedObject, sliderValues } = useExplorer();
  if (!selectedObject) return null;

  const params = { ...selectedObject.simulationParams, ...sliderValues } as Record<string, number | string>;

  switch (selectedObject.type) {
    case "Orbital":
      return <OrbitalSystem params={params} object={selectedObject} />;
    case "Binary":
      return <BinarySystem params={params} object={selectedObject} />;
    case "BlackHole":
      return <BlackHole params={params} object={selectedObject} />;
    case "Pulsar":
      return <Pulsar params={params} object={selectedObject} />;
    case "Cluster":
      return <NBodyCluster params={params} object={selectedObject} />;
    case "GalaxyCollision":
      return <GalaxyCollision params={params} object={selectedObject} />;
    case "Supernova":
      return <Supernova params={params} object={selectedObject} />;
    default:
      return null;
  }
}

function getDistanceLy(data: Record<string, string>): number {
  for (const [key, val] of Object.entries(data)) {
    if (key.toLowerCase().includes("distance")) {
      const v = val.toLowerCase().replace(/,/g, "");
      if (v.includes("billion light-years")) return parseFloat(v) * 1e9;
      if (v.includes("million light-years")) return parseFloat(v) * 1e6;
      if (v.includes("light-years") || v.includes("ly")) return parseFloat(v);
    }
  }
  return 0;
}

function CameraRig() {
  const { selectedObject } = useExplorer();
  const { camera, controls } = useThree();
  const isAnimating = useRef(false);
  const time = useRef(0);
  const duration = useRef(2.5);

  const startPos = useRef(new THREE.Vector3());
  const panStartTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    if (selectedObject) {
      const dist = getDistanceLy(selectedObject.encyclopedia.classificationData);
      // Duration scales based on distance to Earth (between 2.5s and 6.5s)
      duration.current = 2.5 + Math.min(Math.log10(dist + 1) * 0.6, 4);
      
      time.current = 0;
      isAnimating.current = true;
      
      // Place the camera very far away to simulate looking at the night sky
      // We use a pseudo-random angle based on the object ID so the starfield shifts,
      // simulating looking at a different patch of the sky and masking any 'teleport' feel.
      const charCode = selectedObject.id.charCodeAt(0) || 0;
      const angle = (charCode / 26) * Math.PI * 2;
      
      startPos.current.set(
        Math.cos(angle) * 2000,
        Math.sin(angle) * 1000,
        2000
      );

      // Start by looking slightly off-center to simulate "locating" the object in the sky
      panStartTarget.current.set(
        (Math.random() - 0.5) * 500,
        (Math.random() - 0.5) * 500,
        0
      );

      // Instantly jump to the deep space wide-shot
      camera.position.copy(startPos.current);
      camera.lookAt(panStartTarget.current);
      
      if (controls) {
        (controls as any).target.set(0, 0, 0);
        (controls as any).enabled = false;
      }
    }
  }, [selectedObject?.id, camera, controls]);

  useFrame((state, delta) => {
    if (isAnimating.current) {
      time.current += delta;
      let progress = time.current / duration.current;
      if (progress > 1) progress = 1;

      // Phase 1: Stellarium Pan (0 to 0.4)
      // The camera swings to center the tiny dot of the object
      const panProgress = Math.min(progress / 0.4, 1.0);
      const panEase = 1 - Math.pow(1 - panProgress, 4); // easeOutQuart

      const currentLookAt = new THREE.Vector3().lerpVectors(panStartTarget.current, new THREE.Vector3(0, 0, 0), panEase);
      state.camera.lookAt(currentLookAt);

      // Phase 2: Stellarium Telescope Zoom (0 to 1.0)
      // Uses easeInOutExpo: starts slow, accelerates massively, and decelerates smoothly at the end
      const zoomEase = progress === 0 
        ? 0 
        : progress === 1 
          ? 1 
          : progress < 0.5 ? Math.pow(2, 20 * progress - 10) / 2
          : (2 - Math.pow(2, -20 * progress + 10)) / 2;

      const endPos = new THREE.Vector3(0, 8, 20);
      state.camera.position.lerpVectors(startPos.current, endPos, zoomEase);
      
      // Calculate speed and remaining distance
      const distLy = getDistanceLy(selectedObject.encyclopedia.classificationData);
      const remainingDistance = distLy * (1 - zoomEase);
      
      let derivative = 0;
      if (progress > 0 && progress < 1) {
        if (progress < 0.5) {
          derivative = 20 * Math.LN2 * Math.pow(2, 20 * progress - 11);
        } else {
          derivative = 20 * Math.LN2 * Math.pow(2, -20 * progress + 9);
        }
      }
      // Speed in light-years per second of real time
      const speedLyPerSec = (derivative / duration.current) * distLy;
      // Convert to multiples of c (1 c = 1 ly / year, 1 year = 31557600 seconds)
      // So 1 ly/s is 31,557,600 c
      const speedC = speedLyPerSec * 31557600;

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("zoomUpdate", {
          detail: {
            isZooming: true,
            remainingDistance,
            speedC,
            progress
          }
        }));
      }

      // Ensure FOV remains natural to mimic a standard telescope/view
      (state.camera as THREE.PerspectiveCamera).fov = 55;
      state.camera.updateProjectionMatrix();

      if (progress === 1) {
        isAnimating.current = false;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zoomUpdate", {
            detail: { isZooming: false, remainingDistance: 0, speedC: 0, progress: 1 }
          }));
        }
        if (controls) {
          (controls as any).enabled = true;
        }
      }
    }
  });

  return null;
}

export default function SceneContainer() {
  return (
    <Canvas
      camera={{ position: [0, 8, 20], fov: 55 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false }}
    >
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 20, 0]} intensity={1.5} color="#ffffff" />
      <pointLight position={[-20, -10, -10]} intensity={0.5} color="#4466ff" />

      <Stars radius={200} depth={80} count={6000} factor={4} saturation={0.3} fade speed={0.3} />

      <Physics gravity={[0, 0, 0]} timeStep="vary">
        <SimulationSwitch />
      </Physics>

      <CameraRig />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={80}
        zoomSpeed={0.8}
        rotateSpeed={0.5}
        makeDefault
      />
    </Canvas>
  );
}
