/**
 * Freehand painting. The brush tip hangs on a short string behind the pointer (a
 * "lazy mouse" stabiliser): the wobble of a hand on a mouse never reaches the
 * stroke, only the deliberate movement does. Strokes are stored as plain paths.
 */
import type { PathCommand } from './lines.ts';

export interface BrushStyle {
  color: string;
  /** Stroke width in texture pixels. */
  width: number;
  /** 0 = the tip follows the pointer exactly, 1 = the strongest smoothing. */
  smoothing: number;
}

export interface XY {
  x: number;
  y: number;
}

export const DEFAULT_BRUSH: BrushStyle = { color: '#151515', width: 16, smoothing: 0.5 };
export const BRUSH_WIDTH_MIN = 2;
export const BRUSH_WIDTH_MAX = 120;

/** Length of the stabiliser string at full smoothing, in screen pixels. */
const MAX_STRING = 36;

export const stringLength = (smoothing: number) => Math.min(1, Math.max(0, smoothing)) * MAX_STRING;

/** Where the tip goes: it rests while the pointer moves within the string's reach and is pulled along beyond it. */
export function pullTip(tip: XY, pointer: XY, length: number): XY {
  const dx = pointer.x - tip.x;
  const dy = pointer.y - tip.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= length) return tip;
  const k = (distance - length) / distance;
  return { x: tip.x + dx * k, y: tip.y + dy * k };
}

/**
 * Smooth path through the stroke: quadratic curves from midpoint to midpoint with the
 * recorded points as control points. A single point becomes a dot.
 */
export function strokePath(points: readonly XY[]): PathCommand[] {
  if (points.length === 0) return [];
  const first = points[0];
  // A zero-length path renders differently across browsers; a tiny one is a round dot everywhere.
  if (points.length === 1) return [['M', first.x, first.y], ['L', first.x + 0.01, first.y]];
  const path: PathCommand[] = [['M', first.x, first.y]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    path.push(['Q', p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2]);
  }
  const last = points[points.length - 1];
  path.push(['L', last.x, last.y]);
  return path;
}
