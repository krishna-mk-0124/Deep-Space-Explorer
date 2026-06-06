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
  const [transitionProgress, setTransitionProgress] = useState(1);

  const startPos = useRef(new THREE.Vector3());
  const startTarget = useRef(new THREE.Vector3());

  const isEarth = selectedObject?.id === "earth";

  useEffect(() => {
    if (selectedObject) {
      const dist = getDistanceLy(selectedObject.encyclopedia.classificationData);
      duration.current = 2.0 + Math.min(Math.log10(dist + 1) * 0.5, 4);
      
      time.current = 0;
      isAnimating.current = true;
      setTransitionProgress(0);
      
      // Capture exact current camera state to prevent ANY teleporting/jumping
      startPos.current.copy(camera.position);
      if (controls) {
        startTarget.current.copy((controls as any).target);
        (controls as any).target.set(0, 0, 0);
        (controls as any).enabled = false;
      } else {
        startTarget.current.set(0, 0, 0);
      }
    }
  }, [selectedObject?.id, camera, controls]);

  useFrame((state, delta) => {
    if (isAnimating.current) {
      time.current += delta;
      let progress = time.current / duration.current;
      if (progress > 1) progress = 1;
      
      setTransitionProgress(progress);

      const pEarth = Math.min(progress / 0.15, 1.0); // 0 to 1 for Phase 1
      const pWarp = Math.max(0, (progress - 0.15) / 0.85); // 0 to 1 for Phase 2

      // Phase 1: Swoop down smoothly from CURRENT position to Earth Horizon
      if (progress < 0.15) {
        const ease = pEarth * pEarth * (3 - 2 * pEarth); // smoothstep
        const earthHorizon = new THREE.Vector3(0, -18, 50);
        
        state.camera.position.lerpVectors(startPos.current, earthHorizon, ease);
        
        // Smoothly tilt camera to look up at the sky
        const currentLookAt = new THREE.Vector3().lerpVectors(startTarget.current, new THREE.Vector3(0, 50, 0), ease);
        state.camera.lookAt(currentLookAt);
      } 
      // Phase 2: Blast off from Earth and FTL Warp to the target
      else {
        const ease = pWarp < 0.5 
          ? 4 * pWarp * pWarp * pWarp 
          : 1 - Math.pow(-2 * pWarp + 2, 3) / 2;
          
        const earthHorizon = new THREE.Vector3(0, -18, 50);
        const endPos = new THREE.Vector3(0, 8, 20);
        // Deep space midpoint for a parabolic flight path
        const midPos = new THREE.Vector3(0, 150, 600);
        
        // Quadratic bezier curve from Earth -> Deep Space -> Target
        const q0 = earthHorizon.clone().lerp(midPos, ease);
        const q1 = midPos.clone().lerp(endPos, ease);
        state.camera.position.copy(q0.lerp(q1, ease));
        
        state.camera.lookAt(0, 0, 0);
        
        // FOV warp streak effect
        const fovEase = Math.sin(pWarp * Math.PI); // 0 -> 1 -> 0
        (state.camera as THREE.PerspectiveCamera).fov = 55 + (85 * fovEase);
        state.camera.updateProjectionMatrix();
      }

      if (progress === 1) {
        isAnimating.current = false;
        if (controls) {
          (controls as any).enabled = true;
        }
      }
    }
  });

  if (isAnimating.current && transitionProgress < 1.0 && !isEarth) {
    const pWarp = Math.max(0, (transitionProgress - 0.15) / 0.85);
    const opacity = 1 - Math.pow(pWarp, 2); // Fade out as we warp away
    return (
      <group>
        <ambientLight intensity={1} />
        {/* Fake Earth Horizon centered exactly under the swoop destination */}
        <mesh position={[0, -118, 50]}>
          <sphereGeometry args={[100, 64, 64]} />
          <meshStandardMaterial color="#0033aa" transparent opacity={opacity} roughness={0.8} />
          <mesh scale={[1.015, 1.015, 1.015]}>
             <sphereGeometry args={[100, 32, 32]} />
             <meshBasicMaterial color="#5599ff" transparent opacity={opacity * 0.3} blending={THREE.AdditiveBlending} />
          </mesh>
        </mesh>
      </group>
    );
  }

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
