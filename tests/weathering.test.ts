import { describe, expect, it } from 'vitest';
import { rustPixels, sanitizeWeathering } from '../src/lib/weathering.ts';

const coverage = (pixels: Uint8ClampedArray) => {
  let rusty = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 128) rusty++;
  return rusty / (pixels.length / 4);
};

describe('rustPixels', () => {
  it('paints nothing without rust', () => {
    expect(coverage(rustPixels({ rust: 0, seed: 1 }, 128, 128))).toBe(0);
  });

  it('is reproducible and grows with the amount', () => {
    const light = rustPixels({ rust: 0.3, seed: 4 }, 256, 256);
    expect(rustPixels({ rust: 0.3, seed: 4 }, 256, 256)).toEqual(light);
    const heavy = coverage(rustPixels({ rust: 1, seed: 4 }, 256, 256));
    expect(heavy).toBeGreaterThan(coverage(light));
    expect(heavy).toBeGreaterThan(0.3);
    expect(heavy).toBeLessThan(0.8);
  });

  it('uses rust colours: red channel above green above blue', () => {
    const pixels = rustPixels({ rust: 0.8, seed: 9 }, 128, 128);
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 200) continue;
      expect(pixels[i]).toBeGreaterThan(pixels[i + 1]);
      expect(pixels[i + 1]).toBeGreaterThan(pixels[i + 2]);
    }
  });
});

describe('sanitizeWeathering', () => {
  it('clamps amounts and keeps valid seeds', () => {
    expect(sanitizeWeathering({ rust: 1.7, scratches: -1, seed: 42 })).toEqual({ rust: 1, scratches: 0, seed: 42 });
    expect(sanitizeWeathering({ rust: 'lots' })).toEqual({ rust: 0, scratches: 0, seed: 1 });
    expect(sanitizeWeathering(null)).toBeUndefined();
  });
});
