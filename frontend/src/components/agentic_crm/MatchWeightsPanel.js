/**
 * W4.7 Y.4B — MatchWeightsPanel
 * Tab "Match Weights" en TenantDrawer (Superadmin).
 * Configura pesos de matching lead↔proyecto por org + auto-tune.
 * Tier T1+ (lectura) · T2+ (edición manual).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Save, RefreshCw, Zap, AlertCircle, BarChart2, Loader2,
  ChevronRight,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WEIGHT_DIMENSIONS = [
  { key: 'zona',               label: 'Zona geográfica',      color: '#6366F1' },
  { key: 'precio',             label: 'Precio / presupuesto', color: '#EC4899' },
  { key: 'segment',            label: 'Segmento de mercado',  color: '#38BDF8' },
  { key: 'amenidades',         label: 'Amenidades',           color: '#34D399' },
  { key: 'timing',             label: 'Timing / urgencia',    color: '#FBBF24' },
  { key: 'behavioral_intent',  label: 'Intención conductual', color: '#A78BFA' },
  { key: 'disc_match',         label: 'Compatibilidad DISC',  color: '#F472B6' },
];

const DEFAULT_WEIGHTS = {
  zona: 30, precio: 25, segment: 20, amenidades: 15, timing: 10,
  behavioral_intent: 0, disc_match: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return '—'; }
}

function toPercent(decimal) {
  return Math.round((decimal || 0) * 100);
}

function toDecimal(percent) {
  return Math.round(percent) / 100;
}

function weightsToPercent(w) {
  const result = {};
  for (const k of WEIGHT_DIMENSIONS.map(d => d.key)) {
    result[k] = toPercent(w[k] || 0);
  }
  return result;
}

function weightsToDecimal(w) {
  const result = {};
  for (const k of WEIGHT_DIMENSIONS.map(d => d.key)) {
    result[k] = toDecimal(w[k] || 0);
  }
  return result;
}

function computeSum(pctWeights) {
  return WEIGHT_DIMENSIONS.reduce((acc, d) => acc + (pctWeights[d.key] || 0), 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)',
      marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
    }}>{children}</div>
  );
}

function WeightSlider({ dimension, value, onChange }) {
  const { key, label, color } = dimension;
  const pct = value || 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 500 }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            min={0} max={100}
            value={pct}
            onChange={e => {
              const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
              onChange(key, v);
            }}
            style={{
              width: 48, textAlign: 'right',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 6, padding: '3px 6px', color: color,
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, outline: 'none',
            }}
          />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.45)' }}>%</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.2s ease',
        }} />
        <input
          data-testid={`match-weights-slider-${key}`}
          type="range"
          min={0} max={100} value={pct}
          onChange={e => onChange(key, parseInt(e.target.value, 10))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />
      </div>
    </div>
  );
}

function SumIndicator({ sum }) {
  const ok = sum >= 95 && sum <= 105;
  const exact = sum === 100;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      background: ok
        ? (exact ? 'rgba(52,211,153,0.08)' : 'rgba(251,191,36,0.08)')
        : 'rgba(239,68,68,0.10)',
      border: `1px solid ${ok ? (exact ? 'rgba(52,211,153,0.30)' : 'rgba(251,191,36,0.30)') : 'rgba(239,68,68,0.30)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{
        fontFamily: 'DM Sans', fontSize: 12.5,
        color: ok ? (exact ? '#4ADE80' : '#FBBF24') : '#F87171',
      }}>
        {ok
          ? (exact ? 'Suma exacta: 100%' : `Suma: ${sum}% (dentro del margen ±5%)`)
          : `Suma: ${sum}% — debe ser 100% ± 5 para guardar`}
      </span>
      <span style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
        color: ok ? (exact ? '#4ADE80' : '#FBBF24') : '#F87171',
      }}>{sum}%</span>
    </div>
  );
}

function LayerBadge({ isSystem, changedBy }) {
  if (isSystem) {
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 9999, fontSize: 10,
        background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
        color: '#818CF8', fontFamily: 'DM Sans', fontWeight: 700,
      }}>Auto-tune</span>
    );
  }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999, fontSize: 10,
      background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.30)',
      color: '#F472B6', fontFamily: 'DM Sans', fontWeight: 700,
    }}>Manual{changedBy ? ` · ${changedBy}` : ''}</span>
  );
}

function AuditEntry({ entry }) {
  const prevSum = entry.prev_weights ? Object.values(entry.prev_weights).reduce((a, b) => a + b, 0) : 0;
  const newSum = entry.new_weights ? Object.values(entry.new_weights).reduce((a, b) => a + b, 0) : 0;

  // Compute diffs
  const diffs = WEIGHT_DIMENSIONS.map(d => {
    const prev = Math.round((entry.prev_weights?.[d.key] || 0) * 100);
    const next = Math.round((entry.new_weights?.[d.key] || 0) * 100);
    return { key: d.key, label: d.label, prev, next, delta: next - prev };
  }).filter(d => d.delta !== 0);

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 9, marginBottom: 7,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <LayerBadge isSystem={entry.changed_by_system} changedBy={entry.changed_by_user_id} />
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.35)' }}>
          {fmtDate(entry.changed_at)}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
        {diffs.length > 0 ? diffs.map(d => (
          <span key={d.key} style={{
            fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.65)',
          }}>
            {d.label}: {d.prev}%
            <ChevronRight size={10} style={{ verticalAlign: 'middle', margin: '0 2px', color: 'rgba(240,235,224,0.40)' }} />
            <span style={{ color: d.delta > 0 ? '#4ADE80' : '#F87171', fontWeight: 700 }}>
              {d.next}%
            </span>
          </span>
        )) : (
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.35)' }}>
            {entry.reason || 'sin cambios registrados'}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MatchWeightsPanel({ orgId }) {
  const [pctWeights, setPctWeights] = useState(DEFAULT_WEIGHTS);
  const [tier, setTier]             = useState('off');
  const [isDefault, setIsDefault]   = useState(true);
  const [version, setVersion]       = useState(0);
  const [lastTunedAt, setLastTuned] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [sampleSize, setSampleSize] = useState(0);
  const [auditLog, setAuditLog]     = useState([]);

  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [tuning, setTuning]         = useState(false);
  const [error, setError]           = useState('');
  const [savedMsg, setSavedMsg]     = useState('');
  const [tuneResult, setTuneResult] = useState(null);

  const tierNum = (() => {
    if (!tier || tier === 'off') return 0;
    try { return parseInt(tier.replace('T', ''), 10); } catch { return 0; }
  })();

  const sum = computeSum(pctWeights);
  const sumOk = sum >= 95 && sum <= 105;
  const canEdit = tierNum >= 2;
  const canRead = tierNum >= 1;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(
        `/api/superadmin/agentic-crm/match-weights/distribution?org_id=${encodeURIComponent(orgId)}`
      );
      const w = data.weights || {};
      setPctWeights(weightsToPercent(w));
      setTier(data.tier || 'off');
      setIsDefault(!!data.is_default);
      setVersion(data.version || 0);
      setLastTuned(data.last_tuned_at);
      setConfidence(data.tuning_confidence || 0);
      setSampleSize(data.training_sample_size || 0);
      setAuditLog(data.audit_log || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const handleSlider = (key, value) => {
    setPctWeights(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!sumOk) return;
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const decWeights = weightsToDecimal(pctWeights);
      const data = await apiFetch(`/api/agentic-crm/match-weights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: decWeights, org_id: orgId }),
      });
      setVersion(data.version || version + 1);
      setIsDefault(false);
      setSavedMsg('Pesos guardados correctamente');
      setTimeout(() => setSavedMsg(''), 3500);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoTune = async () => {
    setTuning(true);
    setError('');
    setTuneResult(null);
    try {
      const data = await apiFetch(
        `/api/agentic-crm/match-weights/auto-tune?org_id=${encodeURIComponent(orgId)}`,
        { method: 'POST' }
      );
      setTuneResult(data);
      // If result has learned_weights with sufficient confidence, suggest applying
    } catch (e) {
      setError(e.message);
    } finally {
      setTuning(false);
    }
  };

  const applyTuneResult = () => {
    if (!tuneResult?.learned_weights) return;
    const w = tuneResult.learned_weights;
    setPctWeights(weightsToPercent(w));
    setTuneResult(null);
  };

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>
        Cargando pesos de matching…
      </div>
    );
  }

  return (
    <div data-testid="match-weights-panel" style={{ paddingBottom: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>
            Pesos de Matching
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.45)', marginTop: 2 }}>
            Criterios de asignación lead↔proyecto por organización
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            data-testid="match-weights-refresh-btn"
            onClick={load}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9999, padding: '5px 10px', cursor: 'pointer', color: 'rgba(240,235,224,0.55)', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={12} />
          </button>
          {/* Status badges */}
          <span style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 10.5,
            fontFamily: 'DM Sans', fontWeight: 700,
            background: canRead ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${canRead ? 'rgba(99,102,241,0.40)' : 'rgba(255,255,255,0.12)'}`,
            color: canRead ? '#818CF8' : 'rgba(240,235,224,0.40)',
          }}>
            {tier === 'off' ? 'Sin tier' : tier}
          </span>
          {isDefault && (
            <span style={{
              padding: '3px 10px', borderRadius: 9999, fontSize: 10.5,
              fontFamily: 'DM Sans', fontWeight: 700,
              background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.30)',
              color: '#FBBF24',
            }}>
              Defaults globales
            </span>
          )}
        </div>
      </div>

      {/* Tier gate notice */}
      {!canRead && (
        <div data-testid="match-weights-tier-notice" style={{
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9,
        }}>
          <AlertCircle size={13} color="#FBBF24" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)' }}>
            Match Weights requiere tier T1+ (lectura) / T2+ (edición). Tier actual: <strong style={{ color: '#FBBF24' }}>{tier === 'off' ? 'desactivado' : tier}</strong>.
          </span>
        </div>
      )}

      {!canEdit && canRead && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)',
          marginBottom: 12, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.60)',
        }}>
          Lectura activa (T1). Para editar manualmente se requiere T2+.
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {savedMsg && (
        <div data-testid="match-weights-saved-msg" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 12 }}>
          {savedMsg}
        </div>
      )}

      {/* Sliders section */}
      <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12 }}>
        <FieldLabel>Dimensiones de matching</FieldLabel>
        {WEIGHT_DIMENSIONS.map(dim => (
          <WeightSlider
            key={dim.key}
            dimension={dim}
            value={pctWeights[dim.key] || 0}
            onChange={canEdit ? handleSlider : () => {}}
          />
        ))}
        <SumIndicator sum={sum} />
      </div>

      {/* Tune result preview */}
      {tuneResult && (
        <div data-testid="match-weights-tune-result" style={{ padding: '14px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)' }}>
              Resultado Auto-tune
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700,
              background: tuneResult.confidence > 50 ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
              border: `1px solid ${tuneResult.confidence > 50 ? 'rgba(52,211,153,0.30)' : 'rgba(251,191,36,0.30)'}`,
              color: tuneResult.confidence > 50 ? '#4ADE80' : '#FBBF24',
            }}>
              Confianza {tuneResult.confidence}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.60)' }}>
              Muestra: <strong style={{ color: 'var(--cream)' }}>{tuneResult.training_sample_size}</strong> cierres
            </span>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.60)' }}>
              Razón: <strong style={{ color: 'var(--cream)' }}>{tuneResult.reason || '—'}</strong>
            </span>
          </div>
          {tuneResult.learned_weights && tuneResult.confidence > 0 && (
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {WEIGHT_DIMENSIONS.filter(d => ['zona','precio','segment','amenidades','timing'].includes(d.key)).map(d => {
                  const val = Math.round((tuneResult.learned_weights[d.key] || 0) * 100);
                  return (
                    <span key={d.key} style={{
                      padding: '3px 9px', borderRadius: 9999, fontSize: 11,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                      color: d.color || 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 600,
                    }}>
                      {d.label}: <strong>{val}%</strong>
                    </span>
                  );
                })}
              </div>
              {canEdit && tuneResult.confidence > 50 && (
                <button
                  data-testid="match-weights-apply-tune-btn"
                  onClick={applyTuneResult}
                  style={{
                    padding: '8px 16px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                    color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                  }}
                >
                  Aplicar pesos aprendidos a los sliders
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          data-testid="match-weights-save-btn"
          onClick={handleSave}
          disabled={saving || !canEdit || !sumOk}
          title={!canEdit ? 'Requiere tier T2+' : (!sumOk ? `Suma actual: ${sum}%. Debe ser 100% ± 5%` : undefined)}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 9999, border: 'none',
            cursor: (canEdit && sumOk && !saving) ? 'pointer' : 'not-allowed',
            background: (canEdit && sumOk && !saving) ? 'linear-gradient(90deg, #6366F1, #EC4899)' : 'rgba(255,255,255,0.08)',
            color: (canEdit && sumOk) ? '#fff' : 'rgba(240,235,224,0.35)',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'background 0.25s',
          }}
        >
          {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Guardando…</> : <><Save size={13} /> Guardar pesos</>}
        </button>
        <button
          data-testid="match-weights-autotune-btn"
          onClick={handleAutoTune}
          disabled={tuning}
          style={{
            padding: '10px 16px', borderRadius: 9999, cursor: tuning ? 'not-allowed' : 'pointer',
            background: 'transparent', border: '1px solid rgba(99,102,241,0.40)',
            color: tuning ? 'rgba(240,235,224,0.35)' : '#818CF8',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'color 0.2s',
          }}
        >
          {tuning ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analizando…</> : <><Zap size={13} /> Auto-tune</>}
        </button>
      </div>

      {/* Meta footer */}
      <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.40)' }}>
            Versión: <strong style={{ color: 'rgba(240,235,224,0.65)' }}>v{version}</strong>
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.40)' }}>
            Último tune: <strong style={{ color: 'rgba(240,235,224,0.65)' }}>{fmtDate(lastTunedAt)}</strong>
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.40)' }}>
            Confianza: <strong style={{ color: confidence > 50 ? '#4ADE80' : '#FBBF24' }}>{confidence}%</strong>
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.40)' }}>
            Muestra: <strong style={{ color: 'rgba(240,235,224,0.65)' }}>{sampleSize} cierres</strong>
          </span>
        </div>
      </div>

      {/* Audit log */}
      {auditLog.length > 0 && (
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Historial de cambios
          </div>
          {auditLog.slice(-10).reverse().map((entry, i) => (
            <AuditEntry key={i} entry={entry} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
