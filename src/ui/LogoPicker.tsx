import { useEffect, useState } from 'react';
import type { LogoImage, LogoEntry } from '../lib/templateTypes.ts';
import { Dialog } from './Dialog.tsx';

interface Props {
  logos: LogoEntry[];
  load: (path: string) => Promise<LogoImage>;
  onPick: (logo: LogoEntry, image: LogoImage) => void;
  onClose: () => void;
}

// Thumbnails survive closing the picker; the logos never change during a session.
const thumbnails = new Map<string, { image: LogoImage; url: string }>();

export function LogoPicker({ logos, load, onPick, onClose }: Props) {
  const [, setLoaded] = useState(0);
  const sources = [...new Set(logos.map((l) => l.source))];
  const [source, setSource] = useState(sources[0]);

  useEffect(() => {
    let cancelled = false;
    for (const logo of logos) {
      if (thumbnails.has(logo.path)) continue;
      void load(logo.path)
        .then((image) => {
          thumbnails.set(logo.path, { image, url: URL.createObjectURL(image.blob) });
          if (!cancelled) setLoaded((n) => n + 1);
        })
        .catch((err) => console.warn(`Logo ${logo.name} failed`, err));
    }
    return () => {
      cancelled = true;
    };
  }, [logos, load]);

  return (
    <Dialog title="Logo einfügen" onClose={onClose} wide>
      {sources.length > 1 && (
        <div className="segmented tabs" role="tablist">
          {sources.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={s === source} aria-pressed={s === source} onClick={() => setSource(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <ul className="logo-grid">
        {logos
          .filter((l) => l.source === source)
          .map((logo) => {
            const thumb = thumbnails.get(logo.path);
            return (
              <li key={logo.path}>
                <button type="button" className="logo-tile" disabled={!thumb} onClick={() => thumb && onPick(logo, thumb.image)} title={logo.name}>
                  {thumb ? <img src={thumb.url} alt={logo.name} /> : <span className="spinner spinner-small" />}
                </button>
              </li>
            );
          })}
      </ul>
      <p className="dialog-note">Die Sponsor-Logos stammen aus dem offiziellen Vorlagen-Paket und dürfen nur in Mods für over the hill genutzt werden.</p>
    </Dialog>
  );
}
