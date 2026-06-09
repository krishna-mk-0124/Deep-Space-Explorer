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
  varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lensFragmentShader = `
  uniform float uTime;
  uniform float uMass;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    // Because normal is in view space (multiplied by normalMatrix), viewDir in view space is just (0,0,1).
    // Wait, if normal is in view space, we should compare to vec3(0,0,1).
    // Let's use view space normal correctly:
    float edge = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    float rim = pow(edge, 3.5);
    vec3 rimColor = vec3(1.0, 0.48 + sin(uTime * 2.0) * 0.1, 0.05);
    float alpha = rim * uMass * 0.9;
    gl_FragColor = vec4(rimColor, alpha);
  }
`;

const diskVertexShader = `
  uniform float uLensingStrength;
  uniform float uBhRadius;
  uniform float uTime;
  uniform float uIsTDE;
  uniform float uMass;

  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying vec3 vColor;
  varying float vCosTheta;
  attribute vec3 color;
  attribute float aSize;

  void main() {
    vColor = color;
    
    // Animate position (Keplerian rotation)
    vec3 pos = position;
    float r = length(pos.xz);
    
    // Relativistic velocity profile: Extreme gravity shear near the event horizon
    float distRatio = uBhRadius / max(r, uBhRadius * 1.01);
    float speed = (0.15 + pow(distRatio, 3.0) * 2.5) * sqrt(uMass / 80.0);
    if (uIsTDE > 0.5) {
      speed *= 0.4;
    }
    
    // Match Cinematic Shader visual flow: Left -> Right (Clockwise)
    float angle = -uTime * speed;
    float c = cos(angle);
    float s = sin(angle);
    
    pos.x = position.x * c - position.z * s;
    pos.z = position.x * s + position.z * c;
    
    // Smooth fluid stream turbulence
    float stream = sin(angle * 6.0 + r * 8.0 - uTime * 4.0);
    pos.y += stream * 0.08 * distRatio;

    vLocalPosition = pos;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Gravitational Lensing (Ray-bending approximation for particles behind BH)
    vec4 bhViewPos = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 relPos = mvPosition.xyz - bhViewPos.xyz;

    if (relPos.z < 0.0) { 
      // Smoothly split the back of the disk into top and bottom arches based on their actual vertical position
      float flip = pos.y >= 0.0 ? 1.0 : -1.0;
      
      // Bias the screen-space direction heavily vertically to form the continuous halo arches
      vec2 screenDir = vec2(relPos.x * 0.3, (abs(relPos.z) * 1.4 + abs(relPos.y)) * flip);
      float d = length(screenDir);
      
      if (d > 0.01) {
        screenDir = normalize(screenDir);
        float er = uBhRadius * 1.8 * uLensingStrength; // Einstein ring radius
        float shift = (er * er) / (d + uBhRadius * 0.2);
        shift = min(shift, uBhRadius * 3.5); 
        mvPosition.xy += screenDir * shift * smoothstep(0.0, uBhRadius * 2.5, -relPos.z);
      }
    }

    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    
    // Doppler beaming calculation
    // Match Cinematic Shader Doppler: Right side bright (Counter-Clockwise velocity vector)
    vec3 localVel = normalize(vec3(-pos.z, 0.0, pos.x));
    vec3 worldVel = normalize((modelMatrix * vec4(localVel, 0.0)).xyz);
    vec3 obsDir = normalize(cameraPosition - vWorldPosition);
    vCosTheta = dot(worldVel, obsDir);
    
    // Dynamic point size
    float flicker = 1.0 + 0.4 * sin(uTime * 12.0 + r * 20.0);
    gl_PointSize = aSize * flicker * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const diskFragmentShader = `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying vec3 vColor;
  varying float vCosTheta;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distToCenter = length(coord);
    if (distToCenter > 0.5) discard;
    
    // Gaussian-like soft particle falloff for gaseous feel
    float alpha = exp(-pow(distToCenter * 3.5, 2.0));

    // Intense Relativistic Doppler Beaming (matches Cinematic contrast)
    float beaming = pow((1.0 + 0.7 * vCosTheta) / (1.0 - 0.65 * vCosTheta), 1.6);
    
    // Extreme temperature gradient near the event horizon
    float r = length(vLocalPosition.xz);
    float temp = smoothstep(9.0, 1.2, r);
    vec3 hotColor = mix(vColor, vec3(1.0, 0.98, 0.9), temp * 0.95);
    
    // Add micro-flickering to the streams
    vec3 color = hotColor * beaming * (1.0 + 0.4 * sin(uTime * 25.0 + r * 20.0));
    
    gl_FragColor = vec4(color, alpha * 0.85);
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
    vec3 viewDir = vec3(0.0, 0.0, 1.0); // vNormal is in view space
    float edge = abs(dot(normalize(vNormal), viewDir));
    float core = pow(edge, 3.0);

    float flow = noise(vec2(vUv.x * 15.0, vUv.y * 4.0 - uTime * 35.0));
    float distFade = pow(vUv.y, 1.2);

    float alpha = core * (0.15 + 0.85 * flow) * distFade * uIntensity;
    vec3 color = mix(vec3(0.65, 0.75, 1.0), vec3(1.0, 0.9, 0.8), core * 0.6);

    gl_FragColor = vec4(color, alpha * 0.8);
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
  const particleCount = Math.min(Math.floor(density * 15), 50000);
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
        // Use a severe exponential curve to heavily pack particles against the inner event horizon
        const t = Math.pow(i / particleCount, 2.5); 
        const radius = bhRadius * 1.02 + t * (bhRadius * 4.5);
        const angle = Math.random() * Math.PI * 2;
        // Inner particles have almost no spread to form a razor-sharp bright ring; outer particles spread into a thick cloud
        const spread = 0.25 * t * bhRadius;

        positions[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
        positions[i * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * spread;

        // Inner edge is blindingly hot, outer edge is cool and dark
        const brightness = 1.0 - Math.pow(t, 0.7);
        colors[i * 3] = Math.min(baseColor.r * brightness + (1.0 - t) * 0.5, 1.0);
        colors[i * 3 + 1] = baseColor.g * brightness * 0.45;
        colors[i * 3 + 2] = baseColor.b * brightness * 0.05;
      }
    }

    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
        sizes[i] = 0.05 + Math.random() * 0.12;
    }
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [particleCount, color, bhRadius, isTDE]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uLensingStrength: { value: lensStrength },
    uBhRadius: { value: bhRadius },
    uIsTDE: { value: isTDE ? 1.0 : 0.0 },
    uMass: { value: mass },
  }), [lensStrength, bhRadius, isTDE, mass]);

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    const elapsed = timeRef.current;

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

  // Scale up the particle geometry to match the Apparent Shadow Size (2.6x) of the Cinematic GR shader
  const visualScale = 2.6; 
  const baseMassRadius = 1.5 * Math.pow(mass / 80, 0.4);
  const bhRadius = baseMassRadius * visualScale;
  
  const jetHeight = 8.5 * jetIntensity * visualScale;
  const jetRadius = 0.18 * jetIntensity * visualScale;

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
        <sphereGeometry args={[bhRadius * 1.3, 32, 32]} />
        <meshBasicMaterial
          color={accretionDiskColor}
          transparent
          opacity={0.015}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
