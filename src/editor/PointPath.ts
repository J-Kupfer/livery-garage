/**
 * Base of the layers drawn by clicking points (pinstripes and free areas): a Fabric
 * path rebuilt from its points, with one drag handle per point instead of the usual
 * scale and rotate handles.
 */
import { Control, Path, Point, util, type PathProps } from 'fabric';
import type { LinePoint, PathCommand } from '../lib/lines.ts';

export abstract class PointPath extends Path {
  constructor(path: PathCommand[], options: Partial<PathProps> = {}) {
    super(path, options);
    this.set({
      strokeLineJoin: 'round',
      // Only the shape itself is a click target, not the empty space around it.
      perPixelTargetFind: true,
      hasBorders: false,
    });
  }

  /** The points in path coordinates. */
  abstract get points(): LinePoint[];

  /** Replaces the points; implementations rebuild the path with `rebuild`. */
  abstract setPoints(points: LinePoint[]): void;

  /** Where a point currently is on the canvas. */
  canvasPoint(index: number): Point {
    const [x, y] = this.points[index];
    return new Point(x, y).subtract(this.pathOffset).transform(this.calcTransformMatrix());
  }

  /** Moves one point to a canvas position. */
  movePoint(index: number, to: Point): void {
    const local = util.sendPointToPlane(to, undefined, this.calcOwnMatrix()).add(this.pathOffset);
    this.setPoints(this.points.map((p, i): LinePoint => (i === index ? [local.x, local.y] : p)));
  }

  /** Swaps in a new path; the points that did not move keep their place on the canvas. */
  protected rebuild(path: PathCommand[], pointCount: number): void {
    // The old path centre must stay where it is; everything else follows from it.
    const anchor = new Point(this.pathOffset);
    const center = this.getRelativeCenterPoint();
    this._setPath(path, false);
    const moved = anchor.subtract(this.pathOffset).transform(this.calcOwnMatrix());
    this.setPositionByOrigin(center.scalarMultiply(2).subtract(moved), 'center', 'center');
    if (Object.keys(this.controls).length !== pointCount) this.controls = pointControls(pointCount);
    this.set('dirty', true);
    this.setCoords();
  }
}

export function pointControls(count: number): Record<string, Control> {
  const controls: Record<string, Control> = {};
  for (let i = 0; i < count; i++) {
    controls[`p${i}`] = new Control({
      actionName: 'modifyPoints',
      cursorStyle: 'move',
      positionHandler: (_dim, _matrix, object) => (object as PointPath).canvasPoint(i).transform(object.getViewportTransform()),
      actionHandler: (_e, transform, x, y) => {
        (transform.target as PointPath).movePoint(i, new Point(x, y));
        return true;
      },
    });
  }
  return controls;
}
