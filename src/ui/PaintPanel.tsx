import { useRef } from 'react';
import { Dices, Pipette } from 'lucide-react';
import type { CarParts, Look, ZoneGradient, ZoneLook } from '../lib/composition.ts';
import { PATTERN_PALETTES, defaultPattern, patternThumbnail, randomSeed, type PatternSpec } from '../lib/patterns.ts';
import type { Weathering } from '../lib/weathering.ts';
import type { PaintZone } from '../lib/templateLayers.ts';
import { ColorField, Field, SliderField } from './controls.tsx';
import { PatternControls } from './PatternControls.tsx';

/** What the pattern chip shows before a pattern is chosen. */
const PATTERN_HINT: PatternSpec = { kind: 'woodland', colors: [...PATTERN_PALETTES[0].colors], scale: 1, seed: 7 };

const ZONE_LABEL: Record<PaintZone, string> = { body: 'Karosserie', second: 'Zweitfarbe', roof: 'Dach' };

const DIRECTIONS: readonly { direction: ZoneGradient['direction']; label: string; from: string; to: string }[] = [
  { direction: 'height', label: 'Hoch', from: 'Unten', to: 'Oben' },
  { direction: 'length', label: 'Längs', from: 'Links', to: 'Rechts' },
];

function GradientControls({ gradient, onChange }: { gradient: ZoneGradient; onChange: (gradient: ZoneGradient) => void }) {
  const current = DIRECTIONS.find((d) => d.direction === gradient.direction) ?? DIRECTIONS[0];
  return (
    <div className="pattern-box">
      <Field label="Richtung">
        <div className="segmented" role="radiogroup" aria-label="Richtung">
          {DIRECTIONS.map(({ direction, label }) => (
            <button
              key={direction}
              type="button"
              role="radio"
              aria-checked={gradient.direction === direction}
              aria-pressed={gradient.direction === direction}
              onClick={() => onChange({ ...gradient, direction })}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      <ColorField label={current.from} value={gradient.from} onChange={(from) => onChange({ ...gradient, from })} />
      <ColorField label={current.to} value={gradient.to} onChange={(to) => onChange({ ...gradient, to })} />
      <p className="section-hint gradient-hint">
        {gradient.direction === 'height'
          ? 'Von den Schwellern bis zur Dachmitte, auf beiden Seiten gleich.'
          : 'Von einem Ende des Autos zum anderen, in der Vorlage von links nach rechts.'}
      </p>
    </div>
  );
}

interface Props {
  parts?: CarParts;
  look?: Look;
  guideOpacity: number;
  onZone: (zone: PaintZone, look: ZoneLook) => void;
  onWheels: (variant: number) => void;
  onWeathering: (weathering: Weathering) => void;
  onGuide: (opacity: number) => void;
}

const NO_WEATHERING: Weathering = { rust: 0, scratches: 0, seed: 1 };

export function PaintPanel({ parts, look, guideOpacity, onZone, onWheels, onWeathering, onGuide }: Props) {
  // Switching a zone back to a pattern or gradient restores the last one instead of starting over.
  const lastPattern = useRef<Partial<Record<PaintZone, PatternSpec>>>({});
  const lastGradient = useRef<Partial<Record<PaintZone, ZoneGradient>>>({});
  if (!parts || !look) return <aside className="panel panel-left" />;

  const setPattern = (zone: PaintZone, variant: number, pattern: PatternSpec) => {
    lastPattern.current[zone] = pattern;
    onZone(zone, { variant, pattern });
  };

  const setGradient = (zone: PaintZone, variant: number, gradient: ZoneGradient) => {
    lastGradient.current[zone] = gradient;
    onZone(zone, { variant, gradient });
  };

  return (
    <aside className="panel panel-left" aria-label="Lack">
      <section className="panel-section">
        <h2 className="section-title">Lack</h2>
        {parts.zones.map(({ zone, variants }) => {
          const zoneLook = look.zones[zone] ?? { variant: 0 };
          const current = variants[zoneLook.variant] ?? variants[0];
          const gradient = !zoneLook.pattern ? zoneLook.gradient : undefined;
          // Dark sills fading into the zone's colour.
          const fallback: ZoneGradient = { from: '#151515', to: zoneLook.color ?? current.color, direction: 'height' };
          const preview = gradient ?? fallback;
          return (
            <div className="paint-group" key={zone}>
              <h3 className="group-title">{ZONE_LABEL[zone]}</h3>
              <div className="chips" role="radiogroup" aria-label={ZONE_LABEL[zone]}>
                {variants.map((variant, i) => (
                  <button
                    key={variant.name + i}
                    type="button"
                    role="radio"
                    aria-checked={!zoneLook.color && !zoneLook.pattern && !zoneLook.gradient && zoneLook.variant === i}
                    aria-label={`Werksfarbe ${i + 1}`}
                    title={`Werksfarbe ${i + 1} (${variant.color})`}
                    className="chip"
                    style={{ '--chip': variant.color } as React.CSSProperties}
                    onClick={() => onZone(zone, { variant: i })}
                  />
                ))}
                <label
                  className={`chip chip-custom${zoneLook.color && !zoneLook.pattern && !gradient ? ' is-active' : ''}`}
                  style={zoneLook.color && !zoneLook.pattern && !gradient ? ({ '--chip': zoneLook.color } as React.CSSProperties) : undefined}
                  title={zoneLook.color ? `Eigene Farbe (${zoneLook.color})` : 'Eigene Farbe wählen'}
                >
                  <input
                    type="color"
                    aria-label={`${ZONE_LABEL[zone]}: eigene Farbe`}
                    value={zoneLook.color ?? current.color}
                    onChange={(e) => onZone(zone, { variant: zoneLook.variant, color: e.target.value })}
                  />
                  {!(zoneLook.color && !zoneLook.pattern && !gradient) && <Pipette size={14} aria-hidden />}
                </label>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!!zoneLook.pattern}
                  aria-label={`${ZONE_LABEL[zone]}: Muster`}
                  title="Muster"
                  className="chip chip-pattern"
                  style={{ backgroundImage: `url(${patternThumbnail(zoneLook.pattern ?? PATTERN_HINT)})` }}
                  onClick={() => {
                    if (!zoneLook.pattern) setPattern(zone, zoneLook.variant, lastPattern.current[zone] ?? defaultPattern());
                  }}
                />
                <button
                  type="button"
                  role="radio"
                  aria-checked={!!gradient}
                  aria-label={`${ZONE_LABEL[zone]}: Verlauf`}
                  title="Verlauf"
                  className="chip chip-gradient"
                  style={{ '--chip-from': preview.from, '--chip-to': preview.to } as React.CSSProperties}
                  onClick={() => {
                    if (!gradient) setGradient(zone, zoneLook.variant, lastGradient.current[zone] ?? fallback);
                  }}
                />
              </div>
              {zoneLook.pattern && (
                <PatternControls spec={zoneLook.pattern} onChange={(pattern) => setPattern(zone, zoneLook.variant, pattern)} />
              )}
              {gradient && <GradientControls gradient={gradient} onChange={(next) => setGradient(zone, zoneLook.variant, next)} />}
            </div>
          );
        })}

        {parts.wheels.length > 1 && (
          <div className="paint-group">
            <h3 className="group-title">Felgen</h3>
            <div className="chips" role="radiogroup" aria-label="Felgen">
              {parts.wheels.map((wheel, i) => (
                <button
                  key={wheel.name + i}
                  type="button"
                  role="radio"
                  aria-checked={look.wheels === i}
                  aria-label={`Felge ${i + 1}`}
                  title={`Felge ${i + 1}`}
                  className="chip chip-round"
                  style={{ '--chip': wheel.color } as React.CSSProperties}
                  onClick={() => onWheels(i)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel-section">
        <h2 className="section-title">Gebrauchsspuren</h2>
        <p className="section-hint">Dreck und Staub macht das Spiel selbst.</p>
        <SliderField
          label="Rost"
          value={(look.weathering ?? NO_WEATHERING).rust * 100}
          min={0}
          max={100}
          unit=" %"
          onChange={(v) => onWeathering({ ...(look.weathering ?? NO_WEATHERING), rust: v / 100 })}
        />
        <SliderField
          label="Kratzer"
          value={(look.weathering ?? NO_WEATHERING).scratches * 100}
          min={0}
          max={100}
          unit=" %"
          onChange={(v) => onWeathering({ ...(look.weathering ?? NO_WEATHERING), scratches: v / 100 })}
        />
        <button
          type="button"
          className="btn btn-quiet btn-wide"
          disabled={!look.weathering || (look.weathering.rust === 0 && look.weathering.scratches === 0)}
          onClick={() => onWeathering({ ...(look.weathering ?? NO_WEATHERING), seed: randomSeed() })}
        >
          <Dices size={16} aria-hidden /> Neu würfeln
        </button>
      </section>

      {parts.uv && (
        <section className="panel-section">
          <h2 className="section-title">Hilfsgitter</h2>
          <p className="section-hint">Zeigt die Kanten der Karosserieteile. Wird nicht exportiert.</p>
          <SliderField label="Deckkraft" value={guideOpacity * 100} min={0} max={100} unit=" %" onChange={(v) => onGuide(v / 100)} />
        </section>
      )}
    </aside>
  );
}
