/**
 * Phase 4 Batch 0 — UndoSnackbar + useUndo hook
 * 30-second undo snackbar. Stackable. Provider-based.
 */
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';

const UndoContext = createContext(null);

let _idCounter = 0;

export function UndoProvider({ children }) {
  const [stack, setStack] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setStack(prev => prev.filter(s => s.id !== id));
  }, []);

  const trigger = useCallback((label, undo_fn) => {
    const id = ++_idCounter;
    setStack(prev => [...prev, { id, label, undo_fn }]);
    timers.current[id] = setTimeout(() => dismiss(id), 30000);
    return id;
  }, [dismiss]);

  const handleUndo = useCallback((item) => {
    item.undo_fn?.();
    dismiss(item.id);
  }, [dismiss]);

  return (
    <UndoContext.Provider value={{ trigger }}>
      {children}
      {/* Snackbar container */}
      {stack.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-2 pointer-events-none">
          {stack.map(item => (
            <div
              key={item.id}
              className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1a2035] border border-[rgba(240,235,224,0.15)] shadow-2xl text-[var(--cream)] text-sm animate-fade-in-up"
              data-testid={`undo-snackbar-${item.id}`}
            >
              <span className="text-[rgba(240,235,224,0.8)]">{item.label}</span>
              <button
                onClick={() => handleUndo(item)}
                className="flex items-center gap-1 text-[var(--cream)] font-semibold hover:opacity-80 transition-opacity"
                data-testid="undo-btn"
              >
                <RotateCcw size={12} />
                Deshacer
              </button>
              <button
                onClick={() => dismiss(item.id)}
                className="text-[rgba(240,235,224,0.3)] hover:text-[var(--cream)] transition-colors"
                data-testid="undo-dismiss-btn"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    // Graceful fallback when provider not present
    return { trigger: () => {} };
  }
  return ctx;
}

export default UndoProvider;
