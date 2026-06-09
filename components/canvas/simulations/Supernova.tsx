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

function SphericalSupernova({ eventProgress }: { eventProgress: number }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  
  const { timeScale, isPlaying } = useExplorer();
  
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

function createSoftParticleTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

function BipolarPlanetaryNebula({ params, eventProgress }: { params: Record<string, number | string>, eventProgress: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { timeScale, isPlaying } = useExplorer();
  
  const particleTexture = useMemo(() => createSoftParticleTexture(), []);
  
  const particleCount = Number(params.particleCount) || 20000;
  const maxRadius = Number(params.maxRadius) || 15;
  const ejectaColor = (params.ejectaColor as string) || "#eeaa22";
  const coreColor = (params.coreColor as string) || "#ffffff";
  
  const { positions, colors, sizes } = useMemo(() => {
    // Dramatically increase density for volumetric look
    const actualCount = particleCount * 3;
    const pos = new Float32Array(actualCount * 3);
    const col = new Float32Array(actualCount * 3);
    const siz = new Float32Array(actualCount);
    
    for (let i = 0; i < actualCount; i++) {
      const u = Math.random();
      const theta = 2.0 * Math.PI * u; 
      
      let zDist = (Math.random() - 0.5) * 2.0; 
      // Push particles towards the outer lobes to create the dual-cone look
      zDist = Math.sign(zDist) * Math.pow(Math.abs(zDist), 0.5); 
      
      // Base radius equation for an hourglass/butterfly shape
      const baseR = 0.05 + Math.pow(Math.abs(zDist), 2.5) * 3.0; 
      
      // Most particles form the dense "walls" of the cavity, fewer fill the interior
      const isWall = Math.random() > 0.25;
      const wallThickness = 0.2;
      const rScale = isWall ? (1.0 - Math.random() * wallThickness) : Math.pow(Math.random(), 0.5); 
      
      const radius = maxRadius * baseR * rScale;
      
      // Add azimuthal structure (folds and filaments) to the wings
      const fold = Math.sin(theta * 3.0) * 0.35 + Math.cos(theta * 7.0) * 0.15;
      
      const x = radius * (1.0 + fold) * Math.cos(theta);
      // Squash Y to flatten the butterfly rather than a perfect cylinder
      const y = radius * (1.0 + fold) * Math.sin(theta) * 0.5; 
      const z = zDist * maxRadius * 2.0; 
      
      // Fine turbulent noise for chaotic gas clouds
      const turbulence = 1.0 + (Math.random() - 0.5) * 0.25;
      
      pos[i*3] = x * turbulence;
      pos[i*3+1] = y * turbulence;
      pos[i*3+2] = z * turbulence;
      
      // Realistic Color Mapping: Intense hot core -> standard ejecta -> dark cooling edges
      const distFromCenter = Math.sqrt(x*x + y*y + z*z);
      const normalizedDist = Math.min(1.0, distFromCenter / (maxRadius * 2.5));
      
      let finalC;
      if (normalizedDist < 0.15) {
        finalC = new THREE.Color(coreColor).lerp(new THREE.Color(ejectaColor), normalizedDist / 0.15);
      } else {
        finalC = new THREE.Color(ejectaColor).lerp(new THREE.Color("#1a0000"), (normalizedDist - 0.15) / 0.85);
      }
      
      col[i*3] = finalC.r;
      col[i*3+1] = finalC.g;
      col[i*3+2] = finalC.b;
      
      // Larger, softer particles for a seamless volumetric effect
      // Outer gas clouds expand and become larger/diffuse
      siz[i] = (Math.random() * 1.5 + 0.5) * (1.0 + normalizedDist * 2.5);
    }
    return { positions: pos, colors: col, sizes: siz };
  }, [particleCount, maxRadius, ejectaColor, coreColor]);

  useFrame((state, delta) => {
    if (pointsRef.current && isPlaying) {
      pointsRef.current.rotation.z += delta * timeScale * 0.05;
      pointsRef.current.rotation.x = Math.PI / 4; // tilt it so we can see the butterfly shape clearly
    }
    if (pointsRef.current) {
      // The eventProgress scales the entire nebula
      const expansion = Math.max(0.01, eventProgress * 2.5); // 0 to 2.5 scale
      pointsRef.current.scale.set(expansion, expansion, expansion);
    }
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.08, 32, 32]} />
        <meshBasicMaterial color={coreColor} />
      </mesh>
      {/* Searing core glare */}
      <pointLight intensity={2.0} distance={50} color={coreColor} />
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
          <bufferAttribute attach="attributes-size" count={sizes.length} array={sizes} itemSize={1} />
        </bufferGeometry>
        <pointsMaterial 
          map={particleTexture!}
          vertexColors 
          transparent 
          opacity={0.35} 
          blending={THREE.AdditiveBlending} 
          depthWrite={false} 
          sizeAttenuation 
          alphaTest={0.01}
        />
      </points>
    </group>
  );
}

export default function Supernova({ params, object }: Props) {
  const eventProgress = Number(params.eventProgress) || 0.0;
  const isBipolar = params.remnantType === "white_dwarf";

  return (
    <group>
      {isBipolar ? (
        <BipolarPlanetaryNebula params={params} eventProgress={eventProgress} />
      ) : (
        <SphericalSupernova eventProgress={eventProgress} />
      )}
    </group>
  );
}
