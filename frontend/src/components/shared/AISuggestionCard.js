/**
 * Phase 4 Batch 16 · Sub-Chunk A — <AISuggestionCard />
 *
 * Props:
 *   entityType: 'project' | 'lead' | 'unit' | 'asesor' | 'appointment'
 *   entityId: string
 *   compact?: boolean  — denser style for drawers
 *   onNavigate?: (path: string) => void
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchSuggestions, dismissSuggestion, acceptSuggestion,
} from '../../api/aiSuggestions';
import { Sparkle, RefreshCw, X, Check, ArrowRight } from '../icons';

const TYPE_COLORS = {
  next_action: { bg: 'rgba(99,102,241,0.14)', border: 'rgba(99,102,241,0.35)', label: 'Siguiente acción' },
  risk:        { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.32)',  label: 'Riesgo' },
  opportunity: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.30)', label: 'Oportunidad' },
  insight:     { bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.30)', label: 'Insight' },
};

function parseCta(cta) {
  if (!cta) return null;
  if (cta.startsWith('open_url:')) return { kind: 'navigate', value: cta.slice(9).trim() };
  if (cta === 'log_activity') return { kind: 'log', value: '' };
  if (cta === 'dismiss') return { kind: 'dismiss', value: '' };
  if (cta.startsWith('/')) return { kind: 'navigate', value: cta };
  return null;
}

export function AISuggestionCard({ entityType, entityId, compact = false, onNavigate }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    try {
      force ? setRefreshing(true) : setLoading(true);
      const data = await fetchSuggestions(entityType, entityId, { force });
      setItems(data.items || []);
      setError(null);
    } catch (e) {
      setError('No se pudo cargar');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { if (entityType && entityId) load(false); }, [load, entityType, entityId]);

  const onDismiss = async (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    try { await dismissSuggestion(id); } catch {}
  };

  const onAccept = async (s) => {
    setItems((prev) => prev.filter((x) => x.id !== s.id));
    try { await acceptSuggestion(s.id); } catch {}
    const cta = parseCta(s.cta_action);
    if (cta?.kind === 'navigate') {
      if (onNavigate) onNavigate(cta.value);
      else window.location.assign(cta.value);
    }
  };

  if (loading) {
    return (
      <div
        data-testid="ai-suggestions-loading"
        style={{
          padding: compact ? 10 : 14, borderRadius: 12,
          background: 'rgba(240,235,224,0.04)',
          border: '1px solid rgba(240,235,224,0.08)',
          color: 'rgba(240,235,224,0.45)', fontFamily: 'DM Sans', fontSize: 13,
        }}
      >
        Cargando sugerencias…
      </div>
    );
  }

  if (error) return null; // silent fail — suggestions are optional UX

  if (!items.length) {
    return compact ? null : (
      <div
        data-testid="ai-suggestions-empty"
        style={{
          padding: 12, borderRadius: 12,
          background: 'rgba(240,235,224,0.03)',
          border: '1px dashed rgba(240,235,224,0.12)',
          color: 'rgba(240,235,224,0.38)', fontFamily: 'DM Sans', fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>Sin sugerencias activas de la IA.</span>
        <button
          data-testid="ai-suggestions-refresh-empty"
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'var(--cream-2, rgba(240,235,224,0.65))',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <RefreshCw size={12} /> Generar
        </button>
      </div>
    );
  }

  return (
    <div data-testid="ai-suggestions-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 2,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'rgba(240,235,224,0.58)', fontFamily: 'DM Sans',
          fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase',
        }}>
          <Sparkle size={13} />
          <span>Sugerencias IA · {items.length}</span>
        </div>
        <button
          data-testid="ai-suggestions-refresh"
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'rgba(240,235,224,0.55)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
            fontFamily: 'DM Sans',
          }}
        >
          <RefreshCw size={11} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : {}} />
          Regenerar
        </button>
      </div>
      {items.map((s) => {
        const color = TYPE_COLORS[s.suggestion_type] || TYPE_COLORS.insight;
        const cta = parseCta(s.cta_action);
        return (
          <div
            key={s.id}
            data-testid={`ai-suggestion-card-${s.id}`}
            style={{
              padding: compact ? 10 : 12,
              borderRadius: 12,
              background: color.bg,
              border: `1px solid ${color.border}`,
              fontFamily: 'DM Sans',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
                  color: 'rgba(240,235,224,0.55)', marginBottom: 3,
                }}>
                  {color.label}
                </div>
                <div style={{
                  fontWeight: 600, fontSize: compact ? 13 : 14,
                  color: 'var(--cream, #F0EBE0)', lineHeight: 1.3,
                }}>
                  {s.title}
                </div>
              </div>
              <button
                data-testid={`ai-suggestion-dismiss-${s.id}`}
                onClick={() => onDismiss(s.id)}
                aria-label="Descartar"
                style={{
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'rgba(240,235,224,0.45)', padding: 2,
                }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{
              fontSize: compact ? 12 : 13, color: 'rgba(240,235,224,0.78)',
              lineHeight: 1.45,
            }}>
              {s.body}
            </div>
            {cta && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                <button
                  data-testid={`ai-suggestion-accept-${s.id}`}
                  onClick={() => onAccept(s)}
                  style={{
                    background: 'var(--cream, #F0EBE0)',
                    color: 'var(--bg, #06080F)',
                    border: 0, borderRadius: 9999,
                    padding: '5px 12px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'DM Sans',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Check size={12} /> {s.cta_label || 'Aceptar'}
                  <ArrowRight size={11} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AISuggestionCard;
