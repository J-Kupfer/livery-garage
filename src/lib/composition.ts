/**
 * Renders a car template into the planes the editor stacks around the user's
 * layers, following the PSD's own layer order:
 *
 *   background  every selected layer up to the top-most paint layer (with the chosen paint)
 *   (user layers, clipped to paintMask)
 *   overlay     the remaining layers: windows, lights, trim drawn above the paint
 *
 * Paint layers in the templates are flat colours (verified for all 21 cars), so a
 * custom colour is the layer's alpha filled with that colour, and a pattern is the
 * layer's alpha filled with the pattern.
 */
import { patternCanvas, type PatternSpec } from './patterns.ts';
import type { PaintZone } from './templateLayers.ts';
import { TEXTURE_SIZE, type CarTemplate, type TemplateLayer } from './templateTypes.ts';

export const ZONE_ORDER: readonly PaintZone[] = ['body', 'second', 'roof'];

export interface ZoneLook {
  /** Index into the zone's variants: decides the shape and, without `color` or `pattern`, the colour. */
  variant: number;
  /** Custom #rrggbb colour painted into the variant's shape. */
  color?: string;
  /** Pattern painted into the variant's shape; wins over `color`. */
  pattern?: PatternSpec;
}

type Paint = { color?: string; pattern?: PatternSpec };

export interface Look {
  zones: Partial<Record<PaintZone, ZoneLook>>;
  wheels: number;
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
  /** Layers above the paint, as exported. */
  readonly overlay = textureCanvas();
  /** `overlay` plus the UV wireframe guide, as shown while editing. */
  readonly overlayWithGuide = textureCanvas();
  /** Alpha = paint that is actually visible, i.e. not covered by details stacked between paint zones. */
  readonly paintMask = textureCanvas();
  private readonly scratch = document.createElement('canvas');
  private template?: CarTemplate;
  private parts?: CarParts;

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
    for (const ctx of [bg, over, mask]) ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    const top = template.layers.findLastIndex((l) => l.cls.role === 'paint');
    template.layers.forEach((layer, index) => {
      const selection = this.selection(layer, look, parts);
      if (!selection.selected) return;
      if (index > top) {
        this.draw(over, layer);
        return;
      }
      this.draw(bg, layer, selection);
      mask.globalCompositeOperation = layer.cls.role === 'paint' ? 'source-over' : 'destination-out';
      mask.drawImage(layer.bitmap, layer.x, layer.y);
    });
    mask.globalCompositeOperation = 'source-over';
    this.renderGuide(guideOpacity);
  }

  /** Redraws only the editing overlay, e.g. when the wireframe is toggled. */
  renderGuide(opacity: number): void {
    const ctx = context(this.overlayWithGuide);
    ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    ctx.drawImage(this.overlay, 0, 0);
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
        return { selected: variants[variant] === layer, color: zoneLook.color, pattern: zoneLook.pattern };
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
    ctx.drawImage(paint.pattern || paint.color ? this.painted(layer, paint) : layer.bitmap, layer.x, layer.y);
    ctx.globalAlpha = 1;
  }

  /** The layer's shape filled with a colour or a pattern. */
  private painted(layer: TemplateLayer, { color, pattern }: Paint): HTMLCanvasElement {
    const { scratch } = this;
    const { width, height } = layer.bitmap;
    scratch.width = width;
    scratch.height = height;
    const ctx = context(scratch);
    ctx.drawImage(layer.bitmap, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    if (pattern) {
      // The pattern lives in texture coordinates, so zones sharing a pattern line up.
      ctx.drawImage(patternCanvas(pattern), layer.x, layer.y, width, height, 0, 0, width, height);
    } else {
      ctx.fillStyle = color!;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
    return scratch;
  }
}
