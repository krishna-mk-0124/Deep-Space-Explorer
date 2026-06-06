"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { motion } from "framer-motion";
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

// ─── Galaxy Background ────────────────────────────────────────────────────────
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
    if (!pointsRef.current) return;
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

function CinematicCamera() {
  useFrame((state) => {
    const orbit = state.clock.getElapsedTime() * 0.04;
    state.camera.position.lerp(new THREE.Vector3(Math.sin(orbit) * 3, 0, 15), 0.015);
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.72) 100%)" }} />

      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 2, 12], fov: 58 }} style={{ width: "100%", height: "100%" }} gl={{ antialias: true, alpha: false }}>
          <color attach="background" args={["#000003"]} />
          <Stars radius={140} depth={50} count={5500} factor={3.5} saturation={0.4} fade />
          <StageGrandCosmos />
          <CinematicCamera />
        </Canvas>
      </div>

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
    </main>
  );
}
