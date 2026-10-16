/**
 * Fills for shapes, free areas and text beyond a plain colour: a linear gradient,
 * optionally fading out to transparent, or one of the paint patterns. Like patterns on
 * the paint, a fill is stored as a few values and the editor rebuilds it from them.
 *
 * The discriminant is `kind`, not `type`: Fabric turns every serialized property with a
 * `type` it knows (such as 'gradient' or 'pattern') into one of its own objects.
 */
import { defaultPattern, sanitizePattern, type PatternSpec } from './patterns.ts';

export type FillSpec =
  | {
      kind: 'gradient';
      from: string;
      to: string;
      /** Direction in degrees: 0 runs left to right, 90 top to bottom. */
      angle: number;
      /** Fade from `from` to transparent instead of to `to`. */
      fade: boolean;
    }
  | { kind: 'pattern'; pattern: PatternSpec };

export const defaultGradient = (from: string): FillSpec => ({ kind: 'gradient', from, to: '#151515', angle: 0, fade: false });
export const defaultPatternFill = (): FillSpec => ({ kind: 'pattern', pattern: defaultPattern() });

/** The colour that stands in for the fill where only a plain colour fits. */
export function fillColor(spec: FillSpec): string {
  return spec.kind === 'gradient' ? spec.from : spec.pattern.colors[0];
}

/** Gradient line in fractions of the layer's box, through its centre, reaching both corners. */
export function gradientCoords(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const half = (Math.abs(dx) + Math.abs(dy)) / 2;
  return { x1: 0.5 - dx * half, y1: 0.5 - dy * half, x2: 0.5 + dx * half, y2: 0.5 + dy * half };
}

/** The end colour: `to`, or `from` turned fully transparent so the fade does not pass through grey. */
export function gradientEnd(spec: Extract<FillSpec, { kind: 'gradient' }>): string {
  if (!spec.fade) return spec.to;
  const n = parseInt(spec.from.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},0)`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Validates a fill from untrusted data. */
export function sanitizeFill(value: unknown): FillSpec | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (v.kind === 'pattern') {
    const pattern = sanitizePattern(v.pattern);
    return pattern && { kind: 'pattern', pattern };
  }
  if (v.kind !== 'gradient' || typeof v.from !== 'string' || !HEX.test(v.from)) return undefined;
  const angle = typeof v.angle === 'number' && Number.isFinite(v.angle) ? ((v.angle % 360) + 360) % 360 : 0;
  return {
    kind: 'gradient',
    from: v.from.toLowerCase(),
    to: typeof v.to === 'string' && HEX.test(v.to) ? v.to.toLowerCase() : '#151515',
    angle,
    fade: v.fade === true,
  };
}
