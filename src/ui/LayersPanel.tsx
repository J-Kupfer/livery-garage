import { useEffect, useRef, useState } from 'react';
import { Circle, Eye, EyeOff, Image, Lock, LockOpen, RectangleHorizontal, Shapes, Sticker, Type, Upload } from 'lucide-react';
import type { LayerInfo, LayerKind, LiveryEditor } from '../editor/LiveryEditor.ts';
import { DEFAULT_DECAL_FONT } from '../lib/fonts.ts';

const KIND_ICON: Record<LayerKind, typeof Type> = { logo: Sticker, image: Image, text: Type, shape: Shapes };

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
  const [shapesOpen, setShapesOpen] = useState(false);
  const [renaming, setRenaming] = useState<string>();
  const [drag, setDrag] = useState<{ id: string; over?: number }>();
  const shapesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shapesOpen) return;
    const close = (e: PointerEvent) => {
      if (!shapesRef.current?.contains(e.target as Node)) setShapesOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [shapesOpen]);

  const addShape = (shape: 'stripe' | 'rect' | 'circle') => {
    editor.addShape(shape);
    setShapesOpen(false);
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
      <div className="add-bar" role="toolbar" aria-label="Ebene hinzufügen">
        <button type="button" className="add-btn" onClick={onPickLogo} disabled={disabled}>
          <Sticker size={18} aria-hidden />
          Logo
        </button>
        <button type="button" className="add-btn" onClick={() => editor.addText(DEFAULT_DECAL_FONT)} disabled={disabled}>
          <Type size={18} aria-hidden />
          Text
        </button>
        <div className="menu-anchor" ref={shapesRef}>
          <button
            type="button"
            className="add-btn"
            aria-haspopup="menu"
            aria-expanded={shapesOpen}
            onClick={() => setShapesOpen((o) => !o)}
            disabled={disabled}
          >
            <Shapes size={18} aria-hidden />
            Form
          </button>
          {shapesOpen && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => addShape('stripe')}>
                <RectangleHorizontal size={16} aria-hidden /> Streifen
              </button>
              <button type="button" role="menuitem" onClick={() => addShape('rect')}>
                <RectangleHorizontal size={16} aria-hidden /> Rechteck
              </button>
              <button type="button" role="menuitem" onClick={() => addShape('circle')}>
                <Circle size={16} aria-hidden /> Kreis
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
            return (
              <li
                key={layer.id}
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
            );
          })}
        </ol>
      )}
    </section>
  );
}
