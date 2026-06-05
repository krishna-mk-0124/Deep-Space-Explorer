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
    
    // Soft particle edge
    float alpha = smoothstep(0.5, 0.1, dist);
    
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export default function GalaxyCollision({ params, object }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  
  const { timeScale, isPlaying } = useExplorer();
  const eventProgress = Number(params.eventProgress) || 0.0;
  const particleCount = 20000;

  const { positions, targetPositions, sizes, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const targetPos = new Float32Array(particleCount * 3);
    const sizeArr = new Float32Array(particleCount);
    const colArr = new Float32Array(particleCount * 3);

    const galaxy1Center = new THREE.Vector3(-4, 0, -2);
    const galaxy2Center = new THREE.Vector3(4, 0, 2);
    
    const color1 = new THREE.Color("#4fc3f7"); // Blue galaxy
    const color2 = new THREE.Color("#ffb74d"); // Orange/Yellow galaxy

    for (let i = 0; i < particleCount; i++) {
      const isG1 = i % 2 === 0;
      const center = isG1 ? galaxy1Center : galaxy2Center;
      const baseColor = isG1 ? color1 : color2;

      // Spiral galaxy generation (initial state)
      const r = Math.random() * 5 + 0.1;
      const theta = r * 1.5 + Math.random() * Math.PI * 2; // Arms
      const y = (Math.random() - 0.5) * (1 / r); // Thicker at center
      
      const x = center.x + r * Math.cos(theta);
      const z = center.z + r * Math.sin(theta);
      
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      // Collided irregular state (target state)
      const mergedR = Math.random() * 8;
      const mergedTheta = Math.random() * Math.PI * 2;
      const isTidalTail = Math.random() > 0.8;
      
      let tx, ty, tz;
      if (isTidalTail) {
        // Fling out into long tails
        const tailLen = 15;
        const tailDir = isG1 ? 1 : -1;
        tx = tailDir * Math.random() * tailLen;
        ty = (Math.random() - 0.5) * 2;
        tz = tailDir * Math.random() * tailLen * 0.5;
      } else {
        // Central merged core
        tx = mergedR * Math.cos(mergedTheta) * 0.5;
        ty = (Math.random() - 0.5) * (4 / (mergedR + 1));
        tz = mergedR * Math.sin(mergedTheta) * 0.5;
      }

      targetPos[i * 3] = tx;
      targetPos[i * 3 + 1] = ty;
      targetPos[i * 3 + 2] = tz;

      sizeArr[i] = Math.random() * 0.05 + 0.01;

      // Color variation based on density
      const coreFactor = 1.0 - Math.min(1.0, r / 3);
      const c = baseColor.clone().lerp(new THREE.Color("#ffffff"), coreFactor);
      
      colArr[i * 3] = c.r;
      colArr[i * 3 + 1] = c.g;
      colArr[i * 3 + 2] = c.b;
    }

    return {
      positions: pos,
      targetPositions: targetPos,
      sizes: sizeArr,
      colors: colArr,
    };
  }, []);

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
    uniforms.uEventProgress.value = eventProgress;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-targetPosition"
          args={[targetPositions, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizes, 1]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
