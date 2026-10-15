import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Modal on top of the native <dialog>: focus trapping, Escape and the backdrop come for free. */
export function Dialog({ title, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header className="dialog-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
          <X size={18} />
        </button>
      </header>
      <div className="dialog-body">{children}</div>
      {footer && <footer className="dialog-foot">{footer}</footer>}
    </dialog>
  );
}
