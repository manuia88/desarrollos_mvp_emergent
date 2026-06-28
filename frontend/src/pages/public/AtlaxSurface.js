// AtlaxSurface — el "buscador inmobiliario con IA": superficie conversacional de DESCUBRIMIENTO (no una burbuja).
// Dos modos: (1) ESCRIBE lo que buscas → filtra (exactos + casi-cumple en tiers + fallback a otras colonias) ·
// (2) QUE ATLAX TE GUÍE → perfilador (4 obligatorios: ubicación·presupuesto·recámaras·m² + baños/estac/amenidades).
// Reusa el motor del marketplace (aiSearchParse + /api/developments/casi como ranker · scores parciales + fallback) y
// los motores de PERSUASIÓN (buy-signal AVM + plusvalía SHF) en la VISTA RÁPIDA. Discovery-first: el CTA es Ver Ficha /
// Vista Rápida, NO "Apartar". El chat se CONSERVA al ir a la ficha (sessionStorage). Copy SIEMPRE accionable, cero
// callejones. Cada búsqueda/respuesta se registra granular (buyer_signal) → data para superadmin.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { sendBuyerSignal } from '../../lib/buyerSignal';
import { aiSearchParse, fetchCasiCumple } from '../../api/marketplace';
import { tc } from '../../lib/titleCase';
import AtlaxBlocks from '../../components/landing/AtlaxBlocks';
import AtlaxQuickView from '../../components/landing/AtlaxQuickView';
import { LightScope } from '../../components/ui';
import { Sparkle } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL || '';
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';
const HEAD = "'Outfit',sans-serif";
const CHAT_KEY = 'atlax_chat_v2';

