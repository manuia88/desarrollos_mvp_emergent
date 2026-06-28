// AtlaxSurface — el "buscador inmobiliario con IA": superficie conversacional de DESCUBRIMIENTO (no una burbuja).
// Dos modos:
//   1) ESCRIBE lo que buscas  → el motor filtra: exactos + "lo más cercano" (cumple X/Y · le falta Z, en tiers) +
//      fallback a OTRAS colonias cuando tu presupuesto rinde más allá + honestidad de zona no cubierta.
//   2) QUE ATLAX TE GUÍE      → perfilador por preguntas (para quien apenas empieza y no sabe qué pedir).
// Reusa el motor YA construido del marketplace (aiSearchParse + fetchDevelopments + fetchCasiCumple — scores
// parciales + fallback) y la captura de demanda. Discovery-first: NO empuja "Apartar" (el cliente apenas explora;
// Apartar vive en la ficha). Cada búsqueda y cada respuesta se registra GRANULAR (buyer_signal) → data para superadmin.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { sendBuyerSignal } from '../../lib/buyerSignal';
import { aiSearchParse, fetchCasiCumple } from '../../api/marketplace';
import { tc } from '../../lib/titleCase';
import AtlaxBlocks from '../../components/landing/AtlaxBlocks';
import { LightScope } from '../../components/ui';  // v2: tema CLARO del rediseño
import { Sparkle } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL || '';
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';
const HEAD = "'Outfit',sans-serif";

