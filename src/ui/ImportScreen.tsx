import { useRef, useState, type DragEvent } from 'react';
import { FileArchive } from 'lucide-react';

const GUIDE_URL = 'https://mod.io/g/over-the-hill/r/official-livery-modding-guide';

interface Props {
  busy: boolean;
  error?: string;
  onImport: (file: Blob) => void;
}

export function ImportScreen({ busy, error, onImport }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [devError, setDevError] = useState<string>();

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onImport(file);
  };

  const loadFromProject = async () => {
    setDevError(undefined);
    const response = await fetch('/__dev/template-package.zip');
    if (!response.ok) {
      setDevError('Im Projektordner liegt kein Vorlagen-Zip.');
      return;
    }
    onImport(await response.blob());
  };

  return (
    <main className="import">
      <section className="import-card">
        <h1 className="wordmark">
          Livery Garage <span>für over the hill</span>
        </h1>
        <p className="import-lead">
          Gestalte eigene Lackierungen auf den offiziellen Vorlagen und schick sie direkt ins Spiel oder als Mod zu mod.io.
        </p>

        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-busy={busy}
        >
          {busy ? (
            <>
              <span className="spinner" />
              <p>Vorlagen werden gelesen …</p>
            </>
          ) : (
            <>
              <FileArchive size={30} strokeWidth={1.5} aria-hidden />
              <p>
                Zieh das offizielle Vorlagen-Paket hierher
                <br />
                <small>over_the_hill_Livery_Templates_Assets_Package.zip, ca. 100 MB</small>
              </p>
              <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
                Zip auswählen
              </button>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = '';
            }}
          />
        </div>

        {(error || devError) && (
          <p className="import-error" role="alert">
            {error ?? devError}
          </p>
        )}

        <p className="import-note">
          Das Paket bleibt in deinem Browser und wird nirgends hochgeladen. Den Download-Link findest du im{' '}
          <a href={GUIDE_URL} target="_blank" rel="noreferrer">
            offiziellen Livery-Guide
          </a>
          .
        </p>
        {import.meta.env.DEV && !busy && (
          <button type="button" className="btn btn-quiet dev-load" onClick={loadFromProject}>
            Paket aus dem Projektordner laden (nur Entwicklung)
          </button>
        )}
      </section>
      <footer className="import-footer">Fan-Projekt, nicht von Funselektor.</footer>
    </main>
  );
}
