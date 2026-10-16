import { useRef } from 'react';
import { ArrowDownUp, Brush, Copy, Dices, FlipHorizontal2, FlipVertical2, Group, Trash2, Ungroup } from 'lucide-react';
import type { ClipMode, LayerInfo, LayerPatch, LayerProps, LiveryEditor, ToolState } from '../editor/LiveryEditor.ts';
import { BRUSH_WIDTH_MAX, BRUSH_WIDTH_MIN } from '../lib/brush.ts';
import { defaultGradient, defaultPatternFill, type FillSpec } from '../lib/fills.ts';
import { DECAL_FONTS, fontWeightFor } from '../lib/fonts.ts';
import {
  LINE_OUTLINE_MAX,
  LINE_PATTERNS,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  lineDashArray,
  type AreaStyle,
  type LinePattern,
  type LineStyle,
} from '../lib/lines.ts';
import { STICKER_STYLES } from '../lib/stickers.ts';
import { ColorField, Field, SliderField, Switch } from './controls.tsx';
import { PatternControls } from './PatternControls.tsx';

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
  tool?: ToolState;
  /** The car has two mirrored sides, so a layer can be copied across. */
  canCopyToOtherSide: boolean;
  /** The selected layers can be grouped. */
  canGroup: boolean;
}

/** A short sample of the line pattern, drawn the way the editor draws it. */
function PatternSample({ pattern }: { pattern: LinePattern }) {
  const dash = lineDashArray({ pattern, width: 3 });
  return (
    <svg width="38" height="8" viewBox="0 0 38 8" aria-hidden>
      <line x1="3" y1="4" x2="35" y2="4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={dash?.join(' ')} />
    </svg>
  );
}

const FILL_MODES = [
  { mode: 'solid', label: 'Farbe' },
  { mode: 'gradient', label: 'Verlauf' },
  { mode: 'pattern', label: 'Muster' },
] as const;

