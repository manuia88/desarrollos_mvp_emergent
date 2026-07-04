// AtlaxSurface — el "buscador inmobiliario con IA": superficie conversacional de DESCUBRIMIENTO (pantalla completa).
// Dos modos: (1) ESCRIBE lo que buscas → filtra · (2) QUE ATLAX TE GUÍE → perfilador (4 obligatorios + extras).
// Usa el MISMO motor compartido que la burbuja: lib/atlaxSearch (parse + casi + fallback) + componentes compartidos
// AtlaxResults (tarjetas persuasivas + casi-cumple + otras colonias) y AtlaxQuickView (ficha en vista rápida con
// "¿es buena compra?"). El chat se conserva al ir a la ficha (sessionStorage). "Hablar con un Asesor" crea un LEAD
// REAL (AtlaxLeadModal → /api/buyer/registrar → asesor). Copy siempre accionable; cada búsqueda se registra granular.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { sendBuyerSignal, visitorId, claimVisitor } from '../../lib/buyerSignal';
import { searchAtlax, isCompareQuery } from '../../lib/atlaxSearch';
import { aiSearchParse } from '../../api/marketplace';   // #12: parsea zona+presupuesto (texto libre) del perfilador
import AtlaxBlocks from '../../components/landing/AtlaxBlocks';
import AtlaxResults from '../../components/landing/AtlaxResults';
import AtlaxQuickView from '../../components/landing/AtlaxQuickView';
import AtlaxLeadModal from '../../components/landing/AtlaxLeadModal';
import AtlaxMyList from '../../components/landing/AtlaxMyList';
import { getSavedIds } from '../../lib/atlaxPrefs';
import { LightScope } from '../../components/ui';
import { Sparkle, Heart } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL || '';
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';
const HEAD = "'Outfit',sans-serif";
const CHAT_KEY = 'atlax_chat_v2';

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

// #12 — respuestas del perfilador (botones estructurados + zona/presupuesto de texto) → PerfilIn del motor.
// Los botones se parsean determinista; zona+presupuesto (texto libre) llegan ya parseados (colonia, max_price).
const _int = (s) => { const m = String(s || '').match(/\d+/); return m ? parseInt(m[0], 10) : null; };
const _m2Range = (label) => {
  const s = String(label || '');
  if (/hasta 60/i.test(s)) return { m2_min: null, m2_max: 60 };
  if (/60.?90/i.test(s)) return { m2_min: 60, m2_max: 90 };
  if (/90.?120/i.test(s)) return { m2_min: 90, m2_max: 120 };
  if (/m[aá]s de 120/i.test(s)) return { m2_min: 120, m2_max: null };
  return { m2_min: null, m2_max: null };
};
function answersToPerfil(answers, filters, limit = 12) {
  const f = filters || {};
  const cols = Array.isArray(f.colonia) ? f.colonia : (f.colonia ? [f.colonia] : []);
  const { m2_min, m2_max } = _m2Range(answers.m2);
  return {
    presupuesto_max: f.max_price || null,
    recamaras_min: _int(answers.recamaras) || f.beds || null,
    banos_min: _int(answers.banos) || f.baths || null,
    estacionamientos_min: _int(answers.estacionamientos) || null,
    m2_min, m2_max,
    colonias: cols,
    uso: f.buyer_intent || f.intent || null,
    must_haves: Array.isArray(answers.amenidades) ? answers.amenidades.map((a) => String(a).toLowerCase()) : [],
    limit,
  };
}

function renderRich(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>));
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

