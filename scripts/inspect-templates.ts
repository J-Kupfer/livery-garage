/**
 * Prints how every PSD in the official template package is structured and how
 * the editor classifies its layers. Run it after Funselektor ships a new package
 * to spot layers the classifier does not understand.
 *
 *   npm run inspect-templates -- [path/to/package.zip]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { initializeCanvas, readPsd, type Layer } from 'ag-psd';
import { classifyLayer } from '../src/lib/templateLayers.ts';
import { vehicleForTemplate } from '../src/lib/vehicles.ts';

// Node has no canvas; with useImageData ag-psd only needs plain pixel buffers.
initializeCanvas(
  () => {
    throw new Error('ag-psd asked for a canvas although useImageData is set');
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
);

const root = resolve(import.meta.dirname, '..');
const zipPath =
  process.argv[2] ?? readdirSync(root).filter((f) => /Livery_Templates.*\.zip$/i.test(f)).map((f) => join(root, f))[0];
if (!zipPath) throw new Error('No template package found. Pass the zip path as argument.');

const zip = await JSZip.loadAsync(readFileSync(zipPath));
const psdEntries = Object.values(zip.files).filter((f) => !f.dir && /\.psd$/i.test(f.name));
const anomalies: string[] = [];

function flatten(layers: Layer[] | undefined, out: Layer[] = []): Layer[] {
  for (const layer of layers ?? []) {
    if (layer.children) {
      anomalies.push(`group "${layer.name}" found (groups are flattened)`);
      flatten(layer.children, out);
    } else out.push(layer);
  }
  return out;
}

/** Alpha > 127 inside the canvas, as one byte per canvas pixel. */
function solidMask(layer: Layer, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const img = layer.imageData;
  if (!img) return mask;
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  for (let y = 0; y < img.height; y++) {
    const cy = y + top;
    if (cy < 0 || cy >= h) continue;
    for (let x = 0; x < img.width; x++) {
      const cx = x + left;
      if (cx < 0 || cx >= w) continue;
      if (img.data[(y * img.width + x) * 4 + 3] > 127) mask[cy * w + cx] = 1;
    }
  }
  return mask;
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] & b[i]) inter++;
    if (a[i] | b[i]) union++;
  }
  return union === 0 ? 1 : inter / union;
}

function colourStats(layer: Layer) {
  const d = layer.imageData?.data;
  if (!d) return { solid: 0, soft: 0, mean: [0, 0, 0], std: 0 };
  let n = 0;
  let soft = 0;
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a > 0 && a < 255) soft++;
    if (a <= 127) continue;
    n++;
    for (let c = 0; c < 3; c++) {
      sum[c] += d[i + c];
      sq[c] += d[i + c] * d[i + c];
    }
  }
  const mean = sum.map((s) => (n ? s / n : 0));
  const std = Math.max(...sq.map((s, c) => (n ? Math.sqrt(Math.max(0, s / n - mean[c] ** 2)) : 0)));
  return { solid: n, soft, mean: mean.map(Math.round), std: Math.round(std * 10) / 10 };
}

for (const entry of psdEntries.sort((a, b) => a.name.localeCompare(b.name))) {
  const fileName = entry.name.split('/').pop()!;
  const vehicle = vehicleForTemplate(fileName);
  const psd = readPsd(await entry.async('uint8array'), {
    useImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const { width: w, height: h } = psd;
  console.log(`\n${fileName} -> ${vehicle.carId}${vehicle.known ? '' : ' (UNKNOWN VEHICLE)'}  ${w}x${h}`);
  if (!vehicle.known) anomalies.push(`${fileName}: vehicle not in mod.io tag list`);

  const layers = flatten(psd.children);
  const firstOfZone = new Map<string, Uint8Array>();
  layers.forEach((layer, index) => {
    const cls = classifyLayer(layer.name ?? '', index);
    const label = cls.role === 'paint' ? `paint:${cls.zone}` : cls.role;
    const s = colourStats(layer);
    const flags = [
      layer.hidden ? 'hidden' : 'visible',
      layer.blendMode && layer.blendMode !== 'normal' ? `blend=${layer.blendMode}` : '',
      layer.opacity !== undefined && layer.opacity < 1 ? `opacity=${layer.opacity.toFixed(2)}` : '',
      layer.clipping ? 'CLIPPING' : '',
      layer.mask ? 'MASK' : '',
      layer.effects ? `EFFECTS(${Object.keys(layer.effects).join(',')})` : '',
    ].filter(Boolean);
    let shape = '';
    if (cls.role === 'paint') {
      const mask = solidMask(layer, w, h);
      const first = firstOfZone.get(cls.zone);
      if (first) {
        const overlap = iou(first, mask);
        shape = `iou=${overlap.toFixed(3)}`;
        if (overlap < 0.98) anomalies.push(`${fileName}: "${layer.name}" differs in shape from the first ${cls.zone} variant (iou ${overlap.toFixed(3)})`);
      } else firstOfZone.set(cls.zone, mask);
    }
    if (cls.role === 'base' && s.solid < w * h * 0.99) anomalies.push(`${fileName}: base layer "${layer.name}" is not a full opaque fill`);
    if (layer.blendMode && !['normal', 'pass through'].includes(layer.blendMode)) anomalies.push(`${fileName}: "${layer.name}" uses blend mode ${layer.blendMode}`);
    if (layer.clipping || layer.mask || layer.effects) anomalies.push(`${fileName}: "${layer.name}" has ${flags.slice(3).join(' ')}`);
    const bbox = `${layer.left},${layer.top} ${(layer.right ?? 0) - (layer.left ?? 0)}x${(layer.bottom ?? 0) - (layer.top ?? 0)}`;
    console.log(
      `  ${String(index).padStart(2)} ${JSON.stringify(layer.name).padEnd(16)} ${label.padEnd(12)} ${flags.join(' ').padEnd(16)} bbox=${bbox.padEnd(20)} solid=${String(s.solid).padStart(8)} soft=${String(s.soft).padStart(6)} mean=${s.mean.join(',').padEnd(12)} std=${String(s.std).padEnd(5)} ${shape}`,
    );
  });
}

console.log(`\n${anomalies.length} anomalies`);
for (const a of anomalies) console.log(`  - ${a}`);
