"use client";

import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

// ─── VOLUMETRIC RAYMARCHED BLACK HOLE (INTERSTELLAR/GARGANTUA STYLE) ───

const bhVertexShader = `
  varying vec3 vPos;
  void main() {
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  }
`;

const bhFragmentShader = `
  uniform vec3 uCameraPos;
  uniform float uTime;
  uniform float uMass;
  uniform vec3 uDiskColor;
  uniform float uDiskDensity;
  uniform float uJetIntensity;
  
  varying vec3 vPos;

  // PRNG and 3D Noise for Volumetric Plasma
  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float noise(vec3 x) {
      vec3 p = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      float n = p.x + p.y * 57.0 + 113.0 * p.z;
      return mix(
          mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
              mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
          mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
              mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
      float f = 0.0;
      float w = 0.5;
      for (int i = 0; i < 4; i++) {
          f += w * noise(p);
          p *= 2.0;
          w *= 0.5;
      }
      return f;
  }

  void main() {
      vec3 ro = uCameraPos;
      vec3 rd = normalize(vPos - uCameraPos);

      // Event Horizon Radius (Schwarzschild)
      float rs = 1.5 * pow(uMass / 80.0, 0.4); 
      float rs2 = rs * rs;

      vec3 p = ro;
      vec3 v = rd;
      float dt = rs * 0.15; // Adaptive step base

      float diskAlpha = 0.0;
      vec3 diskCol = vec3(0.0);
      bool hitBH = false;

      // Volumetric Raymarching Loop with Geodesic Bending
      for(int i = 0; i < 80; i++) {
          float r2 = dot(p, p);
          float r = sqrt(r2);
          
          if (r < rs) {
              hitBH = true;
              break;
          }
          if (r > rs * 15.0) {
              break; // Escaped the bounds
          }

          // Exact General Relativity Light Bending Approximation
          // a = -1.5 * rs * L^2 / r^5 * p
          vec3 h = cross(p, v);
          float h2 = dot(h, h);
          vec3 acc = -1.5 * rs * h2 / (r2 * r2 * r) * p; 
          
          v += acc * dt;
          v = normalize(v); // Photons always travel at c
          p += v * dt;

          // 1. Accumulate Accretion Disk Plasma
          if (abs(p.y) < rs * 0.15 && r > rs * 1.5 && r < rs * 8.0) {
              float distFromCenter = r;
              float angle = atan(p.z, p.x);
              
              // Disk Rotation (Keplerian)
              float spinVel = sqrt(rs / distFromCenter);
              angle += uTime * spinVel * 2.0;
              
              vec3 samplePos = vec3(distFromCenter * 3.0 / rs, angle * 5.0, 0.0);
              float density = fbm(samplePos);
              
              // Structural Falloffs
              density *= smoothstep(rs * 8.0, rs * 3.0, distFromCenter);
              density *= smoothstep(rs * 1.5, rs * 2.0, distFromCenter);
              density *= smoothstep(rs * 0.15, 0.0, abs(p.y)); 
              
              // Relativistic Doppler Beaming (Interstellar Effect)
              vec3 vel = normalize(vec3(-p.z, 0.0, p.x)); // Counter-clockwise
              float beaming = dot(vel, rd); // Alignment with viewer
              float doppler = pow((1.0 + beaming * 0.75) / (1.0 - beaming * 0.75), 1.8);
              
              float localAlpha = density * (uDiskDensity / 1500.0) * 0.15 * doppler;
              
              // Thermodynamics: Hotter/Bluer near Event Horizon
              vec3 hotColor = mix(uDiskColor, vec3(1.0, 1.0, 1.0), smoothstep(rs * 3.5, rs * 1.5, distFromCenter));
              vec3 glow = hotColor * density * doppler * 2.0;

              diskCol += glow * (1.0 - diskAlpha);
              diskAlpha += localAlpha * (1.0 - diskAlpha);
          }

          // 2. Accumulate Relativistic Jets (if present)
          if (uJetIntensity > 0.0) {
              float jetDist = length(p.xz);
              if (jetDist < rs * 0.8 && abs(p.y) > rs) {
                  float jetHeightFade = smoothstep(rs * 15.0, rs * 1.5, abs(p.y));
                  float jetCoreFade = smoothstep(rs * 0.8, 0.0, jetDist);
                  
                  // Outward flowing noise
                  float jDens = fbm(vec3(p.x * 3.0, p.y * 1.0 - sign(p.y) * uTime * 8.0, p.z * 3.0));
                  jDens *= jetHeightFade * jetCoreFade;
                  
                  float localJetAlpha = jDens * uJetIntensity * 0.15;
                  // Jets are typically ultra-hot plasma (blue/white/violet)
                  vec3 jetColor = mix(vec3(0.5, 0.7, 1.0), vec3(0.9, 0.5, 1.0), jDens) * uJetIntensity * 2.5;
                  
                  diskCol += jetColor * (1.0 - diskAlpha);
                  diskAlpha += localJetAlpha * (1.0 - diskAlpha);
              }
          }

          // Optimization: Early Ray Termination
          if (diskAlpha > 0.99) break;
          
          // Adaptive stepping to avoid overshooting near the singularity
          dt = min(rs * 0.1, r * 0.12);
      }

      // Final Lensing Mask Calculation
      // How much did the ray bend compared to its original path?
      float bendAmount = length(v - normalize(vPos - uCameraPos));
      float lensMask = smoothstep(0.02, 0.3, bendAmount);

      float finalAlpha = diskAlpha;
      if (hitBH) finalAlpha = 1.0;
      finalAlpha = max(finalAlpha, lensMask * 0.7); // Preserve Einstein Ring visibility

      // Discard untouched rays so the Three.js <Stars/> background is visible
      if (finalAlpha < 0.01) discard;

      vec3 finalColor = vec3(0.0);
      if (hitBH) {
          // Pure pitch black for the Event Horizon
          finalColor = diskCol; 
      } else {
          // We generate a procedural starfield for the heavily lensed background rays
          // This creates the swirling stars inside the Einstein Ring
          float star = pow(hash(dot(v, vec3(12.34, 56.78, 91.01))), 200.0) * 3.0;
          vec3 starCol = vec3(star) * mix(vec3(0.8,0.9,1.0), vec3(1.0,0.8,0.6), hash(v.x));
          
          finalColor = diskCol + starCol * lensMask * (1.0 - diskAlpha);
      }

      gl_FragColor = vec4(finalColor, min(finalAlpha, 1.0));
  }
`;

