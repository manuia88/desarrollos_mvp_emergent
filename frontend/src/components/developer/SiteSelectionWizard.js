/**
 * SiteSelectionWizard — 4-step modal wizard to create a Site Selection AI study.
 * Phase 4 Batch 7 · 4.22
 */
import React, { useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { X, ArrowRight, ArrowLeft, Check, Sparkle } from '../icons';
import * as api from '../../api/developer';

const PROJECT_TYPES = [
  { v: 'residencial_vertical', label: 'Residencial vertical' },
  { v: 'residencial_horizontal', label: 'Residencial horizontal' },
  { v: 'mixto', label: 'Uso mixto' },
  { v: 'comercial', label: 'Comercial' },
];
const SEGMENTS = [
  { v: 'NSE_AB', label: 'NSE A/B (premium)' },
  { v: 'NSE_C+', label: 'NSE C+ (medio-alto)' },
  { v: 'NSE_C', label: 'NSE C (medio)' },
  { v: 'NSE_D', label: 'NSE D (popular)' },
];
const PREF_FEATURES = [
  { v: 'metro_proximity', label: 'Cerca metro / movilidad' },
  { v: 'school_district', label: 'Distrito escolar' },
  { v: 'green_areas', label: 'Áreas verdes' },
  { v: 'commercial_corridor', label: 'Corredor comercial' },
  { v: 'low_density', label: 'Baja densidad' },
  { v: 'premium_amenities', label: 'Amenidades premium' },
];
const AVOID_FEATURES = [
  { v: 'flood_risk', label: 'Riesgo inundación' },
  { v: 'high_density', label: 'Alta densidad' },
  { v: 'construction_zone', label: 'Zona de obra activa' },
  { v: 'noise_pollution', label: 'Contaminación auditiva' },
];
const STATES = [
  { v: 'CDMX', label: 'CDMX' },
  { v: 'EDOMEX', label: 'Estado de México' },
  { v: 'JAL', label: 'Jalisco' },
  { v: 'NL', label: 'Nuevo León' },
  { v: 'QRO', label: 'Querétaro' },
];

function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {[1, 2, 3, 4].map(n => (
        <div key={n} style={{
          width: n === step ? 22 : 8, height: 8, borderRadius: 9999,
          background: n <= step ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'rgba(240,235,224,0.18)',
          transition: 'width 150ms ease',
        }} />
      ))}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13.5, outline: 'none',
};

function Toggle({ active, onClick, children, testid }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick} style={{
      padding: '7px 13px', borderRadius: 9999,
      background: active ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'transparent',
      border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
      color: active ? '#fff' : 'var(--cream-2)',
      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}>{children}</button>
  );
}

