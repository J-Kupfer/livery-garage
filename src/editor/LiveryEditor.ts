/**
 * The livery canvas: the car template as fixed background and overlay, with the
 * user's layers (logos, images, text, shapes) in between as Fabric objects.
 *
 * Fabric objects are the single source of truth for layers. React reads a derived,
 * immutable snapshot through subscribe/getSnapshot (useSyncExternalStore).
 */
import {
  Canvas,
  Ellipse,
  FabricImage,
  FabricObject,
  IText,
  InteractiveFabricObject,
  Point,
  Rect,
  config,
  filters,
  util,
  type TMat2D,
  type TPointerEventInfo,
} from 'fabric';
import { TemplateComposer, defaultLook, type CarParts, type Look, type ZoneLook } from '../lib/composition.ts';
import type { PaintZone } from '../lib/templateLayers.ts';
import { TEXTURE_SIZE, type CarTemplate } from '../lib/templateTypes.ts';

export type LayerKind = 'logo' | 'image' | 'text' | 'shape';

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
  clip: boolean;
}

/** Editable properties of the selected layer, as shown in the properties panel. */
export interface LayerProps {
  id: string;
  kind: LayerKind;
  name: string;
  opacity: number;
  clip: boolean;
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
  /** Solid recolour of a logo or image, or undefined for the original colours. */
  tint?: string;
}

export type LayerPatch = Partial<Omit<LayerProps, 'id' | 'kind' | 'tint'>> & { tint?: string | null };

export interface EditorSnapshot {
  carId?: string;
  parts?: CarParts;
  look?: Look;
  /** Top-most layer first. */
  layers: LayerInfo[];
  selection: string[];
  selected?: LayerProps;
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
  clip: boolean;
  assetId?: string;
}
type Tagged = FabricObject & Partial<Tags>;
const tagged = (o: FabricObject) => o as Tagged;

const MAX_ZOOM = 16;
const HISTORY_LIMIT = 100;
const COMMIT_DELAY_MS = 300;
const ACCENT = '#f2b632';
const SHAPE_FILL = '#d9572b';

