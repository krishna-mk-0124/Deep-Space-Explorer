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

// --- GLSL PLASMA SHADERS ---

const plasmaVertexShader = `
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

const plasmaFragmentShader = `
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
    
    vec3 coord = vPosition * 4.0 + vec3(0.0, 0.0, uTime * 0.4);
    float n = fbm(coord);
    
    vec3 baseColor = uColor;
    vec3 hotColor = vec3(1.0, 0.95, 0.9);
    vec3 coolColor = uColor * 0.4;
    
    vec3 color = mix(coolColor, baseColor, n * 1.4);
    color = mix(color, hotColor, pow(n, 3.5) * 1.5);
    color += fresnel * uColor * 1.3;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Kepler equation solver: M = E - e*sin(E)
function solveKepler(M: number, e: number): number {
  let E = M;
  const tolerance = 1e-6;
  const maxIterations = 50;
  for (let i = 0; i < maxIterations; i++) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < tolerance) break;
  }
  return E;
}

// 3D Orbital Projection elements (inclination & periapsis)
function projectTo3D(
  x0: number,
  z0: number,
  inclination: number,
  omega: number
): THREE.Vector3 {
  // Rotate by argument of periapsis omega in plane
  const x1 = x0 * Math.cos(omega) - z0 * Math.sin(omega);
  const z1 = x0 * Math.sin(omega) + z0 * Math.cos(omega);
  
  // Tilt by inclination around X-axis
  const x = x1;
  const y = z1 * Math.sin(inclination);
  const z = z1 * Math.cos(inclination);
  
  return new THREE.Vector3(x, y, z);
}

