import { useRef, useState, type DragEvent } from 'react';
import { Download, FileArchive } from 'lucide-react';

const GUIDE_URL = 'https://mod.io/g/over-the-hill/r/official-livery-modding-guide';
// The file the official guide links to (as of 2026-10-15). If Funselektor replaces it,
// the guide link in the note below still leads to the current one.
const TEMPLATE_DOWNLOAD_URL = 'https://drive.google.com/file/d/1OpPvbBMt0BfWtaGPjOJ2EZZSwvpurqtJ/view?usp=sharing';

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

        <ol className="import-steps">
          <li className="import-step">
            <div className="import-step-body">
              <h2>Vorlagen-Paket herunterladen</h2>
              <p>Die offizielle Datei von Funselektor liegt auf Google Drive, etwa 100 MB. Du brauchst sie nur einmal.</p>
              <a className="btn btn-quiet" href={TEMPLATE_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                <Download size={16} aria-hidden /> Von Google Drive herunterladen
              </a>
            </div>
          </li>
          <li className="import-step">
            <div className="import-step-body">
              <h2>Paket in den Editor laden</h2>
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
                    <FileArchive size={28} strokeWidth={1.5} aria-hidden />
                    <p>
                      Zip hierher ziehen
                      <br />
                      <small>
                        over_the_hill_<wbr />Livery_<wbr />Templates_<wbr />Assets_<wbr />Package.zip
                      </small>
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
            </div>
          </li>
        </ol>

        {(error || devError) && (
          <p className="import-error" role="alert">
            {error ?? devError}
          </p>
        )}

        <p className="import-note">
          Das Paket bleibt in deinem Browser und wird nirgends hochgeladen. Falls der Download nicht mehr klappt, steht der
          aktuelle Link im{' '}
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
