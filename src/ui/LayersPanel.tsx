import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Brush,
  Circle,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Hash,
  Image,
  Lock,
  LockOpen,
  PanelTop,
  RectangleHorizontal,
  Shapes,
  Spline,
  Square,
  Sticker,
  Type,
  Upload,
} from 'lucide-react';
import type { LayerInfo, LayerKind, LiveryEditor } from '../editor/LiveryEditor.ts';
import { DEFAULT_DECAL_FONT } from '../lib/fonts.ts';

const KIND_ICON: Record<LayerKind, typeof Type> = {
  logo: Sticker,
  image: Image,
  text: Type,
  shape: Shapes,
  flames: Flame,
  sticker: Hash,
  line: Spline,
  brush: Brush,
};

interface Props {
  editor: LiveryEditor;
  layers: LayerInfo[];
  selection: string[];
  disabled: boolean;
  onPickLogo: () => void;
  onUpload: (file: File) => void;
}

export function LayersPanel({ editor, layers, selection, disabled, onPickLogo, onUpload }: Props) {
  const upload = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<'shapes' | 'stickers'>();
  const [renaming, setRenaming] = useState<string>();
  const [drag, setDrag] = useState<{ id: string; over?: number }>();
  const barRef = useRef<HTMLDivElement>(null);
  const hasWindowLayers = layers.some((l) => l.clip === 'windows');

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMenu(undefined);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const pick = (add: () => void) => {
    add();
    setMenu(undefined);
  };

  /** Drop slot `slot` means "before the row with that index" (layers.length = after the last). */
  const drop = (slot: number) => {
    if (!drag) return;
    const from = layers.findIndex((l) => l.id === drag.id);
    const to = slot > from ? slot - 1 : slot;
    if (from !== -1 && to !== from) editor.moveLayer(drag.id, to);
    setDrag(undefined);
  };

  return (
    <section className="panel-section layers" aria-label="Ebenen">
      <div className="add-bar" role="toolbar" aria-label="Ebene hinzufügen" ref={barRef}>
        <button type="button" className="add-btn" onClick={onPickLogo} disabled={disabled}>
          <Sticker size={18} aria-hidden />
          Logo
        </button>
        <button type="button" className="add-btn" onClick={() => editor.addText(DEFAULT_DECAL_FONT)} disabled={disabled}>
          <Type size={18} aria-hidden />
          Text
        </button>
        <div className="menu-anchor">
          <button
            type="button"
            className="add-btn"
            aria-haspopup="menu"
            aria-expanded={menu === 'shapes'}
            onClick={() => setMenu((m) => (m === 'shapes' ? undefined : 'shapes'))}
            disabled={disabled}
          >
            <Shapes size={18} aria-hidden />
            Form
          </button>
          {menu === 'shapes' && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => pick(() => editor.addShape('stripe'))}>
                <RectangleHorizontal size={16} aria-hidden /> Streifen
              </button>
              <button type="button" role="menuitem" onClick={() => pick(() => editor.addShape('rect'))}>
                <RectangleHorizontal size={16} aria-hidden /> Rechteck
              </button>
              <button type="button" role="menuitem" onClick={() => pick(() => editor.addShape('circle'))}>
                <Circle size={16} aria-hidden /> Kreis
              </button>
              <button type="button" role="menuitem" onClick={() => pick(() => editor.addFlames())}>
                <Flame size={16} aria-hidden /> Flammen
              </button>
              <hr />
              <button type="button" role="menuitem" onClick={() => pick(() => editor.startLine())}>
                <Spline size={16} aria-hidden /> Zierlinie zeichnen
              </button>
              <button type="button" role="menuitem" onClick={() => pick(() => editor.startBrush())}>
                <Brush size={16} aria-hidden /> Freihand malen
              </button>
            </div>
          )}
        </div>
        <div className="menu-anchor">
          <button
            type="button"
            className="add-btn"
            aria-haspopup="menu"
            aria-expanded={menu === 'stickers'}
            onClick={() => setMenu((m) => (m === 'stickers' ? undefined : 'stickers'))}
            disabled={disabled}
          >
            <Hash size={18} aria-hidden />
            Sticker
          </button>
          {menu === 'stickers' && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => pick(() => editor.addSticker('circle'))}>
                <Circle size={16} aria-hidden /> Startnummer rund
              </button>
              <button type="button" role="menuitem" onClick={() => pick(() => editor.addSticker('plate'))}>
                <Square size={16} aria-hidden /> Startnummer Schild
              </button>
              <button type="button" role="menuitem" onClick={() => pick(() => editor.addSticker('banner'))}>
                <PanelTop size={16} aria-hidden /> Sonnenblende
              </button>
              <button type="button" role="menuitem" onClick={() => pick(() => void editor.addCheckeredFlag())}>
                <Flag size={16} aria-hidden /> Zielflagge
              </button>
            </div>
          )}
        </div>
        <button type="button" className="add-btn" onClick={() => upload.current?.click()} disabled={disabled}>
          <Upload size={18} aria-hidden />
          Bild
        </button>
        <input
          ref={upload}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      <h2 className="section-title">
        Ebenen <span className="count">{layers.length || ''}</span>
      </h2>
      {layers.length === 0 ? (
        <p className="empty">Noch keine Ebenen. Füge oben ein Logo, einen Text, eine Form oder ein eigenes Bild hinzu.</p>
      ) : (
        <ol className="layer-list" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(drag?.over ?? layers.length)}>
          {layers.map((layer, index) => {
            const Icon = KIND_ICON[layer.kind];
            const selected = selection.includes(layer.id);
            // Window layers always sit above the glass, so they form their own group at the top.
            const groupStart = hasWindowLayers && (index === 0 || (layer.clip !== 'windows' && layers[index - 1].clip === 'windows'));
            return (
              <Fragment key={layer.id}>
                {groupStart && (
                  <li className="layer-group" aria-hidden>
                    {layer.clip === 'windows' ? 'Auf den Scheiben' : 'Auf dem Lack'}
                  </li>
                )}
              <li
                className={[
                  'layer-row',
                  selected && 'is-selected',
                  !layer.visible && 'is-hidden',
                  drag?.over === index && 'drop-before',
                  drag?.over === layers.length && index === layers.length - 1 && 'drop-after',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={renaming !== layer.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ id: layer.id });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const slot = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
                  setDrag((d) => (d && d.over !== slot ? { ...d, over: slot } : d));
                }}
                onDragEnd={() => setDrag(undefined)}
                onClick={() => editor.select(layer.id)}
              >
                <Icon size={15} className="layer-kind" aria-hidden />
                {renaming === layer.id ? (
                  <input
                    className="input layer-name-input"
                    defaultValue={layer.name}
                    autoFocus
                    aria-label="Ebenenname"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      editor.rename(layer.id, e.target.value);
                      setRenaming(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(undefined);
                    }}
                  />
                ) : (
                  <span className="layer-name" onDoubleClick={() => setRenaming(layer.id)} title="Doppelklick zum Umbenennen">
                    {layer.name}
                  </span>
                )}
                <button
                  type="button"
                  className="icon-btn icon-btn-small"
                  aria-label={layer.visible ? `${layer.name} ausblenden` : `${layer.name} einblenden`}
                  aria-pressed={!layer.visible}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.setVisible(layer.id, !layer.visible);
                  }}
                >
                  {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  type="button"
                  className={`icon-btn icon-btn-small${layer.locked ? ' is-on' : ''}`}
                  aria-label={layer.locked ? `${layer.name} entsperren` : `${layer.name} sperren`}
                  aria-pressed={layer.locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.setLocked(layer.id, !layer.locked);
                  }}
                >
                  {layer.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                </button>
              </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
