/**
 * Hot-rod flames: a rounded base on the left and a fan of licks running out to the
 * right. Each lick is its own closed teardrop around an S-shaped centre line; the
 * shapes overlap, and rendering the stroke before the fill (paintFirst: 'stroke')
 * turns their union into one clean outline without any path boolean operations.
 * Deterministic from the seed, so a flame layer can be stored as seed and colours.
 */
import { mulberry32 } from './random.ts';

export const FLAME_WIDTH = 1000;
export const FLAME_HEIGHT = 340;
/** Base, middle and tip colour of the flame gradient. */
export const DEFAULT_FLAME_COLORS = ['#ffd23f', '#ff7b1c', '#d42a12'] as const;

interface Point {
  x: number;
  y: number;
}

const fmt = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

/** Smooth path through the points (Catmull-Rom as cubic Béziers), without the initial move. */
function spline(points: Point[]): string {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`;
  }
  return d;
}

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): { at: Point; tangent: Point } {
  const s = 1 - t;
  const at = {
    x: s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x,
    y: s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y,
  };
  const tangent = {
    x: 3 * s * s * (p1.x - p0.x) + 6 * s * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * s * s * (p1.y - p0.y) + 6 * s * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
  return { at, tangent };
}

/** Width of a lick at its root, relative to its half thickness. */
const ROOT_WIDTH = 0.7;

function lick(root: Point, tip: Point, sway: number, half: number): string {
  const length = tip.x - root.x;
  const c1 = { x: root.x + length * 0.35, y: root.y - sway * 0.7 };
  const c2 = { x: root.x + length * 0.72, y: tip.y + sway * 1.1 };
  const upper: Point[] = [];
  const lower: Point[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { at, tangent } = bezier(root, c1, c2, tip, t);
    const norm = Math.hypot(tangent.x, tangent.y) || 1;
    // Narrow root, fat belly, then tapering to a sharp point.
    const width = half * Math.pow(1 - t, 0.9) * (ROOT_WIDTH + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.6)));
    const nx = -tangent.y / norm;
    const ny = tangent.x / norm;
    upper.push({ x: at.x + nx * width, y: at.y + ny * width });
    lower.push({ x: at.x - nx * width, y: at.y - ny * width });
  }
  // Two separate splines meet at the tip, which keeps the point sharp.
  return `M ${fmt(upper[0])}${spline(upper)}${spline(lower.reverse())} Z`;
}

export function flamePath(seed: number): string {
  const random = mulberry32(seed);
  const count = 6 + Math.floor(random() * 3);
  const top = 40;
  const spacing = (FLAME_HEIGHT - 2 * top) / (count - 1);
  const baseX = 100;
  const rootX = baseX + 40;

  const licks = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    // Middle licks reach furthest, alternating long and short ones for rhythm.
    const reach = (1 - Math.abs(t - 0.5) * 0.8) * (i % 2 === 0 ? 1 : 0.72) * (0.8 + random() * 0.2);
    const y = top + i * spacing + (random() - 0.5) * spacing * 0.3;
    const curl = (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5);
    return {
      root: { x: rootX, y: FLAME_HEIGHT / 2 + (y - FLAME_HEIGHT / 2) * 0.8 },
      tip: { x: baseX + (FLAME_WIDTH - baseX - 10) * reach, y: y + curl * spacing * 0.9 },
      sway: curl * spacing * 0.8,
      half: spacing * (0.95 + random() * 0.25),
    };
  });

  // The rounded base spans exactly the licks' roots: its top and bottom meet the outer
  // licks where they start, so the outline flows from base into licks without a bump.
  const topEdge = Math.min(...licks.map((l) => l.root.y - l.half * ROOT_WIDTH));
  const bottomEdge = Math.max(...licks.map((l) => l.root.y + l.half * ROOT_WIDTH));
  const cy = (topEdge + bottomEdge) / 2;
  const r = { x: 90, y: (bottomEdge - topEdge) / 2 };
  let d = `M ${fmt({ x: rootX, y: cy - r.y })}`;
  d += ` C ${fmt({ x: rootX - r.x * 1.1, y: cy - r.y })} ${fmt({ x: rootX - r.x * 1.1, y: cy + r.y })} ${fmt({ x: rootX, y: cy + r.y })}`;
  d += ` C ${fmt({ x: rootX + r.x * 0.9, y: cy + r.y })} ${fmt({ x: rootX + r.x * 0.9, y: cy - r.y })} ${fmt({ x: rootX, y: cy - r.y })} Z`;
  for (const l of licks) d += ` ${lick(l.root, l.tip, l.sway, l.half)}`;
  return d;
}
