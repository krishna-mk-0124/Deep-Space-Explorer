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
  uniform float uIsCentaurusA;
  uniform float uIsStarburst;
  
  attribute vec3 localPosition;
  attribute float isG1;
  attribute float size;
  attribute vec3 color;
  
  varying vec3 vColor;
  
  void main() {
    vColor = color;
    vec3 pos = localPosition;
    
    if (uIsCentaurusA > 0.5) {
      // Centaurus A (static rotation)
      float angle = uTime * 0.05;
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      pos.xz = rot * pos.xz;
    } else {
      // Collision Kinematics
      float orbitAngle = uEventProgress * 3.14159 * 1.2;
      float separation = 12.0 * (1.0 - pow(uEventProgress, 1.2));
      separation = max(separation, 0.2); // Don't collapse to absolute zero
      
      // Cores spiral inwards
      vec3 c1 = vec3(cos(orbitAngle) * separation, 0.0, sin(orbitAngle) * separation);
      vec3 c2 = -c1;
      
      vec3 myCenter = isG1 > 0.5 ? c1 : c2;
      
      if (uIsStarburst > 0.5) {
         // Starbursts spawn at the collision interface (origin) and violently expand
         float bloom = smoothstep(0.4, 1.0, uEventProgress);
         pos *= bloom * 1.5;
         
         // Add chaotic turbulence to starbursts
         pos.x += sin(uTime * 3.0 + pos.y) * 0.5 * bloom;
         pos.y += cos(uTime * 4.0 + pos.z) * 0.5 * bloom;
         
         vColor *= bloom; 
      } else {
         // Normal Stars - Tidal Shear
         // Galaxies spin naturally
         float spinAngle = uTime * 0.2 + uEventProgress * 3.0;
         mat2 spinRot = mat2(cos(spinAngle), -sin(spinAngle), sin(spinAngle), cos(spinAngle));
         pos.xz = spinRot * pos.xz;
         
         float r = length(pos);
         // Tidal force increases massively at the edges and as event progresses
         float tidalForce = smoothstep(1.5, 7.0, r) * uEventProgress;
         
         // Outer stars get flung into sweeping tails trailing the orbit
         float tailAngle = -tidalForce * 2.5; 
         mat2 tailRot = mat2(cos(tailAngle), -sin(tailAngle), sin(tailAngle), cos(tailAngle));
         pos.xz = tailRot * pos.xz;
         
         // Exponential stretching for the tails (Antennae effect)
         pos.xz *= 1.0 + tidalForce * 2.5;
         pos.y *= 1.0 + tidalForce * 0.8; // Puff up the disk slightly during collision
         
         // Bind to the respective galactic core
         pos += myCenter;
      }
    }
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    
    // Hide unignited starbursts early in the simulation
    if (uIsStarburst > 0.5 && uEventProgress < 0.35) {
       gl_PointSize = 0.0;
    }
    
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
    const starIsG1 = new Float32Array(starCount);
    const starSize = new Float32Array(starCount);
    const starCol = new Float32Array(starCount * 3);

    // 2. DUST DATA (Centaurus A only)
    const dustCount = isCentaurusA ? 40000 : 0;
    const dustPos = new Float32Array(dustCount * 3);
    const dustIsG1 = new Float32Array(dustCount);
    const dustSize = new Float32Array(dustCount);
    const dustCol = new Float32Array(dustCount * 3);

    // 3. STARBURST DATA (Collisions only)
    const burstCount = isCentaurusA ? 0 : 5000;
    const burstPos = new Float32Array(burstCount * 3);
    const burstIsG1 = new Float32Array(burstCount);
    const burstSize = new Float32Array(burstCount);
    const burstCol = new Float32Array(burstCount * 3);

    const color1 = new THREE.Color("#4fc3f7"); 
    const color2 = new THREE.Color("#ffb74d"); 
    const coreColor = new THREE.Color("#ffffff");
    const dustColor = new THREE.Color("#050202"); 
    const jetColor = new THREE.Color("#aa55ff");
    const hAlphaColor = new THREE.Color("#ff3366"); 

    if (isCentaurusA) {
      // --- CENTAURUS A STARS ---
      for (let i = 0; i < starCount; i++) {
        const typeRand = Math.random();
        let x, y, z;
        let c = new THREE.Color();
        let pSize = Math.random() * 0.4 + 0.1;

        if (typeRand < 0.9) {
          const u = Math.random();
          const v = Math.random();
          const theta = u * 2.0 * Math.PI;
          const phi = Math.acos(2.0 * v - 1.0);
          const r = Math.pow(Math.random(), 0.5) * 14; 
          
          x = r * Math.sin(phi) * Math.cos(theta);
          y = r * Math.sin(phi) * Math.sin(theta);
          z = r * Math.cos(phi);
          y *= 0.6; 
          
          c.copy(coreColor).lerp(color2, r / 14);
        } else {
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
        starIsG1[i] = 1.0;
        starSize[i] = pSize;
        starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
      }

      // --- CENTAURUS A DUST LANE ---
      for (let i = 0; i < dustCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.6) * 16; 
        
        const warp = Math.sin(theta) * 1.5;
        const turbulence = Math.sin(theta * 8) * 1.0 + Math.cos(r * 3) * 0.5;
        const yHeight = (Math.random() - 0.5) * 2.5 + turbulence + warp;
        
        const x = r * Math.cos(theta);
        const y = yHeight * 0.4;
        const z = r * Math.sin(theta);
        
        dustPos[i * 3] = x; dustPos[i * 3 + 1] = y; dustPos[i * 3 + 2] = z;
        dustIsG1[i] = 1.0;
        dustSize[i] = Math.random() * 3.0 + 2.0; 
        
        if (Math.random() > 0.98) {
          dustCol[i*3] = hAlphaColor.r; dustCol[i*3+1] = hAlphaColor.g; dustCol[i*3+2] = hAlphaColor.b;
        } else {
          dustCol[i*3] = dustColor.r; dustCol[i*3+1] = dustColor.g; dustCol[i*3+2] = dustColor.b;
        }
      }
    } else {
      // --- GENERIC GALAXY COLLISION KINEMATICS ---
      for (let i = 0; i < starCount; i++) {
        const isFirstGalaxy = i % 2 === 0;
        const baseColor = isFirstGalaxy ? color1 : color2;

        const r = Math.random() * 6 + 0.2;
        const theta = r * 1.5 + Math.random() * Math.PI * 2; 
        const y = (Math.random() - 0.5) * (1.5 / r); 
        
        // Stars are stored in their native local coords
        // The vertex shader will dynamically orbit and shear them.
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);
        
        starPos[i * 3] = x; starPos[i * 3 + 1] = y; starPos[i * 3 + 2] = z;
        starIsG1[i] = isFirstGalaxy ? 1.0 : 0.0;
        starSize[i] = Math.random() * 0.3 + 0.05;

        const coreFactor = 1.0 - Math.min(1.0, r / 3);
        const c = baseColor.clone().lerp(coreColor, coreFactor);
        starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
      }

      // --- STARBURST NODES (H II Regions) ---
      for (let i = 0; i < burstCount; i++) {
        const u = Math.random();
        const v = Math.random();
        const r = Math.pow(Math.random(), 2.5) * 5; 
        const theta = u * Math.PI * 2;
        const phi = Math.acos(2.0 * v - 1.0);
        
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta) * 0.3; 
        const z = r * Math.cos(phi);
        
        const offset = Math.random() > 0.5 ? 2.0 : -2.0;
        
        burstPos[i * 3] = x + offset;
        burstPos[i * 3 + 1] = y;
        burstPos[i * 3 + 2] = z;
        burstIsG1[i] = 1.0; 

        burstSize[i] = Math.random() * 0.2 + 0.05;
        
        const isPink = Math.random() > 0.3;
        const c = isPink ? hAlphaColor : coreColor;
        burstCol[i*3] = c.r; burstCol[i*3+1] = c.g; burstCol[i*3+2] = c.b;
      }
    }

    return {
      stars: { pos: starPos, isG1: starIsG1, sizes: starSize, colors: starCol },
      dust: { pos: dustPos, isG1: dustIsG1, sizes: dustSize, colors: dustCol },
      starbursts: { pos: burstPos, isG1: burstIsG1, sizes: burstSize, colors: burstCol }
    };
  }, [isCentaurusA]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uEventProgress: { value: 0 },
    uIsCentaurusA: { value: isCentaurusA ? 1.0 : 0.0 },
    uIsStarburst: { value: 0.0 }
  }), [isCentaurusA]);

  const timeRef = useRef(0);

  const starMatRef = useRef<THREE.ShaderMaterial>(null);
  const dustMatRef = useRef<THREE.ShaderMaterial>(null);
  const burstMatRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    
    if (starMatRef.current) {
      starMatRef.current.uniforms.uTime.value = timeRef.current;
      starMatRef.current.uniforms.uEventProgress.value = eventProgress;
    }
    if (dustMatRef.current) {
      dustMatRef.current.uniforms.uTime.value = timeRef.current;
      dustMatRef.current.uniforms.uEventProgress.value = eventProgress;
    }
    if (burstMatRef.current) {
      burstMatRef.current.uniforms.uTime.value = timeRef.current;
      burstMatRef.current.uniforms.uEventProgress.value = eventProgress;
    }
  });

  return (
    <group rotation={isCentaurusA ? [Math.PI / 6, 0, Math.PI / 8] : [0, 0, 0]}>
      {isCentaurusA && (
        <pointLight intensity={2.0} distance={30} color="#ffffff" />
      )}
      
      {/* 1. Base Stars Mesh */}
      <points renderOrder={1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-localPosition" count={stars.pos.length / 3} array={stars.pos} itemSize={3} />
          <bufferAttribute attach="attributes-isG1" count={stars.isG1.length} array={stars.isG1} itemSize={1} />
          <bufferAttribute attach="attributes-size" count={stars.sizes.length} array={stars.sizes} itemSize={1} />
          <bufferAttribute attach="attributes-color" count={stars.colors.length / 3} array={stars.colors} itemSize={3} />
        </bufferGeometry>
        <shaderMaterial
          ref={starMatRef}
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
            <bufferAttribute attach="attributes-localPosition" count={dust.pos.length / 3} array={dust.pos} itemSize={3} />
            <bufferAttribute attach="attributes-isG1" count={dust.isG1.length} array={dust.isG1} itemSize={1} />
            <bufferAttribute attach="attributes-size" count={dust.sizes.length} array={dust.sizes} itemSize={1} />
            <bufferAttribute attach="attributes-color" count={dust.colors.length / 3} array={dust.colors} itemSize={3} />
          </bufferGeometry>
          <shaderMaterial
            ref={dustMatRef}
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
            <bufferAttribute attach="attributes-localPosition" count={starbursts.pos.length / 3} array={starbursts.pos} itemSize={3} />
            <bufferAttribute attach="attributes-isG1" count={starbursts.isG1.length} array={starbursts.isG1} itemSize={1} />
            <bufferAttribute attach="attributes-size" count={starbursts.sizes.length} array={starbursts.sizes} itemSize={1} />
            <bufferAttribute attach="attributes-color" count={starbursts.colors.length / 3} array={starbursts.colors} itemSize={3} />
          </bufferGeometry>
          <shaderMaterial
            ref={burstMatRef}
            vertexShader={vertexShader}
            fragmentShader={starburstFragmentShader}
            uniforms={{...uniforms, uIsStarburst: { value: 1.0 }}}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}
    </group>
  );
}
