import { describe, expect, it } from 'vitest';
import { defaultGradient, fillColor, gradientCoords, gradientEnd, sanitizeFill } from '../src/lib/fills.ts';

describe('gradientCoords', () => {
  it('runs through the centre of the box and reaches its edges or corners', () => {
    expect(gradientCoords(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    const down = gradientCoords(90);
    expect(down.x1).toBeCloseTo(0.5);
    expect(down.y1).toBeCloseTo(0);
    expect(down.y2).toBeCloseTo(1);
    const diagonal = gradientCoords(45);
    expect(diagonal.x1).toBeCloseTo(0);
    expect(diagonal.y1).toBeCloseTo(0);
    expect(diagonal.x2).toBeCloseTo(1);
    expect(diagonal.y2).toBeCloseTo(1);
  });
});

describe('gradientEnd', () => {
  it('fades to the start colour made transparent, so the fade does not turn grey', () => {
    expect(gradientEnd({ kind: 'gradient', from: '#d42a12', to: '#151515', angle: 0, fade: true })).toBe('rgba(212,42,18,0)');
    expect(gradientEnd({ kind: 'gradient', from: '#d42a12', to: '#151515', angle: 0, fade: false })).toBe('#151515');
  });
});

describe('fillColor', () => {
  it('stands in with the start or base colour', () => {
    expect(fillColor(defaultGradient('#123456'))).toBe('#123456');
    expect(fillColor({ kind: 'pattern', pattern: { kind: 'zebra', colors: ['#f1eee6', '#161616', '#6b6b6b', '#b9b4a8'], scale: 1, seed: 3 } })).toBe('#f1eee6');
  });
});

describe('sanitizeFill', () => {
  it('keeps valid fills', () => {
    const gradient = { kind: 'gradient', from: '#ffffff', to: '#000000', angle: 90, fade: true };
    expect(sanitizeFill(gradient)).toEqual(gradient);
    const pattern = { kind: 'pattern', pattern: { kind: 'tiger', colors: ['#112233', '#445566', '#778899', '#aabbcc'], scale: 1, seed: 4 } };
    expect(sanitizeFill(pattern)).toEqual(pattern);
  });

  it('repairs what it can and rejects the rest', () => {
    expect(sanitizeFill({ kind: 'gradient', from: '#ABCDEF', to: 'red', angle: -90 })).toEqual({
      kind: 'gradient',
      from: '#abcdef',
      to: '#151515',
      angle: 270,
      fade: false,
    });
    expect(sanitizeFill({ kind: 'gradient', from: 'url(x)' })).toBeUndefined();
    expect(sanitizeFill({ kind: 'pattern', pattern: { kind: 'paisley' } })).toBeUndefined();
    expect(sanitizeFill(null)).toBeUndefined();
  });

  it('does not take Fabric objects for fills', () => {
    // Fabric turns serialized objects with a known `type` into its own classes.
    expect(sanitizeFill({ type: 'gradient', from: '#ffffff', to: '#000000' })).toBeUndefined();
  });
});
