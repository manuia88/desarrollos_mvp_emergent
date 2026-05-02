/**
 * Phase 4 Batch 0 — EntityDrawer
 * Lateral drawer (desktop) / bottom sheet (mobile) with collapsible sections.
 * Props:
 *   open: bool
 *   title: string
 *   sections: [{ key, label, icon: Icon, content_component, default_open?, visible_to_roles? }]
 *   actions_footer: JSX
 *   on_close: fn
 *   user: user object (for role-based section visibility)
 */
import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';

function SectionPanel({ section, user }) {
  const [open, setOpen] = useState(section.default_open !== false);

  // Role-based visibility
  if (section.visible_to_roles && user) {
    const role = user.role || '';
    if (!section.visible_to_roles.includes(role) && !section.visible_to_roles.includes('*')) {
      return null;
    }
  }

  const Content = section.content_component;
  return (
    <div className="border-b border-[rgba(240,235,224,0.07)] last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[rgba(240,235,224,0.04)] transition-colors"
        data-testid={`drawer-section-${section.key}`}
      >
        {section.icon && <section.icon size={14} className="text-[rgba(240,235,224,0.45)] shrink-0" />}
        <span className="flex-1 text-sm font-medium text-[rgba(240,235,224,0.75)]">{section.label}</span>
        {open
          ? <ChevronDown size={13} className="text-[rgba(240,235,224,0.3)]" />
          : <ChevronRight size={13} className="text-[rgba(240,235,224,0.3)]" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {Content ? <Content /> : null}
        </div>
      )}
    </div>
  );
}

export function EntityDrawer({ open, title, sections = [], actions_footer, on_close, user, width = 520 }) {
  const overlayRef = useRef(null);

  // ESC to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && open) on_close?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, on_close]);

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const drawer = (
    <div className="fixed inset-0 z-[100]" data-testid="entity-drawer">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={on_close}
      />

      {/* Desktop lateral drawer */}
      <div
        className={`absolute right-0 top-0 bottom-0 bg-[#0f1320] border-l border-[rgba(240,235,224,0.1)] shadow-2xl flex flex-col hidden md:flex transition-transform duration-300`}
        style={{ width: `${width}px` }}
        data-testid="entity-drawer-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[rgba(240,235,224,0.08)] shrink-0">
          <h2 className="text-[var(--cream)] font-semibold">{title}</h2>
          <button
            onClick={on_close}
            className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] transition-colors"
            data-testid="entity-drawer-close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto">
          {sections.map(s => (
            <SectionPanel key={s.key} section={s} user={user} />
          ))}
        </div>

        {/* Footer */}
        {actions_footer && (
          <div className="shrink-0 border-t border-[rgba(240,235,224,0.08)] px-4 py-3">
            {actions_footer}
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-[#0f1320] rounded-t-2xl border-t border-[rgba(240,235,224,0.1)] shadow-2xl flex flex-col max-h-[85vh] md:hidden"
        data-testid="entity-drawer-bottom-sheet"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[rgba(240,235,224,0.2)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(240,235,224,0.08)] shrink-0">
          <h2 className="text-[var(--cream)] font-semibold">{title}</h2>
          <button onClick={on_close} className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)]">
            <X size={18} />
          </button>
        </div>
        {/* Sections */}
        <div className="flex-1 overflow-y-auto">
          {sections.map(s => (
            <SectionPanel key={s.key} section={s} user={user} />
          ))}
        </div>
        {actions_footer && (
          <div className="shrink-0 border-t border-[rgba(240,235,224,0.08)] px-4 py-3">
            {actions_footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}

export default EntityDrawer;
