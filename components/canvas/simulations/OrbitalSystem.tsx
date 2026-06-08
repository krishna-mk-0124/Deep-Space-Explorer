"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

const G_GRAVITY = 2.0;

// --- GLSL SHADERS ---

const starVertexShader = `
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

const starFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  float hash(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p.xyz, p.yzx + 19.19);
    return fract(p.x * p.y * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec3(100.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);
    
    vec3 coord = vPosition * 3.5 + vec3(0.0, 0.0, uTime * 0.3);
    float n = fbm(coord);
    
    vec3 baseColor = uColor;
    vec3 hotColor = vec3(1.0, 0.96, 0.88);
    vec3 coolColor = uColor * 0.35;
    
    vec3 color = mix(coolColor, baseColor, n * 1.5);
    color = mix(color, hotColor, pow(n, 3.6) * 1.6);
    color += fresnel * uColor * 1.4;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

const planetVertexShader = `
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

const planetFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uPlanetType; // 0 = Terrestrial, 1 = Gas, 2 = Lava, 3 = Ice
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  float hash(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p.xyz, p.yzx + 19.19);
    return fract(p.x * p.y * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.2 + vec3(50.0);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 norm = normalize(vNormal);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 4.0);
    
    vec3 color = vec3(0.0);
    vec3 atmColor = uColor;
    
    if (uPlanetType < 0.5) {
      // TERRESTRIAL (Procedural Alien Worlds)
      float land = fbm(vPosition * 3.8);
      vec3 oceanCol = uColor * 0.25; 
      vec3 landCol = uColor * 0.85;        
      vec3 desertCol = uColor * 1.5; 
      
      if (land > 0.48) {
        color = mix(landCol, desertCol, (land - 0.48) * 3.0);
      } else {
        color = oceanCol;
      }
      
      // Dynamic scrolling clouds
      float clouds = fbm(vPosition * 4.2 + vec3(uTime * 0.08, uTime * 0.04, 0.0));
      if (clouds > 0.52) {
        color = mix(color, vec3(0.95), (clouds - 0.52) * 1.8);
      }
      atmColor = uColor * 1.2;
      
    } else if (uPlanetType < 1.5) {
      // GAS GIANT (Banded winds + storm spots)
      float bandNoise = noise(vPosition * 1.8 + vec3(uTime * 0.1, 0.0, 0.0));
      float yCoord = vPosition.y * 5.2 + bandNoise * 0.7;
      float band = sin(yCoord * 3.14159);
      
      vec3 lightBand = uColor;
      vec3 darkBand = uColor * 0.48 + vec3(0.12, -0.04, -0.04);
      
      color = mix(darkBand, lightBand, (band + 1.0) * 0.5);
      
      // Swirling storm spot (Jupiter Great Red Spot)
      float distToSpot = length(vPosition - vec3(0.42, -0.18, 0.48));
      if (distToSpot < 0.26) {
        float spotVal = 1.0 - (distToSpot / 0.26);
        color = mix(color, vec3(0.68, 0.08, 0.04), spotVal * 0.85);
      }
      atmColor = uColor * 0.8;
      
    } else if (uPlanetType < 2.5) {
      // LAVA WORLD (cooling basalt crust + magma veins)
      float crust = fbm(vPosition * 5.2);
      vec3 crustCol = vec3(0.08, 0.07, 0.07);
      vec3 lavaCol = vec3(1.0, 0.22 + sin(uTime * 1.8) * 0.06, 0.0);
      
      if (crust > 0.45) {
        color = crustCol;
      } else {
        float lavaVal = (0.45 - crust) / 0.45;
        color = mix(crustCol, lavaCol, lavaVal * 1.7);
      }
      atmColor = vec3(1.0, 0.28, 0.0);
      
    } else {
      // ICE WORLD (glacial plates + thermal fractures)
      float ice = fbm(vPosition * 4.2);
      vec3 iceCol = vec3(0.72, 0.84, 0.94);
      vec3 crackCol = uColor * 0.35;
      
      if (ice > 0.5) {
        color = iceCol;
      } else {
        color = mix(crackCol, iceCol, ice * 2.0);
      }
      atmColor = vec3(0.55, 0.88, 1.0);
    }
    
    color += fresnel * atmColor * 1.3;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function getPlanetType(id: string): number {
  const lava = ["55-cancri-e", "corot-7b", "wasp-121b"];
  const gas = ["jupiter", "saturn", "hd-189733b", "kelt-9b", "wasp-121b"];
  const ice = ["gliese-667c", "pso-j318", "wolf-359", "pulsar-j0437", "pleiades", "oumuamua", "trappist-1h"];
  
  if (lava.some(x => id.includes(x))) return 2.0;
  if (gas.some(x => id.includes(x))) return 1.0;
  if (ice.some(x => id.includes(x))) return 3.0;
  return 0.0; // Terrestrial
}

