/**
 * Perfilador — la cara de la Etapa 1 del Copiloto de Compra (2026-06-18).
 *
 * Form progresivo IA-first que captura la INTENCIÓN del comprador con granularidad, la manda al motor
 * (POST /api/perfil/recomendar · reverse_search sin LLM) y devuelve "Tus mejores opciones" con MATCH TRANSPARENTE.
 * Reemplaza "Mi colonia ideal" (mata la duplicación de captura de perfil).
 *
 * Persiste el perfil en localStorage (dmx_buyer_profile) + visitor_id → semilla para el swipe conductual (E2),
 * la asignación de lead (E3) y la casamentera proactiva (E4). Un perfil, todos los lentes.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

const USOS = [
  { k: 'vivir', t: 'Para vivir', d: 'Mi hogar' },
  { k: 'primera', t: 'Mi primera casa', d: 'Estreno' },
  { k: 'invertir', t: 'Para invertir', d: 'Que suba de valor' },
  { k: 'vacacional', t: 'Segunda casa', d: 'Descanso' },
];
const CREDITOS = [
  { k: 'infonavit', t: 'Infonavit' }, { k: 'bancario', t: 'Crédito bancario' },
  { k: 'fovissste', t: 'Fovissste' }, { k: 'contado', t: 'De contado' },
];
const ETAPAS = [
  { k: 'preventa', t: 'Preventa', d: 'Mejor precio, entrega después' },
  { k: 'entrega_inmediata', t: 'Entrega inmediata', d: 'Listo para entrar ya' },
];
const PLAZOS = [
  { k: 'menos_3', t: 'En menos de 3 meses' }, { k: '3_6', t: '3 a 6 meses' },
  { k: '6_12', t: '6 a 12 meses' }, { k: 'mas_12', t: 'No tengo prisa' },
];

const money = (n) => '$' + (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M' : Math.round(n / 1e3) + 'k');
function visitorId() {
  try { let v = localStorage.getItem('dmx_visitor_id'); if (!v) { v = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('dmx_visitor_id', v); } return v; } catch { return 'v_anon'; }
}

export default function Perfilador({ open, onClose, onApply, colonias = [] }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState({ uso: '', presupuesto_max: 8000000, enganche: 20, credito: '', stages: [], plazo: 'cualquiera', recamaras_min: 2, banos_min: 1, estacionamientos_min: 1, m2_min: null, colonias: [] });
  const [results, setResults] = useState(null);
  const [meta, setMeta] = useState({ nota: null, ampliado: false });
  const [loading, setLoading] = useState(false);
  const [zoneQuery, setZoneQuery] = useState('');
  if (!open) return null;

  const set = (patch) => setP((prev) => ({ ...prev, ...patch }));
  const toggle = (key, val) => set({ [key]: p[key].includes(val) ? p[key].filter((x) => x !== val) : [...p[key], val] });
  const isPreventa = p.stages.includes('preventa');
  // Zona: buscador abierto sobre TODAS las colonias reales (no una lista de 10 que rompa la búsqueda).
  const zoneSug = zoneQuery.trim().length >= 2
    ? colonias.filter((c) => (c.name || '').toLowerCase().includes(zoneQuery.toLowerCase()) && !p.colonias.includes(c.name)).slice(0, 6)
    : [];
  const addZone = (name) => { set({ colonias: [...p.colonias, name] }); setZoneQuery(''); };

  const submit = async () => {
    setLoading(true);
    try {
      localStorage.setItem('dmx_buyer_profile', JSON.stringify({ ...p, visitor_id: visitorId(), ts: Date.now() }));
    } catch { /* noop */ }
    try {
      const body = { ...p, plazo: isPreventa ? p.plazo : 'cualquiera', limit: 8 };
      const r = await fetch(`${API}/api/perfil/recomendar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      setResults(d.resultados || []);
      setMeta({ nota: d.nota || null, ampliado: !!d.ampliado });
      setStep(4);
    } catch { setResults([]); setMeta({ nota: null, ampliado: false }); setStep(4); }
    setLoading(false);
  };

  const close = () => { onClose?.(); };
  // Aplica el perfil al marketplace (no atrapa al usuario en el modal): el grid se personaliza + puede seguir.
  const applyToMarketplace = () => { onApply?.({ ...p }, { results: results || [], nota: meta.nota, ampliado: meta.ampliado }); onClose?.(); };
  const next = () => setStep((s) => Math.min(s + 1, 4));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // ── estilos compartidos (tema claro) ──
  const opt = (on) => ({ padding: '14px 16px', borderRadius: 13, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--theme)' : 'var(--border)'}`, background: on ? 'rgba(var(--theme-rgb),0.06)' : '#fff', textAlign: 'left', fontFamily: 'DM Sans', transition: 'all .12s' });
  const chip = (on) => ({ padding: '9px 15px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13.5, border: `1px solid ${on ? 'var(--theme)' : 'var(--border)'}`, background: on ? 'var(--theme)' : '#fff', color: on ? '#fff' : 'var(--cream-2)' });
  const qTitle = { fontFamily: 'Outfit', fontWeight: 800, fontSize: 21, color: 'var(--cream)', letterSpacing: '-0.02em' };
  const qSub = { fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-3)', marginTop: 4, marginBottom: 22 };

  const STEPS = [
    // 0 · ¿Qué buscas?
    <div key="0">
      <div style={qTitle}>¿Qué estás buscando?</div>
      <div style={qSub}>Para entender qué te conviene.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {USOS.map((u) => (
          <button key={u.k} style={opt(p.uso === u.k)} onClick={() => set({ uso: u.k })}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{u.t}</div>
            <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{u.d}</div>
          </button>
        ))}
      </div>
    </div>,
    // 1 · Dinero
    <div key="1">
      <div style={qTitle}>¿Cuánto quieres invertir?</div>
      <div style={qSub}>Te mostramos solo lo que SÍ te alcanza.</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>Presupuesto máximo</span>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: 'var(--theme)' }}>{money(p.presupuesto_max)}</span>
      </div>
      <input type="range" min={1500000} max={50000000} step={500000} value={p.presupuesto_max} onChange={(e) => set({ presupuesto_max: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--theme)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '22px 0 8px' }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>¿Cuánto tienes de enganche?</span>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>{p.enganche}% · {money(Math.round(p.presupuesto_max * p.enganche / 100))}</span>
      </div>
      <input type="range" min={5} max={100} step={5} value={p.enganche} onChange={(e) => set({ enganche: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--theme)' }} />
      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', margin: '22px 0 9px' }}>¿Cómo lo pagarías?</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CREDITOS.map((c) => <button key={c.k} style={chip(p.credito === c.k)} onClick={() => set({ credito: c.k })}>{c.t}</button>)}
      </div>
    </div>,
    // 2 · ¿Cuándo?
    <div key="2">
      <div style={qTitle}>¿Cuándo lo quieres?</div>
      <div style={qSub}>La preventa cuesta menos; lo listo lo estrenas ya.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {ETAPAS.map((e) => <button key={e.k} style={chip(p.stages.includes(e.k))} onClick={() => toggle('stages', e.k)}>{e.t}</button>)}
      </div>
      {isPreventa && (
        <>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', marginBottom: 9 }}>Si es preventa, ¿en cuánto la quieres entregada?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLAZOS.map((pl) => <button key={pl.k} style={chip(p.plazo === pl.k)} onClick={() => set({ plazo: pl.k })}>{pl.t}</button>)}
          </div>
        </>
      )}
    </div>,
    // 3 · ¿Qué necesitas?
    <div key="3">
      <div style={qTitle}>¿Qué necesitas?</div>
      <div style={qSub}>Lo esencial. El resto lo afinamos viendo opciones.</div>
      {[['recamaras_min', 'Recámaras (mínimo)', 1, 5], ['banos_min', 'Baños (mínimo)', 1, 5], ['estacionamientos_min', 'Estacionamientos', 0, 4]].map(([key, label, mn, mx]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream)' }}>{label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => set({ [key]: Math.max(mn, p[key] - 1) })} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 18, color: 'var(--cream-2)' }}>−</button>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', minWidth: 18, textAlign: 'center' }}>{p[key]}{['recamaras_min', 'banos_min'].includes(key) ? '+' : ''}</span>
            <button onClick={() => set({ [key]: Math.min(mx, p[key] + 1) })} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 18, color: 'var(--cream-2)' }}>+</button>
          </div>
        </div>
      ))}
      {/* Zona — buscador ABIERTO sobre todas las colonias reales (la ubicación es lo más importante;
          limitar a una lista rompería la búsqueda). Escribe y elige; varias permitidas. */}
      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', margin: '18px 0 9px' }}>¿Alguna zona en mente? <span style={{ color: 'var(--cream-3)' }}>(opcional · escribe y elige)</span></div>
      {p.colonias.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
          {p.colonias.map((z) => (
            <span key={z} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9999, background: 'var(--theme)', color: '#fff', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13 }}>
              {z}<span onClick={() => toggle('colonias', z)} style={{ cursor: 'pointer', fontWeight: 800, opacity: 0.85 }}>×</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          data-testid="perfilador-zona"
          value={zoneQuery}
          onChange={(e) => setZoneQuery(e.target.value)}
          placeholder="Busca una colonia o zona… (ej. Roma Norte, Del Valle)"
          style={{ width: '100%', padding: '11px 14px', borderRadius: 11, border: '1px solid var(--border)', background: '#fff', fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream)', outline: 'none', boxSizing: 'border-box' }}
        />
        {zoneSug.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 11, boxShadow: '0 10px 30px rgba(16,18,28,0.14)', zIndex: 5, overflow: 'hidden' }}>
            {zoneSug.map((c) => (
              <button key={c.id || c.name} onClick={() => addZone(c.name)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-card)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}>
                {c.name} {c.alcaldia && <span style={{ color: 'var(--cream-3)', fontSize: 12 }}>· {c.alcaldia}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    // 4 · resultados
    <div key="4">
      <div style={qTitle}>Tus mejores opciones</div>
      <div style={qSub}>{results?.length ? `${results.length} desarrollos para tu perfil — y por qué.` : 'No encontramos match. Amplía presupuesto o zona, o explora todo.'}</div>
      {meta.nota && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 11, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', marginBottom: 14 }}>
          <span style={{ fontSize: 15 }}>💡</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.45 }}>{meta.nota}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '42vh', overflowY: 'auto' }}>
        {(results || []).map((r) => (
          <Link key={r.id} to={`/desarrollo/${r.id}`} onClick={close} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 13, borderRadius: 13, border: '1px solid var(--border)', background: '#fff', textDecoration: 'none' }}>
            <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 11, background: 'var(--theme)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit', fontWeight: 800, lineHeight: 1 }}>
              <span style={{ fontSize: 15 }}>{r.match_score}</span><span style={{ fontSize: 8, opacity: 0.85 }}>match</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{r.name} <span style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--cream-3)' }}>· {r.colonia}</span></div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#1FA06A', fontWeight: 600, marginTop: 2 }}>{(r.match_reasons || []).join(' · ')}</div>
            </div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)', whiteSpace: 'nowrap' }}>{r.price_from_display}</div>
          </Link>
        ))}
      </div>
    </div>,
  ];

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(16,18,28,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="theme-light-scope" data-testid="perfilador" style={{ width: '100%', maxWidth: 540, background: '#fff', borderRadius: 22, padding: 28, position: 'relative', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(16,18,28,0.3)' }}>
        <button onClick={close} data-testid="perfilador-close" style={{ position: 'absolute', top: 18, right: 18, width: 34, height: 34, borderRadius: 9999, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cream-2)' }}><X size={16} /></button>

        {/* progreso */}
        {step < 4 && (
          <div style={{ display: 'flex', gap: 5, marginBottom: 22, marginRight: 40 }}>
            {[0, 1, 2, 3].map((i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 9999, background: i <= step ? 'var(--theme)' : 'var(--border)', transition: 'background .2s' }} />)}
          </div>
        )}

        {STEPS[step]}

        {/* navegación */}
        <div style={{ display: 'flex', gap: 10, marginTop: 26, alignItems: 'center' }}>
          {step > 0 && step < 4 && <button onClick={back} style={{ padding: '11px 18px', borderRadius: 11, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14, color: 'var(--cream-2)' }}>Atrás</button>}
          {step < 3 && <button onClick={next} disabled={step === 0 && !p.uso} style={{ flex: 1, padding: '12px 18px', borderRadius: 11, border: 'none', background: step === 0 && !p.uso ? 'var(--border)' : 'var(--theme)', color: '#fff', cursor: step === 0 && !p.uso ? 'default' : 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14.5 }}>Continuar</button>}
          {step === 3 && <button onClick={submit} disabled={loading} style={{ flex: 1, padding: '12px 18px', borderRadius: 11, border: 'none', background: 'var(--theme)', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14.5 }}>{loading ? 'Buscando…' : 'Ver mis mejores opciones'}</button>}
          {step === 4 && <button onClick={() => setStep(1)} style={{ padding: '12px 18px', borderRadius: 11, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 14, color: 'var(--cream-2)' }}>Ajustar</button>}
          {step === 4 && <button onClick={applyToMarketplace} style={{ flex: 1, padding: '12px 18px', borderRadius: 11, border: 'none', background: 'var(--theme)', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14.5 }}>Ver en el marketplace →</button>}
        </div>
      </div>
    </div>
  );
}