FabricObject.customProperties = ['id', 'layerName', 'kind', 'clip', 'assetId'];
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
  private readonly overlayImage: FabricImage;
  private readonly exportOverlayImage: FabricImage;

  private readonly assets = new Map<string, { source: AssetSource; url: string }>();
  private past: string[] = [];
  private future: string[] = [];
  private present = '';
  private commitTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private restoring = false;
  private queue: Promise<unknown> = Promise.resolve();
  private fitted = false;

  private spaceDown = false;
  private panFrom?: { x: number; y: number };

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
    this.overlayImage = plane(this.composer.overlayWithGuide);
    this.exportOverlayImage = plane(this.composer.overlay);

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
          clip: !!o.clip,
        }))
        .reverse(),
      selection: active.map((o) => o.id!).filter(Boolean),
      selected: single ? this.propsOf(single) : undefined,
      guideOpacity: this.guideOpacity,
      zoom: this.canvas.getZoom(),
      canUndo: this.past.length > 0,
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
      clip: !!o.clip,
      flipX: o.flipX,
      flipY: o.flipY,
      angle: Math.round(o.angle),
    };
    if (o instanceof FabricImage) {
      const tint = o.filters.find((f) => f instanceof filters.BlendColor);
      props.tint = tint?.color;
    } else {
      props.fill = typeof o.fill === 'string' ? o.fill : undefined;
      props.stroke = typeof o.stroke === 'string' ? o.stroke : undefined;
      props.strokeWidth = o.strokeWidth;
    }
    if (o instanceof IText) {
      props.text = o.text;
      props.fontFamily = o.fontFamily;
      props.fontWeight = String(o.fontWeight);
      props.fontStyle = o.fontStyle;
      props.charSpacing = o.charSpacing;
    }
    return props;
  }

  // ---- template and look ----------------------------------------------------

  /** Shows a car and restores its design, or starts a blank one with the factory look. */
  loadCar(template: CarTemplate, design?: DesignData): Promise<void> {
    return this.enqueue(async () => {
      this.flushCommit();
      this.template = template;
      this.parts = this.composer.setTemplate(template);
      this.look = design?.look ?? defaultLook(this.parts);
      this.composer.render(this.look, this.guideOpacity);
      this.canvas.backgroundImage = this.backgroundImage;
      this.canvas.overlayImage = this.overlayImage;
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
    this.renderLook();
  }

  setWheels(variant: number): void {
    if (!this.look) return;
    this.look = { ...this.look, wheels: variant };
    this.renderLook();
  }

  setGuideOpacity(opacity: number): void {
    this.guideOpacity = opacity;
    this.composer.renderGuide(opacity);
    this.canvas.requestRenderAll();
    this.emit();
  }

  private renderLook(): void {
    if (!this.look) return;
    this.composer.render(this.look, this.guideOpacity);
    // The paint mask may have changed shape (some cars have variants with different panels).
    for (const o of this.userObjects()) if (o.clip) o.set('dirty', true);
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

  private place(o: Tagged, kind: LayerKind, name: string): void {
    const center = this.canvas.getVpCenter();
    Object.assign(o, {
      id: crypto.randomUUID(),
      layerName: name && this.nextName(name),
      kind,
      clip: true,
    } satisfies Tags);
    o.set({ left: center.x, top: center.y });
    this.applyClip(o);
    this.canvas.add(o);
    this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
  }

  async addImage(blob: Blob, source: AssetSource, kind: 'logo' | 'image'): Promise<void> {
    const assetId = this.registerAsset(source, blob);
    const image = (await FabricImage.fromURL(this.assets.get(assetId)!.url)) as Tagged & FabricImage;
    image.assetId = assetId;
    const target = Math.min(kind === 'logo' ? 520 : 900, this.visibleWidth() * 0.4);
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
    const active = this.canvas.getActiveObjects() as Tagged[];
    if (active.length !== 1) return Promise.resolve();
    return this.enqueue(async () => {
      const [copy] = await this.restoreObjects([this.serialize(active[0])]);
      copy.id = crypto.randomUUID();
      if (active[0].layerName) copy.layerName = this.nextName(active[0].layerName);
      copy.set({ left: copy.left + 24, top: copy.top + 24 });
      const index = this.canvas.getObjects().indexOf(active[0]);
      this.canvas.insertAt(index + 1, copy);
      this.canvas.setActiveObject(copy);
      this.canvas.requestRenderAll();
    });
  }

  /** Moves a layer to a position in the panel order (0 = top-most). */
  moveLayer(id: string, panelIndex: number): void {
    const o = this.find(id);
    if (!o) return;
    const objects = this.userObjects();
    const offset = this.canvas.getObjects().indexOf(objects[0]);
    const target = clamp(objects.length - 1 - panelIndex, 0, objects.length - 1);
    this.canvas.moveObjectTo(o, offset + target);
    this.canvas.requestRenderAll();
    this.changed();
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
    const { name, clip, tint, ...rest } = patch;
    if (name !== undefined) o.layerName = name;
    if (clip !== undefined) {
      o.clip = clip;
      this.applyClip(o);
    }
    if (tint !== undefined && o instanceof FabricImage) {
      o.filters = tint ? [new filters.BlendColor({ color: tint, mode: 'tint', alpha: 1 })] : [];
      o.applyFilters();
    }
    if (Object.keys(rest).length > 0) {
      o.set(rest);
      if (o instanceof IText) o.initDimensions();
    }
    o.set('dirty', true);
    o.setCoords();
    this.canvas.requestRenderAll();
    this.changed();
  }

  private find(id: string): Tagged | undefined {
    return this.userObjects().find((o) => o.id === id);
  }

  private applyClip(o: Tagged): void {
    o.clipPath = o.clip
      ? new FabricImage(this.composer.paintMask, {
          left: TEXTURE_SIZE / 2,
          top: TEXTURE_SIZE / 2,
          absolutePositioned: true,
          objectCaching: false,
          excludeFromExport: true,
        })
      : undefined;
    o.set('dirty', true);
  }

  private registerAsset(source: AssetSource, blob: Blob, id: string = crypto.randomUUID()): string {
    this.assets.set(id, { source, url: URL.createObjectURL(blob) });
    return id;
  }

  // ---- serialization and history ---------------------------------------------

  private serialize(o: Tagged): Record<string, unknown> {
    const data = o.toObject() as Record<string, unknown>;
    delete data.clipPath;
    return data;
  }

  private restoreObjects(data: Record<string, unknown>[]): Promise<Tagged[]> {
    return util.enlivenObjects<FabricObject>(structuredClone(data)).then((objects) => {
      for (const o of objects as Tagged[]) {
        this.applyClip(o);
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
    return this.enqueue(async () => {
      this.flushCommit();
      const previous = this.past.pop();
      if (previous === undefined) return;
      this.future.push(this.present);
      await this.applyState(previous);
    });
  }

  redo(): Promise<void> {
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
      if (o.assetId) delete data.src;
      return data;
    });
    const assets: Record<string, AssetSource> = {};
    for (const o of this.userObjects()) {
      const asset = o.assetId ? this.assets.get(o.assetId) : undefined;
      if (asset) assets[o.assetId!] = asset.source;
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
    const objects = design.objects.filter((o) => !o.assetId || urls.has(o.assetId as string));
    return this.restoreObjects(objects.map((o) => (o.assetId ? { ...o, src: urls.get(o.assetId as string) } : o)));
  }

  // ---- rendering ------------------------------------------------------------

  /** The livery texture at full resolution, without guide or selection. */
  renderTexture(): HTMLCanvasElement {
    const { canvas } = this;
    const vpt = [...canvas.viewportTransform] as TMat2D;
    canvas.overlayImage = this.exportOverlayImage;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    try {
      return canvas.toCanvasElement(1, { left: 0, top: 0, width: TEXTURE_SIZE, height: TEXTURE_SIZE });
    } finally {
      canvas.overlayImage = this.overlayImage;
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
    canvas.on('object:modified', () => this.changed());
    canvas.on('text:changed', () => this.changed());
    canvas.on('selection:created', () => this.emit());
    canvas.on('selection:updated', () => this.emit());
    canvas.on('selection:cleared', () => this.emit());
    canvas.on('object:rotating', ({ target, e }) => {
      if ((e as MouseEvent).shiftKey) target.set('angle', Math.round(target.angle / 15) * 15);
    });

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
      if (!this.spaceDown && e.button !== 1) return;
      this.panFrom = { x: e.clientX, y: e.clientY };
      canvas.setCursor('grabbing');
    });
    canvas.on('mouse:move', (opt) => {
      if (!this.panFrom) return;
      const e = opt.e as MouseEvent;
      canvas.relativePan(new Point(e.clientX - this.panFrom.x, e.clientY - this.panFrom.y));
      this.panFrom = { x: e.clientX, y: e.clientY };
    });
    canvas.on('mouse:up', () => {
      if (!this.panFrom) return;
      this.panFrom = undefined;
      canvas.setCursor(this.spaceDown ? 'grab' : 'default');
      this.emit();
    });

    canvas.on('after:render', ({ ctx }) => {
      // Thin frame around the texture so its edge stays visible on the dark workspace.
      const vpt = canvas.viewportTransform;
      ctx.save();
      ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
      ctx.lineWidth = 1 / canvas.getZoom();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.strokeRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      ctx.restore();
    });
  }

  private setPanMode(on: boolean): void {
    this.spaceDown = on;
    this.canvas.skipTargetFind = on;
    this.canvas.selection = !on;
    this.canvas.defaultCursor = on ? 'grab' : 'default';
    this.canvas.setCursor(this.canvas.defaultCursor);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
    const active = this.canvas.getActiveObject();
    if (active instanceof IText && active.isEditing) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

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
