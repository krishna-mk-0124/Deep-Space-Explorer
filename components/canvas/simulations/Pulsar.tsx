"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

// --- GLSL VOLUMETRIC BEAM SHADERS ---

const beamVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

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
    vec3 normal = normalize(vNormal);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float edge = abs(dot(normal, viewDir));
    float core = pow(edge, 1.6);
    
    float flow = noise(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 12.0));
    float flicker = 0.8 + 0.2 * sin(uTime * 20.0 + vUv.y * 5.0);
    float distFade = pow(vUv.y, 2.0);
    
    float alpha = core * (0.3 + 0.7 * flow) * flicker * distFade;
    vec3 color = mix(uColor, vec3(1.0), core * 0.55);
    
    gl_FragColor = vec4(color, alpha * 0.75);
  }
`;

function RadiationJet({
  direction,
  color,
  beamLength,
  particleCount,
}: {
  direction: number;
  color: string;
  beamLength: number;
  particleCount: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const velRef = useRef<Float32Array | null>(null);

  const { timeScale, isPlaying } = useExplorer();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const t = Math.random();
      positions[i * 3] = (Math.random() - 0.5) * 0.15 * (1 - t);
      positions[i * 3 + 1] = t * beamLength * direction;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.15 * (1 - t);
      velocities[i] = 0.5 + Math.random() * 0.5;
    }
    velRef.current = velocities;
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [particleCount, beamLength, direction]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !velRef.current) return;
    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const vels = velRef.current;

    if (!isPlaying) return;

    for (let i = 0; i < particleCount; i++) {
      arr[i * 3 + 1] += delta * vels[i] * 3.5 * direction * timeScale;
      const dist = Math.abs(arr[i * 3 + 1]);
      if (dist > beamLength) {
        arr[i * 3] = (Math.random() - 0.5) * 0.08;
        arr[i * 3 + 1] = 0.02 * direction;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
      }
      const t = Math.min(dist / beamLength, 1);
      arr[i * 3] += (Math.random() - 0.5) * t * 0.012;
      arr[i * 3 + 2] += (Math.random() - 0.5) * t * 0.012;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.065}
        color={color}
        transparent
        opacity={0.85}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

export default function Pulsar({ params }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const neutronRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // Retrieve global time scale and play state
  const { timeScale, isPlaying } = useExplorer();

  const spinRate = Number(params.spinRate) || 30;
  const magneticFieldStrength = Number(params.magneticFieldStrength) || 7;
  const beamColor = (params.beamColor && String(params.beamColor).startsWith("#")) ? String(params.beamColor) : "#88CCFF";
  const surfaceColor = (params.surfaceColor && String(params.surfaceColor).startsWith("#")) ? String(params.surfaceColor) : "#AADDFF";
  const beamLength = Number(params.beamLength) || 6;
  const particleCount = Math.min(Number(params.particleCount) || 200, 400);
  const dipoleTilt = Number(params.dipoleTilt) || 30;

  const angularVelocity = (spinRate / 30) * 4.2;
  const tiltRad = (dipoleTilt * Math.PI) / 180;

  // Shader Uniforms
  const beamUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(beamColor) }
  }), [beamColor]);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    const elapsedTime = timeRef.current;
    beamUniforms.uTime.value = elapsedTime;

    if (groupRef.current && isPlaying) {
      groupRef.current.rotation.y += delta * angularVelocity * timeScale;
      // Precess spin axis slightly (physical nutation)
      groupRef.current.rotation.z = Math.sin(elapsedTime * 1.2) * 0.02;
    }
    if (neutronRef.current && isPlaying) {
      const mat = neutronRef.current.material as THREE.MeshStandardMaterial;
      // Scintillate core emissive pulse corresponding to spinRate
      mat.emissiveIntensity = 0.7 + Math.abs(Math.sin(elapsedTime * spinRate * 0.4)) * 0.9;
    }
  });

  return (
    <group>
      {/* Equatorial disk (stationary ambient plasma) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.35, 0.28, 6, 64]} />
        <meshBasicMaterial
          color={surfaceColor}
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Rotating Magnetosphere Group */}
      <group ref={groupRef}>
        {/* Neutron Star Sphere */}
        <mesh ref={neutronRef}>
          <sphereGeometry args={[0.7, 32, 32]} />
          <meshStandardMaterial
            color={surfaceColor}
            emissive={beamColor}
            emissiveIntensity={1.0}
            roughness={0.06}
            metalness={0.92}
          />
          <pointLight intensity={3.5} distance={12} color={beamColor} />
        </mesh>

        {/* Tilted Magnetic Dipole Axis System */}
        <group rotation={[0, 0, tiltRad]}>
          {/* Magnetic Field Lines */}
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            return (
              <mesh key={i} rotation={[0, angle, 0]}>
                <torusGeometry args={[1.6 + i * 0.25, 0.01, 4, 48, Math.PI]} />
                <meshBasicMaterial
                  color={beamColor}
                  transparent
                  opacity={0.12 * (magneticFieldStrength / 7)}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            );
          })}

          {/* Hot magnetic poles */}
          {[1, -1].map((dir) => (
            <mesh key={dir} position={[0, dir * 0.63, 0]}>
              <sphereGeometry args={[0.22, 16, 16]} />
              <meshBasicMaterial color={beamColor} blending={THREE.AdditiveBlending} />
            </mesh>
          ))}

          {/* Volumetric radiation cones */}
          {[1, -1].map((dir) => (
            <mesh
              key={dir}
              position={[0, dir * (beamLength * 0.5 + 0.6), 0]}
              rotation={[dir === 1 ? Math.PI : 0, 0, 0]}
            >
              <coneGeometry args={[beamLength * 0.12, beamLength, 16, 1, true]} />
              <shaderMaterial
                vertexShader={beamVertexShader}
                fragmentShader={beamFragmentShader}
                uniforms={beamUniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}

          {/* Relativistic particle ejections */}
          <RadiationJet direction={1} color={beamColor} beamLength={beamLength} particleCount={particleCount} />
          <RadiationJet direction={-1} color={beamColor} beamLength={beamLength} particleCount={particleCount} />
        </group>
      </group>
    </group>
  );
}
