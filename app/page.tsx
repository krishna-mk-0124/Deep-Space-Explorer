"use client";

import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars, useTexture, Environment, CameraShake } from "@react-three/drei";
import { EffectComposer as EC, Bloom as BloomEffect, Vignette as VignetteEffect } from "@react-three/postprocessing";
const EffectComposerAny = EC as any;
const BloomAny = BloomEffect as any;
const VignetteAny = VignetteEffect as any;
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import * as THREE from "three";

// ─── Mouse tracker ───────────────────────────────────────────────────────────
const mouse = new THREE.Vector2(0, 0);
if (typeof window !== "undefined") {
  window.addEventListener("mousemove", (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
}

// ─── Shaders ─────────────────────────────────────────────────────────────────
const exhaustVertex = `
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (350.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = 1.0 - clamp(-mvPosition.z / 80.0, 0.0, 1.0);
  }
`;

const exhaustFragment = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, dist) * vAlpha * 0.95;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const starVertexShader = `
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = `
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float core = smoothstep(0.12, 0.0, dist);
    float halo = smoothstep(0.5, 0.1, dist) * 0.25;
    gl_FragColor = vec4(vColor, (core + halo) * 0.6); 
  }
`;

const earthAtmoVertex = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthAtmoFragment = `
  varying vec3 vNormal;
  void main() {
    // Soft Rayleigh approximation
    float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 0.6;
  }
`;

// Procedural Cloud Shader (Simplex Noise approximation)
const proceduralCloudFragment = `
  varying vec2 vUv;
  
  // Basic pseudo-random hash
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // Value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }

  // FBM
  float fbm(vec2 p) {
    float f = 0.0;
    float w = 0.5;
    for(int i = 0; i < 5; i++) {
      f += w * noise(p);
      p *= 2.0;
      w *= 0.5;
    }
    return f;
  }

  void main() {
    float n = fbm(vUv * 20.0);
    float c = smoothstep(0.4, 0.7, n);
    gl_FragColor = vec4(1.0, 1.0, 1.0, c * 0.6);
  }
