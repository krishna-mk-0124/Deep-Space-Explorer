"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useExplorer } from "@/store/explorerStore";
import {
  SlidersHorizontal,
  BookOpen,
  Zap,
  Star,
  ChevronDown,
  ChevronUp,
  Info,
  Table2,
  Volume2,
  VolumeX,
} from "lucide-react";
import factExplanations from "@/data/factExplanations.json";

interface SliderConfig {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  description?: string;
}

const SLIDER_CONFIGS: Record<string, SliderConfig[]> = {
  Orbital: [
    { key: "centralBodyMass", label: "Star Mass", min: 10, max: 500, step: 5, unit: "M☉", description: "Mass of the central star" },
    { key: "orbitalDistance", label: "Orbital Distance", min: 2, max: 20, step: 0.5, unit: "AU", description: "Distance from central star" },
    { key: "eccentricity", label: "Eccentricity", min: 0.0, max: 0.85, step: 0.05, unit: "", description: "Orbital eccentricity (0 = circular)" },
    { key: "precessionRate", label: "GR Precession", min: 0.0, max: 4.0, step: 0.1, unit: "×", description: "General Relativistic precession correction" },
  ],
  Binary: [
    { key: "star1Mass", label: "Primary Mass", min: 10, max: 500, step: 5, unit: "M☉", description: "Mass of the larger star" },
    { key: "star2Mass", label: "Secondary Mass", min: 10, max: 400, step: 5, unit: "M☉", description: "Mass of the companion star" },
    { key: "separation", label: "Separation", min: 2, max: 20, step: 0.5, unit: "AU", description: "Distance between the two stars" },
    { key: "eccentricity", label: "Eccentricity", min: 0.0, max: 0.8, step: 0.05, unit: "", description: "Stellar orbit orbital eccentricity" },
    { key: "inclination", label: "Inclination", min: 0, max: 80, step: 1, unit: "°", description: "Orbital plane tilt relative to line of sight" },
    { key: "periapsisAngle", label: "Argument of Periapsis", min: 0, max: 360, step: 5, unit: "°", description: "Orientation of eccentric orbit ellipse" },
  ],
  BlackHole: [
    { key: "mass", label: "Black Hole Mass", min: 10, max: 200, step: 5, unit: "×10⁶ M☉", description: "Event horizon radius scale" },
    { key: "accretionDiskDensity", label: "Accretion Density", min: 200, max: 3500, step: 100, unit: "particles", description: "Volumetric accretion gas particles" },
    { key: "lensStrength", label: "Lensing Strength", min: 0.0, max: 2.0, step: 0.05, unit: "×", description: "Gravitational lensing light deflection scale" },
    { key: "jetIntensity", label: "Jet Intensity", min: 0.0, max: 1.5, step: 0.05, unit: "outflow", description: "Magnetic polar outflow beam power" },
  ],
  Pulsar: [
    { key: "spinRate", label: "Spin Rate", min: 0.1, max: 50, step: 0.1, unit: "Hz", description: "Pulsar rotations per second" },
    { key: "magneticFieldStrength", label: "Magnetic Field", min: 1, max: 12, step: 0.5, unit: "×10¹² G", description: "Intensity of magnetic field lines" },
    { key: "beamLength", label: "Beam Length", min: 2, max: 15, step: 0.5, unit: "×10⁴ km", description: "Reach of polar electromagnetic radiation" },
    { key: "particleCount", label: "Beam Density", min: 50, max: 500, step: 10, unit: "", description: "Collimated radiation particle density" },
    { key: "dipoleTilt", label: "Dipole Tilt", min: 0, max: 45, step: 1, unit: "°", description: "Magnetic axis tilt relative to spin axis" },
  ],
  Cluster: [
    { key: "starCount", label: "Star Count", min: 50, max: 500, step: 10, unit: "", description: "Number of stellar bodies rendered" },
    { key: "clusterRadius", label: "Cluster Radius", min: 3, max: 18, step: 0.5, unit: "pc", description: "Physical boundary radius of cluster" },
    { key: "gravityStrength", label: "Gravity Strength", min: 0.1, max: 3, step: 0.05, unit: "×", description: "Cluster potential binding pull" },
    { key: "rotationSpeed", label: "Rotation Speed", min: 0, max: 0.5, step: 0.01, unit: "rad/s", description: "Angular rotation velocity" },
  ],
  GalaxyCollision: [
    { key: "eventProgress", label: "Time Slider", min: 0.0, max: 1.0, step: 0.01, unit: "", description: "Scrub through the galaxy collision event" },
    { key: "galaxyRadius", label: "Galaxy Radius", min: 10, max: 100, step: 1, unit: "kly", description: "Radius of the primary galaxy" },
    { key: "particleCount", label: "Particle Count", min: 1000, max: 50000, step: 1000, unit: "", description: "Number of stellar bodies" },
    { key: "spinRate", label: "Spin Rate", min: 0.0, max: 0.2, step: 0.01, unit: "rad/s", description: "Rotation speed of the galaxy" },
  ],
  Supernova: [
    { key: "eventProgress", label: "Time Slider", min: 0.0, max: 1.0, step: 0.01, unit: "", description: "Scrub through the supernova lifecycle" },
    { key: "expansionRate", label: "Expansion Rate", min: 0.0, max: 1.0, step: 0.01, unit: "", description: "Speed of the expanding nebula" },
    { key: "maxRadius", label: "Max Radius", min: 5, max: 50, step: 1, unit: "ly", description: "Maximum extent of the ejecta" },
    { key: "particleCount", label: "Particle Count", min: 1000, max: 50000, step: 1000, unit: "", description: "Density of the nebula gas" },
  ],
};

