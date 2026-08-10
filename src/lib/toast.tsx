import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type ToastKind = 'success' | 'error';
interface Toast { id: string; kind: ToastKind; message: string; }

interface ToastContextValue {
  showToast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(t => [...t, { id, kind, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  const dismiss = (id: string) => setToasts(t => t.filter(x => x.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-xl border text-sm animate-in fade-in slide-in-from-bottom-2 ${
              t.kind === 'success'
                ? 'bg-[var(--bg-elevated)] border-[var(--signal-positive)]/30 text-[var(--text-primary)]'
                : 'bg-[var(--bg-elevated)] border-[var(--signal-negative)]/30 text-[var(--text-primary)]'
            }`}
          >
            {t.kind === 'success'
              ? <CheckCircle2 className="w-4 h-4 text-[var(--signal-positive)] shrink-0 mt-0.5" />
              : <XCircle className="w-4 h-4 text-[var(--signal-negative)] shrink-0 mt-0.5" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
