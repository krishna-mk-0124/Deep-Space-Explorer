"use client";

import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, useGLTF, useTexture, Environment } from "@react-three/drei";
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
const particleVertexShader = `
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

const particleFragmentShader = `
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
    gl_PointSize = aSize * (280.0 / -mvPosition.z);
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
    float spike = max(
      smoothstep(0.48, 0.0, abs(coord.x)) * smoothstep(0.12, 0.0, abs(coord.y)),
      smoothstep(0.48, 0.0, abs(coord.y)) * smoothstep(0.12, 0.0, abs(coord.x))
    ) * 0.3;
    float alpha = core + halo + spike;
    gl_FragColor = vec4(vColor, alpha * 0.98);
  }
`;

// Earth Atmospheric Glow Shader (Rayleigh scattering approximation)
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
    float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
  }
`;

// ─── Narration & Stages ──────────────────────────────────────────────────────
const NARRATIONS = [
  "April 24, 1990. Humanity prepares to open a new window to the cosmos. The Space Shuttle Discovery stands ready, carrying a payload that will change our understanding of the universe forever.",
  "Leaving the atmosphere behind, Discovery enters low Earth orbit. Down below, the cradle of humanity glows — a fragile blue marble suspended in the infinite dark.",
  "The payload bay doors open. The Hubble Space Telescope is lifted into the vacuum of space. Its golden solar arrays unfurl, catching the first light of the sun.",
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
      // Look up at rocket
      state.camera.position.lerp(new THREE.Vector3(0, -5 + elapsed * 1.5, 12), ease);
      state.camera.lookAt(0, elapsed * 2, 0);
    } 
    else if (stage === 1) {
      // Zoom out to reveal Earth, shuttle flies away
      state.camera.position.lerp(new THREE.Vector3(15, 10, 30), ease);
      state.camera.lookAt(0, 0, 0);
    }
    else if (stage === 2) {
      // Close up on shuttle payload bay
      state.camera.position.lerp(new THREE.Vector3(5, 5, 15), ease);
      state.camera.lookAt(0, 2, 0);
    }
    else if (stage === 3) {
      // Dive into the Hubble telescope mirror
      const diveProg = Math.min(elapsed / 5, 1);
      state.camera.position.lerp(new THREE.Vector3(0, 2, 10 - diveProg * 9.5), ease * 2);
      state.camera.lookAt(0, 2, 0);
    }
    else if (stage === 4) {
      // Grand Cosmos landing page slow orbit
      const orbit = state.clock.getElapsedTime() * 0.04;
      state.camera.position.lerp(new THREE.Vector3(Math.sin(orbit) * 3, 0, 15), ease);
      state.camera.lookAt(0, 0, 0);
    }
  });

  return null;
}

