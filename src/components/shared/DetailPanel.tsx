import { useEffect } from 'react';
import { X } from 'lucide-react';

// The one universal "click a card/row, see its full detail" pattern for
// this app -- used by the Matter detail view, the Conflict Check
// recent-check detail, and the Document preview. Before this there was no
// shared overlay primitive at all; every existing modal (NewMatterModal,
// InviteClientModal, LogTimeModal, ShortcutsModal, the e-signature panel
// inside DocumentsScreen) hand-rolls the same centered-dialog markup. This
// is a right-hand drawer instead (more room for cross-referenced detail:
// parties, deadlines, documents, time, intelligence signals, all at once)
// but keeps the same visual vocabulary (--bg-secondary/--border-subtle,
// backdrop-click and Escape both close) so it reads as the same product.
export function DetailPanel({
  title, subtitle, onClose, children, footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl bg-[var(--bg-secondary)] border-l border-[var(--border-subtle)] shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-medium truncate">{title}</h2>
            {subtitle && <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 ml-3" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {children}
        </div>

        {footer && (
          <div className="px-5 py-3 border-t border-[var(--border-subtle)] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Small shared building block used across every detail panel section
// (Matter/ConflictCheck/Document) so section headers read consistently.
export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-2">{title}</div>
      {children}
    </div>
  );
}
