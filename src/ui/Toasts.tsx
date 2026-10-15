import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

let nextId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      const id = nextId++;
      setToasts((all) => [...all.slice(-2), { id, text, tone }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 6000);
    },
    [dismiss],
  );
  return { toasts, show, dismiss };
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast toast-${t.tone}`} onClick={() => onDismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}
