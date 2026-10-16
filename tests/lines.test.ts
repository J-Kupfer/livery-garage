import { describe, expect, it } from 'vitest';
import { DEFAULT_LINE_STYLE, MAX_LINE_POINTS, lineDashArray, linePath, sanitizeArea, sanitizeLine, type LinePoint } from '../src/lib/lines.ts';

const points: LinePoint[] = [
  [0, 0],
  [100, 40],
  [180, 10],
  [400, 200],
];

/** End point of every segment, in order. */
const ends = (path: ReturnType<typeof linePath>) => path.map((c) => c.slice(-2));

function bezier(p0: number[], c1: number[], c2: number[], p3: number[], t: number): number[] {
  const s = 1 - t;
  return [0, 1].map((i) => s * s * s * p0[i] + 3 * s * s * t * c1[i] + 3 * s * t * t * c2[i] + t * t * t * p3[i]);
}

describe('linePath', () => {
  it('passes through every point', () => {
    expect(ends(linePath(points, true))).toEqual(points);
    expect(ends(linePath(points, false))).toEqual(points);
  });

  it('draws straight segments when not smooth', () => {
    expect(linePath(points, false).map((c) => c[0])).toEqual(['M', 'L', 'L', 'L']);
  });

  it('draws curves when smooth, and a straight line between just two points', () => {
    expect(linePath(points, true).map((c) => c[0])).toEqual(['M', 'C', 'C', 'C']);
    expect(linePath(points.slice(0, 2), true)).toEqual([
      ['M', 0, 0],
      ['L', 100, 40],
    ]);
  });

  it('does not loop beyond its ends when the points are unevenly spaced', () => {
    // A long segment next to a very short one makes the uniform Catmull-Rom spline swing far out.
    const uneven: LinePoint[] = [
      [0, 0],
      [4, 0],
      [400, 0.5],
      [404, 0],
    ];
    const path = linePath(uneven, true);
    let from = uneven[0] as number[];
    for (const command of path.slice(1)) {
      const [, c1x, c1y, c2x, c2y, x, y] = command as number[];
      for (let t = 0; t <= 1; t += 0.05) {
        const [px] = bezier(from, [c1x, c1y], [c2x, c2y], [x, y], t);
        expect(px).toBeGreaterThanOrEqual(-0.01);
        expect(px).toBeLessThanOrEqual(404.01);
      }
      from = [x, y];
    }
  });

  it('closes areas back to the first point', () => {
    const smooth = linePath(points, true, true);
    // One curve per side, the last one back to the start.
    expect(smooth.map((c) => c[0])).toEqual(['M', 'C', 'C', 'C', 'C', 'Z']);
    expect(smooth.at(-2)!.slice(-2)).toEqual(points[0]);
    expect(linePath(points, false, true).map((c) => c[0])).toEqual(['M', 'L', 'L', 'L', 'Z']);
  });

  it('curves a closed area smoothly through its first point', () => {
    // In a closed curve the tangent at the first point uses the last point as well:
    // the closing curve arrives along the line on which the first curve leaves.
    const square: LinePoint[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const path = linePath(square, true, true) as number[][];
    const [, , , c2x, c2y] = path[4] as unknown as [string, number, number, number, number, number, number];
    const [, c1x, c1y] = path[1] as unknown as [string, number, number];
    expect(Math.atan2(0 - c2y, 0 - c2x)).toBeCloseTo(Math.atan2(c1y - 0, c1x - 0));
  });

  it('copes with points on the same spot', () => {
    const path = linePath(
      [
        [10, 10],
        [10, 10],
        [50, 20],
      ],
      true,
    );
    expect(path.flat().every((v) => typeof v === 'string' || Number.isFinite(v))).toBe(true);
  });
});

describe('lineDashArray', () => {
  it('scales with the line width', () => {
    expect(lineDashArray({ pattern: 'solid', width: 10 })).toBeNull();
    expect(lineDashArray({ pattern: 'dashed', width: 10 })).toEqual([25, 30]);
    // Zero-length dashes with round caps are dots one width across.
    expect(lineDashArray({ pattern: 'dotted', width: 10 })).toEqual([0, 20]);
  });
});

describe('sanitizeArea', () => {
  it('needs three points and keeps the curve setting', () => {
    expect(sanitizeArea({ points: points.slice(0, 3), smooth: true })).toEqual({ points: points.slice(0, 3), smooth: true });
    expect(sanitizeArea({ points: points.slice(0, 3), smooth: 'yes' })!.smooth).toBe(false);
    expect(sanitizeArea({ points: points.slice(0, 2) })).toBeUndefined();
    expect(sanitizeArea('area')).toBeUndefined();
  });
});

describe('sanitizeLine', () => {
  it('keeps a valid line', () => {
    const spec = { ...DEFAULT_LINE_STYLE, pattern: 'dashed', outlineWidth: 3, points };
    expect(sanitizeLine(spec)).toEqual(spec);
  });

  it('needs at least two points', () => {
    expect(sanitizeLine({ points: [[1, 2]] })).toBeUndefined();
    expect(sanitizeLine({ points: 'nope' })).toBeUndefined();
    expect(sanitizeLine(null)).toBeUndefined();
  });

  it('drops broken points and caps their number', () => {
    const spec = sanitizeLine({ points: [[0, 0], [1], ['a', 2], [NaN, 3], [1e9, 0], [5, 5]] })!;
    expect(spec.points).toEqual([
      [0, 0],
      [5, 5],
    ]);
    const many = Array.from({ length: 500 }, (_, i): LinePoint => [i, i]);
    expect(sanitizeLine({ points: many })!.points).toHaveLength(MAX_LINE_POINTS);
  });

  it('repairs the style from untrusted files', () => {
    const spec = sanitizeLine({ points, color: 'url(x)', width: 999, outline: '#ABCDEF', outlineWidth: -4, pattern: 'wavy', smooth: 'yes' })!;
    expect(spec).toEqual({
      ...DEFAULT_LINE_STYLE,
      width: 80,
      outline: '#abcdef',
      outlineWidth: 0,
      points,
    });
  });
});
