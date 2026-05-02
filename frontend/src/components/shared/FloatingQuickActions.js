/**
 * Phase 4 Batch 0 — FloatingQuickActions
 * Floating action button (FAB) bottom-right with expandable actions.
 * Props: actions=[{ label, icon: Icon, onClick, primary? }]
 */
import React, { useState, useEffect, useRef } from 'react';
import { Plus, X } from '../../components/icons';

export function FloatingQuickActions({ actions = [], className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!actions.length) return null;

  return (
    <div ref={ref} className={`fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 ${className}`} data-testid="floating-quick-actions">
      {/* Action items */}
      {open && (
        <div className="flex flex-col items-end gap-2">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={() => { a.onClick?.(); setOpen(false); }}
              data-testid={a.testId || `fqa-action-${i}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0f1320] border border-[rgba(240,235,224,0.12)] text-[var(--cream)] text-sm shadow-xl hover:border-[rgba(240,235,224,0.25)] transition-all"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {a.icon && <a.icon size={14} />}
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="fqa-main-btn"
        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all duration-200
          ${open
            ? 'bg-[var(--cream)] text-[var(--navy)] rotate-45'
            : 'bg-[var(--cream)] text-[var(--navy)] hover:scale-110'}`}
      >
        {open ? <X size={20} /> : <Plus size={20} />}
      </button>
    </div>
  );
}

export default FloatingQuickActions;
