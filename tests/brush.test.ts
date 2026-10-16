import { describe, expect, it } from 'vitest';
import { pullTip, stringLength, strokePath } from '../src/lib/brush.ts';

describe('pullTip', () => {
  it('follows the pointer exactly without a string', () => {
    expect(pullTip({ x: 0, y: 0 }, { x: 30, y: 40 }, 0)).toEqual({ x: 30, y: 40 });
  });

  it('rests while the pointer stays within reach', () => {
    const tip = { x: 10, y: 10 };
    expect(pullTip(tip, { x: 15, y: 13 }, 8)).toBe(tip);
  });

  it('is pulled along and trails the pointer by the string length', () => {
    const tip = pullTip({ x: 0, y: 0 }, { x: 30, y: 40 }, 10);
    expect(tip.x).toBeCloseTo(24);
    expect(tip.y).toBeCloseTo(32);
    expect(Math.hypot(30 - tip.x, 40 - tip.y)).toBeCloseTo(10);
  });

  it('smooths out a zigzag hand', () => {
    let tip = { x: 0, y: 0 };
    let largest = 0;
    for (let i = 1; i <= 60; i++) {
      const next = pullTip(tip, { x: i * 4, y: i % 2 ? 6 : -6 }, stringLength(0.5));
      largest = Math.max(largest, Math.abs(next.y - tip.y));
      tip = next;
    }
    // The pointer jumps 12 pixels up and down every step; the tip barely moves vertically.
    expect(largest).toBeLessThan(2);
  });
});

describe('stringLength', () => {
  it('grows with smoothing and stays within range', () => {
    expect(stringLength(0)).toBe(0);
    expect(stringLength(0.5)).toBeLessThan(stringLength(1));
    expect(stringLength(5)).toBe(stringLength(1));
    expect(stringLength(-1)).toBe(0);
  });
});

describe('strokePath', () => {
  it('turns a single point into a dot', () => {
    expect(strokePath([{ x: 5, y: 5 }])).toEqual([
      ['M', 5, 5],
      ['L', 5.01, 5],
    ]);
  });

  it('runs from the first to the last point through the midpoints', () => {
    const path = strokePath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ]);
    expect(path).toEqual([
      ['M', 0, 0],
      ['Q', 10, 0, 15, 5],
      ['Q', 20, 10, 25, 10],
      ['L', 30, 10],
    ]);
  });

  it('is empty without points', () => {
    expect(strokePath([])).toEqual([]);
  });
});
