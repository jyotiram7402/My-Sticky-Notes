"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds before the toast hides. Default 3000. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timerRef = useRef<number | null>(null);
  const idRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (options: ToastOptions) => {
      clearTimer();
      idRef.current += 1;
      const item: ToastItem = { ...options, id: idRef.current };
      setToast(item);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setToast((current) => (current && current.id === item.id ? null : current));
      }, options.duration ?? 3000);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);
  const hasAction = Boolean(toast?.actionLabel && toast.onAction);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast ? (
          <div key={toast.id} className={`toast${hasAction ? " toast--action" : ""}`}>
            <span className="min-w-0 flex-1 truncate">{toast.message}</span>
            {hasAction ? (
              <button
                type="button"
                className="toast-action hit"
                onClick={() => {
                  toast.onAction?.();
                  dismiss();
                }}
              >
                <Undo2 size={16} strokeWidth={2.25} aria-hidden="true" />
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
