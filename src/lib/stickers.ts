/**
 * Ready-made stickers: race numbers (round or as a rally plate) and the sun strip
 * across the top of a windshield. A sticker is stored as its spec and rebuilt from
 * it whenever a property changes, so text, font and colours stay editable.
 */

export type StickerStyle = 'circle' | 'plate' | 'banner';

export interface StickerSpec {
  style: StickerStyle;
  text: string;
  fontFamily: string;
  background: string;
  color: string;
  outline: string;
  outlineWidth: number;
}

export const STICKER_STYLES: readonly { style: StickerStyle; label: string }[] = [
  { style: 'circle', label: 'Kreis' },
  { style: 'plate', label: 'Schild' },
  { style: 'banner', label: 'Banner' },
];

export const DEFAULT_STICKERS: Record<StickerStyle, StickerSpec> = {
  circle: { style: 'circle', text: '7', fontFamily: 'Archivo Black', background: '#f4f1e8', color: '#151515', outline: '#151515', outlineWidth: 12 },
  plate: { style: 'plate', text: '42', fontFamily: 'Archivo Black', background: '#f2b632', color: '#151515', outline: '#151515', outlineWidth: 10 },
  banner: { style: 'banner', text: 'OFFROAD CREW', fontFamily: 'Bebas Neue', background: '#14213d', color: '#f4f1e8', outline: '#f2b632', outlineWidth: 0 },
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Validates a sticker spec from untrusted data; falls back to the style's defaults. */
export function sanitizeSticker(value: unknown): StickerSpec | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const style = STICKER_STYLES.find((s) => s.style === v.style)?.style;
  if (!style) return undefined;
  const base = DEFAULT_STICKERS[style];
  const color = (c: unknown, fallback: string) => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : fallback);
  return {
    style,
    text: typeof v.text === 'string' ? v.text.slice(0, 40) : base.text,
    fontFamily: typeof v.fontFamily === 'string' && v.fontFamily.length < 60 ? v.fontFamily : base.fontFamily,
    background: color(v.background, base.background),
    color: color(v.color, base.color),
    outline: color(v.outline, base.outline),
    outlineWidth: typeof v.outlineWidth === 'number' && Number.isFinite(v.outlineWidth) ? Math.min(40, Math.max(0, v.outlineWidth)) : base.outlineWidth,
  };
}

/** A waving-free, classic eight by five checkered flag. */
export function checkeredFlagCanvas(): HTMLCanvasElement {
  const cols = 8;
  const rows = 5;
  const cell = 80;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#151515';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  return canvas;
}
