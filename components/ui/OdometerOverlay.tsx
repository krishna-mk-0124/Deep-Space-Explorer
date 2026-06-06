"use client";

import { useEffect, useState } from "react";
import { Zap, Navigation2 } from "lucide-react";

export default function OdometerOverlay() {
  const [zoomData, setZoomData] = useState({
    isZooming: false,
    remainingDistance: 0,
    speedC: 0,
    progress: 0,
  });

  useEffect(() => {
    const handleZoomUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      setZoomData(customEvent.detail);
    };
    window.addEventListener("zoomUpdate", handleZoomUpdate);
    return () => window.removeEventListener("zoomUpdate", handleZoomUpdate);
  }, []);

  if (!zoomData.isZooming) return null;

  // Formatting helpers
  const formatSpeed = (speed: number) => {
    if (speed < 1) return "Sublight";
    if (speed > 1e15) return (speed / 1e15).toFixed(2) + "Q c";
    if (speed > 1e12) return (speed / 1e12).toFixed(2) + "T c";
    if (speed > 1e9) return (speed / 1e9).toFixed(2) + "B c";
    if (speed > 1e6) return (speed / 1e6).toFixed(2) + "M c";
    if (speed > 1000) return (speed / 1000).toFixed(2) + "k c";
    return speed.toFixed(0) + " c";
  };

  const formatDistance = (dist: number) => {
    if (dist > 1e9) return (dist / 1e9).toFixed(3) + " B ly";
    if (dist > 1e6) return (dist / 1e6).toFixed(3) + " M ly";
    if (dist > 1000) return (dist / 1000).toFixed(3) + " k ly";
    return dist.toFixed(3) + " ly";
  };

  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-4 rounded-full border border-cyan-500/30 bg-black/80 backdrop-blur-xl shadow-[0_0_30px_rgba(0,255,255,0.1)] z-20 pointer-events-auto">
      {/* Target Distance */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-500/10 rounded-full border border-cyan-500/20">
          <Navigation2 size={16} className="text-cyan-400 -rotate-45" />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Distance to Target</span>
          <span className="text-sm font-mono font-bold text-white tabular-nums">
            {formatDistance(zoomData.remainingDistance)}
          </span>
        </div>
      </div>

      <div className="h-8 w-px bg-white/10" />

      {/* Warp Speed */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/10 rounded-full border border-purple-500/20">
          <Zap size={16} className="text-purple-400" />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Current Velocity</span>
          <span className="text-sm font-mono font-bold text-white tabular-nums">
            {formatSpeed(zoomData.speedC)}
          </span>
        </div>
      </div>

      {/* Progress Bar Mini */}
      <div className="absolute -bottom-1 left-8 right-8 h-0.5 bg-white/5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-75"
          style={{ width: `${zoomData.progress * 100}%` }}
        />
      </div>
    </div>
  );
}
