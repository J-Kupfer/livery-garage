/**
 * Packages a livery the way the official modding guide expects:
 * manifest.json + texture PNG + icon PNG, zipped flat for mod.io, or as a plain
 * folder inside Documents\My Games\over the hill\LocalLiveries for local testing.
 */
export const ICON_SIZE = 512;

export interface LiveryFiles {
  carId: string;
  /** Display name in the garage. */
  name: string;
  texture: Blob;
  icon: Blob;
}

/** File names are derived from the car, so re-exports overwrite instead of piling up. */
export function liveryFileNames(carId: string) {
  const base = carId.toLowerCase();
  return { texture: `${base}.png`, icon: `${base}_preview.png`, folder: `livery-garage-${base}` };
}

export function manifestJson(liveries: Pick<LiveryFiles, 'carId' | 'name'>[]): string {
  return (
    JSON.stringify(
      {
        liveries: liveries.map(({ carId, name }) => {
          const files = liveryFileNames(carId);
          return { car: carId, name: name.trim() || carId, texture: files.texture, icon: files.icon };
        }),
      },
      null,
      2,
    ) + '\n'
  );
}

/** ASCII file name stem: the guide warns against spaces and non-ASCII characters. */
export function slugify(name: string): string {
  const slug = name
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || 'livery';
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG-Export fehlgeschlagen.'))), 'image/png'),
  );
}

/** Halves the image step by step: one big downscale in a single drawImage aliases. */
export function downscale(source: HTMLCanvasElement, size: number): HTMLCanvasElement {
  let current = source;
  while (current.width / 2 >= size) {
    const next = document.createElement('canvas');
    next.width = current.width / 2;
    next.height = current.height / 2;
    const ctx = next.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }
  if (current.width === size) return current;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, size, size);
  return out;
}

/** Square-crops an image to the icon size (used for custom icons such as in-game screenshots). */
export async function iconFromImage(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const square = document.createElement('canvas');
  square.width = side;
  square.height = side;
  square.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, side, side);
  bitmap.close();
  return downscale(square, ICON_SIZE);
}

export async function buildModZip(livery: LiveryFiles): Promise<Blob> {
  const files = liveryFileNames(livery.carId);
  // Only needed when exporting; keeps the zip library out of the initial bundle.
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('manifest.json', manifestJson([livery]));
  zip.file(files.texture, livery.texture);
  zip.file(files.icon, livery.icon);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

/** Writes the livery as its own pack folder; returns the folder name. */
export async function writeLocalLivery(liveriesDir: FileSystemDirectoryHandle, livery: LiveryFiles): Promise<string> {
  const files = liveryFileNames(livery.carId);
  const dir = await liveriesDir.getDirectoryHandle(files.folder, { create: true });
  // Textures first: the game must never see a manifest that points at missing files.
  await writeFile(dir, files.texture, livery.texture);
  await writeFile(dir, files.icon, livery.icon);
  await writeFile(dir, 'manifest.json', manifestJson([livery]));
  return files.folder;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
