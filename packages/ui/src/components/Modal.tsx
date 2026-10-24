'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

/** Accessible dialog built on <dialog>: focus is trapped by the browser, Esc closes, focus returns on close. */
export function Modal({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="modal-title"
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-0 text-text shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-[2px]">
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div>
          <h2 id="modal-title" className="text-[16px] font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close dialog">
          <Icon name="x" />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-border bg-surface-2/50 px-6 py-4">{footer}</div> : null}
    </dialog>
  );
}
