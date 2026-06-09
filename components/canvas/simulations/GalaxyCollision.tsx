"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

const cinematicVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const cinematicFragmentShader = `
  uniform float uTime;
  uniform float uEventProgress;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i + vec2(0.0,0.0)), hash12(i + vec2(1.0,0.0)), u.x),
               mix(hash12(i + vec2(0.0,1.0)), hash12(i + vec2(1.0,1.0)), u.x), u.y);
  }

  float fbm(vec2 x) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; ++i) {
      v += a * noise(x);
      x = rot * x * 2.0 + vec2(100.0);
      a *= 0.5;
    }
    return v;
  }

  float pattern(vec2 p, out vec2 q, out vec2 r) {
    q.x = fbm(p + vec2(0.0,0.0) + uTime*0.05);
    q.y = fbm(p + vec2(5.2,1.3) + uTime*0.05);
    
    r.x = fbm(p + 4.0*q + vec2(1.7,9.2) + uTime*0.08);
    r.y = fbm(p + 4.0*q + vec2(8.3,2.8) + uTime*0.08);
    
    return fbm(p + 4.0*r);
  }

  float spiral(vec2 p, vec2 c, float swirl, float size) {
    vec2 v = p - c;
    float r = length(v);
    float a = atan(v.y, v.x);
    
    // The spiral structure
    float arms = sin(a * 2.0 + r * swirl);
    // Map from [-1, 1] to [0.3, 1.0] so gaps are never completely empty!
    float armStrength = arms * 0.35 + 0.65;
    
    // Core is incredibly dense and bright
    float core = exp(-r * r * 30.0 / size);
    
    // The base disk exists everywhere, the arms just add extra density
    float baseDisk = exp(-r * 3.5 / size);
    float disk = baseDisk * armStrength;
    
    // Smooth out the transition so it looks like a fluid galaxy, not tentacles
    return core * 2.5 + disk * 1.8;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    
    float orbitAngle = uEventProgress * 3.14159 * 1.5;
    float sep = 0.6 * (1.0 - pow(uEventProgress, 1.5));
    sep = max(sep, 0.01);
    
    vec2 c1 = vec2(cos(orbitAngle) * sep, sin(orbitAngle) * sep * 0.4);
    vec2 c2 = -c1;
    
    vec2 q, r;
    float warpIntensity = 0.2 + uEventProgress * 1.5; 
    float n = pattern(p * 4.0, q, r);
    
    vec2 warpedP = p + (r - 0.5) * warpIntensity;
    
    float swirl1 = -8.0 - uEventProgress * 10.0;
    float swirl2 = -8.0 - uEventProgress * 10.0;
    
    float g1 = spiral(warpedP, c1, swirl1, 1.0);
    float g2 = spiral(warpedP, c2, swirl2, 1.0);
    
    float density = g1 + g2;
    density *= (n * 1.8);
    
    vec3 col1 = vec3(0.05, 0.4, 0.9); 
    vec3 col2 = vec3(0.9, 0.3, 0.05); 
    vec3 coreCol = vec3(1.0, 0.95, 0.8);
    vec3 dustCol = vec3(0.01, 0.005, 0.005);
    
    float d1 = length(warpedP - c1);
    float d2 = length(warpedP - c2);
    float mixRatio = d1 / (d1 + d2 + 0.0001);
    vec3 baseCol = mix(col1, col2, mixRatio);
    
    vec3 finalColor = mix(dustCol, baseCol, smoothstep(0.0, 0.3, density));
    finalColor = mix(finalColor, coreCol, smoothstep(0.6, 1.5, density));
    
    float hAlphaNoise = fbm(p * 15.0 + uTime * 0.1);
    float spark = smoothstep(0.6, 1.0, hAlphaNoise) * smoothstep(0.2, 0.8, density);
    vec3 hAlphaCol = vec3(1.0, 0.1, 0.5);
    finalColor += hAlphaCol * spark * 2.0;
    
    float mask = smoothstep(1.0, 0.4, length(p));
    
    gl_FragColor = vec4(finalColor, mask * min(1.0, density * 2.0));
  }
`;

