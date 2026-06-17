// AtlaxBubble — Public marketplace chat bubble powered by /api/atlax/query (RAG).
// W4.4E.5.2 — renamed from CayaBubble. localStorage migration silenciosa caya.*→atlax.*.
// W4.11a — adds: mode="home" (homepage hero), threads sidebar, 6 macro chips, thread_id support.
// Anonymous session_id persisted in localStorage. No auth required.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkle, X, ArrowRight, MessageSquare, AlertTriangle, Clock } from '../icons';
import AtlaxThreadsSidebar from './AtlaxThreadsSidebar';
import AtlaxVoiceButton from './AtlaxVoiceButton';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;
const SS_KEY = 'dmx.atlax.session_id';
const SS_HISTORY = 'dmx.atlax.history.v1';
const SS_TOKEN = 'dmx.atlax.asistente_token';
const SS_THREAD = 'dmx.atlax.active_thread_id';

// Legacy keys (W4.4E.5.2 migration)
const LEGACY_SS_KEY = 'dmx.caya.session_id';
const LEGACY_SS_HISTORY = 'dmx.caya.history.v1';
const LEGACY_SS_TOKEN = 'dmx.caya.asistente_token';

// One-time silent migration caya.*→atlax.* per browser
function migrateLegacyLocalStorage() {
  try {
    const map = [
      [LEGACY_SS_KEY, SS_KEY],
      [LEGACY_SS_HISTORY, SS_HISTORY],
      [LEGACY_SS_TOKEN, SS_TOKEN],
    ];
    map.forEach(([oldK, newK]) => {
      const oldVal = localStorage.getItem(oldK);
      if (oldVal && !localStorage.getItem(newK)) {
        localStorage.setItem(newK, oldVal);
      }
      if (oldVal !== null) localStorage.removeItem(oldK);
    });
    // Migrate per-token lead_captured flags
    const keys = Object.keys(localStorage);
    keys.forEach(k => {
      if (k.startsWith('dmx.caya.lead_captured.')) {
        const newKey = k.replace('dmx.caya.lead_captured.', 'dmx.atlax.lead_captured.');
        if (!localStorage.getItem(newKey)) localStorage.setItem(newKey, localStorage.getItem(k));
        localStorage.removeItem(k);
      }
    });
  } catch (_) { /* ignore */ }
}

