import { Pipette } from 'lucide-react';
import type { CarParts, Look, ZoneLook } from '../lib/composition.ts';
import type { PaintZone } from '../lib/templateLayers.ts';
import { SliderField } from './controls.tsx';

const ZONE_LABEL: Record<PaintZone, string> = { body: 'Karosserie', second: 'Zweitfarbe', roof: 'Dach' };

interface Props {
  parts?: CarParts;
  look?: Look;
  guideOpacity: number;
  onZone: (zone: PaintZone, look: ZoneLook) => void;
  onWheels: (variant: number) => void;
  onGuide: (opacity: number) => void;
}

export function PaintPanel({ parts, look, guideOpacity, onZone, onWheels, onGuide }: Props) {
  if (!parts || !look) return <aside className="panel panel-left" />;
  return (
    <aside className="panel panel-left" aria-label="Lack">
      <section className="panel-section">
        <h2 className="section-title">Lack</h2>
        {parts.zones.map(({ zone, variants }) => {
          const zoneLook = look.zones[zone] ?? { variant: 0 };
          const current = variants[zoneLook.variant] ?? variants[0];
          return (
            <div className="paint-group" key={zone}>
              <h3 className="group-title">{ZONE_LABEL[zone]}</h3>
              <div className="chips" role="radiogroup" aria-label={ZONE_LABEL[zone]}>
                {variants.map((variant, i) => (
                  <button
                    key={variant.name + i}
                    type="button"
                    role="radio"
                    aria-checked={!zoneLook.color && zoneLook.variant === i}
                    aria-label={`Werksfarbe ${i + 1}`}
                    title={`Werksfarbe ${i + 1} (${variant.color})`}
                    className="chip"
                    style={{ '--chip': variant.color } as React.CSSProperties}
                    onClick={() => onZone(zone, { variant: i })}
                  />
                ))}
                <label
                  className={`chip chip-custom${zoneLook.color ? ' is-active' : ''}`}
                  style={zoneLook.color ? ({ '--chip': zoneLook.color } as React.CSSProperties) : undefined}
                  title={zoneLook.color ? `Eigene Farbe (${zoneLook.color})` : 'Eigene Farbe wählen'}
                >
                  <input
                    type="color"
                    aria-label={`${ZONE_LABEL[zone]}: eigene Farbe`}
                    value={zoneLook.color ?? current.color}
                    onChange={(e) => onZone(zone, { variant: zoneLook.variant, color: e.target.value })}
                  />
                  {!zoneLook.color && <Pipette size={14} aria-hidden />}
                </label>
              </div>
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
