"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

// --- GLSL SHADERS ---

const lensVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lensFragmentShader = `
  uniform float uTime;
  uniform float uMass;
  varying vec3 vNormal;
  void main() {
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float edge = 1.0 - abs(dot(vNormal, viewDir));
    float rim = pow(edge, 2.5);
    vec3 rimColor = vec3(1.0, 0.48 + sin(uTime * 0.6) * 0.08, 0.05);
    float alpha = rim * uMass * 0.75;
    gl_FragColor = vec4(rimColor, alpha);
  }
`;

const diskVertexShader = `
  uniform float uLensingStrength;
  uniform float uBhRadius;
  varying vec3 vWorldPosition;
  varying vec3 vColor;
  attribute vec3 color;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    // Gravitational Lensing Deflection
    vec4 bhViewPos = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 relPos = mvPosition.xyz - bhViewPos.xyz;

    if (relPos.z < 0.0) {
      float d = length(relPos.xy);
      if (d > 0.05) {
        float shift = (uLensingStrength * uBhRadius * 1.1) / (d + 0.12);
        shift = min(shift, 4.0);
        mvPosition.xy += normalize(relPos.xy) * shift * smoothstep(0.0, -12.0, relPos.z);
      }
    }

    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_PointSize = 0.09 * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const diskFragmentShader = `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying vec3 vColor;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (length(coord) > 0.5) discard;
    
    // Relativistic Doppler Beaming
    vec3 pos = vWorldPosition;
    vec3 vel = normalize(vec3(-pos.z, 0.0, pos.x));
    vec3 obsDir = normalize(vec3(0.0, 0.35, 0.93));
    float cosTheta = dot(vel, obsDir);
    
    float beaming = pow(1.0 + 0.65 * cosTheta, 3.5);
    float dist = length(pos.xz);
    float temp = smoothstep(7.0, 1.8, dist);
    vec3 color = mix(vColor, vec3(1.0, 0.94, 0.84), temp * 0.75);
    
    color *= beaming;
    
    float alpha = (1.0 - length(coord) * 2.0) * 0.9;
    gl_FragColor = vec4(color, alpha);
  }
`;

const jetVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const jetFragmentShader = `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), f.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), f.x), f.y);
  }

  void main() {
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float edge = abs(dot(normalize(vNormal), viewDir));
    float core = pow(edge, 2.5);

    float flow = noise(vec2(vUv.x * 10.0, vUv.y * 3.0 - uTime * 28.0));
    float distFade = pow(vUv.y, 1.6);

    float alpha = core * (0.22 + 0.78 * flow) * distFade * uIntensity;
    vec3 color = mix(vec3(0.65, 0.75, 1.0), vec3(1.0), core * 0.45);

    gl_FragColor = vec4(color, alpha * 0.5);
  }
