/**
 * W4.3 — D.2 · PhaseYControlsPanel
 * Panel de configuración Phase Y por org. Montado como tab en TenantDrawer.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

const FEATURE_LABELS = {
  diagnostic_engine:     'Diagnostic Engine',
  recommendation_banner: 'Banner Recomendaciones',
  comparable_alerts:     'Alertas Comparables',
  lead_nurture:          'Lead Nurture',
  pricing_agent:         'Agente Precios',
  marketing_agent:       'Agente Marketing',
  lead_agent:            'Agente Leads',
  construction_agent:    'Agente Construcción',
  compliance_agent:      'Agente Compliance',
};

const TIER_OPTIONS = [
  { value: 'off', label: 'off',   desc: 'Desactivado' },
  { value: 'T1',  label: 'T1',    desc: 'Solo lectura' },
  { value: 'T2',  label: 'T2',    desc: 'Trigger manual' },
  { value: 'T3',  label: 'T3',    desc: 'Batch diario' },
  { value: 'T4',  label: 'T4',    desc: 'Autónomo' },
];

const TIER_COLORS = {
  off: 'rgba(240,235,224,0.30)',
  T1:  '#60A5FA',
  T2:  '#4ADE80',
  T3:  '#FBBF24',
  T4:  'var(--theme)',
};

async function fetchSettings(orgId) {
  const r = await fetch(`${API}/api/superadmin/phase-y/${encodeURIComponent(orgId)}`, {
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function patchSettings(orgId, body) {
  const r = await fetch(`${API}/api/superadmin/phase-y/${encodeURIComponent(orgId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

async function toggleMasterSwitch(orgId, enabled) {
  const r = await fetch(`${API}/api/superadmin/phase-y/${encodeURIComponent(orgId)}/master-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

// ─── Subcomponents ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled, label, testId }) {
  return (
    <label data-testid={testId} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <div
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 9999,
          background: checked ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))' : 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.12)',
          position: 'relative', transition: 'background 0.2s', cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: 'var(--cream)', transition: 'left 0.2s',
        }} />
      </div>
      {label && <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>{label}</span>}
    </label>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function PhaseYControlsPanel({ orgId }) {
  const [settings, setSettings]   = useState(null);
  const [draft, setDraft]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);

  const load = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    fetchSettings(orgId)
      .then(s => { setSettings(s); setDraft(JSON.parse(JSON.stringify(s))); })
      .catch(e => setToast({ type: 'error', msg: e.message }))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg, type = 'ok') {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleMasterSwitch(enabled) {
    try {
      await toggleMasterSwitch(orgId, enabled);
      setDraft(d => ({ ...d, agentic_enabled: enabled }));
      setSettings(s => ({ ...s, agentic_enabled: enabled }));
      showToast(enabled ? 'Phase Y activada' : 'Phase Y desactivada');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await patchSettings(orgId, {
        simulation_mode: draft.simulation_mode,
        feature_tiers: draft.feature_tiers,
      });
      setSettings(updated);
      setDraft(JSON.parse(JSON.stringify(updated)));
      showToast('Cambios guardados');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(JSON.parse(JSON.stringify(settings)));
    showToast('Cambios descartados');
  }

  function setTier(feature, value) {
    setDraft(d => ({
      ...d,
      feature_tiers: { ...d.feature_tiers, [feature]: value },
    }));
  }

  if (loading) return (
    <div style={{ padding: 20, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</div>
  );
  if (!draft) return (
    <div style={{ padding: 20, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}>Error al cargar configuración</div>
  );

  const isActive = draft.agentic_enabled;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div data-testid="phase-y-controls" style={{ fontFamily: 'DM Sans' }}>

      {/* Toast */}
      {toast && (
        <div data-testid="phase-y-toast" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.MODAL_CRITICAL,
          padding: '10px 18px', borderRadius: 9999,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.92)' : 'rgba(74,222,128,0.92)',
          color: '#06080F', fontWeight: 700, fontSize: 13,
          backdropFilter: 'blur(12px)',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>
            Phase Y Settings
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)', marginTop: 2 }}>
            {orgId}
          </div>
        </div>
        <span data-testid="phase-y-status-badge" style={{
          padding: '3px 11px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
          background: isActive ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${isActive ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.12)'}`,
          color: isActive ? '#4ADE80' : 'rgba(240, 235, 224, 0.70)',
        }}>
          {isActive ? 'Activo' : 'Off'}
        </span>
      </div>

      {/* Master Switch */}
      <div style={{
        padding: '14px 16px', borderRadius: 11,
        background: isActive ? 'rgba(var(--theme-rgb),0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isActive ? 'rgba(var(--theme-rgb),0.28)' : 'rgba(255,255,255,0.08)'}`,
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--cream)', marginBottom: 2 }}>Master Switch</div>
            <div style={{ fontSize: 11.5, color: 'rgba(240, 235, 224, 0.72)' }}>
              Cuando está Off, ningún feature agentic ejecuta aunque el tier individual sea T4.
            </div>
          </div>
          <Toggle
            testId="phase-y-master-toggle"
            checked={draft.agentic_enabled}
            onChange={handleMasterSwitch}
            disabled={saving}
          />
        </div>
      </div>

      {/* Simulation Mode */}
      <div style={{
        padding: '11px 16px', borderRadius: 11,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--cream)', marginBottom: 1 }}>Modo Simulación</div>
          <div style={{ fontSize: 11, color: 'rgba(240, 235, 224, 0.70)' }}>Dry run: AI loguea decisiones pero no toma acción real</div>
        </div>
        <Toggle
          testId="phase-y-sim-toggle"
          checked={draft.simulation_mode}
          onChange={v => setDraft(d => ({ ...d, simulation_mode: v }))}
          disabled={saving}
        />
      </div>

      {/* Feature Tiers Table */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Feature Tiers
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(draft.feature_tiers || {}).map(([key, tier]) => (
            <div key={key} data-testid={`phase-y-feature-${key}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 9, flexWrap: 'wrap',
                background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--cream)', fontWeight: 500, minWidth: 140 }}>
                {FEATURE_LABELS[key] || key}
              </span>
              <select
                value={tier}
                onChange={e => setTier(key, e.target.value)}
                data-testid={`phase-y-tier-select-${key}`}
                style={{
                  padding: '4px 10px', borderRadius: 9999, fontSize: 12, fontFamily: 'DM Sans',
                  background: 'rgba(6,8,15,0.80)', border: '1px solid rgba(255,255,255,0.15)',
                  color: TIER_COLORS[tier] || 'var(--cream)', cursor: 'pointer', outline: 'none',
                }}
              >
                {TIER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                ))}
              </select>
              {tier !== 'off' && (
                <span style={{
                  padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700,
                  background: `${TIER_COLORS[tier]}1A`,
                  border: `1px solid ${TIER_COLORS[tier]}55`,
                  color: TIER_COLORS[tier],
                }}>{tier}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-testid="phase-y-save-btn"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 9999, fontSize: 13, fontWeight: 700,
            fontFamily: 'DM Sans', cursor: saving || !dirty ? 'not-allowed' : 'pointer',
            background: dirty ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))' : 'rgba(255,255,255,0.06)',
            border: 'none', color: dirty ? '#fff' : 'rgba(240,235,224,0.35)',
            opacity: saving ? 0.7 : 1, transition: 'opacity 0.2s',
          }}
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          data-testid="phase-y-reset-btn"
          onClick={handleReset}
          disabled={saving || !dirty}
          style={{
            padding: '9px 14px', borderRadius: 9999, fontSize: 12, fontFamily: 'DM Sans',
            fontWeight: 600, cursor: saving || !dirty ? 'not-allowed' : 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(240,235,224,0.55)',
          }}
        >
          Resetear
        </button>
      </div>

      {/* Updated at */}
      {settings?.updated_at && (
        <div style={{ marginTop: 10, fontSize: 10.5, color: 'rgba(240,235,224,0.35)', fontFamily: 'DM Sans' }}>
          Última actualización: {new Date(settings.updated_at).toLocaleString('es-MX')}
          {settings.updated_by && ` · por ${settings.updated_by}`}
        </div>
      )}
    </div>
  );
}

export default PhaseYControlsPanel;
