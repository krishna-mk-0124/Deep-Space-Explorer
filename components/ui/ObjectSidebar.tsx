"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Star,
  Orbit,
  Zap,
  Atom,
  ChevronRight,
  Search,
  Flame,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useExplorer, CelestialObject } from "@/store/explorerStore";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  Orbital: <Globe size={14} />,
  Binary: <Star size={14} />,
  BlackHole: <Atom size={14} />,
  Pulsar: <Zap size={14} />,
  Cluster: <Orbit size={14} />,
  GalaxyCollision: <Orbit size={14} />,
  Supernova: <Flame size={14} />,
};

const TYPE_COLORS: Record<string, string> = {
  Orbital: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  Binary: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  BlackHole: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  Pulsar: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  Cluster: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  GalaxyCollision: "text-red-400 bg-red-500/10 border-red-500/30",
  Supernova: "text-pink-400 bg-pink-500/10 border-pink-500/30",
};

const TYPE_GLOW: Record<string, string> = {
  Orbital: "shadow-cyan-500/20",
  Binary: "shadow-yellow-500/20",
  BlackHole: "shadow-purple-500/20",
  Pulsar: "shadow-blue-500/20",
  Cluster: "shadow-orange-500/20",
  GalaxyCollision: "shadow-red-500/20",
  Supernova: "shadow-pink-500/20",
};

const TYPE_ORDER = ["BlackHole", "Pulsar", "Binary", "Orbital", "Cluster", "GalaxyCollision", "Supernova"];
const TYPE_LABELS: Record<string, string> = {
  Orbital: "Orbital Systems",
  Binary: "Binary Stars",
  BlackHole: "Black Holes",
  Pulsar: "Pulsars & Magnetars",
  Cluster: "Star Clusters",
  GalaxyCollision: "Galactic Collisions",
  Supernova: "Supernova Events",
};

function ObjectCard({
  obj,
  isSelected,
  onClick,
}: {
  obj: CelestialObject;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      id={`object-${obj.id}`}
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 4 }}
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-200 cursor-pointer group ${
        isSelected
          ? `border-white/20 bg-white/8 shadow-lg ${TYPE_GLOW[obj.type]}`
          : "border-transparent hover:border-white/10 hover:bg-white/4"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Color dot */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-white/20"
          style={{ backgroundColor: obj.color }}
        />
        <span className={`text-sm font-medium truncate ${isSelected ? "text-white" : "text-gray-300 group-hover:text-white"}`}>
          {obj.name}
        </span>
        {isSelected && (
          <ChevronRight size={12} className="ml-auto text-gray-400 flex-shrink-0" />
        )}
      </div>
      {isSelected && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="text-xs text-gray-500 mt-1 pl-4 leading-relaxed line-clamp-2"
        >
          {obj.description}
        </motion.p>
      )}
    </motion.button>
  );
}

export default function ObjectSidebar() {
  const { objects, selectedObject, setSelectedObject } = useExplorer();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!search) return objects;
    const q = search.toLowerCase();
    return objects.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.type.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q)
    );
  }, [objects, search]);

  const grouped = useMemo(() => {
    const g: Record<string, CelestialObject[]> = {};
    for (const obj of filtered) {
      if (!g[obj.type]) g[obj.type] = [];
      g[obj.type].push(obj);
    }
    return g;
  }, [filtered]);

  const toggleGroup = (type: string) => {
    setCollapsed((c) => ({ ...c, [type]: !c[type] }));
  };

  return (
    <motion.aside
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
      className="w-72 h-full flex flex-col border-r border-white/8 bg-black/60 backdrop-blur-xl z-10 flex-shrink-0"
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-white/8">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs text-gray-500 tracking-widest uppercase font-light">
            Deep Space Explorer
          </span>
        </div>
        <h2 className="text-white font-semibold text-lg tracking-wide">Object Library</h2>
        <p className="text-gray-600 text-xs mt-0.5">{objects.length} celestial objects</p>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
          <Search size={13} className="text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search objects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-gray-300 placeholder-gray-600 outline-none w-full"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scrollbar-thin">
        {TYPE_ORDER.map((type) => {
          const group = grouped[type];
          if (!group || group.length === 0) return null;
          const isCollapsed = collapsed[type];

          return (
            <div key={type} className="mb-2">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(type)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md mb-1 cursor-pointer transition-colors hover:bg-white/4 ${TYPE_COLORS[type]}`}
              >
                <span className={`${TYPE_COLORS[type]}`}>{TYPE_ICONS[type]}</span>
                <span className="text-xs font-semibold tracking-wider uppercase flex-1 text-left">
                  {TYPE_LABELS[type]}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${TYPE_COLORS[type]}`}>
                  {group.length}
                </span>
                <motion.span
                  animate={{ rotate: isCollapsed ? -90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight size={11} />
                </motion.span>
              </button>

              {/* Objects */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-0.5 pl-1 overflow-hidden"
                  >
                    {group.map((obj) => (
                      <ObjectCard
                        key={obj.id}
                        obj={obj}
                        isSelected={selectedObject?.id === obj.id}
                        onClick={() => setSelectedObject(obj.id)}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600 text-sm">
            No objects match your search.
          </div>
        )}
      </div>

      {/* Footer status */}
      <div className="px-4 py-3 border-t border-white/8">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-600">Physics engine active</span>
        </div>
      </div>
    </motion.aside>
  );
}
