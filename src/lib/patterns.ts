/**
 * Procedural paint patterns (camouflage) for the paint zones.
 *
 * A pattern is stored as a few values (kind, colours, size, seed) instead of an
 * image, so undo, autosave and design files need nothing special. Generation is
 * deterministic: the same spec always paints the same texture, on every machine.
 */
import { mulberry32, randomSeed } from './random.ts';
import { TEXTURE_SIZE } from './templateTypes.ts';

export { randomSeed };

export type PatternKind = 'woodland' | 'digital' | 'tiger';

export interface PatternSpec {
  kind: PatternKind;
  /** Four #rrggbb colours, base colour first. */
  colors: string[];
  /** Relative feature size; 1 is the default. */
  scale: number;
  seed: number;
}

export const PATTERN_KINDS: readonly { kind: PatternKind; label: string }[] = [
  { kind: 'woodland', label: 'Woodland' },
  { kind: 'digital', label: 'Digital' },
  { kind: 'tiger', label: 'Tiger' },
];

export const PATTERN_PALETTES: readonly { name: string; colors: readonly string[] }[] = [
  { name: 'Woodland', colors: ['#8c8360', '#4f5c34', '#5e4736', '#1f201c'] },
  { name: 'Wüste', colors: ['#d7c49d', '#bba077', '#8e7354', '#5f4f3d'] },
  { name: 'Winter', colors: ['#e9ebed', '#b9bfc5', '#7f878e', '#40464b'] },
  { name: 'Urban', colors: ['#9a9da1', '#66696e', '#3d4044', '#c9cbce'] },
  { name: 'Marine', colors: ['#9aaabb', '#5d7591', '#34495f', '#1c2938'] },
  { name: '70er', colors: ['#efdcb5', '#e3a33c', '#c4572a', '#5c3a22'] },
];

export const PATTERN_SCALE_MIN = 0.5;
export const PATTERN_SCALE_MAX = 2;

export function defaultPattern(kind: PatternKind = 'woodland'): PatternSpec {
  return { kind, colors: [...PATTERN_PALETTES[0].colors], scale: 1, seed: randomSeed() };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Validates a pattern from untrusted data (design files, old autosaves). */
export function sanitizePattern(value: unknown): PatternSpec | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const kind = PATTERN_KINDS.find((k) => k.kind === v.kind)?.kind;
  if (!kind) return undefined;
  const given = Array.isArray(v.colors) ? v.colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 4) : [];
  const colors = [...given, ...PATTERN_PALETTES[0].colors.slice(given.length)].map((c) => c.toLowerCase());
  const scale =
    typeof v.scale === 'number' && Number.isFinite(v.scale) ? Math.min(PATTERN_SCALE_MAX, Math.max(PATTERN_SCALE_MIN, v.scale)) : 1;
  // Valid seeds must survive unchanged, or a pattern would change every time a file is loaded.
  let seed = typeof v.seed === 'number' && Number.isFinite(v.seed) ? Math.abs(Math.trunc(v.seed)) : 1;
  if (seed < 1 || seed > 2147483646) seed = (seed % 2147483646) + 1;
  return { kind, colors, scale, seed };
}

// ---- noise -------------------------------------------------------------------

