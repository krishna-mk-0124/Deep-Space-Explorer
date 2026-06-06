"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
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

// ─── Enhanced GLSL Shaders with per-particle size support ────────────────────
const particleVertexShader = `
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (120.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    // Distance-based alpha fade
    vAlpha = 1.0 - clamp(-mvPosition.z / 80.0, 0.0, 1.0);
  }
`;

const particleFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    // Soft radial glow falloff
    float alpha = smoothstep(0.5, 0.0, dist) * vAlpha * 0.95;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// Star shader — brighter with a subtle cross-spike diffraction
const starVertexShader = `
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (90.0 / -mvPosition.z);
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
    float halo = smoothstep(0.5, 0.1, dist) * 0.4;
    // Subtle diffraction spikes
    float spike = max(
      smoothstep(0.48, 0.0, abs(coord.x)) * smoothstep(0.12, 0.0, abs(coord.y)),
      smoothstep(0.48, 0.0, abs(coord.y)) * smoothstep(0.12, 0.0, abs(coord.x))
    ) * 0.3;
    float alpha = core + halo + spike;
    gl_FragColor = vec4(vColor, alpha * 0.98);
  }
`;

// ─── Narration texts ─────────────────────────────────────────────────────────
const NARRATIONS = [
  "Thirteen point eight billion years ago, everything — all matter, all energy, all of space and time itself — erupted from a single point of infinite density. This was the beginning of everything.",
  "From this chaos, gravity sculpted the first cosmic architecture. Vast clouds of hydrogen and helium collapsed and stretched into filaments — the cosmic web — the nurseries from which galaxies and stars would one day emerge.",
  "Inside those dense nebula cores, gravity compressed gas until hydrogen atoms began to fuse. A star ignited. Powerful stellar winds tore through the surrounding cloud, carving out a glowing protoplanetary disk — the raw material for worlds.",
  "Over millions of years, that disk condensed into planets. Each one unique: scorched by proximity, or frozen in the dark, or bathed in liquid oceans. A solar system awakened, its worlds locked in the eternal dance of gravity.",
  "Welcome to the Deep Space Explorer. The cosmos holds over two trillion galaxies — each containing hundreds of billions of stars. What you see before you is just one. The journey begins now.",
];

const STAGE_TITLES = [
  "THE BIG BANG",
  "COSMIC WEB",
  "STELLAR IGNITION",
  "WORLDS AWAKENING",
  "THE COSMOS",
];

// ─── Narration System ────────────────────────────────────────────────────────
function useNarration(stage: number, muted: boolean, started: boolean, onComplete: () => void) {
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [subtitleWords, setSubtitleWords] = useState<string[]>([]);
  const [wordIdx, setWordIdx] = useState(0);
  const wordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      if (wordTimerRef.current) clearInterval(wordTimerRef.current);

      if (!text) return; // For stage -1

      const words = text.split(" ");
      setSubtitleWords(words);
      setWordIdx(0);

      let textDone = false;

      if (!muted) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.82;
        utter.pitch = 0.9;
        utter.volume = 0.92;

        // Try to pick a deep, calm voice
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

        utter.onend = () => {
          setTimeout(onComplete, 800);
        };
        utter.onerror = () => {
          setTimeout(onComplete, 800);
        };

        utterRef.current = utter;
        window.speechSynthesis.speak(utter);
      }

      // Animate subtitle words
      const wordTime = muted ? 350 : 250;
      let idx = 0;
      wordTimerRef.current = setInterval(() => {
        idx++;
        setWordIdx(idx);
        if (idx >= words.length && wordTimerRef.current) {
          clearInterval(wordTimerRef.current);
          if (muted) {
            setTimeout(onComplete, 1200);
          }
        }
      }, wordTime);
    },
    [muted, onComplete]
  );

  useEffect(() => {
    if (!started || stage < 0 || stage >= NARRATIONS.length) return;
    // Small delay so stage transition animation has time to start
    const t = setTimeout(() => speak(NARRATIONS[stage]), 600);
    return () => {
      clearTimeout(t);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      if (wordTimerRef.current) clearInterval(wordTimerRef.current);
    };
  }, [stage, speak, started]);

  return { subtitleWords, wordIdx };
}

