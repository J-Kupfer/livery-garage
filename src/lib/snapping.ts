/**
 * Snapping while a layer is moved: its edges and centre lock onto the edges and centres
 * of other layers, onto the mirror image of other layers on the other side of the car,
 * and onto the car's centre line. The guides tell the editor which lines to show.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** `align`: lined up with another layer; `mirror`: mirrored to one; `axis`: the centre line. */
export type GuideKind = 'align' | 'mirror' | 'axis';

/** A line to show, in texture coordinates. */
export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: GuideKind;
}

export interface Snap {
  dx: number;
  dy: number;
  guides: Guide[];
}

export interface SnapOptions {
  /** Texture y of the car's centre line between its mirrored sides, if the template has one. */
  axis?: number;
  /** Largest distance that still snaps, in texture pixels. */
  tolerance: number;
  /** Texture width; the centre line is shown across all of it. */
  width: number;
}

interface Candidate {
  value: number;
  /** Only the centre of the moving box locks onto it (the centre line). */
  centreOnly?: boolean;
  /** The lines that show this match with the moving box in its snapped place. */
  guides: (moved: Box) => Guide[];
}

const right = (b: Box) => b.left + b.width;
const bottom = (b: Box) => b.top + b.height;
/** Left edge, centre and right edge. */
const xLines = (b: Box) => [b.left, b.left + b.width / 2, right(b)];
/** Top edge, middle and bottom edge. */
const yLines = (b: Box) => [b.top, b.top + b.height / 2, bottom(b)];
const vertical = (x: number, y1: number, y2: number, kind: GuideKind): Guide => ({ x1: x, y1, x2: x, y2, kind });
const horizontal = (y: number, x1: number, x2: number, kind: GuideKind): Guide => ({ x1, y1: y, x2, y2: y, kind });

/** The box of a layer's mirror image on the other side of the car. */
export function mirrorBox(box: Box, axis: number): Box {
  return { ...box, top: 2 * axis - bottom(box) };
}

/** The smallest shift within the tolerance that puts one of the lines onto a candidate, or 0. */
function closest(lines: number[], candidates: Candidate[], tolerance: number): number {
  let shift = 0;
  let distance = tolerance;
  for (const candidate of candidates) {
    lines.forEach((line, i) => {
      if (candidate.centreOnly && i !== 1) return;
      const d = candidate.value - line;
      if (Math.abs(d) <= distance) {
        distance = Math.abs(d);
        shift = d;
      }
    });
  }
  return shift;
}

/** Candidates that one of the lines sits on exactly. */
function matching(lines: number[], candidates: Candidate[]): Candidate[] {
  return candidates.filter((candidate) =>
    lines.some((line, i) => (!candidate.centreOnly || i === 1) && Math.abs(candidate.value - line) < 0.01),
  );
}

/** Where a moving box snaps to, and the guides that explain it. */
export function snapBox(box: Box, others: readonly Box[], { axis, tolerance, width }: SnapOptions): Snap {
  const xs: Candidate[] = [];
  const ys: Candidate[] = [];
  for (const other of others) {
    for (const value of xLines(other)) {
      xs.push({ value, guides: (m) => [vertical(value, Math.min(m.top, other.top), Math.max(bottom(m), bottom(other)), 'align')] });
    }
    for (const value of yLines(other)) {
      ys.push({ value, guides: (m) => [horizontal(value, Math.min(m.left, other.left), Math.max(right(m), right(other)), 'align')] });
    }
    if (axis === undefined) continue;
    // The mirror image keeps x: the box only has to match it in height.
    for (const value of yLines(mirrorBox(other, axis))) {
      ys.push({
        value,
        guides: (m) => {
          const x1 = Math.min(m.left, other.left);
          const x2 = Math.max(right(m), right(other));
          return [horizontal(value, x1, x2, 'mirror'), horizontal(2 * axis - value, x1, x2, 'mirror'), horizontal(axis, x1, x2, 'axis')];
        },
      });
    }
  }
  if (axis !== undefined) ys.push({ value: axis, centreOnly: true, guides: () => [horizontal(axis, 0, width, 'axis')] });

  const dx = closest(xLines(box), xs, tolerance);
  const dy = closest(yLines(box), ys, tolerance);
  const moved = { ...box, left: box.left + dx, top: box.top + dy };
  const guides = new Map<string, Guide>();
  for (const candidate of [...matching(xLines(moved), xs), ...matching(yLines(moved), ys)]) {
    for (const guide of candidate.guides(moved)) guides.set(`${guide.kind} ${guide.x1} ${guide.y1} ${guide.x2} ${guide.y2}`, guide);
  }
  return { dx, dy, guides: [...guides.values()] };
}
