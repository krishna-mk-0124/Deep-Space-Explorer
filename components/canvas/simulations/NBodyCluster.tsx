"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

// Spectral class colors based on the Hertzsprung-Russell (HR) temperature distribution
const SPECTRAL_COLORS = [
  "#88CCFF", // O/B class (Hot blue giants, 12%)
  "#E5F0FF", // A/F class (White stars, 18%)
  "#FFF4E8", // G class (Yellow dwarfs/suns, 25%)
  "#FFD2A1", // K class (Orange dwarfs, 25%)
  "#FF8866"  // M class (Red dwarfs/giants, 20%)
];

export default function NBodyCluster({ params, object }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const timeRef = useRef(0);

  // Retrieve global time scale and play state
  const { timeScale, isPlaying } = useExplorer();

  const starCount = Math.min(Number(params.starCount) || 300, 400);
  const clusterRadius = Number(params.clusterRadius) || 8;
  const coreConcentration = Number(params.coreConcentration) || 0.7;
  const starColorInner = (params.starColorInner && String(params.starColorInner).startsWith("#")) ? String(params.starColorInner) : "#FFFFCC";
  const starColorOuter = (params.starColorOuter && String(params.starColorOuter).startsWith("#")) ? String(params.starColorOuter) : "#FFAA44";
  const rotationSpeed = Number(params.rotationSpeed) || 0.08;
  const gravityStrength = Number(params.gravityStrength) || 0.5;

  // Cluster visual profiles — different clusters have distinct stellar populations
  const clusterProfile = useMemo(() => {
    const profiles: Record<string, { innerColor: string; outerColor: string; concentration: number; label: string }> = {
      "omega-centauri":  { innerColor: "#fff5cc", outerColor: "#ffaa66", concentration: 0.85, label: "globular" },
      "m13":             { innerColor: "#ffe8cc", outerColor: "#ff8844", concentration: 0.80, label: "globular" },
      "47-tucanae":      { innerColor: "#fff0dd", outerColor: "#ffcc88", concentration: 0.88, label: "globular" },
      "m15-cluster":     { innerColor: "#ffffff", outerColor: "#ffddaa", concentration: 0.95, label: "globular" },
      "pleiades":        { innerColor: "#cceeff", outerColor: "#8899ff", concentration: 0.35, label: "open" },
      "hyades":          { innerColor: "#ffddaa", outerColor: "#ff9955", concentration: 0.25, label: "open" },
      "butterfly-cluster": { innerColor: "#ddeeff", outerColor: "#6688ff", concentration: 0.30, label: "open" },
      "jewel-box":       { innerColor: "#aaccff", outerColor: "#ff4422", concentration: 0.40, label: "open" },
      "eagle-cluster":   { innerColor: "#88ddff", outerColor: "#44cc88", concentration: 0.45, label: "association" },
      "r136":            { innerColor: "#bbddff", outerColor: "#ff44aa", concentration: 0.65, label: "super" },
      "westerlund-1":    { innerColor: "#ff9966", outerColor: "#883322", concentration: 0.75, label: "super" },
      "ngc-1300":        { innerColor: "#ffeeaa", outerColor: "#ff8833", concentration: 0.60, label: "galaxy-nucleus" },
    };
    return profiles[object.id] ?? { innerColor: "#fff4e0", outerColor: "#ffaa55", concentration: 0.65, label: "generic" };
  }, [object.id]);

  // Determine texture path — every named cluster gets its own unique image
  const texturePath = useMemo(() => {
    const textureMap: Record<string, string> = {
      "omega-centauri":    "/assets/clusters/omega_centauri.png",
      "pleiades":          "/assets/clusters/pleiades.png",
      "m13":               "/assets/clusters/m13.png",
      "47-tucanae":        "/assets/clusters/47-tucanae.png",
      "m15-cluster":       "/assets/clusters/m15-cluster.png",
      "hyades":            "/assets/clusters/hyades.png",
      "butterfly-cluster": "/assets/clusters/butterfly-cluster.png",
      "jewel-box":         "/assets/clusters/jewel-box.png",
      "eagle-cluster":     "/assets/clusters/eagle-cluster.png",
      "r136":              "/assets/clusters/r136.png",
      "westerlund-1":      "/assets/clusters/westerlund-1.png",
      "ngc-1300":          "/assets/clusters/ngc-1300.png",
      "c-92":              "/assets/clusters/butterfly-cluster.png",
      "c-104":             "/assets/clusters/47-tucanae.png",
    };
    return textureMap[object.id] ?? "/assets/clusters/generic_cluster.png";
  }, [object.id]);

  const clusterTexture = useTexture(texturePath);

  const { positions, velocities, phases, baseColors } = useMemo(() => {
    const pos = new Float32Array(starCount * 3);
    const vel = new Float32Array(starCount * 3);
    const ph = new Float32Array(starCount);
    const cols = new Float32Array(starCount * 3);

    // Use profile-driven colors — always guaranteed to be valid hex strings
    const safeInner = (clusterProfile.innerColor && clusterProfile.innerColor.startsWith("#")) ? clusterProfile.innerColor
                    : (starColorInner && starColorInner.startsWith("#")) ? starColorInner : "#fff4e0";
    const safeOuter = (clusterProfile.outerColor && clusterProfile.outerColor.startsWith("#")) ? clusterProfile.outerColor
                    : (starColorOuter && starColorOuter.startsWith("#")) ? starColorOuter : "#ffaa55";
    const effectiveConc = (clusterProfile.concentration != null) ? clusterProfile.concentration : coreConcentration;

    const colorInner = new THREE.Color(safeInner);
    const colorOuter = new THREE.Color(safeOuter);

    // Open clusters are loose (low flattening), globulars are spherical, super clusters compact
    const flattenY = clusterProfile.label === "open" ? 0.55 : clusterProfile.label === "super" ? 0.7 : 0.45;

    // Super/young clusters have more hot blue stars; old globulars have red giants
    const blueHotFrac = clusterProfile.label === "super" ? 0.55
                      : clusterProfile.label === "association" ? 0.45
                      : clusterProfile.label === "open" ? 0.30
                      : 0.08; // globulars: mostly red/orange

    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const r = clusterRadius * Math.pow(u, 1 / (1 + effectiveConc * 2));
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;

      pos[i * 3]     = r * Math.sin(theta) * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi) * flattenY;
      pos[i * 3 + 2] = r * Math.cos(theta);

      const speed = rotationSpeed * (1 - r / clusterRadius) * 2;
      vel[i * 3]     = -pos[i * 3 + 2] * speed;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
      vel[i * 3 + 2] =  pos[i * 3]     * speed;

      ph[i] = Math.random() * Math.PI * 2;

      // HR-distribution adjusted per cluster type
      const rand = Math.random();
      let hexColor = SPECTRAL_COLORS[4]; // M class default
      if (rand < blueHotFrac) hexColor = SPECTRAL_COLORS[0];
      else if (rand < blueHotFrac + 0.20) hexColor = SPECTRAL_COLORS[1];
      else if (rand < blueHotFrac + 0.45) hexColor = SPECTRAL_COLORS[2];
      else if (rand < blueHotFrac + 0.70) hexColor = SPECTRAL_COLORS[3];

      const starColor = new THREE.Color(hexColor);
      const distRatio = Math.min(r / clusterRadius, 1);
      const blendColor = new THREE.Color().lerpColors(colorInner, colorOuter, distRatio);
      starColor.lerp(blendColor, 0.40);

      cols[i * 3]     = starColor.r;
      cols[i * 3 + 1] = starColor.g;
      cols[i * 3 + 2] = starColor.b;
    }
    return { positions: pos, velocities: vel, phases: ph, baseColors: cols };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starCount, clusterRadius, coreConcentration, rotationSpeed, starColorInner, starColorOuter, clusterProfile]);

  const posRef = useRef<Float32Array>(null!);
  const velRef = useRef<Float32Array>(null!);
  const colRef = useRef<Float32Array>(null!);

  useMemo(() => {
    posRef.current = new Float32Array(positions);
    velRef.current = new Float32Array(velocities);
    colRef.current = new Float32Array(baseColors);
  }, [positions, velocities, baseColors]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    if (!meshRef.current || !posRef.current) return;
    
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    const dt = Math.min(delta, 0.033) * timeScale * (isPlaying ? 1.0 : 0.0);
    
    const pos = posRef.current;
    const vel = velRef.current;
    const colors = colRef.current;

    const activeCount = pos.length / 3;
    const a2 = Math.max(0.08, 1.25 - coreConcentration * 1.1);

    for (let i = 0; i < activeCount; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;

      // Plummer Potential Gravitational Pull
      const dx = pos[ix], dy = pos[iy], dz = pos[iz];
      const r2 = dx * dx + dy * dy + dz * dz;
      const denom = r2 + a2;
      const f = (gravityStrength / (denom * Math.sqrt(denom))) * dt * 60;

      if (isPlaying) {
        vel[ix] -= dx * f;
        vel[iy] -= dy * f * 0.35; // flatter Z-axis containment
        vel[iz] -= dz * f;

        // Soft damping friction
        vel[ix] *= 0.9998;
        vel[iy] *= 0.9998;
        vel[iz] *= 0.9998;

        pos[ix] += vel[ix] * dt;
        pos[iy] += vel[iy] * dt;
        pos[iz] += vel[iz] * dt;

        // Soft reflection boundary at outer cluster shell limits
        const curR = Math.sqrt(pos[ix] ** 2 + pos[iy] ** 2 + pos[iz] ** 2);
        if (curR > clusterRadius * 1.65) {
          vel[ix] *= -0.4;
          vel[iy] *= -0.4;
          vel[iz] *= -0.4;
        }
      }

      dummy.position.set(pos[ix], pos[iy], pos[iz]);
      
      // Twinkling scale
      const scale = 0.038 + Math.sin(timeRef.current * 3.5 + phases[i]) * 0.012;
      dummy.scale.setScalar(Math.max(0.012, scale));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Scintillation brightness twinkling
      const twinkle = isPlaying ? (0.8 + Math.sin(timeRef.current * 4.5 + phases[i]) * 0.2) : 1.0;
      tempColor.setRGB(
        colors[ix] * twinkle,
        colors[iy] * twinkle,
        colors[iz] * twinkle
      );
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      {/* Hubble Photograph central core billboard */}
      <Billboard>
        <mesh>
          <planeGeometry args={[clusterRadius * 1.5, clusterRadius * 1.5]} />
          <meshBasicMaterial
            map={clusterTexture}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </Billboard>

      {/* Volumetric core glow fallback */}
      <mesh>
        <sphereGeometry args={[clusterRadius * 0.28, 16, 16]} />
        <meshBasicMaterial color={starColorInner} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Orbiting Stars */}
      <instancedMesh ref={meshRef} args={[null as any, null as any, starCount]} frustumCulled={false}>
        <sphereGeometry args={[1, 3, 3]} />
        <meshBasicMaterial vertexColors blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
