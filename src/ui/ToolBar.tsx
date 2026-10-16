import { Brush, Check, PenTool, Spline } from 'lucide-react';
import type { ToolState } from '../editor/LiveryEditor.ts';

const TOOLS = {
  line: { title: 'Zierlinie', label: 'Zierlinie zeichnen', icon: Spline },
  area: { title: 'Fläche', label: 'Fläche zeichnen', icon: PenTool },
  brush: { title: 'Freihand', label: 'Freihand malen', icon: Brush },
} as const;

function hint(tool: ToolState): string {
  if (tool.kind === 'brush') return 'Male mit gedrückter Maustaste.';
  if (tool.points === 0) return tool.kind === 'line' ? 'Klicke auf die Fläche, um die Linie zu beginnen.' : 'Klicke die erste Ecke der Fläche.';
  if (tool.kind === 'line') return tool.points === 1 ? 'Klicke den nächsten Punkt.' : 'Doppelklick oder Enter beendet die Linie.';
  return tool.points < 3 ? 'Klicke die nächste Ecke.' : 'Klick auf die erste Ecke, Doppelklick oder Enter schließt die Fläche.';
}

/** Floats over the canvas while a drawing tool is active: what to do next, and the way out. */
export function ToolBar({ tool, onDone, onCancel }: { tool: ToolState; onDone: () => void; onCancel: () => void }) {
  const { title, label, icon: Icon } = TOOLS[tool.kind];
  return (
    <div className="tool-bar" role="toolbar" aria-label={label}>
      <Icon size={17} className="tool-bar-icon" aria-hidden />
      <strong>{title}</strong>
      <span className="tool-bar-hint" aria-live="polite">
        {hint(tool)}
      </span>
      {tool.kind !== 'brush' && (
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
