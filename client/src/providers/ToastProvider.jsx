'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { IconCheck, IconWarning } from '@/components/ui/Icons';

const ToastContext = createContext(null);

let nextId = 1;

/** Lightweight toast queue — no external UI library needed. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast) => {
      const id = nextId;
      nextId += 1;
      const entry = { id, tone: 'info', ...toast };
      setToasts((list) => [...list, entry]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), entry.duration ?? 4200),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, body) => push({ tone: 'success', title, body }),
      error: (title, body) => push({ tone: 'error', title, body }),
      info: (title, body) => push({ tone: 'info', title, body }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} onClick={() => dismiss(t.id)}>
            <span style={{ color: t.tone === 'error' ? 'var(--danger)' : t.tone === 'success' ? 'var(--success)' : 'var(--info)' }}>
              {t.tone === 'error' ? <IconWarning size={18} /> : <IconCheck size={18} />}
            </span>
            <div style={{ flex: 1 }}>
              <div className="toast__title">{t.title}</div>
              {t.body && <div className="toast__body">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
