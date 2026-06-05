<div align="center">
  <h1>🌌 Deep Space Explorer</h1>
  <p><strong>A Real-Time Cinematic 3D Journey Through the Cosmos</strong></p>
  
  [![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![React Three Fiber](https://img.shields.io/badge/React_Three_Fiber-3D-blue?style=for-the-badge&logo=react)](https://docs.pmnd.rs/react-three-fiber/)
  [![Turbopack](https://img.shields.io/badge/Turbopack-Lightning_Fast-ff0000?style=for-the-badge)](https://turbo.build/pack)
</div>

---

Welcome to **Deep Space Explorer**, a professional-grade web application built for astronomy enthusiasts and casual stargazers alike. Explore the universe through a breathtaking 5-stage cinematic story, followed by an interactive dashboard that places the physics of the cosmos directly at your fingertips.

## 🚀 The Cinematic Cosmic Journey

Upon entering the application, users are greeted with a movie-like chronological sequence of the universe's evolution. Every stage features seamless, crossfade transitions and auto-narrated documentary-style voiceovers with staggered, glassmorphic subtitles.

- **Stage 0: The Big Bang** — A dual-shell explosion consisting of an inner hot white/orange core and an outer cool blue/purple expanding envelope, complete with an exponential camera shake decay.
- **Stage 1: The Cosmic Web** — 6,000 individual filamentary dark matter particles react dynamically to spring-based mouse gravity.
- **Stage 2: Stellar Ignition** — Witness the birth of a star, featuring a 3-layer corona, a 3,000-particle Keplerian accretion disk, bipolar helical relativistic jets, and magnetic coronal loop arcs.
- **Stage 3: Worlds Awakening** — A cinematic edge-on camera sweep through a newly formed planetary system containing a lava world, an ocean planet, an ice world, and a gas giant with 3 rings, all nestled inside a 2,500-asteroid belt with a passing comet.
- **Stage 4: The Grand Cosmos** — A 12,000-particle, 4-arm spiral galaxy utilizing a custom diffraction-spike star shader and interactive mouse parallax tilt.

## 🔭 Real-Time 3D Astrophysics Engine

Navigate to the `/explore` dashboard to interact with over **100+ unique celestial objects**. Our simulation doesn't just look pretty—it fundamentally relies on astrophysical formulas to dictate motion and rendering.

*   **Diverse Cosmic Phenomena:** Observe Orbital systems, Binary Stars, active Black Holes, sweeping Pulsars, Galactic Collisions, and Supernovae in real-time.
*   **Scientifically Accurate Star Clusters:** 
    *   *Globular Clusters:* Densely compact, populated with old, red giant stars.
    *   *Open Clusters:* Loosely bound, featuring young, hot blue stars.
    *   *Super Star Clusters:* Containing the brightest OB supergiants.
*   **Unique Renders:** Over a dozen named clusters (e.g., *R136*, *Hyades*, *M15*, *Westerlund 1*, *Pleiades*, *Omega Centauri*, and more) boast unique, Hubble-quality texturing and profile-driven flattening/concentration metrics.
*   **Custom GLSL Shaders:** Advanced shaders dictate per-particle sizing, distance-based alpha fading, and breathtaking diffraction spikes on high-magnitude stars.

## 🎛️ Interactive Physics Control & Telemetry

You are in control of the universe. The Interactive Dashboard features:
*   **Physics Manipulators:** Real-time sliders to alter mass, gravitational constants, and orbital speeds. Watch the 3D scene instantaneously adapt and recount orbit trails!
*   **Chronological Scrubbing:** A bottom simulation timeline bar allowing you to play, pause, apply time-scale multipliers, and scrub through cosmic events.
*   **Information Overlay:** Delve deep into the *Overview*, *Facts*, and *Data Table* tabs for every selected object.
*   **Web Speech API Integration:** Sit back and let the deep, documentary-style voice narrator explain the intricacies of your selected object.

## 🛠️ Technology Stack

*   **Framework:** Next.js 16.2.6 (Turbopack Enabled)
*   **Graphics:** React Three Fiber & Three.js
*   **Animation:** Framer Motion (Glassmorphic UI, Subtitles, Micro-interactions)
*   **Audio/Accessibility:** Web Speech API

## ⚙️ Getting Started

To run the Deep Space Explorer locally:

```bash
# Clone the repository
git clone https://github.com/krishna-mk-0124/Deep-Space-Explorer.git

# Navigate to the directory
cd Deep-Space-Explorer

# Install dependencies
npm install

# Run the development server (Memory limits expanded for optimal turbopack performance)
$env:NODE_OPTIONS="--max-old-space-size=4096"; npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or whichever port is assigned) to enter the cosmos!

---
*Developed by Achut Mahadev Kadam (krishna0124@gmail.com)*