const vertexShader = `
  uniform float uTime;
  uniform float uEventProgress;
  uniform float uIsCentaurusA;
  uniform float uIsStarburst;
  
  attribute float isG1;
  attribute float size;
  attribute vec3 color;
  
  varying vec3 vColor;
  
  void main() {
    vColor = color;
    vec3 pos = position;
    
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
      
      // All particles (Stars, Dust, Starbursts) undergo the exact same unified physics
      // so they remain structurally locked together as the galaxies deform!
      
      float spinAngle = uTime * 0.2 + uEventProgress * 3.0;
      mat2 spinRot = mat2(cos(spinAngle), -sin(spinAngle), sin(spinAngle), cos(spinAngle));
      pos.xz = spinRot * pos.xz;
      
      float r = length(pos);
      float tidalForce = smoothstep(1.5, 7.0, r) * uEventProgress;
      
      float tailAngle = -tidalForce * 2.5; 
      mat2 tailRot = mat2(cos(tailAngle), -sin(tailAngle), sin(tailAngle), cos(tailAngle));
      pos.xz = tailRot * pos.xz;
      
      pos.xz *= 1.0 + tidalForce * 2.5;
      pos.y *= 1.0 + tidalForce * 0.8; 
      
      pos += myCenter;
      
      if (uIsStarburst > 0.5) {
         // Starbursts dynamically ignite and pulse as the collision intensifies
         float bloom = smoothstep(0.2, 1.0, uEventProgress);
         
         pos.x += sin(uTime * 3.0 + pos.y) * 0.2 * bloom;
         pos.y += cos(uTime * 4.0 + pos.z) * 0.2 * bloom;
         
         vColor *= (0.5 + bloom * 1.5); 
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

    // 2. DUST DATA
    const dustCount = isCentaurusA ? 40000 : 30000;
    const dustPos = new Float32Array(dustCount * 3);
    const dustIsG1 = new Float32Array(dustCount);
    const dustSize = new Float32Array(dustCount);
    const dustCol = new Float32Array(dustCount * 3);

    // 3. STARBURST DATA (Collisions only)
    const burstCount = isCentaurusA ? 0 : 8000;
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
      // Build photorealistic logarithmic spiral galaxies with distinct structure
      
      let sIdx = 0, dIdx = 0, bIdx = 0;
      
      const generateSpiralGalaxy = (
        isFirstGalaxy, 
        starCountPerGalaxy, 
        dustCountPerGalaxy, 
        burstCountPerGalaxy
      ) => {
        const baseColor = isFirstGalaxy ? color1 : color2;
        // Apply majestic asymmetrical tilts
        const euler = isFirstGalaxy 
          ? new THREE.Euler(Math.PI / 4, Math.PI / 6, Math.PI / 8) 
          : new THREE.Euler(-Math.PI / 6, -Math.PI / 3, 0);

        const generatePoint = (radiusScale, ySpread, isDust) => {
          const numArms = 2;
          const armOffset = (Math.floor(Math.random() * numArms) * Math.PI * 2) / numArms;
          const isBulge = Math.random() < 0.25;
          
          let r, theta;
          if (isBulge) {
             r = Math.pow(Math.random(), 0.5) * 1.5 * radiusScale;
             theta = Math.random() * Math.PI * 2;
          } else {
             r = (Math.random() * 5 + 1.0) * radiusScale;
             const winding = 1.3;
             theta = r * winding + armOffset;
             const noiseSpread = isDust ? 0.3 : 0.6;
             theta += (Math.random() - 0.5) * noiseSpread;
          }
          
          let y = (Math.random() - 0.5) * ySpread;
          if (isBulge) y *= 2.5; 

          const vec = new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta));
          vec.applyEuler(euler);
          return { vec, r, isBulge };
        };

        // 1. STARS
        for (let i = 0; i < starCountPerGalaxy; i++) {
          const { vec, r } = generatePoint(1.0, 0.4, false);
          starPos[sIdx * 3] = vec.x; starPos[sIdx * 3 + 1] = vec.y; starPos[sIdx * 3 + 2] = vec.z;
          starIsG1[sIdx] = isFirstGalaxy ? 1.0 : 0.0;
          starSize[sIdx] = Math.random() * 0.2 + 0.05;

          const coreFactor = 1.0 - Math.min(1.0, r / 2.5);
          const c = baseColor.clone().lerp(coreColor, coreFactor);
          starCol[sIdx * 3] = c.r; starCol[sIdx * 3 + 1] = c.g; starCol[sIdx * 3 + 2] = c.b;
          sIdx++;
        }

        // 2. DUST LANES
        for (let i = 0; i < dustCountPerGalaxy; i++) {
          const { vec } = generatePoint(1.1, 0.5, true);
          
          // Offset dust slightly into the leading edge of the spiral arms
          const offsetAngle = Math.atan2(vec.z, vec.x) + 0.15;
          const rr = Math.sqrt(vec.x*vec.x + vec.z*vec.z);
          const dx = rr * Math.cos(offsetAngle);
          const dz = rr * Math.sin(offsetAngle);
          
          dustPos[dIdx * 3] = dx; dustPos[dIdx * 3 + 1] = vec.y; dustPos[dIdx * 3 + 2] = dz;
          dustIsG1[dIdx] = isFirstGalaxy ? 1.0 : 0.0;
          dustSize[dIdx] = Math.random() * 2.5 + 1.0;
          dustCol[dIdx * 3] = dustColor.r; dustCol[dIdx * 3 + 1] = dustColor.g; dustCol[dIdx * 3 + 2] = dustColor.b;
          dIdx++;
        }

        // 3. H-ALPHA STARBURST REGIONS
        for (let i = 0; i < burstCountPerGalaxy; i++) {
          const { vec } = generatePoint(1.2, 0.3, false);
          burstPos[bIdx * 3] = vec.x; burstPos[bIdx * 3 + 1] = vec.y; burstPos[bIdx * 3 + 2] = vec.z;
          burstIsG1[bIdx] = isFirstGalaxy ? 1.0 : 0.0;
          burstSize[bIdx] = Math.random() * 0.25 + 0.1;
          
          const isPink = Math.random() > 0.35;
          const c = isPink ? hAlphaColor : coreColor;
          burstCol[bIdx * 3] = c.r; burstCol[bIdx * 3 + 1] = c.g; burstCol[bIdx * 3 + 2] = c.b;
          bIdx++;
        }
      };

      generateSpiralGalaxy(true, starCount / 2, dustCount / 2, burstCount / 2);
      generateSpiralGalaxy(false, starCount / 2, dustCount / 2, burstCount / 2);
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
  const cinematicMatRef = useRef<THREE.ShaderMaterial>(null);

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
    if (cinematicMatRef.current) {
      cinematicMatRef.current.uniforms.uTime.value = timeRef.current;
      cinematicMatRef.current.uniforms.uEventProgress.value = eventProgress;
    }
  });

  return (
    <group rotation={isCentaurusA ? [Math.PI / 6, 0, Math.PI / 8] : [0, 0, 0]}>
      {isCentaurusA && (
        <pointLight intensity={2.0} distance={30} color="#ffffff" />
      )}
      
      {/* 1. Base Stars Mesh (Centaurus A Only) */}
      {isCentaurusA && (
        <points renderOrder={1}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={stars.pos.length / 3} array={stars.pos} itemSize={3} />
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
      )}

      {/* 2. Dust Lane Mesh (Centaurus A Only) */}
      {isCentaurusA && dust.pos.length > 0 && (
        <points renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={dust.pos.length / 3} array={dust.pos} itemSize={3} />
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

      {/* Cinematic Volumetric Shader (Generic Collisions) */}
      {!isCentaurusA && (
        <Billboard follow={true}>
          <mesh>
            <planeGeometry args={[20, 20]} />
            <shaderMaterial
              ref={cinematicMatRef}
              vertexShader={cinematicVertexShader}
              fragmentShader={cinematicFragmentShader}
              uniforms={uniforms}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
