/**
 * Procedural paint patterns (camouflage) for the paint zones.
 *
 * A pattern is stored as a few values (kind, colours, size, seed) instead of an
 * image, so undo, autosave and design files need nothing special. Generation is
 * deterministic: the same spec always paints the same texture, on every machine.
 */
import { Perlin } from './noise.ts';
import { mulberry32, randomSeed } from './random.ts';
import { TEXTURE_SIZE } from './templateTypes.ts';

export { randomSeed };

export type PatternKind = 'woodland' | 'digital' | 'tiger' | 'flecktarn' | 'zebra' | 'leopard';

export interface PatternSpec {
  kind: PatternKind;
  /** Four #rrggbb colours, base colour first. */
  colors: string[];
  /** Relative feature size; 1 is the default. */
  scale: number;
  seed: number;
}

export const PATTERN_KINDS: readonly {
  kind: PatternKind;
  label: string;
  /** How many of the four colours the pattern uses (base first). */
  colors: number;
  /** Palette applied when switching to this kind, unless the colours were customised. */
  palette?: string;
}[] = [
  { kind: 'woodland', label: 'Woodland', colors: 4 },
  { kind: 'digital', label: 'Digital', colors: 4 },
  { kind: 'tiger', label: 'Tiger', colors: 4 },
  { kind: 'flecktarn', label: 'Flecktarn', colors: 4, palette: 'Flecktarn' },
  { kind: 'zebra', label: 'Zebra', colors: 2, palette: 'Schwarz-Weiß' },
  { kind: 'leopard', label: 'Leopard', colors: 3, palette: 'Savanne' },
];

export const PATTERN_PALETTES: readonly { name: string; colors: readonly string[] }[] = [
  { name: 'Woodland', colors: ['#8c8360', '#4f5c34', '#5e4736', '#1f201c'] },
  { name: 'Wüste', colors: ['#d7c49d', '#bba077', '#8e7354', '#5f4f3d'] },
  { name: 'Winter', colors: ['#e9ebed', '#b9bfc5', '#7f878e', '#40464b'] },
  { name: 'Urban', colors: ['#9a9da1', '#66696e', '#3d4044', '#c9cbce'] },
  { name: 'Marine', colors: ['#9aaabb', '#5d7591', '#34495f', '#1c2938'] },
  { name: '70er', colors: ['#efdcb5', '#e3a33c', '#c4572a', '#5c3a22'] },
  { name: 'Flecktarn', colors: ['#8d8f5e', '#5a6b3a', '#5f4a35', '#1d1e19'] },
  { name: 'Schwarz-Weiß', colors: ['#f1eee6', '#161616', '#6b6b6b', '#b9b4a8'] },
  { name: 'Savanne', colors: ['#d9a54a', '#b0702c', '#241810', '#f0d9a0'] },
];

const sameColors = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());

export function isPalette(colors: readonly string[], palette: { colors: readonly string[] }): boolean {
  return sameColors(colors, palette.colors);
}

/**
 * Switches the pattern kind. Animal patterns and Flecktarn bring their own palette;
 * colours the user picked by hand are kept.
 */
export function withKind(spec: PatternSpec, kind: PatternKind): PatternSpec {
  const usesPreset = PATTERN_PALETTES.some((p) => isPalette(spec.colors, p));
  if (!usesPreset) return { ...spec, kind };
  const own = PATTERN_KINDS.find((k) => k.kind === kind)?.palette;
  const special = PATTERN_KINDS.some((k) => k.palette && PATTERN_PALETTES.some((p) => p.name === k.palette && isPalette(spec.colors, p)));
  const palette = own ?? (special ? PATTERN_PALETTES[0].name : undefined);
  const colors = palette ? [...PATTERN_PALETTES.find((p) => p.name === palette)!.colors] : spec.colors;
  return { ...spec, kind, colors };
}

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

