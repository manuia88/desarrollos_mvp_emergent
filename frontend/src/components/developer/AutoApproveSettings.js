// Phase 13 · Batch 36 — AutoApproveSettings
// Configuracion de aprobacion automatica para developers
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Zap, Info, ToggleLeft, ToggleRight, ChevronDown, X } from 'lucide-react';
import { getAutoApproveRule, saveAutoApproveRule, simulateAutoApproveRule } from '../../api/advisor_whitelist';
import { Z } from '../../styles/zIndex';

const COLONIAS = [
  'Polanco', 'Santa Fe', 'Lomas de Chapultepec', 'Del Valle', 'Nápoles',
  'Condesa', 'Roma Norte', 'Roma Sur', 'Hipódromo', 'Anzures',
  'Interlomas', 'Huixquilucan', 'Tecamachalco', 'Bosques de las Lomas',
  'Satélite', 'Coyoacán', 'San Ángel', 'Pedregal', 'Insurgentes Sur',
];

function Toggle({ checked, onChange, testId }) {
  return (
    <button
      data-testid={testId}
      type="button"
      onClick={() => onChange(!checked)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {checked
        ? <ToggleRight size={30} color="var(--theme)" />
        : <ToggleLeft size={30} color="rgba(var(--cream-rgb),0.25)" />}
    </button>
  );
}

function ColoniasMultiSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (colonia) => {
    const next = selected.includes(colonia)
      ? selected.filter(c => c !== colonia)
      : [...selected, colonia];
    onChange(next);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        data-testid="colonias-select-btn"
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 13px', borderRadius: 9,
          background: 'rgba(var(--cream-rgb),0.06)',
          border: '1px solid rgba(var(--cream-rgb),0.10)',
          color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <span>
          {selected.length === 0
            ? 'Todas las colonias (sin restriccion)'
            : `${selected.length} colonia${selected.length > 1 ? 's' : ''} seleccionada${selected.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown size={14} color="rgba(var(--cream-rgb),0.40)" />
      </button>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          {selected.map(c => (
            <span key={c} style={{
              padding: '3px 9px', borderRadius: 9999, fontSize: 11.5,
              fontFamily: 'DM Sans', fontWeight: 600,
              background: 'rgba(var(--theme-rgb),0.12)',
              border: '1px solid rgba(var(--theme-rgb),0.28)',
              color: 'var(--theme)',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {c}
              <button type="button" onClick={() => toggle(c)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--theme)' }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: Z.DROPDOWN,
          background: 'rgba(var(--bg-rgb),0.98)',
          border: '1px solid rgba(var(--cream-rgb),0.10)',
          borderRadius: 10, marginTop: 4, overflow: 'hidden',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {COLONIAS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              style={{
                width: '100%', padding: '9px 14px', textAlign: 'left',
                background: selected.includes(c) ? 'rgba(var(--theme-rgb),0.12)' : 'transparent',
                border: 'none', cursor: 'pointer',
                fontFamily: 'DM Sans', fontSize: 13,
                color: selected.includes(c) ? 'var(--theme)' : 'rgba(var(--cream-rgb),0.70)',
                display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid rgba(var(--cream-rgb),0.05)',
              }}
            >
              <input
                type="checkbox" readOnly checked={selected.includes(c)}
                style={{ accentColor: 'var(--theme)', width: 13, height: 13 }}
              />
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AutoApproveSettings() {
  const [rule, setRule] = useState({
    enabled: false,
    threshold_trust_score: 70,
    require_zona_expertise: true,
    target_colonias: [],
    min_deals_closed_12m: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const simTimerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getAutoApproveRule();
      setRule({
        enabled: r.enabled ?? false,
        threshold_trust_score: r.threshold_trust_score ?? 70,
        require_zona_expertise: r.require_zona_expertise ?? true,
        target_colonias: r.target_colonias || [],
        min_deals_closed_12m: r.min_deals_closed_12m ?? 1,
      });
    } catch (err) {
      console.error('[AutoApproveSettings] load error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  // Debounced simulation
  useEffect(() => {
    if (!rule.enabled) { setPreview(null); return; }
    if (simTimerRef.current) clearTimeout(simTimerRef.current);
    simTimerRef.current = setTimeout(async () => {
      setSimulating(true);
      try {
        const r = await simulateAutoApproveRule({
          threshold_trust_score: rule.threshold_trust_score,
          require_zona_expertise: rule.require_zona_expertise,
          target_colonias: rule.target_colonias,
          min_deals_closed_12m: rule.min_deals_closed_12m,
        });
        setPreview(r);
      } catch { setPreview(null); }
      finally { setSimulating(false); }
    }, 600);
    return () => clearTimeout(simTimerRef.current);
  }, [rule]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAutoApproveRule(rule);
      setToast('Configuracion guardada');
    } catch (e) {
      setToast(e.response?.data?.detail || e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>
        Cargando configuracion…
      </div>
    );
  }

  return (
    <div data-testid="auto-approve-settings" style={{ maxWidth: 600 }}>

      {/* Toast */}
      {toast && (
        <div data-testid="auto-approve-toast" style={{
          position: 'fixed', top: 20, right: 20, zIndex: Z.TOAST,
          padding: '11px 18px', borderRadius: 10,
          background: 'rgba(var(--theme-rgb),0.18)',
          border: '1px solid rgba(var(--theme-rgb),0.35)',
          color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
          backdropFilter: 'blur(24px)',
        }}>
          {toast}
        </div>
      )}

      {/* Card */}
      <div style={{
        background: 'rgba(var(--cream-rgb),0.03)',
        border: '1px solid rgba(var(--cream-rgb),0.08)',
        borderRadius: 16, padding: '24px 24px 22px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(var(--theme-rgb),0.12)',
              border: '1px solid rgba(var(--theme-rgb),0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={16} color="var(--theme)" />
            </div>
            <div>
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>
                Aprobacion automatica
              </h3>
              <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(var(--cream-rgb),0.50)', margin: '2px 0 0' }}>
                Aprueba asesores calificados sin intervencion manual
              </p>
            </div>
          </div>
          <Toggle
            checked={rule.enabled}
            onChange={v => setRule(r => ({ ...r, enabled: v }))}
            testId="auto-approve-toggle"
          />
        </div>

        {rule.enabled && (
          <div style={{ borderTop: '1px solid rgba(var(--cream-rgb),0.07)', paddingTop: 18 }}>

            {/* Trust Score slider */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{
                  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                  color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>
                  Trust Score minimo
                </label>
                <span style={{
                  padding: '3px 10px', borderRadius: 9999, fontSize: 12,
                  fontFamily: 'DM Sans', fontWeight: 700,
                  background: 'rgba(var(--theme-rgb),0.12)',
                  border: '1px solid rgba(var(--theme-rgb),0.25)',
                  color: 'var(--theme)',
                }}>
                  {rule.threshold_trust_score}
                </span>
              </div>
              <input
                data-testid="trust-score-slider"
                type="range"
                min="0" max="100" step="5"
                value={rule.threshold_trust_score}
                onChange={e => setRule(r => ({ ...r, threshold_trust_score: parseInt(e.target.value) }))}
                style={{ width: '100%', accentColor: 'var(--theme)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.30)' }}>
                <span>0</span><span>50</span><span>100</span>
              </div>
            </div>

            {/* Require zona expertise */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>
                  Requerir experiencia en zona
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(var(--cream-rgb),0.45)' }}>
                  El asesor debe tener deals cerrados en las colonias objetivo
                </div>
              </div>
              <Toggle
                checked={rule.require_zona_expertise}
                onChange={v => setRule(r => ({ ...r, require_zona_expertise: v }))}
                testId="require-zona-toggle"
              />
            </div>

            {/* Colonias target (if require_zona) */}
            {rule.require_zona_expertise && (
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                  color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase',
                  letterSpacing: '0.07em', display: 'block', marginBottom: 5,
                }}>
                  Colonias relevantes
                </label>
                <ColoniasMultiSelect
                  selected={rule.target_colonias}
                  onChange={v => setRule(r => ({ ...r, target_colonias: v }))}
                />
              </div>
            )}

            {/* Min deals */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
                color: 'rgba(var(--cream-rgb),0.50)', textTransform: 'uppercase',
                letterSpacing: '0.07em', display: 'block', marginBottom: 5,
              }}>
                Minimo deals cerrados (ultimos 12 meses)
              </label>
              <input
                data-testid="min-deals-input"
                type="number" min="0" max="999"
                value={rule.min_deals_closed_12m}
                onChange={e => setRule(r => ({ ...r, min_deals_closed_12m: parseInt(e.target.value) || 0 }))}
                style={{
                  width: '100%', padding: '10px 13px', borderRadius: 9,
                  background: 'rgba(var(--cream-rgb),0.06)',
                  border: '1px solid rgba(var(--cream-rgb),0.10)',
                  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Live preview */}
            {(preview || simulating) && (
              <div data-testid="auto-approve-preview" style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'rgba(var(--theme-rgb),0.08)',
                border: '1px solid rgba(var(--theme-rgb),0.20)',
                marginBottom: 18,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Info size={13} color="var(--theme)" />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Simulacion en tiempo real
                  </span>
                </div>
                {simulating ? (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(var(--cream-rgb),0.50)' }}>
                    Calculando…
                  </span>
                ) : preview && (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>
                    Con esta regla, <strong style={{ color: 'var(--theme)' }}>{preview.pct}%</strong> de asesores activos
                    serian auto-aprobados ({preview.eligible_count} de {preview.total_asesores}).
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        <button
          data-testid="save-auto-approve-btn"
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 9999,
            background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'opacity 200ms',
          }}
        >
          {saving ? 'Guardando…' : 'Guardar configuracion'}
        </button>
      </div>
    </div>
  );
}
