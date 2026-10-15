import { describe, expect, it } from 'vitest';
import { DEFAULT_STICKERS, sanitizeSticker } from '../src/lib/stickers.ts';

describe('sanitizeSticker', () => {
  it('keeps a valid sticker', () => {
    expect(sanitizeSticker(DEFAULT_STICKERS.plate)).toEqual(DEFAULT_STICKERS.plate);
  });

  it('falls back to the style defaults for broken fields', () => {
    const spec = sanitizeSticker({ style: 'circle', text: 12, background: 'url(x)', outlineWidth: 999 })!;
    expect(spec.text).toBe(DEFAULT_STICKERS.circle.text);
    expect(spec.background).toBe(DEFAULT_STICKERS.circle.background);
    expect(spec.outlineWidth).toBe(40);
  });

  it('rejects unknown styles', () => {
    expect(sanitizeSticker({ style: 'hexagon' })).toBeUndefined();
    expect(sanitizeSticker('plate')).toBeUndefined();
  });

  it('caps the text length', () => {
    expect(sanitizeSticker({ style: 'banner', text: 'X'.repeat(500) })!.text).toHaveLength(40);
  });
});