export default function BlackHole({ params, object }: Props) {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  const { isPlaying, timeScale } = useExplorer();

  const mass = Number(params.mass) || 80;
  let accretionDiskDensity = Number(params.accretionDiskDensity) || 2000;
  let accretionDiskColorHex = (params.accretionDiskColor && String(params.accretionDiskColor).startsWith("#")) 
    ? String(params.accretionDiskColor) 
    : "#FF6B35";
    
  const jetIntensity = Number(params.jetIntensity) || 0.0;

  // ─── SCIENTIFICALLY RESEARCHED COLOR CORRECTIONS ───
  // Ensure the black holes match their physical properties / iconic depictions
  if (object.name.includes("Sagittarius A*")) {
    accretionDiskColorHex = "#FF5511"; // Quiet black hole, visualized as fiery red-orange
  } else if (object.name.includes("M87")) {
    accretionDiskColorHex = "#FF2200"; // Deep crimson/orange matching the Event Horizon Telescope photo
  } else if (object.name.includes("TON 618") || object.name.includes("Quasar")) {
    accretionDiskColorHex = "#66BBFF"; // Blinding UV/Blue thermal radiation from hyper-luminous quasar
    accretionDiskDensity *= 2.5; 
  } else if (object.name.includes("Phoenix A*")) {
    accretionDiskColorHex = "#E0D0FF"; // Ultra-massive searing white-purple
    accretionDiskDensity *= 3.0;
  }

  const diskColor = new THREE.Color(accretionDiskColorHex);
  const rs = 1.5 * Math.pow(mass / 80.0, 0.4); 

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uMass: { value: mass },
    uDiskColor: { value: diskColor },
    uDiskDensity: { value: accretionDiskDensity },
    uJetIntensity: { value: jetIntensity },
  }), [mass, diskColor, accretionDiskDensity, jetIntensity]);

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale * 0.2; // Slow cinematic spin
    }
    
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = timeRef.current;
      shaderRef.current.uniforms.uCameraPos.value.copy(state.camera.position);
    }
  });

  return (
    <group>
      {/* Bounding Volume for Raymarching Shader */}
      {/* Must be large enough to contain the heavily lensed rays (16x Schwarzschild radius) */}
      <mesh>
        <boxGeometry args={[rs * 32, rs * 32, rs * 32]} />
        <shaderMaterial
          ref={shaderRef}
          vertexShader={bhVertexShader}
          fragmentShader={bhFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.BackSide} // Render on the inside so camera can fly into it
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
}