const TYPE_ACCENTS: Record<string, { border: string; text: string; bg: string; glow: string }> = {
  Orbital:  { border: "border-cyan-500/30",   text: "text-cyan-400",   bg: "bg-cyan-500/10",   glow: "shadow-cyan-500/20" },
  Binary:   { border: "border-yellow-500/30", text: "text-yellow-400", bg: "bg-yellow-500/10", glow: "shadow-yellow-500/20" },
  BlackHole:{ border: "border-purple-500/30", text: "text-purple-400", bg: "bg-purple-500/10", glow: "shadow-purple-500/20" },
  Pulsar:   { border: "border-blue-500/30",   text: "text-blue-400",   bg: "bg-blue-500/10",   glow: "shadow-blue-500/20" },
  Cluster:  { border: "border-orange-500/30", text: "text-orange-400", bg: "bg-orange-500/10", glow: "shadow-orange-500/20" },
  GalaxyCollision: { border: "border-red-500/30", text: "text-red-400", bg: "bg-red-500/10", glow: "shadow-red-500/20" },
  Supernova: { border: "border-pink-500/30", text: "text-pink-400", bg: "bg-pink-500/10", glow: "shadow-pink-500/20" },
};

function PhysicsSlider({
  config, value, onChange, accent,
}: {
  config: SliderConfig;
  value: number;
  onChange: (v: number) => void;
  accent: (typeof TYPE_ACCENTS)[string];
}) {
  const pct = ((value - config.min) / (config.max - config.min)) * 100;
  const displayVal = value % 1 !== 0 ? value.toFixed(2) : String(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400 font-medium">{config.label}</label>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${accent.border} ${accent.bg}`}>
          <span className={`text-xs font-mono font-bold ${accent.text}`}>{displayVal}</span>
          {config.unit && <span className="text-xs text-gray-600 ml-0.5">{config.unit}</span>}
        </div>
      </div>
      <div className="relative h-2">
        <div className="absolute inset-0 rounded-full bg-white/6" />
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, currentColor, transparent)` }}
        />
        <input
          type="range"
          min={config.min} max={config.max} step={config.step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white/40 bg-gray-900 pointer-events-none shadow-lg`}
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
      {config.description && <p className="text-xs text-gray-700">{config.description}</p>}
    </div>
  );
}

