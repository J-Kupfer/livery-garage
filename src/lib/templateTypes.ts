/**
 * Data shapes shared by the template worker and the editor. Kept free of runtime
 * dependencies so importing them does not pull the PSD parser into the main bundle.
 */
import type { LayerClass } from './templateLayers.ts';
import type { Vehicle } from './vehicles.ts';

/** Edge length of the exported livery texture; the game ships its skins at 2048x2048. */
export const TEXTURE_SIZE = 2048;

export interface TemplateEntry {
  path: string;
  vehicle: Vehicle;
}

export interface LogoEntry {
  path: string;
  name: string;
  /** Where the logo comes from, e.g. "art of rally". */
  source: string;
}

export interface PackageIndex {
  templates: TemplateEntry[];
  logos: LogoEntry[];
}

export interface TemplateLayer {
  name: string;
  cls: LayerClass;
  /** Visibility in the PSD; picks the default colour, wheel and roof variants. */
  hidden: boolean;
  opacity: number;
  /** Top-left corner in texture pixels. */
  x: number;
  y: number;
  bitmap: ImageBitmap;
  /** Mean colour of the layer's opaque pixels as #rrggbb, shown as variant swatch. */
  color: string;
}

export interface CarTemplate {
  path: string;
  vehicle: Vehicle;
  /** Bottom-most layer first. */
  layers: TemplateLayer[];
}

export interface LogoImage {
  blob: Blob;
  width: number;
  height: number;
}

export type WorkerRequest =
  | { id: number; method: 'open'; file: Blob }
  | { id: number; method: 'loadCar'; path: string }
  | { id: number; method: 'loadLogo'; path: string };

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
