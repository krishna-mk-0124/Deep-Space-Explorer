"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

const vertexShader = `
  uniform float uTime;
  uniform float uEventProgress;
  
  attribute vec3 targetPosition;
  attribute float size;
  attribute vec3 color;
  
  varying vec3 vColor;
  
  void main() {
    vColor = color;
    
    // Mix between initial position and target collided position based on event progress
    vec3 mixedPos = mix(position, targetPosition, smoothstep(0.0, 1.0, uEventProgress));
    
    // Add some turbulence based on time and progress
    float turbulence = sin(uTime * 2.0 + position.x * 0.5) * 0.2 * uEventProgress;
    mixedPos.y += turbulence;
    
    // Rotate the entire system
    float angle = uTime * 0.1;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    mixedPos.xz = rot * mixedPos.xz;

    vec4 mvPosition = modelViewMatrix * vec4(mixedPos, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, dist);
    // Very faint particles for blending
    gl_FragColor = vec4(vColor, alpha * 0.15);
  }
`;

export default function GalaxyCollision({ params, object }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  
  const { timeScale, isPlaying } = useExplorer();
  const eventProgress = Number(params.eventProgress) || 0.0;
  
  // R3F useFrame closure fix
  const progressRef = useRef(eventProgress);
  progressRef.current = eventProgress;

  const isCentaurusA = object.id === "c-77" || object.name.includes("Centaurus");

  const { positions, targetPositions, sizes, colors } = useMemo(() => {
    const particleCount = isCentaurusA ? 100000 : 40000;
    
    const pos = new Float32Array(particleCount * 3);
    const targetPos = new Float32Array(particleCount * 3);
    const sizeArr = new Float32Array(particleCount);
    const colArr = new Float32Array(particleCount * 3);

    const galaxy1Center = new THREE.Vector3(-6, 0, -3);
    const galaxy2Center = new THREE.Vector3(6, 0, 3);
    
    const color1 = new THREE.Color("#4fc3f7"); 
    const color2 = new THREE.Color("#ffb74d"); 
    const coreColor = new THREE.Color("#ffffff");
    const dustColor = new THREE.Color("#0a0505"); // Very dark, opaque brown/black
    const jetColor = new THREE.Color("#aa55ff");

    if (isCentaurusA) {
      // Centaurus A: Lenticular Elliptical with a thick dust lane and relativistic jets
      for (let i = 0; i < particleCount; i++) {
        const typeRand = Math.random();
        let x, y, z;
        let c = new THREE.Color();
        let pSize = Math.random() * 0.4 + 0.1;

        if (typeRand < 0.6) {
          // 1. Massive Elliptical Starfield (60%)
          const u = Math.random();
          const v = Math.random();
          const theta = u * 2.0 * Math.PI;
          const phi = Math.acos(2.0 * v - 1.0);
          const r = Math.pow(Math.random(), 0.5) * 12; 
          
          x = r * Math.sin(phi) * Math.cos(theta);
          y = r * Math.sin(phi) * Math.sin(theta);
          z = r * Math.cos(phi);
          
          // Squash into a lenticular shape
          y *= 0.7;
          
          c.copy(coreColor).lerp(color2, r / 12);
          
        } else if (typeRand < 0.95) {
          // 2. Thick Equatorial Dust Lane (35%)
          // This obscures the center and runs along the equator
          const theta = Math.random() * Math.PI * 2;
          const r = Math.pow(Math.random(), 0.6) * 14; 
          
          // Thicker at the outer edges, highly chaotic
          const turbulence = Math.sin(theta * 5) * 1.5 + Math.cos(theta * 11) * 0.5;
          const yHeight = (Math.random() - 0.5) * 3.0 + turbulence;
          
          x = r * Math.cos(theta);
          y = yHeight * 0.4;
          z = r * Math.sin(theta);
          
          c.copy(dustColor);
          // Make dust particles larger to obscure the background stars
          pSize = Math.random() * 1.5 + 1.0;
          
        } else {
          // 3. Relativistic Jets (5%)
          // Shooting out from the poles (Y axis)
          const dir = Math.random() > 0.5 ? 1 : -1;
          const r = Math.pow(Math.random(), 2.0) * 1.5;
          const theta = Math.random() * Math.PI * 2;
          
          x = r * Math.cos(theta);
          z = r * Math.sin(theta);
          
          // Very long jets
          const height = Math.random() * 25 + 2;
          y = height * dir;
          
          c.copy(coreColor).lerp(jetColor, height / 27);
          pSize = Math.random() * 1.0 + 0.5;
        }

        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        
        // Centaurus A is a static simulation, no collision targets
        targetPos[i * 3] = x;
        targetPos[i * 3 + 1] = y;
        targetPos[i * 3 + 2] = z;

        sizeArr[i] = pSize;
        colArr[i * 3] = c.r;
        colArr[i * 3 + 1] = c.g;
        colArr[i * 3 + 2] = c.b;
      }
    } else {
      // Standard Generic Collision
      for (let i = 0; i < particleCount; i++) {
        const isG1 = i % 2 === 0;
        const center = isG1 ? galaxy1Center : galaxy2Center;
        const baseColor = isG1 ? color1 : color2;

        // Spiral galaxy generation (initial state)
        const r = Math.random() * 6 + 0.2;
        const theta = r * 1.5 + Math.random() * Math.PI * 2; 
        const y = (Math.random() - 0.5) * (1.5 / r); 
        
        const x = center.x + r * Math.cos(theta);
        const z = center.z + r * Math.sin(theta);
        
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;

        // Collided irregular state (target state)
        // Ensure a very distinct merged shape
        const mergedR = Math.random() * 10;
        const mergedTheta = Math.random() * Math.PI * 2;
        const isTidalTail = Math.random() > 0.7;
        
        let tx, ty, tz;
        if (isTidalTail) {
          const tailLen = 20;
          const tailDir = isG1 ? 1 : -1;
          tx = tailDir * (Math.random() * tailLen);
          ty = (Math.random() - 0.5) * 3;
          tz = tailDir * (Math.random() * tailLen * 0.8);
        } else {
          tx = mergedR * Math.cos(mergedTheta) * 0.6;
          ty = (Math.random() - 0.5) * (6 / (mergedR + 1));
          tz = mergedR * Math.sin(mergedTheta) * 0.6;
        }

        targetPos[i * 3] = tx;
        targetPos[i * 3 + 1] = ty;
        targetPos[i * 3 + 2] = tz;

        sizeArr[i] = Math.random() * 0.3 + 0.05;

        const coreFactor = 1.0 - Math.min(1.0, r / 3);
        const c = baseColor.clone().lerp(coreColor, coreFactor);
        
        colArr[i * 3] = c.r;
        colArr[i * 3 + 1] = c.g;
        colArr[i * 3 + 2] = c.b;
      }
    }

    return {
      positions: pos,
      targetPositions: targetPos,
      sizes: sizeArr,
      colors: colArr,
    };
  }, [isCentaurusA]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uEventProgress: { value: 0 }
  }), []);

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    uniforms.uTime.value = timeRef.current;
    
    // Explicitly pass the closure ref value
    uniforms.uEventProgress.value = progressRef.current;
  });

  return (
    <group rotation={isCentaurusA ? [Math.PI / 6, 0, Math.PI / 8] : [0, 0, 0]}>
      {isCentaurusA && (
        <pointLight intensity={2.0} distance={30} color="#ffffff" />
      )}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-targetPosition" count={targetPositions.length / 3} array={targetPositions} itemSize={3} />
          <bufferAttribute attach="attributes-size" count={sizes.length} array={sizes} itemSize={1} />
          <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={isCentaurusA ? THREE.NormalBlending : THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