const RECIPES: Record<'woodland' | 'digital' | 'tiger', Recipe> = {
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

type Shape = Pick<PatternSpec, 'kind' | 'scale' | 'seed'>;

/**
 * Colour index (0 = base, 1-3) for every pixel of a width x height image.
 * `texelsPerPixel` > 1 renders a zoomed-out view, e.g. for thumbnails.
 */
export function patternIndices(spec: Shape, width: number, height: number, texelsPerPixel = 1): Uint8Array {
  switch (spec.kind) {
    case 'flecktarn':
      return flecktarn(spec, width, height, texelsPerPixel);
    case 'zebra':
      return zebra(spec, width, height, texelsPerPixel);
    case 'leopard':
      return leopard(spec, width, height, texelsPerPixel);
    default:
      return noiseLayers(spec, RECIPES[spec.kind], width, height, texelsPerPixel);
  }
}

/** Woodland, digital and tiger: noise fields thresholded into colour layers. */
function noiseLayers(spec: Shape, recipe: Recipe, width: number, height: number, texelsPerPixel: number): Uint8Array {
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

/** A smooth field sampled on a coarse grid and bilinearly interpolated per pixel. */
class Field {
  private readonly values: Float32Array;
  private readonly gw: number;
  private readonly step: number;

  constructor(width: number, height: number, texelsPerPixel: number, sample: (tx: number, ty: number) => number) {
    this.step = Math.max(1, Math.round(GRID_TEXELS / texelsPerPixel));
    this.gw = Math.ceil(width / this.step) + 1;
    const gh = Math.ceil(height / this.step) + 1;
    this.values = new Float32Array(this.gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < this.gw; i++) this.values[j * this.gw + i] = sample(i * this.step * texelsPerPixel, j * this.step * texelsPerPixel);
    }
  }

  at(x: number, y: number): number {
    const gx = x / this.step;
    const gy = y / this.step;
    const i = gx | 0;
    const j = gy | 0;
    const fx = gx - i;
    const fy = gy - j;
    const v = this.values;
    const a = j * this.gw + i;
    const top = v[a] + fx * (v[a + 1] - v[a]);
    const bottom = v[a + this.gw] + fx * (v[a + this.gw + 1] - v[a + this.gw]);
    return top + fy * (bottom - top);
  }
}

/** Sets `index` for the pixels of an ellipse given in texture coordinates. */
function fillEllipse(out: Uint8Array, width: number, height: number, tpp: number, x: number, y: number, rx: number, ry: number, index: number): void {
  const x0 = Math.max(0, Math.floor((x - rx) / tpp));
  const x1 = Math.min(width - 1, Math.floor((x + rx) / tpp));
  const y0 = Math.max(0, Math.floor((y - ry) / tpp));
  const y1 = Math.min(height - 1, Math.floor((y + ry) / tpp));
  for (let py = y0; py <= y1; py++) {
    const dy = ((py + 0.5) * tpp - y) / ry;
    for (let px = x0; px <= x1; px++) {
      const dx = ((px + 0.5) * tpp - x) / rx;
      if (dx * dx + dy * dy <= 1) out[py * width + px] = index;
    }
  }
  // Dots smaller than a pixel (thumbnails) still mark the pixel they sit in.
  const cx = Math.floor(x / tpp);
  const cy = Math.floor(y / tpp);
  if (cx >= 0 && cx < width && cy >= 0 && cy < height && rx < tpp) out[cy * width + cx] = index;
}

/** Flecktarn: clusters of small dots in three colours over the base. */
function flecktarn(spec: Shape, width: number, height: number, tpp: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const random = mulberry32(spec.seed * 7 + 3);
  const clusters = [0, 1, 2].map((k) => new Perlin(spec.seed * 3 + 50 + k));
  const thresholds = [-0.14, -0.03, 0.1];
  const cell = 13 * spec.scale;
  const clusterSize = 110 * spec.scale;
  for (let k = 0; k < 3; k++) {
    for (let cy = -cell; cy < height * tpp + cell; cy += cell) {
      for (let cx = -cell; cx < width * tpp + cell; cx += cell) {
        const x = cx + random() * cell;
        const y = cy + random() * cell;
        const r = (2.6 + random() * 4.4) * spec.scale * (k === 2 ? 0.8 : 1);
        const jitter = (random() - 0.5) * 0.12;
        if (clusters[k].fbm(x / clusterSize, y / clusterSize, 3) + jitter < thresholds[k]) continue;
        fillEllipse(out, width, height, tpp, x, y, r * (0.8 + random() * 0.4), r * (0.8 + random() * 0.4), k + 1);
      }
    }
  }
  return out;
}

/** Zebra: wavy vertical stripes that swell and taper. Two colours. */
function zebra(spec: Shape, width: number, height: number, tpp: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const warpNoise = new Perlin(spec.seed * 3 + 70);
  const taperNoise = new Perlin(spec.seed * 3 + 71);
  const s = spec.scale;
  const period = 90 * s;
  const warp = new Field(width, height, tpp, (tx, ty) => 135 * s * warpNoise.fbm(tx / (380 * s), ty / (260 * s), 4));
  const taper = new Field(width, height, tpp, (tx, ty) => 0.42 + 0.28 * taperNoise.fbm(tx / (240 * s), ty / (180 * s), 3));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const phase = (x * tpp + warp.at(x, y)) / period;
      if (phase - Math.floor(phase) < taper.at(x, y)) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Leopard: rosettes with broken dark rings around a darker centre, plus small spots. */
function leopard(spec: Shape, width: number, height: number, tpp: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const random = mulberry32(spec.seed * 11 + 5);
  const cell = 100 * spec.scale;
  for (let cy = -cell; cy < height * tpp + cell; cy += cell) {
    for (let cx = -cell; cx < width * tpp + cell; cx += cell) {
      const x = cx + (0.15 + random() * 0.7) * cell;
      const y = cy + (0.15 + random() * 0.7) * cell;
      const r = (0.3 + random() * 0.12) * cell;
      const [p1, p2, gapPhase] = [random(), random(), random()].map((v) => v * Math.PI * 2);
      const gaps = 2 + Math.floor(random() * 3);
      const reach = r * 1.35;
      const x0 = Math.max(0, Math.floor((x - reach) / tpp));
      const x1 = Math.min(width - 1, Math.floor((x + reach) / tpp));
      const y0 = Math.max(0, Math.floor((y - reach) / tpp));
      const y1 = Math.min(height - 1, Math.floor((y + reach) / tpp));
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const dx = (px + 0.5) * tpp - x;
          const dy = (py + 0.5) * tpp - y;
          const dist = Math.hypot(dx, dy);
          if (dist > reach) continue;
          const a = Math.atan2(dy, dx);
          // Lumpy outline instead of a perfect circle.
          const d = dist / (r * (1 + 0.18 * Math.sin(3 * a + p1) + 0.1 * Math.sin(5 * a + p2)));
          const i = py * width + px;
          if (d > 0.6 && d < 1 && Math.sin(gaps * a + gapPhase) > -0.55) out[i] = 2;
          else if (d <= 0.6 && out[i] === 0) out[i] = 1;
        }
      }
      // Small solid spots in the gaps between rosettes.
      if (random() < 0.6) {
        const sr = (0.05 + random() * 0.06) * cell;
        fillEllipse(out, width, height, tpp, cx + random() * cell, cy + random() * cell, sr, sr * (0.7 + random() * 0.5), 2);
      }
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
