"use client";

import { useExplorer } from "@/store/explorerStore";
import { Play, Pause, Clock } from "lucide-react";
import { useEffect, useState } from "react";

export default function SimulationTimeline() {
  const { selectedObject, sliderValues, setSliderValue, timeScale, setTimeScale, isPlaying, setIsPlaying } = useExplorer();
  const [localTime, setLocalTime] = useState(0);

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

      // Update simulation time
      setLocalTime(prev => prev + delta * timeScale);

      // If it's an event (GalaxyCollision or Supernova), auto-advance progress
      if (selectedObject && (selectedObject.type === "GalaxyCollision" || selectedObject.type === "Supernova")) {
        const currentProgress = Number(sliderValues.eventProgress) ?? 0.0;
        // Advance progress: loops at 1.0, takes about 25 seconds at 1x speed
        const nextProgress = (currentProgress + delta * 0.04 * timeScale) % 1.0;
        setSliderValue("eventProgress", Number(nextProgress.toFixed(3)));
      }

      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, timeScale, selectedObject, sliderValues.eventProgress, setSliderValue]);

  if (!selectedObject) return null;

  const isEvent = selectedObject.type === "GalaxyCollision" || selectedObject.type === "Supernova";
  const eventProgress = Number(sliderValues.eventProgress) ?? 0.0;

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

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-3 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl z-20 w-[90%] max-w-lg pointer-events-auto">
      {/* Play/Pause Button */}
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className={`p-2.5 rounded-full border transition-colors flex items-center justify-center cursor-pointer ${
          isPlaying
            ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
            : "border-gray-500/30 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
        }`}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
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
          <div className="flex items-center gap-2 select-none">
            <Clock size={12} className="text-gray-500" />
            <div className="flex flex-col">
              <span className="text-[8px] uppercase tracking-wider text-gray-600 font-mono">Chronometer</span>
              <span className="text-xs font-mono font-bold text-gray-300 truncate leading-none mt-0.5">{formatTime()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-white/10" />

      {/* Speed multiplier control */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wider text-gray-600 font-mono select-none">Speed</span>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/8">
          <span className="text-xs font-mono font-bold text-cyan-400 w-10 text-center select-none">
            {timeScale.toFixed(1)}x
          </span>
          <input
            type="range"
            min="0.1"
            max="10.0"
            step="0.1"
            value={timeScale}
            onChange={(e) => setTimeScale(Number(e.target.value))}
            className="w-16 h-1 cursor-pointer accent-cyan-400"
          />
        </div>
      </div>
    </div>
  );
}
