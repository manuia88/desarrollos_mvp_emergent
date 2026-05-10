// W4.14 — BuyerCoachWidget · floating button bottom-right para páginas públicas
// NO renderiza en /portal/*
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import BuyerCoachConversation from './BuyerCoachConversation';

export default function BuyerCoachWidget({ colonia = '' }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // No renderizar en rutas del portal
  const isPortal = location.pathname.startsWith('/portal') ||
    location.pathname.startsWith('/asesor') ||
    location.pathname.startsWith('/superadmin') ||
    location.pathname.startsWith('/desarrollador') ||
    location.pathname.startsWith('/comprador');
  if (isPortal) return null;

  return (
    <>
      {/* Floating action button */}
      <div
        data-testid="buyer-coach-fab"
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 8888,
        }}
      >
        {!open && (
          <button
            onClick={() => setOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              color: '#fff',
              border: 'none',
              borderRadius: 9999,
              padding: '11px 18px',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(99,102,241,0.35)',
              transition: 'transform 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Asesor de Compra
          </button>
        )}
      </div>

      {/* Modal / drawer */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9900,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          padding: '0 20px 20px',
          pointerEvents: 'none',
        }}>
          <div
            data-testid="buyer-coach-modal"
            style={{
              width: 420, height: 580,
              background: 'rgba(13,16,23,0.97)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
              pointerEvents: 'all',
              animation: 'slideUp 0.25s ease',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                  Asesor de Compra
                </span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginLeft: 8 }}>
                  DMX
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--cream-3)', fontSize: 16, lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            {/* Conversation */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <BuyerCoachConversation colonia={colonia} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
