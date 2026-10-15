import { useId, type ReactNode } from 'react';

const HEX = /^#?([0-9a-f]{6})$/i;

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="field-control">{children}</div>
    </div>
  );
}

/** Colour swatch with the native picker plus an editable hex value. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const id = useId();

  const commit = (input: HTMLInputElement) => {
    const match = HEX.exec(input.value.trim());
    if (match) onChange(`#${match[1].toLowerCase()}`);
    else input.value = value;
  };

  return (
    <Field label={label} htmlFor={id}>
      <label className="swatch" style={{ background: value }}>
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      </label>
      {/* Uncontrolled draft; the key resets it whenever the colour changes elsewhere. */}
      <input
        key={value}
        className="input input-hex"
        defaultValue={value}
        spellCheck={false}
        aria-label={`${label} als Hex-Wert`}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget)}
      />
    </Field>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
      <output className="slider-value" htmlFor={id}>
        {Math.round(value)}
        {unit}
      </output>
    </Field>
  );
}

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  return (
    <label className="switch-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
