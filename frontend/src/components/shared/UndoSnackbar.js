/**
 * Phase 4 B0 Sub-chunk B — UndoSnackbar + useUndo hook
 * Stackable undo notifications (bottom-right) with countdown bar.
 * Usage:
 *   Wrap root with <UndoProvider>
 *   const { showUndo } = useUndo()
 *   showUndo({ message: 'Lead eliminado', onUndo: () => restore(), timeout: 30000 })
 */
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';

const UndoContext = createContext(null);

let _counter = 0;

function CountdownBar({ timeout, startAt }) {
  const [pct, setPct] = useState(100);
  const rafRef = useRef(null);

  useEffect(() => {
    const animate = (now) => {
      const elapsed = now - startAt;
      const remaining = Math.max(0, 100 - (elapsed / timeout) * 100);
      setPct(remaining);
      if (remaining > 0) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [timeout, startAt]);

  return (
    <div className="h-[2px] w-full bg-[rgba(240,235,224,0.08)] rounded-full overflow-hidden mt-2">
      <div
        className="h-full rounded-full transition-none"
        style={{
          width: `${pct}%`,
          backgroundColor: pct > 50 ? '#4ade80' : pct > 20 ? '#fbbf24' : '#f87171',
        }}
      />
    </div>
  );
}

function SnackItem({ item, onUndo, onDismiss }) {
  return (
    <div
      className="pointer-events-auto w-[320px] rounded-xl bg-[rgba(13,16,23,0.92)] border border-[rgba(255,255,255,0.16)] backdrop-blur-[24px] px-4 py-3"
      style={{ animation: 'fadeInUp 0.2s ease-out' }}
      data-testid={`undo-snackbar-${item.id}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[rgba(240,235,224,0.8)] text-sm leading-snug">{item.message}</span>
        <button
          onClick={() => onUndo(item)}
          className="flex items-center gap-1.5 text-[var(--cream)] text-sm font-semibold hover:opacity-75 transition-opacity shrink-0"
          data-testid="undo-btn"
        >
          <RotateCcw size={13} />
          Deshacer
        </button>
        <button
          onClick={() => onDismiss(item.id)}
          className="text-[rgba(240,235,224,0.3)] hover:text-[rgba(240,235,224,0.7)] transition-colors shrink-0"
          data-testid="undo-dismiss-btn"
        >
          <X size={14} />
        </button>
      </div>
      <CountdownBar timeout={item.timeout} startAt={item.startAt} />
    </div>
  );
}

export function UndoProvider({ children }) {
  const [stack, setStack] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setStack(prev => prev.filter(s => s.id !== id));
  }, []);

  const showUndo = useCallback(({ message, onUndo, timeout = 30000 }) => {
    const id = ++_counter;
    const startAt = performance.now();
    setStack(prev => [...prev, { id, message, onUndo, timeout, startAt }]);
    timers.current[id] = setTimeout(() => dismiss(id), timeout);
    return id;
  }, [dismiss]);

  const handleUndo = useCallback((item) => {
    item.onUndo?.();
    dismiss(item.id);
  }, [dismiss]);

  return (
    <UndoContext.Provider value={{ showUndo }}>
      {children}
      {stack.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[400] flex flex-col-reverse items-end gap-2 pointer-events-none">
          {stack.map(item => (
            <SnackItem
              key={item.id}
              item={item}
              onUndo={handleUndo}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) return { showUndo: () => {} };
  return ctx;
}

/**
 * Phase 4 Batch 17 — Server-persisted undo hook.
 * Wraps showUndo() and calls POST /api/undo/{undoId} when user clicks "Deshacer".
 *
 * Usage:
 *   const { showServerUndo } = useServerUndo();
 *   showServerUndo({ message: 'Lead movido a Negociación', undoId: 'undo_xxx',
 *                    onRestored: () => refetch() });
 */
export function useServerUndo() {
  const { showUndo } = useUndo();
  const showServerUndo = useCallback(({ message, undoId, onRestored, timeout = 10000 }) => {
    if (!undoId) return null;
    return showUndo({
      message,
      timeout,
      onUndo: async () => {
        try {
          const API = process.env.REACT_APP_BACKEND_URL;
          const res = await fetch(`${API}/api/undo/${undoId}`, {
            method: 'POST', credentials: 'include',
          });
          if (res.ok) onRestored?.();
        } catch {}
      },
    });
  }, [showUndo]);
  return { showServerUndo };
}

export default UndoProvider;