export default function OrbitalSystem({ params, object }: Props) {
  const bodyRef = useRef<THREE.Group>(null);
  const bodyMesh = useRef<THREE.Mesh>(null);
  const trailGeometryRef = useRef<THREE.BufferGeometry>(null);

  // Retrieve global time scale and play state
  const { timeScale, isPlaying } = useExplorer();

  const centralBodyMass = Number(params.centralBodyMass) || 100;
  const orbitalDistance = Number(params.orbitalDistance) || 6;
  const bodyColor = (params.bodyColor && String(params.bodyColor).startsWith("#")) ? String(params.bodyColor) : "#4fc3f7";
  const centralBodyColor = (params.centralBodyColor && String(params.centralBodyColor).startsWith("#")) ? String(params.centralBodyColor) : "#FDB813";
  const centralBodyRadius = Number(params.centralBodyRadius) || 1.8;
  const ringCount = Number(params.ringCount) || 0;
  const eccentricity = Number(params.eccentricity) || 0.0;
  const precessionRate = Number(params.precessionRate) || 0.0;

  // Trail coordinate log
  const trailPositions = useRef<THREE.Vector3[]>([]);
  const prevParamsRef = useRef<string>("");

  // Shaders uniforms
  const starUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(centralBodyColor) }
  }), [centralBodyColor]);

  const planetUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(bodyColor) },
    uPlanetType: { value: getPlanetType(object.id) }
  }), [bodyColor, object.id]);

  // Keplerian physics angular motion (Kepler's Third Law: n^2 * a^3 = G * M)
  const a = orbitalDistance; // semi-major axis
  const e = eccentricity; // eccentricity
  const n = Math.sqrt((G_GRAVITY * centralBodyMass) / (a * a * a)); // Mean motion based on gravity!

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    // Detect parameter changes and flush trails to avoid linear streaks
    const currentParamsStr = JSON.stringify([centralBodyMass, orbitalDistance, eccentricity, precessionRate]);
    if (prevParamsRef.current !== currentParamsStr) {
      trailPositions.current = [];
      prevParamsRef.current = currentParamsStr;
      if (trailGeometryRef.current) {
        trailGeometryRef.current.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(0), 3)
        );
      }
    }

    // Accumulate time according to global multiplier
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    const elapsedTime = timeRef.current;

    starUniforms.uTime.value = elapsedTime;
    planetUniforms.uTime.value = elapsedTime;

    if (!bodyRef.current) return;

    // Kepler's Equation: M = E - e * sin(E)
    // Solve for E (Eccentric Anomaly) using Newton-Raphson
    let M = (elapsedTime * n) % (2 * Math.PI);
    let E = M;
    for (let i = 0; i < 5; i++) {
      E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }

    // Calculate position in orbital plane (X-Z)
    // Precession rate rotates the ellipse periapsis
    const precession = elapsedTime * precessionRate * 0.05;
    
    // Position in unrotated frame
    const x0 = a * (Math.cos(E) - e);
    const z0 = a * Math.sqrt(1 - e * e) * Math.sin(E);

    // Apply precession rotation (Argument of periapsis)
    const x = x0 * Math.cos(precession) - z0 * Math.sin(precession);
    const z = x0 * Math.sin(precession) + z0 * Math.cos(precession);

    const position = new THREE.Vector3(x, 0, z);

    // Update position
    bodyRef.current.position.copy(position);

    // Append trajectory to dynamic trail log
    if (isPlaying && (trailPositions.current.length === 0 || trailPositions.current[trailPositions.current.length - 1].distanceToSquared(position) > 0.02)) {
      trailPositions.current.push(position.clone());
      if (trailPositions.current.length > 400) {
        trailPositions.current.shift();
      }
    }

    // Update dynamic orbit line geometry
    if (trailGeometryRef.current && trailPositions.current.length > 1) {
      const points = trailPositions.current;
      const positionsArray = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        positionsArray[i * 3] = points[i].x;
        positionsArray[i * 3 + 1] = points[i].y;
        positionsArray[i * 3 + 2] = points[i].z;
      }
      trailGeometryRef.current.setAttribute(
        "position",
        new THREE.BufferAttribute(positionsArray, 3)
      );
      trailGeometryRef.current.attributes.position.needsUpdate = true;
      trailGeometryRef.current.computeBoundingSphere();
    }

    if (bodyMesh.current && isPlaying) {
      bodyMesh.current.rotation.y += delta * 0.45 * timeScale;
    }
  });

  return (
    <>
      {/* Central Star - Dynamic Procedural Plasma Shader */}
      <mesh>
        <sphereGeometry args={[centralBodyRadius, 32, 32]} />
        <shaderMaterial
          vertexShader={starVertexShader}
          fragmentShader={starFragmentShader}
          uniforms={starUniforms}
        />
        <pointLight intensity={3.5} distance={60} color={centralBodyColor} />
      </mesh>

      {/* Corona */}
      <mesh>
        <sphereGeometry args={[centralBodyRadius * 1.32, 16, 16]} />
        <meshBasicMaterial color={centralBodyColor} transparent opacity={0.065} side={THREE.BackSide} />
      </mesh>

      {/* Dynamic Precessing Orbit Trail */}
      <line>
        <bufferGeometry ref={trailGeometryRef} />
        <lineBasicMaterial color={bodyColor} transparent opacity={0.38} linewidth={1} />
      </line>

      {/* Orbiting Planet */}
      <group ref={bodyRef}>
        {/* Planet body - Dynamic class-based procedural shader */}
        <mesh ref={bodyMesh}>
          <sphereGeometry args={[0.55, 32, 32]} />
          <shaderMaterial
            vertexShader={planetVertexShader}
            fragmentShader={planetFragmentShader}
            uniforms={planetUniforms}
          />
        </mesh>

        {/* Planetary Rings (Saturn-style) */}
        {ringCount > 0 &&
          Array.from({ length: ringCount }).map((_, i) => (
            <mesh key={i} rotation={[Math.PI / 2.1, 0, 0]}>
              <torusGeometry args={[0.85 + i * 0.22, 0.022 - i * 0.002, 4, 80]} />
              <meshBasicMaterial color={bodyColor} transparent opacity={Math.max(0.05, 0.22 - i * 0.03)} />
            </mesh>
          ))}
      </group>
    </>
  );
}
