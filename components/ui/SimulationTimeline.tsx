"use client";

import { useExplorer } from "@/store/explorerStore";
import { Play, Pause, Clock, Navigation2 } from "lucide-react";
import { useEffect, useState, useRef } from "react";

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

const formatDistance = (dist: number) => {
  if (dist === 0) return "0 ly";
  if (dist > 1e9) return (dist / 1e9).toFixed(3) + " B ly";
  if (dist > 1e6) return (dist / 1e6).toFixed(3) + " M ly";
  if (dist > 1000) return (dist / 1000).toFixed(3) + " k ly";
  return dist.toFixed(3) + " ly";
};

export default function SimulationTimeline() {
  const { selectedObject, sliderValues, setSliderValue, timeScale, setTimeScale, isPlaying, setIsPlaying } = useExplorer();
  const [localTime, setLocalTime] = useState(0);
  const [zoomData, setZoomData] = useState({ isZooming: false, remainingDistance: 0, progress: 1 });
  const isZoomingRef = useRef(false);

  // Listen to zoom updates to show distance countdown
  useEffect(() => {
    const handleZoomUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      setZoomData(customEvent.detail);
      isZoomingRef.current = customEvent.detail.isZooming;
    };
    window.addEventListener("zoomUpdate", handleZoomUpdate);
    return () => window.removeEventListener("zoomUpdate", handleZoomUpdate);
  }, []);

  // Reset local time on object change
  useEffect(() => {
    setLocalTime(0);
  }, [selectedObject?.id]);

  useEffect(() => {
    if (!isPlaying) return;
    let frameId: number;
    let lastTime = performance.now();

    const update = () => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      // Only advance time and events if we have finished arriving at the object
      if (!isZoomingRef.current) {
        // Update simulation time
        setLocalTime(prev => prev + delta * timeScale);

        // If it's an event (GalaxyCollision or Supernova), auto-advance progress
        if (selectedObject && (selectedObject.type === "GalaxyCollision" || selectedObject.type === "Supernova")) {
          const currentProgress = sliderValues.eventProgress !== undefined ? Number(sliderValues.eventProgress) : 0.0;
          // Advance progress: loops at 1.0, takes about 25 seconds at 1x speed
          const nextProgress = (currentProgress + delta * 0.04 * timeScale) % 1.0;
          setSliderValue("eventProgress", Number(nextProgress.toFixed(3)));
        }
      }

      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, timeScale, selectedObject, sliderValues.eventProgress, setSliderValue]);

  if (!selectedObject) return null;

  const isEvent = selectedObject.type === "GalaxyCollision" || selectedObject.type === "Supernova";
  const eventProgress = sliderValues.eventProgress !== undefined ? Number(sliderValues.eventProgress) : 0.0;

  // Format running simulation time
  const formatTime = () => {
    if (selectedObject.type === "Orbital") {
      // orbital period relative to Earth (1 year = 2pi units of time)
      const yrs = localTime / (2 * Math.PI);
      return `${yrs.toFixed(2)} Earth Years`;
    }
    if (selectedObject.type === "Binary") {
      const yrs = localTime / (2 * Math.PI);
      return `${yrs.toFixed(2)} Barycentric Cycles`;
    }
    if (selectedObject.type === "BlackHole") {
      return `${localTime.toFixed(1)} Horizon Secs`;
    }
    if (selectedObject.type === "Pulsar") {
      const spinRate = Number(sliderValues.spinRate) || Number(selectedObject.simulationParams.spinRate) || 5;
      const rotations = localTime * spinRate;
      return `${Math.floor(rotations)} Rotations`;
    }
    return `${localTime.toFixed(1)}s`;
  };

  const totalDist = getDistanceLy(selectedObject.encyclopedia.classificationData);
  const isEarth = selectedObject.id === "earth";
  const displayDist = isEarth ? 0 : (zoomData.isZooming ? zoomData.remainingDistance : totalDist);
  const distLabel = zoomData.isZooming ? "Distance to Target" : "Distance from Earth";

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-4 rounded-full border border-cyan-500/30 bg-black/80 backdrop-blur-xl shadow-[0_0_30px_rgba(0,255,255,0.1)] z-20 w-[90%] max-w-4xl pointer-events-auto transition-opacity duration-500">
      {/* Play/Pause Button */}
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className={`p-3 rounded-full border transition-colors flex items-center justify-center cursor-pointer ${
          isPlaying
            ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 shadow-[0_0_15px_rgba(0,255,255,0.1)]"
            : "border-gray-500/30 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
        }`}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>

      {/* Conditional Timeline scrubber or clock */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        {isEvent ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] text-gray-500 font-mono">
              <span className="uppercase tracking-wider">Event Progress</span>
              <span className="text-cyan-400 font-bold font-mono">{(eventProgress * 100).toFixed(0)}%</span>
            </div>
            <div className="relative h-1.5 flex items-center">
              <div className="absolute inset-0 rounded-full bg-white/10" />
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                style={{ width: `${eventProgress * 100}%` }}
              />
              <input
                type="range"
                min="0"
                max="0.99"
                step="0.01"
                value={eventProgress}
                onChange={(e) => setSliderValue("eventProgress", Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 select-none">
            <div className="p-2 bg-cyan-500/10 rounded-full border border-cyan-500/20">
              <Clock size={16} className="text-cyan-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Chronometer</span>
              <span className="text-sm font-mono font-bold text-white tabular-nums leading-none mt-0.5">{formatTime()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="h-8 w-px bg-white/10 shrink-0" />

      {/* Distance Display */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="p-2 bg-cyan-500/10 rounded-full border border-cyan-500/20">
          <Navigation2 size={16} className="text-cyan-400 -rotate-45" />
        </div>
        <div className="flex flex-col min-w-24">
          <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono select-none truncate">{distLabel}</span>
          <span className="text-sm font-mono font-bold text-white tabular-nums leading-none mt-0.5 truncate">{formatDistance(displayDist)}</span>
        </div>
      </div>

      {/* Separator */}
      <div className="h-8 w-px bg-white/10 shrink-0" />

      {/* Speed multiplier control */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono select-none">Speed</span>
        </div>
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
          {[
            { label: "Realtime", value: 0.000000001 },
            { label: "1x", value: 1.0 },
            { label: "10x", value: 10.0 },
            { label: "100x", value: 100.0 },
            { label: "1000x", value: 1000.0 }
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => setTimeScale(opt.value)}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                (timeScale === opt.value || (opt.label === "Realtime" && timeScale < 0.01))
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                  : "bg-transparent text-gray-400 border border-transparent hover:bg-white/10 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
