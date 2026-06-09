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

const dustFragmentShader = `
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    // Dark dust uses normal blending, needs to be opaque in the center
    float alpha = pow(1.0 - (dist * 2.0), 2.0);
    gl_FragColor = vec4(vColor, alpha * 0.95);
  }
`;

const starburstFragmentShader = `
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, dist);
    // Extremely bright starbursts
    gl_FragColor = vec4(vColor, alpha * 1.5);
  }
`;

export default function GalaxyCollision({ params, object }: Props) {
  const pointsRef = useRef<THREE.Group>(null);
  
  const { timeScale, isPlaying } = useExplorer();
  const eventProgress = Number(params.eventProgress) || 0.0;
  
  // R3F useFrame closure fix
  const progressRef = useRef(eventProgress);
  progressRef.current = eventProgress;

  const isCentaurusA = object.id === "c-77" || object.name.includes("Centaurus");

  const { stars, dust, starbursts } = useMemo(() => {
    // 1. STARS DATA
    const starCount = isCentaurusA ? 100000 : 50000;
    const starPos = new Float32Array(starCount * 3);
    const starTarget = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    const starCol = new Float32Array(starCount * 3);

    // 2. DUST DATA (Centaurus A only)
    const dustCount = isCentaurusA ? 40000 : 0;
    const dustPos = new Float32Array(dustCount * 3);
    const dustTarget = new Float32Array(dustCount * 3);
    const dustSize = new Float32Array(dustCount);
    const dustCol = new Float32Array(dustCount * 3);

    // 3. STARBURST DATA (Collisions only)
    const burstCount = isCentaurusA ? 0 : 5000;
    const burstPos = new Float32Array(burstCount * 3);
    const burstTarget = new Float32Array(burstCount * 3);
    const burstSize = new Float32Array(burstCount);
    const burstCol = new Float32Array(burstCount * 3);

    const galaxy1Center = new THREE.Vector3(-6, 0, -3);
    const galaxy2Center = new THREE.Vector3(6, 0, 3);
    
    const color1 = new THREE.Color("#4fc3f7"); 
    const color2 = new THREE.Color("#ffb74d"); 
    const coreColor = new THREE.Color("#ffffff");
    const dustColor = new THREE.Color("#050202"); // Opaque black/brown
    const jetColor = new THREE.Color("#aa55ff");
    const hAlphaColor = new THREE.Color("#ff3366"); // Bright pink starbursts

    if (isCentaurusA) {
      // --- CENTAURUS A STARS ---
      for (let i = 0; i < starCount; i++) {
        const typeRand = Math.random();
        let x, y, z;
        let c = new THREE.Color();
        let pSize = Math.random() * 0.4 + 0.1;

        if (typeRand < 0.9) {
          // Massive Elliptical Starfield
          const u = Math.random();
          const v = Math.random();
          const theta = u * 2.0 * Math.PI;
          const phi = Math.acos(2.0 * v - 1.0);
          const r = Math.pow(Math.random(), 0.5) * 14; 
          
          x = r * Math.sin(phi) * Math.cos(theta);
          y = r * Math.sin(phi) * Math.sin(theta);
          z = r * Math.cos(phi);
          y *= 0.6; // Lenticular squash
          
          c.copy(coreColor).lerp(color2, r / 14);
        } else {
          // Relativistic Jets
          const dir = Math.random() > 0.5 ? 1 : -1;
          const r = Math.pow(Math.random(), 2.0) * 1.5;
          const theta = Math.random() * Math.PI * 2;
          
          x = r * Math.cos(theta);
          z = r * Math.sin(theta);
          const height = Math.random() * 35 + 2;
          y = height * dir;
          
          c.copy(coreColor).lerp(jetColor, height / 37);
          pSize = Math.random() * 1.0 + 0.5;
        }

        starPos[i * 3] = x; starPos[i * 3 + 1] = y; starPos[i * 3 + 2] = z;
        starTarget[i * 3] = x; starTarget[i * 3 + 1] = y; starTarget[i * 3 + 2] = z;
        starSize[i] = pSize;
        starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
      }

      // --- CENTAURUS A DUST LANE ---
      for (let i = 0; i < dustCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.6) * 16; 
        
        // Integral sign warp (z dictates vertical warping)
        const warp = Math.sin(theta) * 1.5;
        const turbulence = Math.sin(theta * 8) * 1.0 + Math.cos(r * 3) * 0.5;
        const yHeight = (Math.random() - 0.5) * 2.5 + turbulence + warp;
        
        const x = r * Math.cos(theta);
        const y = yHeight * 0.4;
        const z = r * Math.sin(theta);
        
        dustPos[i * 3] = x; dustPos[i * 3 + 1] = y; dustPos[i * 3 + 2] = z;
        dustTarget[i * 3] = x; dustTarget[i * 3 + 1] = y; dustTarget[i * 3 + 2] = z;
        dustSize[i] = Math.random() * 3.0 + 2.0; // Large, overlapping dust clumps
        
        // Sometimes dust edges are illuminated by H-alpha star forming regions
        if (Math.random() > 0.98) {
          dustCol[i*3] = hAlphaColor.r; dustCol[i*3+1] = hAlphaColor.g; dustCol[i*3+2] = hAlphaColor.b;
        } else {
          dustCol[i*3] = dustColor.r; dustCol[i*3+1] = dustColor.g; dustCol[i*3+2] = dustColor.b;
        }
      }
    } else {
      // --- GENERIC GALAXY COLLISION ---
      for (let i = 0; i < starCount; i++) {
        const isG1 = i % 2 === 0;
        const center = isG1 ? galaxy1Center : galaxy2Center;
        const baseColor = isG1 ? color1 : color2;

        const r = Math.random() * 6 + 0.2;
        const theta = r * 1.5 + Math.random() * Math.PI * 2; 
        const y = (Math.random() - 0.5) * (1.5 / r); 
        
        const x = center.x + r * Math.cos(theta);
        const z = center.z + r * Math.sin(theta);
        
        starPos[i * 3] = x; starPos[i * 3 + 1] = y; starPos[i * 3 + 2] = z;

        // Hyperbolic Tidal Tails
        const mergedR = Math.random() * 10;
        const mergedTheta = Math.random() * Math.PI * 2;
        const isTidalTail = Math.random() > 0.6;
        
        let tx, ty, tz;
        if (isTidalTail) {
          // Gravity slingshots outer stars into massive sweeping arcs
          const tailProgress = Math.random();
          const tailLen = 30;
          const tailDir = isG1 ? 1 : -1;
          const arcSweep = tailProgress * Math.PI * 0.5;
          
          tx = tailDir * (tailProgress * tailLen) * Math.cos(arcSweep);
          ty = (Math.random() - 0.5) * 4 * tailProgress;
          tz = tailDir * (tailProgress * tailLen) * Math.sin(arcSweep) - (tailDir * 5);
        } else {
          // Relaxed merged elliptical core
          tx = mergedR * Math.cos(mergedTheta) * 0.8;
          ty = (Math.random() - 0.5) * (8 / (mergedR + 1));
          tz = mergedR * Math.sin(mergedTheta) * 0.8;
        }

        starTarget[i * 3] = tx; starTarget[i * 3 + 1] = ty; starTarget[i * 3 + 2] = tz;
        starSize[i] = Math.random() * 0.3 + 0.05;

        const coreFactor = 1.0 - Math.min(1.0, r / 3);
        const c = baseColor.clone().lerp(coreColor, coreFactor);
        starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
      }

      // --- STARBURST NODES (H II Regions) ---
      for (let i = 0; i < burstCount; i++) {
        // Organic clustering at the collision interfaces
        const u = Math.random();
        const v = Math.random();
        // Heavy clustering near the core interface, trailing off
        const r = Math.pow(Math.random(), 2.5) * 5; 
        const theta = u * Math.PI * 2;
        const phi = Math.acos(2.0 * v - 1.0);
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta) * 0.3; // Squash to a disk
        const z = r * Math.cos(phi);
        
        // Spawn them slightly offset along the collision axis
        const offset = Math.random() > 0.5 ? 2.0 : -2.0;
        
        burstPos[i * 3] = x + offset;
        burstPos[i * 3 + 1] = y;
        burstPos[i * 3 + 2] = z;

        burstTarget[i * 3] = x * 0.3; // Compress violently into the center
        burstTarget[i * 3 + 1] = y * 0.5;
        burstTarget[i * 3 + 2] = z * 0.3;

        // Much smaller, realistic particle sizes
        burstSize[i] = Math.random() * 0.2 + 0.05;
        
        // Brilliant pink and bright blue star formation nodes
        const isPink = Math.random() > 0.3;
        const c = isPink ? hAlphaColor : coreColor;
        burstCol[i*3] = c.r; burstCol[i*3+1] = c.g; burstCol[i*3+2] = c.b;
      }
    }

    return {
      stars: { pos: starPos, target: starTarget, sizes: starSize, colors: starCol },
      dust: { pos: dustPos, target: dustTarget, sizes: dustSize, colors: dustCol },
      starbursts: { pos: burstPos, target: burstTarget, sizes: burstSize, colors: burstCol }
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
    uniforms.uEventProgress.value = progressRef.current;
  });

  return (
    <group rotation={isCentaurusA ? [Math.PI / 6, 0, Math.PI / 8] : [0, 0, 0]}>
      {isCentaurusA && (
        <pointLight intensity={2.0} distance={30} color="#ffffff" />
      )}
      
      {/* 1. Base Stars Mesh */}
      <points renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={stars.pos.length / 3} array={stars.pos} itemSize={3} />
          <bufferAttribute attach="attributes-targetPosition" count={stars.target.length / 3} array={stars.target} itemSize={3} />
          <bufferAttribute attach="attributes-size" count={stars.sizes.length} array={stars.sizes} itemSize={1} />
          <bufferAttribute attach="attributes-color" count={stars.colors.length / 3} array={stars.colors} itemSize={3} />
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

      {/* 2. Dust Lane Mesh (Centaurus A) */}
      {isCentaurusA && dust.pos.length > 0 && (
        <points renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={dust.pos.length / 3} array={dust.pos} itemSize={3} />
            <bufferAttribute attach="attributes-targetPosition" count={dust.target.length / 3} array={dust.target} itemSize={3} />
            <bufferAttribute attach="attributes-size" count={dust.sizes.length} array={dust.sizes} itemSize={1} />
            <bufferAttribute attach="attributes-color" count={dust.colors.length / 3} array={dust.colors} itemSize={3} />
          </bufferGeometry>
          <shaderMaterial
            vertexShader={vertexShader}
            fragmentShader={dustFragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </points>
      )}

      {/* 3. Starburst Nodes (Galactic Collision) */}
      {!isCentaurusA && starbursts.pos.length > 0 && (
        <points renderOrder={3}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={starbursts.pos.length / 3} array={starbursts.pos} itemSize={3} />
            <bufferAttribute attach="attributes-targetPosition" count={starbursts.target.length / 3} array={starbursts.target} itemSize={3} />
            <bufferAttribute attach="attributes-size" count={starbursts.sizes.length} array={starbursts.sizes} itemSize={1} />
            <bufferAttribute attach="attributes-color" count={starbursts.colors.length / 3} array={starbursts.colors} itemSize={3} />
          </bufferGeometry>
          <shaderMaterial
            vertexShader={vertexShader}
            fragmentShader={starburstFragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}
    </group>
  );
}
