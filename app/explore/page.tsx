"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { ExplorerProvider } from "@/store/explorerStore";
import ObjectSidebar from "@/components/ui/ObjectSidebar";
import DashboardOverlay from "@/components/ui/DashboardOverlay";
import SimulationTimeline from "@/components/ui/SimulationTimeline";
import NarrationOverlay from "@/components/ui/NarrationOverlay";

import OdometerOverlay from "@/components/ui/OdometerOverlay";

const SceneContainer = dynamic(
  () => import("@/components/canvas/SceneContainer"),
  { ssr: false }
);

function LoadingFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div className="text-center select-none">
        <div className="w-16 h-16 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm tracking-widest uppercase">Initializing Physics Engine</p>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <ExplorerProvider>
      <main className="relative w-full h-screen overflow-hidden bg-black flex">
        {/* Left Sidebar */}
        <ObjectSidebar />

        {/* 3D Canvas Area */}
        <div className="flex-1 relative">
          <Suspense fallback={<LoadingFallback />}>
            <SceneContainer />
          </Suspense>
          <NarrationOverlay />
          <SimulationTimeline />
          <OdometerOverlay />
        </div>

        {/* Right Dashboard Overlay */}
        <DashboardOverlay />
      </main>
    </ExplorerProvider>
  );
}
