import '@fontsource/archivo-black/400.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/racing-sans-one/400.css';
import '@fontsource/righteous/400.css';
import '@fontsource/saira-stencil-one/400.css';
import '@fontsource/shrikhand/400.css';

/** Typefaces offered for text layers: period-fitting lettering for 60s-80s off-roaders. */
export const DECAL_FONTS = [
  { family: 'Bebas Neue', weight: 400 },
  { family: 'Barlow Condensed', weight: 700 },
  { family: 'Archivo Black', weight: 400 },
  { family: 'Racing Sans One', weight: 400 },
  { family: 'Saira Stencil One', weight: 400 },
  { family: 'Righteous', weight: 400 },
  { family: 'Shrikhand', weight: 400 },
  { family: 'Permanent Marker', weight: 400 },
] as const;

export const DEFAULT_DECAL_FONT = DECAL_FONTS[0].family;

export function fontWeightFor(family: string): number {
  return DECAL_FONTS.find((f) => f.family === family)?.weight ?? 400;
}

/** Fabric measures text when it is created, so fonts must be ready before the first text layer. */
export function loadDecalFonts(): Promise<unknown> {
  return Promise.all(DECAL_FONTS.map((f) => document.fonts.load(`${f.weight} 64px "${f.family}"`)));
}
