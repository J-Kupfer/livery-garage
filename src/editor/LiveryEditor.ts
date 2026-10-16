/**
 * The livery canvas: the car template as fixed background and overlay, with the
 * user's layers (logos, images, text, shapes, flames, lines, freehand) in between as
 * Fabric objects.
 *
 * Fabric objects are the single source of truth for layers. React reads a derived,
 * immutable snapshot through subscribe/getSnapshot (useSyncExternalStore).
 */
import {
  ActiveSelection,
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  FabricObject,
  FabricText,
  Gradient,
  Group,
  IText,
  InteractiveFabricObject,
  Path,
  Pattern,
  Point,
  Rect,
  config,
  filters,
  util,
  type TMat2D,
  type TPointerEvent,
  type TPointerEventInfo,
} from 'fabric';
import { DEFAULT_BRUSH, pullTip, stringLength, strokePath, type BrushStyle } from '../lib/brush.ts';
import { TemplateComposer, defaultLook, type CarParts, type Look, type ZoneLook } from '../lib/composition.ts';
import { fillColor, gradientCoords, gradientEnd, sanitizeFill, type FillSpec } from '../lib/fills.ts';
import { DEFAULT_FLAME_COLORS, FLAME_WIDTH, flamePath } from '../lib/flames.ts';
import { fontWeightFor } from '../lib/fonts.ts';
import {
  DEFAULT_AREA_STYLE,
  DEFAULT_LINE_STYLE,
  MAX_LINE_POINTS,
  MIN_AREA_POINTS,
  lineStyleOf,
  type AreaStyle,
  type LinePoint,
  type LineStyle,
} from '../lib/lines.ts';
import { patternCanvas } from '../lib/patterns.ts';
import { snapBox, type Guide } from '../lib/snapping.ts';
import { DEFAULT_STICKERS, checkeredFlagCanvas, type StickerSpec, type StickerStyle } from '../lib/stickers.ts';
import type { Weathering } from '../lib/weathering.ts';
import { randomSeed } from '../lib/random.ts';
import { otherSide } from '../lib/symmetry.ts';
import type { PaintZone } from '../lib/templateLayers.ts';
import { TEXTURE_SIZE, type CarTemplate } from '../lib/templateTypes.ts';
import { Area } from './Area.ts';
import { WhiteToAlpha } from './filters.ts';
import { Pinstripe } from './Pinstripe.ts';

export type LayerKind = 'logo' | 'image' | 'text' | 'shape' | 'flames' | 'sticker' | 'line' | 'brush' | 'area' | 'group';

/**
 * Where a layer sits: clipped to the paint (below windows and lights), clipped to the
 * window glass (above it, e.g. a sun strip), or unclipped at paint level.
 */
export type ClipMode = 'paint' | 'windows' | 'none';

export type AssetSource = { kind: 'package'; path: string; name: string } | { kind: 'upload'; dataUrl: string; name: string };

/** Everything needed to restore a livery design for one car. */
export interface DesignData {
  version: 1;
  carId: string;
  look: Look;
  /** Serialized Fabric objects; image `src` is resolved from `assets` on load. */
  objects: Record<string, unknown>[];
  assets: Record<string, AssetSource>;
}

export interface LayerInfo {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  clip: ClipMode;
}

/** Editable properties of the selected layer, as shown in the properties panel. */
export interface LayerProps {
  id: string;
  kind: LayerKind;
  name: string;
  opacity: number;
  clip: ClipMode;
  flipX: boolean;
  flipY: boolean;
  angle: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  charSpacing?: number;
  /** Bend of a text layer: positive like an arch, negative like a smile, 0 straight. */
  textArc?: number;
  /** Solid recolour of a logo or image, or undefined for the original colours. */
  tint?: string;
  /** Whether a logo or image has its white background removed. */
  removeWhite?: boolean;
  /** Base, middle and tip colour of a flame layer. */
  flameColors?: string[];
  sticker?: StickerSpec;
  line?: LineStyle;
  /** Whether a free area runs as a curve through its points. */
  smooth?: boolean;
  /** Gradient or pattern instead of the plain `fill` colour. */
  fillSpec?: FillSpec;
  /** Colour of the strokes of a freehand layer. */
  brushColor?: string;
}

export type LayerPatch = Partial<Omit<LayerProps, 'id' | 'kind' | 'tint' | 'sticker' | 'line' | 'fillSpec'>> & {
  tint?: string | null;
  /** null switches back to the plain colour. */
  fillSpec?: FillSpec | null;
  sticker?: Partial<StickerSpec>;
  line?: Partial<LineStyle>;
};

/** The drawing tool in use: while it is active, clicks on the canvas draw instead of select. */
export type ToolState =
  | { kind: 'line'; points: number; style: LineStyle }
  | { kind: 'area'; points: number; style: AreaStyle }
  | { kind: 'brush'; style: BrushStyle };

export interface EditorSnapshot {
  carId?: string;
  parts?: CarParts;
  look?: Look;
  /** Top-most layer first. */
  layers: LayerInfo[];
  selection: string[];
  selected?: LayerProps;
  /** Whether the selected layers can become one group: two or more, all in the same area. */
  canGroup: boolean;
  tool?: ToolState;
  /** Texture y of the car's centre line between its two mirrored sides, if found. */
  mirrorAxis?: number;
  /** Whether moved layers snap to other layers and the centre line. */
  snapping: boolean;
  guideOpacity: number;
  /** Screen pixels per texture pixel. */
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Increments with every committed change; drives autosave and live sync. */
  revision: number;
}

interface Tags {
  id: string;
  layerName: string;
  kind: LayerKind;
  clip: ClipMode;
  assetId?: string;
  /** Flames are regenerated from seed and colours rather than edited point by point. */
  flameSeed?: number;
  flameColors?: string[];
  /** Stickers are rebuilt from their spec on every change. */
  stickerSpec?: StickerSpec;
  fillSpec?: FillSpec;
  /** Texts are bent along an arc rebuilt from this value. */
  textArc?: number;
}
type Tagged = FabricObject & Partial<Tags>;
const tagged = (o: FabricObject) => o as Tagged;

/** Layers can be grouped when there are two or more and they all sit in the same area. */
const groupable = (objects: Tagged[]) => objects.length > 1 && objects.every((o) => (o.clip ?? 'paint') === (objects[0].clip ?? 'paint'));

/** Visits a layer and, in groups, everything inside them. */
function eachObject(o: FabricObject, visit: (o: Tagged) => void): void {
  visit(tagged(o));
  if (o instanceof Group) for (const child of o.getObjects()) eachObject(child, visit);
}

/** Visits a serialized layer and, in groups, everything inside them. */
function eachData(data: Record<string, unknown>, visit: (data: Record<string, unknown>) => void): void {
  visit(data);
  if (Array.isArray(data.objects)) for (const child of data.objects as Record<string, unknown>[]) eachData(child, visit);
}

/** A pinstripe or free area being drawn: the clicked points plus the point under the pointer. */
interface PointTool {
  kind: 'line' | 'area';
  points: Point[];
  hover?: Point;
  preview?: Pinstripe | Area;
}

/** A freehand session: every stroke lands in the same layer. */
interface BrushTool {
  kind: 'brush';
  layerId?: string;
  pointer?: Point;
  stroke?: { points: Point[]; tip: Point; path: Path };
}

const MAX_ZOOM = 16;
const HISTORY_LIMIT = 100;
const COMMIT_DELAY_MS = 300;
const ACCENT = '#f2b632';
const SHAPE_FILL = '#d9572b';
/** Snapping distance in screen pixels. */
const SNAP_DISTANCE = 6;
const GUIDE_COLORS = { align: '#ff4fa3', mirror: '#38c8f5', axis: '#38c8f5' } as const;
/** Kinds whose counterpart on the other side must stay readable; the rest is mirrored. */
const READABLE = new Set<LayerKind>(['text', 'sticker', 'logo', 'image']);

FabricObject.customProperties = [
  'id',
  'layerName',
  'kind',
  'clip',
  'assetId',
  'flameSeed',
  'flameColors',
  'stickerSpec',
  'lineSpec',
  'areaSpec',
  'fillSpec',
  'textArc',
  // Fabric does not serialize it by default, but it is how a layer is locked.
  'selectable',
];
Object.assign(InteractiveFabricObject.ownDefaults, {
  transparentCorners: false,
  cornerStyle: 'circle',
  cornerColor: '#ffffff',
  cornerStrokeColor: '#1d1a10',
  cornerSize: 11,
  borderColor: ACCENT,
  borderScaleFactor: 1.5,
  padding: 4,
});

