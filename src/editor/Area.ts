/**
 * A free area layer: a closed shape through its points, filled and outlined like the
 * other shapes, so colour, gradient, pattern and outline work the same way.
 */
import { classRegistry, type PathProps } from 'fabric';
import { areaFromPath, linePath, type AreaSpec, type LinePoint } from '../lib/lines.ts';
import { PointPath, pointControls } from './PointPath.ts';

export class Area extends PointPath {
  static type = 'Area';

  declare areaSpec: AreaSpec;

  constructor(spec: AreaSpec, options: Partial<PathProps> = {}) {
    super(linePath(spec.points, spec.smooth, true), { strokeUniform: true, ...options });
    this.areaSpec = spec;
    this.controls = pointControls(spec.points.length);
  }

  /** Restores from serialized data; the path is always rebuilt from the spec. */
  static fromObject(object: Record<string, unknown>): Promise<Area> {
    // The first release did not store the points; such areas come back from their path.
    const areaSpec = object.areaSpec ?? areaFromPath(object.path);
    return this._fromObject<Area>({ ...object, areaSpec }, { extraParam: 'areaSpec' });
  }

  get points(): LinePoint[] {
    return this.areaSpec.points;
  }

  setPoints(points: LinePoint[]): void {
    this.setSpec({ points });
  }

  /** Changes points or curve. Points that do not move keep their place on the canvas. */
  setSpec(patch: Partial<AreaSpec>): void {
    const before = this.areaSpec;
    this.areaSpec = { ...before, ...patch };
    const { points, smooth } = this.areaSpec;
    if (patch.points || smooth !== before.smooth) this.rebuild(linePath(points, smooth, true), points.length);
  }
}

classRegistry.setClass(Area);
