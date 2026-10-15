import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDecalFonts } from '../lib/fonts.ts';
import { idbDelete, idbGet, idbSet } from '../lib/storage.ts';
import { TemplateClient } from '../lib/templateClient.ts';
import type { PackageIndex } from '../lib/templateTypes.ts';
import { EditorScreen } from './EditorScreen.tsx';
import { ImportScreen } from './ImportScreen.tsx';

const client = new TemplateClient();
const PACKAGE_KEY = 'package';

type Phase =
  | { kind: 'booting' }
  | { kind: 'import'; busy: boolean; error?: string }
  | { kind: 'ready'; index: PackageIndex };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'booting' });
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const [stored] = await Promise.all([idbGet<Blob>(PACKAGE_KEY).catch(() => undefined), loadDecalFonts()]);
      if (!stored) {
        setPhase({ kind: 'import', busy: false });
        return;
      }
      try {
        setPhase({ kind: 'ready', index: await client.open(stored) });
      } catch (err) {
        setPhase({ kind: 'import', busy: false, error: (err as Error).message });
      }
    })();
  }, []);

  const importPackage = useCallback(async (file: Blob) => {
    setPhase({ kind: 'import', busy: true });
    try {
      const index = await client.open(file);
      // Remember the package so it does not have to be picked again; if the browser
      // refuses the 100 MB (private mode, quota), the editor still works for this visit.
      await idbSet(PACKAGE_KEY, file).catch((err) => console.warn('Template package not stored', err));
      setPhase({ kind: 'ready', index });
    } catch (err) {
      setPhase({ kind: 'import', busy: false, error: (err as Error).message });
    }
  }, []);

  const forgetPackage = useCallback(async () => {
    await idbDelete(PACKAGE_KEY).catch(() => undefined);
    setPhase({ kind: 'import', busy: false });
  }, []);

  if (phase.kind === 'booting') {
    return (
      <div className="splash" aria-busy="true">
        <span className="spinner" />
      </div>
    );
  }
  if (phase.kind === 'import') {
    return <ImportScreen busy={phase.busy} error={phase.error} onImport={importPackage} />;
  }
  return <EditorScreen client={client} index={phase.index} onForgetPackage={forgetPackage} />;
}