export default function SiteSelectionWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [inp, setInp] = useState({
    project_type: 'residencial_vertical',
    target_segment: 'NSE_AB',
    unit_size_range: { min_m2: 80, max_m2: 180 },
    price_range_per_m2: { min: 80000, max: 140000 },
    total_units_target: 40,
    budget_construction: 250_000_000,
    preferred_states: ['CDMX'],
    preferred_features: ['metro_proximity'],
    avoid_features: ['flood_risk'],
  });

  const setField = (k, v) => setInp(prev => ({ ...prev, [k]: v }));
  const toggleArr = (k, v) => setInp(prev => ({
    ...prev,
    [k]: prev[k].includes(v) ? prev[k].filter(x => x !== v) : [...prev[k], v],
  }));

  const next = () => setStep(s => Math.min(4, s + 1));
  const prev = () => setStep(s => Math.max(1, s - 1));

  const submit = async () => {
    if (!name.trim()) { setErr('Pon un nombre al estudio.'); return; }
    setSubmitting(true); setErr(null);
    try {
      const study = await api.createSiteStudy({ name: name.trim(), inputs: inp });
      // Auto-run engine
      await api.runSiteStudy(study.id);
      onCreated && onCreated(study);
    } catch (e) {
      setErr(e.message || 'Error al crear estudio');
    } finally { setSubmitting(false); }
  };

  return (
    <div data-testid="site-wizard" style={{
      position: 'fixed', inset: 0, zIndex: 1300,
      background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <Card style={{
        width: 'min(720px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: 0,
        background: '#0b0e18', border: '1px solid var(--border)',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>SITE SELECTION AI · NUEVO ESTUDIO</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
              Paso {step} de 4
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <StepDots step={step} />
            <button data-testid="site-wizard-close" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--cream-2)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ padding: 22 }}>
          {step === 1 && (
            <div data-testid="site-wizard-step-1">
              <Field label="Tipo de proyecto">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PROJECT_TYPES.map(o => (
                    <Toggle key={o.v} testid={`site-pt-${o.v}`} active={inp.project_type === o.v} onClick={() => setField('project_type', o.v)}>{o.label}</Toggle>
                  ))}
                </div>
              </Field>
              <Field label="Segmento target">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SEGMENTS.map(o => (
                    <Toggle key={o.v} testid={`site-seg-${o.v}`} active={inp.target_segment === o.v} onClick={() => setField('target_segment', o.v)}>{o.label}</Toggle>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div data-testid="site-wizard-step-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Tamaño unidad m² · mín">
                <input data-testid="site-min-m2" type="number" min={20} max={2000} style={inputStyle}
                       value={inp.unit_size_range.min_m2}
                       onChange={e => setField('unit_size_range', { ...inp.unit_size_range, min_m2: +e.target.value })} />
              </Field>
              <Field label="Tamaño unidad m² · máx">
                <input data-testid="site-max-m2" type="number" min={20} max={2000} style={inputStyle}
                       value={inp.unit_size_range.max_m2}
                       onChange={e => setField('unit_size_range', { ...inp.unit_size_range, max_m2: +e.target.value })} />
              </Field>
              <Field label="Precio m² target · mín (MXN)">
                <input data-testid="site-min-price" type="number" min={0} style={inputStyle}
                       value={inp.price_range_per_m2.min}
                       onChange={e => setField('price_range_per_m2', { ...inp.price_range_per_m2, min: +e.target.value })} />
              </Field>
              <Field label="Precio m² target · máx (MXN)">
                <input data-testid="site-max-price" type="number" min={0} style={inputStyle}
                       value={inp.price_range_per_m2.max}
                       onChange={e => setField('price_range_per_m2', { ...inp.price_range_per_m2, max: +e.target.value })} />
              </Field>
              <Field label="Unidades totales target">
                <input data-testid="site-total-units" type="number" min={1} max={10000} style={inputStyle}
                       value={inp.total_units_target}
                       onChange={e => setField('total_units_target', +e.target.value)} />
              </Field>
              <Field label="Presupuesto construcción (MXN)">
                <input data-testid="site-budget" type="number" min={0} style={inputStyle}
                       value={inp.budget_construction}
                       onChange={e => setField('budget_construction', +e.target.value)} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div data-testid="site-wizard-step-3">
              <Field label="Estados preferidos">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {STATES.map(o => (
                    <Toggle key={o.v} testid={`site-state-${o.v}`} active={inp.preferred_states.includes(o.v)} onClick={() => toggleArr('preferred_states', o.v)}>{o.label}</Toggle>
                  ))}
                </div>
              </Field>
              <Field label="Features deseadas">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PREF_FEATURES.map(o => (
                    <Toggle key={o.v} testid={`site-pref-${o.v}`} active={inp.preferred_features.includes(o.v)} onClick={() => toggleArr('preferred_features', o.v)}>{o.label}</Toggle>
                  ))}
                </div>
              </Field>
              <Field label="Features a evitar">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {AVOID_FEATURES.map(o => (
                    <Toggle key={o.v} testid={`site-avoid-${o.v}`} active={inp.avoid_features.includes(o.v)} onClick={() => toggleArr('avoid_features', o.v)}>{o.label}</Toggle>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div data-testid="site-wizard-step-4">
              <Field label="Nombre del estudio">
                <input data-testid="site-study-name" autoFocus style={inputStyle}
                       placeholder="Ej. Expansión vertical premium CDMX 2026"
                       value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div style={{ background: 'rgba(240,235,224,0.04)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>RESUMEN DEL CRITERIO</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                    <div>Tipo: <b style={{ color: 'var(--cream)' }}>{PROJECT_TYPES.find(x => x.v === inp.project_type)?.label}</b></div>
                    <div>Segmento: <b style={{ color: 'var(--cream)' }}>{SEGMENTS.find(x => x.v === inp.target_segment)?.label}</b></div>
                    <div>m²: <b style={{ color: 'var(--cream)' }}>{inp.unit_size_range.min_m2}–{inp.unit_size_range.max_m2}</b></div>
                    <div>Precio m²: <b style={{ color: 'var(--cream)' }}>${inp.price_range_per_m2.min.toLocaleString()}–${inp.price_range_per_m2.max.toLocaleString()}</b></div>
                    <div>Unidades: <b style={{ color: 'var(--cream)' }}>{inp.total_units_target}</b></div>
                    <div>Presupuesto: <b style={{ color: 'var(--cream)' }}>${inp.budget_construction.toLocaleString()}</b></div>
                  </div>
                </div>
                <div style={{ background: 'rgba(240,235,224,0.04)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>FEATURES</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
                    <div>Estados: {(inp.preferred_states || []).map(s => <Badge key={s} tone="brand" style={{ marginRight: 4 }}>{s}</Badge>)}</div>
                    <div>Deseadas: {(inp.preferred_features || []).map(s => <Badge key={s} tone="ok" style={{ marginRight: 4 }}>{s}</Badge>) || '—'}</div>
                    <div>Evitar: {(inp.avoid_features || []).map(s => <Badge key={s} tone="bad" style={{ marginRight: 4 }}>{s}</Badge>) || '—'}</div>
                  </div>
                </div>
              </div>
              {err && (
                <div style={{ marginTop: 12, padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.32)', borderRadius: 10, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12 }}>{err}</div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button data-testid="site-wizard-prev" onClick={prev} disabled={step === 1} style={{
            padding: '9px 16px', borderRadius: 9999,
            background: 'transparent', border: '1px solid var(--border)',
            color: step === 1 ? 'var(--cream-3)' : 'var(--cream-2)',
            opacity: step === 1 ? 0.4 : 1, cursor: step === 1 ? 'default' : 'pointer',
            fontFamily: 'DM Sans', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><ArrowLeft size={12} /> Anterior</button>

          {step < 4 ? (
            <button data-testid="site-wizard-next" onClick={next} style={{
              padding: '9px 18px', borderRadius: 9999,
              background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>Siguiente <ArrowRight size={12} /></button>
          ) : (
            <button data-testid="site-wizard-submit" onClick={submit} disabled={submitting} style={{
              padding: '9px 18px', borderRadius: 9999,
              background: 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))',
              border: 'none', color: '#fff',
              fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
              cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}><Sparkle size={12} /> {submitting ? 'Creando…' : 'Crear y ejecutar'}</button>
          )}
        </div>
      </Card>
    </div>
  );
}
