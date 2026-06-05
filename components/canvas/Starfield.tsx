"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";

export default function Starfield() {
  const angle = useRef(0);

  useFrame(({ camera }) => {
    angle.current += 0.0008;
    camera.position.x = Math.sin(angle.current) * 12;
    camera.position.z = Math.cos(angle.current) * 12;
    camera.position.y = Math.sin(angle.current * 0.4) * 3;
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <Stars radius={120} depth={60} count={8000} factor={4} saturation={0.5} fade speed={0.5} />
      <Sparkles count={120} scale={[20, 20, 20]} size={2} speed={0.4} opacity={0.6} color="#88ccff" />
      <Sparkles count={60} scale={[10, 10, 10]} size={3} speed={0.2} opacity={0.8} color="#ff88cc" />
    </>
  );
}