`;

const cloudVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ─── Narration & Stages ──────────────────────────────────────────────────────
const NARRATIONS = [
  "April 24, 1990. Humanity prepares to open a new window to the cosmos. The Space Shuttle Discovery stands ready, carrying a payload that will change our understanding of the universe forever.",
  "Leaving the atmosphere behind, Discovery enters low Earth orbit at an altitude of 400 kilometers. Down below, the cradle of humanity glows — a fragile blue marble suspended in the infinite dark.",
  "The payload bay doors open. The Hubble Space Telescope, 13 meters of precision engineering, is lifted into the vacuum of space. Its golden solar arrays unfurl, catching the first light of the sun.",
  "As we peer into its primary mirror, we leave Earth behind. We are about to look deeper into space, and further back in time, than any human has ever looked before.",
  "Welcome to the Deep Space Explorer. The cosmos holds over two trillion galaxies — each containing hundreds of billions of stars. What you see before you is just one. The journey begins now."
];

const STAGE_TITLES = [
  "LIFTOFF",
  "ORBITAL ASCENT",
  "PAYLOAD DEPLOYMENT",
  "FIRST LIGHT",
  "THE COSMOS"
];

// ─── Constants for Scale (1 unit = 10 meters) ─────────────────────────────────
const SCALE_FACTOR = 0.1;
const EARTH_RADIUS = 10000.0; 
const LEO_ALTITUDE = 100.0;  
const ORBIT_Y = EARTH_RADIUS + LEO_ALTITUDE; 
const SHUTTLE_LENGTH = 3.72; 
const HUBBLE_LENGTH = 1.32;  

// ─── Narration System ────────────────────────────────────────────────────────
function useNarration(stage: number, muted: boolean) {
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [subtitleWords, setSubtitleWords] = useState<string[]>([]);
  const [wordIdx, setWordIdx] = useState(0);
  const wordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      if (wordTimerRef.current) clearInterval(wordTimerRef.current);

      const words = text.split(" ");
      setSubtitleWords(words);
      setWordIdx(0);

      if (!muted) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.82;
        utter.pitch = 0.9;
        utter.volume = 0.92;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            (v.name.toLowerCase().includes("david") ||
              v.name.toLowerCase().includes("daniel") ||
              v.name.toLowerCase().includes("james") ||
              v.name.toLowerCase().includes("google uk"))
        );
        if (preferred) utter.voice = preferred;
        utterRef.current = utter;
        window.speechSynthesis.speak(utter);
      }

      let idx = 0;
      wordTimerRef.current = setInterval(() => {
        idx++;
        setWordIdx(idx);
        if (idx >= words.length && wordTimerRef.current) {
          clearInterval(wordTimerRef.current);
        }
      }, 240);
    },
    [muted]
  );

  useEffect(() => {
    const t = setTimeout(() => speak(NARRATIONS[stage]), 600);
    return () => {
      clearTimeout(t);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      if (wordTimerRef.current) clearInterval(wordTimerRef.current);
    };
  }, [stage, speak]);

  return { subtitleWords, wordIdx };
}

// ─── Cinematic Camera ────────────────────────────────────────────────────────
function CinematicCamera({ stage, elapsed }: { stage: number; elapsed: number }) {
  useFrame((state, delta) => {
    const ease = 0.015;
    
    if (stage === 0) {
      // Exponential ascent curve for realistic acceleration
      const accel = Math.pow(elapsed * 0.8, 1.5);
      state.camera.position.lerp(new THREE.Vector3(0, ORBIT_Y - 5 + accel, 6), ease);
      state.camera.lookAt(0, ORBIT_Y + accel * 1.5, 0);
    } 
    else if (stage === 1) {
      state.camera.position.lerp(new THREE.Vector3(8, ORBIT_Y + 3, 12), ease);
      state.camera.lookAt(0, ORBIT_Y, 0);
    }
    else if (stage === 2) {
      state.camera.position.lerp(new THREE.Vector3(1.5, ORBIT_Y + 1.5, 3), ease);
      state.camera.lookAt(0, ORBIT_Y + 0.5, 0);
    }
    else if (stage === 3) {
      const diveProg = Math.min(elapsed / 5, 1);
      state.camera.position.lerp(new THREE.Vector3(0, ORBIT_Y + 1, 3 - diveProg * 2.8), ease * 2);
      state.camera.lookAt(0, ORBIT_Y + 1, 0);
    }
    else if (stage === 4) {
      const orbit = state.clock.getElapsedTime() * 0.04;
      state.camera.position.lerp(new THREE.Vector3(Math.sin(orbit) * 5, 1, 15), ease);
      state.camera.lookAt(0, 0, 0);
    }
  });

  return null;
}

// ─── Detailed Procedural Rigs ────────────────────────────────────────────────

// Helper: create a LatheGeometry from a 2D profile (array of [radius, y] points)
function createLatheProfile(points: [number, number][], segments = 48): THREE.LatheGeometry {
  const vec2Points = points.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(vec2Points, segments);
}

// Helper: create an ExtrudeGeometry wing from a 2D shape
function createWingShape(rootChord: number, tipChord: number, span: number, sweep: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(rootChord, 0);
  shape.lineTo(sweep + tipChord, span);
  shape.lineTo(sweep, span);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
}

function ProceduralShuttle({ doorsOpen }: { doorsOpen: number }) {
  // Shuttle total length ~3.72 units (37.2m at 1u=10m)
  // Y-axis is the long axis (nose up, engines down)
  const L = SHUTTLE_LENGTH;
  
  // Fuselage profile: [radius, y] — aerodynamic nose taper to cylindrical body to engine shroud
  const fuselageGeo = useMemo(() => createLatheProfile([
    [0.0,   L * 0.50],   // Nose tip
    [0.06,  L * 0.48],   // Nose start
    [0.15,  L * 0.44],   // Nose taper
    [0.28,  L * 0.38],   // Cockpit area
    [0.35,  L * 0.30],   // Forward fuselage
    [0.38,  L * 0.20],   // Mid fuselage
    [0.40,  L * 0.10],   // Payload bay start
    [0.40, -L * 0.25],   // Payload bay end
    [0.42, -L * 0.30],   // Aft fuselage start
    [0.44, -L * 0.40],   // Engine mount area
    [0.40, -L * 0.48],   // Engine shroud taper
    [0.38, -L * 0.50],   // Engine exit plane
  ], 32), [L]);

  // Delta wing
  const wingGeo = useMemo(() => createWingShape(1.2, 0.3, 1.3, 0.5), []);

  // Vertical stabilizer
  const stabGeo = useMemo(() => createWingShape(0.9, 0.25, 0.8, 0.45), []);

  // Engine bell profile
  const engineBellGeo = useMemo(() => createLatheProfile([
    [0.0,  0.08],
    [0.06, 0.06],
    [0.04, 0.0],
    [0.06, -0.04],
    [0.10, -0.12],
    [0.14, -0.20],
  ], 16), []);

  // OMS pod profile
  const omsGeo = useMemo(() => createLatheProfile([
    [0.0,  0.25],
    [0.06, 0.20],
    [0.10, 0.10],
    [0.10, -0.10],
    [0.08, -0.20],
    [0.05, -0.25],
  ], 12), []);

  const whiteMat = useMemo(() => ({ color: "#e8e8e8", metalness: 0.15, roughness: 0.35 }), []);
  const darkMat = useMemo(() => ({ color: "#1a1a1a", metalness: 0.3, roughness: 0.6 }), []);
  const tpsMat = useMemo(() => ({ color: "#111111", metalness: 0.1, roughness: 0.95 }), []);  // Thermal protection tiles

  return (
    <group>
      {/* Main fuselage body */}
      <mesh geometry={fuselageGeo}>
        <meshStandardMaterial {...whiteMat} />
      </mesh>

      {/* Cockpit windows */}
      <mesh position={[0.3, L * 0.36, 0]} rotation={[0, 0, -0.3]}>
        <planeGeometry args={[0.15, 0.08]} />
        <meshStandardMaterial color="#0a1520" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.28, L * 0.33, 0.12]} rotation={[0, 0.4, -0.3]}>
        <planeGeometry args={[0.12, 0.06]} />
        <meshStandardMaterial color="#0a1520" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Thermal Protection (underside belly - dark tiles) */}
      <mesh position={[0, -0.05, 0]} rotation={[Math.PI, 0, 0]}>
        <cylinderGeometry args={[0.41, 0.41, L * 0.7, 32, 1, false, 0, Math.PI]} />
        <meshStandardMaterial {...tpsMat} side={THREE.DoubleSide} />
      </mesh>

      {/* Left delta wing */}
      <group position={[-0.38, -L * 0.15, 0.0]} rotation={[Math.PI / 2, 0, Math.PI]}>
        <mesh geometry={wingGeo}>
          <meshStandardMaterial {...whiteMat} />
        </mesh>
      </group>
      {/* Right delta wing */}
      <group position={[0.38, -L * 0.15, 0.0]} rotation={[Math.PI / 2, Math.PI, 0]}>
        <mesh geometry={wingGeo}>
          <meshStandardMaterial {...whiteMat} />
        </mesh>
      </group>

      {/* Vertical stabilizer */}
      <group position={[0, -L * 0.15, -0.38]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={stabGeo}>
          <meshStandardMaterial {...whiteMat} />
        </mesh>
      </group>

      {/* Payload bay doors (animated open) */}
      <group position={[0, L * 0.05, 0]}>
        {/* Left door */}
        <group rotation={[0, 0, doorsOpen * Math.PI * 0.55]}>
          <mesh position={[0, 0, 0.2]}>
            <cylinderGeometry args={[0.395, 0.395, L * 0.4, 16, 1, false, 0, Math.PI * 0.45]} />
            <meshStandardMaterial color="#ddd" side={THREE.DoubleSide} metalness={0.2} roughness={0.3} />
          </mesh>
        </group>
        {/* Right door */}
        <group rotation={[0, 0, -doorsOpen * Math.PI * 0.55]}>
          <mesh position={[0, 0, 0.2]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.395, 0.395, L * 0.4, 16, 1, false, Math.PI * 0.55, Math.PI * 0.45]} />
            <meshStandardMaterial color="#ddd" side={THREE.DoubleSide} metalness={0.2} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* OMS Pods (left & right) */}
      <mesh geometry={omsGeo} position={[-0.3, -L * 0.35, -0.15]}>
        <meshStandardMaterial {...whiteMat} />
      </mesh>
      <mesh geometry={omsGeo} position={[0.3, -L * 0.35, -0.15]}>
        <meshStandardMaterial {...whiteMat} />
      </mesh>

      {/* Three SSME Engine Bells */}
      <mesh geometry={engineBellGeo} position={[0, -L * 0.50, 0.05]}>
        <meshStandardMaterial {...darkMat} />
      </mesh>
      <mesh geometry={engineBellGeo} position={[-0.18, -L * 0.48, -0.02]}>
        <meshStandardMaterial {...darkMat} />
      </mesh>
      <mesh geometry={engineBellGeo} position={[0.18, -L * 0.48, -0.02]}>
        <meshStandardMaterial {...darkMat} />
      </mesh>

      {/* Engine glow emissive ring */}
      <mesh position={[0, -L * 0.52, 0.05]}>
        <ringGeometry args={[0.02, 0.12, 16]} />
        <meshStandardMaterial color="#4488ff" emissive="#4488ff" emissiveIntensity={3} />
      </mesh>

      {/* USA text strip */}
      <mesh position={[0.41, L * 0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.6, 0.08]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

function ProceduralHubble({ arraysOpen }: { arraysOpen: number }) {
  const HL = HUBBLE_LENGTH;

  // Main telescope tube profile
  const tubeGeo = useMemo(() => createLatheProfile([
    [0.22, HL * 0.50],   // Forward aperture rim
    [0.215, HL * 0.48],  // Aperture baffle
    [0.20, HL * 0.46],   // Baffle inner step
    [0.20, HL * 0.40],   // Forward shell start
    [0.21, HL * 0.35],   // Forward shell
    [0.21, HL * 0.10],   // Main tube
    [0.21, -HL * 0.10],  // Mid tube
    [0.22, -HL * 0.15],  // Equipment section bump
    [0.22, -HL * 0.30],  // Aft shroud
    [0.21, -HL * 0.40],  // Aft shroud taper
    [0.19, -HL * 0.48],  // Aft bulkhead
    [0.17, -HL * 0.50],  // Aft end
  ], 32), [HL]);

  // Forward aperture door
  const apertureDoorGeo = useMemo(() => createLatheProfile([
    [0.0,  0.03],
    [0.18, 0.02],
    [0.20, 0.0],
    [0.18, -0.02],
    [0.0,  -0.03],
  ], 24), []);

  // High-gain antenna dish
  const antennaGeo = useMemo(() => createLatheProfile([
    [0.0,  0.04],
    [0.08, 0.02],
    [0.12, -0.01],
    [0.14, -0.04],
  ], 12), []);

  // Silver MLI (multi-layer insulation) material
  const mliMat = useMemo(() => ({
    color: "#c0c0c0",
    metalness: 0.95,
    roughness: 0.08,
  }), []);

  return (
    <group>
      {/* Main telescope tube */}
      <mesh geometry={tubeGeo}>
        <meshStandardMaterial {...mliMat} />
      </mesh>

      {/* Forward aperture door (slightly tilted open) */}
      <mesh geometry={apertureDoorGeo} position={[0, HL * 0.52, 0]} rotation={[0.15, 0, 0]}>
        <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Inner primary mirror (reflective) */}
      <mesh position={[0, -HL * 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 32]} />
        <meshStandardMaterial color="#e0e8ff" metalness={1.0} roughness={0.02} emissive="#223355" emissiveIntensity={0.3} />
      </mesh>

      {/* Equipment bay segments (raised rings) */}
      {[-0.15, -0.05, 0.05].map((yOff, i) => (
        <mesh key={i} position={[0, HL * yOff, 0]}>
          <torusGeometry args={[0.215, 0.008, 8, 32]} />
          <meshStandardMaterial color="#999" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

      {/* Aft shroud equipment boxes */}
      <mesh position={[0.18, -HL * 0.35, 0.1]}>
        <boxGeometry args={[0.06, 0.12, 0.06]} />
        <meshStandardMaterial color="#888" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[-0.18, -HL * 0.35, -0.1]}>
        <boxGeometry args={[0.06, 0.12, 0.06]} />
        <meshStandardMaterial color="#888" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* High-Gain Antenna (top) */}
      <group position={[0.15, HL * 0.30, 0.15]}>
        <mesh>
          <cylinderGeometry args={[0.008, 0.008, 0.2, 8]} />
          <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh geometry={antennaGeo} position={[0, 0.12, 0]}>
          <meshStandardMaterial color="#ddd" metalness={0.7} roughness={0.2} />
        </mesh>
      </group>

      {/* High-Gain Antenna (bottom) */}
      <group position={[-0.15, -HL * 0.30, -0.15]} rotation={[Math.PI, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.008, 0.008, 0.2, 8]} />
          <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh geometry={antennaGeo} position={[0, 0.12, 0]}>
          <meshStandardMaterial color="#ddd" metalness={0.7} roughness={0.2} />
        </mesh>
      </group>

      {/* Solar Array Masts + Panels — LEFT */}
      <group position={[-0.22, 0, 0]} scale={[arraysOpen, 1, 1]}>
        {/* Mast */}
        <mesh position={[-0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 0.3, 6]} />
          <meshStandardMaterial color="#888" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Panel frame */}
        <mesh position={[-0.55, 0, 0]}>
          <boxGeometry args={[0.7, 0.5, 0.012]} />
          <meshStandardMaterial color="#b8860b" metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Panel grid lines */}
        {[0, 1, 2, 3].map((j) => (
          <mesh key={`lg${j}`} position={[-0.55, -0.2 + j * 0.133, 0.007]}>
            <boxGeometry args={[0.7, 0.003, 0.003]} />
            <meshStandardMaterial color="#8B6914" />
          </mesh>
        ))}
        {[0, 1, 2, 3, 4].map((j) => (
          <mesh key={`vg${j}`} position={[-0.2 - j * 0.175, 0, 0.007]}>
            <boxGeometry args={[0.003, 0.5, 0.003]} />
            <meshStandardMaterial color="#8B6914" />
          </mesh>
        ))}
      </group>

      {/* Solar Array Masts + Panels — RIGHT */}
      <group position={[0.22, 0, 0]} scale={[arraysOpen, 1, 1]}>
        <mesh position={[0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 0.3, 6]} />
          <meshStandardMaterial color="#888" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0.55, 0, 0]}>
          <boxGeometry args={[0.7, 0.5, 0.012]} />
          <meshStandardMaterial color="#b8860b" metalness={0.85} roughness={0.15} />
        </mesh>
        {[0, 1, 2, 3].map((j) => (
          <mesh key={`rg${j}`} position={[0.55, -0.2 + j * 0.133, 0.007]}>
            <boxGeometry args={[0.7, 0.003, 0.003]} />
            <meshStandardMaterial color="#8B6914" />
          </mesh>
        ))}
        {[0, 1, 2, 3, 4].map((j) => (
          <mesh key={`rvg${j}`} position={[0.2 + j * 0.175, 0, 0.007]}>
            <boxGeometry args={[0.003, 0.5, 0.003]} />
            <meshStandardMaterial color="#8B6914" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Stage 0 & 1 & 2: Space Shuttle & Earth ──────────────────────────────────
function SpaceScene({ stage, active, elapsed }: { stage: number, active: boolean, elapsed: number }) {
  const shuttleRef = useRef<THREE.Group>(null);
  const hubbleRef = useRef<THREE.Group>(null);
  const exhaustRef = useRef<THREE.Points>(null);
  const earthGroupRef = useRef<THREE.Group>(null);


  
  const [earthColorMap] = useTexture(["/textures/earth_8k.jpg"]);

  // Animations
  const [doorsOpen, setDoorsOpen] = useState(0);
  const [arraysOpen, setArraysOpen] = useState(0);

  // Thrust particles
  const PARTICLE_COUNT = 3000;
  const [pos, sp, col, sz] = useMemo(() => {
    const p = new Float32Array(PARTICLE_COUNT * 3);
    const s = new Float32Array(PARTICLE_COUNT);
    const c = new Float32Array(PARTICLE_COUNT * 3);
    const z = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      p[i * 3] = (Math.random() - 0.5) * 0.8;
      p[i * 3 + 1] = -Math.random() * 8;
      p[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      s[i] = 4 + Math.random() * 8;
      
      const rand = Math.random();
      if(rand < 0.2) { c[i * 3] = 1; c[i * 3 + 1] = 0.9; c[i * 3 + 2] = 0.5; } 
      else if(rand < 0.5) { c[i * 3] = 1; c[i * 3 + 1] = 0.5; c[i * 3 + 2] = 0.1; } 
      else { c[i * 3] = 0.8; c[i * 3 + 1] = 0.8; c[i * 3 + 2] = 0.8; } 
      z[i] = 5 + Math.random() * 15;
    }
    return [p, s, c, z];
  }, []);

  useFrame((state, delta) => {
    if (earthGroupRef.current) earthGroupRef.current.rotation.y += delta * 0.001;

    // Liftoff physics
    if (shuttleRef.current) {
      if (stage === 0) {
        const accel = Math.pow(elapsed * 0.8, 1.5);
        shuttleRef.current.position.y = ORBIT_Y - 10 + accel;
        shuttleRef.current.rotation.x = Math.PI / 8;
      } else if (stage >= 1) {
        shuttleRef.current.position.lerp(new THREE.Vector3(0, ORBIT_Y, 0), 0.05);
        shuttleRef.current.rotation.x = Math.PI / 2;
      }
    }

    // Payload Deployment & Hubble Release
    if (stage >= 2) {
      setDoorsOpen((prev) => Math.min(prev + delta * 0.5, 1));
    }
    
    if (hubbleRef.current) {
      if (stage === 2 && doorsOpen > 0.8) {
        // Arm lifts Hubble
        hubbleRef.current.position.y += delta * 0.2;
        hubbleRef.current.rotation.y += delta * 0.05;
      } else if (stage === 3) {
        hubbleRef.current.position.lerp(new THREE.Vector3(0, ORBIT_Y + 1, 0), 0.05);
        const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
        hubbleRef.current.quaternion.slerp(targetQuat, 0.05);
        setArraysOpen((prev) => Math.min(prev + delta * 0.3, 1));
      }
    }

    if (exhaustRef.current && stage === 0) {
      const pa = exhaustRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        arr[i * 3 + 1] -= sp[i] * delta;
        if (arr[i * 3 + 1] < -12) {
          arr[i * 3 + 1] = 0; 
          arr[i * 3] = (Math.random() - 0.5) * 0.8;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
        }
      }
      pa.needsUpdate = true;
    }
  });

  if (!active) return null;

  return (
    <group>
      <ambientLight intensity={0.02} />
      <directionalLight position={[10000, 10000, 5000]} intensity={6.0} castShadow shadow-mapSize={[2048, 2048]} />

      <group ref={earthGroupRef} position={[0, 0, 0]} visible={stage >= 1 && stage <= 2}>
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
          <meshStandardMaterial map={earthColorMap} roughness={0.9} metalness={0.1} />
        </mesh>
        {/* Procedural Clouds */}
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS + 0.5, 128, 128]} />
          <shaderMaterial vertexShader={cloudVertex} fragmentShader={proceduralCloudFragment} transparent depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS + 2.0, 128, 128]} />
          <shaderMaterial vertexShader={earthAtmoVertex} fragmentShader={earthAtmoFragment} transparent blending={THREE.AdditiveBlending} side={THREE.BackSide} />
        </mesh>
      </group>

      <group ref={shuttleRef} position={[0, ORBIT_Y - 10, 0]} visible={stage <= 2}>
        <ProceduralShuttle doorsOpen={doorsOpen} />
        
        {stage === 0 && (
          <points ref={exhaustRef} position={[0, -SHUTTLE_LENGTH/2, 0]}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[pos, 3]} />
              <bufferAttribute attach="attributes-color" args={[col, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[sz, 1]} />
            </bufferGeometry>
            <shaderMaterial vertexShader={exhaustVertex} fragmentShader={exhaustFragment} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </points>
        )}
      </group>

      <group ref={hubbleRef} position={[0, ORBIT_Y, 0]} visible={stage >= 2 && stage <= 3}>
        <ProceduralHubble arraysOpen={arraysOpen} />
      </group>
    </group>
  );
}

// ─── Stage 4: The Grand Cosmos — Spiral Galaxy ────────────────────────────────
function StageGrandCosmos({ active }: { active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const N = 4000;

  const [pos, sp, ph, col, sz] = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const speeds = new Float32Array(N);
    const phases = new Float32Array(N);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const r = 0.5 + Math.pow(Math.random(), 1.5) * 18;
      const numArms = 2;
      const angle = ((i % numArms) * Math.PI * 2) / numArms + r * 0.6 + (Math.random() - 0.5) * 0.8;

      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.8 * (1 - r / 20);
      positions[i * 3 + 2] = Math.sin(angle) * r;

      speeds[i] = 0.05 + 0.5 / r;
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.8 + Math.random() * 1.5;

      if (r < 3) {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.6; colors[i * 3 + 2] = 0.4;
      } else if (r < 8) {
        colors[i * 3] = 0.3; colors[i * 3 + 1] = 0.4; colors[i * 3 + 2] = 0.7;
      } else {
        colors[i * 3] = 0.1; colors[i * 3 + 1] = 0.15; colors[i * 3 + 2] = 0.4;
      }
    }
    return [positions, speeds, phases, colors, sizes];
  }, []);

  useFrame((state, delta) => {
    if (!active || !pointsRef.current) return;
    const t = state.clock.getElapsedTime();
    const pa = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pa.array as Float32Array;

    for (let i = 0; i < N; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      let px = arr[ix], pz = arr[iz];
      const r = Math.max(0.1, Math.sqrt(px * px + pz * pz));
      const angle = Math.atan2(pz, px) + sp[i] * delta * 0.5;
      arr[ix] = Math.cos(angle) * r;
      arr[iy] = Math.sin(t * 0.2 + ph[i]) * 0.1 * (1 - r / 20) + mouse.y * 0.02;
      arr[iz] = Math.sin(angle) * r + mouse.x * 0.02;
    }
    pa.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[col, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sz, 1]} />
      </bufferGeometry>
      <shaderMaterial vertexShader={starVertexShader} fragmentShader={starFragmentShader} vertexColors transparent depthWrite={false} blending={THREE.NormalBlending} />
    </points>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  const [muted, setMuted] = useState(false);
  const [stageElapsed, setStageElapsed] = useState(0);
  const stageStartRef = useRef(Date.now());
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { subtitleWords, wordIdx } = useNarration(stage, muted);

  useEffect(() => {
    stageStartRef.current = Date.now();
    setStageElapsed(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => {
      setStageElapsed((Date.now() - stageStartRef.current) / 1000);
    }, 100);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [stage]);

  const advanceStage = useCallback(() => {
    if (stage >= 4 || transitioning) return;
    setTransitioning(true);
    setCanvasOpacity(0);
    setTimeout(() => {
      setStage((s) => s + 1);
      setCanvasOpacity(1);
      setTransitioning(false);
    }, 700);
  }, [stage, transitioning]);

  useEffect(() => {
    if (stage < 4) {
      const timer = setTimeout(advanceStage, 7000);
      return () => clearTimeout(timer);
    }
  }, [stage, advanceStage]);

  return (
    <main className="relative w-full h-screen overflow-hidden bg-[#000000]" onClick={() => { if (stage < 4 && !transitioning) advanceStage(); }}>
      <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.95) 100%)" }} />

      <motion.div className="absolute inset-0 z-20 bg-black pointer-events-none" animate={{ opacity: transitioning ? 1 : 0 }} transition={{ duration: 0.65, ease: "easeInOut" }} />

      <motion.div className="absolute inset-0" animate={{ opacity: canvasOpacity }} transition={{ duration: 0.7, ease: "easeOut" }}>
        <Canvas camera={{ position: [0, ORBIT_Y + 2, 12], fov: 55, near: 0.1, far: 50000 }} style={{ width: "100%", height: "100%" }} gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.5 }}>
          <color attach="background" args={["#000000"]} />
          <Environment preset="night" />
          <Stars radius={2500} depth={500} count={3500} factor={4} saturation={0} fade speed={0.5} />
          
          {/* Violent shaking during Stage 0 Liftoff */}
          {stage === 0 && <CameraShake maxYaw={0.02} maxPitch={0.02} maxRoll={0.02} yawFrequency={0.2} pitchFrequency={0.2} rollFrequency={0.2} />}
          
          {/* Cinematic Post-Processing */}
          <EffectComposerAny disableNormalPass>
            <BloomAny luminanceThreshold={0.5} mipmapBlur intensity={1.5} />
            <VignetteAny eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposerAny>

          <Suspense fallback={null}>
            <SpaceScene stage={stage} active={stage <= 3} elapsed={stageElapsed} />
            <StageGrandCosmos active={stage === 4} />
          </Suspense>
          <CinematicCamera stage={stage} elapsed={stageElapsed} />
        </Canvas>
      </motion.div>

      <button onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }} className="absolute top-6 right-6 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-white/40 hover:text-white hover:bg-white/10 transition-all text-xs tracking-widest font-mono uppercase">
        {muted ? "Sound On" : "Muted"}
      </button>

      {stage < 4 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <motion.div key={i} className="rounded-full bg-white" animate={{ width: i === stage ? 20 : 6, height: 6, opacity: i === stage ? 1 : 0.25 }} transition={{ duration: 0.4 }} />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {stage < 4 && (
          <motion.div key={`overlay-${stage}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }} className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-25">
            <motion.h2 initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.5, ease: "easeOut" }} className="text-2xl md:text-4xl font-thin text-white tracking-[0.35em] text-center select-none shadow-black drop-shadow-2xl">
              {STAGE_TITLES[stage]}
            </motion.h2>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {stage < 4 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-8 pointer-events-none">
            <div className="relative px-6 py-3 rounded-2xl backdrop-blur-xl bg-black/60 border border-white/10 shadow-2xl text-center">
              <p className="relative text-sm md:text-base font-light text-white/90 tracking-wide leading-relaxed">
                {subtitleWords.map((word, idx) => (
                  <motion.span key={idx} initial={{ opacity: 0 }} animate={{ opacity: idx < wordIdx ? 1 : 0.1 }} transition={{ duration: 0.2 }} className="inline-block mr-1">{word}</motion.span>
                ))}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stage === 4 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-25 px-6">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease: "easeOut" }} className="text-center mb-3 select-none">
              <h1 className="text-5xl md:text-8xl font-thin text-white tracking-[0.18em] leading-none drop-shadow-2xl">
                DEEP <span className="font-extrabold bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-500 bg-clip-text text-transparent">SPACE</span>
              </h1>
              <h1 className="text-5xl md:text-8xl font-thin text-white tracking-[0.18em] leading-none mt-1 drop-shadow-2xl">EXPLORER</h1>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.4, delay: 0.6 }} className="text-white/40 text-xs md:text-sm tracking-[0.25em] font-light mb-12 text-center drop-shadow-lg">
              102 Celestial Objects · Real-Time Gravitational Simulations · AI Voice Narrator
            </motion.p>
            <motion.button initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.0, delay: 0.8, type: "spring", stiffness: 100 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={(e) => { e.stopPropagation(); router.push("/explore"); }} className="pointer-events-auto relative group cursor-pointer">
              <span className="absolute -inset-2 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 opacity-20 blur-xl group-hover:opacity-40 transition-all duration-700" />
              <span className="relative flex items-center gap-3 px-14 py-4 rounded-full bg-black/90 backdrop-blur-2xl border border-white/20 text-white font-light tracking-[0.3em] text-sm uppercase shadow-[0_0_40px_rgba(0,0,0,0.8)] group-hover:border-white/40 transition-colors">
                Enter the Cosmos
              </span>
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
