import { useRef, useState } from 'react';
import { Check, Copy, ImageUp, RotateCcw } from 'lucide-react';
import type { Vehicle } from '../lib/vehicles.ts';
import { Dialog } from './Dialog.tsx';

const MODIO_URL = 'https://mod.io/g/over-the-hill';

interface Props {
  vehicle: Vehicle;
  name: string;
  onName: (name: string) => void;
  /** Custom icon as data URL; without one the icon is the scaled-down texture. */
  icon?: string;
  textureIcon?: string;
  onIcon: (file: File | null) => void;
  onDownload: () => Promise<void>;
  onClose: () => void;
}

export function ExportDialog({ vehicle, name, onName, icon, textureIcon, onIcon, onDownload, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);

  const download = async () => {
    setBusy(true);
    try {
      await onDownload();
    } finally {
      setBusy(false);
    }
  };

  const copyTag = async () => {
    await navigator.clipboard.writeText(vehicle.tag);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Dialog
      title="Als Mod exportieren"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>
            {busy ? 'Zip wird erstellt …' : 'Zip herunterladen'}
          </button>
        </>
      }
    >
      <div className="export-grid">
        <div className="field-stack">
          <label className="field-label" htmlFor="export-name">
            Name im Spiel
          </label>
          <input id="export-name" className="input" value={name} maxLength={60} onChange={(e) => onName(e.target.value)} />
          <label className="field-label">Icon in der Garage</label>
          <p className="section-hint">Am schönsten ist ein Screenshot aus dem Spiel. Ohne eigenes Bild nimmt das Spiel die Textur.</p>
          <div className="icon-actions">
            <button type="button" className="btn btn-quiet" onClick={() => iconInput.current?.click()}>
              <ImageUp size={15} aria-hidden /> Eigenes Bild
            </button>
            {icon && (
              <button type="button" className="btn btn-quiet" onClick={() => onIcon(null)}>
                <RotateCcw size={15} aria-hidden /> Textur verwenden
              </button>
            )}
            <input
              ref={iconInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onIcon(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <div className="icon-preview">{(icon ?? textureIcon) && <img src={icon ?? textureIcon} alt="Vorschau des Icons" />}</div>
      </div>

      <h3 className="group-title">So kommt die Lackierung zu deinen Freunden</h3>
      <ol className="steps">
        <li>Lade das Zip herunter.</li>
        <li>
          Öffne{' '}
          <a href={MODIO_URL} target="_blank" rel="noreferrer">
            over the hill auf mod.io
          </a>{' '}
          und wähle „Add mod“. Titel, Beschreibung und ein Vorschaubild eintragen.
        </li>
        <li>
          Lade das Zip als Mod-Datei hoch und setze den Fahrzeug-Tag{' '}
          <button type="button" className="tag-copy" onClick={copyTag} title="Tag kopieren">
            {vehicle.tag}
            {copied ? <Check size={13} aria-label="kopiert" /> : <Copy size={13} aria-hidden />}
          </button>
          . Ohne den Tag findet man die Mod im Spiel nicht über den Fahrzeugfilter.
        </li>
        <li>Veröffentlichen, im Spiel abonnieren und in der Garage auswählen. Im Multiplayer sehen deine Freunde sie automatisch.</li>
      </ol>
    </Dialog>
  );
}