// The selection frame sits on liveries of any colour, including the yellow the accent
// is made of; a dark halo under the accent stroke keeps it visible everywhere.
type StrokeBorders = typeof InteractiveFabricObject.prototype.strokeBorders & { halo?: true };
const original = InteractiveFabricObject.prototype.strokeBorders as StrokeBorders;
if (!original.halo) {
  const withHalo: StrokeBorders = function (this: InteractiveFabricObject, ctx, size) {
    const { strokeStyle, lineWidth } = ctx;
    ctx.strokeStyle = 'rgba(18, 22, 24, 0.6)';
    ctx.lineWidth = lineWidth + 2;
    original.call(this, ctx, size);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    original.call(this, ctx, size);
  };
  withHalo.halo = true; // module re-evaluation (hot reload) must not wrap twice
  InteractiveFabricObject.prototype.strokeBorders = withHalo;
}
// Text on a path is measured by its path alone; grow the box by the letters around
// the path, so selection frame, snapping and cache cover them.
type InitDimensions = typeof IText.prototype.initDimensions & { padded?: true };
const initDimensions = IText.prototype.initDimensions as InitDimensions;
if (!initDimensions.padded) {
  const padded: InitDimensions = function (this: IText) {
    initDimensions.call(this);
    if (this.path) {
      this.width += this.fontSize;
      this.height += this.fontSize;
    }
  };
  padded.padded = true; // module re-evaluation (hot reload) must not wrap twice
  IText.prototype.initDimensions = padded;
}
// Clipped objects render through their own cache canvas; allow larger caches so
// text stays crisp when zoomed in.
config.perfLimitSizeTotal = 8 * 1024 * 1024;
config.maxCacheSideLimit = 8192;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export class LiveryEditor {
  readonly composer = new TemplateComposer();
  private readonly canvas: Canvas;
  private readonly element: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly listeners = new Set<() => void>();
  private snapshot: EditorSnapshot;

  private template?: CarTemplate;
  private parts?: CarParts;
  private look?: Look;
  private guideOpacity = 0.6;

  private readonly backgroundImage: FabricImage;
  /** Fixed planes inside the object stack: layers on the paint go below, layers on the windows above. */
  private readonly weatheringPlane: FabricImage;
  private readonly overlayPlane: FabricImage;
  /** UV wireframe drawn above everything while editing, left out of exports. */
  private readonly guideImage: FabricImage;

  private readonly assets = new Map<string, { source: AssetSource; url: string }>();
  private past: string[] = [];
  private future: string[] = [];
  private present = '';
  private commitTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private restoring = false;
  private queue: Promise<unknown> = Promise.resolve();
  private fitted = false;
  private lookFrame = 0;

  private spaceDown = false;
  private panFrom?: { x: number; y: number };

  private tool?: PointTool | BrushTool;
  private mirrorAxis?: number;
  private snapping = true;
  /** Lines shown while a moved layer has snapped. */
  private guides: Guide[] = [];
  /** Style for the next line and brush stroke: whatever was used last. */
  private lineStyle: LineStyle = { ...DEFAULT_LINE_STYLE };
  private areaStyle: AreaStyle = { ...DEFAULT_AREA_STYLE };
  private brushStyle: BrushStyle = { ...DEFAULT_BRUSH };

  private readonly host: HTMLElement;
  /** Loads the image behind a package asset when a saved design is restored. */
  private readonly resolveAsset: (source: AssetSource) => Promise<Blob>;

  constructor(host: HTMLElement, resolveAsset: (source: AssetSource) => Promise<Blob>) {
    this.host = host;
    this.resolveAsset = resolveAsset;
    this.element = document.createElement('canvas');
    host.appendChild(this.element);
    this.canvas = new Canvas(this.element, {
      width: host.clientWidth,
      height: host.clientHeight,
      preserveObjectStacking: true,
      controlsAboveOverlay: true,
      selectionColor: 'rgba(242, 182, 50, 0.12)',
      selectionBorderColor: ACCENT,
      selectionLineWidth: 1,
      // Thin lines and brush strokes are hit per pixel; give the pointer some slack.
      targetFindTolerance: 6,
    });

    const plane = (element: HTMLCanvasElement) =>
      new FabricImage(element, {
        left: TEXTURE_SIZE / 2,
        top: TEXTURE_SIZE / 2,
        objectCaching: false,
        selectable: false,
        evented: false,
      });
    this.backgroundImage = plane(this.composer.background);
    this.weatheringPlane = plane(this.composer.weathering);
    this.overlayPlane = plane(this.composer.overlay);
    this.guideImage = plane(this.composer.guide);
    this.canvas.add(this.weatheringPlane, this.overlayPlane);

    this.snapshot = this.buildSnapshot();
    this.bindCanvasEvents();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  dispose(): void {
    clearTimeout(this.commitTimer);
    this.cancelLook();
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    for (const { url } of this.assets.values()) URL.revokeObjectURL(url);
    void this.canvas.dispose().then(() => this.element.remove());
  }

  // ---- store ----------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EditorSnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private userObjects(): Tagged[] {
    return this.canvas.getObjects().filter((o) => tagged(o).id) as Tagged[];
  }

  private buildSnapshot(): EditorSnapshot {
    const active = this.canvas.getActiveObjects() as Tagged[];
    const single = active.length === 1 ? active[0] : undefined;
    return {
      carId: this.template?.vehicle.carId,
      parts: this.parts,
      look: this.look,
      layers: this.userObjects()
        .map((o) => ({
          id: o.id!,
          name: this.displayName(o),
          kind: o.kind ?? 'shape',
          visible: o.visible,
          locked: !o.selectable,
          clip: o.clip ?? 'paint',
        }))
        .reverse(),
      selection: active.map((o) => o.id!).filter(Boolean),
      selected: single ? this.propsOf(single) : undefined,
      canGroup: groupable(active),
      tool: this.toolState(),
      mirrorAxis: this.mirrorAxis,
      snapping: this.snapping,
      guideOpacity: this.guideOpacity,
      zoom: this.canvas.getZoom(),
      canUndo: this.past.length > 0 || (this.pointTool()?.points.length ?? 0) > 0,
      canRedo: this.future.length > 0,
      revision: this.revision,
    };
  }

  /** Text layers are named after their text until the user renames them. */
  private displayName(o: Tagged): string {
    if (o.layerName) return o.layerName;
    if (o instanceof IText) return o.text.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Text';
    return '';
  }

  private propsOf(o: Tagged): LayerProps {
    const props: LayerProps = {
      id: o.id!,
      kind: o.kind ?? 'shape',
      name: this.displayName(o),
      opacity: o.opacity,
      clip: o.clip ?? 'paint',
      flipX: o.flipX,
      flipY: o.flipY,
      angle: Math.round(o.angle),
    };
    if (o instanceof FabricImage) {
      const tint = o.filters.find((f) => f instanceof filters.BlendColor);
      props.tint = tint?.color;
      props.removeWhite = o.filters.some((f) => f instanceof WhiteToAlpha);
    } else {
      props.fill = o.fillSpec ? fillColor(o.fillSpec) : typeof o.fill === 'string' ? o.fill : undefined;
      props.fillSpec = o.fillSpec;
      props.stroke = typeof o.stroke === 'string' ? o.stroke : undefined;
      props.strokeWidth = o.strokeWidth;
    }
    if (o.kind === 'flames') props.flameColors = o.flameColors ?? [...DEFAULT_FLAME_COLORS];
    if (o.kind === 'sticker' && o.stickerSpec) props.sticker = o.stickerSpec;
    if (o instanceof Pinstripe) props.line = lineStyleOf(o.lineSpec);
    if (o instanceof Area) props.smooth = o.areaSpec.smooth;
    if (o.kind === 'brush' && o instanceof Group) {
      const stroke = o.getObjects()[0]?.stroke;
      props.brushColor = typeof stroke === 'string' ? stroke : undefined;
    }
    if (o instanceof IText) {
      props.text = o.text;
      props.fontFamily = o.fontFamily;
      props.fontWeight = String(o.fontWeight);
      props.fontStyle = o.fontStyle;
      props.charSpacing = o.charSpacing;
      props.textArc = tagged(o).textArc ?? 0;
    }
    return props;
  }

  // ---- template and look ----------------------------------------------------

  /** Shows a car and restores its design, or starts a blank one with the factory look. */
  loadCar(template: CarTemplate, design?: DesignData): Promise<void> {
    return this.enqueue(async () => {
      this.cancelTool();
      this.flushCommit();
      this.template = template;
      this.parts = this.composer.setTemplate(template);
      this.look = design?.look ?? defaultLook(this.parts);
      this.cancelLook();
      this.composer.render(this.look, this.guideOpacity);
      this.mirrorAxis = this.composer.mirrorAxis;
      this.canvas.backgroundImage = this.backgroundImage;
      this.showGuide();
      await this.replaceObjects(design ? await this.objectsFromDesign(design) : []);
      this.past = [];
      this.future = [];
      this.present = this.serializeState();
      this.fit();
      this.emit();
    });
  }

  setZone(zone: PaintZone, zoneLook: ZoneLook): void {
    if (!this.look) return;
    this.look = { ...this.look, zones: { ...this.look.zones, [zone]: zoneLook } };
    this.scheduleLook();
  }

  setWeathering(weathering: Weathering): void {
    if (!this.look) return;
    this.look = { ...this.look, weathering };
    this.scheduleLook();
  }

  setWheels(variant: number): void {
    if (!this.look) return;
    this.look = { ...this.look, wheels: variant };
    this.scheduleLook();
  }

  setSnapping(on: boolean): void {
    this.snapping = on;
    this.emit();
  }

  setGuideOpacity(opacity: number): void {
    this.guideOpacity = opacity;
    this.composer.renderGuide(opacity);
    this.showGuide();
    this.canvas.requestRenderAll();
    this.emit();
  }

  private showGuide(): void {
    this.canvas.overlayImage = this.guideOpacity > 0 && this.template ? this.guideImage : undefined;
  }

  /** Paint changes arrive at pointer speed (colour pickers, sliders): recompose once per frame. */
  private scheduleLook(): void {
    this.emit();
    if (this.lookFrame) return;
    this.lookFrame = requestAnimationFrame(() => {
      this.lookFrame = 0;
      this.renderLook();
    });
  }

  private cancelLook(): void {
    cancelAnimationFrame(this.lookFrame);
    this.lookFrame = 0;
  }

  private renderLook(): void {
    if (!this.look) return;
    this.composer.render(this.look, this.guideOpacity);
    // The paint mask may have changed shape (some cars have variants with different panels).
    for (const o of [...this.userObjects(), ...this.toolObjects()]) if (o.clip !== 'none') o.set('dirty', true);
    this.canvas.requestRenderAll();
    this.changed();
  }

  // ---- layers ---------------------------------------------------------------

  private nextName(base: string): string {
    const names = new Set(this.userObjects().map((o) => this.displayName(o)));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  private visibleWidth(): number {
    return this.canvas.width / this.canvas.getZoom();
  }

  /** Turns an object into a layer: id, name, kind and clipping. */
  private register(o: Tagged, kind: LayerKind, name: string, clip: ClipMode): void {
    Object.assign(o, {
      id: crypto.randomUUID(),
      layerName: name && this.nextName(name),
      kind,
      clip,
    } satisfies Tags);
    this.applyClip(o);
    this.applyHitTesting(o);
  }

  /** Adds a new layer in the middle of the view and selects it. */
  private place(o: Tagged, kind: LayerKind, name: string, clip: ClipMode = 'paint'): void {
    this.endTool();
    const center = this.canvas.getVpCenter();
    this.register(o, kind, name, clip);
    o.set({ left: center.x, top: center.y });
    this.canvas.add(o);
    this.normalizeStack();
    this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
  }

  async addImage(blob: Blob, source: AssetSource, kind: 'logo' | 'image', width = kind === 'logo' ? 520 : 900): Promise<void> {
    const assetId = this.registerAsset(source, blob);
    const image = (await FabricImage.fromURL(this.assets.get(assetId)!.url)) as Tagged & FabricImage;
    image.assetId = assetId;
    const target = Math.min(width, this.visibleWidth() * 0.4);
    image.scale(target / image.width);
    this.place(image, kind, source.name);
  }

  addText(fontFamily: string): void {
    const text = new IText('START 07', {
      fontFamily,
      fontSize: 150,
      fill: '#ffffff',
      stroke: '#1d1d1f',
      strokeWidth: 0,
      paintFirst: 'stroke',
      strokeLineJoin: 'round',
      textAlign: 'center',
    }) as Tagged & IText;
    const target = Math.min(700, this.visibleWidth() * 0.4);
    if (text.width > target) text.scale(target / text.width);
    this.place(text, 'text', '');
  }

  addFlames(): void {
    const flames = this.createFlames(randomSeed(), DEFAULT_FLAME_COLORS);
    flames.scale(Math.min(820, this.visibleWidth() * 0.5) / FLAME_WIDTH);
    this.place(flames, 'flames', 'Flammen');
  }

  /** Replaces the selected flames with a new random shape, keeping placement, colours and outline. */
  regenerateFlames(): void {
    const active = this.canvas.getActiveObjects() as Tagged[];
    if (active.length !== 1 || active[0].kind !== 'flames') return;
    const old = active[0];
    const fresh = this.createFlames(randomSeed(), old.flameColors ?? DEFAULT_FLAME_COLORS);
    fresh.set({ stroke: old.stroke, strokeWidth: old.strokeWidth });
    this.swap(old, fresh);
  }

  /** Replaces a layer with a rebuilt version in the same place, as a single change. */
  private swap(old: Tagged, fresh: Tagged): void {
    fresh.set({
      left: old.left,
      top: old.top,
      scaleX: old.scaleX,
      scaleY: old.scaleY,
      angle: old.angle,
      flipX: old.flipX,
      flipY: old.flipY,
      opacity: old.opacity,
      visible: old.visible,
    });
    Object.assign(fresh, { id: old.id, layerName: old.layerName, kind: old.kind, clip: old.clip });
    this.applyClip(fresh);
    const index = this.canvas.getObjects().indexOf(old);
    // Swap without the add/remove events: it is one change, not two.
    this.restoring = true;
    try {
      this.canvas.remove(old);
      this.canvas.insertAt(index, fresh);
      this.normalizeStack();
    } finally {
      this.restoring = false;
    }
    this.canvas.setActiveObject(fresh);
    this.canvas.requestRenderAll();
    this.changed();
  }

  addSticker(style: StickerStyle): void {
    const sticker = this.createSticker(DEFAULT_STICKERS[style]);
    const target = style === 'banner' ? Math.min(1100, this.visibleWidth() * 0.55) : Math.min(260, this.visibleWidth() * 0.2);
    sticker.scale(target / sticker.width);
    const names: Record<StickerStyle, string> = { circle: 'Startnummer', plate: 'Startnummer', banner: 'Sonnenblende' };
    this.place(sticker, 'sticker', names[style], style === 'banner' ? 'windows' : 'paint');
  }

  /** A checkered flag image; saved with the design like an uploaded picture. */
  async addCheckeredFlag(): Promise<void> {
    const canvas = checkeredFlagCanvas();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Zielflagge konnte nicht erzeugt werden.'))), 'image/png'),
    );
    await this.addImage(blob, { kind: 'upload', dataUrl: canvas.toDataURL('image/png'), name: 'Zielflagge' }, 'image', 360);
  }

  private createSticker(spec: StickerSpec): Tagged & Group {
    const banner = spec.style === 'banner';
    const text = new FabricText(spec.text || ' ', {
      fontFamily: spec.fontFamily,
      fontWeight: fontWeightFor(spec.fontFamily),
      fontSize: banner ? 110 : 150,
      charSpacing: banner ? 120 : 0,
      fill: spec.color,
      // Digits and capitals have no descenders: nudge them down to look centred.
      top: banner ? 5 : 9,
    });
    const common = { fill: spec.background, stroke: spec.outline, strokeWidth: spec.outlineWidth };
    let shape: FabricObject;
    if (banner) {
      shape = new Rect({ ...common, width: Math.max(900, text.width + 220), height: 160 });
    } else {
      // Fit longer numbers into the badge instead of letting them spill over.
      const room = spec.style === 'circle' ? 180 : 196;
      text.scale(Math.min(1, room / text.width, 170 / text.height));
      shape =
        spec.style === 'circle' ? new Circle({ ...common, radius: 120 }) : new Rect({ ...common, width: 250, height: 250, rx: 28, ry: 28 });
    }
    const sticker = new Group([shape, text]) as Tagged & Group;
    sticker.stickerSpec = { ...spec };
    return sticker;
  }

  private flameGradient(colors: readonly string[]): Gradient<'linear'> {
    return new Gradient({
      type: 'linear',
      gradientUnits: 'percentage',
      coords: { x1: 0, y1: 0, x2: 1, y2: 0 },
      colorStops: [
        { offset: 0.1, color: colors[0] },
        { offset: 0.5, color: colors[1] },
        { offset: 0.92, color: colors[2] },
      ],
    });
  }

  private createFlames(seed: number, colors: readonly string[]): Tagged & Path {
    const flames = new Path(flamePath(seed), {
      fill: this.flameGradient(colors),
      stroke: '#1d1a10',
      // Stroke first: the fill hides the inner half and the lines between overlapping
      // licks, leaving one outline around the whole flame.
      paintFirst: 'stroke',
      strokeWidth: 12,
      strokeLineJoin: 'round',
      strokeUniform: true,
    }) as Tagged & Path;
    flames.flameSeed = seed;
    flames.flameColors = [...colors];
    return flames;
  }

  addShape(shape: 'stripe' | 'rect' | 'circle'): void {
    const common = { fill: SHAPE_FILL, stroke: '#1d1d1f', strokeWidth: 0, strokeUniform: true };
    const width = Math.min(1100, this.visibleWidth() * 0.6);
    let o: Tagged;
    let name: string;
    if (shape === 'circle') {
      o = new Ellipse({ ...common, rx: width / 5, ry: width / 5 });
      name = 'Kreis';
    } else if (shape === 'stripe') {
      o = new Rect({ ...common, width, height: width / 9 });
      name = 'Streifen';
    } else {
      o = new Rect({ ...common, width: width / 2, height: width / 3 });
      name = 'Rechteck';
    }
    this.place(o, 'shape', name);
  }

  select(id: string): void {
    const o = this.find(id);
    if (!o || !o.selectable) return;
    this.endTool();
    this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    this.emit();
  }

  removeSelected(): void {
    const active = this.canvas.getActiveObjects();
    if (active.length === 0) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(...active);
    this.canvas.requestRenderAll();
  }

  remove(id: string): void {
    const o = this.find(id);
    if (!o) return;
    if (this.canvas.getActiveObjects().includes(o)) this.canvas.discardActiveObject();
    this.canvas.remove(o);
    this.canvas.requestRenderAll();
  }

  duplicateSelected(): Promise<void> {
    return this.copySelected((copy) => copy.set({ left: copy.left + 24, top: copy.top + 24 }));
  }

  /**
   * Copies the selected layer to the matching spot on the other side of the car:
   * text, numbers and logos stay readable, everything else is mirrored.
   */
  copyToOtherSide(): Promise<void> {
    const axis = this.mirrorAxis;
    if (axis === undefined) return Promise.resolve();
    return this.copySelected((copy, original) => {
      const center = original.getCenterPoint();
      let readable = false;
      eachObject(original, (o) => {
        if (READABLE.has(o.kind ?? 'shape')) readable = true;
      });
      const target = otherSide({ x: center.x, y: center.y, angle: original.angle, flipY: original.flipY }, axis, readable);
      copy.set({ angle: target.angle, flipY: target.flipY });
      copy.setPositionByOrigin(new Point(target.x, target.y), 'center', 'center');
    });
  }

  /** Adds a copy of the selected layer right above it and selects the copy. */
  private copySelected(arrange: (copy: Tagged, original: Tagged) => void): Promise<void> {
    const active = this.canvas.getActiveObjects() as Tagged[];
    if (active.length !== 1) return Promise.resolve();
    const original = active[0];
    return this.enqueue(async () => {
      const [copy] = await this.restoreObjects([this.serialize(original)]);
      if (!copy) return;
      copy.id = crypto.randomUUID();
      if (original.layerName) copy.layerName = this.nextName(original.layerName);
      arrange(copy, original);
      copy.setCoords();
      const index = this.canvas.getObjects().indexOf(original);
      this.canvas.insertAt(index + 1, copy);
      this.normalizeStack();
      this.canvas.setActiveObject(copy);
      this.canvas.requestRenderAll();
    });
  }

  /** Turns the selected layers into one group layer, in the place of the top-most of them. */
  groupSelected(): void {
    const selection = this.canvas.getActiveObject();
    if (!(selection instanceof ActiveSelection) || !groupable(selection.getObjects())) return;
    // Taken before the selection is dissolved, which empties it.
    const members = [...selection.getObjects()] as Tagged[];
    const clip = members[0].clip ?? 'paint';
    this.canvas.discardActiveObject();
    const order = this.canvas.getObjects();
    // Back in canvas coordinates now; keep their stacking order inside the group.
    members.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const index = order.indexOf(members.at(-1)!) - (members.length - 1);
    this.quietly(() => this.canvas.remove(...members));
    // The group clips them all at once.
    for (const member of members) member.clipPath = undefined;
    const group = new Group(members);
    this.register(group, 'group', 'Gruppe', clip);
    this.quietly(() => this.canvas.insertAt(index, group));
    this.normalizeStack();
    this.canvas.setActiveObject(group);
    this.canvas.requestRenderAll();
    this.changed();
  }

  /** Splits the selected group back into its layers, where they were, and selects them. */
  ungroupSelected(): void {
    const group = this.canvas.getActiveObject();
    if (!(group instanceof Group) || tagged(group).kind !== 'group') return;
    const index = this.canvas.getObjects().indexOf(group);
    const clip = tagged(group).clip ?? 'paint';
    this.canvas.discardActiveObject();
    // Leaving the group applies its move, rotation and scale to each layer.
    const members = group.removeAll() as Tagged[];
    this.quietly(() => {
      this.canvas.remove(group);
      this.canvas.insertAt(index, ...members);
    });
    for (const member of members) {
      member.clip = clip;
      this.applyClip(member);
      this.applyHitTesting(member);
      // A scaled group leaves its patterns stretched until they are rebuilt.
      eachObject(member, (o) => this.applyFill(o));
    }
    this.normalizeStack();
    this.canvas.setActiveObject(new ActiveSelection(members, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
    this.changed();
  }

  /**
   * Moves a layer to a position in the panel order (0 = top-most). Layers stay in their
   * band: whatever is on the windows is always above the windows, the rest below.
   */
  moveLayer(id: string, panelIndex: number): void {
    const topFirst = this.userObjects().reverse();
    const from = topFirst.findIndex((o) => o.id === id);
    if (from === -1) return;
    const [o] = topFirst.splice(from, 1);
    topFirst.splice(clamp(panelIndex, 0, topFirst.length), 0, o);
    this.applyOrder(topFirst.reverse());
    this.canvas.requestRenderAll();
    this.changed();
  }

  /** Restores the stack invariant: paint layers, weathering, windows and lights, window layers. */
  private normalizeStack(): void {
    this.applyOrder(this.userObjects());
  }

  private applyOrder(bottomFirst: Tagged[]): void {
    // Whatever is being drawn right now goes on top of its band.
    const all = [...bottomFirst, ...this.toolObjects()];
    const desired = [
      ...all.filter((o) => o.clip !== 'windows'),
      this.weatheringPlane,
      this.overlayPlane,
      ...all.filter((o) => o.clip === 'windows'),
    ];
    desired.forEach((o, index) => {
      if (this.canvas.getObjects()[index] !== o) this.canvas.moveObjectTo(o, index);
    });
  }

  setVisible(id: string, visible: boolean): void {
    const o = this.find(id);
    if (!o) return;
    if (!visible && this.canvas.getActiveObjects().includes(o)) this.canvas.discardActiveObject();
    o.set('visible', visible);
    this.canvas.requestRenderAll();
    this.changed();
  }

  rename(id: string, name: string): void {
    const o = this.find(id);
    // Leaving the field unchanged must not pin a text layer's name to its current text.
    if (!o || !name.trim() || name.trim() === this.displayName(o)) return;
    o.layerName = name.trim();
    this.changed();
  }

  setLocked(id: string, locked: boolean): void {
    const o = this.find(id);
    if (!o) return;
    if (locked && this.canvas.getActiveObjects().includes(o)) this.canvas.discardActiveObject();
    o.set({ selectable: !locked, evented: !locked });
    this.canvas.requestRenderAll();
    this.changed();
  }

  updateSelected(patch: LayerPatch): void {
    const active = this.canvas.getActiveObjects() as Tagged[];
    if (active.length !== 1) return;
    const o = active[0];
    const { name, clip, tint, removeWhite, flameColors, sticker, line, smooth, brushColor, fillSpec, textArc, ...rest } = patch;
    if (sticker && o.kind === 'sticker' && o.stickerSpec) {
      // Rebuilt as a whole: the badge size depends on text and font.
      this.swap(o, this.createSticker({ ...o.stickerSpec, ...sticker }));
      return;
    }
    if (name !== undefined) o.layerName = name;
    if (clip !== undefined) {
      o.clip = clip;
      this.applyClip(o);
      this.normalizeStack();
    }
    if (flameColors && o.kind === 'flames') {
      o.flameColors = [...flameColors];
      o.set('fill', this.flameGradient(flameColors));
    }
    if (line && o instanceof Pinstripe) {
      o.setSpec(line);
      // The next line starts out the same, so a set of stripes stays consistent.
      this.lineStyle = { ...this.lineStyle, ...line };
    }
    if (o instanceof Area) {
      if (smooth !== undefined) o.setSpec({ smooth });
      const { fill, stroke, strokeWidth } = rest;
      this.areaStyle = {
        ...this.areaStyle,
        ...(typeof fill === 'string' && { fill }),
        ...(typeof stroke === 'string' && { stroke }),
        ...(strokeWidth !== undefined && { strokeWidth }),
        ...(smooth !== undefined && { smooth }),
      };
    }
    if (brushColor && o instanceof Group && tagged(o).kind === 'brush') {
      for (const stroke of o.getObjects()) stroke.set('stroke', brushColor);
    }
    if (fillSpec !== undefined) tagged(o).fillSpec = fillSpec ?? undefined;
    if ((tint !== undefined || removeWhite !== undefined) && o instanceof FabricImage) {
      const color = tint === undefined ? o.filters.find((f) => f instanceof filters.BlendColor)?.color : tint;
      const white = removeWhite ?? o.filters.some((f) => f instanceof WhiteToAlpha);
      // White goes first, so a recoloured logo keeps its shape instead of its background.
      o.filters = [...(white ? [new WhiteToAlpha()] : []), ...(color ? [new filters.BlendColor({ color, mode: 'tint', alpha: 1 })] : [])];
      o.applyFilters();
    }
    if (textArc !== undefined) tagged(o).textArc = textArc;
    if (Object.keys(rest).length > 0) {
      o.set(rest);
      if (o instanceof IText) o.initDimensions();
    }
    // Text, font and spacing change the length of the arc.
    this.applyTextArc(o);
    // Last, as a pattern depends on the layer's size.
    this.applyFill(o);
    o.set('dirty', true);
    o.setCoords();
    this.canvas.requestRenderAll();
    this.changed();
  }

  /**
   * Bends a text along an arc as long as the straight text, so the letters keep their
   * spacing; 100 % is a half circle. Bent text is edited in the panel: Fabric's caret
   * does not follow a path.
   */
  private applyTextArc(o: Tagged): void {
    if (!(o instanceof IText)) return;
    const arc = Math.max(-100, Math.min(100, tagged(o).textArc ?? 0));
    if (o.path) {
      o.set('path', undefined);
      o.initDimensions();
    }
    o.editable = arc === 0;
    if (arc === 0) return;
    const angle = (Math.abs(arc) / 100) * Math.PI;
    const radius = o.width / angle;
    const x = radius * Math.sin(angle / 2);
    const y = radius * (1 - Math.cos(angle / 2));
    // An arch runs over the top of its circle, a smile along the bottom; both left to right.
    const d = arc > 0 ? `M ${-x} ${y} A ${radius} ${radius} 0 0 1 ${x} ${y}` : `M ${-x} ${-y} A ${radius} ${radius} 0 0 0 ${x} ${-y}`;
    o.set({ path: new Path(d, { visible: false }), pathAlign: 'center', pathSide: 'left' });
    o.setPathInfo();
    o.initDimensions();
    o.setCoords();
  }

  /**
   * Rebuilds a gradient or pattern fill from its spec. A pattern is the paint's full
   * texture-sized pattern image, centred on the layer and kept at texture scale however
   * the layer is sized, so it never changes when the layer grows (typing, say).
   */
  private applyFill(o: Tagged): void {
    const spec = o.fillSpec;
    if (!spec) return;
    if (spec.kind === 'gradient') {
      o.set(
        'fill',
        new Gradient({
          type: 'linear',
          gradientUnits: 'percentage',
          coords: gradientCoords(spec.angle),
          colorStops: [
            { offset: 0, color: spec.from },
            { offset: 1, color: gradientEnd(spec) },
          ],
        }),
      );
    } else {
      const scaling = o.getObjectScaling();
      const sx = Math.abs(scaling.x) || 1;
      const sy = Math.abs(scaling.y) || 1;
      // Fabric places a pattern at the layer's top-left corner; move the image's centre to the layer's centre.
      const half = TEXTURE_SIZE / 2;
      o.set(
        'fill',
        new Pattern({
          source: patternCanvas(spec.pattern),
          repeat: 'repeat',
          patternTransform: [1 / sx, 0, 0, 1 / sy, o.width / 2 - half / sx, o.height / 2 - half / sy],
        }),
      );
    }
    o.set('dirty', true);
  }

  private find(id: string): Tagged | undefined {
    return this.userObjects().find((o) => o.id === id);
  }

  private applyClip(o: Tagged): void {
    const mask = o.clip === 'windows' ? this.composer.windowsMask : o.clip === 'none' ? undefined : this.composer.paintMask;
    o.clipPath = mask
      ? new FabricImage(mask, {
          left: TEXTURE_SIZE / 2,
          top: TEXTURE_SIZE / 2,
          absolutePositioned: true,
          objectCaching: false,
          excludeFromExport: true,
        })
      : undefined;
    o.set('dirty', true);
  }

  /** Freehand layers and groups are mostly empty space: only what is drawn counts as a hit. */
  private applyHitTesting(o: Tagged): void {
    if (o.kind === 'brush' || o.kind === 'group') o.perPixelTargetFind = true;
  }

  private registerAsset(source: AssetSource, blob: Blob, id: string = crypto.randomUUID()): string {
    this.assets.set(id, { source, url: URL.createObjectURL(blob) });
    return id;
  }

  // ---- drawing tools ----------------------------------------------------------

  /** Starts drawing a pinstripe: every click on the canvas adds a point. */
  startLine(): void {
    this.startPoints('line');
  }

  /** Starts drawing a free area: every click adds a corner, the shape closes itself. */
  startArea(): void {
    this.startPoints('area');
  }

  private startPoints(kind: PointTool['kind']): void {
    this.endTool();
    this.canvas.discardActiveObject();
    this.tool = { kind, points: [] };
    this.updateInteraction();
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Starts freehand painting; with `continueSelected` the strokes go into the selected freehand layer. */
  startBrush(continueSelected = false): void {
    const active = this.canvas.getActiveObjects() as Tagged[];
    const layerId = continueSelected && active.length === 1 && active[0].kind === 'brush' ? active[0].id : undefined;
    this.endTool();
    this.canvas.discardActiveObject();
    this.tool = { kind: 'brush', layerId };
    this.updateInteraction();
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Finishes the active tool and selects what it drew. A line needs two points, an area three. */
  endTool(): void {
    const tool = this.tool;
    if (!tool) return;
    let result: Tagged | undefined;
    if (tool.kind === 'brush') {
      this.finishStroke(tool);
      result = tool.layerId ? this.find(tool.layerId) : undefined;
    } else {
      result = this.finishPoints(tool);
    }
    this.closeTool();
    if (result) this.canvas.setActiveObject(result);
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Leaves the active tool; a line or area in progress is dropped. */
  cancelTool(): void {
    const tool = this.tool;
    if (!tool) return;
    if (tool.kind === 'brush') {
      this.finishStroke(tool);
    } else {
      const { preview } = tool;
      if (preview) this.quietly(() => this.canvas.remove(preview));
    }
    this.closeTool();
    this.canvas.requestRenderAll();
    this.emit();
  }

  setLineStyle(patch: Partial<LineStyle>): void {
    this.lineStyle = { ...this.lineStyle, ...patch };
    const tool = this.pointTool();
    if (tool?.kind === 'line') this.updatePreview(tool);
    this.emit();
  }

  setAreaStyle(patch: Partial<AreaStyle>): void {
    this.areaStyle = { ...this.areaStyle, ...patch };
    const tool = this.pointTool();
    if (tool?.kind === 'area') this.updatePreview(tool);
    this.emit();
  }

  setBrushStyle(patch: Partial<BrushStyle>): void {
    this.brushStyle = { ...this.brushStyle, ...patch };
    if (this.tool) this.canvas.renderTop();
    this.emit();
  }

  private toolState(): ToolState | undefined {
    const tool = this.tool;
    if (tool?.kind === 'line') return { kind: 'line', points: tool.points.length, style: this.lineStyle };
    if (tool?.kind === 'area') return { kind: 'area', points: tool.points.length, style: this.areaStyle };
    if (tool?.kind === 'brush') return { kind: 'brush', style: this.brushStyle };
    return undefined;
  }

  private pointTool(): PointTool | undefined {
    return this.tool && this.tool.kind !== 'brush' ? this.tool : undefined;
  }

  private closeTool(): void {
    this.tool = undefined;
    this.updateInteraction();
    this.canvas.clearContext(this.canvas.contextTop);
  }

  /** What is being drawn right now and is not a layer yet. */
  private toolObjects(): Tagged[] {
    const tool = this.tool;
    const o = tool?.kind === 'brush' ? tool.stroke?.path : tool?.preview;
    return o ? [o] : [];
  }

  private toolDown(e: MouseEvent, at: Point): void {
    const tool = this.tool!;
    if (tool.kind === 'brush') this.startStroke(tool, at);
    else this.addPoint(tool, at, e.shiftKey);
  }

  private toolMove(e: MouseEvent, at: Point): void {
    const tool = this.tool!;
    if (tool.kind === 'brush') {
      this.continueStroke(tool, at);
    } else {
      tool.hover = this.snappedPoint(tool, at, e.shiftKey);
      this.updatePreview(tool);
    }
  }

  /** The pointer left the canvas: no rubber band, no brush outline. */
  private toolLeave(): void {
    const tool = this.tool;
    if (tool?.kind === 'brush') {
      if (tool.stroke) return;
      tool.pointer = undefined;
      this.canvas.renderTop();
    } else if (tool?.hover) {
      tool.hover = undefined;
      this.updatePreview(tool);
    }
  }

  /** Whether two points are on the same spot on screen, like the two clicks of a double click. */
  private samePlace(a: Point, b: Point, pixels = 4): boolean {
    return a.distanceFrom(b) * this.canvas.getZoom() < pixels;
  }

  /** Whether a click at this point closes the area: on its first corner, once it has three. */
  private closesArea(tool: PointTool, at: Point): boolean {
    return tool.kind === 'area' && tool.points.length >= MIN_AREA_POINTS && this.samePlace(tool.points[0], at, 10);
  }

  /** With Shift, a new segment snaps to 15° steps, like rotating. */
  private snappedPoint(tool: PointTool, at: Point, shift: boolean): Point {
    const last = tool.points.at(-1);
    if (!shift || !last) return at;
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(at.y - last.y, at.x - last.x) / step) * step;
    const length = last.distanceFrom(at);
    return new Point(last.x + Math.cos(angle) * length, last.y + Math.sin(angle) * length);
  }

  private addPoint(tool: PointTool, at: Point, shift: boolean): void {
    if (this.closesArea(tool, at)) {
      tool.hover = undefined;
      this.endTool();
      return;
    }
    const point = this.snappedPoint(tool, at, shift);
    const last = tool.points.at(-1);
    if ((last && this.samePlace(last, point)) || tool.points.length >= MAX_LINE_POINTS) return;
    tool.points.push(point);
    this.updatePreview(tool);
    this.emit();
  }

  private removeLastPoint(): void {
    const tool = this.pointTool();
    if (!tool || tool.points.length === 0) return;
    tool.points.pop();
    this.updatePreview(tool);
    this.emit();
  }

  /** Shows the line or area as it will look, with the rubber band to the pointer. */
  private updatePreview(tool: PointTool): void {
    const points = [...tool.points];
    const last = points.at(-1);
    const hover = tool.hover && !this.closesArea(tool, tool.hover) ? tool.hover : undefined;
    if (hover && last && !this.samePlace(last, hover)) points.push(hover);
    const coords = points.map((p): LinePoint => [p.x, p.y]);
    const { preview } = tool;
    if (points.length < 2) {
      if (preview) this.quietly(() => this.canvas.remove(preview));
      tool.preview = undefined;
    } else if (preview instanceof Pinstripe) {
      preview.setSpec({ ...this.lineStyle, points: coords });
    } else if (preview instanceof Area) {
      const { smooth, ...paint } = this.areaStyle;
      preview.set(paint);
      preview.setSpec({ points: coords, smooth });
    } else {
      const options = { selectable: false, evented: false };
      const { smooth, ...paint } = this.areaStyle;
      const created =
        tool.kind === 'line'
          ? new Pinstripe({ ...this.lineStyle, points: coords }, options)
          : new Area({ points: coords, smooth }, { ...options, ...paint });
      tagged(created).clip = 'paint';
      this.applyClip(created);
      tool.preview = created;
      this.quietly(() => this.canvas.insertAt(this.canvas.getObjects().indexOf(this.weatheringPlane), created));
    }
    this.canvas.requestRenderAll();
  }

  private finishPoints(tool: PointTool): Tagged | undefined {
    const { preview } = tool;
    if (!preview) return undefined;
    if (tool.points.length < (tool.kind === 'line' ? 2 : MIN_AREA_POINTS)) {
      this.quietly(() => this.canvas.remove(preview));
      return undefined;
    }
    preview.setPoints(tool.points.map((p): LinePoint => [p.x, p.y]));
    preview.set({ selectable: true, evented: true });
    this.register(preview, tool.kind, tool.kind === 'line' ? 'Zierlinie' : 'Fläche', 'paint');
    this.normalizeStack();
    this.changed();
    return preview;
  }

  private startStroke(tool: BrushTool, at: Point): void {
    const layer = tool.layerId ? this.find(tool.layerId) : undefined;
    const path: Tagged = new Path(strokePath([at]), {
      fill: '',
      stroke: this.brushStyle.color,
      strokeWidth: this.brushStyle.width,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      selectable: false,
      evented: false,
    });
    path.clip = layer?.clip ?? 'paint';
    this.applyClip(path);
    const objects = this.canvas.getObjects();
    // Right above its layer: layers on top cover the stroke just as they will afterwards.
    const index = layer ? objects.indexOf(layer) + 1 : objects.indexOf(this.weatheringPlane);
    this.quietly(() => this.canvas.insertAt(index, path));
    tool.pointer = at;
    tool.stroke = { points: [at], tip: at, path: path as Path };
    this.canvas.requestRenderAll();
  }

  private continueStroke(tool: BrushTool, at: Point): void {
    tool.pointer = at;
    const { stroke } = tool;
    if (stroke) {
      const zoom = this.canvas.getZoom();
      const tip = pullTip(stroke.tip, at, stringLength(this.brushStyle.smoothing) / zoom);
      stroke.tip = new Point(tip.x, tip.y);
      // Points closer than two screen pixels add weight, not shape.
      if (stroke.points.at(-1)!.distanceFrom(stroke.tip) * zoom >= 2) {
        stroke.points.push(stroke.tip);
        stroke.path._setPath(strokePath(stroke.points), true);
        stroke.path.setCoords();
        this.canvas.requestRenderAll();
        return;
      }
    }
    this.canvas.renderTop();
  }

  /** Moves the stroke into the session's layer; the first stroke creates the layer. */
  private finishStroke(tool: BrushTool): void {
    const { stroke } = tool;
    if (!stroke) return;
    tool.stroke = undefined;
    const path: Tagged = stroke.path;
    const index = this.canvas.getObjects().indexOf(path);
    this.quietly(() => this.canvas.remove(path));
    path.clipPath = undefined;
    delete path.clip;
    path.set({ selectable: true, evented: true });
    const layer = tool.layerId ? this.find(tool.layerId) : undefined;
    if (layer instanceof Group) {
      layer.add(path);
      layer.set('dirty', true);
      layer.setCoords();
      this.changed();
    } else {
      const group = new Group([path]);
      this.register(group, 'brush', 'Freihand', 'paint');
      this.canvas.insertAt(index, group);
      this.normalizeStack();
      tool.layerId = tagged(group).id;
    }
    this.canvas.requestRenderAll();
  }

  /** Point markers while drawing a line, the brush outline while painting; in screen pixels on the top canvas. */
  private drawToolOverlay(ctx: CanvasRenderingContext2D): void {
    const tool = this.tool;
    if (!tool) return;
    const { canvas } = this;
    const vpt = canvas.viewportTransform;
    const retina = canvas.getRetinaScaling();
    const circle = (p: Point, radius: number, fill?: string) => {
      const at = p.transform(vpt);
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(18, 22, 24, 0.6)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    };
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    if (tool.kind !== 'brush') {
      // The first corner of an area grows when a click on it would close the shape.
      const closing = tool.hover && this.closesArea(tool, tool.hover);
      tool.points.forEach((p, i) => circle(p, i === 0 && closing ? 7 : 4.5, i === 0 && closing ? ACCENT : '#ffffff'));
    } else if (tool.pointer) {
      const { stroke, pointer } = tool;
      if (stroke && stroke.tip.distanceFrom(pointer) > 0) {
        // The stabiliser's string, from the brush tip to the pointer.
        const a = stroke.tip.transform(vpt);
        const b = pointer.transform(vpt);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.stroke();
      }
      circle(stroke ? stroke.tip : pointer, Math.max(2, (this.brushStyle.width * canvas.getZoom()) / 2));
    }
    ctx.restore();
  }

  private quietly<T>(change: () => T): T {
    const restoring = this.restoring;
    this.restoring = true;
    try {
      return change();
    } finally {
      this.restoring = restoring;
    }
  }

  // ---- serialization and history ---------------------------------------------

  private serialize(o: Tagged): Record<string, unknown> {
    // A pattern image is rebuilt from its spec: serializing it would cost a data URL per
    // history step, and files must not carry images in fills anyway.
    const patterned: [Tagged, Tagged['fill']][] = [];
    eachObject(o, (node) => {
      if (node.fillSpec?.kind !== 'pattern') return;
      patterned.push([node, node.fill]);
      node.fill = fillColor(node.fillSpec);
    });
    const data = o.toObject() as Record<string, unknown>;
    for (const [node, fill] of patterned) node.fill = fill;
    delete data.clipPath;
    eachData(data, (d) => {
      // The arc of bent text is rebuilt from `textArc`.
      if (d.type === 'IText') delete d.path;
    });
    return data;
  }

  private restoreObjects(data: Record<string, unknown>[]): Promise<Tagged[]> {
    // Fabric drops a layer that fails to restore without a word; at least say which.
    const reviver = (serialized: Record<string, unknown>, _instance?: unknown, error?: unknown) => {
      if (error) console.error(`A ${String(serialized.type)} layer could not be restored`, error);
    };
    return util.enlivenObjects<FabricObject>(structuredClone(data), { reviver }).then((objects) => {
      for (const o of objects as Tagged[]) {
        // Designs saved before the windows band stored the clip as a boolean.
        const clip = o.clip as ClipMode | boolean | undefined;
        if (clip !== 'paint' && clip !== 'windows' && clip !== 'none') o.clip = clip === false ? 'none' : 'paint';
        this.applyClip(o);
        this.applyHitTesting(o);
        eachObject(o, (node) => {
          // A broken fill spec (from an older autosave, say) falls back to the stored colour.
          node.fillSpec = sanitizeFill(node.fillSpec);
          this.applyTextArc(node);
          this.applyFill(node);
        });
        if (!o.selectable) o.set({ evented: false });
      }
      return objects as Tagged[];
    });
  }

  private async replaceObjects(objects: Tagged[]): Promise<void> {
    this.restoring = true;
    try {
      this.canvas.discardActiveObject();
      this.canvas.remove(...this.userObjects());
      if (objects.length) this.canvas.add(...objects);
      this.normalizeStack();
      this.canvas.requestRenderAll();
    } finally {
      this.restoring = false;
    }
  }

  private serializeState(): string {
    return JSON.stringify({ look: this.look, objects: this.userObjects().map((o) => this.serialize(o)) });
  }

  private changed(): void {
    if (this.restoring) return;
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), COMMIT_DELAY_MS);
    this.emit();
  }

  private flushCommit(): void {
    if (this.commitTimer === undefined) return;
    clearTimeout(this.commitTimer);
    this.commitTimer = undefined;
    this.commit();
  }

  private commit(): void {
    this.commitTimer = undefined;
    if (!this.template) return;
    const state = this.serializeState();
    if (state === this.present) return;
    this.past.push(this.present);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.present = state;
    this.future = [];
    this.revision++;
    this.emit();
  }

  undo(): Promise<void> {
    if ((this.pointTool()?.points.length ?? 0) > 0) {
      this.removeLastPoint();
      return Promise.resolve();
    }
    return this.enqueue(async () => {
      this.flushCommit();
      const previous = this.past.pop();
      if (previous === undefined) return;
      this.future.push(this.present);
      await this.applyState(previous);
    });
  }

  redo(): Promise<void> {
    if (this.pointTool()) this.endTool();
    return this.enqueue(async () => {
      this.flushCommit();
      const next = this.future.pop();
      if (next === undefined) return;
      this.past.push(this.present);
      await this.applyState(next);
    });
  }

  private async applyState(state: string): Promise<void> {
    const { look, objects } = JSON.parse(state) as { look: Look; objects: Record<string, unknown>[] };
    this.present = state;
    this.look = look;
    this.cancelLook();
    this.composer.render(look, this.guideOpacity);
    await this.replaceObjects(await this.restoreObjects(objects));
    this.revision++;
    this.emit();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** The current design with its assets, for autosave and design files. */
  exportDesign(): DesignData | undefined {
    if (!this.template || !this.look) return undefined;
    const objects = this.userObjects().map((o) => {
      const data = this.serialize(o);
      eachData(data, (d) => {
        if (d.assetId) delete d.src;
      });
      return data;
    });
    const assets: Record<string, AssetSource> = {};
    for (const o of this.userObjects()) {
      eachObject(o, (node) => {
        const asset = node.assetId ? this.assets.get(node.assetId) : undefined;
        if (asset) assets[node.assetId!] = asset.source;
      });
    }
    return { version: 1, carId: this.template.vehicle.carId, look: this.look, objects, assets };
  }

  private async objectsFromDesign(design: DesignData): Promise<Tagged[]> {
    const urls = new Map<string, string>();
    for (const [id, source] of Object.entries(design.assets)) {
      const known = this.assets.get(id);
      if (known) {
        urls.set(id, known.url);
        continue;
      }
      try {
        const blob = source.kind === 'upload' ? await (await fetch(source.dataUrl)).blob() : await this.resolveAsset(source);
        this.registerAsset(source, blob, id);
        urls.set(id, this.assets.get(id)!.url);
      } catch (err) {
        console.warn(`Asset ${source.name} could not be restored`, err);
      }
    }
    // Images get their source back; an image whose asset is gone is left out, inside groups too.
    const resolve = (data: Record<string, unknown>): Record<string, unknown> | undefined => {
      const assetId = data.assetId as string | undefined;
      if (assetId && !urls.has(assetId)) return undefined;
      const resolved = assetId ? { ...data, src: urls.get(assetId) } : data;
      if (!Array.isArray(data.objects)) return resolved;
      const objects = (data.objects as Record<string, unknown>[]).map(resolve).filter((o) => o !== undefined);
      return objects.length > 0 ? { ...resolved, objects } : undefined;
    };
    return this.restoreObjects(design.objects.map(resolve).filter((o) => o !== undefined));
  }

  // ---- rendering ------------------------------------------------------------

  /** The livery texture at full resolution, without guide or selection. */
  renderTexture(): HTMLCanvasElement {
    if (this.lookFrame) {
      this.cancelLook();
      this.renderLook();
    }
    const { canvas } = this;
    const vpt = [...canvas.viewportTransform] as TMat2D;
    // A line or stroke in progress is not part of the livery yet.
    const drawing = this.toolObjects().filter((o) => o.visible);
    for (const o of drawing) o.visible = false;
    canvas.overlayImage = undefined;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    try {
      return canvas.toCanvasElement(1, { left: 0, top: 0, width: TEXTURE_SIZE, height: TEXTURE_SIZE });
    } finally {
      for (const o of drawing) o.visible = true;
      this.showGuide();
      canvas.setViewportTransform(vpt);
    }
  }

  // ---- viewport -------------------------------------------------------------

  private minZoom(): number {
    return (Math.min(this.canvas.width, this.canvas.height) / TEXTURE_SIZE) * 0.4;
  }

  fit(): void {
    const { width, height } = this.canvas;
    if (!width || !height) return;
    // Keep the texture clear of the floating zoom bar at the bottom.
    const margin = 20;
    const bottom = 64;
    const zoom = Math.min((width - 2 * margin) / TEXTURE_SIZE, (height - margin - bottom) / TEXTURE_SIZE);
    const x = (width - TEXTURE_SIZE * zoom) / 2;
    const y = margin + (height - margin - bottom - TEXTURE_SIZE * zoom) / 2;
    this.canvas.setViewportTransform([zoom, 0, 0, zoom, x, y]);
    this.fitted = true;
    this.emit();
  }

  /** Zooms around the viewport centre; 1 shows one texture pixel per screen pixel. */
  zoomTo(zoom: number): void {
    this.canvas.zoomToPoint(new Point(this.canvas.width / 2, this.canvas.height / 2), clamp(zoom, this.minZoom(), MAX_ZOOM));
    this.emit();
  }

  zoomBy(factor: number): void {
    this.zoomTo(this.canvas.getZoom() * factor);
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    const before = this.canvas.getVpCenter();
    this.canvas.setDimensions({ width, height });
    if (!this.fitted) {
      this.fit();
      return;
    }
    // Keep the same texture point in the middle of the view.
    const zoom = this.canvas.getZoom();
    this.canvas.setViewportTransform([zoom, 0, 0, zoom, width / 2 - before.x * zoom, height / 2 - before.y * zoom]);
    this.emit();
  }

  private bindCanvasEvents(): void {
    const { canvas } = this;
    canvas.on('object:added', () => this.changed());
    canvas.on('object:removed', () => this.changed());
    canvas.on('object:modified', ({ target }) => {
      // A patterned layer that was scaled or reshaped needs a pattern image of its new size.
      for (const o of target instanceof ActiveSelection ? target.getObjects() : [target]) {
        eachObject(o, (node) => {
          if (node.fillSpec?.kind === 'pattern') this.applyFill(node);
        });
      }
      this.changed();
    });
    canvas.on('text:changed', ({ target }) => {
      this.applyTextArc(target);
      this.applyFill(target);
      this.changed();
    });
    canvas.on('selection:created', () => this.emit());
    canvas.on('selection:updated', () => this.emit());
    canvas.on('selection:cleared', () => this.emit());
    canvas.on('object:rotating', ({ target, e }) => {
      if ((e as MouseEvent).shiftKey) target.set('angle', Math.round(target.angle / 15) * 15);
    });
    canvas.on('object:moving', ({ target, e }) => this.snapMoving(target, e));

    canvas.on('mouse:wheel', (opt: TPointerEventInfo<WheelEvent>) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const zoom = clamp(canvas.getZoom() * Math.pow(0.996, e.deltaY), this.minZoom(), MAX_ZOOM);
        canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      } else {
        canvas.relativePan(new Point(-e.deltaX, -e.deltaY));
      }
      this.emit();
    });

    canvas.on('mouse:down', (opt) => {
      const e = opt.e as MouseEvent;
      if (this.spaceDown || e.button === 1) {
        this.panFrom = { x: e.clientX, y: e.clientY };
        canvas.setCursor('grabbing');
      } else if (this.tool && e.button === 0) {
        this.toolDown(e, opt.scenePoint);
      }
    });
    canvas.on('mouse:move', (opt) => {
      const e = opt.e as MouseEvent;
      if (this.panFrom) {
        canvas.relativePan(new Point(e.clientX - this.panFrom.x, e.clientY - this.panFrom.y));
        this.panFrom = { x: e.clientX, y: e.clientY };
      } else if (this.tool) {
        this.toolMove(e, opt.scenePoint);
      }
    });
    canvas.on('mouse:up', () => {
      if (this.guides.length) {
        this.guides = [];
        canvas.requestRenderAll();
      }
      if (this.panFrom) {
        this.panFrom = undefined;
        canvas.setCursor(canvas.defaultCursor);
        this.emit();
      } else if (this.tool?.kind === 'brush') {
        this.finishStroke(this.tool);
      }
    });
    canvas.on('mouse:dblclick', () => {
      if (this.pointTool()) this.endTool();
    });
    canvas.on('mouse:out', ({ target }) => {
      if (!target) this.toolLeave();
    });
    canvas.on('after:render', ({ ctx }) => {
      // Exports render into contexts of their own and are left alone.
      if (ctx === canvas.contextTop) {
        if (this.tool) this.drawToolOverlay(ctx);
      } else if (ctx === canvas.getContext()) {
        this.drawGuides(ctx);
        // Every render of the visible canvas also refreshes the tool overlay, e.g. after zooming.
        if (this.tool) canvas.renderTop();
      }
    });
  }

  /** Snaps a layer being dragged to other layers, their mirror images and the centre line. */
  private snapMoving(target: FabricObject, e: TPointerEvent): void {
    this.guides = [];
    // Holding Ctrl moves freely.
    if (!this.snapping || e.ctrlKey || e.metaKey) return;
    const moving = new Set<FabricObject>(target instanceof ActiveSelection ? target.getObjects() : [target]);
    const others = this.userObjects()
      .filter((o) => o.visible && !moving.has(o))
      .map((o) => o.getBoundingRect());
    target.setCoords();
    const snap = snapBox(target.getBoundingRect(), others, {
      axis: this.mirrorAxis,
      tolerance: SNAP_DISTANCE / this.canvas.getZoom(),
      width: TEXTURE_SIZE,
    });
    if (snap.dx || snap.dy) {
      target.set({ left: target.left + snap.dx, top: target.top + snap.dy });
      target.setCoords();
    }
    this.guides = snap.guides;
  }

  /** Snap guides as thin screen-pixel lines with a dark halo, above everything else. */
  private drawGuides(ctx: CanvasRenderingContext2D): void {
    if (this.guides.length === 0) return;
    const vpt = this.canvas.viewportTransform;
    const retina = this.canvas.getRetinaScaling();
    // A one pixel line is crisp when it runs through pixel centres.
    const crisp = (v: number) => Math.round(v * retina) / retina + (retina % 2 === 1 ? 0.5 / retina : 0);
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    for (const guide of this.guides) {
      const a = new Point(guide.x1, guide.y1).transform(vpt);
      const b = new Point(guide.x2, guide.y2).transform(vpt);
      const horizontal = guide.y1 === guide.y2;
      ctx.beginPath();
      ctx.moveTo(horizontal ? a.x : crisp(a.x), horizontal ? crisp(a.y) : a.y);
      ctx.lineTo(horizontal ? b.x : crisp(b.x), horizontal ? crisp(b.y) : b.y);
      ctx.setLineDash(guide.kind === 'axis' ? [6, 4] : []);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(18, 22, 24, 0.5)';
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = GUIDE_COLORS[guide.kind];
      ctx.stroke();
    }
    ctx.restore();
  }

  private setPanMode(on: boolean): void {
    this.spaceDown = on;
    this.updateInteraction();
  }

  /** What a click on the canvas does: select, pan or draw. */
  private updateInteraction(): void {
    const { canvas } = this;
    const drawing = !!this.tool;
    canvas.skipTargetFind = this.spaceDown || drawing;
    canvas.selection = !this.spaceDown && !drawing;
    canvas.defaultCursor = this.spaceDown ? 'grab' : drawing ? 'crosshair' : 'default';
    canvas.setCursor(canvas.defaultCursor);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
    const active = this.canvas.getActiveObject();
    if (active instanceof IText && active.isEditing) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (this.tool && !mod && (key === 'enter' || key === 'escape')) {
      e.preventDefault();
      this.endTool();
      return;
    }
    if (this.pointTool() && !mod && (key === 'backspace' || key === 'delete')) {
      e.preventDefault();
      this.removeLastPoint();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.spaceDown) this.setPanMode(true);
    } else if (mod && key === 'z') {
      e.preventDefault();
      void (e.shiftKey ? this.redo() : this.undo());
    } else if (mod && key === 'y') {
      e.preventDefault();
      void this.redo();
    } else if (mod && key === 'd') {
      e.preventDefault();
      void this.duplicateSelected();
    } else if (mod && key === '0') {
      e.preventDefault();
      this.fit();
    } else if (!mod && (key === '+' || key === '=')) {
      this.zoomBy(1.25);
    } else if (!mod && key === '-') {
      this.zoomBy(0.8);
    } else if ((key === 'delete' || key === 'backspace') && active) {
      e.preventDefault();
      this.removeSelected();
    } else if (active && key.startsWith('arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      active.set({ left: active.left + dx, top: active.top + dy });
      active.setCoords();
      this.canvas.requestRenderAll();
      this.changed();
    } else if (key === 'escape' && active) {
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.spaceDown) this.setPanMode(false);
  };

  private onBlur = (): void => {
    if (this.spaceDown) this.setPanMode(false);
  };
}
