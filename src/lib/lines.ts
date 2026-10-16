/**
 * Shapes through points the user clicks: pinstripes (open lines) and free areas
 * (closed, filled), drawn as a smooth curve or as straight segments. A shape is stored
 * as its points and style; the path is rebuilt from them, so the points stay editable.
 */

export type LinePattern = 'solid' | 'dashed' | 'dotted';

export interface LineStyle {
  color: string;
  /** Width of the line itself, in texture pixels. */
  width: number;
  outline: string;
  /** Outline on each side of the line; 0 for none. */
  outlineWidth: number;
  pattern: LinePattern;
  /** A smooth curve through the points, or straight segments with rounded corners. */
  smooth: boolean;
}

export type LinePoint = [number, number];

export interface LineSpec extends LineStyle {
  points: LinePoint[];
}

export const LINE_PATTERNS: readonly { pattern: LinePattern; label: string }[] = [
  { pattern: 'solid', label: 'Durchgehend' },
  { pattern: 'dashed', label: 'Gestrichelt' },
  { pattern: 'dotted', label: 'Gepunktet' },
];

export const DEFAULT_LINE_STYLE: LineStyle = {
  color: '#f4f1e8',
  width: 10,
  outline: '#151515',
  outlineWidth: 0,
  pattern: 'solid',
  smooth: true,
};

export const LINE_WIDTH_MIN = 2;
export const LINE_WIDTH_MAX = 80;
export const LINE_OUTLINE_MAX = 20;
export const MAX_LINE_POINTS = 200;

/** A free area: a closed shape through its points, filled like any other shape. */
export interface AreaSpec {
  points: LinePoint[];
  smooth: boolean;
}

export const MIN_AREA_POINTS = 3;

/** How the next free area looks; areas are filled and outlined like the other shapes. */
export interface AreaStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  smooth: boolean;
}

export const DEFAULT_AREA_STYLE: AreaStyle = { fill: '#d9572b', stroke: '#1d1d1f', strokeWidth: 0, smooth: false };

export type PathCommand =
  | ['M', number, number]
  | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

/**
 * The path through all points, back to the first one when closed. Smooth paths are a
 * centripetal Catmull-Rom spline as cubic Béziers: it passes through every point and,
 * unlike the uniform variant, never loops or overshoots when the points are unevenly
 * spaced.
 */
export function linePath(points: readonly LinePoint[], smooth: boolean, closed = false): PathCommand[] {
  if (points.length === 0) return [];
  const n = points.length;
  const path: PathCommand[] = [['M', points[0][0], points[0][1]]];
  if (!smooth || n < 3) {
    for (const [x, y] of points.slice(1)) path.push(['L', x, y]);
    if (closed) path.push(['Z']);
    return path;
  }
  // An open line has no neighbours beyond its ends; a closed one wraps around.
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // Square roots of the chord lengths: the centripetal parametrisation (alpha = 0.5).
    const d01 = Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
    const d12 = Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const d23 = Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
    let c1: LinePoint = [p1[0], p1[1]];
    let c2: LinePoint = [p2[0], p2[1]];
    if (d01 > 1e-6) {
      const a = 2 * d01 * d01 + 3 * d01 * d12 + d12 * d12;
      const n = 3 * d01 * (d01 + d12);
      c1 = [(p1[0] * a - p0[0] * d12 * d12 + p2[0] * d01 * d01) / n, (p1[1] * a - p0[1] * d12 * d12 + p2[1] * d01 * d01) / n];
    }
    if (d23 > 1e-6) {
      const b = 2 * d23 * d23 + 3 * d23 * d12 + d12 * d12;
      const m = 3 * d23 * (d23 + d12);
      c2 = [(p2[0] * b + p1[0] * d23 * d23 - p3[0] * d12 * d12) / m, (p2[1] * b + p1[1] * d23 * d23 - p3[1] * d12 * d12) / m];
    }
    path.push(['C', c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]]);
  }
  if (closed) path.push(['Z']);
  return path;
}

/**
 * Dash pattern in texture pixels. Lines have round caps, which add half a width to
 * both ends of every dash: a zero-length dash is a dot exactly one width across.
 */
export function lineDashArray({ pattern, width }: Pick<LineStyle, 'pattern' | 'width'>): number[] | null {
  if (pattern === 'dashed') return [width * 2.5, width * 3];
  if (pattern === 'dotted') return [0, width * 2];
  return null;
}

/** Just the style of a line, without its points. */
export function lineStyleOf({ color, width, outline, outlineWidth, pattern, smooth }: LineStyle): LineStyle {
  return { color, width, outline, outlineWidth, pattern, smooth };
}

const HEX = /^#[0-9a-f]{6}$/i;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const number = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const isPoint = (p: unknown): p is LinePoint =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e5);

/** Validates a line style from untrusted data; broken fields fall back to the defaults. */
export function sanitizeLineStyle(value: unknown): LineStyle {
  const v = isRecord(value) ? value : {};
  const color = (c: unknown, fallback: string) => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : fallback);
  const base = DEFAULT_LINE_STYLE;
  return {
    color: color(v.color, base.color),
    width: number(v.width, LINE_WIDTH_MIN, LINE_WIDTH_MAX, base.width),
    outline: color(v.outline, base.outline),
    outlineWidth: number(v.outlineWidth, 0, LINE_OUTLINE_MAX, base.outlineWidth),
    pattern: LINE_PATTERNS.find((p) => p.pattern === v.pattern)?.pattern ?? base.pattern,
    smooth: typeof v.smooth === 'boolean' ? v.smooth : base.smooth,
  };
}

function sanitizePoints(value: unknown): LinePoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPoint)
    .slice(0, MAX_LINE_POINTS)
    .map(([x, y]): LinePoint => [x, y]);
}

/** Validates a line from untrusted data; a line needs at least two points. */
export function sanitizeLine(value: unknown): LineSpec | undefined {
  if (!isRecord(value)) return undefined;
  const points = sanitizePoints(value.points);
  if (points.length < 2) return undefined;
  return { ...sanitizeLineStyle(value), points };
}

/**
 * The points of an area from its stored path, for areas saved before their points
 * were: every segment of the path ends on one of them.
 */
export function areaFromPath(path: unknown): AreaSpec | undefined {
  if (!Array.isArray(path)) return undefined;
  const points: LinePoint[] = [];
  let smooth = false;
  for (const command of path) {
    if (!Array.isArray(command) || command[0] === 'Z') break;
    if (command[0] === 'C') smooth = true;
    points.push([command[command.length - 2], command[command.length - 1]]);
  }
  // A smooth area closes with a curve back onto its first point.
  const first = points[0];
  const last = points.at(-1);
  if (first && last && points.length > 1 && last[0] === first[0] && last[1] === first[1]) points.pop();
  return sanitizeArea({ points, smooth });
}

/** Validates a free area from untrusted data; an area needs at least three points. */
export function sanitizeArea(value: unknown): AreaSpec | undefined {
  if (!isRecord(value)) return undefined;
  const points = sanitizePoints(value.points);
  if (points.length < MIN_AREA_POINTS) return undefined;
  return { points, smooth: value.smooth === true };
}