const fmtM = (n) => (n == null ? '' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n).toLocaleString('es-MX')}`));
const firstStr = (v) => (Array.isArray(v) ? v[0] : v) || '';
const range = (r, suf = '') => (Array.isArray(r) && r.length ? (r[0] === r[1] ? `${r[0]}${suf}` : `${r[0]}–${r[1]}${suf}`) : null);
const AMEN = { roof: 'Roof Garden', gym: 'Gym', alberca: 'Alberca', pet: 'Pet Friendly', cowork: 'Coworking', bicicletas: 'Bici', seguridad: 'Seguridad', jardines: 'Áreas Verdes' };

// Señal de PERSUASIÓN desde el dato que ya trae el item (sin llamada extra).
function signal(d) {
  if (typeof d.precio_vs_zona_pct === 'number' && d.precio_vs_zona_pct <= -3) return `${Math.abs(Math.round(d.precio_vs_zona_pct))}% bajo el precio de la zona`;
  if (d.stage === 'preventa') return 'Preventa · precio de hoy';
  if (typeof d.plusvalia_zona === 'number' && d.plusvalia_zona >= 1) return `Plusvalía de zona +${d.plusvalia_zona.toFixed(1)}%`;
  if (d.units_available != null && d.units_available > 0 && d.units_available <= 5) return `Solo quedan ${d.units_available} unidades`;
  if (d.verified) return 'Desarrollo verificado';
  return null;
}

// Ejemplos = frases naturales (a propósito NO Title Case).
const EXAMPLES = [
  'Depa de 3 recámaras en la Condesa, hasta 8 millones, pet friendly',
  'Algo para invertir cerca del metro, menos de 4 millones',
  'Casa para mi familia con áreas verdes y escuelas cerca',
  '¿Dónde me alcanza para 2 recámaras en menos de 5 millones?',
];
const REFINE = ['Más Barato', 'Otra Colonia', 'Más Recámaras', 'Entrega Inmediata', 'Para Invertir'];

// Perfilador — 4 OBLIGATORIOS (ubicación·presupuesto se escriben · recámaras·m² con botón) + baños/estac/amenidades.
const PROFILER = [
  { key: 'zona', type: 'text', req: true, q: '¿En qué colonia o zona quieres vivir?', ph: 'Ej. Condesa, Del Valle, cerca de Polanco…' },
  { key: 'presupuesto', type: 'text', req: true, q: '¿Cuál es tu presupuesto?', ph: 'Ej. hasta 6 millones · entre 4 y 7M' },
  { key: 'recamaras', type: 'buttons', req: true, q: '¿Cuántas recámaras necesitas?', opts: ['1', '2', '3', '4 o más'] },
  { key: 'm2', type: 'buttons', req: true, q: '¿Cuánto espacio buscas?', opts: ['Hasta 60 m²', '60–90 m²', '90–120 m²', 'Más de 120 m²'] },
  { key: 'banos', type: 'buttons', q: '¿Cuántos baños?', opts: ['1', '2', '3 o más'], skip: 'Me da igual' },
  { key: 'estacionamientos', type: 'buttons', q: '¿Cuántos estacionamientos?', opts: ['1', '2', '3 o más'], skip: 'No necesito' },
  { key: 'amenidades', type: 'multi', q: '¿Qué amenidades te importan?', opts: ['Roof Garden', 'Gym', 'Alberca', 'Pet Friendly', 'Coworking', 'Seguridad 24h', 'Áreas Verdes'], skip: 'Ninguna en especial' },
];

function assembleQuery(a) {
  const p = ['Departamento'];
  if (a.recamaras) p.push(`${a.recamaras} recámaras`);
  if (a.banos) p.push(`${a.banos} baños`);
  if (a.estacionamientos) p.push(`${a.estacionamientos} estacionamientos`);
  if (a.m2) p.push(a.m2);
  if (a.zona) p.push(`en ${a.zona}`);
  if (a.presupuesto) p.push(a.presupuesto);
  if (Array.isArray(a.amenidades) && a.amenidades.length) p.push(`con ${a.amenidades.join(', ').toLowerCase()}`);
  return p.join(' ').replace(/\s+/g, ' ').trim();
}

// ── markdown mínimo + "se escribe solo" ──────────────────────────────────────
function renderRich(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((p, i) => (
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>
  ));
}
function Typewriter({ text }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const full = String(text || ''); setN(0);
    if (!full) return undefined;
    const id = setInterval(() => setN((x) => { if (x >= full.length) { clearInterval(id); return x; } return Math.min(full.length, x + 3); }), 16);
    return () => clearInterval(id);
  }, [text]);
  return <>{renderRich(String(text || '').slice(0, n))}</>;
}

// ── Tarjeta PERSUASIVA + match-first (CTA = Vista Rápida / Ver Ficha, NO Apartar) ──────
function ResultCard({ dev, onQuick }) {
  const img = (dev.photos || [])[0];
  const specs = [range(dev.bedrooms_range, ' rec'), range(dev.bathrooms_range, ' baños'), range(dev.m2_range, ' m²')].filter(Boolean).join(' · ');
  const sig = signal(dev);
  const falta = dev.match_falta || [];
  const isExact = falta.length === 0 && dev.match_total > 0;
  const amen = (dev.amenities || []).map((a) => AMEN[a] || tc(String(a))).slice(0, 3);
  return (
    <div style={{ border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <button onClick={() => onQuick(dev)} style={{ position: 'relative', border: 'none', padding: 0, cursor: 'pointer', background: 'var(--surface-card)', display: 'block' }}>
        <div style={{ height: 150, background: 'var(--surface-card)' }}>
          {img && <img src={img} alt={dev.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
        {dev.stage === 'preventa' && <span style={{ position: 'absolute', top: 9, left: 9, background: GRAD, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 10.5, padding: '4px 9px', borderRadius: 999 }}>Preventa</span>}
        {dev.match_total > 0 && (
          <span style={{ position: 'absolute', top: 9, right: 9, fontFamily: HEAD, fontWeight: 800, fontSize: 10.5, padding: '4px 9px', borderRadius: 999, background: isExact ? 'rgba(16,185,129,0.92)' : 'rgba(224,163,62,0.94)', color: '#fff' }}>{isExact ? 'Cumple Todo' : `Cumple ${dev.match_met}/${dev.match_total}`}</span>
        )}
      </button>
      <div style={{ padding: '11px 13px 4px' }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)', lineHeight: 1.2 }}>{dev.name}</div>
        <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{tc(dev.colonia || '')}{dev.alcaldia ? ` · ${tc(dev.alcaldia)}` : ''}</div>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--theme)', marginTop: 6 }}>{dev.price_from_display || fmtM(dev.price_from)}</div>
        {specs && <div style={{ fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>{specs}</div>}
        {amen.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>{amen.join(' · ')}</div>}
        {sig && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 9px', borderRadius: 8, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.26)', fontSize: 11.5, fontWeight: 700, color: '#0F9D6E' }}>◆ {sig}</div>}
        {falta.length > 0 && <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--cream-2)' }}>Le falta: <b style={{ color: '#B9822E' }}>{falta.map((x) => tc(x)).join(', ')}</b></div>}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', gap: 7, padding: '10px 13px 13px' }}>
        <button onClick={() => onQuick(dev)} style={{ flex: 1, cursor: 'pointer', background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--theme)', borderRadius: 9, padding: '8px', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700 }}>Vista Rápida</button>
        <Link to={`/desarrollo/${dev.id}?from=atlax`} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', background: '#fff', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 9, padding: '8px', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700 }}>Ver Ficha →</Link>
      </div>
    </div>
  );
}

const Grid = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(216px, 1fr))', gap: 12 }}>{children}</div>;
const SectionLabel = ({ children, hint }) => (
  <div style={{ marginTop: 18, marginBottom: 10 }}>
    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{children}</span>
    {hint && <span style={{ fontSize: 12, color: 'var(--cream-3)', marginLeft: 8 }}>{hint}</span>}
  </div>
);

// ── Resultado (exactos + casi-cumple en tiers + otras colonias + SIEMPRE salida accionable) ──
function ResultsBlock({ r, onQuick, onRefine, onAdvisor }) {
  const tiers = [
    { lo: 1, hi: 1, title: 'Casi Perfectas', sub: 'solo les falta un detalle' },
    { lo: 2, hi: 2, title: 'Muy Buenas', sub: 'les faltan dos cosas' },
    { lo: 3, hi: 99, title: 'Cercanas', sub: 'les faltan algunas' },
  ];
  const exact = r.exact || [], casi = r.casi || [], cross = r.crossZone || [];
  const nada = exact.length === 0 && casi.length === 0 && cross.length === 0 && !r.pending;
  return (
    <div>
      {r.zonaNoDisp && (
        <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)', fontSize: 13, color: 'var(--cream-2)', marginBottom: 14 }}>
          Todavía no cubrimos <b style={{ color: 'var(--cream)' }}>{tc(r.zonaNoDisp)}</b> (estamos en CDMX), pero mira lo más cercano.
          {r.zonaNoDispSlug && <> <Link to={`/zona/${r.zonaNoDispSlug}`} style={{ color: 'var(--theme)', fontWeight: 700, textDecoration: 'none' }}>Conoce {tc(r.zonaNoDisp)} →</Link></>}
        </div>
      )}

      {exact.length > 0 && (<><SectionLabel hint={exact.length === 1 ? '1 encaja con lo que buscas' : `${exact.length} encajan con lo que buscas`}>Para Ti</SectionLabel><Grid>{exact.map((d) => <ResultCard key={d.id} dev={d} onQuick={onQuick} />)}</Grid></>)}

      {casi.length > 0 && tiers.map((t) => {
        const grp = casi.filter((d) => { const n = (d.match_falta || []).length; return n >= t.lo && n <= t.hi; });
        if (!grp.length) return null;
        return (
          <div key={t.title}>
            <SectionLabel hint={`${t.sub} (${grp.length})`}>{exact.length ? t.title : `Se Acercan Mucho · ${t.title}`}</SectionLabel>
            <Grid>{grp.map((d) => <ResultCard key={d.id} dev={d} onQuick={onQuick} />)}</Grid>
          </div>
        );
      })}

      {cross.length > 0 && (
        <><SectionLabel hint="tu presupuesto rinde más aquí">{r.crossRelax === 'esquema' ? 'Con Otro Esquema, en Otras Colonias' : 'Tu Presupuesto Rinde Más en Otras Colonias'}</SectionLabel>
          <Grid>{cross.map((d) => <ResultCard key={d.id} dev={d} onQuick={onQuick} />)}</Grid></>
      )}

      {nada && (
        <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border)' }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginBottom: 4 }}>No vi algo con TODOS esos requisitos — pero no te vayas.</div>
          <div style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.5, marginBottom: 13 }}>Ajustemos un poco y seguro te encuentro algo. ¿Por dónde le movemos?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => onRefine('con un poco más de presupuesto')} style={chip}>Subir el Presupuesto</button>
            <button onClick={() => onRefine('ábreme a otras colonias cercanas')} style={chip}>Abrir a Otras Colonias</button>
            <button onClick={() => onRefine('sin tantas amenidades')} style={chip}>Quitar Amenidades</button>
            <button onClick={onAdvisor} style={ctaPrimary}>Que un Asesor Me Ayude</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AtlaxSurface() {
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [prof, setProf] = useState(null);   // { step, answers, picked, text }
  const [quick, setQuick] = useState(null);  // dev en vista rápida
  const endRef = useRef(null);
  const askedRef = useRef(false);
  const navigate = useNavigate();
  const [toast, setToast] = useState('');
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const lastUserQ = () => { const u = [...messages].reverse().find((m) => m.role === 'user'); return u ? u.text : ''; };
  const saveSearch = () => { try { sendBuyerSignal('atlax_query', { value: lastUserQ().slice(0, 120), meta: { saved: true } }); } catch (_) { /* noop */ } flash('Búsqueda Guardada ✓'); };
  const wantAdvisor = (dev) => { try { sendBuyerSignal('lead', { value: 'atlax_surface', entity_id: dev && dev.id }); } catch (_) { /* noop */ } setQuick(null); flash('Listo — un asesor te contacta pronto ✓'); };

  const runSearch = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q || busy) return;
    setBusy(true); setProf(null);
    const aid = `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const isCompare = /\bvs\b|\bcompar/i.test(q);
    setMessages((prev) => [...prev,
      { id: `u_${aid}`, role: 'user', text: q },
      { id: aid, role: 'atlax', kind: isCompare ? 'compare' : 'results', intro: '', r: { pending: true }, blocks: [], pending: true },
    ]);
    const patch = (p) => setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, ...p } : m)));

    if (isCompare) {
      try {
        const res = await fetch(`${API}/api/atlax/blocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
        const d = await res.json();
        patch({ blocks: (d && d.blocks) || [], intro: 'Aquí va la comparativa por colonia:', pending: false });
      } catch (_) { patch({ intro: 'No pude armar la comparativa ahora — intenta de nuevo.', pending: false }); }
      try { sendBuyerSignal('atlax_query', { value: q.slice(0, 120), meta: { kind: 'compare' } }); } catch (_) { /* noop */ }
      setBusy(false); return;
    }

    let filters = {}, zonaNoDisp = null, zonaNoDispSlug = null, crossZone = [], crossRelax = null;
    try {
      const parsed = await aiSearchParse(q);
      filters = (parsed && parsed.filters) || {};
      zonaNoDisp = (parsed && parsed.zona_no_disponible) || null;
      zonaNoDispSlug = (parsed && parsed.zona_no_disponible_slug) || null;
      crossZone = Array.isArray(parsed && parsed.cross_zone) ? parsed.cross_zone : [];
      crossRelax = (parsed && parsed.cross_relax) || null;
    } catch (_) { /* fail-soft */ }

    let vid = ''; try { vid = localStorage.getItem('dmx_visitor_id') || ''; } catch (_) { /* noop */ }
    const casiResp = await fetchCasiCumple({ ...filters, visitor_id: vid, limit: 12 }).catch(() => ({ casi: [] }));
    const all = (casiResp && casiResp.casi) || [];
    const exact = all.filter((d) => (d.match_falta || []).length === 0).slice(0, 6);
    const casi = all.filter((d) => (d.match_falta || []).length > 0).slice(0, 9);
    const colonia = firstStr(filters.colonia || filters.zona);
    const enCol = colonia ? ` en ${tc(colonia)}` : '';

    const intro = zonaNoDisp
      ? `Todavía no llego a ${tc(zonaNoDisp)}, pero mira lo más cercano y otras colonias que sí encajan:`
      : exact.length > 0
        ? `Tengo ${exact.length === 1 ? 'una opción' : `${exact.length} opciones`} que encajan con lo que buscas${enCol}.${casi.length ? ' Y abajo, otras que se acercan:' : ' Échales un ojo:'}`
        : casi.length > 0
          ? `Estas se acercan mucho${enCol} — te marco lo que cumple cada una y el detalle que le falta:`
          : crossZone.length > 0
            ? `En ${tc(colonia) || 'esa colonia'} con eso está apretado, pero tu presupuesto rinde muy bien aquí cerca:`
            : `Vamos a afinar para encontrarte algo bueno${enCol}:`;

    patch({ intro, r: { exact, casi, crossZone, crossRelax, zonaNoDisp, zonaNoDispSlug, pending: false }, pending: false });

    try {
      sendBuyerSignal('atlax_query', {
        colonia: String(colonia || '').toLowerCase() || undefined, value: q.slice(0, 120),
        meta: { beds: filters.beds, max_price: filters.max_price, min_price: filters.min_price, tipo: firstStr(filters.tipo) || undefined, intent: filters.buyer_intent || filters.intent, amenidades: Array.isArray(filters.amenity) ? filters.amenity.join(',') : filters.amenity, n_exact: exact.length, n_casi: casi.length, cross_zone: crossZone.length, zona_no_disponible: zonaNoDisp || undefined },
      });
    } catch (_) { /* noop */ }
    setBusy(false);
  }, [busy]);

  // ── Perfilador ──────────────────────────────────────────────────────────────
  const startProfiler = () => {
    setMessages((prev) => [...prev, { id: `p_${Date.now()}`, role: 'atlax', kind: 'text', intro: 'Va — te hago unas preguntas rápidas y te armo la búsqueda ideal.', pending: false }]);
    setProf({ step: 0, answers: {}, picked: [], text: '' });
  };
  const commitStep = (cur, val) => {
    const value = cur.type === 'multi' ? prof.picked : val;
    const answers = { ...prof.answers, [cur.key]: cur.type === 'multi' ? (prof.picked.length ? prof.picked : undefined) : (val || undefined) };
    try { sendBuyerSignal('atlax_profile', { value: cur.key, meta: { paso: cur.key, respuesta: Array.isArray(value) ? value.join(', ') : String(value || '—') } }); } catch (_) { /* noop */ }
    const echo = cur.type === 'multi' ? (prof.picked.join(', ') || 'Ninguna en especial') : (val || (cur.skip || '—'));
    setMessages((prev) => [...prev, { id: `pu_${Date.now()}`, role: 'user', text: echo }]);
    if (prof.step + 1 >= PROFILER.length) {
      setProf(null);
      try { sendBuyerSignal('atlax_profile', { value: 'completo', colonia: String(answers.zona || '').toLowerCase() || undefined, meta: { ...answers, amenidades: Array.isArray(answers.amenidades) ? answers.amenidades.join(', ') : answers.amenidades } }); } catch (_) { /* noop */ }
      runSearch(assembleQuery(answers));
    } else {
      setProf((p) => ({ step: p.step + 1, answers, picked: [], text: '' }));
    }
  };
  const togglePick = (val) => setProf((p) => ({ ...p, picked: p.picked.includes(val) ? p.picked.filter((x) => x !== val) : [...p.picked, val] }));

  // ── Persistencia del chat + auto-pregunta del ?q= ─────────────────────────────
  useEffect(() => {
    if (askedRef.current) return; askedRef.current = true;
    try { const saved = sessionStorage.getItem(CHAT_KEY); if (saved) { const m = JSON.parse(saved); if (Array.isArray(m) && m.length) setMessages(m); } } catch (_) { /* noop */ }
    const q = params.get('q');
    if (q) { runSearch(q); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-12))); } catch (_) { /* noop */ } }, [messages]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy, prof]);

  const submit = (e) => { if (e && e.preventDefault) e.preventDefault(); const q = input.trim(); if (q) { setInput(''); runSearch(q); } };
  const newChat = () => { setMessages([]); setProf(null); try { sessionStorage.removeItem(CHAT_KEY); } catch (_) { /* noop */ } };
  const empty = messages.length === 0 && !busy && !prof;
  const dis = busy || !input.trim();
  const curStep = prof ? PROFILER[prof.step] : null;

  return (
    <LightScope full style={{ display: 'flex', flexDirection: 'column' }}>
      {toast && <div style={{ position: 'fixed', bottom: 92, left: '50%', transform: 'translateX(-50%)', background: 'var(--theme)', color: '#fff', padding: '10px 18px', borderRadius: 999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, zIndex: 60, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--card-border)' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--cream)', fontFamily: HEAD, fontWeight: 800, fontSize: 16 }}>Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {messages.length > 0 && <button onClick={newChat} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600 }}>Nueva Búsqueda</button>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13 }}><Sparkle size={16} /> Atlax</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 28 }}>

          {empty && (
            <div style={{ textAlign: 'center', padding: '46px 0 8px' }}>
              <div style={{ width: 58, height: 58, margin: '0 auto 16px', borderRadius: 17, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 14px 36px rgba(var(--theme-rgb),0.30)' }}><Sparkle size={28} /></div>
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,4vw,36px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '0 0 10px' }}>Pregúntale a Atlax</h1>
              <p style={{ fontFamily: 'DM Sans', fontSize: 15.5, color: 'var(--cream-3)', maxWidth: 520, margin: '0 auto 26px', lineHeight: 1.5 }}>El buscador inmobiliario con IA. Dime qué buscas y te muestro lo que encaja — y lo que casi. Sin presión.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, maxWidth: 620, margin: '0 auto 24px' }}>
                <button onClick={() => { const el = document.getElementById('atlax-input'); if (el) el.focus(); }} style={{ textAlign: 'left', cursor: 'pointer', background: '#fff', border: '1px solid var(--card-border)', borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)', marginBottom: 5 }}>Escribe Lo Que Buscas</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.45 }}>Pon tus requisitos y filtro el catálogo al instante.</div>
                </button>
                <button onClick={startProfiler} style={{ textAlign: 'left', cursor: 'pointer', background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.24)', borderRadius: 16, padding: '16px 18px' }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--theme)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkle size={15} /> Que Atlax Me Guíe</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.45 }}>¿No sabes por dónde empezar? Te hago unas preguntas.</div>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 620, margin: '0 auto' }}>
                {EXAMPLES.map((ex, i) => (
                  <button key={i} onClick={() => runSearch(ex)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left', background: '#fff', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 12, padding: '12px 16px', fontFamily: 'DM Sans', fontSize: 14, cursor: 'pointer' }}>{ex}<span style={{ color: 'var(--theme)', flexShrink: 0 }}>→</span></button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            const last = idx === messages.length - 1;
            if (m.role === 'user') {
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end', margin: '16px 0 4px' }}>
                  <div style={{ background: 'rgba(var(--theme-rgb),0.12)', border: '1px solid rgba(var(--theme-rgb),0.22)', color: 'var(--cream)', borderRadius: '16px 16px 4px 16px', padding: '10px 15px', fontFamily: 'DM Sans', fontSize: 14.5, fontWeight: 600, maxWidth: '85%' }}>{m.text}</div>
                </div>
              );
            }
            return (
              <div key={m.id} style={{ margin: '14px 0' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13, marginBottom: 8 }}><Sparkle size={15} /> Atlax</div>
                {m.pending && !m.intro ? (
                  <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 14, fontStyle: 'italic' }}>Atlax está buscando…</div>
                ) : (
                  <>
                    {m.intro && <div style={{ color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 15, lineHeight: 1.6, marginBottom: 12 }}>{last ? <Typewriter text={m.intro} /> : renderRich(m.intro)}</div>}
                    {m.kind === 'results' && m.r && !m.r.pending && <ResultsBlock r={m.r} onQuick={setQuick} onRefine={(suf) => runSearch(`${lastUserQ()} ${suf}`)} onAdvisor={() => wantAdvisor()} />}
                    {m.kind === 'compare' && m.blocks && m.blocks.length > 0 && <AtlaxBlocks blocks={m.blocks} />}
                    {last && !m.pending && (m.kind === 'results' || m.kind === 'compare') && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--card-border)' }}>
                        {REFINE.map((c) => <button key={c} onClick={() => runSearch(`${lastUserQ()} — ${c.toLowerCase()}`)} style={chip}>{c}</button>)}
                        <button onClick={saveSearch} style={cta}>Guardar Búsqueda</button>
                        <button onClick={startProfiler} style={cta}>Que Atlax Me Guíe</button>
                        <button onClick={() => wantAdvisor()} style={ctaPrimary}>Hablar con un Asesor</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {curStep && (
            <div style={{ margin: '14px 0' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13, marginBottom: 8 }}><Sparkle size={15} /> Atlax · pregunta {prof.step + 1} de {PROFILER.length}{curStep.req ? '' : ' · opcional'}</div>
              <div style={{ color: 'var(--cream)', fontFamily: HEAD, fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em', marginBottom: 12 }}>{curStep.q}</div>

              {curStep.type === 'text' && (
                <form onSubmit={(e) => { e.preventDefault(); if (prof.text.trim()) commitStep(curStep, prof.text.trim()); }} style={{ display: 'flex', gap: 8, maxWidth: 520 }}>
                  <input autoFocus value={prof.text} onChange={(e) => setProf((p) => ({ ...p, text: e.target.value }))} placeholder={curStep.ph} style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid var(--card-border)', borderRadius: 12, padding: '12px 15px', fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream)', outline: 'none' }} />
                  <button type="submit" disabled={!prof.text.trim()} style={{ ...ctaPrimary, opacity: prof.text.trim() ? 1 : 0.5, cursor: prof.text.trim() ? 'pointer' : 'default' }}>Continuar →</button>
                </form>
              )}
              {curStep.type === 'buttons' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {curStep.opts.map((o) => <button key={o} onClick={() => commitStep(curStep, o)} style={chip}>{o}</button>)}
                  {curStep.skip && <button onClick={() => commitStep(curStep, '')} style={cta}>{curStep.skip}</button>}
                </div>
              )}
              {curStep.type === 'multi' && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {curStep.opts.map((o) => <button key={o} onClick={() => togglePick(o)} style={prof.picked.includes(o) ? chipOn : chip}>{o}</button>)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => commitStep(curStep, prof.picked)} style={ctaPrimary}>{prof.picked.length ? `Listo (${prof.picked.length}) →` : 'Continuar →'}</button>
                    {curStep.skip && !prof.picked.length && <button onClick={() => commitStep(curStep, [])} style={cta}>{curStep.skip}</button>}
                  </div>
                </>
              )}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(transparent, var(--bg) 32%)', padding: '14px 16px 22px' }}>
        <form onSubmit={submit} style={{ maxWidth: 780, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--card-border)', borderRadius: 999, padding: '7px 7px 7px 18px', boxShadow: '0 12px 36px rgba(var(--theme-rgb),0.14)' }}>
          <span style={{ display: 'flex', color: 'var(--theme)', flexShrink: 0 }}><Sparkle size={18} /></span>
          <input id="atlax-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pregúntale a Atlax lo que buscas…" autoFocus style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 15.5, padding: '11px 4px' }} />
          <button type="submit" disabled={dis} style={{ flexShrink: 0, border: 'none', cursor: dis ? 'default' : 'pointer', background: dis ? '#EAEBEF' : GRAD, color: dis ? '#9AA0AD' : '#fff', borderRadius: 999, padding: '11px 20px', fontFamily: 'DM Sans', fontSize: 14.5, fontWeight: 700 }}>Buscar</button>
        </form>
      </div>

      {quick && <AtlaxQuickView dev={quick} onClose={() => setQuick(null)} onAdvisor={wantAdvisor} />}
    </LightScope>
  );
}

const chip = { background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const chipOn = { ...chip, background: 'var(--theme)', border: '1px solid var(--theme)', color: '#fff' };
const cta = { background: '#fff', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ctaPrimary = { ...cta, background: GRAD, border: 'none', color: '#fff', fontWeight: 700 };
