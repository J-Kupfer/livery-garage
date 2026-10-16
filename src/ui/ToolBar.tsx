import { Brush, Check, Spline } from 'lucide-react';
import type { ToolState } from '../editor/LiveryEditor.ts';

function lineHint(points: number): string {
  if (points === 0) return 'Klicke auf die Fläche, um die Linie zu beginnen.';
  if (points === 1) return 'Klicke den nächsten Punkt.';
  return 'Doppelklick oder Enter beendet die Linie.';
}

/** Floats over the canvas while a drawing tool is active: what to do next, and the way out. */
export function ToolBar({ tool, onDone, onCancel }: { tool: ToolState; onDone: () => void; onCancel: () => void }) {
  const line = tool.kind === 'line';
  const Icon = line ? Spline : Brush;
  return (
    <div className="tool-bar" role="toolbar" aria-label={line ? 'Zierlinie zeichnen' : 'Freihand malen'}>
      <Icon size={17} className="tool-bar-icon" aria-hidden />
      <strong>{line ? 'Zierlinie' : 'Freihand'}</strong>
      <span className="tool-bar-hint" aria-live="polite">
        {line ? lineHint(tool.points) : 'Male mit gedrückter Maustaste.'}
      </span>
      {line && (
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Abbrechen
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={onDone}>
        <Check size={15} aria-hidden /> Fertig
      </button>
    </div>
  );
}
