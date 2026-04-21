"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ─── Geometry constants ──────────────────────────────────────
// Stylized reference to Softplan HQ at Sapiens Parque:
// two all-glass corporate blocks (same cubic footprint as the neighbour
// Primavera building) connected by a sky bridge, with a cantilevered
// white roof canopy supported by tall white columns, coral accent bands
// between floors, textile second skin facing the lake, a dark rooftop
// penthouse with the "softplan" sign, and a large "SOFTPLAN" 3D
// wordmark at the ground-floor entrance.
// Asymmetric towers — east block is larger (matches the real Softplan HQ).
// West was trimmed by 1/3 and the volume moved to the east block.
const BLOCK_A_W = 64;                            // west block width
const BLOCK_B_W = 128;                           // east block width (2× the west)
const BLOCK_D = 76;
const BLOCK_H = 82;
const FLOORS = 5;
const FLOOR_H = BLOCK_H / FLOORS;

const GAP = 40;                                  // sky bridge span
const COMPLEX_W = BLOCK_A_W + GAP + BLOCK_B_W;   // 232 (total unchanged)
const BLOCK_A_CX = -COMPLEX_W / 2 + BLOCK_A_W / 2;
const BLOCK_B_CX = +COMPLEX_W / 2 - BLOCK_B_W / 2;

const BAND_CZ = -20;                              // building centerline

// Vertical stacking (bottom to top):
//   shell → attic → short columns → thick open-grid marquise → black sign box
const ATTIC_H = 10;
const ATTIC_BOTTOM_Y = BLOCK_H + 4;
const ATTIC_CY = ATTIC_BOTTOM_Y + ATTIC_H / 2;
const ATTIC_TOP_Y = ATTIC_BOTTOM_Y + ATTIC_H;

const ATTIC_COL_H = 6;
const CANOPY_BOTTOM_Y = ATTIC_TOP_Y + ATTIC_COL_H;
const CANOPY_T = 3.2;                            // thicker
const CANOPY_Y = CANOPY_BOTTOM_Y + CANOPY_T / 2;
const CANOPY_TOP_Y = CANOPY_BOTTOM_Y + CANOPY_T;
// Marquise — depth nearly matches the building; projects slightly past the EAST edge
const CANOPY_D = BLOCK_D - 2;
const CANOPY_CZ = BAND_CZ;
const CANOPY_OVERHANG = 9;                         // eastward cantilever beyond the complex
const CANOPY_W = COMPLEX_W + CANOPY_OVERHANG;
const CANOPY_CX = +CANOPY_OVERHANG / 2;            // shift centre so extra width lands on east
const CANOPY_BORDER = 9.6;                         // thick perimeter beams (6x previous)

// Black sign box sits ON TOP of the marquise
const SIGN_BOX_W = 44;
const SIGN_BOX_H = 14;
const SIGN_BOX_D = 44;
const SIGN_BOX_CX = BLOCK_A_CX - 4;
const SIGN_BOX_CY = CANOPY_TOP_Y + SIGN_BOX_H / 2 + 1;

// Attic/penthouse footprint (on west block side), used for the signage
const PENT_W = 56;
const PENT_D = BLOCK_D - 10;
const PENT_CX = BLOCK_A_CX + 10;

// Lake
// Lake starts just past the grass embankment (which ends at z = ~76) — so the
// lake's near edge aligns with the grass bottom and never reaches the deck.
const LAKE_W = 232;   // narrower — 30 units trimmed from each side (east + west)
const LAKE_D = 200;
const LAKE_CZ = 179;     // near edge = 179 - 100 = 79 = grass bottom (after widening north bank)

const TEXTILE_PANELS = 12;
const SOFTPLAN_GREEN = "#76bc21";
const ORANGE_ACCENT = "#e47a2f";

const DEFAULT_POS: [number, number, number] = [-346, 0, 0];

// ─── Glass facade texture (lighter, more transparent feel) ───
function createGlassTex(
  cols: number, rows: number, seed: number,
  litColors: string[], offColor: string, faceColor: string,
): THREE.CanvasTexture {
  const cellW = 12, cellH = 14;
  const cw = cols * cellW, ch = rows * cellH;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = false;

  // Lighter base than Primavera — this is an "all glass" building
  const base = new THREE.Color(faceColor).multiplyScalar(1.1);
  ctx.fillStyle = "#" + base.getHexString();
  ctx.fillRect(0, 0, cw, ch);

  // Mullion grid
  const mull = new THREE.Color(faceColor).multiplyScalar(0.4);
  ctx.fillStyle = "#" + mull.getHexString();
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * cellH, cw, 1.5);
  for (let c = 0; c <= cols; c++) ctx.fillRect(c * cellW, 0, 1.2, ch);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hash = ((r * 11 + c * 17 + seed) * 2654435761) >>> 0;
      const x = c * cellW + 1.5;
      const y = r * cellH + 2;
      const ww = cellW - 3;
      const hh = cellH - 3.5;

      const lit = (hash % 100) < 60;
      if (lit) {
        ctx.fillStyle = litColors[hash % litColors.length];
        ctx.globalAlpha = 0.55 + (hash % 30) / 100;
      } else {
        ctx.fillStyle = offColor;
        ctx.globalAlpha = 0.65;
      }
      ctx.fillRect(x, y, ww, hh);
      ctx.globalAlpha = 1;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ─── Wordmark textures ───────────────────────────────────────