export default function BinarySystem({ params }: Props) {
  const timeRef = useRef(0);
  const decayRef = useRef(1.0); // GW orbital decay

  // Retrieve global time scale and play state
  const { timeScale, isPlaying } = useExplorer();

  const star1Mass = Number(params.star1Mass) || 110;
  const star2Mass = Number(params.star2Mass) || 90;
  const star1Color = (params.star1Color && String(params.star1Color).startsWith("#")) ? String(params.star1Color) : "#FFD700";
  const star2Color = (params.star2Color && String(params.star2Color).startsWith("#")) ? String(params.star2Color) : "#FFA500";
  const star1Radius = Number(params.star1Radius) || 1.2;
  const star2Radius = Number(params.star2Radius) || 0.9;
  const separation = Number(params.separation) || 8;
  const eccentricity = Number(params.eccentricity) || 0.0;

  // 3D parameters
  const inclination = ((Number(params.inclination) || 0) * Math.PI) / 180;
  const periapsisAngle = ((Number(params.periapsisAngle) || 0) * Math.PI) / 180;
  const isMassTransfer = params.massTransfer === 1;
  const isMergerEvent = params.mergerEvent === 1;

  const star1Ref = useRef<THREE.Mesh>(null);
  const star2Ref = useRef<THREE.Mesh>(null);
  const gasBridgeRef = useRef<THREE.Points>(null);

  // Shader Uniforms
  const star1Uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(star1Color) }
  }), [star1Color]);

  const star2Uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(star2Color) }
  }), [star2Color]);

  // Mass transfer Gas stream setup
  const gasParticleCount = 400;
  const gasGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(gasParticleCount * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);

  useFrame((state, delta) => {
    // Merger gravitational wave decay simulation
    if (isMergerEvent) {
      if (isPlaying) {
        decayRef.current -= delta * 0.06 * timeScale; // spiral in over ~16 seconds scaled
      }
      if (decayRef.current < -0.15) {
        decayRef.current = 1.0; // reset kilonova cycle
      }
    } else {
      decayRef.current = 1.0;
    }

    const currentDecay = Math.max(0.08, decayRef.current);
    const activeSeparation = separation * currentDecay;

    // Barycenter distances scaled according to mass ratio
    const totalMass = star1Mass + star2Mass;
    const r1 = activeSeparation * (star2Mass / totalMass);
    const r2 = activeSeparation * (star1Mass / totalMass);

    // Calculate angular motion physically (Kepler's Third Law)
    const n = Math.sqrt((G_GRAVITY * totalMass) / (activeSeparation * activeSeparation * activeSeparation));
    
    // Speed up orbit as separation decreases (merger)
    const mergerSpeedFactor = isMergerEvent ? 1.0 / Math.pow(currentDecay, 1.5) : 1.0;
    
    if (isPlaying) {
      timeRef.current += delta * n * timeScale * mergerSpeedFactor;
    }
    const elapsedTime = timeRef.current;

    star1Uniforms.uTime.value = elapsedTime;
    star2Uniforms.uTime.value = elapsedTime;

    const M = elapsedTime; // Mean Anomaly

    // Solve Kepler's equation for elliptic orbital plane motion
    const E = solveKepler(M, eccentricity);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const semiminorRatio = Math.sqrt(1 - eccentricity * eccentricity);

    // Compute barycentric coordinates in orbital plane
    const planeX = cosE - eccentricity;
    const planeZ = semiminorRatio * sinE;

    // Star positions projected into 3D using inclination and periapsis angle
    const s1Pos = projectTo3D(r1 * planeX, r1 * planeZ, inclination, periapsisAngle);
    const s2Pos = projectTo3D(-r2 * planeX, -r2 * planeZ, inclination, periapsisAngle);

    const showStars = decayRef.current > 0.08;

    if (star1Ref.current) {
      star1Ref.current.position.copy(s1Pos);
      star1Ref.current.visible = showStars;
      
      // Roche-Lobe Tidal Deformation
      if (showStars) {
        star1Ref.current.lookAt(s2Pos);
        const stretchVal = Math.min(0.35, Math.pow(star1Radius / activeSeparation, 3.0) * (star2Mass / star1Mass) * 2.2);
        star1Ref.current.scale.set(1.0 - stretchVal * 0.5, 1.0 - stretchVal * 0.5, 1.0 + stretchVal * 1.5);
      }
    }

    if (star2Ref.current) {
      star2Ref.current.position.copy(s2Pos);
      star2Ref.current.visible = showStars;

      if (showStars) {
        star2Ref.current.lookAt(s1Pos);
        const stretchVal = Math.min(0.35, Math.pow(star2Radius / activeSeparation, 3.0) * (star1Mass / star2Mass) * 2.2);
        star2Ref.current.scale.set(1.0 - stretchVal * 0.5, 1.0 - stretchVal * 0.5, 1.0 + stretchVal * 1.5);
      }
    }

    // Active gas bridge mass transfer particles
    if (isMassTransfer && showStars && gasBridgeRef.current) {
      const posAttr = gasBridgeRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      // Orbit Normal
      const orbitNormal = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), inclination);
      const tangent = new THREE.Vector3().subVectors(s2Pos, s1Pos).cross(orbitNormal).normalize();

      for (let i = 0; i < gasParticleCount; i++) {
        // Stream flows from Star 1 (donor) to Star 2 (accretor)
        const flowTime = (i / gasParticleCount + elapsedRealTimeFlow(elapsedTime)) % 1.0;
        
        // Linear interpolation
        const pt = new THREE.Vector3().lerpVectors(s1Pos, s2Pos, flowTime);
        
        // Coriolis deflection curves the gas stream sideways in the orbital plane
        const deflection = 0.85 * Math.sin(flowTime * Math.PI) * (n / 2.0);
        pt.addScaledVector(tangent, deflection);

        // Dispersive turbulence
        pt.x += (Math.random() - 0.5) * 0.08;
        pt.y += (Math.random() - 0.5) * 0.08;
        pt.z += (Math.random() - 0.5) * 0.08;

        arr[i * 3] = pt.x;
        arr[i * 3 + 1] = pt.y;
        arr[i * 3 + 2] = pt.z;
      }
      posAttr.needsUpdate = true;
    }
  });

  // Flow offset helper
  function elapsedRealTimeFlow(t: number) {
    return t * 0.75;
  }

  // Pre-calculate precessing rings scale factor
  const ringScaleZ = Math.sqrt(1 - eccentricity * eccentricity);

  return (
    <group>
      {/* Barycenter indicator */}
      <mesh>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
      </mesh>

      {/* Star 1 Orbital path ring */}
      <group rotation={[inclination, 0, 0]}>
        <mesh 
          position={[-separation * (star2Mass / (star1Mass + star2Mass)) * eccentricity, 0, 0]} 
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1, 1, ringScaleZ]}
        >
          <torusGeometry args={[separation * (star2Mass / (star1Mass + star2Mass)), 0.015, 4, 80]} />
          <meshBasicMaterial color={star1Color} transparent opacity={0.06} />
        </mesh>
      </group>

      {/* Star 1 */}
      <mesh ref={star1Ref}>
        <sphereGeometry args={[star1Radius, 32, 32]} />
        <shaderMaterial
          vertexShader={plasmaVertexShader}
          fragmentShader={plasmaFragmentShader}
          uniforms={star1Uniforms}
        />
        <pointLight intensity={3} distance={35} color={star1Color} />
        <mesh>
          <sphereGeometry args={[star1Radius * 1.3, 16, 16]} />
          <meshBasicMaterial color={star1Color} transparent opacity={0.055} side={THREE.BackSide} />
        </mesh>
      </mesh>

      {/* Star 2 */}
      <mesh ref={star2Ref}>
        <sphereGeometry args={[star2Radius, 32, 32]} />
        <shaderMaterial
          vertexShader={plasmaVertexShader}
          fragmentShader={plasmaFragmentShader}
          uniforms={star2Uniforms}
        />
        <pointLight intensity={2} distance={30} color={star2Color} />
        <mesh>
          <sphereGeometry args={[star2Radius * 1.3, 16, 16]} />
          <meshBasicMaterial color={star2Color} transparent opacity={0.055} side={THREE.BackSide} />
        </mesh>
      </mesh>

      {/* Mass Transfer Gas Bridge particles */}
      {isMassTransfer && decayRef.current > 0.08 && (
        <points ref={gasBridgeRef} geometry={gasGeometry}>
          <pointsMaterial
            size={0.075}
            color="#ff5500"
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      )}

      {/* Kilonova Merger Blast fireball */}
      {isMergerEvent && decayRef.current <= 0.08 && (
        <mesh>
          <sphereGeometry args={[Math.max(0.1, (0.08 - decayRef.current) * 60.0), 32, 32]} />
          <meshBasicMaterial
            color="#fff6dd"
            transparent
            opacity={Math.max(0, (decayRef.current + 0.15) / 0.23)}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
          <pointLight intensity={Math.max(0, (decayRef.current + 0.15) / 0.23) * 6} distance={60} color="#ffd700" />
        </mesh>
      )}
    </group>
  );
}
