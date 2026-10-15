import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Maximize2, Minus, Plus, Redo2, Send, Settings, Undo2 } from 'lucide-react';
import { LiveryEditor, type AssetSource, type DesignData, type EditorSnapshot } from '../editor/LiveryEditor.ts';
import { DESIGN_FILE_SUFFIX, parseDesign, serializeDesign } from '../lib/designFile.ts';
import { prepareUpload } from '../lib/images.ts';
import {
  ICON_SIZE,
  buildModZip,
  canvasToPng,
  downloadBlob,
  downscale,
  iconFromImage,
  slugify,
  writeLocalLivery,
  type LiveryFiles,
} from '../lib/modExport.ts';
import { idbDelete, idbGet, idbSet } from '../lib/storage.ts';
import type { TemplateClient } from '../lib/templateClient.ts';
import type { CarTemplate, PackageIndex } from '../lib/templateTypes.ts';
import { ConnectDialog } from './ConnectDialog.tsx';
import { ExportDialog } from './ExportDialog.tsx';
import { LayersPanel } from './LayersPanel.tsx';
import { LogoPicker } from './LogoPicker.tsx';
import { PaintPanel } from './PaintPanel.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { Toasts, useToasts } from './Toasts.tsx';
import { useGameFolder } from './useGameFolder.ts';

interface StoredDesign {
  design: DesignData;
  name: string;
  /** Custom garage icon (512 px PNG data URL). */
  icon?: string;
}

const designKey = (carId: string) => `design:${carId}`;
const TEMPLATE_CACHE_SIZE = 3;
const LAST_CAR_KEY = 'otl:lastCar';
const LIVE_SYNC_KEY = 'otl:liveSync';
const GUIDE_KEY = 'otl:guideOpacity';

const EMPTY_SNAPSHOT: EditorSnapshot = {
  layers: [],
  selection: [],
  guideOpacity: 0.6,
  zoom: 1,
  canUndo: false,
  canRedo: false,
  revision: 0,
};
const noSubscription = () => () => {};
const emptySnapshot = () => EMPTY_SNAPSHOT;

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Settings are a convenience; private mode may refuse them.
  }
}

function initialCar(index: PackageIndex): string {
  const last = readSetting(LAST_CAR_KEY);
  if (last && index.templates.some((t) => t.path === last)) return last;
  return (index.templates.find((t) => t.vehicle.carId === 'Protector') ?? index.templates[0]).path;
}

const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

interface Props {
  client: TemplateClient;
  index: PackageIndex;
  onForgetPackage: () => void;
}

