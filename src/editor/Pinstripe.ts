/**
 * A pinstripe layer: a Fabric path rebuilt from its line spec, with the outline drawn
 * as a wider stroke underneath the line, and one drag handle per point instead of the
 * usual scale and rotate handles.
 */
import { Control, Path, Point, classRegistry, util, type PathProps } from 'fabric';
import { lineDashArray, linePath, type LinePoint, type LineSpec } from '../lib/lines.ts';

export class Pinstripe extends Path {
  static type = 'Pinstripe';

  declare lineSpec: LineSpec;

  constructor(spec: LineSpec, options: Partial<PathProps> = {}) {
    super(linePath(spec.points, spec.smooth), options);
    this.lineSpec = spec;
    this.set({
      fill: '',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      // Only the line itself is a click target, not the empty space inside its bounding box.
      perPixelTargetFind: true,
      hasBorders: false,
    });
    this.applyStyle();
    this.controls = pointControls(spec.points.length);
  }

  /** Restores from serialized data; the path is always rebuilt from the spec. */
  static fromObject(object: Record<string, unknown>): Promise<Pinstripe> {
    return this._fromObject<Pinstripe>(object, { extraParam: 'lineSpec' });
  }

  /** Changes points or style. Points that do not move keep their place on the canvas. */
  setSpec(patch: Partial<LineSpec>): void {
    const before = this.lineSpec;
    this.lineSpec = { ...before, ...patch };
    if (patch.points || this.lineSpec.smooth !== before.smooth) this.rebuildPath();
    if (this.lineSpec.points.length !== before.points.length) this.controls = pointControls(this.lineSpec.points.length);
    this.applyStyle();
    this.set('dirty', true);
    this.setCoords();
  }

  /** Where a point currently is on the canvas. */
  canvasPoint(index: number): Point {
    const [x, y] = this.lineSpec.points[index];
    return new Point(x, y).subtract(this.pathOffset).transform(this.calcTransformMatrix());
  }

  /** Moves one point to a canvas position. */
  movePoint(index: number, to: Point): void {
    const local = util.sendPointToPlane(to, undefined, this.calcOwnMatrix()).add(this.pathOffset);
    this.setSpec({ points: this.lineSpec.points.map((p, i): LinePoint => (i === index ? [local.x, local.y] : p)) });
  }

  private applyStyle(): void {
    const { color, width, outlineWidth } = this.lineSpec;
    // The stroke width covers the outline, so bounding box and cache include all of it.
    this.set({ stroke: color, strokeWidth: width + 2 * outlineWidth, strokeDashArray: lineDashArray(this.lineSpec) });
  }

  private rebuildPath(): void {
    // The old path centre must stay where it is; everything else follows from it.
    const anchor = new Point(this.pathOffset);
    const center = this.getRelativeCenterPoint();
    this._setPath(linePath(this.lineSpec.points, this.lineSpec.smooth), false);
    const moved = anchor.subtract(this.pathOffset).transform(this.calcOwnMatrix());
    this.setPositionByOrigin(center.scalarMultiply(2).subtract(moved), 'center', 'center');
  }

  _renderStroke(ctx: CanvasRenderingContext2D): void {
    const { color, width, outline, outlineWidth } = this.lineSpec;
    const passes: [string, number][] = outlineWidth > 0 ? [[outline, width + 2 * outlineWidth], [color, width]] : [[color, width]];
    for (const [stroke, strokeWidth] of passes) {
      ctx.save();
      this._setLineDash(ctx, this.strokeDashArray);
      this._setStrokeStyles(ctx, {
        stroke,
        strokeWidth,
        strokeLineCap: this.strokeLineCap,
        strokeDashOffset: this.strokeDashOffset,
        strokeLineJoin: this.strokeLineJoin,
        strokeMiterLimit: this.strokeMiterLimit,
      });
      ctx.stroke();
      ctx.restore();
    }
  }
}

classRegistry.setClass(Pinstripe);

function pointControls(count: number): Record<string, Control> {
  const controls: Record<string, Control> = {};
  for (let i = 0; i < count; i++) {
    controls[`p${i}`] = new Control({
      actionName: 'modifyLine',
      cursorStyle: 'move',
      positionHandler: (_dim, _matrix, object) => (object as Pinstripe).canvasPoint(i).transform(object.getViewportTransform()),
      actionHandler: (_e, transform, x, y) => {
        (transform.target as Pinstripe).movePoint(i, new Point(x, y));
        return true;
      },
    });
  }
  return controls;
}
