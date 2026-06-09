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
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.15, "rgba(255, 255, 255, 0.4)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

function BipolarPlanetaryNebula({ params, eventProgress }: { params: Record<string, number | string>, eventProgress: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { timeScale, isPlaying } = useExplorer();
  
  const particleTexture = useMemo(() => createSoftParticleTexture(), []);
  
  const maxRadius = Number(params.maxRadius) || 15;
  
  const { positions, colors, sizes } = useMemo(() => {
    // 150,000 particles for majestic dense volumetric clouds
    const count = 150000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    
    // NASA Bug Nebula signature colors
    const cWhite = new THREE.Color("#ffffff");
    const cBlue = new THREE.Color("#bbeeff");
    const cPink = new THREE.Color("#ff88cc");
    const cPurple = new THREE.Color("#aa66ff");
    const cOrange = new THREE.Color("#ff7722");
    const cRed = new THREE.Color("#cc1100");
    const cGreen = new THREE.Color("#66cc88");
    const cYellow = new THREE.Color("#ffcc44");
    
    const setParticle = (i: number, x: number, y: number, z: number, c: THREE.Color, s: number) => {
      pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
      siz[i] = s;
    };

    for (let i = 0; i < count; i++) {
      const typeRand = Math.random();
      const theta = Math.random() * Math.PI * 2;
      
      let x, y, z;
      let finalColor = new THREE.Color();
      let pSize = 0;
      
      const turbulence = () => (Math.random() - 0.5) * 0.25;
      
      if (typeRand < 0.15) {
        // 1) EQUATORIAL DUST TORUS (15%)
        // Dense, highly pinched waist with green/yellow/white colors
        const rad = (Math.random() * 0.25 + 0.05) * maxRadius;
        const height = (Math.random() - 0.5) * maxRadius * 0.15;
        
        x = rad * Math.cos(theta) * (1 + turbulence());
        y = rad * Math.sin(theta) * 0.5 * (1 + turbulence()); // squash Y heavily
        z = height;
        
        const rRatio = rad / (0.3 * maxRadius);
        if (rRatio < 0.3) finalColor.copy(cWhite).lerp(cYellow, rRatio / 0.3);
        else finalColor.copy(cYellow).lerp(cGreen, (rRatio - 0.3) / 0.7);
        
        pSize = Math.random() * 1.0 + 0.5;
        
      } else if (typeRand < 0.65) {
        // 2) INNER BRIGHT LOBES (50%)
        // The iconic pink/purple glowing "V" shape wings
        const zDir = Math.random() > 0.5 ? 1 : -1;
        const zRatio = Math.pow(Math.random(), 1.2); 
        const zVal = (zRatio * 1.5 + 0.05) * maxRadius;
        z = zVal * zDir;
        
        const baseR = (zVal / maxRadius) * maxRadius * 0.75;
        
        // Folds for volumetric sheets of gas
        const folds = Math.sin(theta * 4) * 0.4 + Math.cos(theta * 7) * 0.2;
        const thickness = Math.random() * 0.4 + 0.6;
        const rad = baseR * (1 + folds) * thickness;
        
        x = rad * Math.cos(theta) * (1 + turbulence());
        y = rad * Math.sin(theta) * 0.6 * (1 + turbulence());
        
        if (zRatio < 0.2) finalColor.copy(cWhite).lerp(cPink, zRatio / 0.2);
        else if (zRatio < 0.6) finalColor.copy(cPink).lerp(cPurple, (zRatio - 0.2) / 0.4);
        else finalColor.copy(cPurple).lerp(cRed, (zRatio - 0.6) / 0.4);
        
        pSize = Math.random() * 2.0 + 1.2;
        
      } else {
        // 3) OUTER WISPY TENDRILS (35%)
        // Explosive red/orange streaks extending far out
        const zDir = Math.random() > 0.5 ? 1 : -1;
        const zRatio = Math.pow(Math.random(), 0.8); 
        const zVal = (zRatio * 2.2 + 0.2) * maxRadius;
        z = zVal * zDir;
        
        const baseR = (zVal / maxRadius) * maxRadius * 1.0;
        
        // Extreme tendril shapes using high frequency noise
        const tendril = Math.pow(Math.abs(Math.sin(theta * 6)), 3);
        const rad = baseR * (0.3 + tendril * 2.0) * (Math.random() * 0.2 + 0.8);
        
        x = rad * Math.cos(theta) * (1 + turbulence()*2.0);
        y = rad * Math.sin(theta) * 0.4 * (1 + turbulence()*2.0);
        
        finalColor.copy(cOrange).lerp(cRed, zRatio);
        
        pSize = Math.random() * 3.5 + 2.0; 
      }
      
      setParticle(i, x, y, z, finalColor, pSize);
    }
    
    return { positions: pos, colors: col, sizes: siz };
  }, [maxRadius]);

  useFrame((state, delta) => {
    if (pointsRef.current && isPlaying) {
      pointsRef.current.rotation.z += delta * timeScale * 0.02;
    }
    if (pointsRef.current) {
      const expansion = Math.max(0.01, eventProgress * 3.0); 
      pointsRef.current.scale.set(expansion, expansion, expansion);
    }
  });

  return (
    <group rotation={[Math.PI / 5, Math.PI / 4, 0]}>
      <pointLight intensity={3.0} distance={maxRadius * 2} color="#ffffff" />
      <pointLight intensity={1.5} distance={maxRadius * 4} color="#ff88cc" />
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
          opacity={0.05} 
          blending={THREE.AdditiveBlending} 
          depthWrite={false} 
          sizeAttenuation 
          alphaTest={0.001}
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