export function EditorScreen({ client, index, onForgetPackage }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const designInput = useRef<HTMLInputElement>(null);
  const templates = useRef(new Map<string, CarTemplate>());
  const writing = useRef(false);

  const [editor, setEditor] = useState<LiveryEditor>();
  const snap = useSyncExternalStore(editor?.subscribe ?? noSubscription, editor?.getSnapshot ?? emptySnapshot);
  const { toasts, show: toast, dismiss } = useToasts();
  const folder = useGameFolder();

  const [carPath, setCarPath] = useState(() => initialCar(index));
  const [reloadToken, setReloadToken] = useState(0);
  const loadKey = `${carPath}#${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState<string>();
  const loading = loadedKey !== loadKey;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>();
  const [dialog, setDialog] = useState<'logo' | 'export' | 'connect'>();
  const [textureIcon, setTextureIcon] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveSync, setLiveSync] = useState(() => readSetting(LIVE_SYNC_KEY) === '1');
  const [sync, setSync] = useState<{ state: 'idle' | 'writing' | 'done' | 'error'; at?: Date }>({ state: 'idle' });

  const entry = index.templates.find((t) => t.path === carPath) ?? index.templates[0];
  const vehicle = entry.vehicle;

  useEffect(() => {
    const instance = new LiveryEditor(hostRef.current!, async (source: AssetSource) =>
      source.kind === 'package' ? (await client.loadLogo(source.path)).blob : (await fetch(source.dataUrl)).blob(),
    );
    const guide = Number(readSetting(GUIDE_KEY));
    if (readSetting(GUIDE_KEY) !== null && guide >= 0 && guide <= 1) instance.setGuideOpacity(guide);
    setEditor(instance);
    // Test seam for browser automation; dead code in production builds.
    if (import.meta.env.DEV) Object.assign(window, { __liveryEditor: instance });
    return () => instance.dispose();
  }, [client]);

  const loadTemplate = useCallback(
    async (path: string): Promise<CarTemplate> => {
      const cache = templates.current;
      const cached = cache.get(path);
      if (cached) {
        cache.delete(path);
        cache.set(path, cached);
        return cached;
      }
      const template = await client.loadCar(path);
      cache.set(path, template);
      return template;
    },
    [client],
  );

  const evictTemplates = useCallback((keep: string) => {
    const cache = templates.current;
    for (const [path, template] of cache) {
      if (cache.size <= TEMPLATE_CACHE_SIZE) break;
      if (path === keep) continue;
      for (const layer of template.layers) layer.bitmap.close();
      cache.delete(path);
    }
  }, []);

  // Show the selected car with its saved design.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    void (async () => {
      try {
        const [template, stored] = await Promise.all([
          loadTemplate(carPath),
          idbGet<StoredDesign>(designKey(vehicle.carId)).catch(() => undefined),
        ]);
        if (cancelled) return;
        await editor.loadCar(template, stored?.design);
        if (cancelled) return;
        setName(stored?.name ?? `${vehicle.tag} Custom`);
        setIcon(stored?.icon);
        writeSetting(LAST_CAR_KEY, carPath);
        evictTemplates(carPath);
      } catch (err) {
        if (!cancelled) toast((err as Error).message, 'error');
      } finally {
        if (!cancelled) setLoadedKey(loadKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, carPath, loadKey, vehicle, loadTemplate, evictTemplates, toast]);

  const persist = useCallback(
    async (liveryName: string, liveryIcon: string | undefined) => {
      const design = editor?.exportDesign();
      if (!design) return;
      await idbSet(designKey(design.carId), { design, name: liveryName, icon: liveryIcon } satisfies StoredDesign);
    },
    [editor],
  );

  // Autosave shortly after every change.
  useEffect(() => {
    if (!editor || loading || !snap.carId) return;
    const timer = setTimeout(() => void persist(name, icon).catch((err) => console.warn('Autosave failed', err)), 600);
    return () => clearTimeout(timer);
  }, [editor, loading, snap.carId, snap.revision, name, icon, persist]);

  // Save right away when the tab is hidden: the autosave timer may never fire after that.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !loading) void persist(name, icon).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [persist, loading, name, icon]);

  const switchCar = async (path: string) => {
    if (path === carPath) return;
    await persist(name, icon).catch((err) => console.warn('Save before switching failed', err));
    setCarPath(path);
  };

  const renderFiles = useCallback(async (): Promise<LiveryFiles> => {
    const texture = editor!.renderTexture();
    const [textureBlob, iconBlob] = await Promise.all([
      canvasToPng(texture),
      icon ? fetch(icon).then((r) => r.blob()) : canvasToPng(downscale(texture, ICON_SIZE)),
    ]);
    return { carId: vehicle.carId, name: name.trim() || vehicle.tag, texture: textureBlob, icon: iconBlob };
  }, [editor, icon, name, vehicle]);

  const writeTo = useCallback(
    async (dir: FileSystemDirectoryHandle, silent: boolean) => {
      if (writing.current) return;
      writing.current = true;
      setSync({ state: 'writing' });
      try {
        await writeLocalLivery(dir, await renderFiles());
        setSync({ state: 'done', at: new Date() });
        if (!silent) toast('Gesendet. Im Spiel unter „Livery Mods“ auf „Refresh local mods“ drücken.');
      } catch (err) {
        setSync({ state: 'error' });
        toast(`Schreiben in den Spielordner fehlgeschlagen: ${(err as Error).message}`, 'error');
      } finally {
        writing.current = false;
      }
    },
    [renderFiles, toast],
  );

  const sendToGame = async () => {
    if (folder.state === 'disconnected' || !folder.handle) {
      setDialog('connect');
      return;
    }
    // requestPermission needs the click's user activation, so it runs before any other await.
    const dir = folder.state === 'ready' ? folder.handle : await folder.ensureAccess();
    if (!dir) {
      toast('Ohne Zugriff auf den Ordner kann der Editor nichts ins Spiel schreiben.', 'error');
      return;
    }
    await writeTo(dir, false);
  };

  // Live sync: keep the LocalLiveries copy current while editing.
  useEffect(() => {
    if (!liveSync || folder.state !== 'ready' || !folder.handle || loading || !snap.carId) return;
    const dir = folder.handle;
    const timer = setTimeout(() => void writeTo(dir, true), 1200);
    return () => clearTimeout(timer);
  }, [liveSync, folder.state, folder.handle, loading, snap.carId, snap.revision, name, icon, writeTo]);

  const toggleLive = (on: boolean) => {
    setLiveSync(on);
    writeSetting(LIVE_SYNC_KEY, on ? '1' : '0');
    if (on && folder.state === 'needs-permission') void folder.ensureAccess();
  };

  const openExport = () => {
    if (!editor) return;
    setTextureIcon(downscale(editor.renderTexture(), 256).toDataURL('image/png'));
    setDialog('export');
  };

  const downloadZip = async () => {
    try {
      const zip = await buildModZip(await renderFiles());
      downloadBlob(zip, `${slugify(name)}.zip`);
      setDialog(undefined);
      toast('Zip gespeichert. Jetzt auf mod.io hochladen und den Fahrzeug-Tag setzen.');
    } catch (err) {
      toast(`Export fehlgeschlagen: ${(err as Error).message}`, 'error');
    }
  };

  const chooseIcon = async (file: File | null) => {
    if (!file) {
      setIcon(undefined);
      return;
    }
    try {
      setIcon((await iconFromImage(file)).toDataURL('image/png'));
    } catch {
      toast('Das Bild lässt sich nicht als Icon verwenden.', 'error');
    }
  };

  const uploadImage = async (file: File) => {
    if (!editor) return;
    try {
      const { blob, dataUrl } = await prepareUpload(file);
      const imageName = file.name.replace(/\.[^.]+$/, '') || 'Bild';
      await editor.addImage(blob, { kind: 'upload', dataUrl, name: imageName }, 'image');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const saveDesignFile = () => {
    const design = editor?.exportDesign();
    if (!design) return;
    downloadBlob(new Blob([serializeDesign({ design, name })], { type: 'application/json' }), `${slugify(name)}${DESIGN_FILE_SUFFIX}`);
  };

  const loadDesignFile = async (file: File) => {
    try {
      const { design, name: fileName } = parseDesign(await file.text(), new Set(index.logos.map((l) => l.path)));
      const target = index.templates.find((t) => t.vehicle.carId.toLowerCase() === design.carId.toLowerCase());
      if (!target) throw new Error(`Das Design ist für „${design.carId}“, dieses Auto gibt es im Vorlagen-Paket nicht.`);
      if (!window.confirm(`Das ersetzt dein aktuelles Design für den ${target.vehicle.tag}. Fortfahren?`)) return;
      await persist(name, icon).catch(() => undefined);
      await idbSet(designKey(target.vehicle.carId), { design, name: fileName ?? `${target.vehicle.tag} Custom` } satisfies StoredDesign);
      if (target.path === carPath) setReloadToken((t) => t + 1);
      else setCarPath(target.path);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const resetDesign = async () => {
    if (!window.confirm(`Alle Ebenen und Farben für den ${vehicle.tag} verwerfen?`)) return;
    await idbDelete(designKey(vehicle.carId));
    setReloadToken((t) => t + 1);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.settings')) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const busy = !editor || loading;
  const syncLabel =
    sync.state === 'writing'
      ? 'Wird gesendet …'
      : sync.state === 'done' && sync.at
        ? `Gesendet ${timeFormat.format(sync.at)}`
        : sync.state === 'error'
          ? 'Senden fehlgeschlagen'
          : folder.state === 'needs-permission'
            ? 'Zugriff erneut erlauben'
            : '';

  return (
    <div className="editor">
      <header className="topbar">
        <h1 className="wordmark wordmark-small">Livery Garage</h1>

        <label className="topbar-field">
          <span>Auto</span>
          <select className="input select" value={carPath} onChange={(e) => void switchCar(e.target.value)} disabled={busy}>
            {index.templates.map((t) => (
              <option key={t.path} value={t.path}>
                {t.vehicle.tag}
                {t.vehicle.known ? '' : ' (unbekannt)'}
              </option>
            ))}
          </select>
        </label>
        <label className="topbar-field topbar-name">
          <span>Name im Spiel</span>
          <input
            className="input"
            value={name}
            maxLength={60}
            placeholder="Name im Spiel"
            title="Name der Lackierung in der Garage"
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>

        <div className="topbar-group" role="group" aria-label="Verlauf">
          <button type="button" className="icon-btn" onClick={() => void editor?.undo()} disabled={!snap.canUndo} aria-label="Rückgängig" title="Rückgängig (Strg + Z)">
            <Undo2 size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={() => void editor?.redo()} disabled={!snap.canRedo} aria-label="Wiederholen" title="Wiederholen (Strg + Shift + Z)">
            <Redo2 size={18} />
          </button>
        </div>

        <span className="spacer" />

        <button type="button" className="btn btn-quiet" onClick={openExport} disabled={busy}>
          <Download size={16} aria-hidden /> Als Mod exportieren
        </button>

        <div className="send">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void sendToGame()}
            disabled={busy || folder.state === 'unsupported' || sync.state === 'writing'}
            title={folder.state === 'unsupported' ? 'Geht nur in Chrome oder Edge. Exportier stattdessen ein Zip.' : 'In den LocalLiveries-Ordner schreiben'}
          >
            <Send size={16} aria-hidden /> Ins Spiel senden
          </button>
          {(folder.state === 'ready' || folder.state === 'needs-permission') && (
            <label className="live-toggle" title="Nach jeder Änderung automatisch senden">
              <input type="checkbox" role="switch" className="switch" checked={liveSync} onChange={(e) => toggleLive(e.target.checked)} />
              Live
            </label>
          )}
          {syncLabel && <span className={`sync-status${sync.state === 'error' ? ' is-error' : ''}`}>{syncLabel}</span>}
        </div>

        <div className="settings">
          <button type="button" className="icon-btn" aria-label="Weitere Aktionen" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <Settings size={18} />
          </button>
          {menuOpen && (
            <div className="menu menu-right" role="menu" onClick={() => setMenuOpen(false)}>
              <button type="button" role="menuitem" onClick={saveDesignFile} disabled={busy}>
                Design als Datei speichern
              </button>
              <button type="button" role="menuitem" onClick={() => designInput.current?.click()} disabled={busy}>
                Design aus Datei laden
              </button>
              <button type="button" role="menuitem" onClick={() => void resetDesign()} disabled={busy}>
                Design zurücksetzen
              </button>
              <hr />
              {folder.handle && (
                <button type="button" role="menuitem" onClick={() => void folder.disconnect()}>
                  Spielordner trennen ({folder.handle.name})
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => window.confirm('Vorlagen-Paket aus dem Browser entfernen? Deine Designs bleiben erhalten.') && onForgetPackage()}>
                Vorlagen-Paket entfernen
              </button>
            </div>
          )}
          <input
            ref={designInput}
            type="file"
            accept={`${DESIGN_FILE_SUFFIX},application/json`}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadDesignFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <PaintPanel
        parts={snap.parts}
        look={snap.look}
        guideOpacity={snap.guideOpacity}
        onZone={(zone, look) => editor?.setZone(zone, look)}
        onWheels={(variant) => editor?.setWheels(variant)}
        onGuide={(opacity) => {
          editor?.setGuideOpacity(opacity);
          writeSetting(GUIDE_KEY, String(opacity));
        }}
      />

      <main className="workspace">
        <div className="canvas-host" ref={hostRef} />
        {loading && (
          <div className="canvas-loading" aria-live="polite">
            <span className="spinner" />
            <span>{vehicle.tag} wird geladen …</span>
          </div>
        )}
        <div className="zoom-bar" role="group" aria-label="Zoom">
          <button type="button" className="icon-btn" onClick={() => editor?.zoomBy(0.8)} aria-label="Verkleinern">
            <Minus size={16} />
          </button>
          <button type="button" className="zoom-value" onClick={() => editor?.zoomTo(1)} title="Auf 100 % (1 Pixel der Textur pro Bildschirmpixel)">
            {Math.round(snap.zoom * 100)} %
          </button>
          <button type="button" className="icon-btn" onClick={() => editor?.zoomBy(1.25)} aria-label="Vergrößern">
            <Plus size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => editor?.fit()} aria-label="Ganze Vorlage zeigen" title="Ganze Vorlage zeigen (Strg + 0)">
            <Maximize2 size={15} />
          </button>
        </div>
      </main>

      <aside className="panel panel-right">
        {editor && (
          <>
            <LayersPanel
              editor={editor}
              layers={snap.layers}
              selection={snap.selection}
              disabled={busy}
              onPickLogo={() => setDialog('logo')}
              onUpload={(file) => void uploadImage(file)}
            />
            <PropertiesPanel editor={editor} selected={snap.selected} selectionCount={snap.selection.length} layers={snap.layers} />
          </>
        )}
      </aside>

      {dialog === 'logo' && editor && (
        <LogoPicker
          logos={index.logos}
          load={(path) => client.loadLogo(path)}
          onClose={() => setDialog(undefined)}
          onPick={(logo, image) => {
            setDialog(undefined);
            void editor.addImage(image.blob, { kind: 'package', path: logo.path, name: logo.name }, 'logo');
          }}
        />
      )}
      {dialog === 'export' && (
        <ExportDialog
          vehicle={vehicle}
          name={name}
          onName={setName}
          icon={icon}
          textureIcon={textureIcon}
          onIcon={(file) => void chooseIcon(file)}
          onDownload={downloadZip}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'connect' && (
        <ConnectDialog
          choose={folder.choose}
          onClose={() => setDialog(undefined)}
          onConnected={(dir) => {
            setDialog(undefined);
            void writeTo(dir, false);
          }}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
      <div className="small-screen">Der Editor braucht ein breiteres Fenster (mindestens 1000 Pixel).</div>
    </div>
  );
}
