import { describe, expect, it } from 'vitest';
import { mirrorBox, snapBox, type Box } from '../src/lib/snapping.ts';

const options = { tolerance: 10, width: 2048 };
const box = (left: number, top: number, width = 100, height = 50): Box => ({ left, top, width, height });

describe('snapBox', () => {
  it('lines an edge up with another layer within the tolerance', () => {
    const snap = snapBox(box(206, 400), [box(200, 100)], options);
    expect(snap.dx).toBe(-6);
    expect(snap.dy).toBe(0);
    // The left edges, centres and right edges now all line up; each gets a line across both boxes.
    expect(snap.guides).toContainEqual({ x1: 200, y1: 100, x2: 200, y2: 450, kind: 'align' });
    expect(snap.guides.filter((g) => g.kind === 'align')).toHaveLength(3);
  });

  it('leaves the layer alone beyond the tolerance', () => {
    expect(snapBox(box(215, 400), [box(200, 100)], options)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('takes the closest candidate', () => {
    // The right edge (300 + 4) is closer to 302 than the left edge (204) is to 200.
    const snap = snapBox(box(204, 400), [box(200, 100), box(302, 700, 20, 20)], options);
    expect(snap.dx).toBe(-2);
  });

  it('snaps to the mirror image of a layer on the other side of the car', () => {
    const lower = box(900, 1400, 120, 80);
    const mirrored = mirrorBox(lower, 858);
    expect(mirrored).toEqual(box(900, 236, 120, 80));
    const snap = snapBox(box(900, 241, 120, 80), [lower], { ...options, axis: 858 });
    expect(snap.dy).toBe(-5);
    const mirror = snap.guides.filter((g) => g.kind === 'mirror').map((g) => g.y1);
    // Top, middle and bottom match: each shows up on both sides.
    expect(mirror.sort((a, b) => a - b)).toEqual([236, 276, 316, 1400, 1440, 1480]);
    expect(snap.guides).toContainEqual({ x1: 900, y1: 858, x2: 1020, y2: 858, kind: 'axis' });
  });

  it('snaps only the centre to the centre line and shows it across the texture', () => {
    const centred = snapBox(box(500, 830, 100, 50), [], { ...options, axis: 858 });
    expect(centred.dy).toBe(3);
    expect(centred.guides).toEqual([{ x1: 0, y1: 858, x2: 2048, y2: 858, kind: 'axis' }]);
    // The top edge right next to the centre line does not snap to it.
    expect(snapBox(box(500, 855, 100, 50), [], { ...options, axis: 858 }).dy).toBe(0);
  });

  it('has no mirror candidates without an axis', () => {
    const snap = snapBox(box(900, 241, 120, 80), [box(900, 1400, 120, 80)], options);
    expect(snap.dy).toBe(0);
    expect(snap.guides.some((g) => g.kind !== 'align')).toBe(false);
  });

  it('shows each line once', () => {
    const snap = snapBox(box(206, 400), [box(200, 100), box(200, 100)], options);
    expect(snap.guides).toHaveLength(3);
  });
});
