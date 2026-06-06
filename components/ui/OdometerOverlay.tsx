"use client";

import { useEffect, useState } from "react";
import { Zap, Navigation2 } from "lucide-react";
import { useExplorer } from "@/store/explorerStore";

function getDistanceLy(data: Record<string, string>): number {
  for (const [key, val] of Object.entries(data)) {
    if (key.toLowerCase().includes("distance")) {
      const v = val.toLowerCase().replace(/,/g, "");
      if (v.includes("billion light-years")) return parseFloat(v) * 1e9;
      if (v.includes("million light-years")) return parseFloat(v) * 1e6;
      if (v.includes("light-years") || v.includes("ly")) return parseFloat(v);
    }
  }
  return 0;
}

export default function OdometerOverlay() {
  const { selectedObject } = useExplorer();
  const [zoomData, setZoomData] = useState({
    isZooming: false,
    remainingDistance: 0,
    speedC: 0,
    progress: 1,
  });

  useEffect(() => {
    const handleZoomUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      setZoomData(customEvent.detail);
    };
    window.addEventListener("zoomUpdate", handleZoomUpdate);
    return () => window.removeEventListener("zoomUpdate", handleZoomUpdate);
  }, []);

  if (!selectedObject) return null;

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
    if (dist === 0) return "0 ly";
    if (dist > 1e9) return (dist / 1e9).toFixed(3) + " B ly";
    if (dist > 1e6) return (dist / 1e6).toFixed(3) + " M ly";
    if (dist > 1000) return (dist / 1000).toFixed(3) + " k ly";
    return dist.toFixed(3) + " ly";
  };

  const totalDist = getDistanceLy(selectedObject.encyclopedia.classificationData);
  const duration = 2.5 + Math.min(Math.log10(totalDist + 1) * 0.6, 4);
  const avgSpeedC = (totalDist / duration) * 31557600;

  const isEarth = selectedObject.id === "earth";
  
  // Decide what to display based on whether we are currently warping or arrived
  const displayDist = isEarth ? 0 : (zoomData.isZooming ? zoomData.remainingDistance : totalDist);
  const displaySpeed = isEarth ? 0 : (zoomData.isZooming ? zoomData.speedC : avgSpeedC);
  
  const distLabel = zoomData.isZooming ? "Distance to Target" : "Distance from Earth";
  const speedLabel = zoomData.isZooming ? "Current Velocity" : "Avg Arrival Speed";

  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-4 rounded-full border border-cyan-500/30 bg-black/80 backdrop-blur-xl shadow-[0_0_30px_rgba(0,255,255,0.1)] z-20 pointer-events-auto transition-opacity duration-500">
      {/* Target Distance */}
      <div className="flex items-center gap-3 w-40">
        <div className="p-2 bg-cyan-500/10 rounded-full border border-cyan-500/20 shrink-0">
          <Navigation2 size={16} className="text-cyan-400 -rotate-45" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono truncate">{distLabel}</span>
          <span className="text-sm font-mono font-bold text-white tabular-nums truncate">
            {formatDistance(displayDist)}
          </span>
        </div>
      </div>

      <div className="h-8 w-px bg-white/10 shrink-0" />

      {/* Warp Speed */}
      <div className="flex items-center gap-3 w-40">
        <div className="p-2 bg-purple-500/10 rounded-full border border-purple-500/20 shrink-0">
          <Zap size={16} className="text-purple-400" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono truncate">{speedLabel}</span>
          <span className="text-sm font-mono font-bold text-white tabular-nums truncate">
            {formatSpeed(displaySpeed)}
          </span>
        </div>
      </div>

      {/* Progress Bar Mini */}
      {zoomData.isZooming && (
        <div className="absolute -bottom-1 left-8 right-8 h-0.5 bg-white/5 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-75"
            style={{ width: `${zoomData.progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