/** Plain colour, gradient or pattern for shapes, areas and text. */
function FillFields({ selected, update }: { selected: LayerProps; update: (patch: LayerPatch) => void }) {
  // Switching back to a gradient or pattern brings back the one the layer had before.
  const previous = useRef(new Map<string, FillSpec>());
  const spec = selected.fillSpec;
  const color = selected.fill ?? '#ffffff';
  const mode = spec?.kind ?? 'solid';

  const choose = (next: (typeof FILL_MODES)[number]['mode']) => {
    if (next === mode) return;
    if (spec) previous.current.set(`${selected.id}:${spec.kind}`, spec);
    const kept = previous.current.get(`${selected.id}:${next}`);
    if (next === 'solid') update({ fillSpec: null, fill: color });
    else update({ fillSpec: kept ?? (next === 'gradient' ? defaultGradient(color) : defaultPatternFill()) });
  };

  return (
    <>
      <Field label="Füllung">
        <div className="segmented" role="radiogroup" aria-label="Füllung">
          {FILL_MODES.map(({ mode: m, label }) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} aria-pressed={mode === m} onClick={() => choose(m)}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      {mode === 'solid' && <ColorField label="Farbe" value={color} onChange={(fill) => update({ fill })} />}
      {spec?.kind === 'gradient' && (
        <>
          <ColorField label="Start" value={spec.from} onChange={(from) => update({ fillSpec: { ...spec, from } })} />
          {!spec.fade && <ColorField label="Ende" value={spec.to} onChange={(to) => update({ fillSpec: { ...spec, to } })} />}
          <Switch
            label="Ausblenden"
            hint="Läuft ins Durchsichtige aus"
            checked={spec.fade}
            onChange={(fade) => update({ fillSpec: { ...spec, fade } })}
          />
          <SliderField
            label="Richtung"
            value={spec.angle}
            min={0}
            max={360}
            step={5}
            unit="°"
            onChange={(angle) => update({ fillSpec: { ...spec, angle } })}
          />
        </>
      )}
      {spec?.kind === 'pattern' && (
        <PatternControls spec={spec.pattern} onChange={(pattern) => update({ fillSpec: { kind: 'pattern', pattern } })} />
      )}
    </>
  );
}

/** Smooth curve or straight segments through the points of a line or area. */
function CurveField({ smooth, onChange }: { smooth: boolean; onChange: (smooth: boolean) => void }) {
  return (
    <Field label="Verlauf">
      <div className="segmented" role="radiogroup" aria-label="Verlauf">
        <button type="button" role="radio" aria-checked={smooth} aria-pressed={smooth} onClick={() => onChange(true)}>
          Geschwungen
        </button>
        <button type="button" role="radio" aria-checked={!smooth} aria-pressed={!smooth} onClick={() => onChange(false)}>
          Eckig
        </button>
      </div>
    </Field>
  );
}

function LineFields({ style, onChange }: { style: LineStyle; onChange: (patch: Partial<LineStyle>) => void }) {
  return (
    <>
      <ColorField label="Farbe" value={style.color} onChange={(color) => onChange({ color })} />
      <SliderField label="Breite" value={style.width} min={LINE_WIDTH_MIN} max={LINE_WIDTH_MAX} onChange={(width) => onChange({ width })} />
      <ColorField label="Kontur" value={style.outline} onChange={(outline) => onChange({ outline })} />
      <SliderField
        label="Konturbreite"
        value={style.outlineWidth}
        min={0}
        max={LINE_OUTLINE_MAX}
        onChange={(outlineWidth) => onChange({ outlineWidth })}
      />
      <Field label="Linie">
        <div className="segmented" role="radiogroup" aria-label="Linie">
          {LINE_PATTERNS.map(({ pattern, label }) => (
            <button
              key={pattern}
              type="button"
              role="radio"
              aria-checked={style.pattern === pattern}
              aria-pressed={style.pattern === pattern}
              aria-label={label}
              title={label}
              onClick={() => onChange({ pattern })}
            >
              <PatternSample pattern={pattern} />
            </button>
          ))}
        </div>
      </Field>
      <CurveField smooth={style.smooth} onChange={(smooth) => onChange({ smooth })} />
    </>
  );
}

/** Settings of the active drawing tool; they apply to what is drawn next. */
function ToolPanel({ editor, tool }: { editor: LiveryEditor; tool: ToolState }) {
  if (tool.kind === 'line') {
    return (
      <section className="panel-section props" aria-label="Zierlinie">
        <h2 className="section-title">Zierlinie</h2>
        <LineFields style={tool.style} onChange={(patch) => editor.setLineStyle(patch)} />
        <dl className="shortcuts shortcuts-spaced">
          <dt>Klick</dt>
          <dd>Punkt setzen</dd>
          <dt>Shift + Klick</dt>
          <dd>In 15°-Schritten</dd>
          <dt>Rücktaste</dt>
          <dd>Letzten Punkt entfernen</dd>
          <dt>Doppelklick, Enter</dt>
          <dd>Linie fertig</dd>
        </dl>
      </section>
    );
  }
  if (tool.kind === 'area') {
    const { style } = tool;
    const set = (patch: Partial<AreaStyle>) => editor.setAreaStyle(patch);
    return (
      <section className="panel-section props" aria-label="Fläche">
        <h2 className="section-title">Fläche</h2>
        <ColorField label="Farbe" value={style.fill} onChange={(fill) => set({ fill })} />
        <ColorField label="Kontur" value={style.stroke} onChange={(stroke) => set({ stroke })} />
        <SliderField label="Konturbreite" value={style.strokeWidth} min={0} max={40} onChange={(strokeWidth) => set({ strokeWidth })} />
        <CurveField smooth={style.smooth} onChange={(smooth) => set({ smooth })} />
        <dl className="shortcuts shortcuts-spaced">
          <dt>Klick</dt>
          <dd>Ecke setzen</dd>
          <dt>Klick auf erste Ecke</dt>
          <dd>Fläche schließen</dd>
          <dt>Shift + Klick</dt>
          <dd>In 15°-Schritten</dd>
          <dt>Rücktaste</dt>
          <dd>Letzte Ecke entfernen</dd>
          <dt>Doppelklick, Enter</dt>
          <dd>Fläche fertig</dd>
        </dl>
      </section>
    );
  }
  const { style } = tool;
  return (
    <section className="panel-section props" aria-label="Freihand">
      <h2 className="section-title">Freihand</h2>
      <ColorField label="Farbe" value={style.color} onChange={(color) => editor.setBrushStyle({ color })} />
      <SliderField
        label="Pinselgröße"
        value={style.width}
        min={BRUSH_WIDTH_MIN}
        max={BRUSH_WIDTH_MAX}
        onChange={(width) => editor.setBrushStyle({ width })}
      />
      <SliderField
        label="Glättung"
        value={style.smoothing * 100}
        min={0}
        max={100}
        unit=" %"
        onChange={(v) => editor.setBrushStyle({ smoothing: v / 100 })}
      />
      <dl className="shortcuts shortcuts-spaced">
        <dt>Ziehen</dt>
        <dd>Malen</dd>
        <dt>Strg + Z</dt>
        <dd>Letzten Strich zurücknehmen</dd>
        <dt>Enter, Esc</dt>
        <dd>Fertig</dd>
      </dl>
    </section>
  );
}

export function PropertiesPanel({ editor, selected, selectionCount, layers, tool, canCopyToOtherSide, canGroup }: Props) {
  if (tool) return <ToolPanel editor={editor} tool={tool} />;

  if (selectionCount > 1) {
    return (
      <section className="panel-section props" aria-label="Eigenschaften">
        <h2 className="section-title">{selectionCount} Ebenen ausgewählt</h2>
        <p className="section-hint">Verschieben, drehen und skalieren geht gemeinsam auf der Fläche.</p>
        <div className="action-row">
          <button type="button" className="btn btn-quiet" onClick={() => editor.groupSelected()} disabled={!canGroup}>
            <Group size={15} aria-hidden /> Gruppieren
          </button>
          <button type="button" className="btn btn-danger" onClick={() => editor.removeSelected()}>
            <Trash2 size={15} aria-hidden /> Löschen
          </button>
        </div>
        {!canGroup && <p className="field-hint field-hint-wide">Gruppieren geht nur mit Ebenen im selben Bereich (Lack, Scheiben oder Frei).</p>}
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
          <dt>Strg beim Ziehen</dt>
          <dd>Ohne Einrasten</dd>
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
          <SliderField label="Biegung" value={selected.textArc ?? 0} min={-100} max={100} unit=" %" onChange={(textArc) => update({ textArc })} />
        </>
      )}

      {(selected.kind === 'text' || selected.kind === 'shape' || selected.kind === 'area') && (
        <>
          <FillFields key={selected.id} selected={selected} update={update} />
          <ColorField label="Kontur" value={selected.stroke ?? '#1d1d1f'} onChange={(stroke) => update({ stroke })} />
          <SliderField label="Konturbreite" value={selected.strokeWidth ?? 0} min={0} max={40} onChange={(strokeWidth) => update({ strokeWidth })} />
        </>
      )}

      {selected.kind === 'area' && (
        <>
          <CurveField smooth={selected.smooth ?? false} onChange={(smooth) => update({ smooth })} />
          <p className="field-hint field-hint-wide">Ziehe die Ecken, um die Fläche zu formen.</p>
        </>
      )}

      {selected.kind === 'line' && selected.line && (
        <>
          <LineFields style={selected.line} onChange={(line) => update({ line })} />
          <p className="field-hint field-hint-wide">Ziehe die Punkte, um die Linie zu formen.</p>
        </>
      )}

      {selected.kind === 'brush' && (
        <>
          <ColorField label="Farbe" value={selected.brushColor ?? '#151515'} onChange={(brushColor) => update({ brushColor })} />
          <button type="button" className="btn btn-quiet btn-wide" onClick={() => editor.startBrush(true)}>
            <Brush size={16} aria-hidden /> Weiter malen
          </button>
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
            label="Weiß entfernen"
            hint="Macht einen weißen Hintergrund durchsichtig"
            checked={!!selected.removeWhite}
            onChange={(removeWhite) => update({ removeWhite })}
          />
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

      {selected.kind === 'group' && (
        <button type="button" className="btn btn-quiet btn-wide" onClick={() => editor.ungroupSelected()}>
          <Ungroup size={15} aria-hidden /> Gruppe auflösen
        </button>
      )}
      {canCopyToOtherSide && (
        <button
          type="button"
          className="btn btn-quiet btn-wide"
          title="Kopie an der passenden Stelle auf der anderen Fahrzeugseite. Text, Nummern und Logos bleiben lesbar, alles andere wird gespiegelt."
          onClick={() => void editor.copyToOtherSide()}
        >
          <ArrowDownUp size={15} aria-hidden /> Auf die andere Seite
        </button>
      )}
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
