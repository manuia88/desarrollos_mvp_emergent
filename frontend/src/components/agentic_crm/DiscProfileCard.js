/**
 * W4.6 Y.3D — DiscProfileCard
 * Card visual del perfil DISC del comprador · 4 score bars + communication
 * preferences + recommended approach + evidence colapsable + refresh.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  User, Cpu, Database, Zap, ChevronDown, ChevronRight,
  RefreshCw, Loader2, AlertCircle,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

const TYPE_META = {
  D: { label: 'Dominante',  color: '#EF4444' },
  I: { label: 'Influyente', color: '#F97316' },
  S: { label: 'Estable',    color: '#10B981' },
  C: { label: 'Concienzudo', color: '#3B82F6' },
};

const LAYER_META = {
  llm:       { label: 'LLM',        color: '#6366F1', Icon: Cpu },
  cached:    { label: 'Caché',      color: '#F59E0B', Icon: Database },
  cache:     { label: 'Caché',      color: '#F59E0B', Icon: Database },
  heuristic: { label: 'Heurística', color: '#94A3B8', Icon: Zap },
};

const TONE_LABEL = {
  direct: 'Directo', warm: 'Cálido', patient: 'Paciente', formal: 'Formal',
};
const LENGTH_LABEL = {
  concise: 'Conciso', moderate: 'Moderado', detailed: 'Detallado',
};
const URGENCY_LABEL = {
  immediate: 'Inmediato', 'warm-up': 'Calentamiento',
  methodical: 'Metódico', 'data-driven': 'Datos primero',
};
const CHANNEL_LABEL = {
  call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email',
};

function Pill({ label, color, Icon, testid }) {
  return (
    <span
      data-testid={testid}
      style={{
        padding: '2px 9px', borderRadius: 9999, fontSize: 10.5,
        fontFamily: 'DM Sans', fontWeight: 700,
        background: `${color}22`, border: `1px solid ${color}44`, color,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      {Icon ? <Icon size={10} /> : null}
      {label}
    </span>
  );
}

function ScoreBar({ dimension, label, value, color, isPredominant }) {
  return (
    <div data-testid={`disc-bar-${dimension}`} style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
      }}>
        <div style={{
          fontFamily: 'DM Sans', fontWeight: isPredominant ? 700 : 500,
          fontSize: 12, color: isPredominant ? color : 'var(--cream)',
          letterSpacing: '0.02em',
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 13,
          color: isPredominant ? color : 'var(--cream-2)',
        }}>
          {value}
        </div>
      </div>
      <div style={{
        height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          background: isPredominant
            ? 'linear-gradient(90deg, #6366F1, #EC4899)'
            : color,
          opacity: isPredominant ? 1 : 0.55,
          transition: 'width 600ms ease',
        }} />
      </div>
    </div>
  );
}

function PillButton({ children, onClick, variant = 'primary', disabled, testid, Icon }) {
  const styles = {
    primary: { background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.18)' },
  };
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full"
      style={{
        ...styles[variant],
        padding: '6px 14px', borderRadius: 9999, fontFamily: 'DM Sans',
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'transform 120ms ease, opacity 120ms ease',
      }}
    >
      {Icon ? <Icon size={12} /> : null}
      {children}
    </button>
  );
}

export default function DiscProfileCard({ leadId, leadName }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/agentic-crm/disc/${encodeURIComponent(leadId)}`);
      setProfile(data);
    } catch (e) {
      setError(e.message || 'Error al cargar perfil DISC');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    if (!leadId) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await apiFetch(
        `/api/agentic-crm/disc/${encodeURIComponent(leadId)}/refresh`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      setProfile(data);
    } catch (e) {
      setError(e.message || 'No se pudo refrescar el perfil');
    } finally {
      setRefreshing(false);
    }
  };

  const typeMeta = useMemo(() => {
    if (!profile) return null;
    return TYPE_META[profile.predominant_type] || TYPE_META.S;
  }, [profile]);

  const layerMeta = useMemo(() => {
    if (!profile) return null;
    return LAYER_META[profile.layer_used] || LAYER_META.heuristic;
  }, [profile]);

  if (!leadId) return null;

  return (
    <div
      data-testid="disc-profile-card"
      style={{
        background: 'rgba(13,16,23,0.92)',
        border: '1px solid rgba(240,235,224,0.12)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 16, padding: 18, marginBottom: 16,
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 10, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <User size={18} style={{ color: '#A5B4FC' }} />
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--cream-3)', fontWeight: 700,
            }}>
              CRM · Perfil DISC
            </div>
            <div
              data-testid="disc-card-title"
              style={{ fontFamily: 'Outfit', fontSize: 16, fontWeight: 700, color: 'var(--cream)' }}
            >
              {leadName || leadId}
            </div>
          </div>
        </div>
        {profile && typeMeta ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill
              label={`${profile.predominant_type} · ${typeMeta.label}`}
              color={typeMeta.color}
              testid="disc-predominant-pill"
            />
            <Pill
              label={`${profile.confidence_score}%`}
              color="#94A3B8"
              testid="disc-confidence-pill"
            />
            {layerMeta ? (
              <Pill label={layerMeta.label} color={layerMeta.color} Icon={layerMeta.Icon} />
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          data-testid="disc-error"
          style={{
            padding: 12, marginBottom: 12,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.32)',
            borderRadius: 12, color: '#FCA5A5',
            fontFamily: 'DM Sans', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <AlertCircle size={12} /> {error}
        </div>
      ) : null}

      {loading ? (
        <div
          data-testid="disc-loading"
          style={{
            padding: 32, textAlign: 'center', color: 'var(--cream-3)',
            fontFamily: 'DM Sans', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Loader2 size={14} className="animate-spin" /> Inferiendo perfil DISC…
        </div>
      ) : null}

      {!loading && profile ? (
        <>
          {/* Score bars */}
          <div data-testid="disc-scores" style={{ marginBottom: 14 }}>
            {['dominante', 'influyente', 'estable', 'concienzudo'].map((d) => {
              const key = { dominante: 'D', influyente: 'I', estable: 'S', concienzudo: 'C' }[d];
              const tm = TYPE_META[key];
              return (
                <ScoreBar
                  key={d}
                  dimension={d}
                  label={`${key} · ${tm.label}`}
                  value={(profile.scores || {})[d] || 0}
                  color={tm.color}
                  isPredominant={profile.predominant_type === key}
                />
              );
            })}
          </div>

          {/* Communication preferences */}
          <div
            data-testid="disc-comm-prefs"
            style={{
              padding: 12, marginBottom: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)', borderRadius: 12,
            }}
          >
            <div style={{
              fontSize: 10, color: '#A5B4FC', textTransform: 'uppercase',
              letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8,
            }}>
              Cómo hablar con este comprador
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                <span style={{ color: 'var(--cream-3)' }}>Tono · </span>
                <strong style={{ color: 'var(--cream)' }}>
                  {TONE_LABEL[(profile.communication_preferences || {}).tone] || '—'}
                </strong>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                <span style={{ color: 'var(--cream-3)' }}>Longitud · </span>
                <strong style={{ color: 'var(--cream)' }}>
                  {LENGTH_LABEL[(profile.communication_preferences || {}).length_preference] || '—'}
                </strong>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                <span style={{ color: 'var(--cream-3)' }}>Urgencia · </span>
                <strong style={{ color: 'var(--cream)' }}>
                  {URGENCY_LABEL[(profile.communication_preferences || {}).urgency_response] || '—'}
                </strong>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                <span style={{ color: 'var(--cream-3)' }}>Canal · </span>
                <strong style={{ color: 'var(--cream)' }}>
                  {CHANNEL_LABEL[(profile.communication_preferences || {}).preferred_channel] || '—'}
                </strong>
              </div>
            </div>
          </div>

          {/* Approach */}
          {profile.recommended_approach_text ? (
            <div
              data-testid="disc-approach"
              style={{
                padding: 12, marginBottom: 12,
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.24)',
                borderRadius: 12,
              }}
            >
              <div style={{
                fontSize: 10, color: '#A5B4FC', textTransform: 'uppercase',
                letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6,
              }}>
                Approach recomendado
              </div>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)',
                lineHeight: 1.6,
              }}>
                {profile.recommended_approach_text}
              </div>
            </div>
          ) : null}

          {/* Evidence colapsable */}
          <button
            data-testid="disc-evidence-toggle"
            onClick={() => setEvidenceOpen((v) => !v)}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--cream-3)', fontFamily: 'DM Sans',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 0', marginBottom: 6,
            }}
          >
            {evidenceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Evidencia
          </button>

          {evidenceOpen ? (
            <div
              data-testid="disc-evidence"
              style={{
                padding: 12, marginBottom: 12,
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed var(--border)', borderRadius: 12,
                fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)',
              }}
            >
              {[
                ['behavioral_signals', 'Behavioral'],
                ['chat_signals', 'Chat'],
                ['reply_signals', 'Email replies'],
              ].map(([k, label]) => {
                const arr = (profile.evidence || {})[k] || [];
                if (arr.length === 0) return null;
                return (
                  <div key={k} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase',
                      letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4,
                    }}>
                      {label}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {arr.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
                    </ul>
                  </div>
                );
              })}
              {(['behavioral_signals', 'chat_signals', 'reply_signals']
                .every(k => ((profile.evidence || {})[k] || []).length === 0)) ? (
                <div style={{ color: 'var(--cream-3)' }}>Sin evidencia concreta acumulada todavía.</div>
              ) : null}
            </div>
          ) : null}

          {/* Refresh button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PillButton
              onClick={handleRefresh}
              disabled={refreshing}
              variant="ghost"
              testid="disc-refresh-btn"
              Icon={refreshing ? Loader2 : RefreshCw}
            >
              {refreshing ? 'Refrescando…' : 'Refrescar perfil'}
            </PillButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
