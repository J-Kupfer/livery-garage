/**
 * Renders a car template into the planes the editor stacks around the user's
 * layers, following the PSD's own layer order:
 *
 *   background  every selected layer up to the top-most paint layer (with the chosen paint)
 *   (user layers on the paint, clipped to paintMask)
 *   weathering  rust and scratches, clipped to the visible paint
 *   overlay     the remaining layers: windows, lights, trim drawn above the paint
 *   (user layers on the windows, clipped to windowsMask)
 *   guide       the UV wireframe, only while editing
 *
 * Paint layers in the templates are flat colours (verified for all 21 cars), so a
 * custom colour is the layer's alpha filled with that colour, and a pattern or a
 * gradient is the layer's alpha filled with the pattern or gradient.
 */
import { patternCanvas, type PatternSpec } from './patterns.ts';
import { findMirrorAxis } from './symmetry.ts';
import { hasWeathering, paintWeathering, type Weathering } from './weathering.ts';
import type { PaintZone } from './templateLayers.ts';
import { TEXTURE_SIZE, type CarTemplate, type TemplateLayer } from './templateTypes.ts';

export const ZONE_ORDER: readonly PaintZone[] = ['body', 'second', 'roof'];

/**
 * A two-colour gradient over the car: `length` runs from one end of the car to the
 * other, `height` from the sills (`from`) up to the middle of the roof (`to`), on both
 * mirrored sides at once.
 */
export interface ZoneGradient {
  from: string;
  to: string;
  direction: 'length' | 'height';
}

export interface ZoneLook {
  /** Index into the zone's variants: decides the shape and, without `color`, `pattern` or `gradient`, the colour. */
  variant: number;
  /** Custom #rrggbb colour painted into the variant's shape. */
  color?: string;
  /** Pattern painted into the variant's shape; wins over `gradient` and `color`. */
  pattern?: PatternSpec;
  /** Gradient painted into the variant's shape; wins over `color`. */
  gradient?: ZoneGradient;
}

type Paint = { color?: string; pattern?: PatternSpec; gradient?: ZoneGradient };

export interface Look {
  zones: Partial<Record<PaintZone, ZoneLook>>;
  wheels: number;
  weathering?: Weathering;
}

export interface CarParts {
  zones: { zone: PaintZone; variants: TemplateLayer[] }[];
  wheels: TemplateLayer[];
  uv?: TemplateLayer;
}

export function carParts(template: CarTemplate): CarParts {
  const zones = ZONE_ORDER.map((zone) => ({
    zone,
    variants: template.layers.filter((l) => l.cls.role === 'paint' && l.cls.zone === zone),
  })).filter((z) => z.variants.length > 0);
  return {
    zones,
    wheels: template.layers.filter((l) => l.cls.role === 'wheels'),
    uv: template.layers.find((l) => l.cls.role === 'uv'),
  };
}

const visibleIndex = (variants: TemplateLayer[]) => Math.max(0, variants.findIndex((v) => !v.hidden));

/** The look the template shows when opened in Photoshop. */
export function defaultLook(parts: CarParts): Look {
  const zones: Look['zones'] = {};
  for (const { zone, variants } of parts.zones) zones[zone] = { variant: visibleIndex(variants) };
  return { zones, wheels: visibleIndex(parts.wheels) };
}

function textureCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d', { willReadFrequently: false })!;
}

export class TemplateComposer {
  readonly background = textureCanvas();
  /** Layers above the paint: windows, lights, trim. */
  readonly overlay = textureCanvas();
  /** The UV wireframe at the chosen opacity; never exported. */
  readonly guide = textureCanvas();
  /** Rust and scratches over the paint. */
  readonly weathering = textureCanvas();
  /** Alpha = paint that is actually visible, i.e. not covered by details stacked between paint zones. */
  readonly paintMask = textureCanvas();
  /** Alpha = window glass. */
  readonly windowsMask = textureCanvas();
  private readonly scratch = document.createElement('canvas');
  /** Unmasked weathering, regenerated only when its settings change, not on every paint change. */
  private readonly weatheringCache = document.createElement('canvas');
  private weatheringKey = '';
  private template?: CarTemplate;
  private parts?: CarParts;
  /** Texture y of the centre line between the car's two mirrored sides, found once per template. */
  mirrorAxis?: number;
  private axisTemplate?: CarTemplate;

  setTemplate(template: CarTemplate): CarParts {
    this.template = template;
    this.parts = carParts(template);
    return this.parts;
  }

  render(look: Look, guideOpacity: number): void {
    const { template, parts } = this;
    if (!template || !parts) return;
    const bg = context(this.background);
    const over = context(this.overlay);
    const mask = context(this.paintMask);
    const glass = context(this.windowsMask);
    for (const ctx of [bg, over, mask, glass]) ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    const top = template.layers.findLastIndex((l) => l.cls.role === 'paint');
    const selected = template.layers.map((layer) => this.selection(layer, look, parts));
    // Masks first: the mirror axis comes from the paint mask, and height gradients need it.
    template.layers.forEach((layer, index) => {
      if (!selected[index].selected) return;
      if (layer.cls.role === 'windows') glass.drawImage(layer.bitmap, layer.x, layer.y);
      if (index > top) return;
      mask.globalCompositeOperation = layer.cls.role === 'paint' ? 'source-over' : 'destination-out';
      mask.drawImage(layer.bitmap, layer.x, layer.y);
    });
    mask.globalCompositeOperation = 'source-over';
    if (this.axisTemplate !== template) {
      this.mirrorAxis = findMirrorAxis((size) => this.samplePaintMask(size), TEXTURE_SIZE)?.y;
      this.axisTemplate = template;
    }
    template.layers.forEach((layer, index) => {
      if (!selected[index].selected) return;
      if (index > top) this.draw(over, layer);
      else this.draw(bg, layer, selected[index]);
    });
    this.renderWeathering(look.weathering);
    this.renderGuide(guideOpacity);
  }

