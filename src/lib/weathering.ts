/**
 * Wear on the paint: rust spots and scratches. Stored as two amounts and a seed and
 * generated deterministically, so a design looks the same on every machine.
 */
import { Perlin } from './noise.ts';
import { mulberry32 } from './random.ts';
import { TEXTURE_SIZE } from './templateTypes.ts';

export interface Weathering {
  /** 0 = none, 1 = heavily rusted. */
  rust: number;
  /** 0 = none, 1 = heavily scratched. */
  scratches: number;
  seed: number;
}

const amount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Validates weathering from untrusted data (design files, old autosaves). */
export function sanitizeWeathering(value: unknown): Weathering | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  let seed = typeof v.seed === 'number' && Number.isFinite(v.seed) ? Math.abs(Math.trunc(v.seed)) : 1;
  if (seed < 1 || seed > 2147483646) seed = (seed % 2147483646) + 1;
  return { rust: amount(v.rust), scratches: amount(v.scratches), seed };
}

export const hasWeathering = (w: Weathering | undefined): w is Weathering => !!w && (w.rust > 0 || w.scratches > 0);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Rust colours from the outer, freshly corroded edge to the dark, eaten-through core.
const EDGE = [180, 97, 45];
const MID = [122, 58, 26];
const CORE = [63, 33, 18];

/** Field values are sampled on this grid (texture pixels) and interpolated in between. */
const GRID = 4;
const HALO_ALPHA = 75;

/** RGBA pixels of the rust layer for a width x height image (unmasked). */
export function rustPixels(w: Pick<Weathering, 'rust' | 'seed'>, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4);
  if (w.rust <= 0) return out;
  const large = new Perlin(w.seed * 5 + 1);
  const detail = new Perlin(w.seed * 5 + 2);
  // Higher amounts lower the threshold: from a few spots to a rat-rod body.
  const threshold = 0.58 - 0.62 * w.rust;

  const gw = Math.ceil(width / GRID) + 1;
  const gh = Math.ceil(height / GRID) + 1;
  const grid = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i * GRID;
      const y = j * GRID;
      grid[j * gw + i] = 0.62 * large.fbm(x / 230, y / 230) + 0.38 * detail.fbm(x / 28, y / 28, 5);
    }
  }

  const row = new Float32Array(gw);
  for (let y = 0; y < height; y++) {
    const gy = y / GRID;
    const j0 = Math.floor(gy);
    const fy = gy - j0;
    for (let i = 0; i < gw; i++) row[i] = grid[j0 * gw + i] + fy * (grid[(j0 + 1) * gw + i] - grid[j0 * gw + i]);
    for (let x = 0; x < width; x++) {
      const gx = x / GRID;
      const i0 = gx | 0;
      const v = row[i0] + (gx - i0) * (row[i0 + 1] - row[i0]);
      if (v < threshold - 0.045) continue;
      const p = (y * width + x) * 4;
      if (v < threshold) {
        // Blistered paint around the rust: a faint dark rim.
        out[p] = 48;
        out[p + 1] = 34;
        out[p + 2] = 24;
        out[p + 3] = HALO_ALPHA * smoothstep(threshold - 0.045, threshold, v);
        continue;
      }
      const depth = Math.min(1, (v - threshold) / 0.18);
      const toMid = smoothstep(0, 0.45, depth);
      const toCore = smoothstep(0.45, 1, depth);
      // Cheap per-pixel hash for grain, so rust looks crusty rather than flat.
      let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(w.seed, 1274126177);
      h = Math.imul(h ^ (h >>> 13), 1103515245);
      const grain = 1 + (((h >>> 16) & 255) / 255 - 0.5) * 0.24;
      for (let c = 0; c < 3; c++) {
        const base = EDGE[c] + (MID[c] - EDGE[c]) * toMid;
        out[p + c] = (base + (CORE[c] - base) * toCore) * grain;
      }
      // Starts at the rim's opacity: no gap where the paint would shine through as a light ring.
      out[p + 3] = HALO_ALPHA + (235 - HALO_ALPHA) * smoothstep(threshold, threshold + 0.02, v);
    }
  }
  return out;
}

function drawScratches(ctx: CanvasRenderingContext2D, w: Weathering, size: number): void {
  const random = mulberry32(w.seed * 31 + 7);
  const groups = Math.round(Math.pow(w.scratches, 1.4) * 1200);
  ctx.lineCap = 'round';
  for (let g = 0; g < groups; g++) {
    const x = random() * size;
    const y = random() * size;
    const angle = random() * Math.PI;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const lines = 1 + Math.floor(random() * 4);
    const length = 18 + random() * random() * 130;
    // Most scratches show bare metal; some are grime-filled and dark.
    ctx.strokeStyle = random() < 0.72 ? `rgba(232, 226, 214, ${0.45 + random() * 0.45})` : `rgba(30, 25, 21, ${0.3 + random() * 0.3})`;
    for (let l = 0; l < lines; l++) {
      const offset = (l - (lines - 1) / 2) * (2.5 + random() * 3.5);
      const len = length * (0.6 + random() * 0.4);
      const sx = x - dy * offset - (dx * len) / 2;
      const sy = y + dx * offset - (dy * len) / 2;
      const bend = (random() - 0.5) * len * 0.15;
      ctx.lineWidth = 0.7 + random() * 1.3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + (dx * len) / 2 - dy * bend, sy + (dy * len) / 2 + dx * bend, sx + dx * len, sy + dy * len);
      ctx.stroke();
    }
  }
}

/** Paints rust and scratches over the whole texture into `target` (unmasked). */
export function paintWeathering(target: HTMLCanvasElement, w: Weathering, size = TEXTURE_SIZE): void {
  target.width = size;
  target.height = size;
  const ctx = target.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  if (w.rust > 0) ctx.putImageData(new ImageData(rustPixels(w, size, size), size, size), 0, 0);
  if (w.scratches > 0) drawScratches(ctx, w, size);
}