`;

function AccretionDisk({
  color,
  density,
  mass,
  bhRadius,
  lensStrength,
  isTDE,
}: {
  color: string;
  density: number;
  mass: number;
  bhRadius: number;
  lensStrength: number;
  isTDE: boolean;
}) {
  const particleCount = Math.min(Math.floor(density), 3500);
  const diskRef = useRef<THREE.Points>(null);
  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  const { timeScale, isPlaying } = useExplorer();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const baseColor = new THREE.Color(color);

    if (isTDE) {
      // TIDAL DISRUPTION EVENT (TDE)
      for (let i = 0; i < particleCount; i++) {
        const t = i / particleCount;
        if (i % 2 === 0) {
          const angle = t * Math.PI * 4.5;
          const radius = 8.5 * (1.0 - t * 0.76) + (Math.random() - 0.5) * 0.16;
          positions[i * 3] = Math.cos(angle) * radius;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 0.08 * radius;
          positions[i * 3 + 2] = Math.sin(angle) * radius;

          const brightness = 0.95 - t * 0.35;
          colors[i * 3] = Math.min(baseColor.r * brightness + t * 0.4, 1.0);
          colors[i * 3 + 1] = baseColor.g * brightness * 0.4 + t * 0.35;
          colors[i * 3 + 2] = baseColor.b * brightness * 0.05 + t * 0.15;
        } else {
          const angle = Math.PI * 0.75 + t * Math.PI * 0.7;
          const radius = 1.8 + t * 10.5 + (Math.random() - 0.5) * 0.28;
          positions[i * 3] = Math.cos(angle) * radius;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 0.12 * radius;
          positions[i * 3 + 2] = Math.sin(angle) * radius;

          const coolFactor = 1.0 - t * 0.7;
          colors[i * 3] = baseColor.r * coolFactor;
          colors[i * 3 + 1] = baseColor.g * coolFactor * 0.25;
          colors[i * 3 + 2] = baseColor.b * coolFactor * 0.4;
        }
      }
    } else {
      // STANDARD ACCRETION DISK
      for (let i = 0; i < particleCount; i++) {
        const t = i / particleCount;
        const radius = bhRadius * 1.35 + t * 5.0;
        const angle = Math.random() * Math.PI * 2;
        const spread = 0.12 * (1.0 - t * 0.5);

        positions[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.35;
        positions[i * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * spread;

        const brightness = 0.92 - t * 0.45;
        colors[i * 3] = Math.min(baseColor.r * brightness + t * 0.28, 1.0);
        colors[i * 3 + 1] = baseColor.g * brightness * 0.32;
        colors[i * 3 + 2] = baseColor.b * brightness * 0.05;
      }
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [particleCount, color, bhRadius, isTDE]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uLensingStrength: { value: lensStrength },
    uBhRadius: { value: bhRadius },
  }), [lensStrength, bhRadius]);

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    const elapsed = timeRef.current;

    if (diskRef.current && isPlaying) {
      const speed = isTDE ? 0.08 : 0.13;
      diskRef.current.rotation.y += delta * speed * (mass / 80) * timeScale;
    }
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = elapsed;
    }
  });

  return (
    <points ref={diskRef} geometry={geometry}>
      <shaderMaterial
        ref={shaderRef}
        vertexShader={diskVertexShader}
        fragmentShader={diskFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function PhotonRing({ mass }: { mass: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { timeScale, isPlaying } = useExplorer();

  useFrame((_, delta) => {
    if (meshRef.current && isPlaying) {
      meshRef.current.rotation.y += delta * 0.045 * timeScale;
      meshRef.current.rotation.z += delta * 0.02 * timeScale;
    }
  });
  const r = 1.5 * Math.pow(mass / 80, 0.4);
  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[r * 1.55, 0.03, 6, 96]} />
      <meshBasicMaterial
        color="#ff8c00"
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function ParticleBlackHole({ params, object }: Props) {
  const lensShaderRef = useRef<THREE.ShaderMaterial>(null);
  const jetShaderRef = useRef<THREE.ShaderMaterial>(null);

  const { timeScale, isPlaying } = useExplorer();

  const mass = Number(params.mass) || 80;
  let accretionDiskDensity = Number(params.accretionDiskDensity) || 2000;
  let accretionDiskColor = (params.accretionDiskColor && String(params.accretionDiskColor).startsWith("#")) ? String(params.accretionDiskColor) : "#FF6B35";
  
  if (object.name.includes("Sagittarius A*")) {
    accretionDiskColor = "#FF5511"; 
  } else if (object.name.includes("M87")) {
    accretionDiskColor = "#FF2200"; 
  } else if (object.name.includes("TON 618") || object.name.includes("Quasar")) {
    accretionDiskColor = "#66BBFF"; 
    accretionDiskDensity *= 2.5; 
  } else if (object.name.includes("Phoenix A*")) {
    accretionDiskColor = "#E0D0FF"; 
    accretionDiskDensity *= 3.0;
  }

  const lensStrength = Number(params.lensStrength) || 0.8;
  const jetIntensity = Number(params.jetIntensity) || 0.6;
  const isTDE = params.tidalDisruption === 1;

  const bhRadius = 1.5 * Math.pow(mass / 80, 0.4);
  const jetHeight = 8.5 * jetIntensity;
  const jetRadius = 0.18 * jetIntensity;

  const jetUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: jetIntensity },
  }), [jetIntensity]);

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    const elapsed = timeRef.current;

    if (lensShaderRef.current) {
      lensShaderRef.current.uniforms.uTime.value = elapsed;
      lensShaderRef.current.uniforms.uMass.value = lensStrength;
    }
    if (jetShaderRef.current) {
      jetShaderRef.current.uniforms.uTime.value = elapsed;
    }
  });

  return (
    <group>
      {/* Relativistic Volumetric jets */}
      {jetIntensity > 0.05 &&
        [1, -1].map((dir) => (
          <mesh
            key={dir}
            position={[0, dir * (bhRadius * 0.95 + jetHeight / 2), 0]}
            rotation={[dir === 1 ? Math.PI : 0, 0, 0]}
          >
            <coneGeometry args={[jetRadius, jetHeight, 16, 1, true]} />
            <shaderMaterial
              ref={dir === 1 ? jetShaderRef : null}
              vertexShader={jetVertexShader}
              fragmentShader={jetFragmentShader}
              uniforms={jetUniforms}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

      {/* Lensing rim glow shader */}
      <mesh>
        <sphereGeometry args={[bhRadius * 1.04, 48, 48]} />
        <shaderMaterial
          ref={lensShaderRef}
          vertexShader={lensVertexShader}
          fragmentShader={lensFragmentShader}
          uniforms={{ uTime: { value: 0 }, uMass: { value: lensStrength } }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Solid black event horizon */}
      <mesh>
        <sphereGeometry args={[bhRadius, 32, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Photon sphere ring */}
      <PhotonRing mass={mass} />

      {/* Accretion disk with Gravitational Lensing & Doppler Beaming */}
      <AccretionDisk
        color={accretionDiskColor}
        density={accretionDiskDensity}
        mass={mass}
        bhRadius={bhRadius}
        lensStrength={lensStrength}
        isTDE={isTDE}
      />

      {/* Inner corona glow */}
      <mesh>
        <sphereGeometry args={[bhRadius * 1.9, 24, 24]} />
        <meshBasicMaterial
          color={accretionDiskColor}
          transparent
          opacity={0.05}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
