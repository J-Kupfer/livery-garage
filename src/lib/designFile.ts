/**
 * Design files let friends share their work. A design file is untrusted input:
 * it is validated so it can only produce the layer types the editor itself
 * creates, and can never make the browser fetch anything from the network.
 */
import type { AssetSource, DesignData } from '../editor/LiveryEditor.ts';
import { ZONE_ORDER, type Look, type ZoneGradient } from './composition.ts';
import { sanitizeFill } from './fills.ts';
import { sanitizeArea, sanitizeLine } from './lines.ts';
import { sanitizePattern } from './patterns.ts';
import { sanitizeSticker } from './stickers.ts';
import { sanitizeWeathering } from './weathering.ts';

export const DESIGN_FILE_SUFFIX = '.livery.json';

const OBJECT_TYPES = new Set(['image', 'itext', 'rect', 'ellipse', 'path', 'pinstripe', 'area', 'group']);
/** What a sticker group may contain: its badge shape and its text. */
const STICKER_PARTS = new Set(['circle', 'rect', 'text']);
/** Path commands as Fabric stores them (absolute), with their number of coordinates. */
const PATH_COMMANDS = new Map([
  ['M', 2],
  ['L', 2],
  ['Q', 4],
  ['C', 6],
  ['Z', 0],
]);
const MAX_PATH_COMMANDS = 20000;
const MAX_BRUSH_STROKES = 2000;
/** Groups may hold groups, but not without end. */
const MAX_GROUP_DEPTH = 4;
const MAX_GROUP_LAYERS = 200;
const HEX = /^#[0-9a-f]{6}$/i;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const index = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);

/** Plain colours and gradients only: Fabric patterns (`type: 'pattern'`) load an image from a URL. */
function safePaint(v: unknown): boolean {
  if (v === undefined || v === null || typeof v === 'string') return true;
  return (
    isRecord(v) &&
    (v.type === 'linear' || v.type === 'radial') &&
    !('source' in v) &&
    Array.isArray(v.colorStops) &&
    v.colorStops.every((stop) => isRecord(stop) && typeof stop.offset === 'number' && typeof stop.color === 'string' && stop.color.length < 32)
  );
}

function sanitizeZoneGradient(v: unknown): ZoneGradient | undefined {
  if (!isRecord(v) || typeof v.from !== 'string' || typeof v.to !== 'string' || !HEX.test(v.from) || !HEX.test(v.to)) return undefined;
  return { from: v.from.toLowerCase(), to: v.to.toLowerCase(), direction: v.direction === 'length' ? 'length' : 'height' };
}

function sanitizeLook(look: Record<string, unknown>): Look {
  const zones: Look['zones'] = {};
  const given = isRecord(look.zones) ? look.zones : {};
  for (const zone of ZONE_ORDER) {
    const z = given[zone];
    if (!isRecord(z)) continue;
    const color = typeof z.color === 'string' && HEX.test(z.color) ? z.color : undefined;
    const pattern = sanitizePattern(z.pattern);
    const gradient = sanitizeZoneGradient(z.gradient);
    zones[zone] = { variant: index(z.variant), ...(color && { color }), ...(pattern && { pattern }), ...(gradient && { gradient }) };
  }
  const weathering = sanitizeWeathering(look.weathering);
  return { zones, wheels: index(look.wheels), ...(weathering && { weathering }) };
}

function validPath(path: unknown): boolean {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    path.length <= MAX_PATH_COMMANDS &&
    path.every(
      (command) =>
        Array.isArray(command) &&
        PATH_COMMANDS.get(command[0]) === command.length - 1 &&
        command.slice(1).every((n) => typeof n === 'number' && Number.isFinite(n)),
    )
  );
}

/** A line is rebuilt from its points and style; the stored path is not needed. */
function validLine(o: Record<string, unknown>): boolean {
  const spec = sanitizeLine(o.lineSpec);
  if (!spec || o.kind !== 'line') return false;
  o.lineSpec = spec;
  delete o.path;
  return true;
}

/** Only the editor's own image filters: removing white and recolouring. */
function validImageFilters(o: Record<string, unknown>): boolean {
  if (o.filters === undefined) return true;
  if (!Array.isArray(o.filters)) return false;
  o.filters = o.filters.filter(
    (f) => isRecord(f) && (f.type === 'WhiteToAlpha' || (f.type === 'BlendColor' && typeof f.color === 'string' && HEX.test(f.color))),
  );
  return true;
}

/** A free area is rebuilt from its points as well. */
function validArea(o: Record<string, unknown>): boolean {
  const spec = sanitizeArea(o.areaSpec);
  if (!spec || o.kind !== 'area') return false;
  o.areaSpec = spec;
  delete o.path;
  return true;
}