// ─── Stage 0: Quantum Singularity — The Big Bang ─────────────────────────────
function StageBigBang({ active, opacity }: { active: boolean; opacity: number }) {
  const innerRef = useRef<THREE.Points>(null);
  const outerRef = useRef<THREE.Points>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const innerCount = 3000;
  const outerCount = 2000;

  const [innerPos, innerVel, innerCol, innerSizes] = useMemo(() => {
    const pos = new Float32Array(innerCount * 3);
    const vel = new Float32Array(innerCount * 3);
    const col = new Float32Array(innerCount * 3);
    const sz = new Float32Array(innerCount);
    for (let i = 0; i < innerCount; i++) {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      const speed = 8 + Math.random() * 18;
      vel[i * 3] = Math.sin(theta) * Math.cos(phi) * speed;
      vel[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * speed;
      vel[i * 3 + 2] = Math.cos(theta) * speed;
      pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;
      const t = Math.random();
      if (t < 0.4) {
        col[i * 3] = 1; col[i * 3 + 1] = 1; col[i * 3 + 2] = 1; // white
      } else if (t < 0.75) {
        col[i * 3] = 1; col[i * 3 + 1] = 0.7 + Math.random() * 0.2; col[i * 3 + 2] = 0.1; // orange
      } else {
        col[i * 3] = 0.9; col[i * 3 + 1] = 0.1; col[i * 3 + 2] = 0.05; // red
      }
      sz[i] = 3 + Math.random() * 4;
    }
    return [pos, vel, col, sz];
  }, []);

  const [outerPos, outerVel, outerCol, outerSizes] = useMemo(() => {
    const pos = new Float32Array(outerCount * 3);
    const vel = new Float32Array(outerCount * 3);
    const col = new Float32Array(outerCount * 3);
    const sz = new Float32Array(outerCount);
    for (let i = 0; i < outerCount; i++) {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      vel[i * 3] = Math.sin(theta) * Math.cos(phi) * speed;
      vel[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * speed;
      vel[i * 3 + 2] = Math.cos(theta) * speed;
      pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;
      const t = Math.random();
      if (t < 0.5) {
        col[i * 3] = 0.3 + Math.random() * 0.2; col[i * 3 + 1] = 0.5 + Math.random() * 0.3; col[i * 3 + 2] = 1; // blue
      } else {
        col[i * 3] = 0.5 + Math.random() * 0.2; col[i * 3 + 1] = 0.1; col[i * 3 + 2] = 0.8 + Math.random() * 0.2; // purple
      }
      sz[i] = 2 + Math.random() * 3;
    }
    return [pos, vel, col, sz];
  }, []);

  const innerUniforms = useMemo(() => ({ uOpacity: { value: 1 } }), []);
  const outerUniforms = useMemo(() => ({ uOpacity: { value: 1 } }), []);

  useFrame((state) => {
    if (!active) return;
    const t = state.clock.getElapsedTime();

    // Exponential camera shake decay - significantly reduced
    if (t < 2.2) {
      const shake = 0.03 * Math.exp(-t * 1.8);
      state.camera.position.x += (Math.random() - 0.5) * shake;
      state.camera.position.y += (Math.random() - 0.5) * shake;
    }

    // Flash - much softer and shorter
    if (flashRef.current) {
      if (t < 1.0) {
        const p = Math.min(1, t / 0.4);
        const fade = t > 0.4 ? Math.max(0, 1 - (t - 0.4) / 0.6) : p;
        flashRef.current.scale.setScalar(1 + t * 8);
        (flashRef.current.material as THREE.MeshBasicMaterial).opacity = fade * 0.35;
      } else {
        (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // Light decay
    if (lightRef.current) {
      lightRef.current.intensity = Math.max(0, 35 * Math.exp(-t * 2.5));
    }

    // Inner shell — fast hot particles
    if (innerRef.current) {
      const pa = innerRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < innerCount; i++) {
        arr[i * 3] = innerVel[i * 3] * t;
        arr[i * 3 + 1] = innerVel[i * 3 + 1] * t;
        arr[i * 3 + 2] = innerVel[i * 3 + 2] * t;
      }
      pa.needsUpdate = true;
    }

    // Outer shell — slower cooling particles, start with slight delay
    if (outerRef.current && t > 0.3) {
      const dt = t - 0.3;
      const pa = outerRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < outerCount; i++) {
        arr[i * 3] = outerVel[i * 3] * dt;
        arr[i * 3 + 1] = outerVel[i * 3 + 1] * dt;
        arr[i * 3 + 2] = outerVel[i * 3 + 2] * dt;
      }
      pa.needsUpdate = true;
    }
  });

  if (!active) return null;

  return (
    <group>
      {/* Flash sphere */}
      <mesh ref={flashRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Inner hot shell */}
      <points ref={innerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[innerPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[innerCol, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[innerSizes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={particleVertexShader}
          fragmentShader={particleFragmentShader}
          vertexColors transparent depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Outer cool shell */}
      <points ref={outerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[outerPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[outerCol, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[outerSizes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={particleVertexShader}
          fragmentShader={particleFragmentShader}
          vertexColors transparent depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <pointLight ref={lightRef} intensity={80} color="#ffffff" distance={200} />
    </group>
  );
}

// ─── Stage 1: Cosmic Web — Filamentary Nebula ─────────────────────────────────
function StageCosmicWeb({ active }: { active: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const N = 6000;

  const [pos, sp, ph, col, sz] = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const speeds = new Float32Array(N);
    const phases = new Float32Array(N);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // Arrange in 3 filament strands + cloud
      const strand = i % 3;
      const t = (i / N) * 1.0;
      const r = 1.5 + Math.pow(Math.random(), 0.6) * 19;
      const baseAngle = (strand * Math.PI * 2) / 3 + r * 0.38 + (Math.random() - 0.5) * 2.2;

      // Filament structure — particles cluster along arm paths
      const filamentBias = Math.random() < 0.7 ? 1 : 0; // 70% in filaments
      const scatter = filamentBias * 0.4 + (1 - filamentBias) * 3.5;
      const angle = baseAngle + (Math.random() - 0.5) * scatter;

      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 3.5 * (1 - r / 22);
      positions[i * 3 + 2] = Math.sin(angle) * r;

      speeds[i] = 0.08 + 1.2 / r;
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 1.5 + Math.random() * 3.5;

      // Color: deep blue dust, faint purple, subtle white stars
      const rand = Math.random();
      if (rand < 0.5) {
        colors[i * 3] = 0.05; colors[i * 3 + 1] = 0.15; colors[i * 3 + 2] = 0.35; // deep blue
      } else if (rand < 0.8) {
        colors[i * 3] = 0.15; colors[i * 3 + 1] = 0.05; colors[i * 3 + 2] = 0.25; // faint purple
      } else if (rand < 0.95) {
        colors[i * 3] = 0.5; colors[i * 3 + 1] = 0.6; colors[i * 3 + 2] = 0.8; // dim white
      } else {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.4; colors[i * 3 + 2] = 0.1; // sparse warm dust
      }
    }
    return [positions, speeds, phases, colors, sizes];
  }, []);

  // Spring velocity for mouse attraction
  const velRef = useRef(new Float32Array(N * 3));

  useFrame((state, delta) => {
    if (!active || !pointsRef.current) return;
    const t = state.clock.getElapsedTime();
    const pa = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pa.array as Float32Array;
    const vel = velRef.current;

    const mx = mouse.x * 14;
    const mz = mouse.y * 14;

    for (let i = 0; i < N; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      let px = arr[ix], py = arr[iy], pz = arr[iz];
      const r = Math.max(0.1, Math.sqrt(px * px + pz * pz));

      // Orbital rotation
      const angle = Math.atan2(pz, px) + sp[i] * delta * 1.6;
      let tx = Math.cos(angle) * r;
      let tz = Math.sin(angle) * r;

      // Mouse spring attraction
      const dx = tx - mx, dz = tz - mz;
      const distM = Math.sqrt(dx * dx + dz * dz);
      if (distM < 7) {
        const pull = (7 - distM) / 7 * 0.06;
        vel[ix] += (mx - tx) * pull;
        vel[iz] += (mz - tz) * pull;
      }
      vel[ix] *= 0.88;
      vel[iz] *= 0.88;

      arr[ix] = tx + vel[ix];
      arr[iy] = Math.sin(t * 1.1 + ph[i]) * 0.55 * (1 - r / 22);
      arr[iz] = tz + vel[iz];
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
      <shaderMaterial
        vertexShader={particleVertexShader}
        fragmentShader={particleFragmentShader}
        vertexColors transparent depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─── Stage 2: Stellar Crucible — Star Ignition ────────────────────────────────
function StageStellarIgnition({ active }: { active: boolean }) {
  const starCoreRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const halosRef = useRef<THREE.Group>(null);
  const diskRef = useRef<THREE.Points>(null);
  const northJetRef = useRef<THREE.Points>(null);
  const southJetRef = useRef<THREE.Points>(null);
  const flashRef = useRef<THREE.Mesh>(null);

  const DISK = 3000;
  const JET = 600;

  const [diskPos, diskSp, diskR, diskCol, diskSz] = useMemo(() => {
    const p = new Float32Array(DISK * 3);
    const s = new Float32Array(DISK);
    const r = new Float32Array(DISK);
    const c = new Float32Array(DISK * 3);
    const sz = new Float32Array(DISK);
    for (let i = 0; i < DISK; i++) {
      const rad = 1.2 + Math.pow(Math.random(), 1.4) * 7;
      const th = Math.random() * Math.PI * 2;
      p[i * 3] = Math.cos(th) * rad;
      p[i * 3 + 1] = (Math.random() - 0.5) * 0.22;
      p[i * 3 + 2] = Math.sin(th) * rad;
      s[i] = 2.8 / Math.sqrt(rad); // Keplerian
      r[i] = rad;
      const nr = (rad - 1.2) / 7;
      if (nr < 0.25) {
        c[i * 3] = 0.8; c[i * 3 + 1] = 0.6; c[i * 3 + 2] = 0.4; // warm inner dust
      } else if (nr < 0.6) {
        c[i * 3] = 0.4; c[i * 3 + 1] = 0.2; c[i * 3 + 2] = 0.1; // cool mid dust
      } else {
        c[i * 3] = 0.1; c[i * 3 + 1] = 0.05; c[i * 3 + 2] = 0.05; // dark outer dust
      }
      sz[i] = 0.5 + Math.random() * 1.2;
    }
    return [p, s, r, c, sz];
  }, []);

  const [jetNPos, jetNSp, jetNPh, jetNCol, jetNSz] = useMemo(() => {
    const p = new Float32Array(JET * 3);
    const s = new Float32Array(JET);
    const ph = new Float32Array(JET);
    const c = new Float32Array(JET * 3);
    const sz = new Float32Array(JET);
    for (let i = 0; i < JET; i++) {
      s[i] = 5 + Math.random() * 8;
      ph[i] = Math.random() * Math.PI * 2;
      p[i * 3] = p[i * 3 + 1] = p[i * 3 + 2] = 0;
      c[i * 3] = 0.3; c[i * 3 + 1] = 0.5; c[i * 3 + 2] = 0.9;
      sz[i] = 0.8 + Math.random() * 1.2;
    }
    return [p, s, ph, c, sz];
  }, []);

  const [jetSPos, jetSSp, jetSPh, jetSCol, jetSSz] = useMemo(() => {
    const p = new Float32Array(JET * 3);
    const s = new Float32Array(JET);
    const ph = new Float32Array(JET);
    const c = new Float32Array(JET * 3);
    const sz = new Float32Array(JET);
    for (let i = 0; i < JET; i++) {
      s[i] = -(5 + Math.random() * 8);
      ph[i] = Math.random() * Math.PI * 2;
      p[i * 3] = p[i * 3 + 1] = p[i * 3 + 2] = 0;
      c[i * 3] = 0.3; c[i * 3 + 1] = 0.5; c[i * 3 + 2] = 0.9;
      sz[i] = 0.8 + Math.random() * 1.2;
    }
    return [p, s, ph, c, sz];
  }, []);

  useFrame((state, delta) => {
    if (!active) return;
    const t = state.clock.getElapsedTime();

    // Star core pulse
    if (starCoreRef.current) {
      const s = 1 + Math.sin(t * 8) * 0.04 + Math.sin(t * 13) * 0.02;
      starCoreRef.current.scale.setScalar(s);
    }

    // Corona breathe
    if (coronaRef.current) {
      coronaRef.current.rotation.y += delta * 0.12;
      coronaRef.current.rotation.z += delta * 0.07;
      const s = 1 + Math.sin(t * 5) * 0.06;
      coronaRef.current.scale.setScalar(s);
    }

    // Halo rings drift
    if (halosRef.current) {
      halosRef.current.rotation.y += delta * 0.05;
      halosRef.current.rotation.x += delta * 0.025;
    }

    // Ignition flash - softer
    if (flashRef.current) {
      if (t < 1.6) {
        const p = t / 1.6;
        flashRef.current.scale.setScalar(1 + p * 12);
        (flashRef.current.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.4;
      } else {
        (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // Protoplanetary disk — Keplerian spin
    if (diskRef.current) {
      const pa = diskRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < DISK; i++) {
        const ix = i * 3, iz = i * 3 + 2;
        const angle = t * diskSp[i] * 2.8 + diskR[i] * 0.35;
        const cur = Math.max(0.6, diskR[i]);
        arr[ix] = Math.cos(angle) * cur;
        arr[iz] = Math.sin(angle) * cur;
      }
      pa.needsUpdate = true;
    }

    // North jet — helical stream
    const updateJet = (
      ref: React.RefObject<THREE.Points | null>,
      sp: Float32Array,
      ph: Float32Array,
      col: Float32Array,
      count: number
    ) => {
      if (!ref.current) return;
      const pa = ref.current.geometry.attributes.position as THREE.BufferAttribute;
      const ca = ref.current.geometry.attributes.color as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      const carr = ca.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
        let y = sp[i] * t;
        const maxLen = 12;
        if (Math.abs(y) > maxLen) y = y % maxLen;
        const helixR = 0.06 + 0.04 * Math.abs(y);
        const rot = y * 4 + t * 16 + ph[i];
        arr[ix] = Math.cos(rot) * helixR;
        arr[iy] = y;
        arr[iz] = Math.sin(rot) * helixR;
        const fade = Math.max(0, 1 - Math.abs(y) / maxLen);
        carr[ix] = col[ix] * fade;
        carr[iy] = col[iy] * fade;
        carr[iz] = col[iz] * fade;
      }
      pa.needsUpdate = true;
      ca.needsUpdate = true;
    };

    updateJet(northJetRef, jetNSp, jetNPh, jetNCol, JET);
    updateJet(southJetRef, jetSSp, jetSPh, jetSCol, JET);
  });

  if (!active) return null;

  return (
    <group>
      {/* Ignition flash */}
      <mesh ref={flashRef}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#fff4e0" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Star — layered: soft core + faint corona */}
      <mesh ref={starCoreRef}>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshBasicMaterial color="#ffeedd" />
      </mesh>
      <mesh ref={coronaRef}>
        <sphereGeometry args={[1.1, 32, 32]} />
        <meshBasicMaterial color="#cc4400" transparent opacity={0.15} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial color="#aa2200" transparent opacity={0.04} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Magnetic corona loops */}
      <group ref={halosRef}>
        {[0, Math.PI / 3, Math.PI * 2 / 3, Math.PI].map((rot, idx) => (
          <mesh key={idx} rotation={[rot * 0.7, rot, rot * 0.4]}>
            <torusGeometry args={[1.3, 0.015, 6, 60, Math.PI * 0.9]} />
            <meshBasicMaterial color="#cc5500" transparent opacity={0.15} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>

      {/* Protoplanetary disk */}
      <points ref={diskRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[diskPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[diskCol, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[diskSz, 1]} />
        </bufferGeometry>
        <shaderMaterial vertexShader={particleVertexShader} fragmentShader={particleFragmentShader}
          vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      {/* North bipolar jet */}
      <points ref={northJetRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[jetNPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[jetNCol, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[jetNSz, 1]} />
        </bufferGeometry>
        <shaderMaterial vertexShader={particleVertexShader} fragmentShader={particleFragmentShader}
          vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      {/* South jet */}
      <points ref={southJetRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[jetSPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[jetSCol, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[jetSSz, 1]} />
        </bufferGeometry>
        <shaderMaterial vertexShader={particleVertexShader} fragmentShader={particleFragmentShader}
          vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      <pointLight intensity={8} color="#ffcc88" distance={60} />
    </group>
  );
}

// ─── Stage 3: Worlds Awakening — Solar System ────────────────────────────────
function StageWorldsAwakening({ active }: { active: boolean }) {
  const sunRef = useRef<THREE.Mesh>(null);
  const p1Ref = useRef<THREE.Group>(null); // Lava world
  const p2Ref = useRef<THREE.Group>(null); // Ocean world
  const p3Ref = useRef<THREE.Group>(null); // Gas giant
  const p4Ref = useRef<THREE.Group>(null); // Ice world
  const cometRef = useRef<THREE.Group>(null);
  const asteroidRef = useRef<THREE.Points>(null);

  const ASTEROIDS = 2500;
  const [aPos, aCol, aSz] = useMemo(() => {
    const p = new Float32Array(ASTEROIDS * 3);
    const c = new Float32Array(ASTEROIDS * 3);
    const s = new Float32Array(ASTEROIDS);
    for (let i = 0; i < ASTEROIDS; i++) {
      const r = 9 + Math.random() * 2.5;
      const th = Math.random() * Math.PI * 2;
      const inc = (Math.random() - 0.5) * 0.4;
      p[i * 3] = Math.cos(th) * r;
      p[i * 3 + 1] = inc;
      p[i * 3 + 2] = Math.sin(th) * r;
      const g = 0.4 + Math.random() * 0.35;
      c[i * 3] = g * 0.9; c[i * 3 + 1] = g * 0.88; c[i * 3 + 2] = g;
      s[i] = 1 + Math.random() * 1.8;
    }
    return [p, c, s];
  }, []);

  // Atmosphere glow for planet 2
  const atmoRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (!active) return;
    const t = state.clock.getElapsedTime();

    if (sunRef.current) {
      sunRef.current.rotation.y += delta * 0.08;
    }

    // Lava world — close, fast
    if (p1Ref.current) {
      const a = t * 1.4;
      p1Ref.current.position.set(Math.cos(a) * 3.8, 0, Math.sin(a) * 3.8);
      p1Ref.current.rotation.y += delta * 1.2;
    }
    // Ocean world — mid, moderate
    if (p2Ref.current) {
      const a = t * 0.85;
      p2Ref.current.position.set(Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2);
      p2Ref.current.rotation.y += delta * 0.6;
    }
    // Gas giant — outer ring system
    if (p3Ref.current) {
      const a = t * 0.45;
      p3Ref.current.position.set(Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5);
      p3Ref.current.rotation.y += delta * 0.35;
    }
    // Ice world — far, slow
    if (p4Ref.current) {
      const a = t * 0.2;
      p4Ref.current.position.set(Math.cos(a) * 14, 0.5 * Math.sin(a * 3), Math.sin(a) * 14);
      p4Ref.current.rotation.y += delta * 0.2;
    }

    // Comet sweep
    if (cometRef.current) {
      const a = -t * 0.6 + Math.PI * 0.3;
      const r = 7 + 6 * Math.cos(t * 0.3);
      cometRef.current.position.set(Math.cos(a) * r, Math.sin(t * 0.2) * 1.5, Math.sin(a) * r);
      cometRef.current.rotation.z = Math.atan2(Math.sin(a), Math.cos(a)) + Math.PI / 2;
    }

    // Asteroid belt slow rotate
    if (asteroidRef.current) {
      asteroidRef.current.rotation.y += delta * 0.04;
    }
  });

  if (!active) return null;

  return (
    <group>
      {/* Sun */}
      <mesh ref={sunRef}>
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshBasicMaterial color="#fff5cc" />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.8, 16, 16]} />
        <meshBasicMaterial color="#ffaa00" transparent opacity={0.07} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <pointLight intensity={5} color="#fff4cc" distance={100} />

      {/* Orbit rings — subtle glow lines */}
      {[3.8, 6.2, 9.5, 14].map((rad, idx) => (
        <mesh key={idx} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[rad - 0.015, rad + 0.015, 128]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.04} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Planet 1: Lava world */}
      <group ref={p1Ref}>
        <mesh>
          <sphereGeometry args={[0.28, 24, 24]} />
          <meshStandardMaterial color="#cc2200" roughness={0.9} emissive="#440800" emissiveIntensity={0.4} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.34, 16, 16]} />
          <meshBasicMaterial color="#ff3300" transparent opacity={0.12} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
        </mesh>
      </group>

      {/* Planet 2: Ocean world with atmosphere */}
      <group ref={p2Ref}>
        <mesh>
          <sphereGeometry args={[0.38, 32, 32]} />
          <meshStandardMaterial color="#1a6fa8" roughness={0.3} metalness={0.1} />
        </mesh>
        <mesh ref={atmoRef}>
          <sphereGeometry args={[0.46, 24, 24]} />
          <meshBasicMaterial color="#88ccff" transparent opacity={0.18} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.55, 16, 16]} />
          <meshBasicMaterial color="#4488ff" transparent opacity={0.06} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
        </mesh>
      </group>

      {/* Planet 3: Gas giant with rings */}
      <group ref={p3Ref}>
        <mesh>
          <sphereGeometry args={[0.62, 32, 32]} />
          <meshStandardMaterial color="#d4a85a" roughness={0.5} />
        </mesh>
        {/* Saturn-style ring system */}
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <ringGeometry args={[0.88, 1.0, 64]} />
          <meshBasicMaterial color="#d4b068" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <ringGeometry args={[1.02, 1.18, 64]} />
          <meshBasicMaterial color="#c49850" transparent opacity={0.38} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <ringGeometry args={[1.21, 1.35, 64]} />
          <meshBasicMaterial color="#a47840" transparent opacity={0.22} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Planet 4: Ice world */}
      <group ref={p4Ref}>
        <mesh>
          <sphereGeometry args={[0.3, 24, 24]} />
          <meshStandardMaterial color="#c8eeff" roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.36, 16, 16]} />
          <meshBasicMaterial color="#88ddff" transparent opacity={0.08} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
        </mesh>
      </group>

      {/* Comet */}
      <group ref={cometRef}>
        <mesh>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial color="#eeffff" />
        </mesh>
        <mesh position={[-0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.08, 0.7, 6]} />
          <meshBasicMaterial color="#88ddff" transparent opacity={0.3} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>

      {/* Asteroid belt */}
      <points ref={asteroidRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[aPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[aCol, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[aSz, 1]} />
        </bufferGeometry>
        <shaderMaterial vertexShader={particleVertexShader} fragmentShader={particleFragmentShader}
          vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}

// ─── Stage 4: The Grand Cosmos — Spiral Galaxy ────────────────────────────────
function StageGrandCosmos() {
  const pointsRef = useRef<THREE.Points>(null);
  const N = 12000;

  const [pos, sp, ph, col, sz] = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const speeds = new Float32Array(N);
    const phases = new Float32Array(N);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const r = 0.3 + Math.pow(Math.random(), 1.8) * 24;
      const numArms = 4;
      const arm = i % numArms;
      const angle = (arm * Math.PI * 2) / numArms + r * 0.52 + (Math.random() - 0.5) * 0.55;

      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1.2 * (1 - r / 25);
      positions[i * 3 + 2] = Math.sin(angle) * r;

      speeds[i] = 0.08 + 1.0 / r;
      phases[i] = Math.random() * Math.PI * 2;
      // Subtle particle sizes for realistic stars
      sizes[i] = 0.4 + Math.random() * 1.0;

      // Core: warm faint glow, arms: dim blue dust, outer: dark dust
      if (r < 2.5) {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.7; colors[i * 3 + 2] = 0.6; // core warm
      } else if (r < 8) {
        const f = (r - 2.5) / 5.5;
        colors[i * 3] = 0.8 - f * 0.4; colors[i * 3 + 1] = 0.7 - f * 0.3; colors[i * 3 + 2] = 0.6 + f * 0.2; // warm → blue
      } else if (i % 2 === 0) {
        const f = Math.min(1, (r - 8) / 16);
        colors[i * 3] = 0.1 + f * 0.2; colors[i * 3 + 1] = 0.2 + f * 0.2; colors[i * 3 + 2] = 0.5; // faint blue arms
      } else {
        colors[i * 3] = 0.1; colors[i * 3 + 1] = 0.05; colors[i * 3 + 2] = 0.1; // dark outer dust
      }
    }
    return [positions, speeds, phases, colors, sizes];
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const t = state.clock.getElapsedTime();
    const pa = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pa.array as Float32Array;

    // Mouse parallax tilt — subtle
    const tiltX = mouse.y * 0.04;
    const tiltZ = mouse.x * 0.04;

    for (let i = 0; i < N; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      let px = arr[ix], pz = arr[iz];
      const r = Math.max(0.1, Math.sqrt(px * px + pz * pz));
      const angle = Math.atan2(pz, px) + sp[i] * delta * 0.7;
      arr[ix] = Math.cos(angle) * r;
      arr[iy] = Math.sin(t * 0.35 + ph[i]) * 0.1 * (1 - r / 25) + tiltX;
      arr[iz] = Math.sin(angle) * r + tiltZ;
    }
    pa.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[col, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sz, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={starVertexShader}
        fragmentShader={starFragmentShader}
        vertexColors transparent depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─── Cinematic Camera ─────────────────────────────────────────────────────────
function CinematicCamera({ stage, elapsed }: { stage: number; elapsed: number }) {
  const { camera } = useThree();

  const targets: Record<number, [number, number, number]> = {
    "-1": [0, 5, 20],
    0: [0.5, 0.8, 7.5],
    1: [2.5, 5, 18],
    2: [-0.5, 2, 9.5],
    3: [0, 10, 22],
    4: [0, 8, 17],
  };

  useFrame((state, delta) => {
    const [tx, ty, tz] = targets[stage] ?? [0, 0, 10];

    // Stage 3 — sweep from top-down to edge-on over first 3 seconds
    const finalY = stage === 3 ? (elapsed < 3 ? 10 + (elapsed / 3) * -4 : 6) : ty;
    const finalZ = stage === 3 ? (elapsed < 3 ? 22 - (elapsed / 3) * 6 : 16) : tz;

    const ease = 0.028;
    state.camera.position.x += (tx - state.camera.position.x) * ease;
    state.camera.position.y += (finalY - state.camera.position.y) * ease;
    state.camera.position.z += (finalZ - state.camera.position.z) * ease;

    // Slow orbit in galaxy stage or start screen
    if (stage === 4 || stage === -1) {
      const orbit = state.clock.getElapsedTime() * 0.06;
      state.camera.position.x = Math.sin(orbit) * 3;
    }

    state.camera.lookAt(0, 0, 0);
  });

  return null;
}

// ─── Subtitle Display ─────────────────────────────────────────────────────────
function SubtitleDisplay({ words, visibleCount }: { words: string[]; visibleCount: number }) {
  const visible = words.slice(0, visibleCount);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-8 pointer-events-none"
    >
      <div className="relative px-8 py-5 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 shadow-2xl text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        <p className="relative text-base md:text-lg font-light text-white/95 tracking-wide leading-relaxed">
          {words.map((word, idx) => (
            <motion.span
              key={idx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: idx < visibleCount ? 1 : 0.1, y: 0 }}
              transition={{ duration: 0.25, delay: 0 }}
              className="inline-block mr-1.5 drop-shadow-md"
            >
              {word}
            </motion.span>
          ))}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Stage overlay — title + skip ────────────────────────────────────────────
const STAGE_COLORS: Record<number, string> = {
  "-1": "from-transparent to-transparent",
  0: "from-orange-900/40 to-transparent",
  1: "from-teal-950/40 to-transparent",
  2: "from-amber-950/40 to-transparent",
  3: "from-blue-950/40 to-transparent",
  4: "from-transparent to-transparent",
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState(-1);
  const [transitioning, setTransitioning] = useState(false);
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  const [muted, setMuted] = useState(false);
  const [stageElapsed, setStageElapsed] = useState(0);
  const stageStartRef = useRef(Date.now());
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance stages with crossfade
  const advanceStage = useCallback(() => {
    if (!started || stage >= 4 || transitioning) return;
    setTransitioning(true);
    // Fade out canvas
    setCanvasOpacity(0);
    setTimeout(() => {
      setStage((s) => s + 1);
      setCanvasOpacity(1);
      setTransitioning(false);
    }, 700);
  }, [started, stage, transitioning]);

  const { subtitleWords, wordIdx } = useNarration(stage, muted, started, advanceStage);

  // Track elapsed time within current stage (for camera sweep)
  useEffect(() => {
    stageStartRef.current = Date.now();
    setStageElapsed(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => {
      setStageElapsed((Date.now() - stageStartRef.current) / 1000);
    }, 100);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [stage]);

  return (
    <main
      className="relative w-full h-screen overflow-hidden bg-black"
      onClick={() => {
        if (started && stage >= 0 && stage < 4 && !transitioning) advanceStage();
      }}
    >
      {/* ── Start Screen Overlay ── */}
      <AnimatePresence>
        {!started && (
          <motion.div
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <h1 className="text-3xl md:text-5xl font-thin text-white tracking-[0.2em] mb-8 drop-shadow-xl">
              DEEP <span className="font-bold">SPACE</span>
            </h1>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Unlock Web Speech API strictly on user interaction
                if (typeof window !== "undefined" && window.speechSynthesis) {
                  const unlock = new SpeechSynthesisUtterance("");
                  window.speechSynthesis.speak(unlock);
                }
                setStarted(true);
                // Transition immediately from stage -1 to 0
                setTransitioning(true);
                setCanvasOpacity(0);
                setTimeout(() => {
                  setStage(0);
                  setCanvasOpacity(1);
                  setTransitioning(false);
                }, 700);
              }}
              className="px-10 py-4 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-white font-mono uppercase tracking-[0.3em] text-sm backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-2xl"
            >
              Initialize Sequence
            </button>
            <p className="mt-8 text-white/50 text-xs tracking-widest uppercase font-mono drop-shadow-md">
              Sound is highly recommended
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.72) 100%)",
        }}
      />

      {/* Stage color tint overlay */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`tint-${stage}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className={`absolute inset-0 z-5 pointer-events-none bg-gradient-to-b ${STAGE_COLORS[stage] || "from-transparent to-transparent"}`}
        />
      </AnimatePresence>

      {/* Crossfade overlay for stage transitions */}
      <motion.div
        className="absolute inset-0 z-20 bg-black pointer-events-none"
        animate={{ opacity: transitioning ? 1 : 0 }}
        transition={{ duration: 0.65, ease: "easeInOut" }}
      />

      {/* ── 3D Canvas ── */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: canvasOpacity }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <Canvas
          camera={{ position: [0, 2, 8], fov: 58 }}
          style={{ width: "100%", height: "100%" }}
          gl={{ antialias: true, alpha: false }}
        >
          <color attach="background" args={["#000005"]} />
          <ambientLight intensity={0.06} />
          <Stars radius={140} depth={50} count={5500} factor={3.5} saturation={0.4} fade />

          {(stage === -1 || stage === 4) && <StageGrandCosmos />}
          <StageBigBang active={stage === 0} opacity={canvasOpacity} />
          <StageCosmicWeb active={stage === 1} />
          <StageStellarIgnition active={stage === 2} />
          <StageWorldsAwakening active={stage === 3} />

          <CinematicCamera stage={stage} elapsed={stageElapsed} />
        </Canvas>
      </motion.div>

      {/* ── Mute Button ── */}
      <button
        onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
        className="absolute top-6 right-6 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs tracking-widest font-mono uppercase"
      >
        {muted ? (
          <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.784L4.566 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.566l3.817-3.784a1 1 0 011 .076zM14.657 6.343a1 1 0 011.415 0A7.98 7.98 0 0118 12a7.98 7.98 0 01-1.928 5.172 1 1 0 01-1.415-1.415A5.986 5.986 0 0016 12a5.986 5.986 0 00-1.343-3.757 1 1 0 010-1.414v-.486z" /><path d="M12.293 8.293a1 1 0 011.414 0A3.992 3.992 0 0115 12a3.992 3.992 0 01-1.293 2.707 1 1 0 01-1.414-1.414A1.996 1.996 0 0013 12a1.996 1.996 0 00-.707-1.293 1 1 0 010-1.414z" /></svg> Sound On</>
        ) : (
          <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.784L4.566 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.566l3.817-3.784a1 1 0 011 .076zM12.707 6.293a1 1 0 011.414 1.414L12.414 9.5l1.707 1.793a1 1 0 11-1.414 1.414L11 10.914l-1.707 1.793a1 1 0 11-1.414-1.414L9.586 9.5 7.879 7.707a1 1 0 011.414-1.414L11 8.086l1.707-1.793z" clipRule="evenodd" /></svg> Muted</>
        )}
      </button>

      {/* ── Stage indicator dots ── */}
      {stage < 4 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="rounded-full bg-white"
              animate={{
                width: i === stage ? 20 : 6,
                height: 6,
                opacity: i === stage ? 1 : 0.25,
              }}
              transition={{ duration: 0.4 }}
            />
          ))}
        </div>
      )}

      {/* ── Pre-landing stage overlay (stages 0–3) ── */}
      <AnimatePresence mode="wait">
        {stage < 4 && (
          <motion.div
            key={`overlay-${stage}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-25"
          >
            {/* Stage badge */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              className="mb-4 px-5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] tracking-[0.45em] text-white/70 font-mono uppercase shadow-lg"
            >
              Chapter {stage + 1} of 4
            </motion.div>

            {/* Stage title */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 1.1, delay: 0.5, ease: "easeOut" }}
              className="px-10 py-6 rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <h2 className="relative text-2xl md:text-5xl font-thin text-white/90 tracking-[0.4em] text-center select-none drop-shadow-xl">
                {STAGE_TITLES[stage]}
              </h2>
            </motion.div>

            {/* Skip hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 1.4 }}
              className="absolute bottom-16 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md text-white/40 text-[9px] tracking-[0.4em] uppercase font-mono"
            >
              Click to advance · Auto in {stage < 4 ? "5s" : ""}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Subtitle bar (stages 0–3) ── */}
      <AnimatePresence mode="wait">
        {stage < 4 && (
          <SubtitleDisplay key={`sub-${stage}`} words={subtitleWords} visibleCount={wordIdx} />
        )}
      </AnimatePresence>

      {/* ── Final Landing Page (Stage 4) ── */}
      <AnimatePresence>
        {stage === 4 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-25 px-6">

            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, delay: 0.2 }}
              className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] tracking-[0.4em] text-cyan-400 uppercase font-mono mb-6"
            >
              Computational Astrophysics · Real-Time Physics
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.6, ease: "easeOut" }}
              className="text-center mb-3 select-none"
            >
              <h1 className="text-5xl md:text-8xl font-thin text-white tracking-[0.18em] leading-none">
                DEEP{" "}
                <span className="font-extrabold bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                  SPACE
                </span>
              </h1>
              <h1 className="text-5xl md:text-8xl font-thin text-white tracking-[0.18em] leading-none mt-1">
                EXPLORER
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.4, delay: 0.6 }}
              className="text-white/35 text-xs md:text-sm tracking-[0.25em] font-light mb-12 text-center"
            >
              102 Celestial Objects · Real-Time Gravitational Simulations · AI Voice Narrator
            </motion.p>

            <motion.button
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.0, delay: 0.8, type: "spring", stiffness: 100 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => { e.stopPropagation(); router.push("/explore"); }}
              className="pointer-events-auto relative group cursor-pointer"
            >
              <span className="absolute -inset-2 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 opacity-50 blur-xl group-hover:opacity-80 transition-all duration-700" />
              <span className="relative flex items-center gap-3 px-14 py-4 rounded-full bg-black/80 backdrop-blur-2xl border border-white/20 text-white font-light tracking-[0.3em] text-sm uppercase shadow-2xl group-hover:border-white/35 transition-colors">
                <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
                Enter the Cosmos
              </span>
            </motion.button>

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 2, delay: 1.4 }}
              className="absolute bottom-6 w-full max-w-5xl flex flex-col md:flex-row items-center justify-between gap-3 px-10 text-white/20 text-[9px] tracking-widest uppercase font-mono"
            >
              <span>100+ Deep Space Objects</span>
              <span className="px-3 py-1 rounded border border-white/6 bg-white/3 backdrop-blur-sm text-white/30">
                Developer:{" "}
                <span className="text-cyan-500/70">Achut Mahadev Kadam</span>{" "}
                ·{" "}
                <span className="text-blue-400/60 normal-case tracking-normal">krishna0124@gmail.com</span>
              </span>
              <span>Real-Time Physics Engine</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
