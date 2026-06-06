"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useExplorer } from "@/store/explorerStore";
import factExplanations from "@/data/factExplanations.json";

type NarrationState = "IDLE" | "PLAYING_OVERVIEW" | "ASKING_FACTS" | "PLAYING_FACTS";

export default function NarrationOverlay() {
  const { selectedObject, isNarratorEnabled } = useExplorer();
  
  const [narrationState, setNarrationState] = useState<NarrationState>("IDLE");
  const [subtitle, setSubtitle] = useState<string>("");
  const [currentFactIndex, setCurrentFactIndex] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    stopSpeaking();

    const cleanText = text.replace(/[☉⊕*]/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Pick deep, professional voice
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => 
      v.name.includes("Google US English") || 
      v.name.includes("Microsoft David") || 
      v.name.includes("Natural") ||
      (v.lang.startsWith("en-") && v.name.toLowerCase().includes("male"))
    ) || voices.find(v => v.lang.startsWith("en-")) || voices[0];

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.rate = 0.88;  // slower tempo for documentary style
    utterance.pitch = 0.94; // slightly deeper pitch

    utterance.onstart = () => {
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    utterRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [stopSpeaking]);

  // Main Effect: Reset when object changes or narrator is disabled
  useEffect(() => {
    stopSpeaking();
    setSubtitle("");
    setNarrationState("IDLE");
    setCurrentFactIndex(0);

    if (!selectedObject || !isNarratorEnabled) return;

    // Start Narration Flow
    const timer = setTimeout(() => {
      setNarrationState("PLAYING_OVERVIEW");
      const introText = `${selectedObject.name}. ${selectedObject.encyclopedia.overview}`;
      setSubtitle(introText);
      speakText(introText, () => {
        // When overview finishes, ask about facts
        setNarrationState("ASKING_FACTS");
        const askText = "Would you like to hear some interesting facts about this object?";
        setSubtitle(askText);
        speakText(askText);
      });
    }, 1000); // 1s delay on load

    return () => clearTimeout(timer);
  }, [selectedObject?.id, isNarratorEnabled, speakText, stopSpeaking]);

  const handleYes = () => {
    stopSpeaking();
    setNarrationState("PLAYING_FACTS");
    setCurrentFactIndex(0);
    playFact(0);
  };

  const handleNo = () => {
    stopSpeaking();
    setNarrationState("IDLE");
    setSubtitle("");
  };

  const playFact = (index: number) => {
    if (!selectedObject) return;
    const facts = selectedObject.encyclopedia.interestingFacts;
    if (index >= facts.length) {
      // Done with facts
      setNarrationState("IDLE");
      setSubtitle("");
      return;
    }

    const factText = facts[index];
    const explanation = (factExplanations as Record<string, string[]>)[selectedObject.id]?.[index] || "";
    const fullText = `${factText}. ${explanation}`;
    
    setSubtitle(fullText);
    speakText(fullText, () => {
      // Move to next fact
      setCurrentFactIndex(index + 1);
      playFact(index + 1);
    });
  };

  if (!isNarratorEnabled || narrationState === "IDLE" || !subtitle) return null;

  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-4xl px-8 z-50 flex flex-col items-center pointer-events-none">
      
      {/* Ask Facts Prompt */}
      <AnimatePresence>
        {narrationState === "ASKING_FACTS" && !isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-4 flex gap-3 pointer-events-auto"
          >
            <button
              onClick={handleYes}
              className="px-6 py-2 rounded-full border border-white/20 bg-black/60 hover:bg-white/10 backdrop-blur-md text-white tracking-[0.2em] uppercase text-xs font-mono transition-colors"
            >
              Yes
            </button>
            <button
              onClick={handleNo}
              className="px-6 py-2 rounded-full border border-white/20 bg-black/60 hover:bg-white/10 backdrop-blur-md text-white/50 hover:text-white tracking-[0.2em] uppercase text-xs font-mono transition-colors"
            >
              No
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Netflix-style Subtitle */}
      <motion.div
        key={subtitle} // Re-animates on text change
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center"
      >
        <p className="inline-block px-6 py-3 rounded-xl bg-black/60 backdrop-blur-md shadow-2xl text-white/95 text-lg md:text-xl font-light tracking-wide leading-relaxed">
          {subtitle}
        </p>
      </motion.div>
    </div>
  );
}
