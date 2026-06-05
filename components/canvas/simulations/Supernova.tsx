"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

const shockwaveVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const shockwaveFragmentShader = `
  uniform float uTime;
  uniform float uEventProgress;
  
  varying vec2 vUv;
  varying vec3 vNormal;

  float rand(vec2 n) { 
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
  }
  
  float noise(vec2 p){
    vec2 ip = floor(p);
    vec2 u = fract(p);
    u = u*u*(3.0-2.0*u);
    
    float res = mix(
      mix(rand(ip), rand(ip+vec2(1.0,0.0)), u.x),
      mix(rand(ip+vec2(0.0,1.0)), rand(ip+vec2(1.0,1.0)), u.x), u.y);
    return res*res;
  }

  void main() {
    float activeProgress = max(0.0, uEventProgress - 0.1) * 1.11; // scales 0.1->1.0 to 0->1
    if (activeProgress <= 0.0) discard;

    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 1.5);
    
    float n = noise(vUv * 20.0 + uTime * 2.0);
    
    vec3 hotColor = vec3(0.5, 0.8, 1.0);
    vec3 coolColor = vec3(1.0, 0.2, 0.1);
    
    vec3 color = mix(hotColor, coolColor, activeProgress);
    color += n * 0.5;
    
    float alpha = fresnel * (1.0 - activeProgress) * 2.0;
    
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export default function Supernova({ params, object }: Props) {
  const coreRef = useRef<THREE.Mesh>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  
  const { timeScale, isPlaying } = useExplorer();
  const eventProgress = Number(params.eventProgress) || 0.0;
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uEventProgress: { value: 0 }
  }), []);

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    const t = timeRef.current;
    
    uniforms.uTime.value = t;
    uniforms.uEventProgress.value = eventProgress;
    
    if (coreRef.current) {
      if (isPlaying) {
        coreRef.current.rotation.y = t * 0.5;
      }
      
      // Core dynamics
      if (eventProgress < 0.1) {
        // Red supergiant phase
        const scale = 2.0 + Math.sin(t * 5) * 0.05; // pulsating
        coreRef.current.scale.set(scale, scale, scale);
      } else {
        // Collapsed remnant
        const remScale = Math.max(0.05, 0.5 - (eventProgress * 0.4));
        coreRef.current.scale.set(remScale, remScale, remScale);
      }
    }
    
    if (shockwaveRef.current) {
      // Shockwave expands rapidly after collapse
      const expansion = Math.max(0.0, eventProgress - 0.1) * 30.0;
      const scale = 0.5 + expansion;
      shockwaveRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group>
      {/* Central Star / Remnant */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={eventProgress < 0.1 ? "#ff5500" : "#4fc3f7"} />
      </mesh>
      
      {/* Intense glow right at the moment of collapse */}
      {eventProgress > 0.09 && eventProgress < 0.15 && (
        <pointLight intensity={50 * (1.0 - (eventProgress - 0.09)*15)} distance={100} color="#ffffff" />
      )}

      {/* Expanding Shockwave Bubble */}
      <mesh ref={shockwaveRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial 
          vertexShader={shockwaveVertexShader}
          fragmentShader={shockwaveFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