// ─── Stage 0 & 1 & 2: Space Shuttle & Earth ──────────────────────────────────
function SpaceScene({ stage, active }: { stage: number, active: boolean }) {
  const shuttleRef = useRef<THREE.Group>(null);
  const hubbleRef = useRef<THREE.Group>(null);
  const exhaustRef = useRef<THREE.Points>(null);
  const earthGroupRef = useRef<THREE.Group>(null);

  // Try to load models. If they fail or haven't downloaded, we gracefully catch error by not crashing
  // (In real use, Suspense handles it, but missing files throw errors. We assume the download script got them).
  const { scene: shuttleModel } = useGLTF("/models/shuttle.glb", true, true, (e) => console.log("Shuttle model fallback"));
  const { scene: hubbleModel } = useGLTF("/models/hubble.glb", true, true, (e) => console.log("Hubble model fallback"));
  
  const [earthColorMap, earthCloudsMap] = useTexture([
    "/textures/earth_8k.jpg",
    "/textures/earth_clouds.jpg"
  ]);

  // Thrust particle system
  const PARTICLE_COUNT = 2000;
  const [pos, sp, col, sz] = useMemo(() => {
    const p = new Float32Array(PARTICLE_COUNT * 3);
    const s = new Float32Array(PARTICLE_COUNT);
    const c = new Float32Array(PARTICLE_COUNT * 3);
    const z = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      p[i * 3] = (Math.random() - 0.5) * 1.5;
      p[i * 3 + 1] = -Math.random() * 15;
      p[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      s[i] = 10 + Math.random() * 20;
      
      const rand = Math.random();
      if(rand < 0.2) { c[i * 3] = 1; c[i * 3 + 1] = 0.9; c[i * 3 + 2] = 0.5; } // bright fire
      else if(rand < 0.5) { c[i * 3] = 1; c[i * 3 + 1] = 0.5; c[i * 3 + 2] = 0.1; } // orange fire
      else { c[i * 3] = 0.8; c[i * 3 + 1] = 0.8; c[i * 3 + 2] = 0.8; } // smoke
      z[i] = 15 + Math.random() * 25;
    }
    return [p, s, c, z];
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Animate Earth rotation
    if (earthGroupRef.current) {
      earthGroupRef.current.rotation.y += delta * 0.05;
    }

    // Animate Shuttle ascent
    if (shuttleRef.current) {
      if (stage === 0) {
        shuttleRef.current.position.y += delta * 4;
        shuttleRef.current.rotation.x = Math.PI / 8; // Tilted for launch
      } else if (stage === 1) {
        // Orbiting
        shuttleRef.current.position.y = 5;
        shuttleRef.current.rotation.x = Math.PI / 2; // Flat in orbit
        shuttleRef.current.position.x += delta * 2;
      } else if (stage === 2) {
        // Hovering for deploy
        shuttleRef.current.position.lerp(new THREE.Vector3(0, 0, 0), 0.05);
        shuttleRef.current.rotation.x = Math.PI / 2;
      }
    }

    // Animate Hubble Deploy
    if (hubbleRef.current) {
      if (stage === 2) {
        // Slide out of payload bay
        hubbleRef.current.position.y += delta * 0.5;
        hubbleRef.current.rotation.y += delta * 0.2;
      } else if (stage === 3) {
        // Center frame for dive
        hubbleRef.current.position.lerp(new THREE.Vector3(0, 2, 0), 0.05);
        // Face camera
        const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
        hubbleRef.current.quaternion.slerp(targetQuat, 0.05);
      }
    }

    // Animate Exhaust
    if (exhaustRef.current && stage === 0) {
      const pa = exhaustRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        arr[i * 3 + 1] -= sp[i] * delta;
        if (arr[i * 3 + 1] < -20) {
          arr[i * 3 + 1] = 0; // reset to engine bell
          arr[i * 3] = (Math.random() - 0.5) * 1.5;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
        }
      }
      pa.needsUpdate = true;
    }
  });

  if (!active) return null;

  return (
    <group>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={2.5} castShadow />

      {/* Earth Component (Visible heavily in Stage 1) */}
      <group ref={earthGroupRef} position={[0, -40, -40]} visible={stage >= 1 && stage <= 2}>
        <mesh>
          <sphereGeometry args={[30, 64, 64]} />
          <meshStandardMaterial map={earthColorMap} roughness={0.7} />
        </mesh>
        <mesh>
          <sphereGeometry args={[30.5, 64, 64]} />
          <meshStandardMaterial map={earthCloudsMap} transparent opacity={0.6} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[31.5, 64, 64]} />
          <shaderMaterial vertexShader={earthAtmoVertex} fragmentShader={earthAtmoFragment} transparent blending={THREE.AdditiveBlending} side={THREE.BackSide} />
        </mesh>
      </group>

      {/* Shuttle Component */}
      <group ref={shuttleRef} position={[0, -10, 0]} visible={stage <= 2}>
        {shuttleModel ? (
          <primitive object={shuttleModel} scale={0.5} />
        ) : (
          <mesh><boxGeometry args={[2, 6, 2]} /><meshStandardMaterial color="#eeeeee" metalness={0.8} roughness={0.2} /></mesh>
        )}
        
        {/* Thrust Exhaust */}
        {stage === 0 && (
          <points ref={exhaustRef} position={[0, -3, 0]}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[pos, 3]} />
              <bufferAttribute attach="attributes-color" args={[col, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[sz, 1]} />
            </bufferGeometry>
            <shaderMaterial vertexShader={particleVertexShader} fragmentShader={particleFragmentShader} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </points>
        )}
      </group>

      {/* Hubble Component */}
      <group ref={hubbleRef} position={[0, 0, 0]} visible={stage >= 2 && stage <= 3}>
        {hubbleModel ? (
          <primitive object={hubbleModel} scale={0.8} />
        ) : (
          <mesh><cylinderGeometry args={[1, 1, 4, 32]} /><meshStandardMaterial color="#bbccdd" metalness={0.9} roughness={0.1} /></mesh>
        )}
      </group>

    </group>
  );
}

// ─── Stage 4: The Grand Cosmos — Spiral Galaxy ────────────────────────────────
function StageGrandCosmos({ active }: { active: boolean }) {
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
      sizes[i] = 1.2 + Math.random() * 2.2;

      if (r < 2.5) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.95; colors[i * 3 + 2] = 0.8;
      } else if (r < 8) {
        const f = (r - 2.5) / 5.5;
        colors[i * 3] = 1 - f * 0.5; colors[i * 3 + 1] = 0.85 - f * 0.2; colors[i * 3 + 2] = 0.4 + f * 0.5;
      } else if (i % 2 === 0) {
        const f = Math.min(1, (r - 8) / 16);
        colors[i * 3] = 0.2 + f * 0.7; colors[i * 3 + 1] = 0.5 + f * 0.2; colors[i * 3 + 2] = 0.95;
      } else {
        const f = Math.min(1, (r - 8) / 16);
        colors[i * 3] = 0.85 + f * 0.15; colors[i * 3 + 1] = 0.2 + f * 0.1; colors[i * 3 + 2] = 0.35 - f * 0.1;
      }
    }
    return [positions, speeds, phases, colors, sizes];
  }, []);

  useFrame((state, delta) => {
    if (!active || !pointsRef.current) return;
    const t = state.clock.getElapsedTime();
    const pa = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pa.array as Float32Array;

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

  if (!active) return null;

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
        vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending}
      />
    </points>
  );
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
      <div className="relative px-6 py-3 rounded-2xl backdrop-blur-md bg-black/40 border border-white/8 shadow-2xl text-center">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/3 to-transparent pointer-events-none" />
        <p className="relative text-sm md:text-base font-light text-white/90 tracking-wide leading-relaxed">
          {words.map((word, idx) => (
            <motion.span
              key={idx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: idx < visibleCount ? 1 : 0.1, y: 0 }}
              transition={{ duration: 0.25, delay: 0 }}
              className="inline-block mr-1"
            >
              {word}
            </motion.span>
          ))}
        </p>
      </div>
    </motion.div>
  );
}

