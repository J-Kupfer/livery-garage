/**
 * Classifies the layers of the official livery templates (one PSD per car).
 *
 * The templates share a naming scheme, but the names are typed by hand and vary
 * ("colou3", "colourr3", "colour23", "Layer 2", "window"), so matching is lenient.
 */

export type PaintZone = 'body' | 'second' | 'roof';

export type LayerClass =
  | { role: 'base' }
  /** One colour variant of a paintable zone. All variants of a zone share the same shape. */
  | { role: 'paint'; zone: PaintZone }
  /** One wheel/rim variant. */
  | { role: 'wheels' }
  /** UV wireframe: an editing guide, never part of the exported livery. */
  | { role: 'uv' }
  /** Everything drawn as-is: trim ("extra"), lights, windows, wood, metal parts. */
  | { role: 'detail' };

const PAINT_PATTERNS: ReadonlyArray<readonly [RegExp, PaintZone]> = [
  [/^colou?r*\d*$/, 'body'],
  [/^2ndcolou?r*\d*$/, 'second'],
  [/^roofcolou?r*\d*$/, 'roof'],
];

/** `index` is the position from the bottom of the layer stack (0 = bottom-most). */
export function classifyLayer(name: string, index: number): LayerClass {
  const n = name.toLowerCase().replace(/\s+/g, '');
  // The Mammoth template calls its base layer "Layer 2".
  if (n === 'base' || (index === 0 && /^layer\d*$/.test(n))) return { role: 'base' };
  if (n === 'uv') return { role: 'uv' };
  if (/^wheels?\d*$/.test(n)) return { role: 'wheels' };
  for (const [pattern, zone] of PAINT_PATTERNS) {
    if (pattern.test(n)) return { role: 'paint', zone };
  }
  return { role: 'detail' };
}
