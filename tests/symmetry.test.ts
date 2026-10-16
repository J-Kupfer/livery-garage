import { describe, expect, it } from 'vitest';
import { findMirrorAxis, mirrorScore, otherSide, type MaskSampler } from '../src/lib/symmetry.ts';

const TEXTURE = 2048;

/** Samples a shape given in texture coordinates at pixel centres. */
function sampler(inside: (x: number, y: number) => boolean): MaskSampler {
  return (size) => {
    const mask = new Uint8Array(size * size);
    const step = TEXTURE / size;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) mask[j * size + i] = inside((i + 0.5) * step, (j + 0.5) * step) ? 1 : 0;
    }
    return mask;
  };
}

/** A car side, upright: a body with a cut-out wheel arch, not symmetric in itself. */
function side(x: number, y: number, top: number): boolean {
  const body = x > 300 && x < 1500 && y > top && y < top + 420;
  const arch = Math.hypot(x - 600, y - (top + 420)) < 150;
  const bonnet = x > 1500 && x < 1700 && y > top + 150 && y < top + 420;
  return (body && !arch) || bonnet;
}

/** The template layout: one side upside down above the roof, the other upright below it. */
function template(axis: number) {
  return sampler((x, y) => {
    const roof = x > 500 && x < 1300 && Math.abs(y - axis) < 180;
    return roof || side(x, y, axis + 220) || side(x, 2 * axis - y, axis + 220);
  });
}

describe('findMirrorAxis', () => {
  it.each([700, 858, 951])('finds the axis between the two sides (%i)', (axis) => {
    const found = findMirrorAxis(template(axis), TEXTURE)!;
    expect(Math.abs(found.y - axis)).toBeLessThanOrEqual(2);
    expect(found.score).toBeGreaterThan(0.95);
  });

  it('gives up on paint that is not mirrored', () => {
    // Every row of a slanted band sits further right: mirrored rows hardly meet.
    const band = sampler((x, y) => y > 400 && y < 1600 && x > y - 200 && x < y);
    expect(findMirrorAxis(band, TEXTURE)).toBeUndefined();
    expect(findMirrorAxis(sampler(() => false), TEXTURE)).toBeUndefined();
  });
});

describe('mirrorScore', () => {
  it('is 1 for the right axis and lower for others', () => {
    // Rows 2 to 5 of an 8 row mask, symmetric about the edge between rows 3 and 4.
    const mask = new Uint8Array(64);
    for (let y = 2; y <= 5; y++) mask.fill(1, y * 8, y * 8 + 8);
    expect(mirrorScore(mask, 8, 7)).toBe(1);
    expect(mirrorScore(mask, 8, 6)).toBe(0.75);
    expect(mirrorScore(mask, 8, 1)).toBe(0);
  });
});

describe('otherSide', () => {
  const placement = { x: 1010, y: 1440, angle: -8, flipY: false };

  it('puts the copy at the mirrored spot', () => {
    for (const readable of [true, false]) {
      const copy = otherSide(placement, 858, readable);
      expect(copy.x).toBe(1010);
      expect(copy.y).toBe(276);
    }
  });

  it('turns readable layers by 180 degrees instead of mirroring them', () => {
    expect(otherSide(placement, 858, true)).toMatchObject({ angle: -172, flipY: false });
    expect(otherSide({ ...placement, angle: 0 }, 858, true).angle).toBe(-180);
  });

  it('mirrors everything else', () => {
    expect(otherSide(placement, 858, false)).toMatchObject({ angle: 8, flipY: true });
  });

  it('brings a copy of the copy back to the original', () => {
    for (const readable of [true, false]) {
      const back = otherSide(otherSide(placement, 858, readable), 858, readable);
      expect(back).toEqual(placement);
    }
  });
});