function grad(hash: number, x: number, y: number): number {
  switch (hash & 7) {
    case 0:
      return x + y;
    case 1:
      return y - x;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}

/** Classic 2D gradient noise with a seeded permutation table. */
class Perlin {
  private readonly perm = new Uint8Array(512);

  constructor(seed: number) {
    const random = mulberry32(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x: number, y: number): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const xi = fx & 255;
    const yi = fy & 255;
    const xf = x - fx;
    const yf = y - fy;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const p = this.perm;
    const a = p[xi] + yi;
    const b = p[xi + 1] + yi;
    const n00 = grad(p[a], xf, yf);
    const n10 = grad(p[b], xf - 1, yf);
    const n01 = grad(p[a + 1], xf, yf - 1);
    const n11 = grad(p[b + 1], xf - 1, yf - 1);
    const top = n00 + u * (n10 - n00);
    return top + v * (n01 + u * (n11 - n01) - top);
  }

  /** Fractal noise: four octaves, roughly in [-1, 1]. */
  fbm(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let frequency = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * this.noise(x * frequency, y * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return sum / norm;
  }
}

// ---- patterns --------------------------------------------------------------------

/** One colour layer: noise above `threshold` paints colour index layer+1 over the ones below. */
interface ColourLayer {
  /** Feature size in texture pixels, per axis. */
  sizeX: number;
  sizeY: number;
  threshold: number;
}

interface Recipe {
  layers: readonly [ColourLayer, ColourLayer, ColourLayer];
  /** Pixel size of digital camouflage, in texture pixels. */
  cell?: number;
  /** Vertical waviness in texture pixels, for brush-stroke patterns. */
  warp?: number;
}

const RECIPES: Record<PatternKind, Recipe> = {
  woodland: {
    layers: [
      { sizeX: 200, sizeY: 200, threshold: 0 },
      { sizeX: 180, sizeY: 180, threshold: 0.06 },
      { sizeX: 125, sizeY: 125, threshold: 0.2 },
    ],
  },
  digital: {
    layers: [
      { sizeX: 150, sizeY: 150, threshold: 0.04 },
      { sizeX: 130, sizeY: 130, threshold: 0.1 },
      { sizeX: 95, sizeY: 95, threshold: 0.22 },
    ],
    cell: 12,
  },
  tiger: {
    layers: [
      { sizeX: 560, sizeY: 80, threshold: 0.02 },
      { sizeX: 480, sizeY: 62, threshold: 0.13 },
      { sizeX: 400, sizeY: 46, threshold: 0.24 },
    ],
    warp: 70,
  },
};

/** Field values are sampled on this grid (texture pixels) and interpolated in between. */
const GRID_TEXELS = 8;

/**
 * Colour index (0 = base, 1-3) for every pixel of a width x height image.
 * `texelsPerPixel` > 1 renders a zoomed-out view, e.g. for thumbnails.
 */
export function patternIndices(spec: Pick<PatternSpec, 'kind' | 'scale' | 'seed'>, width: number, height: number, texelsPerPixel = 1): Uint8Array {
  const recipe = RECIPES[spec.kind];
  const noises = recipe.layers.map((_, k) => new Perlin(spec.seed * 3 + k + 1));
  const warpNoise = recipe.warp ? new Perlin(spec.seed * 3 + 101) : undefined;
  const [t0, t1, t2] = recipe.layers.map((l) => l.threshold);
  const out = new Uint8Array(width * height);

  const sample = (k: number, tx: number, ty: number) => {
    const layer = recipe.layers[k];
    return noises[k].fbm(tx / (layer.sizeX * spec.scale), ty / (layer.sizeY * spec.scale));
  };
  const warpY = (tx: number, ty: number) =>
    warpNoise ? ty + recipe.warp! * spec.scale * warpNoise.fbm(tx / 320, ty / 320, 2) : ty;

  if (recipe.cell) {
    const cell = Math.max(1, Math.round((recipe.cell * spec.scale) / texelsPerPixel));
    const jitter = mulberry32(spec.seed + 7919);
    for (let cy = 0; cy < height; cy += cell) {
      for (let cx = 0; cx < width; cx += cell) {
        const tx = (cx + cell / 2) * texelsPerPixel;
        const ty = (cy + cell / 2) * texelsPerPixel;
        // A little per-cell threshold noise frays the edges like printed digital camo.
        const j = (jitter() - 0.5) * 0.1;
        let index = 0;
        if (sample(0, tx, ty) > t0 + j) index = 1;
        if (sample(1, tx, ty) > t1 + j) index = 2;
        if (sample(2, tx, ty) > t2 + j) index = 3;
        for (let y = cy; y < Math.min(cy + cell, height); y++) out.fill(index, y * width + cx, y * width + Math.min(cx + cell, width));
      }
    }
    return out;
  }

  const step = Math.max(1, Math.round(GRID_TEXELS / texelsPerPixel));
  const gw = Math.ceil(width / step) + 1;
  const gh = Math.ceil(height / step) + 1;
  const grids = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const tx = i * step * texelsPerPixel;
      const ty = warpY(tx, j * step * texelsPerPixel);
      for (let k = 0; k < 3; k++) grids[k][j * gw + i] = sample(k, tx, ty);
    }
  }

  // Bilinear upsampling, one row at a time: interpolate between grid rows first.
  const rows = [new Float32Array(gw), new Float32Array(gw), new Float32Array(gw)];
  for (let y = 0; y < height; y++) {
    const gy = y / step;
    const j0 = Math.floor(gy);
    const fy = gy - j0;
    for (let k = 0; k < 3; k++) {
      const grid = grids[k];
      const row = rows[k];
      const a = j0 * gw;
      const b = a + gw;
      for (let i = 0; i < gw; i++) row[i] = grid[a + i] + fy * (grid[b + i] - grid[a + i]);
    }
    const [r0, r1, r2] = rows;
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      const gx = x / step;
      const i0 = gx | 0;
      const fx = gx - i0;
      let index = 0;
      if (r0[i0] + fx * (r0[i0 + 1] - r0[i0]) > t0) index = 1;
      if (r1[i0] + fx * (r1[i0 + 1] - r1[i0]) > t1) index = 2;
      if (r2[i0] + fx * (r2[i0 + 1] - r2[i0]) > t2) index = 3;
      out[offset + x] = index;
    }
  }
  return out;
}

// ---- rendering (browser only) ----------------------------------------------------------

/** Insertion-ordered Map as a tiny LRU cache. */
function remember<T>(cache: Map<string, T>, key: string, limit: number, make: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = make();
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value!);
  return value;
}

const indexCache = new Map<string, Uint8Array>();
const canvasCache = new Map<string, HTMLCanvasElement>();
const thumbnailCache = new Map<string, string>();

function paint(indices: Uint8Array, colors: readonly string[], width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, height);
  const pixels = new Uint32Array(image.data.buffer);
  // ImageData is RGBA in memory, i.e. 0xAABBGGRR as little-endian 32-bit words.
  const lut = colors.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
  });
  for (let i = 0; i < indices.length; i++) pixels[i] = lut[indices[i]];
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The pattern over the whole texture, in texture coordinates. Cached, so recolouring is cheap. */
export function patternCanvas(spec: PatternSpec): HTMLCanvasElement {
  const shape = `${spec.kind}|${spec.seed}|${spec.scale}`;
  return remember(canvasCache, `${shape}|${spec.colors.join(',')}`, 3, () =>
    paint(
      remember(indexCache, shape, 3, () => patternIndices(spec, TEXTURE_SIZE, TEXTURE_SIZE)),
      spec.colors,
      TEXTURE_SIZE,
      TEXTURE_SIZE,
    ),
  );
}

/** Small preview as data URL, showing a 640 texel wide section at the pattern's real size. */
export function patternThumbnail(spec: PatternSpec, size = 64): string {
  const key = `${spec.kind}|${spec.seed}|${spec.scale}|${spec.colors.join(',')}|${size}`;
  return remember(thumbnailCache, key, 48, () => paint(patternIndices(spec, size, size, 640 / size), spec.colors, size, size).toDataURL());
}