export default function DashboardOverlay() {
  const { selectedObject, sliderValues, setSliderValue, isNarratorEnabled, setIsNarratorEnabled, blackHoleRenderMode, setBlackHoleRenderMode } = useExplorer();
  const [expandedFact, setExpandedFact] = useState<number | null>(null);

  if (!selectedObject) return null;

  const sliders = SLIDER_CONFIGS[selectedObject.type] || [];
  const accent = TYPE_ACCENTS[selectedObject.type] || TYPE_ACCENTS.Orbital;
  const enc = selectedObject.encyclopedia;

  // Get dynamic instantaneous orbital velocity to display in Data table
  const getDynamicVelocity = () => {
    if (selectedObject.type !== "Orbital") return null;
    const centralBodyMass = sliderValues.centralBodyMass ?? Number(selectedObject.simulationParams.centralBodyMass) ?? 100;
    const a = sliderValues.orbitalDistance ?? Number(selectedObject.simulationParams.orbitalDistance) ?? 6;
    
    // Circular orbital speed: v = sqrt(G * M / a)
    const G_GRAVITY = 2.0;
    const baseSpeed = Math.sqrt((G_GRAVITY * centralBodyMass) / a);
    return `${(baseSpeed * 11.2).toFixed(1)} km/s (${(baseSpeed * 2.3).toFixed(2)} AU/yr)`;
  };

  return (
    <motion.aside
      key={selectedObject.id}
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.45, type: "spring", stiffness: 130 }}
      className="w-80 h-full flex flex-col border-l border-white/8 bg-black/75 backdrop-blur-2xl z-10 flex-shrink-0"
    >
      {/* Header */}
      <div className={`px-4 pt-4 pb-3 border-b ${accent.border} flex-shrink-0 relative`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-bold tracking-wider uppercase ${accent.border} ${accent.bg} ${accent.text}`}>
            {selectedObject.type}
          </span>
          <button
            onClick={() => setIsNarratorEnabled(!isNarratorEnabled)}
            className={`px-2 py-1 rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
              !isNarratorEnabled 
                ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20" 
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
            }`}
            title={!isNarratorEnabled ? "Enable Voice Narrator" : "Disable Voice Narrator"}
          >
            {!isNarratorEnabled ? <VolumeX size={12} /> : <Volume2 size={12} />}
            <span className="text-[9px] uppercase font-mono tracking-wider">{isNarratorEnabled ? 'Narrator ON' : 'Narrator OFF'}</span>
          </button>
        </div>
        <h2 className="text-white font-bold text-lg leading-tight mb-2 select-none">{selectedObject.name}</h2>
        <div className="flex gap-1.5">
          <div className="flex-1 bg-white/4 border border-white/8 rounded-lg px-2 py-1 text-center">
            <p className="text-gray-600 text-[10px] uppercase font-mono">Mass</p>
            <p className="text-white text-xs font-mono font-semibold truncate mt-0.5">
              {selectedObject.mass >= 1e9
                ? `${(selectedObject.mass / 1e9).toFixed(1)}B`
                : selectedObject.mass >= 1e6
                ? `${(selectedObject.mass / 1e6).toFixed(1)}M`
                : selectedObject.mass} M☉
            </p>
          </div>
          <div className="flex-1 bg-white/4 border border-white/8 rounded-lg px-2 py-1 text-center">
            <p className="text-gray-600 text-[10px] uppercase font-mono">Radius</p>
            <p className="text-white text-xs font-mono font-semibold mt-0.5">
              {selectedObject.radius >= 1000
                ? `${(selectedObject.radius / 1000).toFixed(1)}k`
                : selectedObject.radius} R⊕
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin pb-6">
        
        {/* PHYSICS SLIDERS */}
        <div className="px-4 py-4 space-y-5 border-b border-white/6">
          <div className="flex items-center gap-2 select-none">
            <SlidersHorizontal size={12} className="text-gray-500" />
            <span className="text-xs text-gray-500 tracking-widest uppercase">Physics Controls</span>
          </div>
          {sliders.map((config) => (
            <PhysicsSlider
              key={config.key}
              config={config}
              value={sliderValues[config.key] ?? (selectedObject.simulationParams[config.key] !== undefined ? Number(selectedObject.simulationParams[config.key]) : config.min)}
              onChange={(v) => setSliderValue(config.key, v)}
              accent={accent}
            />
          ))}
          <div className="pt-2 border-t border-white/6 select-none">
            <div className="grid grid-cols-2 gap-2">
              {selectedObject.type === "BlackHole" ? (
                <div 
                  className={`bg-white/3 rounded-lg p-2 border ${accent.border} cursor-pointer hover:${accent.bg} transition-colors group`}
                  onClick={() => setBlackHoleRenderMode(blackHoleRenderMode === "cinematic" ? "scientific" : "cinematic")}
                  title="Click to toggle rendering style"
                >
                  <p className="text-gray-400 text-[10px] uppercase font-mono flex items-center justify-between mb-1">
                    Render Mode
                    <span className={`text-[8px] px-1 py-0.5 rounded border ${accent.border} ${accent.text} group-hover:bg-white/10`}>
                      TOGGLE
                    </span>
                  </p>
                  <p className={`text-[11px] font-mono font-bold mt-0.5 ${accent.text}`}>
                    {blackHoleRenderMode === "cinematic" ? "Cinematic Shader" : "Particle System"}
                  </p>
                </div>
              ) : (
                <div className="bg-white/3 rounded-lg p-2 border border-white/6">
                  <p className="text-gray-600 text-[10px] uppercase font-mono">Render</p>
                  <p className="text-gray-400 text-xs font-mono mt-0.5">WebGL 2.0</p>
                </div>
              )}
              <div className="bg-white/3 rounded-lg p-2 border border-white/6">
                <p className="text-gray-600 text-[10px] uppercase font-mono">Physics</p>
                <p className={`text-xs font-mono mt-0.5 ${accent.text}`}>
                  {selectedObject.type === "Cluster" ? "Plummer Ptl" :
                   selectedObject.type === "Binary" ? "Keplerian" :
                   selectedObject.type === "Orbital" ? "Keplerian" :
                   selectedObject.type === "BlackHole" ? "GR Lensing" : 
                   (selectedObject.type === "GalaxyCollision" || selectedObject.type === "Supernova") ? "Event Shader" : "Newtonian"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="px-4 py-4 space-y-4 border-b border-white/6">
          <div className="flex items-center gap-2 mb-1 select-none">
            <Table2 size={12} className={accent.text} />
            <span className="text-xs text-gray-500 tracking-widest uppercase">Classification Data</span>
          </div>
          <div className={`rounded-xl border ${accent.border} overflow-hidden`}>
            {Object.entries(enc.classificationData).map(([key, val], i) => (
              <div
                key={key}
                className={`flex items-start gap-2 px-3 py-2.5 ${i % 2 === 0 ? "bg-white/3" : "bg-transparent"} ${i > 0 ? "border-t border-white/6" : ""}`}
              >
                <span className="text-gray-600 text-xs font-medium w-24 flex-shrink-0">{key}</span>
                <span className={`text-xs font-mono flex-1 ${accent.text}`}>{val}</span>
              </div>
            ))}

            {/* Append dynamic velocity for Orbital systems */}
            {selectedObject.type === "Orbital" && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-white/3 border-t border-white/6">
                <span className="text-gray-600 text-xs font-medium w-24 flex-shrink-0">Orbit Speed</span>
                <span className={`text-xs font-mono flex-1 ${accent.text}`}>{getDynamicVelocity()}</span>
              </div>
            )}
          </div>

          <div className="bg-white/3 rounded-lg border border-white/8 p-3">
            <div className="flex items-center gap-1.5 mb-1.5 select-none">
              <Info size={11} className="text-gray-600" />
              <span className="text-xs text-gray-600 uppercase tracking-wider font-mono">Summary</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{selectedObject.description}</p>
          </div>
        </div>

        {/* OVERVIEW AND FACTS (ONLY VISIBLE IF NARRATOR IS DISABLED) */}
        <AnimatePresence>
          {!isNarratorEnabled && enc && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {/* ENCYCLOPEDIA OVERVIEW */}
              <div className="px-4 py-4 space-y-4 border-b border-white/6">
                <div className="flex items-start gap-2">
                  <BookOpen size={13} className={`${accent.text} flex-shrink-0 mt-0.5`} />
                  <p className="text-gray-400 text-xs leading-relaxed">{enc.overview}</p>
                </div>

                <div className={`rounded-xl border ${accent.border} ${accent.bg} p-3 space-y-2`}>
                  <div className="flex items-center gap-1.5 mb-1 select-none">
                    <Zap size={11} className={accent.text} />
                    <span className={`text-xs font-semibold tracking-wider uppercase ${accent.text}`}>Physics Spotlight</span>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">{enc.physicsHighlights}</p>
                </div>
              </div>

              {/* FACTS */}
              <div className="px-4 py-4 space-y-2">
                <div className="flex items-center gap-2 mb-3 select-none">
                  <Star size={12} className={accent.text} />
                  <span className="text-xs text-gray-500 tracking-widest uppercase">Did You Know?</span>
                </div>
                {enc.interestingFacts.map((fact, i) => {
                  const explanation = (factExplanations as Record<string, string[]>)[selectedObject.id]?.[i] ||
                    "Deep astronomical and physical dynamics are currently being evaluated for this object.";
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border ${accent.border} bg-white/3 overflow-hidden`}
                    >
                      <button
                        onClick={() => setExpandedFact(expandedFact === i ? null : i)}
                        className="w-full flex items-start gap-2.5 p-3 text-left cursor-pointer transition-colors hover:bg-white/1.5"
                      >
                        <span className={`flex-shrink-0 w-5 h-5 rounded-full ${accent.bg} ${accent.text} flex items-center justify-center text-[10px] font-bold`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 flex items-start justify-between gap-2.5">
                          <span className="text-xs text-gray-300 leading-relaxed flex-1">{fact}</span>
                          <span className="text-gray-500 mt-0.5 flex-shrink-0">
                            {expandedFact === i ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </span>
                        </div>
                      </button>
                      <AnimatePresence initial={false}>
                        {expandedFact === i && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="border-t border-white/6 bg-white/1 px-3.5 py-2.5 text-xs text-gray-400 leading-relaxed"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`font-mono text-[9px] uppercase tracking-wider ${accent.text}`}>
                                Astrophysical Analysis
                              </span>
                            </div>
                            {explanation}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
      </div>
    </motion.aside>
  );
}
