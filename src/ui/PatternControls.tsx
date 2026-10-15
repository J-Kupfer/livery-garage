import { Dices } from 'lucide-react';
import {
  PATTERN_KINDS,
  PATTERN_PALETTES,
  PATTERN_SCALE_MAX,
  PATTERN_SCALE_MIN,
  isPalette,
  patternThumbnail,
  randomSeed,
  withKind,
  type PatternSpec,
} from '../lib/patterns.ts';
import { SliderField } from './controls.tsx';

const COLOR_LABELS = ['Grundfarbe', 'Farbe 2', 'Farbe 3', 'Farbe 4'];

interface Props {
  spec: PatternSpec;
  onChange: (spec: PatternSpec) => void;
}

export function PatternControls({ spec, onChange }: Props) {
  const colorCount = PATTERN_KINDS.find((k) => k.kind === spec.kind)?.colors ?? 4;
  return (
    <div className="pattern-box">
      <div className="pattern-kinds" role="radiogroup" aria-label="Muster">
        {PATTERN_KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={spec.kind === kind}
            className="pattern-kind"
            onClick={() => onChange(withKind(spec, kind))}
          >
            <img src={patternThumbnail(withKind(spec, kind))} alt="" />
            {label}
          </button>
        ))}
      </div>

      <div>
        <h4 className="group-title">Farbvorlage</h4>
        <div className="palettes">
          {PATTERN_PALETTES.map((palette) => (
            <button
              key={palette.name}
              type="button"
              className="palette"
              title={palette.name}
              aria-label={`Farbvorlage ${palette.name}`}
              aria-pressed={isPalette(spec.colors, palette)}
              onClick={() => onChange({ ...spec, colors: [...palette.colors] })}
            >
              {palette.colors.map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="group-title">Farben</h4>
        <div className="pattern-colors">
          {spec.colors.slice(0, colorCount).map((color, i) => (
            <label key={i} className="swatch" style={{ background: color }} title={`${COLOR_LABELS[i]} (${color})`}>
              <input
                type="color"
                value={color}
                aria-label={COLOR_LABELS[i]}
                onChange={(e) => onChange({ ...spec, colors: spec.colors.map((c, j) => (j === i ? e.target.value : c)) })}
              />
            </label>
          ))}
        </div>
      </div>

      <SliderField
        label="Größe"
        value={spec.scale * 100}
        min={PATTERN_SCALE_MIN * 100}
        max={PATTERN_SCALE_MAX * 100}
        step={5}
        unit=" %"
        onChange={(v) => onChange({ ...spec, scale: v / 100 })}
      />

      <button type="button" className="btn btn-quiet" onClick={() => onChange({ ...spec, seed: randomSeed() })}>
        <Dices size={16} aria-hidden /> Neu würfeln
      </button>
    </div>
  );
}
