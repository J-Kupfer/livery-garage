import { TEXTURE_SIZE } from './templateTypes.ts';

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export interface PreparedImage {
  blob: Blob;
  dataUrl: string;
}

function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Das Bild lässt sich nicht öffnen.'));
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Normalises an uploaded image to a PNG no larger than the texture: anything bigger
 * would only cost memory, since the livery itself is 2048 px.
 */
export async function prepareUpload(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Bitte wähle eine Bilddatei (PNG, JPG, WebP oder SVG).');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Das Bild ist größer als 30 MB.');
  const img = await decode(file);
  // SVGs without width/height report 0; give them a sensible size.
  const width = img.naturalWidth || 1024;
  const height = img.naturalHeight || 1024;
  const scale = Math.min(1, TEXTURE_SIZE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Das Bild lässt sich nicht umwandeln.'))), 'image/png'),
  );
  return { blob, dataUrl: await toDataUrl(blob) };
}
