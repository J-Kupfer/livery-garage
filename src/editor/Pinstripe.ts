/**
 * A pinstripe layer: an open path through its points, with the outline drawn as a
 * wider stroke underneath the line.
 */
import { classRegistry, type PathProps } from 'fabric';
import { lineDashArray, linePath, type LinePoint, type LineSpec } from '../lib/lines.ts';
import { PointPath, pointControls } from './PointPath.ts';

export class Pinstripe extends PointPath {
  static type = 'Pinstripe';

  declare lineSpec: LineSpec;

  constructor(spec: LineSpec, options: Partial<PathProps> = {}) {
    super(linePath(spec.points, spec.smooth), options);
    this.lineSpec = spec;
    this.set({ fill: '', strokeLineCap: 'round' });
    this.applyStyle();
    this.controls = pointControls(spec.points.length);
  }

  /** Restores from serialized data; the path is always rebuilt from the spec. */
  static fromObject(object: Record<string, unknown>): Promise<Pinstripe> {
    return this._fromObject<Pinstripe>(object, { extraParam: 'lineSpec' });
  }

  get points(): LinePoint[] {
    return this.lineSpec.points;
  }

  setPoints(points: LinePoint[]): void {
    this.setSpec({ points });
  }

  /** Changes points or style. Points that do not move keep their place on the canvas. */
  setSpec(patch: Partial<LineSpec>): void {
    const before = this.lineSpec;
    this.lineSpec = { ...before, ...patch };
    const { points, smooth } = this.lineSpec;
    if (patch.points || smooth !== before.smooth) this.rebuild(linePath(points, smooth), points.length);
    this.applyStyle();
    this.set('dirty', true);
    this.setCoords();
  }

  private applyStyle(): void {
    const { color, width, outlineWidth } = this.lineSpec;
    // The stroke width covers the outline, so bounding box and cache include all of it.
    this.set({ stroke: color, strokeWidth: width + 2 * outlineWidth, strokeDashArray: lineDashArray(this.lineSpec) });
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
