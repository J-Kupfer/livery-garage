import { describe, expect, it } from 'vitest';
import { FLAME_HEIGHT, FLAME_WIDTH, flamePath } from '../src/lib/flames.ts';

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('flamePath', () => {
  it('is reproducible from its seed', () => {
    expect(flamePath(5)).toBe(flamePath(5));
    expect(flamePath(5)).not.toBe(flamePath(6));
  });

  it.each([1, 2, 3, 1234567, 2147483646])('builds closed outlines within the flame box (seed %i)', (seed) => {
    const d = flamePath(seed);
    expect(d.startsWith('M ')).toBe(true);
    // Base plus six to eight licks, each its own closed shape.
    const shapes = d.match(/Z/g)?.length ?? 0;
    expect(shapes).toBeGreaterThanOrEqual(7);
    expect(shapes).toBeLessThanOrEqual(9);
    const values = numbers(d);
    expect(values.every(Number.isFinite)).toBe(true);
    const xs = values.filter((_, i) => i % 2 === 0);
    const ys = values.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(-20);
    expect(Math.max(...xs)).toBeLessThan(FLAME_WIDTH + 20);
    expect(Math.min(...ys)).toBeGreaterThan(-FLAME_HEIGHT * 0.5);
    expect(Math.max(...ys)).toBeLessThan(FLAME_HEIGHT * 1.5);
  });
});
