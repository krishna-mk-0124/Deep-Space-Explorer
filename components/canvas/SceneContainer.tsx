"use client";

import { useEffect, useRef } from "react";
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
  const duration = useRef(2);

  useEffect(() => {
    if (selectedObject) {
      const dist = getDistanceLy(selectedObject.encyclopedia.classificationData);
      // Base duration 1.5s (local), up to 5.5s for billions of lightyears
      duration.current = 1.5 + Math.min(Math.log10(dist + 1) * 0.4, 4);
      
      time.current = 0;
      isAnimating.current = true;
      
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

      // Phase 1: Earth Horizon Lookup (0% to 15% of animation)
      // Gives the feel of standing on a planet looking up before takeoff
      if (progress < 0.15) {
        const p = progress / 0.15; 
        const ease = p * p * (3 - 2 * p); // smoothstep
        
        state.camera.position.lerpVectors(
          new THREE.Vector3(0, -30, 10), // Low angle, looking up
          new THREE.Vector3(0, 20, 500), // Shoot backward into space
          ease
        );
        state.camera.lookAt(0, 50 * ease, 0);
        
        // Stretch FOV to simulate warp speed light stretching
        (state.camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(55, 140, Math.pow(ease, 2));
        state.camera.updateProjectionMatrix();
      } 
      // Phase 2: FTL Warp Travel to Object (15% to 100%)
      else {
        const p = (progress - 0.15) / 0.85;
        // easeOutExpo for dramatic FTL deceleration at the destination
        const ease = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        
        state.camera.position.lerpVectors(
          new THREE.Vector3(0, 20, 500),
          new THREE.Vector3(0, 8, 20), // Target resting position
          ease
        );
        state.camera.lookAt(0, 0, 0);
        
        // Relax FOV back to normal
        (state.camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(140, 55, ease);
        state.camera.updateProjectionMatrix();
      }

      // Finish animation
      if (progress === 1) {
        isAnimating.current = false;
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
