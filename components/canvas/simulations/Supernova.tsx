"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialObject, useExplorer } from "@/store/explorerStore";

interface Props {
  params: Record<string, number | string>;
  object: CelestialObject;
}

const supernovaVertexShader = `
  uniform float uEventProgress;
  attribute float size;
  attribute vec3 color;
  attribute vec3 velocity;
  varying vec3 vColor;
  varying float vAlphaMult;
  void main() {
    float activeProgress = max(0.0, uEventProgress - 0.1) * 1.11;
    float speed = length(velocity);
    
    // Blackbody thermodynamic cooling:
    // Faster, denser knots (Rayleigh-Taylor fingers) retain heat longer.
    float coolingRate = 1.0 + (25.0 / (speed + 1.0)); 
    float t = activeProgress * coolingRate;
    
    vec3 cBlue = vec3(0.5, 0.8, 1.0);
    vec3 cWhite = vec3(1.0, 1.0, 1.0);
    vec3 cYellow = vec3(1.0, 0.8, 0.2);
    vec3 cOrange = vec3(1.0, 0.4, 0.0);
    vec3 cRed = vec3(0.3, 0.0, 0.0);
    
    vec3 currentC;
    if (t < 0.1) {
       currentC = mix(cBlue, cWhite, t / 0.1);
    } else if (t < 0.3) {
       currentC = mix(cWhite, cYellow, (t - 0.1) / 0.2);
    } else if (t < 0.6) {
       currentC = mix(cYellow, cOrange, (t - 0.3) / 0.3);
    } else if (t < 1.0) {
       currentC = mix(cOrange, cRed, (t - 0.6) / 0.4);
    } else {
       currentC = mix(cRed, vec3(0.0), clamp((t - 1.0) / 0.5, 0.0, 1.0));
    }
    
    // Mix the inherent particle color with the global thermodynamic curve
    vColor = mix(color, currentC, min(activeProgress * 4.0, 1.0));
    
    // Sedov-Taylor expansion phase (sweeping up interstellar medium causes deceleration)
    float k = 4.0;
    float expFactor = (1.0 - exp(-activeProgress * k)) / k;
    vec3 newPos = position + velocity * expFactor;
    
    vAlphaMult = 1.0 - pow(activeProgress, 2.0);
    
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_PointSize = size * (1.0 + activeProgress * 15.0) * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const supernovaFragmentShader = `
  varying vec3 vColor;
  varying float vAlphaMult;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    
    // Soft volume particle
    float alpha = pow(1.0 - (dist * 2.0), 1.5);
    gl_FragColor = vec4(vColor, alpha * 0.08 * vAlphaMult);
  }