export default function AtlaxSurface() {
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [prof, setProf] = useState(null);
  const [quick, setQuick] = useState(null);
  const [lead, setLead] = useState(null);
  const [showList, setShowList] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const endRef = useRef(null);
  const askedRef = useRef(false);
  const [toast, setToast] = useState('');
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const lastUserQ = () => { const u = [...messages].reverse().find((m) => m.role === 'user'); return u ? u.text : ''; };
  const lastFilters = () => { const m = [...messages].reverse().find((x) => x.kind === 'results' && x.r && x.r.filters); return (m && m.r.filters) || {}; };
  const lastResultCount = () => { const m = [...messages].reverse().find((x) => x.kind === 'results' && x.r); return m ? ((m.r.exact || []).length + (m.r.casi || []).length) : 0; };
  // Guardar = ARMAR ALERTA: registra la búsqueda con alert:true → casamentera avisa cuando entre inventario que cuadre.
  const saveSearch = () => {
    const f = lastFilters(); const cols = Array.isArray(f.colonia) ? f.colonia : (f.colonia ? [f.colonia] : []);
    try { fetch(`${API}/api/perfil/registrar-busqueda`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: visitorId(), alert: true, colonias: cols, presupuesto_max: f.max_price, recamaras_min: f.beds, found_count: lastResultCount() }) }).catch(() => {}); } catch (_) { /* noop */ }
    try { sendBuyerSignal('atlax_query', { value: lastUserQ().slice(0, 120), meta: { saved: true, alert: true } }); } catch (_) { /* noop */ }
    flash('Guardada ✓ Te aviso cuando entre algo que te cuadre.');
  };
  const wantAdvisor = (dev) => { setQuick(null); setLead({ dev: dev || null, query: lastUserQ() }); };

  const runSearch = useCallback(async (text) => {
    const q = String(text || '').trim();
    if (!q || busy) return;
    setBusy(true); setProf(null);
    const aid = `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const compare = isCompareQuery(q);
    setMessages((prev) => [...prev, { id: `u_${aid}`, role: 'user', text: q }, { id: aid, role: 'atlax', kind: compare ? 'compare' : 'results', intro: '', r: { pending: true }, blocks: [], pending: true }]);
    const patch = (p) => setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, ...p } : m)));

    if (compare) {
      try {
        const res = await fetch(`${API}/api/atlax/blocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
        const d = await res.json();
        patch({ blocks: (d && d.blocks) || [], intro: 'Aquí va la comparativa por colonia:', pending: false });
      } catch (_) { patch({ intro: 'No pude armar la comparativa ahora — intenta de nuevo.', pending: false }); }
      try { sendBuyerSignal('atlax_query', { value: q.slice(0, 120), meta: { kind: 'compare' } }); } catch (_) { /* noop */ }
      setBusy(false); return;
    }

    const r = await searchAtlax(q);
    patch({ intro: r.intro, r, pending: false });
    setBusy(false);
  }, [busy]);

  // #12 — Perfilador → MOTOR ESTRUCTURADO /api/perfil/recomendar (zona sagrada + nota honesta + zonas cercanas),
  // no el query de texto (que trata la zona como match parcial y cuela colonias equivocadas). Fallback al texto.
  const runProfilerSearch = useCallback(async (answers) => {
    if (busy) return undefined;
    setBusy(true); setProf(null);
    const aid = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [...prev, { id: aid, role: 'atlax', kind: 'results', intro: '', r: { pending: true }, pending: true }]);
    const drop = () => setMessages((prev) => prev.filter((m) => m.id !== aid));
    const patch = (p) => setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, ...p } : m)));
    try {
      const parsed = await aiSearchParse(`${answers.zona || ''} ${answers.presupuesto || ''}`.trim());
      // Zona fuera de cobertura (fuera de CDMX): el motor estructurado no la maneja → ruta de texto, que SÍ pinta
      // "Todavía no cubrimos X" + lo más cercano (paridad con el buscador libre · no perder ese caso con #12).
      if (parsed && parsed.zona_no_disponible) { drop(); setBusy(false); return runSearch(assembleQuery(answers)); }
      const perfil = answersToPerfil(answers, (parsed && parsed.filters) || {});
      const res = await fetch(`${API}/api/perfil/recomendar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(perfil) });
      const data = await res.json();
      const resultados = (data && data.resultados) || [];
      if (!resultados.length) { drop(); setBusy(false); return runSearch(assembleQuery(answers)); }
      const exact = resultados.filter((x) => !x.ampliado && !x.sobre_presupuesto);
      const casi = resultados.filter((x) => x.ampliado || x.sobre_presupuesto);
      const zonaTxt = perfil.colonias[0] ? ` en ${perfil.colonias[0]}` : '';
      const intro = data.nota || (exact.length ? `Con tu perfil, ${exact.length === 1 ? 'esta opción encaja' : `estas ${exact.length} opciones encajan`}${zonaTxt}:` : `Esto es lo más cercano a tu perfil${zonaTxt}:`);
      // r.filters para que "Guardar Búsqueda" (armar alerta) registre con los datos reales del perfil.
      const filters = { colonia: perfil.colonias, max_price: perfil.presupuesto_max, beds: perfil.recamaras_min };
      patch({ intro, pending: false, zonasCercanas: data.zonas_cercanas || [], r: { exact, casi, crossZone: [], zonaNoDisp: null, filters, pending: false, hasResults: true } });
      // Demanda: registra la búsqueda estructurada (cierra el ciclo → Grafo del Comprador + unmet demand).
      try { fetch(`${API}/api/perfil/registrar-busqueda`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...perfil, visitor_id: visitorId(), found_count: resultados.length }) }).catch(() => {}); } catch (_) { /* noop */ }
      try { sendBuyerSignal('atlax_query', { value: assembleQuery(answers).slice(0, 120), colonia: (perfil.colonias[0] || undefined), meta: { source: 'perfilador', n_exact: exact.length, n_casi: casi.length } }); } catch (_) { /* noop */ }
    } catch (_) {
      drop(); setBusy(false); return runSearch(assembleQuery(answers));
    }
    setBusy(false);
    return undefined;
  }, [busy, runSearch]);

  // ── Perfilador ────────────────────────────────────────────────────────────
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
      runProfilerSearch(answers);   // #12: motor estructurado (zona sagrada), no el query de texto
    } else { setProf((p) => ({ step: p.step + 1, answers, picked: [], text: '' })); }
  };
  const togglePick = (val) => setProf((p) => ({ ...p, picked: p.picked.includes(val) ? p.picked.filter((x) => x !== val) : [...p.picked, val] }));

  // ── Persistencia del chat + ?q= ───────────────────────────────────────────
  useEffect(() => {
    if (askedRef.current) return; askedRef.current = true;
    claimVisitor();   // U1: si está logueado, pega su visitor_id a su cuenta (cross-device)
    try { const saved = sessionStorage.getItem(CHAT_KEY); if (saved) { const m = JSON.parse(saved); if (Array.isArray(m) && m.length) setMessages(m); } } catch (_) { /* noop */ }
    const q = params.get('q');
    if (q) { runSearch(q); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-12))); } catch (_) { /* noop */ } }, [messages]);
  useEffect(() => { const u = () => setSavedCount(getSavedIds().length); u(); window.addEventListener('dmx:prefs', u); return () => window.removeEventListener('dmx:prefs', u); }, []);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {messages.length > 0 && <button onClick={newChat} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600 }}>Nueva Búsqueda</button>}
          {savedCount > 0 && <button onClick={() => setShowList(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--card-border)', background: '#fff', cursor: 'pointer', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: '5px 12px' }}><Heart size={14} filled color="#DB2777" /> Mi Lista ({savedCount})</button>}
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
                    {m.kind === 'results' && m.r && !m.r.pending && <AtlaxResults r={m.r} onQuick={(dev, list) => setQuick({ list: list || [dev], index: Math.max(0, (list || [dev]).findIndex((d) => d.id === dev.id)) })} onRefine={(suf) => runSearch(`${lastUserQ()} ${suf}`)} onAdvisor={() => wantAdvisor()} />}
                    {/* #12: zonas ALEDAÑAS con inventario que encaja (el motor las devuelve cuando tu zona es delgada). El cliente decide. */}
                    {m.kind === 'results' && Array.isArray(m.zonasCercanas) && m.zonasCercanas.length > 0 && (
                      <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(var(--theme-rgb),0.05)', border: '1px solid rgba(var(--theme-rgb),0.18)', borderRadius: 14 }}>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', fontWeight: 700, marginBottom: 8 }}>Cerca de tu zona, con opciones que encajan:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {m.zonasCercanas.map((z) => (
                            <button key={z.colonia} onClick={() => runSearch(`Departamento en ${z.colonia}`)} style={chip}>{z.colonia}{z.n > 1 ? ` · ${z.n}` : ''} →</button>
                          ))}
                        </div>
                      </div>
                    )}
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

      {quick && <AtlaxQuickView list={quick.list} start={quick.index} onClose={() => setQuick(null)} onAdvisor={wantAdvisor} />}
      {lead && <AtlaxLeadModal ctx={lead} onClose={() => setLead(null)} />}
      {showList && <AtlaxMyList onClose={() => setShowList(false)} onAdvisor={() => { setShowList(false); wantAdvisor(); }} />}
    </LightScope>
  );
}

const chip = { background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const chipOn = { ...chip, background: 'var(--theme)', border: '1px solid var(--theme)', color: '#fff' };
const cta = { background: '#fff', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ctaPrimary = { ...cta, background: GRAD, border: 'none', color: '#fff', fontWeight: 700 };
