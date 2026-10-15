/**
 * Reads the official livery template package (a zip of PSDs and sponsor logos).
 * Runs inside a Web Worker: parsing a 4096x4096 PSD takes about a second and a
 * few hundred MB, which would freeze the editor on the main thread.
 *
 * The package is licensed for over the hill modding only and must not be
 * redistributed, so every user imports their own copy and nothing leaves the browser.
 */
import JSZip from 'jszip';
import { initializeCanvas, readPsd, type Layer } from 'ag-psd';
import { classifyLayer } from './templateLayers.ts';
import { TEXTURE_SIZE, type CarTemplate, type LogoImage, type PackageIndex, type TemplateLayer } from './templateTypes.ts';
import { vehicleForTemplate } from './vehicles.ts';

// ag-psd creates canvases through these hooks; a worker has no document.
initializeCanvas(
  (width, height) => new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement,
  (width, height) => new ImageData(width, height),
);

let zip: JSZip | undefined;

const isJunk = (path: string) => path.startsWith('__MACOSX/') || /(^|\/)\./.test(path);
const fileName = (path: string) => path.split('/').pop() ?? path;

export async function openPackage(file: Blob): Promise<PackageIndex> {
  let opened: JSZip;
  try {
    opened = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Die Datei ist kein gültiges Zip-Archiv.');
  }
  const paths = Object.values(opened.files)
    .filter((f) => !f.dir && !isJunk(f.name))
    .map((f) => f.name);

  const templates = paths
    .filter((p) => /\.psd$/i.test(p))
    .map((path) => ({ path, vehicle: vehicleForTemplate(fileName(path)) }))
    .sort((a, b) => a.vehicle.tag.localeCompare(b.vehicle.tag));
  if (templates.length === 0) {
    throw new Error('Im Zip sind keine Vorlagen (PSD). Ist das das offizielle Livery-Templates-Paket?');
  }

  const logos = paths
    .filter((p) => /\.png$/i.test(p))
    .map((path) => {
      const parts = path.split('/');
      const folder = parts.length > 1 ? parts[parts.length - 2] : '';
      return {
        path,
        name: fileName(path).replace(/\.png$/i, '').replace(/_logo$/i, ''),
        source: folder.replace(/\s*sponsors?$/i, '') || 'Paket',
      };
    })
    .sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));

  zip = opened;
  return { templates, logos };
}

function entry(path: string): JSZip.JSZipObject {
  const found = zip?.file(path);
  if (!found) throw new Error(`"${path}" fehlt im Vorlagen-Paket.`);
  return found;
}

function flatten(layers: Layer[] | undefined, out: Layer[] = []): Layer[] {
  for (const layer of layers ?? []) {
    if (layer.children) flatten(layer.children, out);
    else out.push(layer);
  }
  return out;
}

function meanColour(img: ImageData): string {
  const sum = [0, 0, 0];
  let n = 0;
  // Every 4th pixel per axis is plenty for a swatch colour.
  for (let y = 0; y < img.height; y += 4) {
    for (let x = 0; x < img.width; x += 4) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] <= 127) continue;
      sum[0] += img.data[i];
      sum[1] += img.data[i + 1];
      sum[2] += img.data[i + 2];
      n++;
    }
  }
  if (n === 0) return '#000000';
  return '#' + sum.map((s) => Math.round(s / n).toString(16).padStart(2, '0')).join('');
}

export async function loadCar(path: string): Promise<CarTemplate> {
  const bytes = await entry(path).async('uint8array');
  let psd;
  try {
    psd = readPsd(bytes, { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  } catch (err) {
    throw new Error(`Die Vorlage ${fileName(path)} ist nicht lesbar: ${(err as Error).message}`, { cause: err });
  }
  const sx = TEXTURE_SIZE / psd.width;
  const sy = TEXTURE_SIZE / psd.height;

  const layers: TemplateLayer[] = [];
  flatten(psd.children).forEach((layer, index) => {
    const img = layer.imageData as ImageData | undefined;
    if (!img || img.width === 0 || img.height === 0) return;

    const source = new OffscreenCanvas(img.width, img.height);
    source.getContext('2d')!.putImageData(img, 0, 0);

    // Keep the scaled layer pixel-aligned to the texture grid and let drawImage
    // resample the sub-pixel remainder of odd PSD offsets.
    const left = (layer.left ?? 0) * sx;
    const top = (layer.top ?? 0) * sy;
    const x = Math.floor(left);
    const y = Math.floor(top);
    const target = new OffscreenCanvas(
      Math.ceil(left + img.width * sx) - x,
      Math.ceil(top + img.height * sy) - y,
    );
    const ctx = target.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, left - x, top - y, img.width * sx, img.height * sy);

    layers.push({
      name: layer.name ?? '',
      cls: classifyLayer(layer.name ?? '', index),
      hidden: layer.hidden ?? false,
      opacity: layer.opacity ?? 1,
      x,
      y,
      bitmap: target.transferToImageBitmap(),
      color: meanColour(img),
    });
  });
  return { path, vehicle: vehicleForTemplate(fileName(path)), layers };
}

/** Loads a sponsor logo cropped to its visible pixels (the PNGs carry wide transparent margins). */
export async function loadLogo(path: string): Promise<LogoImage> {
  const bitmap = await createImageBitmap(await entry(path).async('blob'));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`Das Logo ${fileName(path)} ist leer.`);

  const pad = 2;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(width, maxX + pad + 1) - cropX;
  const cropH = Math.min(height, maxY + pad + 1) - cropY;
  const cropped = new OffscreenCanvas(cropW, cropH);
  cropped.getContext('2d')!.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return { blob: await cropped.convertToBlob({ type: 'image/png' }), width: cropW, height: cropH };
}
