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

  vec2 intersectSphere(vec3 ro, vec3 rd, float R) {
      float b = dot(ro, rd);
      float c = dot(ro, ro) - R * R;
      float h = b * b - c;
      if (h < 0.0) return vec2(-1.0);
      h = sqrt(h);
      return vec2(-b - h, -b + h);
  }

  void main() {
      vec3 ro = uCameraPos;
      vec3 rd = normalize(vPos - uCameraPos);

      float rs = 1.5 * pow(uMass / 80.0, 0.4); 
      float rs2 = rs * rs;

      // Restrict raymarching strictly to the bounding sphere
      float boundR = rs * 20.0;
      vec2 tIntersect = intersectSphere(ro, rd, boundR);
      if (tIntersect.y < 0.0) discard;

      // Start ray at the entry point of the sphere, or camera pos if inside
      float tStart = max(0.0, tIntersect.x);
      vec3 p = ro + rd * tStart;
      vec3 v = rd;
      float dt = 0.0;

      float diskAlpha = 0.0;
      vec3 diskCol = vec3(0.0);
      bool hitBH = false;
      vec3 prev_p = p;

      // Volumetric Raymarching Loop
      for(int i = 0; i < 120; i++) {
          float r2 = dot(p, p);
          float r = sqrt(r2);
          
          if (r < rs) {
              hitBH = true;
              break;
          }
          if (r > boundR + 1.0) {
              break;
          }

          vec3 h = cross(p, v);
          float h2 = dot(h, h);
          vec3 acc = -1.5 * rs * h2 / (r2 * r2 * r) * p; 
          
          // Adaptive step size
          dt = r * 0.08; 

          // Numerical stability check to force Event Horizon capture
          if (length(acc) * dt > 1.0) {
              hitBH = true;
              break;
          }

          prev_p = p;
          v += acc * dt;
          v = normalize(v);
          p += v * dt;

          // 1. Accretion Disk (Analytic Plane Crossing for razor-sharp Einstein rings)
          if (prev_p.y * p.y < 0.0) {
              float tPlane = abs(prev_p.y) / (abs(prev_p.y) + abs(p.y));
              vec3 intersectPos = mix(prev_p, p, tPlane);
              float distFromCenter = length(intersectPos);
              
              if (distFromCenter > rs * 2.6 && distFromCenter < rs * 14.0) {
                  float angle = atan(intersectPos.z, intersectPos.x);
                  float spinVel = sqrt(rs / distFromCenter);
                  angle += uTime * spinVel * 2.0;
                  
                  vec3 samplePos = vec3(distFromCenter * 3.0 / rs, angle * 5.0, 0.0);
                  float density = fbm(samplePos);
                  
                  density *= smoothstep(rs * 14.0, rs * 6.0, distFromCenter);
                  density *= smoothstep(rs * 2.6, rs * 3.2, distFromCenter);
                  
                  vec3 vel = normalize(vec3(-intersectPos.z, 0.0, intersectPos.x)); 
                  float beaming = dot(vel, -v); 
                  float doppler = pow((1.0 + beaming * 0.8) / (1.0 - beaming * 0.8), 1.8);
                  
                  float localAlpha = density * (uDiskDensity / 1000.0) * doppler * 0.5;
                  
                  vec3 hotColor = mix(uDiskColor, vec3(1.0, 1.0, 1.0), smoothstep(rs * 5.0, rs * 2.6, distFromCenter));
                  vec3 glow = hotColor * density * doppler * 3.0;

                  diskCol += glow * (1.0 - diskAlpha);
                  diskAlpha += localAlpha * (1.0 - diskAlpha);
              }
          }

          // 2. Accumulate Relativistic Jets (if present)
          if (uJetIntensity > 0.0) {
              float jetDist = length(p.xz);
              if (jetDist < rs * 0.8 && abs(p.y) > rs) {
                  float jetHeightFade = smoothstep(rs * 15.0, rs * 1.5, abs(p.y));
                  float jetCoreFade = smoothstep(rs * 0.8, 0.0, jetDist);
                  
                  float jDens = fbm(vec3(p.x * 3.0, p.y * 1.0 - sign(p.y) * uTime * 8.0, p.z * 3.0));
                  jDens *= jetHeightFade * jetCoreFade;
                  
                  float localJetAlpha = jDens * uJetIntensity * 0.15;
                  vec3 jetColor = mix(vec3(0.5, 0.7, 1.0), vec3(0.9, 0.5, 1.0), jDens) * uJetIntensity * 2.5;
                  
                  diskCol += jetColor * (1.0 - diskAlpha);
                  diskAlpha += localJetAlpha * (1.0 - diskAlpha);
              }
          }

          if (diskAlpha > 0.99) break;
      }

      float bendAmount = length(v - rd);
      float lensMask = smoothstep(0.01, 0.3, bendAmount);

      float finalAlpha = diskAlpha;
      if (hitBH) finalAlpha = 1.0;
      finalAlpha = max(finalAlpha, lensMask * 0.8); 

      if (finalAlpha < 0.01) discard;

      vec3 finalColor = vec3(0.0);
      if (hitBH) {
          finalColor = diskCol; 
      } else {
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

  if (object.name.includes("Sagittarius A*")) {
    accretionDiskColorHex = "#FF5511"; 
  } else if (object.name.includes("M87")) {
    accretionDiskColorHex = "#FF2200"; 
  } else if (object.name.includes("TON 618") || object.name.includes("Quasar")) {
    accretionDiskColorHex = "#66BBFF"; 
    accretionDiskDensity *= 2.5; 
  } else if (object.name.includes("Phoenix A*")) {
    accretionDiskColorHex = "#E0D0FF"; 
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
      timeRef.current += delta * timeScale * 0.2; 
    }
    
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = timeRef.current;
      shaderRef.current.uniforms.uCameraPos.value.copy(state.camera.position);
    }
  });

  return (
    <group>
      <mesh>
        <boxGeometry args={[rs * 45, rs * 45, rs * 45]} />
        <shaderMaterial
          ref={shaderRef}
          vertexShader={bhVertexShader}
          fragmentShader={bhFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.BackSide} 
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
}
