import { Copy, Dices, FlipHorizontal2, FlipVertical2, Trash2 } from 'lucide-react';
import type { ClipMode, LayerInfo, LayerProps, LiveryEditor } from '../editor/LiveryEditor.ts';
import { DECAL_FONTS, fontWeightFor } from '../lib/fonts.ts';
import { STICKER_STYLES } from '../lib/stickers.ts';
import { ColorField, Field, SliderField, Switch } from './controls.tsx';

const FLAME_COLOR_LABELS = ['Ansatz', 'Mitte', 'Spitzen'];

const CLIP_MODES: readonly { mode: ClipMode; label: string; hint: string }[] = [
  { mode: 'paint', label: 'Lack', hint: 'Nur auf dem Lack, unter Fenstern, Lichtern und Anbauteilen.' },
  { mode: 'windows', label: 'Scheiben', hint: 'Nur auf den Fensterscheiben, zum Beispiel als Sonnenblende.' },
  { mode: 'none', label: 'Frei', hint: 'Ohne Zuschnitt, unter Fenstern und Lichtern.' },
];

interface Props {
  editor: LiveryEditor;
  selected?: LayerProps;
  selectionCount: number;
  layers: LayerInfo[];
}

export function PropertiesPanel({ editor, selected, selectionCount, layers }: Props) {
  if (selectionCount > 1) {
    return (
      <section className="panel-section props" aria-label="Eigenschaften">
        <h2 className="section-title">{selectionCount} Ebenen ausgewählt</h2>
        <p className="section-hint">Verschieben, drehen und skalieren geht gemeinsam auf der Fläche.</p>
        <div className="action-row">
          <button type="button" className="btn btn-danger" onClick={() => editor.removeSelected()}>
            <Trash2 size={15} aria-hidden /> Löschen
          </button>
        </div>
      </section>
    );
  }

  if (!selected) {
    return (
      <section className="panel-section props props-empty" aria-label="Eigenschaften">
        <h2 className="section-title">Eigenschaften</h2>
        <p className="section-hint">Wähle eine Ebene auf der Fläche oder in der Liste, um sie anzupassen.</p>
        <dl className="shortcuts">
          <dt>Leertaste + Ziehen</dt>
          <dd>Ansicht verschieben</dd>
          <dt>Strg + Mausrad</dt>
          <dd>Zoomen</dd>
          <dt>Strg + 0</dt>
          <dd>Ganze Vorlage zeigen</dd>
          <dt>Shift beim Drehen</dt>
          <dd>In 15°-Schritten</dd>
          <dt>Strg + D</dt>
          <dd>Duplizieren</dd>
          <dt>Strg + Z</dt>
          <dd>Rückgängig</dd>
        </dl>
      </section>
    );
  }

  const panelIndex = layers.findIndex((l) => l.id === selected.id);
  const update = editor.updateSelected.bind(editor);

  return (
    <section className="panel-section props" aria-label="Eigenschaften">
      <h2 className="section-title">Eigenschaften</h2>
      <Field label="Name" htmlFor="layer-name">
        <input
          id="layer-name"
          key={selected.id}
          className="input"
          defaultValue={selected.name}
          onBlur={(e) => editor.rename(selected.id, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </Field>

      {selected.kind === 'text' && (
        <>
          <Field label="Text" htmlFor="layer-text">
            <textarea
              id="layer-text"
              className="input textarea"
              rows={2}
              value={selected.text ?? ''}
              onChange={(e) => update({ text: e.target.value })}
            />
          </Field>
          <Field label="Schrift" htmlFor="layer-font">
            <select
              id="layer-font"
              className="input select"
              value={selected.fontFamily}
              style={{ fontFamily: `"${selected.fontFamily}"`, fontWeight: fontWeightFor(selected.fontFamily ?? '') }}
              onChange={(e) => update({ fontFamily: e.target.value, fontWeight: String(fontWeightFor(e.target.value)) })}
            >
              {DECAL_FONTS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}>
                  {f.family}
                </option>
              ))}
            </select>
          </Field>
          <SliderField label="Abstand" value={selected.charSpacing ?? 0} min={-100} max={800} step={10} onChange={(v) => update({ charSpacing: v })} />
        </>
      )}

      {(selected.kind === 'text' || selected.kind === 'shape') && (
        <>
          <ColorField label="Farbe" value={selected.fill ?? '#ffffff'} onChange={(fill) => update({ fill })} />
          <ColorField label="Kontur" value={selected.stroke ?? '#1d1d1f'} onChange={(stroke) => update({ stroke })} />
          <SliderField label="Konturbreite" value={selected.strokeWidth ?? 0} min={0} max={40} onChange={(strokeWidth) => update({ strokeWidth })} />
        </>
      )}

      {selected.kind === 'flames' && selected.flameColors && (
        <>
          {FLAME_COLOR_LABELS.map((label, i) => (
            <ColorField
              key={label}
              label={label}
              value={selected.flameColors![i]}
              onChange={(color) => update({ flameColors: selected.flameColors!.map((c, j) => (j === i ? color : c)) })}
            />
          ))}
          <ColorField label="Kontur" value={selected.stroke ?? '#1d1a10'} onChange={(stroke) => update({ stroke })} />
          <SliderField label="Konturbreite" value={selected.strokeWidth ?? 0} min={0} max={60} onChange={(strokeWidth) => update({ strokeWidth })} />
          <button type="button" className="btn btn-quiet btn-wide" onClick={() => editor.regenerateFlames()}>
            <Dices size={16} aria-hidden /> Neue Flammen würfeln
          </button>
        </>
      )}

      {selected.kind === 'sticker' && selected.sticker && (
        <>
          <Field label="Form">
            <div className="segmented" role="radiogroup" aria-label="Sticker-Form">
              {STICKER_STYLES.map(({ style, label }) => (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={selected.sticker!.style === style}
                  aria-pressed={selected.sticker!.style === style}
                  onClick={() => update({ sticker: { style } })}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Text" htmlFor="sticker-text">
            <input
              id="sticker-text"
              className="input"
              value={selected.sticker.text}
              maxLength={40}
              onChange={(e) => update({ sticker: { text: e.target.value } })}
            />
          </Field>
          <Field label="Schrift" htmlFor="sticker-font">
            <select
              id="sticker-font"
              className="input select"
              value={selected.sticker.fontFamily}
              style={{ fontFamily: `"${selected.sticker.fontFamily}"`, fontWeight: fontWeightFor(selected.sticker.fontFamily) }}
              onChange={(e) => update({ sticker: { fontFamily: e.target.value } })}
            >
              {DECAL_FONTS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}>
                  {f.family}
                </option>
              ))}
            </select>
          </Field>
          <ColorField label="Hintergrund" value={selected.sticker.background} onChange={(background) => update({ sticker: { background } })} />
          <ColorField label="Schriftfarbe" value={selected.sticker.color} onChange={(color) => update({ sticker: { color } })} />
          <ColorField label="Rand" value={selected.sticker.outline} onChange={(outline) => update({ sticker: { outline } })} />
          <SliderField
            label="Randbreite"
            value={selected.sticker.outlineWidth}
            min={0}
            max={40}
            onChange={(outlineWidth) => update({ sticker: { outlineWidth } })}
          />
        </>
      )}

      {(selected.kind === 'logo' || selected.kind === 'image') && (
        <>
          <Switch
            label="Einfärben"
            hint="Färbt das ganze Motiv in einer Farbe"
            checked={!!selected.tint}
            onChange={(on) => update({ tint: on ? '#ffffff' : null })}
          />
          {selected.tint && <ColorField label="Farbe" value={selected.tint} onChange={(tint) => update({ tint })} />}
        </>
      )}

      <SliderField label="Deckkraft" value={selected.opacity * 100} min={0} max={100} unit=" %" onChange={(v) => update({ opacity: v / 100 })} />
      <SliderField label="Drehung" value={selected.angle} min={-180} max={180} unit="°" onChange={(angle) => update({ angle })} />

      <Field label="Spiegeln">
        <div className="segmented">
          <button type="button" aria-pressed={selected.flipX} onClick={() => update({ flipX: !selected.flipX })} title="Horizontal spiegeln">
            <FlipHorizontal2 size={16} aria-hidden /> Horizontal
          </button>
          <button type="button" aria-pressed={selected.flipY} onClick={() => update({ flipY: !selected.flipY })} title="Vertikal spiegeln">
            <FlipVertical2 size={16} aria-hidden /> Vertikal
          </button>
        </div>
      </Field>

      <Field label="Bereich">
        <div className="segmented" role="radiogroup" aria-label="Bereich">
          {CLIP_MODES.map(({ mode, label }) => (
            <button key={mode} type="button" role="radio" aria-checked={selected.clip === mode} aria-pressed={selected.clip === mode} onClick={() => update({ clip: mode })}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      <p className="field-hint">{CLIP_MODES.find((m) => m.mode === selected.clip)?.hint}</p>

      <Field label="Reihenfolge">
        <div className="segmented">
          <button type="button" onClick={() => editor.moveLayer(selected.id, panelIndex - 1)} disabled={panelIndex <= 0}>
            Nach vorne
          </button>
          <button type="button" onClick={() => editor.moveLayer(selected.id, panelIndex + 1)} disabled={panelIndex >= layers.length - 1}>
            Nach hinten
          </button>
        </div>
      </Field>

      <div className="action-row">
        <button type="button" className="btn btn-quiet" onClick={() => void editor.duplicateSelected()}>
          <Copy size={15} aria-hidden /> Duplizieren
        </button>
        <button type="button" className="btn btn-danger" onClick={() => editor.removeSelected()}>
          <Trash2 size={15} aria-hidden /> Löschen
        </button>
      </div>
    </section>
  );
}