  private renderWeathering(weathering: Weathering | undefined): void {
    const ctx = context(this.weathering);
    ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    if (!hasWeathering(weathering)) return;
    const key = `${weathering.rust}|${weathering.scratches}|${weathering.seed}`;
    if (key !== this.weatheringKey) {
      paintWeathering(this.weatheringCache, weathering);
      this.weatheringKey = key;
    }
    ctx.drawImage(this.weatheringCache, 0, 0);
    // Wear only shows on the visible paint, never on glass, lights or trim.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.paintMask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The visible paint as a size × size grid of 0 and 1, e.g. to look for the mirror axis. */
  samplePaintMask(size: number): Uint8Array {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.paintMask, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const mask = new Uint8Array(size * size);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
    return mask;
  }

  /** Redraws only the UV wireframe, e.g. when its opacity changes. */
  renderGuide(opacity: number): void {
    const ctx = context(this.guide);
    ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    const uv = this.parts?.uv;
    if (uv && opacity > 0) {
      ctx.globalAlpha = uv.opacity * opacity;
      ctx.drawImage(uv.bitmap, uv.x, uv.y);
      ctx.globalAlpha = 1;
    }
  }

  private selection(layer: TemplateLayer, look: Look, parts: CarParts): { selected: boolean } & Paint {
    switch (layer.cls.role) {
      case 'paint': {
        const zone = layer.cls.zone;
        const variants = parts.zones.find((z) => z.zone === zone)?.variants ?? [];
        const zoneLook = look.zones[zone] ?? { variant: visibleIndex(variants) };
        // Designs may come from files or older versions; an unknown variant must not drop the zone.
        const variant = Math.min(Math.max(0, Math.trunc(zoneLook.variant) || 0), variants.length - 1);
        return { selected: variants[variant] === layer, color: zoneLook.color, pattern: zoneLook.pattern, gradient: zoneLook.gradient };
      }
      case 'wheels':
        return { selected: parts.wheels[Math.min(Math.max(0, Math.trunc(look.wheels) || 0), parts.wheels.length - 1)] === layer };
      case 'uv':
        return { selected: false };
      default:
        return { selected: true };
    }
  }

  private draw(ctx: CanvasRenderingContext2D, layer: TemplateLayer, paint: Paint = {}): void {
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(paint.pattern || paint.gradient || paint.color ? this.painted(layer, paint) : layer.bitmap, layer.x, layer.y);
    ctx.globalAlpha = 1;
  }

  /** The layer's shape filled with a colour, a pattern or a gradient. */
  private painted(layer: TemplateLayer, { color, pattern, gradient }: Paint): HTMLCanvasElement {
    const { scratch } = this;
    const { width, height } = layer.bitmap;
    scratch.width = width;
    scratch.height = height;
    const ctx = context(scratch);
    ctx.drawImage(layer.bitmap, 0, 0);
    // source-atop, not source-in: source-in clears everything outside each fill, which
    // would wipe the first half of a two-part height gradient.
    ctx.globalCompositeOperation = 'source-atop';
    if (pattern) {
      // The pattern lives in texture coordinates, so zones sharing a pattern line up.
      ctx.drawImage(patternCanvas(pattern), layer.x, layer.y, width, height, 0, 0, width, height);
    } else if (gradient) {
      this.fillGradient(ctx, layer, gradient);
    } else {
      ctx.fillStyle = color!;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
    return scratch;
  }

  /** Paints a zone gradient into the layer's own coordinates (the scratch canvas). */
  private fillGradient(ctx: CanvasRenderingContext2D, layer: TemplateLayer, { from, to, direction }: ZoneGradient): void {
    const { width, height } = layer.bitmap;
    const axis = this.mirrorAxis;
    if (direction === 'length') {
      const g = ctx.createLinearGradient(0, 0, width, 0);
      g.addColorStop(0, from);
      g.addColorStop(1, to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      return;
    }
    if (axis === undefined) {
      // Without mirrored sides, height simply runs down the texture.
      const g = ctx.createLinearGradient(0, height, 0, 0);
      g.addColorStop(0, from);
      g.addColorStop(1, to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      return;
    }
    // From the sills, the rows farthest from the axis, to the roof centre on the axis:
    // the upper side lies upside down, so its half of the gradient runs the other way.
    const middle = axis - layer.y;
    const reach = Math.max(Math.abs(middle), Math.abs(height - middle), 1);
    for (const [start, end] of [
      [middle - reach, Math.max(0, Math.min(height, middle))],
      [middle + reach, Math.max(0, Math.min(height, middle))],
    ]) {
      const g = ctx.createLinearGradient(0, start, 0, middle);
      g.addColorStop(0, from);
      g.addColorStop(1, to);
      ctx.fillStyle = g;
      if (start < middle) ctx.fillRect(0, 0, width, end);
      else ctx.fillRect(0, end, width, height - end);
    }
  }
}
