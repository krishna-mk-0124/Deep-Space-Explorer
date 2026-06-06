"use client";

import { Canvas } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 12], fov: 60 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      </Canvas>

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6">
        {/* Title Group */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="text-center mb-8"
        >
          <h1 className="text-5xl md:text-8xl font-thin text-white tracking-[0.2em] mb-2">
            DEEP <span className="font-bold">SPACE</span>
          </h1>
          <h2 className="text-3xl md:text-5xl font-thin text-white tracking-[0.3em] text-cyan-400">
            EXPLORER
          </h2>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="text-gray-400 text-sm md:text-base tracking-[0.2em] font-light mb-16 text-center max-w-2xl"
        >
          100+ Deep Space Objects · Real Physics · Interactive Simulations
        </motion.p>

        {/* CTA Button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 1.0, type: "spring", stiffness: 120 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/explore")}
          className="pointer-events-auto relative group cursor-pointer"
        >
          {/* Glow ring */}
          <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 opacity-60 blur-md group-hover:opacity-90 transition-opacity duration-500" />
          <span className="relative flex items-center gap-3 px-10 py-4 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-white font-light tracking-[0.3em] text-sm uppercase">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Enter the Cosmos
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          </span>
        </motion.button>

        {/* Bottom metadata */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.8 }}
          className="absolute bottom-8 flex gap-8 text-gray-600 text-xs tracking-widest uppercase pointer-events-none"
        >
          <span>20+ Objects</span>
          <span className="text-gray-700">·</span>
          <span>5 Sim Types</span>
          <span className="text-gray-700">·</span>
          <span>Real-Time Physics</span>
        </motion.div>
      </div>
    </main>
  );
}
