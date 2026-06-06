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

function CameraRig() {
  const { selectedObject } = useExplorer();
  const { camera, controls } = useThree();
  const isAnimating = useRef(false);

  useEffect(() => {
    if (selectedObject) {
      // Start zoomed way out for cinematic "zoom in" effect
      camera.position.set(0, 80, 250);
      isAnimating.current = true;
      if (controls) {
        (controls as any).target.set(0, 0, 0);
        (controls as any).enabled = false;
      }
    }
  }, [selectedObject?.id, camera, controls]);

  useFrame((state, delta) => {
    if (isAnimating.current) {
      const target = new THREE.Vector3(0, 8, 20);
      // Smoothly interpolate towards the target resting position
      state.camera.position.lerp(target, 2.5 * delta);
      
      // Once close enough, restore OrbitControls and stop animating
      if (state.camera.position.distanceTo(target) < 0.5) {
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
