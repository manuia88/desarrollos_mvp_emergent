/**
 * Phase 4 Batch 16 · Sub-Chunk B — <SmartEmptyState />
 *
 * Reusable wrapper for "no data" panels. Renders a title, body,
 * and contextual CTAs read from /src/config/emptyStates.js.
 *
 * Props:
 *   contextKey: string (must match a key in EMPTY_STATES)
 *   onAction?: (actionKey: string) => void
 *   overrides?: { title, body, ctas } — runtime override of static copy
 *   compact?: boolean
 *   testId?: string
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getEmptyState } from '../../config/emptyStates';
import { Sparkle } from '../icons';

export function SmartEmptyState({
  contextKey, onAction, overrides, compact = false,
  testId = 'smart-empty-state',
}) {
  const navigate = useNavigate();
  const base = getEmptyState(contextKey);
  const state = { ...base, ...(overrides || {}) };
  const ctas = overrides?.ctas || base.ctas || [];

  const handle = (cta) => {
    if (cta.href) { navigate(cta.href); return; }
    if (onAction) onAction(cta.key);
  };

  return (
    <div
      data-testid={testId}
      data-context-key={contextKey}
      style={{
        padding: compact ? '24px 18px' : '40px 28px',
        borderRadius: 16,
        background: 'rgba(240,235,224,0.03)',
        border: '1px dashed rgba(240,235,224,0.14)',
        textAlign: 'center',
        fontFamily: 'DM Sans',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 9999,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(236,72,153,0.25))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--cream, #F0EBE0)', marginBottom: 4,
      }}>
        <Sparkle size={20} />
      </div>
      <h3 style={{
        margin: 0, fontFamily: 'Outfit',
        fontSize: compact ? 16 : 18, fontWeight: 600,
        color: 'var(--cream, #F0EBE0)',
      }}>
        {state.title}
      </h3>
      <p style={{
        margin: 0, maxWidth: 420,
        fontSize: compact ? 13 : 14, lineHeight: 1.5,
        color: 'rgba(240,235,224,0.6)',
      }}>
        {state.body}
      </p>
      {ctas.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
          justifyContent: 'center', marginTop: 10,
        }}>
          {ctas.map((cta) => (
            <button
              key={cta.key}
              data-testid={cta.testId || `empty-cta-${cta.key}`}
              onClick={() => handle(cta)}
              style={{
                padding: '8px 16px', borderRadius: 9999,
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: 0,
                background: cta.primary
                  ? 'var(--cream, #F0EBE0)'
                  : 'transparent',
                color: cta.primary
                  ? 'var(--bg, #06080F)'
                  : 'var(--cream, #F0EBE0)',
                borderStyle: cta.primary ? 'none' : 'solid',
                borderWidth: cta.primary ? 0 : 1,
                borderColor: cta.primary ? 'transparent' : 'rgba(240,235,224,0.2)',
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {cta.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SmartEmptyState;
