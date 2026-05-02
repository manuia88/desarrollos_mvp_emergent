// /desarrollador/desarrollos/:slug/pricing-lab — Phase 4 Batch 5 · 4.14
// Pricing A/B + Bundle experiments
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { Card, Badge, Toast, fmt0, fmtMXN } from '../../components/advisor/primitives';
import * as leadsApi from '../../api/leads';
import { Activity, Target, Plus, X, CheckCircle, Sparkle } from '../../components/icons';

const TABS = [
  { k: 'active',  label: 'Experimentos activos', Icon: Activity },
  { k: 'create',  label: 'Crear experimento',    Icon: Plus },
  { k: 'results', label: 'Resultados',           Icon: Sparkle },
];

export default function DesarrolladorPricingLab({ user, onLogout }) {
  const { slug } = useParams();
  const [tab, setTab] = useState('active');
  const [toast, setToast] = useState(null);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>4.14 · PRICING LAB</div>
        <h1 data-testid="pricing-lab-h1" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)',
          letterSpacing: '-0.025em', margin: '4px 0 6px',
        }}>
          <Target size={20} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          Pricing Experiments — {slug}
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
          Lanza experimentos A/B de precio o bundles para optimizar conversión. Asignación determinística por visitor_id + tracking de funnel completo.
        </p>
      </div>

      <div data-testid="pricing-lab-tabs" style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => {
          const Icon = t.Icon;
          const active = tab === t.k;
          return (
            <button key={t.k}
              data-testid={`pl-tab-${t.k}`}
              onClick={() => setTab(t.k)}
              style={{
                padding: '10px 16px', cursor: 'pointer',
                background: 'transparent',
                border: 'none', borderBottom: active ? '2px solid var(--cream)' : '2px solid transparent',
                color: active ? 'var(--cream)' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 13, fontWeight: active ? 600 : 500,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'active'  && <ActiveTab projectId={slug} onToast={setToast} />}
      {tab === 'create'  && <CreateTab projectId={slug} onToast={setToast} onCreated={() => setTab('active')} />}
      {tab === 'results' && <ResultsTab projectId={slug} onToast={setToast} />}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </DeveloperLayout>
  );
}

// ─── Active Experiments Tab ─────────────────────────────────────────────────
function ActiveTab({ projectId, onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await leadsApi.listPricingExperiments({ project_id: projectId });
      setItems((r.items || []).filter(e => e.status !== 'completed'));
    } catch (e) {
      onToast?.({ kind: 'error', text: e.body?.detail || 'Error al cargar' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const togglePause = async (exp) => {
    const next = exp.status === 'active' ? 'paused' : 'active';
    try {
      await leadsApi.patchPricingExperiment(exp.id, { status: next });
      onToast?.({ kind: 'success', text: `Experimento ${next === 'active' ? 'reactivado' : 'pausado'}` });
      load();
    } catch (e) {
      onToast?.({ kind: 'error', text: e.body?.detail || 'Error al cambiar estado' });
    }
  };

  const conclude = async (exp) => {
    if (!window.confirm(`¿Concluir experimento "${exp.name}"? No podrás reactivarlo.`)) return;
    try {
      await leadsApi.patchPricingExperiment(exp.id, { status: 'completed' });
      onToast?.({ kind: 'success', text: 'Experimento concluido' });
      load();
    } catch (e) {
      onToast?.({ kind: 'error', text: e.body?.detail || 'Error' });
    }
  };

  if (loading) return <Loading />;
  if (items.length === 0) return <EmptyState text="Sin experimentos activos. Crea uno desde la pestaña 'Crear experimento'." />;

  return (
    <div data-testid="active-tab" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
      {items.map(exp => (
        <Card key={exp.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{exp.type === 'price_ab' ? 'A/B Price' : 'Bundle'}</div>
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: 0 }}>{exp.name}</h3>
            </div>
            <Badge tone={exp.status === 'active' ? 'ok' : exp.status === 'paused' ? 'warn' : 'neutral'}>{exp.status}</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {(exp.variants || []).map(v => {
              const s = v.stats || {};
              return (
                <div key={v.label} data-testid={`variant-${exp.id}-${v.label}`} style={{
                  padding: 10, borderRadius: 8,
                  background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{v.label}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', marginBottom: 6 }}>
                    {Math.round(v.visitor_pct * 100)}% · {v.price_modifier?.value != null ? `${v.price_modifier.value}${v.price_modifier.type === 'percent' ? '%' : ''}` : 'sin mod'}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                    Views: {fmt0(s.views || 0)}<br />
                    Leads: {fmt0(s.leads_generated || 0)}<br />
                    Citas: {fmt0(s.citas_agendadas || 0)}<br />
                    Cierres: {fmt0(s.cierres || 0)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid={`pause-${exp.id}`} onClick={() => togglePause(exp)} style={btnSec}>
              {exp.status === 'active' ? 'Pausar' : 'Reanudar'}
            </button>
            <button data-testid={`conclude-${exp.id}`} onClick={() => conclude(exp)} style={btnSec}>Concluir</button>
            <button data-testid={`view-${exp.id}`} onClick={() => setOpenId(openId === exp.id ? null : exp.id)} style={btnSec}>
              {openId === exp.id ? 'Ocultar' : 'Resultados'}
            </button>
          </div>
          {openId === exp.id && <ResultsInline expId={exp.id} />}
        </Card>
      ))}
    </div>
  );
}

function ResultsInline({ expId }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    leadsApi.pricingResults(expId).then(setR).catch(() => setR(null));
  }, [expId]);
  if (!r) return <div style={{ color: 'var(--cream-3)', fontSize: 11, fontFamily: 'DM Sans', marginTop: 10 }}>Cargando resultados…</div>;
  return (
    <div data-testid={`results-inline-${expId}`} style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--cream)', marginBottom: 6 }}>
        Conversion funnel
      </div>
      {r.variants.map(v => (
        <div key={v.label} style={{ marginBottom: 4 }}>
          <strong style={{ color: 'var(--cream)' }}>{v.label}:</strong> view→lead {v.conversion_funnel.view_to_lead}% · lead→cita {v.conversion_funnel.lead_to_cita}% · cita→cierre {v.conversion_funnel.cita_to_cierre}%
        </div>
      ))}
      {r.winner && (
        <div data-testid={`winner-${expId}`} style={{ marginTop: 6, color: 'var(--green)', fontWeight: 600 }}>
          <CheckCircle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Variante ganadora: {r.winner} (confianza {r.confidence}%)
        </div>
      )}
    </div>
  );
}

// ─── Create Experiment Tab ───────────────────────────────────────────────────
function CreateTab({ projectId, onToast, onCreated }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('price_ab');
  const [variants, setVariants] = useState([
    { label: 'A', price_modifier: { type: 'percent', value: 0 }, visitor_pct: 0.5 },
    { label: 'B', price_modifier: { type: 'percent', value: -5 }, visitor_pct: 0.5 },
  ]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name || !projectId) {
      onToast?.({ kind: 'error', text: 'Completa nombre y selecciona proyecto' });
      return;
    }
    setBusy(true);
    try {
      await leadsApi.createPricingExperiment({
        project_id: projectId, name, type, status: 'active',
        variants, target_units: [],
      });
      onToast?.({ kind: 'success', text: 'Experimento creado y activado' });
      setName('');
      onCreated?.();
    } catch (e) {
      onToast?.({ kind: 'error', text: e.body?.detail || 'Error al crear' });
    } finally { setBusy(false); }
  };

  const updateVariant = (idx, field, value) => {
    setVariants(s => s.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const updateModifier = (idx, field, value) => {
    setVariants(s => s.map((v, i) => i === idx ? {
      ...v, price_modifier: { ...(v.price_modifier || {}), [field]: value },
    } : v));
  };

  return (
    <Card>
      <div data-testid="create-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nombre del experimento</label>
          <input data-testid="exp-name" value={name} onChange={e => setName(e.target.value)}
            placeholder="Ej: Test 5% descuento Quattro Q1"
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Tipo</label>
          <select data-testid="exp-type" value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
            <option value="price_ab">A/B precio</option>
            <option value="bundle_combo">Bundle combo</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Variantes (visitor_pct debe sumar 1.0)</label>
          {variants.map((v, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 120px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input value={v.label} onChange={e => updateVariant(idx, 'label', e.target.value)}
                style={inputStyle} placeholder="Label" />
              <select value={v.price_modifier?.type || 'percent'}
                onChange={e => updateModifier(idx, 'type', e.target.value)} style={inputStyle}>
                <option value="percent">% modificador</option>
                <option value="absolute">Absoluto MXN</option>
                <option value="fixed">Precio fijo MXN</option>
              </select>
              <input type="number" value={v.price_modifier?.value ?? 0}
                onChange={e => updateModifier(idx, 'value', parseFloat(e.target.value) || 0)}
                style={inputStyle} placeholder="Valor" />
              <input type="number" step="0.01" value={v.visitor_pct}
                onChange={e => updateVariant(idx, 'visitor_pct', parseFloat(e.target.value) || 0)}
                style={inputStyle} placeholder="0.50" />
            </div>
          ))}
          <button data-testid="add-variant" onClick={() => setVariants(s => [...s, { label: String.fromCharCode(65 + s.length), price_modifier: { type: 'percent', value: 0 }, visitor_pct: 0 }])} style={btnSec}>
            <Plus size={11} /> Variante
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button data-testid="create-submit" onClick={submit} disabled={busy} style={btnPrimary}>
            {busy ? 'Creando…' : 'Crear y activar'}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Completed Results Tab ─────────────────────────────────────────────────
function ResultsTab({ projectId, onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    leadsApi.listPricingExperiments({ project_id: projectId, status: 'completed' })
      .then(r => setItems(r.items || []))
      .catch(e => onToast?.({ kind: 'error', text: e.body?.detail || 'Error' }))
      .finally(() => setLoading(false));
  }, [projectId, onToast]);
  if (loading) return <Loading />;
  if (items.length === 0) return <EmptyState text="Sin experimentos concluidos aún." />;
  return (
    <div data-testid="results-tab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(exp => (
        <Card key={exp.id}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{exp.type}</div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 8px' }}>{exp.name}</h3>
          <ResultsInline expId={exp.id} />
        </Card>
      ))}
    </div>
  );
}

function Loading() {
  return <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>;
}
function EmptyState({ text }) {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>{text}</div>;
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  background: 'rgba(240,235,224,0.04)', border: '1px solid var(--border)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none',
};
const labelStyle = {
  fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--cream-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
};
const btnPrimary = {
  padding: '10px 18px', borderRadius: 9999, cursor: 'pointer',
  background: 'rgba(240,235,224,0.10)', border: '1px solid rgba(240,235,224,0.30)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
};
const btnSec = {
  padding: '6px 12px', borderRadius: 9999, cursor: 'pointer',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--cream-2)',
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