/** A freehand layer is a group of plain stroked paths. */
function validBrush(o: Record<string, unknown>): boolean {
  return (
    Array.isArray(o.objects) &&
    o.objects.length <= MAX_BRUSH_STROKES &&
    o.objects.every(
      (stroke) => isRecord(stroke) && String(stroke.type).toLowerCase() === 'path' && validPath(stroke.path) && safePaint(stroke.fill) && safePaint(stroke.stroke),
    )
  );
}

function validSticker(o: Record<string, unknown>): boolean {
  const spec = sanitizeSticker(o.stickerSpec);
  if (!spec || o.kind !== 'sticker' || !Array.isArray(o.objects)) return false;
  o.stickerSpec = spec;
  return o.objects.every((part) => isRecord(part) && STICKER_PARTS.has(String(part.type).toLowerCase()) && safePaint(part.fill) && safePaint(part.stroke));
}

function validAsset(v: unknown): v is AssetSource {
  if (!isRecord(v) || typeof v.name !== 'string') return false;
  if (v.kind === 'package') return typeof v.path === 'string';
  if (v.kind === 'upload') return typeof v.dataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v.dataUrl);
  return false;
}

/**
 * Checks one layer, and the layers inside a group, against what the editor itself
 * creates, and cleans it up: no image sources, clip paths or stored text paths.
 */
function validObject(o: unknown, assets: Record<string, AssetSource>, depth: number): o is Record<string, unknown> {
  if (!isRecord(o)) return false;
  const type = String(o.type ?? '').toLowerCase();
  if (!OBJECT_TYPES.has(type)) return false;
  let valid: boolean;
  if (type === 'image') valid = typeof o.assetId === 'string' && o.assetId in assets && validImageFilters(o);
  else if (type === 'group') valid = o.kind === 'group' ? validGroup(o, assets, depth) : o.kind === 'brush' ? validBrush(o) : validSticker(o);
  else if (type === 'pinstripe' && !validLine(o)) valid = false;
  else if (type === 'area' && !validArea(o)) valid = false;
  else if (type === 'path' && !validPath(o.path)) valid = false;
  else valid = safePaint(o.fill) && safePaint(o.stroke);
  if (!valid) return false;

  delete o.src;
  delete o.clipPath;
  // Gradients and patterns are rebuilt from the spec; a broken one falls back to the plain colour.
  const fill = sanitizeFill(o.fillSpec);
  if (fill) o.fillSpec = fill;
  else delete o.fillSpec;
  // Bent text is rebuilt from its bend; a stored path is never needed.
  if (type === 'itext') {
    delete o.path;
    if (typeof o.textArc === 'number' && Number.isFinite(o.textArc)) o.textArc = Math.max(-100, Math.min(100, o.textArc));
    else delete o.textArc;
  }
  return true;
}

/** A group of layers: each of them is checked like a layer of its own. */
function validGroup(o: Record<string, unknown>, assets: Record<string, AssetSource>, depth: number): boolean {
  if (depth >= MAX_GROUP_DEPTH || !Array.isArray(o.objects) || o.objects.length > MAX_GROUP_LAYERS) return false;
  o.objects = o.objects.filter((child) => validObject(child, assets, depth + 1));
  return (o.objects as unknown[]).length > 0;
}

/** A design as saved to a file: the editor's design data plus the livery name. */
export interface DesignFile {
  design: DesignData;
  name?: string;
}

export function serializeDesign({ design, name }: DesignFile): string {
  return JSON.stringify({ ...design, name }, null, 1);
}

/** Returns the design, or throws an Error with a message for the user. */
export function parseDesign(text: string, knownPackagePaths: ReadonlySet<string>): DesignFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges Design (kein JSON).');
  }
  if (!isRecord(data) || data.version !== 1 || typeof data.carId !== 'string' || !isRecord(data.look)) {
    throw new Error('Die Datei ist kein Livery-Garage-Design.');
  }
  if (!Array.isArray(data.objects) || !isRecord(data.assets)) throw new Error('Das Design ist unvollständig.');

  const assets: Record<string, AssetSource> = {};
  for (const [id, asset] of Object.entries(data.assets)) {
    if (!validAsset(asset)) continue;
    if (asset.kind === 'package' && !knownPackagePaths.has(asset.path)) continue;
    assets[id] = asset;
  }

  const objects = data.objects.filter((o) => validObject(o, assets, 0));

  if (!isRecord(data.look.zones) || typeof data.look.wheels !== 'number') throw new Error('Das Design ist unvollständig.');
  return {
    design: { version: 1, carId: data.carId, look: sanitizeLook(data.look), objects, assets },
    name: typeof data.name === 'string' ? data.name.slice(0, 60) : undefined,
  };
}
