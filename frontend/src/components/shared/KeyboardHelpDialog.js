/**
 * Batch 19 Sub-A — KeyboardHelpDialog
 * Modal showing all keyboard shortcuts with search filter.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search } from 'lucide-react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  // Navegación
  { section: 'Navegación', combo: `${MOD}+K`,         keys: [MOD, 'K'],            desc: 'Búsqueda universal' },
  { section: 'Navegación', combo: `${MOD}+/`,         keys: [MOD, '/'],            desc: 'Cambiar proyecto (Project Switcher)' },
  { section: 'Navegación', combo: 'g h',              keys: ['g', 'h'],            desc: 'Ir al Panel principal' },
  { section: 'Navegación', combo: 'g p',              keys: ['g', 'p'],            desc: 'Ir a Mis Proyectos' },
  { section: 'Navegación', combo: 'g c',              keys: ['g', 'c'],            desc: 'Ir al CRM' },
  { section: 'Navegación', combo: 'g l',              keys: ['g', 'l'],            desc: 'Ir a Leads' },
  // Acciones
  { section: 'Acciones',   combo: `${MOD}+N`,         keys: [MOD, 'N'],            desc: 'Acción rápida contextual' },
  { section: 'Acciones',   combo: 'Esc',               keys: ['Esc'],               desc: 'Cerrar drawer / modal / dropdown' },
  // Vista
  { section: 'Vista',      combo: `${MOD}+B`,         keys: [MOD, 'B'],            desc: 'Colapsar / expandir sidebar' },
  { section: 'Vista',      combo: `${MOD}+Shift+P`,   keys: [MOD, 'Shift', 'P'],   desc: 'Modo Presentación (oculta datos sensibles)' },
  // Productividad
  { section: 'Productividad', combo: '?',              keys: ['?'],                 desc: 'Abrir este diálogo de ayuda' },
];

function KbdCombo({ keys }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          <kbd style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 6,
            background: 'rgba(240,235,224,0.08)',
            border: '1px solid rgba(240,235,224,0.2)',
            color: 'var(--cream)',
            fontFamily: 'DM Mono, monospace',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.5,
            minWidth: 22,
            textAlign: 'center',
          }}>
            {k}
          </kbd>
          {i < keys.length - 1 && (
            <span style={{ color: 'var(--cream-3)', fontSize: 11 }}>+</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function KeyboardHelpDialog({ onClose, onRestartTour }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const q = query.toLowerCase();
  const filtered = SHORTCUTS.filter(s =>
    !q || s.desc.toLowerCase().includes(q) || s.combo.toLowerCase().includes(q) || s.section.toLowerCase().includes(q)
  );

  const sections = [...new Set(filtered.map(s => s.section))];

  return (
    <div
      data-testid="keyboard-help-dialog-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        data-testid="keyboard-help-dialog"
        style={{
          width: 'min(580px, 96vw)',
          maxHeight: '80vh',
          background: 'rgba(13,16,23,0.96)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backdropFilter: 'blur(24px)',
          animation: 'khdIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 0',
        }}>
          <div>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
              color: 'var(--cream)', marginBottom: 2,
            }}>
              Atajos de teclado
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              Presiona <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(240,235,224,0.1)', border: '1px solid rgba(240,235,224,0.2)', fontSize: 10 }}>?</kbd> para abrir · <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(240,235,224,0.1)', border: '1px solid rgba(240,235,224,0.2)', fontSize: 10 }}>Esc</kbd> para cerrar
            </div>
          </div>
          <button
            data-testid="keyboard-help-close"
            onClick={onClose}
            style={{
              background: 'rgba(240,235,224,0.06)',
              border: '1px solid rgba(240,235,224,0.15)',
              borderRadius: 8, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--cream-2)',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '14px 20px 10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(240,235,224,0.06)',
            border: '1px solid rgba(240,235,224,0.15)',
            borderRadius: 10, padding: '8px 12px',
          }}>
            <Search size={14} color="var(--cream-3)" />
            <input
              ref={inputRef}
              data-testid="keyboard-help-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar atajo… (ej: lead, sidebar)"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)' }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts list */}
        <div style={{ overflowY: 'auto', padding: '0 20px 20px', flex: 1 }}>
          {sections.map(section => (
            <div key={section} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--cream-3)',
                fontFamily: 'DM Mono, monospace', marginBottom: 8,
                paddingBottom: 6, borderBottom: '1px solid rgba(240,235,224,0.07)',
              }}>
                {section}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filtered.filter(s => s.section === section).map(s => (
                  <div key={s.combo} style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 12,
                    padding: '7px 8px', borderRadius: 8,
                    transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(240,235,224,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
                      {s.desc}
                    </span>
                    <KbdCombo keys={s.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
              Sin resultados para "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(240,235,224,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
            {SHORTCUTS.length} atajos disponibles
          </span>
          {onRestartTour && (
            <button
              data-testid="keyboard-help-restart-tour"
              onClick={() => { onClose(); onRestartTour(); }}
              style={{
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.35)',
                borderRadius: 9999, padding: '5px 14px',
                color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              Ver tour onboarding
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes khdIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }`}</style>
    </div>
  );
}
