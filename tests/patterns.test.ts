import { describe, expect, it } from 'vitest';
import { PATTERN_KINDS, PATTERN_PALETTES, patternIndices, sanitizePattern, withKind } from '../src/lib/patterns.ts';

const palette = (name: string) => [...PATTERN_PALETTES.find((p) => p.name === name)!.colors];

describe('patternIndices', () => {
  it.each(PATTERN_KINDS.map((k) => k.kind))('paints a reproducible %s pattern', (kind) => {
    const a = patternIndices({ kind, scale: 1, seed: 42 }, 256, 256, 2);
    const b = patternIndices({ kind, scale: 1, seed: 42 }, 256, 256, 2);
    const c = patternIndices({ kind, scale: 1, seed: 43 }, 256, 256, 2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it.each(PATTERN_KINDS.map((k) => [k.kind, k.colors] as const))('uses all %s colours (%i), none of them dominating', (kind, colors) => {
    const indices = patternIndices({ kind, scale: 1, seed: 7 }, 512, 512, 2);
    const share = [0, 0, 0, 0];
    for (const i of indices) share[i] += 1 / indices.length;
    for (const s of share.slice(0, colors)) expect(s).toBeGreaterThan(0.03);
    for (const s of share.slice(colors)) expect(s).toBe(0);
    expect(Math.max(...share)).toBeLessThan(0.7);
  });

  it('paints digital camouflage in square blocks', () => {
    const size = 120;
    const indices = patternIndices({ kind: 'digital', scale: 1, seed: 3 }, size, size);
    // At scale 1 a block is 12 texture pixels wide.
    for (let by = 0; by < size; by += 12) {
      for (let bx = 0; bx < size; bx += 12) {
        const first = indices[by * size + bx];
        for (let y = by; y < by + 12; y++) for (let x = bx; x < bx + 12; x++) expect(indices[y * size + x]).toBe(first);
      }
    }
  });
});

describe('withKind', () => {
  const woodland = { kind: 'woodland' as const, colors: palette('Woodland'), scale: 1, seed: 5 };

  it('brings the matching palette for zebra, leopard and Flecktarn', () => {
    expect(withKind(woodland, 'zebra').colors).toEqual(palette('Schwarz-Weiß'));
    expect(withKind(woodland, 'leopard').colors).toEqual(palette('Savanne'));
    expect(withKind(woodland, 'flecktarn').colors).toEqual(palette('Flecktarn'));
  });

  it('returns to a camouflage palette when leaving an animal pattern', () => {
    expect(withKind(withKind(woodland, 'zebra'), 'tiger').colors).toEqual(palette('Woodland'));
  });

  it('keeps colours the user picked by hand', () => {
    const custom = { ...woodland, colors: ['#123456', '#654321', '#abcdef', '#fedcba'] };
    expect(withKind(custom, 'zebra')).toEqual({ ...custom, kind: 'zebra' });
  });

  it('keeps preset colours when switching between camouflage kinds', () => {
    const desert = { ...woodland, colors: palette('Wüste') };
    expect(withKind(desert, 'digital').colors).toEqual(palette('Wüste'));
  });
});

describe('sanitizePattern', () => {
  it('keeps a valid pattern', () => {
    const spec = { kind: 'tiger', colors: ['#112233', '#445566', '#778899', '#aabbcc'], scale: 1.5, seed: 99 };
    expect(sanitizePattern(spec)).toEqual(spec);
  });

  it('rejects unknown kinds and non-objects', () => {
    expect(sanitizePattern({ kind: 'flowers', colors: [], scale: 1, seed: 1 })).toBeUndefined();
    expect(sanitizePattern('woodland')).toBeUndefined();
    expect(sanitizePattern(null)).toBeUndefined();
  });

  it('repairs out-of-range values from untrusted files', () => {
    const spec = sanitizePattern({ kind: 'woodland', colors: ['#ABCDEF', 'red', 42], scale: 99, seed: -12.7 })!;
    expect(spec.colors).toHaveLength(4);
    expect(spec.colors[0]).toBe('#abcdef');
    expect(spec.colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(spec.scale).toBe(2);
    expect(spec.seed).toBe(12);
    expect(sanitizePattern({ kind: 'woodland', seed: 0 })!.seed).toBe(1);
    expect(sanitizePattern({ kind: 'woodland', seed: 2 ** 40 })!.seed).toBeLessThanOrEqual(2147483646);
  });
});