function getSession() {
  try {
    let sid = localStorage.getItem(SS_KEY);
    if (!sid) {
      sid = `atlax_anon_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      localStorage.setItem(SS_KEY, sid);
    }
    return sid;
  } catch { return null; }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(SS_HISTORY) || '[]'); }
  catch { return []; }
}

function saveHistory(h) {
  try { localStorage.setItem(SS_HISTORY, JSON.stringify(h.slice(-30))); }
  catch { /* quota */ }
}


// ─── LeadCaptureMiniForm (W4.4E.5.1) ─────────────────────────────────────
function LeadCaptureMiniForm({ asistenteToken, onSuccess, onClose, light = false }) {
  const [nombre, setNombre] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const validNombre = nombre.trim().length >= 2;
  // Acepta 10 dígitos mexicanos (con o sin prefix +52, espacios, guiones)
  const wsClean = whatsapp.replace(/[^0-9]/g, '');
  const validWs = /^(?:52)?\d{10}$/.test(wsClean);
  const valid = validNombre && validWs && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!valid) return;
    setError(null);
    setSubmitting(true);
    try {
      const { captureLeadFromAtlax } = await import('../../api/atlaxApi');
      await captureLeadFromAtlax(asistenteToken, {
        nombre: nombre.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim() || null,
      });
      setSuccess(true);
      try { localStorage.setItem(`dmx.atlax.lead_captured.${asistenteToken}`, 'true'); } catch (_) {/*ignore*/}
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'No pudimos guardar tus datos.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div data-testid="caya-lead-success" style={{
        padding: 12, borderRadius: 12, marginTop: 8,
        background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.32)',
        backdropFilter: 'blur(24px)', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#86efac', flex: 1, lineHeight: 1.5 }}>
          Te contactaremos pronto · Usaremos WhatsApp.
        </div>
        <button onClick={onClose} style={{
          padding: '4px 10px', borderRadius: 9999, background: 'transparent',
          border: '1px solid rgba(74,222,128,0.32)', color: '#86efac',
          fontFamily: 'DM Sans', fontSize: 10, cursor: 'pointer',
        }}>OK</button>
      </div>
    );
  }

  return (
    <form data-testid="caya-lead-form" onSubmit={handleSubmit} style={{
      padding: 12, borderRadius: 12, marginTop: 8,
      background: light ? 'rgba(248,249,248,0.95)' : 'rgba(13,16,23,0.85)',
      border: '1px solid rgba(var(--theme-rgb),0.32)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)',
          letterSpacing: '-0.01em',
        }}>
          ¿Te conectamos con un asesor?
        </div>
        <button
          type="button"
          data-testid="caya-lead-dismiss"
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            padding: 4, background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 9999, color: 'var(--cream-3)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><X size={11} /></button>
      </div>
      <input
        data-testid="caya-lead-nombre"
        value={nombre} onChange={e => setNombre(e.target.value)}
        placeholder="Nombre"
        style={miniInput()}
      />
      <input
        data-testid="caya-lead-whatsapp"
        value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
        placeholder="WhatsApp (+52 ...)"
        style={miniInput()}
      />
      <input
        data-testid="caya-lead-email"
        value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Email (opcional)"
        style={miniInput()}
      />
      {error && (
        <div data-testid="caya-lead-error" style={{
          fontFamily: 'DM Sans', fontSize: 10, color: '#fca5a5',
          padding: '4px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.10)',
          border: '1px solid rgba(239,68,68,0.30)',
        }}>{error}</div>
      )}
      <button
        type="submit"
        data-testid="caya-lead-submit"
        disabled={!valid}
        style={{
          marginTop: 2, padding: '7px 12px', borderRadius: 9999,
          background: valid ? 'var(--grad)' : 'rgba(255,255,255,0.08)',
          color: '#fff', border: 'none', cursor: valid ? 'pointer' : 'not-allowed',
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
          opacity: valid ? 1 : 0.6,
        }}
      >
        {submitting ? 'Enviando…' : 'Conectarme'}
      </button>
    </form>
  );
}

function miniInput() {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '7px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 11.5,
    outline: 'none',
  };
}


function MemoryHitsBlock({ hits }) {  const [open, setOpen] = useState(false);
  if (!hits || hits.length === 0) return null;
  return (
    <div data-testid="caya-memory-hits" style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: '3px 8px', borderRadius: 9999,
        background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.25)',
        color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
        cursor: 'pointer',
      }}>
        {open ? '▼' : '▶'} Memorias usadas ({hits.length})
      </button>
      {open && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {hits.map((h, i) => (
            <div key={i} style={{
              padding: '4px 8px', borderRadius: 8,
              background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.06)',
              fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)',
            }}>
              <span style={{ color: 'var(--theme)', fontWeight: 700 }}>{h.source_type}</span>
              {' · '}
              <span>{(h.summary || h.content_summary || '').slice(0, 80)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function CitationPill({ cite, onNav }) {  const handle = () => {
    if (!cite?.chunk_id) return;
    // dev::altavista-polanco::card → /desarrollo/altavista-polanco
    // col::roma-norte::card → /barrios/roma-norte (or /inteligencia)
    if (cite.chunk_id.startsWith('dev::')) {
      const slug = cite.chunk_id.split('::')[1];
      onNav(`/desarrollo/${slug}`);
    } else if (cite.chunk_id.startsWith('col::')) {
      onNav(`/barrios`);
    }
  };
  return (
    <button onClick={handle} data-testid={`caya-cite-${cite.chunk_id || 'na'}`} style={{
      padding: '3px 9px', borderRadius: 9999,
      background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.32)',
      color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
      cursor: cite?.chunk_id ? 'pointer' : 'default', margin: '2px 4px 2px 0',
    }}>
      {cite.label || cite.chunk_id} <span style={{ opacity: 0.6, fontFamily: 'DM Mono' }}>· {cite.source_type}</span>
    </button>
  );
}


// W4.11a · 6 macro market chips (home mode) — emojis EXCEPCIÓN APROBADA por spec
const HOME_MACRO_CHIPS = [
  { emoji: '📊', label: 'Visión general CDMX', prompt: 'Dame una visión general del mercado inmobiliario en CDMX.' },
  { emoji: '📈', label: 'Zonas con mayor crecimiento', prompt: '¿Qué zonas tienen el mayor crecimiento de precio en los últimos 24 meses?' },
  { emoji: '🏘️', label: 'Recomendar colonia', prompt: 'Recomiéndame una colonia para vivir en CDMX según mi presupuesto.' },
  { emoji: '💰', label: 'Tendencias de precios', prompt: 'Muéstrame las tendencias de precios por alcaldía en CDMX.' },
  { emoji: '🗺️', label: 'Comparar alcaldías', prompt: 'Compara precios y plusvalía entre alcaldías de CDMX.' },
  { emoji: '🏗️', label: 'Desarrollos en preventa', prompt: '¿Qué desarrollos en preventa hay disponibles en CDMX?' },
];

// Opciones que se ADAPTAN a lo que el cliente fue escribiendo (asesor digital, no chatbot fijo).
// Lee la última señal (intención + palabras de la conversación) y propone los siguientes pasos lógicos.
// `human:true` = único camino a dejar datos (bajo demanda, jamás automático).
function nextOptions(messages) {
  const lastA = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastU = [...messages].reverse().find((m) => m.role === 'user');
  const intent = lastA && lastA.intent_detected;
  const txt = `${(lastU && lastU.content) || ''} ${(lastA && lastA.content) || ''}`.toLowerCase();
  const has = (re) => re.test(txt);
  if (intent === 'cita' || has(/agenda|visita|conocer el|ver el dep|me interesa este/))
    return [{ l: '📅 Quiero agendar una visita', human: true }, { l: 'Ver opciones similares', p: 'Muéstrame más opciones parecidas a esta' }, { l: 'Hablar con un asesor', human: true }];
  if (intent === 'presupuesto' || has(/presupuesto|crédito|credito|enganche|cuánto pago|mensualidad|infonavit/))
    return [{ l: '💰 Opciones para mi presupuesto', p: '¿Qué opciones de vivienda nueva hay para mi presupuesto y cómo va el crédito?' }, { l: 'Comparar precios', p: 'Compara precios por m² entre estas colonias' }];
  if (has(/polanco|condesa|roma|del valle|coyoac|juárez|juarez|nápoles|napoles|santa fe|narvarte/))
    return [{ l: 'Ver desarrollos aquí', p: 'Muéstrame los desarrollos disponibles en esa colonia' }, { l: '¿Qué tan segura es?', p: '¿Qué tan segura es esa colonia y cómo se vive ahí?' }, { l: 'Precio por m²', p: '¿Cuánto cuesta el m² en esa colonia?' }];
  if (has(/invertir|inversión|inversion|plusval|rentar|renta/))
    return [{ l: 'Zonas que más suben', p: '¿Qué colonias tienen mayor plusvalía hoy?' }, { l: 'Dónde se renta mejor', p: '¿En qué zonas se renta más rápido y con mejor retorno?' }, { l: 'Comparar 2 colonias', p: 'Compara dos colonias para invertir' }];
  if (has(/vivir|familia|hijos|escuela|tranquil|segur/))
    return [{ l: 'Colonias familiares', p: '¿Qué colonias son buenas para vivir en familia?' }, { l: 'Con buenas escuelas', p: '¿Dónde hay buenas escuelas cerca?' }, { l: 'Ver opciones', p: 'Muéstrame opciones de vivienda nueva para vivir' }];
  // Aún sin señal clara → calificar (vivir/invertir/presupuesto)
  return [{ l: '🏡 Para vivir', p: 'Busco para vivir en CDMX. ¿Qué colonias me convienen?' }, { l: '📈 Para invertir', p: 'Busco invertir. ¿Qué zonas convienen?' }, { l: '💰 Según mi presupuesto', p: 'Tengo un presupuesto. ¿Qué opciones hay?' }];
}

export default function AtlaxBubble({ mode = 'floating', startOpen = false, theme = 'dark' } = {}) {
  const light = theme === 'light';
  // Tokens locales en claro: vuelve tinta el texto/bordes de todo el panel (rediseño /v2).
  const lightVars = light ? { '--cream': '#1E2230', '--cream-2': '#4A4F5E', '--cream-3': '#8A8F9E', '--border': '#ECECEC' } : {};
  // W4.4E.5.2 · One-time silent localStorage migration caya.*→atlax.* (synchronous, BEFORE state init)
  const [_migrated] = useState(() => { migrateLegacyLocalStorage(); return true; });

  const navigate = useNavigate();
  const isHome = mode === 'home';
  const [open, setOpen] = useState(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      // Acepta ?atlax=open (nuevo) Y ?caya=open (legacy fallback)
      if (sp.get('atlax') === 'open' || sp.get('caya') === 'open') return true;
      // En modo home siempre abierto (renderizado inline por el parent)
      if (mode === 'home') return true;
      return !!startOpen;
    } catch { return mode === 'home' || !!startOpen; }
  });
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => loadHistory());
  const [sessionId, setSessionId] = useState(() => getSession());
  const [asistenteToken, setAsistenteToken] = useState(() => {
    try { return localStorage.getItem(SS_TOKEN) || null; } catch { return null; }
  });
  const [threadId, setThreadId] = useState(() => {
    try { return localStorage.getItem(SS_THREAD) || null; } catch { return null; }
  });
  const [showThreads, setShowThreads] = useState(false);
  const [tier, setTier] = useState(null);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [formDismissed, setFormDismissed] = useState(false);
  const scrollRef = useRef(null);

  // Check localStorage flag once asistenteToken is known
  useEffect(() => {
    if (!asistenteToken) return;
    try {
      if (localStorage.getItem(`dmx.atlax.lead_captured.${asistenteToken}`) === 'true') {
        setLeadCaptured(true);
      }
    } catch (_) { /* ignore */ }
  }, [asistenteToken]);

  // El formulario de datos YA NO se abre solo. Un asesor digital NO pide datos de entrada — primero
  // entiende, recomienda, y solo cuando el cliente lo pide (toca "Hablar con un asesor") aparece.
  // (Antes saltaba con cualquier hand_off — incluido el estado degradado phase_y_disabled.)

  useEffect(() => { saveHistory(messages); }, [messages]);
  // Permite abrir Atlax desde cualquier parte (ej. el hero del home) y opcionalmente sembrar una
  // pregunta: window.dispatchEvent(new CustomEvent('atlax:open', { detail: { query } })).
  useEffect(() => {
    const onOpen = (e) => { setOpen(true); const q = e && e.detail && e.detail.query; if (q) setInput(q); };
    window.addEventListener('atlax:open', onOpen);
    return () => window.removeEventListener('atlax:open', onOpen);
  }, []);
  // Upgrade #1 (cierre de ciclo): al abrir, Atlax AVISA si cambió algo en las colonias que vigilas.
  useEffect(() => {
    if (!open) return;
    let w; try { w = localStorage.getItem('dmx.watcher_id'); } catch { w = null; }
    if (!w) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/colonia-watch?watcher=${w}`)
      .then((r) => r.json())
      .then((d) => {
        const al = (d && d.alerts) || [];
        if (!al.length) return;
        setMessages((prev) => prev.some((m) => m._watch) ? prev : [{
          role: 'assistant', _watch: true,
          content: '📈 Novedades en lo que vigilas: ' + al.map((a) => `${a.name} ${a.change_pct > 0 ? '+' : ''}${a.change_pct}% en valor/m²`).join(' · ') + '. ¿Quieres ver los desarrollos?',
        }, ...prev]);
      }).catch(() => {});
  }, [open]);
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  const send = async (e, overrideQuery) => {
    e?.preventDefault?.();
    const q = (overrideQuery ?? input).trim();
    if (!q || busy) return;
    setBusy(true);
    if (!overrideQuery) setInput('');
    const userMsg = { role: 'user', content: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const r = await fetch(`${API}/api/atlax/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          session_id: sessionId,
          channel: 'web_bubble',
          thread_id: threadId || null,
        }),
      });
      const d = await r.json();
      // Persist asistente_session_token for /asistente expand link
      if (d.asistente_session_token) {
        setAsistenteToken(d.asistente_session_token);
        try { localStorage.setItem(SS_TOKEN, d.asistente_session_token); } catch (_) { /* ignore */ }
      }
      // Sync session_id with backend (may have generated new dmx_caya_* if we sent null)
      if (d.session_id && d.session_id !== sessionId) {
        setSessionId(d.session_id);
        try { localStorage.setItem(SS_KEY, d.session_id); } catch (_) { /* ignore */ }
      }
      // W4.11a · sync thread_id (backend may auto-create one)
      if (d.thread_id && d.thread_id !== threadId) {
        setThreadId(d.thread_id);
        try { localStorage.setItem(SS_THREAD, d.thread_id); } catch (_) { /* ignore */ }
      }
      if (d.tier) setTier(d.tier);
      const assistantMsg = {
        role: 'assistant',
        content: d.answer || 'Sin respuesta.',
        citations: d.citations || [],
        top_results: d.top_results || [],
        hand_off: d.hand_off_recommended,
        hand_off_reason: d.hand_off_reason,
        memory_hits: d.memory_hits || [],
        tool_calls: d.tool_calls || [],
        suggested_capture: d.intent_detected === 'cita' || d.intent_detected === 'presupuesto',
        simulated: d.simulated,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'No pude conectarme. Intenta de nuevo.',
        error: true,
        ts: Date.now(),
      }]);
    }
    setBusy(false);
  };

  // Trigger del LOOP DEL COMPRADOR (Cerebro find_home) — la pieza de UI que faltaba para que el loop,
  // ya construido (busca→veta con AVM/riesgo→simula finanzas→shortlist→pide visita), sea usable.
  // Gated: requiere login + CEREBRO_ENABLED; si no, guía con gracia (no rompe).
  const runFindHome = async () => {
    if (busy) return;
    setMessages(prev => [...prev, { role: 'user', content: '🏠 Encuéntrame mi casa (búsqueda guiada con IA)', ts: Date.now() }]);
    setBusy(true);
    try {
      const tok = (() => { try { return localStorage.getItem('dmx_token'); } catch { return null; } })();
      const r = await fetch(`${API}/api/cerebro/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ goal_id: 'find_home' }),
      });
      if (r.status === 401) {
        setMessages(prev => [...prev, { role: 'assistant', ts: Date.now(), content: 'Tu **búsqueda guiada con IA** trabaja por ti (encuentra, evalúa precio justo y riesgo, simula tu crédito y te arma una lista). Para activarla inicia sesión. Mientras, dime qué buscas y te ayudo aquí mismo. 🙂' }]);
      } else if (r.status === 503) {
        setMessages(prev => [...prev, { role: 'assistant', ts: Date.now(), content: 'La **búsqueda guiada con IA** se está activando. Por ahora dime zona, presupuesto y recámaras y te doy opciones al instante.' }]);
      } else {
        const d = await r.json();
        const summary = d.summary || (Array.isArray(d.shortlist) ? `Te armé ${d.shortlist.length} opciones que encajan contigo.` : 'Listo, revisé el mercado por ti — aquí va tu siguiente paso.');
        setMessages(prev => [...prev, { role: 'assistant', ts: Date.now(), content: summary, _cerebro: d }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', ts: Date.now(), content: 'No pude correr la búsqueda guiada ahora. Dime qué buscas (zona, presupuesto, recámaras) y te ayudo aquí.' }]);
    }
    setBusy(false);
  };

  // #3 "Búsqueda viva / Para ti" — recomienda desde tu comportamiento (lo que vigilas) o tendencia.
  const runParaTi = async () => {
    if (busy) return;
    setMessages(prev => [...prev, { role: 'user', content: '✨ Recomiéndame algo para mí', ts: Date.now() }]);
    setBusy(true);
    try {
      let w = null; try { w = localStorage.getItem('dmx.watcher_id'); } catch {}
      const r = await fetch(`${API}/api/para-ti${w ? `?watcher=${w}` : ''}`);
      const d = await r.json();
      const list = (d.para_ti || []).map(c => `• ${c.name} (${c.alcaldia})${c.valor_m2 ? ` — $${c.valor_m2.toLocaleString('es-MX')}/m² suelo` : ''}`).join('\n');
      const lead = d.basis === 'personalizado'
        ? 'Por lo que has estado viendo y vigilando, creo que te van a gustar:'
        : 'Lo que está más caliente ahora mismo en CDMX:';
      setMessages(prev => [...prev, { role: 'assistant', ts: Date.now(), content: `${lead}\n${list}\n\n¿Te abro los desarrollos de alguna?` }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', ts: Date.now(), content: 'No pude traer tus recomendaciones ahora. Dime qué buscas y te ayudo aquí.' }]);
    }
    setBusy(false);
  };

  const clearHistory = () => {
    setMessages([]);
    saveHistory([]);
  };

  // W4.11a · selecciona thread existente y carga sus mensajes desde backend
  const selectThread = async (newThreadId) => {
    if (!newThreadId || newThreadId === threadId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/atlax/threads/${newThreadId}/messages`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const loaded = (d.messages || []).map(m => ({
        role: m.role,
        content: m.content || '',
        citations: m.citations || [],
        hand_off: m.hand_off_recommended,
        simulated: m.simulated,
        tool_calls: m.tool_calls || [],
        ts: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
      }));
      setMessages(loaded);
      setThreadId(newThreadId);
      try { localStorage.setItem(SS_THREAD, newThreadId); } catch (_) { /* ignore */ }
    } catch (err) {
      // silent fail
    } finally {
      setBusy(false);
    }
  };

  // W4.11a · inicia nuevo thread (limpia mensajes UI y deja que el backend cree thread_id)
  const startNewThread = () => {
    setThreadId(null);
    try { localStorage.removeItem(SS_THREAD); } catch (_) { /* ignore */ }
    setMessages([]);
    saveHistory([]);
    setShowLeadForm(false);
    setFormDismissed(false);
  };

  return (
    <>
      {/* Bubble trigger — hidden in home mode (rendered inline by parent) */}
      {!open && !isHome && (
        <button
          data-testid="caya-bubble"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: Z.MODAL_CRITICAL,
            width: 60, height: 60, borderRadius: 9999,
            background: 'var(--grad)', border: 'none', cursor: 'pointer',
            boxShadow: '0 12px 32px rgba(var(--theme-rgb),0.34)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          aria-label="Abrir chat Atlax"
        >
          <Sparkle size={22} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div data-testid={isHome ? "atlax-home-panel" : "caya-panel"} style={{
          position: isHome ? 'relative' : 'fixed',
          bottom: isHome ? 'auto' : 24,
          right: isHome ? 'auto' : 24,
          zIndex: isHome ? 'auto' : 9999,
          width: isHome ? '100%' : 'min(380px, calc(100vw - 24px))',
          height: isHome ? 'min(560px, 70vh)' : 'min(540px, calc(100vh - 48px))',
          ...lightVars,
          background: light ? '#FFFFFF' : 'linear-gradient(180deg, #0E1220, #0A0D16)',
          border: '1px solid var(--border)', borderRadius: 18,
          boxShadow: light ? '0 24px 60px rgba(16,24,40,0.18)' : (isHome ? '0 16px 40px rgba(0,0,0,0.45)' : '0 24px 60px rgba(0,0,0,0.6)'),
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'caya-pop 0.22s ease-out',
        }}>
          {/* W4.11a · Threads sidebar overlay */}
          {showThreads && (
            <AtlaxThreadsSidebar
              light={light}
              asistenteToken={asistenteToken}
              activeThreadId={threadId}
              onSelect={selectThread}
              onNewThread={startNewThread}
              onClose={() => setShowThreads(false)}
            />
          )}
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            background: 'linear-gradient(92deg, rgba(var(--theme-rgb),0.10), rgba(168,85,247,0.10))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9999, background: 'var(--grad)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                boxShadow: '0 4px 14px rgba(var(--theme-rgb),0.4)',
              }}>
                <Sparkle size={15} />
              </div>
              <div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', letterSpacing: '-0.01em' }}>
                  Atlax
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  DesarrollosMX · Beta
                </div>
              </div>
              {tier && (
                <span data-testid="caya-tier-badge" style={{
                  marginLeft: 4, padding: '2px 8px', borderRadius: 9999,
                  fontFamily: 'DM Sans', fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                  background: 'var(--grad)', color: '#fff',
                }}>{tier}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button data-testid="atlax-threads-toggle"
                onClick={() => setShowThreads(s => !s)}
                aria-label="Historial de conversaciones"
                title="Historial"
                style={{
                  padding: 6, background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 9999, color: 'var(--cream-3)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Clock size={11} /></button>
              {!isHome && (
                <button data-testid="caya-close" onClick={() => setOpen(false)} style={{
                  padding: 6, background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 9999, color: 'var(--cream-3)', cursor: 'pointer',
                }}><X size={12} /></button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} data-testid="caya-messages" style={{
            flex: 1, overflowY: 'auto', padding: '14px 14px 8px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{
                padding: 20, textAlign: 'center', color: 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 12.5, lineHeight: 1.55,
              }}>
                <Sparkle size={22} color="var(--theme)" />
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '10px 0 4px' }}>
                  Hola, soy Atlax 👋
                </div>
                {isHome
                  ? 'Explora el mercado de CDMX con datos en tiempo real.'
                  : 'Tu asesor para encontrar tu hogar —o invertir bien— en la Ciudad de México. Te voy guiando.'}

                {isHome ? (
                  <div data-testid="atlax-home-chips" style={{
                    marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
                  }}>
                    {HOME_MACRO_CHIPS.map((chip, i) => (
                      <button
                        key={i}
                        data-testid={`atlax-macro-chip-${i}`}
                        onClick={() => send(null, chip.prompt)}
                        disabled={busy}
                        style={{
                          padding: '9px 10px', borderRadius: 9999, fontSize: 10.5,
                          background: 'rgba(var(--theme-rgb),0.10)',
                          border: '1px solid rgba(var(--theme-rgb),0.28)',
                          color: 'var(--cream-2)', fontFamily: 'DM Sans', cursor: busy ? 'not-allowed' : 'pointer',
                          textAlign: 'left', lineHeight: 1.3, fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 6,
                          transition: 'background 0.15s ease, border-color 0.15s ease',
                          opacity: busy ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.18)'; }}
                        onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.10)'; }}
                      >
                        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>{chip.emoji}</span>
                        <span>{chip.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
                    {/* Búsqueda guiada con IA (loop del comprador · Cerebro find_home) — la jugada estrella */}
                    <button data-testid="atlax-find-home" onClick={runFindHome} disabled={busy} style={{
                      width: '100%', padding: '13px 14px', borderRadius: 14, cursor: busy ? 'not-allowed' : 'pointer',
                      background: 'var(--grad)', color: '#fff', border: 'none', opacity: busy ? 0.6 : 1,
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 9,
                      boxShadow: '0 8px 24px rgba(124,92,255,0.32)', textAlign: 'left',
                    }}>
                      <span style={{ fontSize: 19, lineHeight: 1 }}>🏠</span>
                      <span>Encuéntrame mi casa
                        <span style={{ display: 'block', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11, opacity: 0.92 }}>
                          La IA busca, evalúa precio justo y te arma tu lista
                        </span>
                      </span>
                    </button>
                    <button data-testid="atlax-para-ti" onClick={runParaTi} disabled={busy} style={{
                      width: '100%', padding: '10px 14px', borderRadius: 12, cursor: busy ? 'not-allowed' : 'pointer',
                      background: light ? 'rgba(var(--theme-rgb),0.06)' : 'rgba(var(--theme-rgb),0.10)',
                      border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--cream)', opacity: busy ? 0.6 : 1,
                      fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>✨</span> Recomiéndame algo para mí
                    </button>
                    {/* Opciones guiadas — primer paso del journey (no chatbot en blanco) */}
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 9 }}>¿Cómo te ayudo hoy?</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                        {[
                          { e: '🏡', l: 'Compro para vivir', p: 'Quiero comprar para vivir en CDMX. ¿Qué colonias me convienen según seguridad, servicios y precio?' },
                          { e: '📈', l: 'Para invertir', p: 'Busco invertir en CDMX. ¿Qué zonas tienen mejor plusvalía y se rentan rápido?' },
                          { e: '💰', l: 'Según mi presupuesto', p: 'Tengo un presupuesto definido para vivienda nueva. ¿Qué opciones hay y en qué colonias?' },
                          { e: '🔍', l: 'Solo explorando', p: 'Estoy explorando el mercado. Muéstrame lo más interesante de CDMX ahorita.' },
                        ].map((g, i) => (
                          <button key={i} data-testid={`atlax-guide-${i}`} onClick={() => send(null, g.p)} disabled={busy} style={{
                            padding: '11px 10px', borderRadius: 12, fontSize: 11.5, fontWeight: 600,
                            background: light ? 'rgba(var(--theme-rgb),0.06)' : 'rgba(var(--theme-rgb),0.10)',
                            border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--cream)',
                            fontFamily: 'DM Sans', cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 7, opacity: busy ? 0.5 : 1,
                          }}>
                            <span style={{ fontSize: 16, lineHeight: 1 }}>{g.e}</span>{g.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Sugerencias accionables (mandan, no solo rellenan) */}
                    <div>
                      <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginBottom: 8 }}>O pregúntame directo:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[
                          'Depa con terraza en Condesa',
                          '¿Cuánto vale el m² en Polanco?',
                          'Segura y que suba de precio',
                          'Entrega inmediata bajo $5M',
                        ].map((s, i) => (
                          <button key={i} data-testid={`caya-suggest-${i}`} onClick={() => send(null, s)} disabled={busy} style={{
                            padding: '7px 12px', borderRadius: 9999, fontSize: 11.5,
                            background: light ? 'rgba(16,24,40,0.05)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                            color: 'var(--cream-2)', fontFamily: 'DM Sans', cursor: busy ? 'not-allowed' : 'pointer',
                          }}>{s}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} data-testid={`caya-msg-${m.role}`} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
              }}>
                <div style={{
                  padding: '10px 13px', borderRadius: 14,
                  background: m.role === 'user'
                    ? 'rgba(var(--theme-rgb),0.20)'
                    : (m.error ? 'rgba(239,68,68,0.10)' : (light ? 'rgba(16,24,40,0.05)' : 'rgba(255,255,255,0.04)')),
                  border: `1px solid ${m.role === 'user' ? 'rgba(var(--theme-rgb),0.32)' : (m.error ? 'rgba(239,68,68,0.32)' : 'var(--border)')}`,
                  color: m.error ? '#fca5a5' : 'var(--cream)',
                  fontFamily: 'DM Sans', fontSize: 13, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>

                {m.role === 'assistant' && (m.citations || []).length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap' }}>
                    {m.citations.map((c, j) => (
                      <CitationPill key={j} cite={c} onNav={(p) => navigate(p)} />
                    ))}
                  </div>
                )}

                {/* W4.4E.5.2 Fix #3: handoff banner solo si form NO está activo
                    (form prioritario para captura, banner como fallback) */}
                {m.role === 'assistant' && m.hand_off && (leadCaptured || formDismissed) && (
                  <div data-testid="caya-handoff" style={{
                    marginTop: 8, padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)',
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                  }}>
                    <AlertTriangle size={13} color="#fcd34d" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 12, color: '#fcd34d', marginBottom: 2 }}>
                        Conecta con un asesor verificado
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', lineHeight: 1.45 }}>
                        {m.hand_off_reason || 'Para esta consulta, un asesor humano te ayudará mejor.'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <a href="https://wa.me/?text=Hola%2C%20vengo%20de%20DesarrollosMX%20y%20me%20gustar%C3%ADa%20agendar%20una%20llamada"
                           target="_blank" rel="noreferrer"
                           data-testid="caya-handoff-wa"
                           style={{
                             padding: '5px 10px', borderRadius: 9999,
                             background: 'rgba(34,197,94,0.16)', border: '1px solid rgba(34,197,94,0.32)',
                             color: '#86efac', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
                             textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                           }}>
                          <MessageSquare size={9} /> WhatsApp
                        </a>
                        <button onClick={() => navigate('/asesores')} data-testid="caya-handoff-asesor" style={{
                          padding: '5px 10px', borderRadius: 9999,
                          background: 'var(--grad)', border: 'none', color: '#fff',
                          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          Ver asesores <ArrowRight size={9} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {m.role === 'assistant' && (m.memory_hits || []).length > 0 && (
                  <MemoryHitsBlock hits={m.memory_hits} />
                )}
              </div>
            ))}

            {busy && (
              <div data-testid="caya-typing" style={{
                alignSelf: 'flex-start', padding: '10px 13px', borderRadius: 14,
                background: (light ? 'rgba(16,24,40,0.05)' : 'rgba(255,255,255,0.04)'), border: '1px solid var(--border)',
                color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12, fontStyle: 'italic',
              }}>
                Atlax está pensando<span className="caya-dots">…</span>
              </div>
            )}

            {/* Lead capture mini-form (W4.4E.5.1) */}
            {showLeadForm && asistenteToken && !leadCaptured && !formDismissed && (
              <LeadCaptureMiniForm
                light={light}
                asistenteToken={asistenteToken}
                onSuccess={() => setLeadCaptured(true)}
                onClose={() => { setShowLeadForm(false); setFormDismissed(true); }}
              />
            )}
          </div>

          {/* Expand to /asistente CTA */}
          {asistenteToken && (messages.length >= 5 || messages.some(m => m.role === 'assistant' && (m.hand_off || m.suggested_capture))) && (
            <div style={{ padding: '0 14px 8px' }}>
              <button
                data-testid="caya-expand-btn"
                onClick={() => { window.location.href = `/asistente?session_token=${asistenteToken}`; }}
                style={{
                  width: '100%', padding: '8px 14px', borderRadius: 9999,
                  background: 'var(--grad)', color: '#fff', border: 'none',
                  fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  letterSpacing: '0.02em',
                }}
              >
                Expandir conversación <ArrowRight size={11} />
              </button>
            </div>
          )}

          {/* Opciones ADAPTATIVAS — cambian según lo que el cliente escribió (asesor digital que guía).
              "Hablar con un asesor" es el ÚNICO camino al formulario, y solo si el cliente lo toca. */}
          {messages.length > 0 && !busy && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 12px 2px', WebkitOverflowScrolling: 'touch' }}>
              {nextOptions(messages).map((o, i) => (
                <button key={i} onClick={() => { if (o.human) { setShowLeadForm(true); setFormDismissed(false); } else { send(null, o.p); } }} style={{
                  flexShrink: 0, padding: '7px 13px', borderRadius: 9999, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                  background: o.human ? 'var(--grad)' : (light ? 'rgba(var(--theme-rgb),0.07)' : 'rgba(var(--theme-rgb),0.12)'),
                  border: o.human ? '1px solid transparent' : '1px solid rgba(var(--theme-rgb),0.25)',
                  color: o.human ? '#fff' : 'var(--theme)', cursor: 'pointer', fontFamily: 'DM Sans',
                }}>{o.l}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={send} style={{
            padding: 12, borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, alignItems: 'center',
            background: light ? '#FAFAFB' : '#0A0D16',
          }}>
            <AtlaxVoiceButton
              light={light}
              sessionToken={asistenteToken || sessionId}
              onTranscript={text => {
                setInput(text);
                // Auto-enviar transcript como mensaje
                setTimeout(() => {
                  const fakeEvent = { preventDefault: () => {} };
                  // usamos ref de input para disparar send
                }, 100);
              }}
              disabled={busy}
              compact={true}
            />
            <input
              data-testid="caya-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Pregúntame…"
              disabled={busy}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 9999,
                background: light ? '#F1F2F6' : 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              data-testid="caya-send"
              disabled={busy || !input.trim()}
              style={{
                padding: '9px 14px', borderRadius: 9999,
                background: input.trim() && !busy ? 'var(--grad)' : (light ? 'rgba(16,24,40,0.08)' : 'rgba(255,255,255,0.08)'),
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                cursor: input.trim() && !busy ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <ArrowRight size={11} />
            </button>
          </form>

          {/* Footer */}
          <div style={{
            padding: '6px 12px 8px', borderTop: '1px solid rgba(240,235,224,0.05)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            background: light ? '#FAFAFB' : '#0A0D16',
          }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', letterSpacing: '0.05em' }}>
              Beta · Powered by DMX RAG
            </div>
            {messages.length > 0 && (
              <button onClick={clearHistory} data-testid="caya-clear" style={{
                background: 'transparent', border: 'none', color: 'var(--cream-3)',
                fontFamily: 'DM Sans', fontSize: 9.5, cursor: 'pointer', textDecoration: 'underline',
              }}>Limpiar</button>
            )}
          </div>
        </div>
      )}

      {/* Animations + responsive */}
      <style>{`
        @keyframes caya-pop {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .caya-dots { display: inline-block; animation: caya-blink 1.2s infinite; }
        @keyframes caya-blink { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
        @media (max-width: 480px) {
          [data-testid="caya-panel"] { right: 8px !important; bottom: 8px !important; left: 8px !important; width: auto !important; }
          [data-testid="caya-bubble"] { right: 12px !important; bottom: 12px !important; }
        }
      `}</style>
    </>
  );
}