`;

// 3D Curl/Sine Noise for Rayleigh-Taylor Instabilities
function get3DNoise(x: number, y: number, z: number) {
  const n1 = Math.sin(x*2.0) * Math.sin(y*2.0) * Math.sin(z*2.0);
  const n2 = Math.sin(x*4.0 + 1.0) * Math.sin(y*4.0 - 2.0) * Math.sin(z*4.0 + 3.0);
  const n3 = Math.sin(x*8.0 - 1.5) * Math.sin(y*8.0 + 0.5) * Math.sin(z*8.0 - 1.0);
  return n1 * 0.6 + n2 * 0.3 + n3 * 0.1;
}

function SphericalSupernova({ eventProgress }: { eventProgress: number }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const { timeScale, isPlaying } = useExplorer();
  
  const { positions, colors, sizes, velocities } = useMemo(() => {
    // 150k particles for massive physical depth
    const count = 150000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const vel = new Float32Array(count * 3);
    
    const cBlue = new THREE.Color("#88ccff");
    const cWhite = new THREE.Color("#ffffff");
    
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      
      const r = Math.pow(Math.random(), 0.3) * 2.5; 
      
      const dirX = Math.sin(phi) * Math.cos(theta);
      const dirY = Math.sin(phi) * Math.sin(theta);
      const dirZ = Math.cos(phi);
      
      pos[i*3] = dirX * r;
      pos[i*3+1] = dirY * r;
      pos[i*3+2] = dirZ * r;
      
      // Rayleigh-Taylor Instabilities
      // The shockwave tears through the stellar envelope creating dense, fast-moving fingers of heavy elements
      const clump = get3DNoise(dirX * 3.0, dirY * 3.0, dirZ * 3.0);
      const finger = Math.max(0.0, clump * 2.5); // Sharp, distinct fingers
      
      const isShell = Math.random() > 0.7;
      // The fingers blast out at up to 70 units/sec, standard ejecta at 15
      const speed = isShell ? (Math.random() * 10.0 + 15.0 + finger * 55.0) : (Math.random() * 8.0 + 2.0);
      
      const turbX = dirX + (Math.random() - 0.5) * 0.4;
      const turbY = dirY + (Math.random() - 0.5) * 0.4;
      const turbZ = dirZ + (Math.random() - 0.5) * 0.4;
      
      const length = Math.sqrt(turbX*turbX + turbY*turbY + turbZ*turbZ);
      
      vel[i*3] = (turbX / length) * speed;
      vel[i*3+1] = (turbY / length) * speed;
      vel[i*3+2] = (turbZ / length) * speed;
      
      let finalColor = new THREE.Color();
      if (speed > 50) finalColor.copy(cBlue).lerp(cWhite, Math.random());
      else finalColor.copy(cWhite);
      
      col[i*3] = finalColor.r;
      col[i*3+1] = finalColor.g;
      col[i*3+2] = finalColor.b;
      
      siz[i] = Math.random() * 2.0 + 0.5;
    }
    
    return { positions: pos, colors: col, sizes: siz, velocities: vel };
  }, []);

  const uniforms = useMemo(() => ({
    uEventProgress: { value: 0 }
  }), []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uEventProgress: { value: 0 }
  }), []);

  const timeRef = useRef(0);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state, delta) => {
    if (isPlaying) {
      timeRef.current += delta * timeScale;
    }
    
    if (materialRef.current) {
      materialRef.current.uniforms.uEventProgress.value = eventProgress;
    }
    
    if (coreRef.current) {
      if (isPlaying) {
        coreRef.current.rotation.y = timeRef.current * 0.5;
      }
      if (eventProgress < 0.1) {
        // Red supergiant phase - convective bubbling
        const scale = 2.0 + Math.sin(timeRef.current * 8) * 0.08 + Math.cos(timeRef.current * 5) * 0.05; 
        coreRef.current.scale.set(scale, scale, scale);
      } else {
        // Core collapse leaves a tiny neutron star remnant
        const remScale = Math.max(0.01, 0.5 - (eventProgress * 1.5));
        coreRef.current.scale.set(remScale, remScale, remScale);
      }
    }
  });

  // Calculate light echo alpha dynamically
  const echoAlpha = Math.max(0, 1.0 - (eventProgress - 0.1) * 4.0) * 0.5;

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color={eventProgress < 0.1 ? "#ff3300" : "#ffffff"} />
      </mesh>
      
      {/* Neutrino / Shock Breakout Flash */}
      {eventProgress > 0.09 && eventProgress < 0.18 && (
        <pointLight intensity={150 * (1.0 - (eventProgress - 0.09)*11)} distance={200} color="#88ccff" />
      )}
      
      {/* Pre-supernova Circumstellar Material (Light Echoes) */}
      {eventProgress > 0.1 && (
        <group>
          {[1.0, 1.5, 2.5].map((scale, idx) => (
            <mesh key={idx} rotation={[Math.PI / 3 + idx * 0.2, Math.PI / 4, 0]}>
              <ringGeometry args={[18 * scale, 18.5 * scale, 128]} />
              <meshBasicMaterial 
                color="#aaccff" 
                transparent 
                opacity={echoAlpha} 
                side={THREE.DoubleSide} 
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      )}
      
      {eventProgress >= 0.1 && (
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[colors, 3]} />
            <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
            <bufferAttribute attach="attributes-velocity" args={[velocities, 3]} />
          </bufferGeometry>
          <shaderMaterial 
            ref={materialRef}
            vertexShader={supernovaVertexShader}
            fragmentShader={supernovaFragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}
    </group>
  );
}

function createSoftParticleTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.15, "rgba(255, 255, 255, 0.4)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

function BipolarPlanetaryNebula({ params, eventProgress }: { params: Record<string, number | string>, eventProgress: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { timeScale, isPlaying } = useExplorer();
  
  const particleTexture = useMemo(() => createSoftParticleTexture(), []);
  
  const maxRadius = Number(params.maxRadius) || 15;
  
  const { positions, colors, sizes } = useMemo(() => {
    // 150,000 particles for majestic dense volumetric clouds
    const count = 150000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    
    // NASA Bug Nebula signature colors
    const cWhite = new THREE.Color("#ffffff");
    const cBlue = new THREE.Color("#bbeeff");
    const cPink = new THREE.Color("#ff88cc");
    const cPurple = new THREE.Color("#aa66ff");
    const cOrange = new THREE.Color("#ff7722");
    const cRed = new THREE.Color("#cc1100");
    const cGreen = new THREE.Color("#66cc88");
    const cYellow = new THREE.Color("#ffcc44");
    
    const setParticle = (i: number, x: number, y: number, z: number, c: THREE.Color, s: number) => {
      pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
      siz[i] = s;
    };

    for (let i = 0; i < count; i++) {
      const typeRand = Math.random();
      const theta = Math.random() * Math.PI * 2;
      
      let x, y, z;
      let finalColor = new THREE.Color();
      let pSize = 0;
      
      const turbulence = () => (Math.random() - 0.5) * 0.25;
      
      if (typeRand < 0.15) {
        // 1) EQUATORIAL DUST TORUS (15%)
        // Dense, highly pinched waist with green/yellow/white colors
        const rad = (Math.random() * 0.25 + 0.05) * maxRadius;
        const height = (Math.random() - 0.5) * maxRadius * 0.15;
        
        x = rad * Math.cos(theta) * (1 + turbulence());
        y = rad * Math.sin(theta) * 0.5 * (1 + turbulence()); // squash Y heavily
        z = height;
        
        const rRatio = rad / (0.3 * maxRadius);
        if (rRatio < 0.3) finalColor.copy(cWhite).lerp(cYellow, rRatio / 0.3);
        else finalColor.copy(cYellow).lerp(cGreen, (rRatio - 0.3) / 0.7);
        
        pSize = Math.random() * 1.0 + 0.5;
        
      } else if (typeRand < 0.65) {
        // 2) INNER BRIGHT LOBES (50%)
        // The iconic pink/purple glowing "V" shape wings
        const zDir = Math.random() > 0.5 ? 1 : -1;
        const zRatio = Math.pow(Math.random(), 1.2); 
        const zVal = (zRatio * 1.5 + 0.05) * maxRadius;
        z = zVal * zDir;
        
        const baseR = (zVal / maxRadius) * maxRadius * 0.75;
        
        // Folds for volumetric sheets of gas
        const folds = Math.sin(theta * 4) * 0.4 + Math.cos(theta * 7) * 0.2;
        const thickness = Math.random() * 0.4 + 0.6;
        const rad = baseR * (1 + folds) * thickness;
        
        x = rad * Math.cos(theta) * (1 + turbulence());
        y = rad * Math.sin(theta) * 0.6 * (1 + turbulence());
        
        if (zRatio < 0.2) finalColor.copy(cWhite).lerp(cPink, zRatio / 0.2);
        else if (zRatio < 0.6) finalColor.copy(cPink).lerp(cPurple, (zRatio - 0.2) / 0.4);
        else finalColor.copy(cPurple).lerp(cRed, (zRatio - 0.6) / 0.4);
        
        pSize = Math.random() * 2.0 + 1.2;
        
      } else {
        // 3) OUTER WISPY TENDRILS (35%)
        // Explosive red/orange streaks extending far out
        const zDir = Math.random() > 0.5 ? 1 : -1;
        const zRatio = Math.pow(Math.random(), 0.8); 
        const zVal = (zRatio * 2.2 + 0.2) * maxRadius;
        z = zVal * zDir;
        
        const baseR = (zVal / maxRadius) * maxRadius * 1.0;
        
        // Extreme tendril shapes using high frequency noise
        const tendril = Math.pow(Math.abs(Math.sin(theta * 6)), 3);
        const rad = baseR * (0.3 + tendril * 2.0) * (Math.random() * 0.2 + 0.8);
        
        x = rad * Math.cos(theta) * (1 + turbulence()*2.0);
        y = rad * Math.sin(theta) * 0.4 * (1 + turbulence()*2.0);
        
        finalColor.copy(cOrange).lerp(cRed, zRatio);
        
        pSize = Math.random() * 3.5 + 2.0; 
      }
      
      setParticle(i, x, y, z, finalColor, pSize);
    }
    
    return { positions: pos, colors: col, sizes: siz };
  }, [maxRadius]);

  useFrame((state, delta) => {
    if (pointsRef.current && isPlaying) {
      pointsRef.current.rotation.z += delta * timeScale * 0.02;
    }
    if (pointsRef.current) {
      const expansion = Math.max(0.01, eventProgress * 3.0); 
      pointsRef.current.scale.set(expansion, expansion, expansion);
    }
  });

  return (
    <group rotation={[Math.PI / 5, Math.PI / 4, 0]}>
      <pointLight intensity={3.0} distance={maxRadius * 2} color="#ffffff" />
      <pointLight intensity={1.5} distance={maxRadius * 4} color="#ff88cc" />
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
          <bufferAttribute attach="attributes-size" count={sizes.length} array={sizes} itemSize={1} />
        </bufferGeometry>
        <pointsMaterial 
          map={particleTexture!}
          vertexColors 
          transparent 
          opacity={0.05} 
          blending={THREE.AdditiveBlending} 
          depthWrite={false} 
          sizeAttenuation 
          alphaTest={0.001}
        />
      </points>
    </group>
  );
}

export default function Supernova({ params, object }: Props) {
  const eventProgress = Number(params.eventProgress) || 0.0;
  const isBipolar = params.remnantType === "white_dwarf";

  return (
    <group>
      {isBipolar ? (
        <BipolarPlanetaryNebula params={params} eventProgress={eventProgress} />
      ) : (
        <SphericalSupernova eventProgress={eventProgress} />
      )}
    </group>
  );
}
