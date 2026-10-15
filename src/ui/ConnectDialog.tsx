import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Dialog } from './Dialog.tsx';

const EXPECTED = 'LocalLiveries';

interface Props {
  choose: () => Promise<FileSystemDirectoryHandle | undefined>;
  onConnected: (dir: FileSystemDirectoryHandle) => void;
  onClose: () => void;
}

export function ConnectDialog({ choose, onConnected, onClose }: Props) {
  const [picked, setPicked] = useState<FileSystemDirectoryHandle>();
  const [error, setError] = useState<string>();

  const pick = async () => {
    setError(undefined);
    try {
      const dir = await choose();
      if (!dir) return;
      if (dir.name.toLowerCase() === EXPECTED.toLowerCase()) onConnected(dir);
      else setPicked(dir);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog
      title="Spielordner verbinden"
      onClose={onClose}
      footer={
        picked ? (
          <>
            <button type="button" className="btn btn-quiet" onClick={() => onConnected(picked)}>
              Trotzdem verwenden
            </button>
            <button type="button" className="btn btn-primary" onClick={pick}>
              Anderen Ordner wählen
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Abbrechen
            </button>
            <button type="button" className="btn btn-primary" onClick={pick}>
              <FolderOpen size={16} aria-hidden /> Ordner auswählen
            </button>
          </>
        )
      }
    >
      {picked ? (
        <p className="warning" role="alert">
          Der gewählte Ordner heißt „{picked.name}“. Das Spiel liest lokale Lackierungen nur aus „{EXPECTED}“.
        </p>
      ) : (
        <>
          <p>Wähle den Ordner, aus dem over the hill lokale Lackierungen lädt:</p>
          <p className="path">C:\Users\&lt;Name&gt;\Documents\My Games\over the hill\{EXPECTED}</p>
          <p className="section-hint">
            Falls er noch fehlt, leg ihn dort selbst an. Danach schreibt der Editor jede Lackierung in einen eigenen Unterordner.
          </p>
          <p className="section-hint">
            Im Spiel: Garage, Tab „Livery Mods“, einmal „Show local mods“ drücken. Nach jeder Änderung reicht „Refresh local mods“.
            Lokale Lackierungen siehst nur du, deine Freunde nicht.
          </p>
        </>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