function createSignTexture(
  color: string,
  text = "softplan",
  fontSize = 180,
  canvasW = 1024,
  canvasH = 256,
  mirror = false,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = color;
  ctx.font = `500 ${fontSize}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-4px";
  }

  const draw = () => {
    ctx.fillText(text, canvasW / 2, canvasH / 2);
  };

  if (mirror) {
    ctx.save();
    ctx.translate(canvasW, 0);
    ctx.scale(-1, 1);
    draw();
    ctx.restore();
  } else {
    draw();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  return tex;
}

// ─── Lake ripple texture ─────────────────────────────────────
function createLakeTexture(): THREE.CanvasTexture {
  const s = 512;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
  grad.addColorStop(0, "#2f6a5a");
  grad.addColorStop(0.6, "#1c4c52");
  grad.addColorStop(1, "#0e2e36");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 80; i++) {
    const y = (i * 13) % s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 6) {
      ctx.lineTo(x, y + Math.sin((x + i * 17) * 0.04) * 2);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Glass block primitive ───────────────────────────────────

interface BlockProps {
  cx: number;
  w: number;
  glassLong: THREE.Texture;
  glassShort: THREE.Texture;
  shellColor: string;
  emColor: string;
  accent: string;
}

function GlassBlock({ cx, w, glassLong, glassShort, shellColor, emColor, accent }: BlockProps) {
  const hw = w / 2;
  const hd = BLOCK_D / 2;
  const yc = BLOCK_H / 2 + 3;

  return (
    <group position={[cx, 0, BAND_CZ]}>
      {/* Dark steel shell (nearly swallowed by glass) */}
      <mesh position={[0, yc, 0]}>
        <boxGeometry args={[w, BLOCK_H, BLOCK_D]} />
        <meshStandardMaterial color={shellColor} roughness={0.3} metalness={0.75} />
      </mesh>

      {/* Long facades (south + north) — transparent glass */}
      <mesh position={[0, yc, hd + 0.4]}>
        <planeGeometry args={[w - 2, BLOCK_H - 2]} />
        <meshStandardMaterial
          map={glassLong} emissive={emColor} emissiveMap={glassLong}
          emissiveIntensity={0.7} toneMapped={false} transparent opacity={0.85}
        />
      </mesh>
      <mesh position={[0, yc, -hd - 0.4]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w - 2, BLOCK_H - 2]} />
        <meshStandardMaterial
          map={glassLong} emissive={emColor} emissiveMap={glassLong}
          emissiveIntensity={0.7} toneMapped={false} transparent opacity={0.85}
        />
      </mesh>

      {/* Short facades (east + west) */}
      <mesh position={[hw + 0.4, yc, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[BLOCK_D - 2, BLOCK_H - 2]} />
        <meshStandardMaterial
          map={glassShort} emissive={emColor} emissiveMap={glassShort}
          emissiveIntensity={0.7} toneMapped={false} transparent opacity={0.85}
        />
      </mesh>
      <mesh position={[-hw - 0.4, yc, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[BLOCK_D - 2, BLOCK_H - 2]} />
        <meshStandardMaterial
          map={glassShort} emissive={emColor} emissiveMap={glassShort}
          emissiveIntensity={0.7} toneMapped={false} transparent opacity={0.85}
        />
      </mesh>

      {/* Floor slabs (dark, protrude slightly) */}
      {Array.from({ length: FLOORS }, (_, i) => (
        <mesh key={`slab-${i}`} position={[0, 3 + (i + 1) * FLOOR_H, 0]}>
          <boxGeometry args={[w + 2, 0.9, BLOCK_D + 2]} />
          <meshStandardMaterial color={shellColor} roughness={0.45} metalness={0.55} />
        </mesh>
      ))}

      {/* Subtle coral hints at each floor parapet */}
      {[hd + 0.5, -hd - 0.5].map((zFace, f) =>
        Array.from({ length: FLOORS }, (_, i) => (
          <mesh key={`stripe-${f}-${i}`} position={[0, 3 + (i + 1) * FLOOR_H - FLOOR_H * 0.08, zFace]}>
            <boxGeometry args={[w + 0.6, FLOOR_H * 0.06, 0.3]} />
            <meshStandardMaterial
              color={ORANGE_ACCENT} emissive={ORANGE_ACCENT} emissiveIntensity={0.25}
              toneMapped={false} transparent opacity={0.6}
            />
          </mesh>
        )),
      )}

      {/* Green accent trim at top */}
      <mesh position={[0, BLOCK_H + 3, 0]}>
        <boxGeometry args={[w + 3, 0.8, BLOCK_D + 3]} />
        <meshStandardMaterial
          color={accent} emissive={accent} emissiveIntensity={1.2} toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ─── Component ───────────────────────────────────────────────

interface SoftplanLandmarkProps {
  onClick?: () => void;
  position?: [number, number, number];
  themeAccent?: string;
  themeWindowLit?: string[];
  themeFace?: string;
}

type SoftplanWindowFlags = Window & {
  __softplanClicked?: boolean;
  __softplanCursor?: boolean;
};

export default function SoftplanLandmark({
  onClick,
  position = DEFAULT_POS,
  themeWindowLit = ["#b8d4ee", "#90b8dc", "#6ea0cc"],
  themeFace = "#1a2230",
}: SoftplanLandmarkProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lakeRef = useRef<THREE.Mesh>(null);
  const logoGlowRef = useRef<THREE.PointLight>(null);

  const { gl, camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const onClickRef = useRef(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // Absolute palette tuned to match the real building's cool, silvery, glass-heavy look.
  // Stays light even when the city theme is dark at night.
  const shellColor = "#6e7a8a";   // light blue-grey steel mullions
  const glassFace = "#3c4c5c";    // glass base colour (bluish)
  const windowOff = "#2a3442";    // unlit cell
  const windowLit = themeWindowLit.length > 0 ? themeWindowLit : ["#c8dcf0", "#a0c0e0", "#7aa6d0"];

  const textileColor = "#d8ccb0";
  const amber = "#ff9a3c";        // mercadoteca nightlife — warm incandescent
  const amberSoft = "#ffb873";    // softer gold for string lights
  const accent = SOFTPLAN_GREEN;

  // Textures — force light palette regardless of theme
  const gA_Long = useMemo(() => createGlassTex(16, FLOORS, 201, windowLit, windowOff, glassFace), [windowLit, windowOff, glassFace]);
  const gA_Short = useMemo(() => createGlassTex(13, FLOORS, 223, windowLit, windowOff, glassFace), [windowLit, windowOff, glassFace]);
  const gB_Long = useMemo(() => createGlassTex(16, FLOORS, 337, windowLit, windowOff, glassFace), [windowLit, windowOff, glassFace]);
  const gB_Short = useMemo(() => createGlassTex(13, FLOORS, 411, windowLit, windowOff, glassFace), [windowLit, windowOff, glassFace]);

  const penthouseSign = useMemo(() => createSignTexture("#ffffff", "softplan"), []);
  const penthouseSignMirror = useMemo(() => createSignTexture("#ffffff", "softplan", undefined, undefined, undefined, true), []);
  const groundSign = useMemo(
    () => createSignTexture("#ffffff", "SOFTPLAN", 220, 1280, 256),
    [],
  );
  const groundSignMirror = useMemo(
    () => createSignTexture("#ffffff", "SOFTPLAN", 220, 1280, 256, true),
    [],
  );
  const lakeTex = useMemo(() => createLakeTexture(), []);

  // Organic lake outline: rounded corners + subtle curves on long edges so
  // it doesn't read as a perfect rectangle. Walks the perimeter clockwise.
  const lakeShape = useMemo(() => {
    const s = new THREE.Shape();
    const w = LAKE_W / 2;
    const d = LAKE_D / 2;
    const r = 14;
    s.moveTo(-w + r, -d);
    // North edge — subtle inward wave
    s.bezierCurveTo(-w * 0.35, -d + 3, w * 0.35, -d - 3, w - r, -d);
    s.quadraticCurveTo(w, -d, w, -d + r);         // NE corner
    // East edge — straight with subtle midpoint dent
    s.quadraticCurveTo(w - 2, 0, w, d - r);
    s.quadraticCurveTo(w, d, w - r, d);           // SE corner
    // South edge — subtle outward curve
    s.bezierCurveTo(w * 0.35, d + 4, -w * 0.35, d - 2, -w + r, d);
    s.quadraticCurveTo(-w, d, -w, d - r);         // SW corner
    // West edge
    s.quadraticCurveTo(-w + 2, 0, -w, -d + r);
    s.quadraticCurveTo(-w, -d, -w + r, -d);       // NW corner
    return s;
  }, []);

  useEffect(() => () => {
    gA_Long.dispose();
    gA_Short.dispose();
    gB_Long.dispose();
    gB_Short.dispose();
    penthouseSign.dispose();
    penthouseSignMirror.dispose();
    groundSign.dispose();
    groundSignMirror.dispose();
    lakeTex.dispose();
  }, [gA_Long, gA_Short, gB_Long, gB_Short, penthouseSign, penthouseSignMirror, groundSign, groundSignMirror, lakeTex]);

  // ── Click + cursor ──
  useEffect(() => {
    const canvas = gl.domElement;
    const w = window as SoftplanWindowFlags;

    const hits = (e: PointerEvent): boolean => {
      const group = groupRef.current;
      if (!group) return false;
      const rect = canvas.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(ndc.current, camera);

      const localHits = raycaster.current.intersectObject(group, true);
      if (localHits.length === 0) return false;

      const d = localHits[0].distance;
      const sceneHits = raycaster.current.intersectObjects(scene.children, true);
      for (const hit of sceneHits) {
        if (hit.distance >= d) break;
        if ((hit.object as THREE.InstancedMesh).isInstancedMesh) return false;
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj === group) break;
          if (obj.userData?.isLandmark) return false;
          obj = obj.parent;
        }
      }
      return true;
    };

    let tap: { time: number; x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (!onClickRef.current) return;
      if (hits(e)) {
        w.__softplanClicked = true;
        tap = { time: performance.now(), x: e.clientX, y: e.clientY };
      }
    };
    const onUp = (e: PointerEvent) => {
      w.__softplanClicked = false;
      if (!tap) return;
      const elapsed = performance.now() - tap.time;
      const dx = e.clientX - tap.x;
      const dy = e.clientY - tap.y;
      tap = null;
      if (elapsed > 400 || dx * dx + dy * dy > 625) return;
      onClickRef.current?.();
    };
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastMove = 0;
    const onMove = isTouch ? null : (e: PointerEvent) => {
      if (!onClickRef.current) return;
      const now = performance.now();
      if (now - lastMove < 66) return;
      lastMove = now;
      if (hits(e)) {
        document.body.style.cursor = "pointer";
        w.__softplanCursor = true;
      } else if (w.__softplanCursor) {
        w.__softplanCursor = false;
      }
    };

    canvas.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    if (onMove) canvas.addEventListener("pointermove", onMove, true);
    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      if (onMove) canvas.removeEventListener("pointermove", onMove, true);
      w.__softplanClicked = false;
      w.__softplanCursor = false;
    };
  }, [gl, camera, scene]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (lakeRef.current) {
      const mat = lakeRef.current.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.offset.set(t * 0.008, Math.sin(t * 0.15) * 0.006);
    }
    if (logoGlowRef.current) {
      logoGlowRef.current.intensity = 30 + Math.sin(t * 1.3) * 10;
    }
  });

  const emLit = themeWindowLit[0] ?? "#ffffff";
  const hd = BLOCK_D / 2;
  const platformW = COMPLEX_W + 60;
  const platformD = BLOCK_D + 50;
  // Deck center: near-edge stays ~3 from building front. Deck is 45 deep
  // now (half of previous 90), so center = (3 + 45/2) = 25.5 past the front.
  const deckZ = BAND_CZ + hd + 25.5;

  // Sky bridge (bridges the gap between the two blocks at an upper level)
  // Floors: 0=térreo, 1=mesanino, 2=1°, 3=2°, 4=3° (sky bridge here)
  const bridgeY = 3 + FLOOR_H * 4.5;
  const bridgeSpan = GAP + 4;
  // Gap midpoint shifts since the blocks are now asymmetric
  const bridgeCX = (BLOCK_A_CX + BLOCK_A_W / 2 + BLOCK_B_CX - BLOCK_B_W / 2) / 2;

  return (
    <group ref={groupRef} position={position} userData={{ isLandmark: true }}>
      {/* Hitbox */}
      <mesh position={[0, BLOCK_H / 2, BAND_CZ]} visible={false}>
        <boxGeometry args={[COMPLEX_W + 40, BLOCK_H + 40, BLOCK_D + 40]} />
        <meshBasicMaterial />
      </mesh>

      {/* ── Lake (south) — rounded + subtly curved shape instead of rectangle ── */}
      <mesh ref={lakeRef} position={[0, 0.2, LAKE_CZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[lakeShape]} />
        <meshStandardMaterial
          map={lakeTex} color="#1e5a62" roughness={0.12} metalness={0.92}
          emissive="#0a2228" emissiveIntensity={0.35} transparent opacity={0.95}
        />
      </mesh>

      {/* Grass bank wrapping the lake — east, south, west. Sits at water level
          and reads as the continuous lime embankment around the pond. Each
          bank is a tilted slab so it slopes toward the water. Slight curve
          variations via multiple overlapping segments. */}
      {(() => {
        const BANK_W = 14;             // how wide the grass bank extends out
        const BANK_TOP_Y = 2.4;
        const BANK_BOT_Y = 0.25;
        const BANK_LEN = Math.hypot(BANK_W, BANK_TOP_Y - BANK_BOT_Y);
        const tilt = Math.atan2(BANK_TOP_Y - BANK_BOT_Y, BANK_W);
        const MID_Y = (BANK_TOP_Y + BANK_BOT_Y) / 2;
        const halfW = LAKE_W / 2;
        const halfD = LAKE_D / 2;
        const grassColor = "#6fb23a";

        return (
          <>
            {/* East bank — sloped toward west (lake). Tilt around Z so the
                outer edge (east) is high and inner (west) is low */}
            <mesh
              position={[halfW + BANK_W / 2, MID_Y, LAKE_CZ]}
              rotation={[0, 0, tilt]}
            >
              <boxGeometry args={[BANK_LEN, 0.3, LAKE_D + 4]} />
              <meshStandardMaterial color={grassColor} roughness={0.95} metalness={0} />
            </mesh>
            {/* West bank — mirror of east */}
            <mesh
              position={[-(halfW + BANK_W / 2), MID_Y, LAKE_CZ]}
              rotation={[0, 0, -tilt]}
            >
              <boxGeometry args={[BANK_LEN, 0.3, LAKE_D + 4]} />
              <meshStandardMaterial color={grassColor} roughness={0.95} metalness={0} />
            </mesh>
            {/* South bank — sloped toward north (lake). Tilt around X */}
            <mesh
              position={[0, MID_Y, LAKE_CZ + halfD + BANK_W / 2]}
              rotation={[-tilt, 0, 0]}
            >
              <boxGeometry args={[LAKE_W + BANK_W * 2 + 8, 0.3, BANK_LEN]} />
              <meshStandardMaterial color={grassColor} roughness={0.95} metalness={0} />
            </mesh>

            {/* (east/south trees + bushes moved to the dedicated vegetation
                zones below, at the correct plateau Y level) */}
          </>
        );
      })()}

      {/* (wooden curb removed — blended oddly against night lighting) */}

      {/* Corner fillers — rounded corners of the lake leave a small cutout
          between the water's edge and the straight banks. Patches sit at
          water level so they fill ONLY the cutout (lake surface hides the
          rest of the box). */}
      {(() => {
        const r = 14;
        const halfW = LAKE_W / 2;
        const halfD = LAKE_D / 2;
        const corners = [
          { sx: +1, sz: -1 },  // NE
          { sx: +1, sz: +1 },  // SE
          { sx: -1, sz: +1 },  // SW
          { sx: -1, sz: -1 },  // NW
        ];
        return corners.map((c, i) => (
          <mesh
            key={`corner-fill-${i}`}
            position={[
              c.sx * (halfW - r / 2),
              0.15,
              LAKE_CZ + c.sz * (halfD - r / 2),
            ]}
          >
            <boxGeometry args={[r, 0.25, r]} />
            <meshStandardMaterial color="#5ea030" roughness={0.95} metalness={0} />
          </mesh>
        ));
      })()}

      {/* West walkway only (user kept this). East side is dense vegetation
          + grass (no walkway). South side untouched from original. */}
      {(() => {
        const BANK_W = 14;
        const WALK_W = 16;
        const halfW = LAKE_W / 2;
        const halfD = LAKE_D / 2;
        const westX = -(halfW + BANK_W + WALK_W / 2);
        const sideLen = LAKE_D + BANK_W + WALK_W + (LAKE_CZ - halfD - 66);
        const sideCZ = (66 + LAKE_CZ + halfD + BANK_W + WALK_W) / 2;
        return (
          <mesh position={[westX, 2.4, sideCZ]}>
            <boxGeometry args={[WALK_W, 0.6, sideLen]} />
            <meshStandardMaterial color="#b5784a" roughness={0.85} metalness={0} />
          </mesh>
        );
      })()}

      {/* East + south vegetation: dense trees + bushes + grass groundcover.
          East band width = WALK_W (16) to match the west walkway for symmetry.
          South band is deeper since the lake's south edge runs far from the
          complex and can host a bigger vegetation zone. */}
      {(() => {
        const BANK_W = 14;
        const VEG_W = 16;                  // matches west walkway width
        const SOUTH_VEG_D = 32;            // deeper vegetation zone south of lake
        const halfW = LAKE_W / 2;
        const halfD = LAKE_D / 2;

        const eastBaseX = halfW + BANK_W + VEG_W / 2;
        const southBaseZ = LAKE_CZ + halfD + BANK_W + SOUTH_VEG_D / 2;

        const bushColor = (i: number) =>
          `hsl(${85 + (i * 7) % 25}, 45%, ${30 + (i % 3) * 5}%)`;
        const treeColor = (i: number) =>
          `hsl(${95 + (i * 13) % 25}, 55%, ${28 + (i % 4) * 4}%)`;

        // Plateau Y: matches the top of the grass embankment (y=2.4) so the
        // groundcover sits flush with the walkway / bank top. Trees and
        // bushes get a small offset above this surface.
        const PLATEAU_Y = 2.4;
        const GROUND_Y = PLATEAU_Y + 0.1;      // box center so top at PLATEAU_Y + 0.2
        const BASE_Y = PLATEAU_Y + 0.15;       // where tree trunks + bushes sit

        return (
          <>
            {/* East: grass ground + dense vegetation at plateau level.
                Extends south to the south vegetation zone to close the
                corner gap between the two zones. */}
            {(() => {
              const eastN = LAKE_CZ - halfD - 2;
              const eastS = southBaseZ - SOUTH_VEG_D / 2;
              const eastDepth = eastS - eastN;
              const eastCZ = (eastN + eastS) / 2;
              return (
                <mesh position={[eastBaseX, GROUND_Y, eastCZ]}>
                  <boxGeometry args={[VEG_W, 0.2, eastDepth]} />
                  <meshStandardMaterial color="#5ea030" roughness={0.95} metalness={0} />
                </mesh>
              );
            })()}
            {Array.from({ length: 12 }, (_, i) => {
              const t = (i + 0.5) / 12;
              const jitterX = ((i * 17) % 7) - 3;
              const jitterZ = ((i * 23) % 7) - 3;
              const tx = eastBaseX + jitterX;
              const tz = LAKE_CZ - halfD + t * LAKE_D + jitterZ;
              const trunkH = 7 + ((i * 11) % 4);
              const leafR = 3.2 + ((i * 7) % 3) * 0.6;
              return (
                <group key={`east-tree-${i}`} position={[tx, BASE_Y, tz]}>
                  <mesh position={[0, trunkH / 2, 0]}>
                    <cylinderGeometry args={[0.4, 0.6, trunkH, 6]} />
                    <meshStandardMaterial color="#5a3a22" roughness={0.9} metalness={0} />
                  </mesh>
                  <mesh position={[0, trunkH + leafR * 0.5, 0]}>
                    <sphereGeometry args={[leafR, 8, 6]} />
                    <meshStandardMaterial color={treeColor(i)} roughness={0.85} metalness={0} />
                  </mesh>
                </group>
              );
            })}
            {Array.from({ length: 22 }, (_, i) => {
              const t = (i + 0.5) / 22;
              const jitterX = ((i * 19) % 7) - 3;
              const jitterZ = ((i * 13) % 5) - 2;
              const bx = eastBaseX + jitterX;
              const bz = LAKE_CZ - halfD + t * LAKE_D + jitterZ;
              const r = 1.2 + ((i * 5) % 4) * 0.3;
              return (
                <mesh key={`east-bush-${i}`} position={[bx, BASE_Y + r * 0.5, bz]}>
                  <sphereGeometry args={[r, 7, 5]} />
                  <meshStandardMaterial color={bushColor(i)} roughness={0.9} metalness={0} />
                </mesh>
              );
            })}

            {/* South: larger grass zone + dense tree/bush forest at plateau */}
            <mesh position={[0, GROUND_Y, southBaseZ]}>
              <boxGeometry args={[LAKE_W + 2 * BANK_W + 2 * VEG_W, 0.2, SOUTH_VEG_D]} />
              <meshStandardMaterial color="#5ea030" roughness={0.95} metalness={0} />
            </mesh>
            {Array.from({ length: 20 }, (_, i) => {
              const row = i < 10 ? 0 : 1;
              const col = i % 10;
              const rowZ = southBaseZ - SOUTH_VEG_D / 2 + 8 + row * 16;
              const baseCol = -(LAKE_W + 2 * BANK_W) / 2 + 8 + col * ((LAKE_W + 2 * BANK_W - 16) / 9);
              const jitterX = ((i * 17) % 7) - 3;
              const jitterZ = ((i * 23) % 5) - 2;
              const trunkH = 7 + ((i * 11) % 4);
              const leafR = 3.2 + ((i * 7) % 3) * 0.6;
              return (
                <group key={`south-tree-${i}`} position={[baseCol + jitterX, BASE_Y, rowZ + jitterZ]}>
                  <mesh position={[0, trunkH / 2, 0]}>
                    <cylinderGeometry args={[0.4, 0.6, trunkH, 6]} />
                    <meshStandardMaterial color="#5a3a22" roughness={0.9} metalness={0} />
                  </mesh>
                  <mesh position={[0, trunkH + leafR * 0.5, 0]}>
                    <sphereGeometry args={[leafR, 8, 6]} />
                    <meshStandardMaterial color={treeColor(i + 100)} roughness={0.85} metalness={0} />
                  </mesh>
                </group>
              );
            })}
            {Array.from({ length: 30 }, (_, i) => {
              const t = (i + 0.5) / 30;
              const bx = -(LAKE_W + 2 * BANK_W) / 2 + 4 + t * (LAKE_W + 2 * BANK_W - 8);
              const rowZ = southBaseZ + ((i * 7) % SOUTH_VEG_D - SOUTH_VEG_D / 2) * 0.8;
              const r = 1.2 + ((i * 5) % 4) * 0.3;
              return (
                <mesh key={`south-bush-${i}`} position={[bx, BASE_Y + r * 0.5, rowZ]}>
                  <sphereGeometry args={[r, 7, 5]} />
                  <meshStandardMaterial color={bushColor(i + 200)} roughness={0.9} metalness={0} />
                </mesh>
              );
            })}
          </>
        );
      })()}

      {/* Base platform under the whole complex */}
      <mesh position={[0, 1.5, BAND_CZ]}>
        <boxGeometry args={[platformW, 3, platformD]} />
        <meshStandardMaterial color={shellColor} roughness={0.55} metalness={0.3} />
      </mesh>

      {/* Round cafe tables + chairs on the platform strip between the
          building facade (z = BAND_CZ + hd = 18) and the brown deck — the
          visible "blue plaza" at platform top (y = 3). Two staggered rows
          so the line reads as organic seating, not a grid. */}
      {(() => {
        const PLATFORM_TOP_Y = 3;
        const Z_NEAR = BAND_CZ + BLOCK_D / 2 + 4;   // closer to building
        const Z_FAR = BAND_CZ + BLOCK_D / 2 + 18;   // just before deck edge
        const COLUMNS = 11;
        const X_SPAN = COMPLEX_W - 32;

        return Array.from({ length: COLUMNS * 2 }, (_, idx) => {
          const row = idx % 2;
          const col = Math.floor(idx / 2);
          const t = (col + (row === 0 ? 0.25 : 0.75)) / COLUMNS;
          const tx = -X_SPAN / 2 + t * X_SPAN;
          const jitter = ((col * 13 + row * 7) % 5) - 2;
          const tz = (row === 0 ? Z_NEAR : Z_FAR) + jitter * 0.4;

          return (
            <group key={`plaza-table-${idx}`} position={[tx, PLATFORM_TOP_Y, tz]}>
              {/* pedestal */}
              <mesh position={[0, 0.85, 0]}>
                <cylinderGeometry args={[0.28, 0.38, 1.7, 6]} />
                <meshStandardMaterial color="#2a2018" roughness={0.8} metalness={0.2} />
              </mesh>
              {/* round wooden top */}
              <mesh position={[0, 1.85, 0]}>
                <cylinderGeometry args={[1.5, 1.5, 0.18, 14]} />
                <meshStandardMaterial color="#8a5a34" roughness={0.7} metalness={0.1} />
              </mesh>
              {/* chairs — 3 around each table, rotated so the pattern varies */}
              {Array.from({ length: 3 }, (_, ci) => {
                const ang = (ci / 3) * Math.PI * 2 + (idx * 0.4);
                const cxp = Math.cos(ang) * 2.3;
                const czp = Math.sin(ang) * 2.3;
                return (
                  <group key={`chair-${ci}`} position={[cxp, 0, czp]} rotation={[0, -ang + Math.PI / 2, 0]}>
                    <mesh position={[0, 0.5, 0]}>
                      <boxGeometry args={[0.9, 1.0, 0.9]} />
                      <meshStandardMaterial color="#3a2a1e" roughness={0.8} metalness={0} />
                    </mesh>
                    <mesh position={[0, 1.15, -0.4]}>
                      <boxGeometry args={[0.9, 0.3, 0.2]} />
                      <meshStandardMaterial color="#3a2a1e" roughness={0.8} metalness={0} />
                    </mesh>
                  </group>
                );
              })}
            </group>
          );
        });
      })()}

      {/* Deck between blocks and lake — wood-look promenade with a gentle
          S-curve (image 6). Brown boards span the whole plaza front. */}
      {(() => {
        const DECK_LEN = COMPLEX_W + 60;   // match the base platform width
        const DECK_SEG_COUNT = 11;
        const DECK_SEG_W = DECK_LEN / DECK_SEG_COUNT;
        const DECK_D = 45;                 // 2× original; half of previous oversized try
        const CURVE_AMP = 4;               // subtle S-curve
        const EMBANK_W = 13;               // grass slope width from deck to lake (+1/3 wider)
        const EMBANK_TOP_Z = deckZ + DECK_D / 2;   // top of embankment = deck far edge
        const EMBANK_BOT_Z = EMBANK_TOP_Z + EMBANK_W;

        const segments = Array.from({ length: DECK_SEG_COUNT }, (_, i) => {
          const t = i / (DECK_SEG_COUNT - 1);
          const x = -DECK_LEN / 2 + (i + 0.5) * DECK_SEG_W;
          const zOffset = Math.sin(t * Math.PI * 2.2) * CURVE_AMP;
          return { x, zOffset, t };
        });

        // Lamp post positions scattered along the grass embankment
        const lampCount = 8;
        return (
          <>
            {/* Grass base under the deck — fills the gaps between the S-curved
                segments (each segment is at a different Z offset, exposing a
                void underneath). Sits slightly below deck top so it's visible
                only through the seams. */}
            <mesh position={[0, 2.35, deckZ]}>
              <boxGeometry args={[DECK_LEN, 0.15, DECK_D + 2 * CURVE_AMP + 4]} />
              <meshStandardMaterial color="#6fb23a" roughness={0.95} metalness={0} />
            </mesh>

            {/* Wood deck segments (brown). No edge strips — the amber glow
                lives in the mercadoteca block on the building-side only. */}
            {segments.map((s, i) => (
              <mesh key={`deck-seg-${i}`} position={[s.x, 2.4, deckZ + s.zOffset]}>
                <boxGeometry args={[DECK_SEG_W + 1, 0.6, DECK_D]} />
                <meshStandardMaterial color="#b5784a" roughness={0.85} metalness={0} />
              </mesh>
            ))}

            {/* Grass embankment — sloped tilted box from deck (y=2.4) down to
                lake level (y=0.2), width 10. Lime green matches the real
                Sapiens Park turf. */}
            {(() => {
              const topY = 2.4;
              const botY = 0.2;
              const embankLen = Math.hypot(EMBANK_W, topY - botY);
              const tilt = Math.atan2(topY - botY, EMBANK_W);
              return (
                <mesh
                  position={[0, (topY + botY) / 2, (EMBANK_TOP_Z + EMBANK_BOT_Z) / 2]}
                  rotation={[tilt, 0, 0]}
                >
                  <boxGeometry args={[DECK_LEN, 0.25, embankLen]} />
                  <meshStandardMaterial color="#6fb23a" roughness={0.95} metalness={0} />
                </mesh>
              );
            })()}

            {/* Flat grass stripe at the very top of the embankment — blends
                the deck edge into the slope visually */}
            <mesh position={[0, 2.35, EMBANK_TOP_Z + 0.4]}>
              <boxGeometry args={[DECK_LEN, 0.1, 0.8]} />
              <meshStandardMaterial color="#5ea030" roughness={0.95} metalness={0} />
            </mesh>

            {/* Lamp posts along the grass — the "pontos de luz no gramado" */}
            {Array.from({ length: lampCount }, (_, i) => {
              const lx = -DECK_LEN / 2 + (i + 0.5) * (DECK_LEN / lampCount);
              // Position on the slope, slightly below top edge
              const t = 0.35;
              const ly = 2.4 - t * (2.4 - 0.2);
              const lz = EMBANK_TOP_Z + t * EMBANK_W;
              const POST_H = 3.2;
              return (
                <group key={`lamp-${i}`} position={[lx, ly, lz]}>
                  {/* pole */}
                  <mesh position={[0, POST_H / 2, 0]}>
                    <cylinderGeometry args={[0.12, 0.15, POST_H, 6]} />
                    <meshStandardMaterial color="#2a2a2a" roughness={0.7} metalness={0.3} />
                  </mesh>
                  {/* lamp head (emissive) */}
                  <mesh position={[0, POST_H, 0]}>
                    <sphereGeometry args={[0.45, 7, 6]} />
                    <meshStandardMaterial
                      color="#ffcc80" emissive="#ffcc80"
                      emissiveIntensity={5.0} toneMapped={false}
                    />
                  </mesh>
                  <pointLight
                    position={[0, POST_H, 0]}
                    color="#ffb060" intensity={12} distance={22} decay={2}
                  />
                </group>
              );
            })}
          </>
        );
      })()}

      {/* ── Mercadoteca: warm amber nightlife at the ground floor ──
           Bars, pizzarias, cervejarias artesanais. The real Softplan HQ at
           night has linear amber washes under the marquise, glowing planters,
           and string lights over the waterfront deck (Parque Sapiens). */}
      {(() => {
        const hd = BLOCK_D / 2;
        const FRONT_Z = BAND_CZ + hd + 0.6;   // just outside building front face
        const AWNING_Y = FLOOR_H * 0.9;        // height of the ground-floor top edge
        const stringCount = 20;

        // Table clusters — 5 zones across the full deck width, denser.
        const tableZones = [
          { cx: -COMPLEX_W / 2 + 24, count: 6 },
          { cx: -COMPLEX_W / 2 + 70, count: 5 },
          { cx: 0,                    count: 7 },
          { cx:  COMPLEX_W / 2 - 70, count: 5 },
          { cx:  COMPLEX_W / 2 - 24, count: 6 },
        ];
        return (
          <group userData={{ mercadoteca: true }}>
            {/* (awning strip removed — it read as an out-of-place yellow bar) */}

            {/* (floating pointlights removed — the sconces below provide the
                amber lighting without rendering as orphan bright points) */}

            {/* Wall-mounted amber sconces along the building's south face —
                fixed to the facade at ground-floor ceiling level. Each has a
                small bracket + glowing bulb + halo pointLight. */}
            {Array.from({ length: stringCount }, (_, i) => {
              const x = -COMPLEX_W / 2 + 8 + (i * (COMPLEX_W - 16)) / (stringCount - 1);
              const y = FLOOR_H * 0.78;
              // Skip sconces that fall in the gap between the two blocks —
              // no wall to attach to, they'd render as floating bulbs.
              const gapMinX = BLOCK_A_CX + BLOCK_A_W / 2;
              const gapMaxX = BLOCK_B_CX - BLOCK_B_W / 2;
              if (x > gapMinX && x < gapMaxX) return null;
              return (
                <group key={`sconce-${i}`} position={[x, y, FRONT_Z]}>
                  {/* Bracket (dark stub attaching to the wall) */}
                  <mesh position={[0, 0, 0.35]}>
                    <boxGeometry args={[0.2, 0.2, 0.7]} />
                    <meshStandardMaterial color="#222" roughness={0.7} metalness={0.4} />
                  </mesh>
                  {/* Glowing amber bulb */}
                  <mesh position={[0, 0, 0.8]}>
                    <sphereGeometry args={[0.45, 6, 5]} />
                    <meshStandardMaterial
                      color={amber} emissive={amber}
                      emissiveIntensity={6.0} toneMapped={false}
                    />
                  </mesh>
                  {/* Wash light projecting onto the deck */}
                  <pointLight
                    position={[0, -0.3, 1.2]}
                    color={amber} intensity={16} distance={30} decay={2}
                  />
                </group>
              );
            })}

            {/* ─── Outdoor tables + chairs — small cylinders + boxes for
                pixel-art read. Clustered in 3 seating zones. ─── */}
            {tableZones.flatMap((zone, zi) =>
              Array.from({ length: zone.count }, (_, i) => {
                const offset = (i - (zone.count - 1) / 2) * 8;
                const wobble = ((zi * 7 + i * 13) % 3) - 1;
                const tx = zone.cx + offset;
                const tz = deckZ + wobble * 6;
                return (
                  <group key={`table-${zi}-${i}`} position={[tx, 2.7, tz]}>
                    {/* pedestal */}
                    <mesh position={[0, 1.1, 0]}>
                      <cylinderGeometry args={[0.35, 0.45, 2.2, 6]} />
                      <meshStandardMaterial color="#2a2018" roughness={0.8} metalness={0.2} />
                    </mesh>
                    {/* round table top — lighter wood + bigger for visibility */}
                    <mesh position={[0, 2.3, 0]}>
                      <cylinderGeometry args={[2.0, 2.0, 0.25, 12]} />
                      <meshStandardMaterial color="#8a5a34" roughness={0.7} metalness={0.1} />
                    </mesh>
                    {/* candle/lamp on the table */}
                    <mesh position={[0, 2.75, 0]}>
                      <sphereGeometry args={[0.35, 6, 5]} />
                      <meshStandardMaterial
                        color={amberSoft} emissive={amberSoft}
                        emissiveIntensity={6.0} toneMapped={false}
                      />
                    </mesh>
                    <pointLight
                      position={[0, 3, 0]}
                      color={amber} intensity={6} distance={10} decay={2}
                    />
                    {/* 2-3 chairs around the table — bigger, lighter for contrast */}
                    {[0, Math.PI * 0.67, Math.PI * 1.33].map((ang, ci) => {
                      if (ci > 0 && ((zi + i + ci) % 3) === 0) return null;
                      const cx = Math.cos(ang) * 3.0;
                      const cz = Math.sin(ang) * 3.0;
                      return (
                        <group key={`chair-${ci}`} position={[cx, 0, cz]}>
                          <mesh position={[0, 0.7, 0]}>
                            <boxGeometry args={[1.2, 1.4, 1.2]} />
                            <meshStandardMaterial color="#3a2a1e" roughness={0.8} metalness={0} />
                          </mesh>
                          <mesh position={[0, 1.6, -0.5]}>
                            <boxGeometry args={[1.2, 0.4, 0.3]} />
                            <meshStandardMaterial color="#3a2a1e" roughness={0.8} metalness={0} />
                          </mesh>
                        </group>
                      );
                    })}
                  </group>
                );
              }),
            )}

            {/* Ambient fill lights — raised intensity + 2 extra positions so
                the whole plaza reads as warm when viewed from any angle */}
            <pointLight
              position={[0, 6, deckZ]}
              color={amber} intensity={45} distance={160} decay={2}
            />
            <pointLight
              position={[-COMPLEX_W / 3, 4, deckZ]}
              color={amber} intensity={28} distance={110} decay={2}
            />
            <pointLight
              position={[+COMPLEX_W / 3, 4, deckZ]}
              color={amber} intensity={28} distance={110} decay={2}
            />
          </group>
        );
      })()}
      {Array.from({ length: 14 }, (_, i) => {
        const x = -COMPLEX_W / 2 + 8 + (i * (COMPLEX_W - 16)) / 13;
        return (
          <group key={`planter-${i}`} position={[x, 2.8, deckZ + ((i * 3) % 6 - 3)]}>
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[3.2, 3.2, 0.8, 8]} />
              <meshStandardMaterial color="#5a3a22" roughness={0.9} metalness={0} />
            </mesh>
            <mesh position={[0, 2.4, 0]}>
              <sphereGeometry args={[2.8, 8, 6]} />
              <meshStandardMaterial color="#2e6f2a" roughness={0.9} metalness={0} />
            </mesh>
          </group>
        );
      })}

      {/* ── Two glass blocks (west = smaller, east = larger) ── */}
      <GlassBlock
        cx={BLOCK_A_CX} w={BLOCK_A_W} glassLong={gA_Long} glassShort={gA_Short}
        shellColor={shellColor} emColor={emLit} accent={accent}
      />
      <GlassBlock
        cx={BLOCK_B_CX} w={BLOCK_B_W} glassLong={gB_Long} glassShort={gB_Short}
        shellColor={shellColor} emColor={emLit} accent={accent}
      />

      {/* ── Sky bridge connecting the blocks (gap midpoint shifts with asymmetry) ── */}
      <mesh position={[bridgeCX, bridgeY, BAND_CZ]}>
        <boxGeometry args={[bridgeSpan, FLOOR_H * 0.9, 16]} />
        <meshStandardMaterial color={shellColor} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[bridgeCX, bridgeY, BAND_CZ]}>
        <boxGeometry args={[bridgeSpan + 0.4, FLOOR_H * 0.55, 16.4]} />
        <meshStandardMaterial
          color={emLit} emissive={emLit} emissiveIntensity={0.7}
          transparent opacity={0.75} toneMapped={false}
        />
      </mesh>
      {/* Glass roof of the bridge — soft bluish tint, transparent */}
      <mesh position={[bridgeCX, bridgeY + FLOOR_H * 0.5, BAND_CZ]}>
        <boxGeometry args={[bridgeSpan + 1, 0.4, 16.6]} />
        <meshStandardMaterial
          color="#9ec4de" emissive="#6fa9c8" emissiveIntensity={0.25}
          roughness={0.15} metalness={0.4}
          transparent opacity={0.55} toneMapped={false}
        />
      </mesh>

      {/* ── Thin horizontal brise louvers on all 4 sides of each block, one per floor ── */}
      {[
        { cx: BLOCK_A_CX, w: BLOCK_A_W },
        { cx: BLOCK_B_CX, w: BLOCK_B_W },
      ].flatMap(({ cx, w }) =>
        Array.from({ length: FLOORS }, (_, i) => {
          const y = 3 + (i + 0.5) * FLOOR_H;
          const mat = (
            <meshStandardMaterial
              color={textileColor} roughness={0.85} metalness={0.1}
              transparent opacity={0.85}
            />
          );
          return (
            <group key={`louvers-${cx}-${i}`}>
              {/* South */}
              <mesh position={[cx, y, BAND_CZ + hd + 1.6]} rotation={[-0.18, 0, 0]}>
                <boxGeometry args={[w - 2, 0.4, 2.6]} />
                {mat}
              </mesh>
              {/* North */}
              <mesh position={[cx, y, BAND_CZ - hd - 1.6]} rotation={[0.18, 0, 0]}>
                <boxGeometry args={[w - 2, 0.4, 2.6]} />
                {mat}
              </mesh>
              {/* East */}
              <mesh position={[cx + w / 2 + 1.6, y, BAND_CZ]} rotation={[0, 0, -0.18]}>
                <boxGeometry args={[2.6, 0.4, BLOCK_D - 2]} />
                {mat}
              </mesh>
              {/* West */}
              <mesh position={[cx - w / 2 - 1.6, y, BAND_CZ]} rotation={[0, 0, 0.18]}>
                <boxGeometry args={[2.6, 0.4, BLOCK_D - 2]} />
                {mat}
              </mesh>
            </group>
          );
        }),
      )}

      {/* ── Attic — one per tower (separate volumes; only the marquise bridges them) ── */}
      <mesh position={[BLOCK_A_CX, ATTIC_CY, BAND_CZ]}>
        <boxGeometry args={[BLOCK_A_W + 4, ATTIC_H, BLOCK_D + 4]} />
        <meshStandardMaterial color="#2a2e38" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[BLOCK_B_CX, ATTIC_CY, BAND_CZ]}>
        <boxGeometry args={[BLOCK_B_W + 4, ATTIC_H, BLOCK_D + 4]} />
        <meshStandardMaterial color="#2a2e38" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* ── Short white columns between each attic top and the marquise underside ──
             (Only land on the two block footprints; skip positions that fall in the gap.) */}
      {(() => {
        const colH = ATTIC_COL_H;
        const colY = ATTIC_TOP_Y + colH / 2;
        const overBlock = (x: number) =>
          (x >= BLOCK_A_CX - BLOCK_A_W / 2 + 2 && x <= BLOCK_A_CX + BLOCK_A_W / 2 - 2) ||
          (x >= BLOCK_B_CX - BLOCK_B_W / 2 + 2 && x <= BLOCK_B_CX + BLOCK_B_W / 2 - 2);
        return Array.from({ length: 5 }, (_, i) => {
          const x = -CANOPY_W / 2 + 6 + (i * (CANOPY_W - 12)) / 4;
          if (!overBlock(x)) return null;
          return (
            <group key={`col-${i}`}>
              <mesh position={[x, colY, CANOPY_CZ + CANOPY_D / 2 - 3]}>
                <cylinderGeometry args={[1.1, 1.1, colH, 10]} />
                <meshStandardMaterial color="#eaeaea" roughness={0.35} metalness={0.5} />
              </mesh>
              <mesh position={[x, colY, CANOPY_CZ - CANOPY_D / 2 + 3]}>
                <cylinderGeometry args={[1.1, 1.1, colH, 10]} />
                <meshStandardMaterial color="#eaeaea" roughness={0.35} metalness={0.5} />
              </mesh>
            </group>
          );
        });
      })()}

      {/* ── Marquise: thick rectangular frame (no interior bands) ── */}
      {(() => {
        const yMid = CANOPY_Y;
        return (
          <>
            {/* Perimeter frame — 4 thick sides (shifted by CANOPY_CX so overhang falls on west) */}
            <mesh position={[CANOPY_CX, yMid, CANOPY_CZ + CANOPY_D / 2]}>
              <boxGeometry args={[CANOPY_W, CANOPY_T, CANOPY_BORDER]} />
              <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[CANOPY_CX, yMid, CANOPY_CZ - CANOPY_D / 2]}>
              <boxGeometry args={[CANOPY_W, CANOPY_T, CANOPY_BORDER]} />
              <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[CANOPY_CX - CANOPY_W / 2, yMid, CANOPY_CZ]}>
              <boxGeometry args={[CANOPY_BORDER, CANOPY_T, CANOPY_D]} />
              <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[CANOPY_CX + CANOPY_W / 2, yMid, CANOPY_CZ]}>
              <boxGeometry args={[CANOPY_BORDER, CANOPY_T, CANOPY_D]} />
              <meshStandardMaterial color="#f2f3f5" roughness={0.4} metalness={0.3} />
            </mesh>
            {/* 6 perpendicular stripes spanning full depth. Some are slightly tilted
                around the Y axis (~15°) so they're not all perfectly parallel. */}
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const stripeW = 15;
              const innerW = CANOPY_W - 2 * CANOPY_BORDER;
              const x = CANOPY_CX - innerW / 2 + (innerW / 6) * (i + 0.5);
              // Alternate: straight, +15°, -15° pattern
              const tilts = [0, 15, 0, -15, 0, 15];
              const tiltRad = (tilts[i] * Math.PI) / 180;
              return (
                <mesh
                  key={`stripe-${i}`}
                  position={[x, yMid, CANOPY_CZ]}
                  rotation={[0, tiltRad, 0]}
                >
                  <boxGeometry args={[stripeW, CANOPY_T, CANOPY_D]} />
                  <meshStandardMaterial color="#e6e8ec" roughness={0.45} metalness={0.3} />
                </mesh>
              );
            })}
          </>
        );
      })()}

      {/* ── Black sign box ABOVE the marquise with "softplan" wordmark ── */}
      <mesh position={[SIGN_BOX_CX, SIGN_BOX_CY, BAND_CZ]}>
        <boxGeometry args={[SIGN_BOX_W, SIGN_BOX_H, SIGN_BOX_D]} />
        <meshStandardMaterial color="#0c0d12" roughness={0.45} metalness={0.55} />
      </mesh>
      {/* Sign on WEST face of the black sign box — luminous white letters */}
      <mesh
        position={[SIGN_BOX_CX - SIGN_BOX_W / 2 - 0.2, SIGN_BOX_CY, BAND_CZ]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[SIGN_BOX_D - 4, SIGN_BOX_H - 3]} />
        <meshStandardMaterial
          map={penthouseSign} emissive="#ffffff" emissiveMap={penthouseSign}
          emissiveIntensity={3.5} toneMapped={false} transparent alphaTest={0.05}
        />
      </mesh>
      {/* Bright light spilling out of the sign */}
      <pointLight
        ref={logoGlowRef}
        position={[SIGN_BOX_CX - SIGN_BOX_W / 2 - 8, SIGN_BOX_CY, BAND_CZ]}
        color="#ffffff" intensity={80} distance={140} decay={2}
      />
      {/* Secondary glow light, slightly offset for a richer halo */}
      <pointLight
        position={[SIGN_BOX_CX - SIGN_BOX_W / 2 - 18, SIGN_BOX_CY + 6, BAND_CZ]}
        color="#f2f6ff" intensity={24} distance={90} decay={2}
      />

      {/* ── Ground-floor "SOFTPLAN" wordmark on north facade of west block (luminous) ── */}
      <mesh
        position={[BLOCK_A_CX, 10, BAND_CZ - hd - 0.8]}
        rotation={[0, Math.PI, 0]}
      >
        <planeGeometry args={[70, 14]} />
        <meshStandardMaterial
          map={groundSign} emissive="#ffffff" emissiveMap={groundSign}
          emissiveIntensity={4.5} toneMapped={false} transparent alphaTest={0.05}
        />
      </mesh>
      {/* Spill light on the ground sign */}
      <pointLight
        position={[BLOCK_A_CX, 10, BAND_CZ - hd - 8]}
        color="#ffffff" intensity={22} distance={60} decay={2}
      />


      {/* ── Rooftop mechanical boxes on east block attic (under the canopy) ── */}
      {[0, 30].map((dx, i) => (
        <mesh key={`rm-${i}`} position={[BLOCK_B_CX + dx, ATTIC_CY, BAND_CZ]}>
          <boxGeometry args={[14, ATTIC_H, 14]} />
          <meshStandardMaterial color="#14151a" roughness={0.45} metalness={0.6} />
        </mesh>
      ))}

      {/* ── Parking lot (west) ── */}
      <mesh position={[BLOCK_A_CX - BLOCK_A_W / 2 - 34, 0.9, BAND_CZ]}>
        <boxGeometry args={[58, 0.2, 76]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.95} metalness={0} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const x = BLOCK_A_CX - BLOCK_A_W / 2 - 56 + col * 6;
        const z = BAND_CZ - 30 + row * 20;
        return (
          <mesh key={`car-${i}`} position={[x, 1.8, z]}>
            <boxGeometry args={[5, 2, 2.8]} />
            <meshStandardMaterial color={`hsl(${(i * 43) % 360}, 30%, 55%)`} roughness={0.5} metalness={0.3} />
          </mesh>
        );
      })}

      {/* ── Trees scattered around ── */}
      {[
        [BLOCK_A_CX - BLOCK_A_W / 2 - 70, BAND_CZ - 30],
        [BLOCK_A_CX - BLOCK_A_W / 2 - 76, BAND_CZ + 30],
        [BLOCK_B_CX + BLOCK_B_W / 2 + 22, BAND_CZ - 20],
        [BLOCK_B_CX + BLOCK_B_W / 2 + 26, BAND_CZ + 28],
        // Palmeiras na beira do gramado, perto do lago (imagem 8)
        [-80, 72],
        [80, 70],
      ].map(([tx, tz], i) => (
        <group key={`tree-${i}`} position={[tx, 0, tz]}>
          <mesh position={[0, 5, 0]}>
            <cylinderGeometry args={[0.7, 0.9, 10, 6]} />
            <meshStandardMaterial color="#5a3a22" roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, 12, 0]}>
            <sphereGeometry args={[5, 8, 6]} />
            <meshStandardMaterial color="#2e6f2a" roughness={0.85} metalness={0} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 0.55, BAND_CZ - hd - 22]}>
        <boxGeometry args={[COMPLEX_W - 10, 0.3, 8]} />
        <meshStandardMaterial color="#335f28" roughness={0.95} metalness={0} />
      </mesh>

      <pointLight
        position={[0, 12, LAKE_CZ - 30]}
        color="#7cd6c0" intensity={14} distance={90} decay={2}
      />
    </group>
  );
}