const fmtM = (n) => (n == null ? '' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n).toLocaleString('es-MX')}`));
const firstStr = (v) => (Array.isArray(v) ? v[0] : v) || '';

// Ejemplos = frases NATURALES (lo que el usuario teclea) — a propósito NO en Title Case.
const EXAMPLES = [
  'Depa de 3 recámaras en la Condesa, hasta 8 millones, pet friendly',
  'Algo para invertir cerca del metro, menos de 4 millones',
  'Casa para mi familia con áreas verdes y escuelas cerca',
  '¿Dónde me alcanza para 2 recámaras en menos de 5 millones?',
];

// Chips para AFINAR un resultado (refinamiento) — Title Case.
const REFINE = ['Más Barato', 'Otra Colonia', 'Más Recámaras', 'Entrega Inmediata', 'Para Invertir'];

// Perfilador — Atlax guía con preguntas. Cada respuesta se registra granular.
const PROFILER = [
  { key: 'intent', q: '¿Buscas para Vivir o para Invertir?', opts: ['Para Vivir', 'Para Invertir', 'Aún No Sé'] },
  { key: 'presupuesto', q: '¿En Qué Presupuesto Te Mueves?', opts: ['Hasta $3M', '$3M – $6M', '$6M – $12M', 'Más de $12M'] },
  { key: 'zona', q: '¿En Qué Colonia o Cerca de Qué?', opts: ['Condesa', 'Roma Norte', 'Polanco', 'Del Valle', 'Sorpréndeme'], free: 'Otra colonia o lugar…' },
  { key: 'recamaras', q: '¿Cuántas Recámaras Necesitas?', opts: ['1', '2', '3', '4 o más'] },
  { key: 'extras', q: '¿Algo Importante para Ti?', opts: ['Pet Friendly', 'Cerca del Metro', 'Escuelas', 'Áreas Verdes', 'Seguridad', 'Gym'], multi: true },
];

const PRESUP_TXT = { 'Hasta $3M': 'hasta 3 millones', '$3M – $6M': 'entre 3 y 6 millones', '$6M – $12M': 'entre 6 y 12 millones', 'Más de $12M': 'más de 12 millones' };

function assembleQuery(a) {
  const p = [];
  if (a.recamaras) p.push(`${a.recamaras === '4 o más' ? '4 o más' : a.recamaras} recámaras`);
  if (a.zona && a.zona !== 'Sorpréndeme') p.push(`en ${a.zona}`);
  if (a.presupuesto) p.push(PRESUP_TXT[a.presupuesto] || a.presupuesto);
  if (a.intent === 'Para Invertir') p.push('para invertir');
  if (Array.isArray(a.extras) && a.extras.length) p.push(`con ${a.extras.join(', ').toLowerCase()}`);
  return `Departamento ${p.join(' ')}`.replace(/\s+/g, ' ').trim();
}

// ── Markdown mínimo + "se escribe solo" ──────────────────────────────────────
function renderRich(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((p, i) => (
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>
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

// ── Tarjeta de resultado (discovery-first: el CTA primario es "Ver Ficha", NO "Apartar") ──────
function ResultCard({ dev, badge }) {
  const img = (dev.photos || [])[0] || dev.image;
  const price = dev.price_from_display || fmtM(dev.price_from);
  const beds = dev.bedrooms_range;
  const url = `/desarrollo/${dev.id}`;
  return (
    <div style={{ border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <Link to={url} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ height: 132, background: 'var(--surface-card)' }}>
          {img && <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
        <div style={{ padding: '11px 13px 6px' }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14.5, color: 'var(--cream)', lineHeight: 1.2 }}>{dev.name}</div>
          <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{tc(dev.colonia || '')}{dev.alcaldia ? ` · ${tc(dev.alcaldia)}` : ''}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15.5, color: 'var(--theme)' }}>{price}</span>
            {Array.isArray(beds) && beds.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{beds[0]}{beds[1] && beds[1] !== beds[0] ? `–${beds[1]}` : ''} rec</span>}
          </div>
        </div>
      </Link>
      {badge && (
        <div style={{ margin: '4px 13px 0', padding: '6px 10px', borderRadius: 9, fontSize: 11.5, lineHeight: 1.35,
          background: badge.tone === 'warn' ? 'rgba(224,163,62,0.10)' : 'rgba(var(--theme-rgb),0.08)',
          border: `1px solid ${badge.tone === 'warn' ? 'rgba(224,163,62,0.28)' : 'rgba(var(--theme-rgb),0.20)'}`,
          color: 'var(--cream-2)' }}>{badge.content}</div>
      )}
      <div style={{ marginTop: 'auto', padding: '10px 13px 13px' }}>
        <Link to={url} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--theme)', borderRadius: 9, padding: '8px', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700 }}>Ver Ficha →</Link>
      </div>
    </div>
  );
}

const Grid = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(208px, 1fr))', gap: 12 }}>{children}</div>;
const SectionLabel = ({ children, hint }) => (
  <div style={{ marginTop: 18, marginBottom: 10 }}>
    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{children}</span>
    {hint && <span style={{ fontSize: 12, color: 'var(--cream-3)', marginLeft: 8 }}>{hint}</span>}
  </div>
);

// ── Resultado completo (exactos + casi-cumple en tiers + otras colonias + zona no cubierta) ──
function ResultsBlock({ r }) {
  const tiers = [
    { lo: 1, hi: 1, title: 'Casi Perfectas', sub: 'solo les falta un detalle' },
    { lo: 2, hi: 2, title: 'Muy Buenas', sub: 'les faltan dos cosas' },
    { lo: 3, hi: 99, title: 'Cercanas', sub: 'les faltan algunas' },
  ];
  const exact = r.exact || [];
  const casi = r.casi || [];
  const cross = r.crossZone || [];
  return (
    <div>
      {r.zonaNoDisp && (
        <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)', fontSize: 13, color: 'var(--cream-2)', marginBottom: 14 }}>
          Por ahora no tenemos desarrollos en <b style={{ color: 'var(--cream)' }}>{tc(r.zonaNoDisp)}</b> (cubrimos CDMX). Te muestro lo más cercano.
          {r.zonaNoDispSlug && <> <Link to={`/zona/${r.zonaNoDispSlug}`} style={{ color: 'var(--theme)', fontWeight: 700, textDecoration: 'none' }}>Conoce {tc(r.zonaNoDisp)} a Fondo →</Link></>}
        </div>
      )}

      {exact.length > 0 && (
        <>
          <SectionLabel hint={exact.length === 1 ? '1 cumple lo que buscas' : `${exact.length} cumplen lo que buscas`}>Lo Que Buscas</SectionLabel>
          <Grid>{exact.map((d) => <ResultCard key={d.id} dev={d} />)}</Grid>
        </>
      )}

      {casi.length > 0 && tiers.map((t) => {
        const grp = casi.filter((d) => { const n = (d.match_falta || []).length; return n >= t.lo && n <= t.hi; });
        if (!grp.length) return null;
        return (
          <div key={t.title}>
            <SectionLabel hint={`${t.sub} (${grp.length})`}>{exact.length ? t.title : `Lo Más Cercano · ${t.title}`}</SectionLabel>
            <Grid>{grp.map((d) => (
              <ResultCard key={d.id} dev={d} badge={(d.match_falta || []).length > 0 ? {
                tone: 'warn',
                content: <>Cumple <b style={{ color: 'var(--cream)' }}>{d.match_met}/{d.match_total}</b> · le falta: <b style={{ color: '#B9822E' }}>{(d.match_falta || []).map((x) => tc(x)).join(', ')}</b></>,
              } : null} />
            ))}</Grid>
          </div>
        );
      })}

      {cross.length > 0 && (
        <>
          <SectionLabel hint="tu presupuesto rinde más aquí">
            {r.crossRelax === 'cercano' ? 'Lo Más Cercano en Otras Colonias' : r.crossRelax === 'esquema' ? 'Con Otro Esquema de Pago, en Otras Colonias' : 'Tu Presupuesto Rinde Más en Otras Colonias'}
          </SectionLabel>
          <Grid>{cross.map((d) => (
            <ResultCard key={d.id} dev={d} badge={typeof d.match === 'number' ? {
              content: <>Coincidencia <b style={{ color: 'var(--theme)' }}>{d.match}/10</b> con lo que pediste</>,
            } : null} />
          ))}</Grid>
        </>
      )}

      {exact.length === 0 && casi.length === 0 && cross.length === 0 && !r.pending && (
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface-card)', border: '1px solid var(--card-border)', fontSize: 13.5, color: 'var(--cream-2)' }}>
          No encontré opciones con esos requisitos. Prueba ampliar el presupuesto o la colonia — o deja que te guíe con unas preguntas.
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
  const [prof, setProf] = useState(null);   // perfilador: { step, answers, picked:[] }
  const endRef = useRef(null);
  const askedRef = useRef(false);
  const navigate = useNavigate();
  const [toast, setToast] = useState('');
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const lastUserQ = () => { const u = [...messages].reverse().find((m) => m.role === 'user'); return u ? u.text : ''; };
  const saveSearch = () => { try { sendBuyerSignal('atlax_query', { value: lastUserQ().slice(0, 120), meta: { saved: true } }); } catch (_) { /* noop */ } flash('Búsqueda Guardada ✓'); };
  const wantAdvisor = () => { try { sendBuyerSignal('lead', { value: 'atlax_surface' }); } catch (_) { /* noop */ } flash('Listo — un asesor revisará tu búsqueda ✓'); };

  // ── Búsqueda (modo filtro) ──────────────────────────────────────────────────
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

    // Rama COMPARATIVA — reusa los bloques (tabla rica por colonia).
    if (isCompare) {
      try {
        const res = await fetch(`${API}/api/atlax/blocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
        const d = await res.json();
        patch({ blocks: (d && d.blocks) || [], intro: 'Te dejo la comparativa por colonia:', pending: false });
      } catch (_) { patch({ intro: 'No pude armar la comparativa ahora.', pending: false }); }
      try { sendBuyerSignal('atlax_query', { value: q.slice(0, 120), meta: { kind: 'compare' } }); } catch (_) { /* noop */ }
      setBusy(false); return;
    }

    // Rama FILTRO — el motor del marketplace: parse → exactos + casi-cumple + fallback a otras colonias.
    let filters = {}, zonaNoDisp = null, zonaNoDispSlug = null, crossZone = [], crossRelax = null;
    try {
      const parsed = await aiSearchParse(q);
      filters = (parsed && parsed.filters) || {};
      zonaNoDisp = (parsed && parsed.zona_no_disponible) || null;
      zonaNoDispSlug = (parsed && parsed.zona_no_disponible_slug) || null;
      crossZone = Array.isArray(parsed && parsed.cross_zone) ? parsed.cross_zone : [];
      crossRelax = (parsed && parsed.cross_relax) || null;
    } catch (_) { /* fail-soft: filtros vacíos */ }

    // El endpoint `casi` es el RANKER por criterios cumplidos (entiende los params de search-ai). De ahí salen
    // exactos (le falta 0) y "casi cumple" (le falta ≥1) — y de paso registra la demanda (visitor_id).
    let vid = ''; try { vid = localStorage.getItem('dmx_visitor_id') || ''; } catch (_) { /* noop */ }
    const casiResp = await fetchCasiCumple({ ...filters, visitor_id: vid, limit: 12 }).catch(() => ({ casi: [] }));
    const all = (casiResp && casiResp.casi) || [];
    const exact = all.filter((d) => (d.match_falta || []).length === 0).slice(0, 6);
    const casi = all.filter((d) => (d.match_falta || []).length > 0).slice(0, 9);

    const colonia = firstStr(filters.colonia || filters.zona);
    const intro = zonaNoDisp
      ? `No tengo desarrollos en ${tc(zonaNoDisp)} todavía — te muestro lo más cercano y otras colonias que cumplen.`
      : exact.length > 0
        ? `Encontré ${exact.length === 1 ? '1 opción que cumple' : `${exact.length} opciones que cumplen`} lo que buscas${colonia ? ` en ${tc(colonia)}` : ''}.${casi.length ? ' Abajo te dejo otras que se acercan.' : ''}`
        : casi.length > 0
          ? `Ninguna cumple todo al 100%, pero estas son las que más se acercan — te digo qué le falta a cada una.`
          : crossZone.length > 0
            ? 'En esa colonia no hubo match exacto, pero tu presupuesto rinde en otras. Mira esto.'
            : 'No encontré opciones con esos requisitos. Prueba ampliar presupuesto o colonia.';

    patch({ intro, r: { exact, casi, crossZone, crossRelax, zonaNoDisp, zonaNoDispSlug, pending: false }, pending: false });

    // Captura GRANULAR → buyer_signals (data para superadmin). fetchCasiCumple ya registró la demanda insatisfecha.
    try {
      sendBuyerSignal('atlax_query', {
        colonia: String(colonia || '').toLowerCase() || undefined,
        value: q.slice(0, 120),
        meta: {
          beds: filters.beds, max_price: filters.max_price, min_price: filters.min_price, tipo: firstStr(filters.tipo) || undefined,
          intent: filters.buyer_intent || filters.intent,
          amenidades: Array.isArray(filters.amenity) ? filters.amenity.join(',') : filters.amenity,
          n_exact: exact.length, n_casi: casi.length, cross_zone: crossZone.length, zona_no_disponible: zonaNoDisp || undefined,
        },
      });
    } catch (_) { /* noop */ }
    setBusy(false);
  }, [busy]);

  // ── Perfilador (modo guía) ──────────────────────────────────────────────────
  const startProfiler = () => {
    setMessages((prev) => [...prev, { id: `p_${Date.now()}`, role: 'atlax', kind: 'text', intro: 'Va — te hago unas preguntas rápidas y armo tu búsqueda.', pending: false }]);
    setProf({ step: 0, answers: {}, picked: [] });
  };
  const answerProfiler = (val) => {
    if (!prof) return;
    const cur = PROFILER[prof.step];
    if (cur.multi) {  // multi-select: acumula, no avanza hasta "Listo"
      setProf((p) => ({ ...p, picked: p.picked.includes(val) ? p.picked.filter((x) => x !== val) : [...p.picked, val] }));
      return;
    }
    commitStep(cur, val);
  };
  const commitStep = (cur, val) => {
    const value = cur.multi ? prof.picked : val;
    const answers = { ...prof.answers, [cur.key]: value };
    try { sendBuyerSignal('atlax_profile', { value: cur.key, meta: { paso: cur.key, respuesta: Array.isArray(value) ? value.join(', ') : String(value) } }); } catch (_) { /* noop */ }
    // eco de la respuesta del usuario
    const echo = cur.multi ? (prof.picked.join(', ') || 'Sin preferencia') : val;
    setMessages((prev) => [...prev, { id: `pu_${Date.now()}`, role: 'user', text: echo }]);
    if (prof.step + 1 >= PROFILER.length) {
      setProf(null);
      const query = assembleQuery(answers);
      try { sendBuyerSignal('atlax_profile', { value: 'completo', meta: { ...answers, extras: Array.isArray(answers.extras) ? answers.extras.join(', ') : answers.extras } }); } catch (_) { /* noop */ }
      runSearch(query);
    } else {
      setProf((p) => ({ step: p.step + 1, answers, picked: [] }));
    }
  };

  // auto-pregunta del ?q= (viene de la barra-héroe del home)
  useEffect(() => {
    if (askedRef.current) return;
    const q = params.get('q');
    if (q) { askedRef.current = true; runSearch(q); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy, prof]);

  const submit = (e) => { if (e && e.preventDefault) e.preventDefault(); const q = input.trim(); if (q) { setInput(''); runSearch(q); } };
  const empty = messages.length === 0 && !busy && !prof;
  const dis = busy || !input.trim();
  const curStep = prof ? PROFILER[prof.step] : null;

  return (
    <LightScope full style={{ display: 'flex', flexDirection: 'column' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 92, left: '50%', transform: 'translateX(-50%)', background: 'var(--theme)', color: '#fff', padding: '10px 18px', borderRadius: 999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, zIndex: 60, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--card-border)' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--cream)', fontFamily: HEAD, fontWeight: 800, fontSize: 16 }}>
          Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
        </Link>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13 }}>
          <Sparkle size={16} /> Atlax
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 28 }}>

          {empty && (
            <div style={{ textAlign: 'center', padding: '46px 0 8px' }}>
              <div style={{ width: 58, height: 58, margin: '0 auto 16px', borderRadius: 17, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 14px 36px rgba(var(--theme-rgb),0.30)' }}><Sparkle size={28} /></div>
              <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(26px,4vw,36px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '0 0 10px' }}>Pregúntale a Atlax</h1>
              <p style={{ fontFamily: 'DM Sans', fontSize: 15.5, color: 'var(--cream-3)', maxWidth: 520, margin: '0 auto 26px', lineHeight: 1.5 }}>El buscador inmobiliario con IA. Dime qué buscas y te muestro lo que cumple — y lo que casi cumple. Sin presión.</p>

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
                  <button key={i} onClick={() => runSearch(ex)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left', background: '#fff', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 12, padding: '12px 16px', fontFamily: 'DM Sans', fontSize: 14, cursor: 'pointer' }}>
                    {ex}<span style={{ color: 'var(--theme)', flexShrink: 0 }}>→</span>
                  </button>
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
                    {m.kind === 'results' && m.r && !m.r.pending && <ResultsBlock r={m.r} />}
                    {m.kind === 'compare' && m.blocks && m.blocks.length > 0 && <AtlaxBlocks blocks={m.blocks} />}
                    {last && !m.pending && (m.kind === 'results' || m.kind === 'compare') && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--card-border)' }}>
                        {REFINE.map((c) => <button key={c} onClick={() => runSearch(`${lastUserQ()} — ${c.toLowerCase()}`)} style={chip}>{c}</button>)}
                        <button onClick={saveSearch} style={cta}>Guardar Búsqueda</button>
                        <button onClick={startProfiler} style={cta}>Que Atlax Me Guíe</button>
                        <button onClick={wantAdvisor} style={ctaPrimary}>Hablar con un Asesor</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {curStep && (
            <div style={{ margin: '14px 0' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--theme)', fontWeight: 700, fontFamily: 'DM Sans', fontSize: 13, marginBottom: 8 }}><Sparkle size={15} /> Atlax · pregunta {prof.step + 1} de {PROFILER.length}</div>
              <div style={{ color: 'var(--cream)', fontFamily: HEAD, fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em', marginBottom: 12 }}>{curStep.q}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {curStep.opts.map((o) => {
                  const on = curStep.multi && prof.picked.includes(o);
                  return <button key={o} onClick={() => answerProfiler(o)} style={on ? chipOn : chip}>{o}</button>;
                })}
              </div>
              {curStep.multi && (
                <button onClick={() => commitStep(curStep, prof.picked)} style={{ ...ctaPrimary, marginTop: 12 }}>{prof.picked.length ? `Listo (${prof.picked.length}) →` : 'Sin Preferencia →'}</button>
              )}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(transparent, var(--bg) 32%)', padding: '14px 16px 22px' }}>
        <form onSubmit={submit} style={{ maxWidth: 780, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--card-border)', borderRadius: 999, padding: '7px 7px 7px 18px', boxShadow: '0 12px 36px rgba(var(--theme-rgb),0.14)' }}>
          <span style={{ display: 'flex', color: 'var(--theme)', flexShrink: 0 }}><Sparkle size={18} /></span>
          <input id="atlax-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pregúntale a Atlax lo que buscas…" autoFocus
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 15.5, padding: '11px 4px' }} />
          <button type="submit" disabled={dis} style={{ flexShrink: 0, border: 'none', cursor: dis ? 'default' : 'pointer', background: dis ? '#EAEBEF' : GRAD, color: dis ? '#9AA0AD' : '#fff', borderRadius: 999, padding: '11px 20px', fontFamily: 'DM Sans', fontSize: 14.5, fontWeight: 700 }}>Buscar</button>
        </form>
      </div>
    </LightScope>
  );
}

// estilos compartidos (tema claro v2 · buen contraste sobre blanco)
const chip = { background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const chipOn = { ...chip, background: 'var(--theme)', border: '1px solid var(--theme)', color: '#fff' };
const cta = { background: '#fff', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ctaPrimary = { ...cta, background: GRAD, border: 'none', color: '#fff', fontWeight: 700 };
