/**
 * Phase 4 B0 Sub-chunk B — EntityDrawer
 * Desktop: lateral right 520px slide-in
 * Mobile (<840px): bottom-sheet 90vh + drag handle + swipe-down close
 * Props:
 *   isOpen       — bool
 *   onClose      — fn
 *   title        — string
 *   sections     — [{id, title, content (JSX), defaultOpen?, role_visible?[]}]
 *   entity_type  — string (used as localStorage namespace for section state)
 *   user         — { role } for role-based section filtering
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';

const LS_KEY = (entity_type) => `dmx_drawer_${entity_type || 'default'}`;

function loadSectionState(entity_type) {
  try { return JSON.parse(localStorage.getItem(LS_KEY(entity_type)) || '{}'); } catch { return {}; }
}
function saveSectionState(entity_type, state) {
  try { localStorage.setItem(LS_KEY(entity_type), JSON.stringify(state)); } catch {}
}

function SectionPanel({ section, openState, onToggle, user }) {
  // Role-based visibility
  if (section.role_visible && section.role_visible.length > 0) {
    const role = user?.role || '';
    if (!section.role_visible.includes(role) && !section.role_visible.includes('*')) {
      return null;
    }
  }

  const isOpen = openState !== undefined ? openState : section.defaultOpen !== false;

  return (
    <div className="border-b border-[rgba(240,235,224,0.07)] last:border-0">
      <button
        onClick={() => onToggle(section.id)}
        data-density-drawer-section
        className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left hover:bg-[rgba(240,235,224,0.04)] transition-colors"
        data-testid={`drawer-section-${section.id}`}
      >
        <span className="flex-1 text-sm font-medium text-[rgba(240,235,224,0.8)]">{section.title}</span>
        {isOpen
          ? <ChevronDown size={13} className="text-[rgba(240,235,224,0.3)] shrink-0" />
          : <ChevronRight size={13} className="text-[rgba(240,235,224,0.3)] shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-5 pb-4 text-sm text-[rgba(240,235,224,0.65)]">
          {section.content}
        </div>
      )}
    </div>
  );
}

export function EntityDrawer({
  isOpen, onClose, title,
  sections = [], entity_type = 'default', user,
  width = 520,
  body = null,  // Phase 4 B11: custom body (bypasses sections)
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 840);
  const [sectionState, setSectionState] = useState(() => loadSectionState(entity_type));
  const touchStartY = useRef(0);
  const touchDeltaY = useRef(0);

  // Responsive detection
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 840);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Reset section state when entity_type changes
  useEffect(() => {
    setSectionState(loadSectionState(entity_type));
  }, [entity_type]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const toggleSection = useCallback((id) => {
    setSectionState(prev => {
      const current = prev[id] !== undefined ? prev[id] : true;
      const next = { ...prev, [id]: !current };
      saveSectionState(entity_type, next);
      return next;
    });
  }, [entity_type]);

  const getSectionOpen = (section) => {
    if (sectionState[section.id] !== undefined) return sectionState[section.id];
    return section.defaultOpen !== false;
  };

  // Swipe-down handlers
  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchMove = (e) => { touchDeltaY.current = e.touches[0].clientY - touchStartY.current; };
  const handleTouchEnd = () => {
    if (touchDeltaY.current > 80) onClose?.();
    touchDeltaY.current = 0;
  };

  if (!isOpen) return null;

  const panelSections = sections.map(s => (
    <SectionPanel
      key={s.id}
      section={s}
      openState={getSectionOpen(s)}
      onToggle={toggleSection}
      user={user}
    />
  ));

  const bodyContent = body != null
    ? <div className="px-5 py-4">{body}</div>
    : panelSections;

  const drawer = (
    <div className="fixed inset-0 z-[100]" data-testid="entity-drawer">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />

      {!isMobile ? (
        /* Desktop: right slide-in panel */
        <div
          className="absolute right-0 top-0 bottom-0 flex flex-col bg-[#0d1022] border-l border-[rgba(240,235,224,0.1)] shadow-2xl"
          style={{ width: `${width}px`, animation: 'slideInRight 0.22s ease-out' }}
          data-testid="entity-drawer-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(240,235,224,0.08)] shrink-0">
            <h2 className="text-[var(--cream)] font-semibold font-[Outfit]">{title}</h2>
            <button onClick={onClose} className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] transition-colors" data-testid="entity-drawer-close">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-none">{bodyContent}</div>
        </div>
      ) : (
        /* Mobile: bottom-sheet */
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col bg-[#0d1022] rounded-t-2xl border-t border-[rgba(240,235,224,0.1)] shadow-2xl"
          style={{ maxHeight: '90vh', animation: 'slideInUp 0.22s ease-out' }}
          data-testid="entity-drawer-bottom-sheet"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-[rgba(240,235,224,0.2)]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(240,235,224,0.08)] shrink-0">
            <h2 className="text-[var(--cream)] font-semibold font-[Outfit]">{title}</h2>
            <button onClick={onClose} className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)]" data-testid="entity-drawer-close-mobile">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-none">{bodyContent}</div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );

  return createPortal(drawer, document.body);
}

export default EntityDrawer;