const STAGE_COLORS = [
  "from-slate-900/40 to-transparent",
  "from-blue-950/40 to-transparent",
  "from-black/40 to-transparent",
  "from-indigo-950/40 to-transparent",
  "from-transparent to-transparent",
];

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
      const timer = setTimeout(advanceStage, 6500); // slightly longer stages for reading
      return () => clearTimeout(timer);
    }
  }, [stage, advanceStage]);

  return (
    <main
      className="relative w-full h-screen overflow-hidden bg-black"
      onClick={() => {
        if (stage < 4 && !transitioning) advanceStage();
      }}
    >
      <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.72) 100%)" }} />

      <AnimatePresence mode="wait">
        <motion.div key={`tint-${stage}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }} className={`absolute inset-0 z-5 pointer-events-none bg-gradient-to-b ${STAGE_COLORS[stage]}`} />
      </AnimatePresence>

      <motion.div className="absolute inset-0 z-20 bg-black pointer-events-none" animate={{ opacity: transitioning ? 1 : 0 }} transition={{ duration: 0.65, ease: "easeInOut" }} />

      <motion.div className="absolute inset-0" animate={{ opacity: canvasOpacity }} transition={{ duration: 0.7, ease: "easeOut" }}>
        <Canvas camera={{ position: [0, 2, 12], fov: 58 }} style={{ width: "100%", height: "100%" }} gl={{ antialias: true, alpha: false }}>
          <color attach="background" args={["#000003"]} />
          <Environment preset="night" />
          <Stars radius={140} depth={50} count={5500} factor={3.5} saturation={0.4} fade />

          <Suspense fallback={null}>
            <SpaceScene stage={stage} active={stage <= 3} />
            <StageGrandCosmos active={stage === 4} />
          </Suspense>

          <CinematicCamera stage={stage} elapsed={stageElapsed} />
        </Canvas>
      </motion.div>

      <button onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }} className="absolute top-6 right-6 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs tracking-widest font-mono uppercase">
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
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3 }} className="mb-4 px-4 py-1 rounded-full border border-white/12 bg-white/4 backdrop-blur-sm text-[9px] tracking-[0.45em] text-white/40 font-mono uppercase">
              Chapter {stage + 1} of 4
            </motion.div>
            <motion.h2 initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.5, ease: "easeOut" }} className="text-2xl md:text-4xl font-thin text-white tracking-[0.35em] text-center select-none">
              {STAGE_TITLES[stage]}
            </motion.h2>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.4 }} className="absolute bottom-16 text-white/25 text-[10px] tracking-[0.4em] uppercase font-mono">
              Click to advance · Auto in 6s
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {stage < 4 && <SubtitleDisplay key={`sub-${stage}`} words={subtitleWords} visibleCount={wordIdx} />}
      </AnimatePresence>

      <AnimatePresence>
        {stage === 4 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-25 px-6">
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.2 }} className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] tracking-[0.4em] text-cyan-400 uppercase font-mono mb-6">
              Computational Astrophysics · Real-Time Physics
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease: "easeOut" }} className="text-center mb-3 select-none">
              <h1 className="text-5xl md:text-8xl font-thin text-white tracking-[0.18em] leading-none">
                DEEP <span className="font-extrabold bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-500 bg-clip-text text-transparent">SPACE</span>
              </h1>
              <h1 className="text-5xl md:text-8xl font-thin text-white tracking-[0.18em] leading-none mt-1">EXPLORER</h1>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.4, delay: 0.6 }} className="text-white/35 text-xs md:text-sm tracking-[0.25em] font-light mb-12 text-center">
              102 Celestial Objects · Real-Time Gravitational Simulations · AI Voice Narrator
            </motion.p>
            <motion.button initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.0, delay: 0.8, type: "spring", stiffness: 100 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={(e) => { e.stopPropagation(); router.push("/explore"); }} className="pointer-events-auto relative group cursor-pointer">
              <span className="absolute -inset-2 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 opacity-50 blur-xl group-hover:opacity-80 transition-all duration-700" />
              <span className="relative flex items-center gap-3 px-14 py-4 rounded-full bg-black/80 backdrop-blur-2xl border border-white/20 text-white font-light tracking-[0.3em] text-sm uppercase shadow-2xl group-hover:border-white/35 transition-colors">
                Enter the Cosmos
              </span>
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
