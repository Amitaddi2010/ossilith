'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warn';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextType {
  toast: (msg: Omit<ToastMessage, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warn: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type, title, description }: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  const success = useCallback((title: string, description?: string) => addToast({ type: 'success', title, description }), [addToast]);
  const error = useCallback((title: string, description?: string) => addToast({ type: 'error', title, description }), [addToast]);
  const info = useCallback((title: string, description?: string) => addToast({ type: 'info', title, description }), [addToast]);
  const warn = useCallback((title: string, description?: string) => addToast({ type: 'warn', title, description }), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info, warn }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => {
          let Icon = CheckCircle2;
          let iconColor = '#00e575';
          if (t.type === 'error') {
            Icon = AlertCircle;
            iconColor = '#ef4444';
          } else if (t.type === 'info') {
            Icon = Info;
            iconColor = '#3b82f6';
          } else if (t.type === 'warn') {
            Icon = AlertTriangle;
            iconColor = '#f59e0b';
          }

          return (
            <div key={t.id} className={`toast-item toast-${t.type}`}>
              <Icon size={18} color={iconColor} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--color-forest-ink)' }}>{t.title}</div>
                {t.description && (
                  <div style={{ fontSize: 12, color: 'var(--color-charcoal-muted)', marginTop: 2 }}>
                    {t.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-charcoal-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
    };
  }
  return context;
}
