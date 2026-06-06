"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import celestialData from "@/data/celestialDatabase.json";

export type EncyclopediaData = {
  overview: string;
  physicsHighlights: string;
  interestingFacts: string[];
  classificationData: Record<string, string>;
};

export type CelestialObject = {
  id: string;
  name: string;
  type: "Orbital" | "Binary" | "BlackHole" | "Pulsar" | "Cluster" | "GalaxyCollision" | "Supernova";
  mass: number;
  radius: number;
  color: string;
  description: string;
  encyclopedia: EncyclopediaData;
  simulationParams: Record<string, number | string>;
};

type SliderValues = Record<string, number>;

interface ExplorerContextType {
  objects: CelestialObject[];
  selectedObject: CelestialObject | null;
  sliderValues: SliderValues;
  setSelectedObject: (id: string) => void;
  setSliderValue: (key: string, value: number) => void;
  timeScale: number;
  setTimeScale: (scale: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  isNarratorEnabled: boolean;
  setIsNarratorEnabled: (enabled: boolean) => void;
  blackHoleRenderMode: "cinematic" | "scientific";
  setBlackHoleRenderMode: (mode: "cinematic" | "scientific") => void;
}

const ExplorerContext = createContext<ExplorerContextType | null>(null);

function buildInitialSliders(obj: CelestialObject): SliderValues {
  const sliders: SliderValues = {};
  for (const [key, val] of Object.entries(obj.simulationParams)) {
    if (typeof val === "number") {
      sliders[key] = val;
    }
  }
  return sliders;
}

export function ExplorerProvider({ children }: { children: React.ReactNode }) {
  const objects = celestialData as unknown as CelestialObject[];
  const initialObject = objects.find(o => o.id === "sagittarius-a") || objects[0];
  const [selectedObject, setSelectedObjectState] = useState<CelestialObject>(initialObject);
  const [sliderValues, setSliderValues] = useState<SliderValues>(
    buildInitialSliders(initialObject)
  );
  const [timeScale, setTimeScale] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isNarratorEnabled, setIsNarratorEnabled] = useState<boolean>(true);
  const [blackHoleRenderMode, setBlackHoleRenderMode] = useState<"cinematic" | "scientific">("cinematic");

  const setSelectedObject = useCallback(
    (id: string) => {
      const obj = objects.find((o) => o.id === id);
      if (!obj) return;
      setSelectedObjectState(obj);
      setSliderValues(buildInitialSliders(obj));
    },
    [objects]
  );

  const setSliderValue = useCallback((key: string, value: number) => {
    setSliderValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <ExplorerContext.Provider
      value={{
        objects,
        selectedObject,
        sliderValues,
        setSelectedObject,
        setSliderValue,
        timeScale,
        setTimeScale,
        isPlaying,
        setIsPlaying,
        isNarratorEnabled,
        setIsNarratorEnabled,
        blackHoleRenderMode,
        setBlackHoleRenderMode,
      }}
    >
      {children}
    </ExplorerContext.Provider>
  );
}

export function useExplorer() {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("useExplorer must be used within ExplorerProvider");
  return ctx;
}
