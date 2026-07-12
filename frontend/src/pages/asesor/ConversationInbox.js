// W7.AS.3.D · Round 2 · ConversationInbox — bandeja estilo Slack en 3 columnas:
//   1) lista de threads (DISC badge + color sentimiento + alerta handoff) + filtros + search
//   2) hilo abierto: timeline + SentimentHeatmap inline + SuggestedReplies (modo piloto)
//   3) sidebar derecho: info del lead + acciones sugeridas + LiveTakeover
// Degrada con elegancia: lista vacía si DB sin conversaciones o sin permiso.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, RefreshCw, Loader2, Search, AlertTriangle, User, CalendarDays, ClipboardList, FileText } from 'lucide-react';
import SentimentHeatmap from '../../components/conversation/SentimentHeatmap';
import SuggestedReplies from '../../components/conversation/SuggestedReplies';
import LiveTakeover from '../../components/conversation/LiveTakeover';
import ConfidenceIndicator from '../../components/conversation/ConfidenceIndicator';
import PortalLayout from '../../components/shared/PortalLayout';
import Ficha360 from '../../components/asesor/design/Ficha360';
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaLinkedinIn, FaTiktok, FaYoutube, FaRobot } from 'react-icons/fa6';
import { dispatchCopilotToggle } from '../../hooks/useAICopilot';

const API = process.env.REACT_APP_BACKEND_URL || '';
const SENTIMENT_COLOR = {
  positive: 'var(--theme-success, #22C55E)',
  neutral: 'var(--theme-muted, #94A3B8)',
  negative: 'var(--theme-danger, #EF4444)',
};
const STATUS_COLOR = {
  active: 'var(--theme-success, #22C55E)',
  handoff: 'var(--theme-warning, #F59E0B)',
  taken_over: 'var(--theme-primary, #6366F1)',
  closed: 'var(--theme-muted-dark, var(--border))',
};

const AMEN_LABEL = { pet: 'Pet friendly', roof: 'Roof garden', gym: 'Gym', alberca: 'Alberca', seguridad: 'Seguridad', concierge: 'Concierge', spa: 'Spa', cava: 'Cava', sky_lounge: 'Sky lounge', salon_eventos: 'Salón de eventos', business_center: 'Business center', terraza: 'Terraza' };
const AMEN_OPTS = ['pet', 'roof', 'gym', 'alberca', 'seguridad', 'concierge', 'terraza'];
const editInput = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none' };

// Copiloto · color por TIPO de sugerencia (founder: distinguir qué-decirle vs propiedad vs coaching)
const COPILOT_KIND = {
  que_decirle:      { emoji: '💬', title: 'Qué decirle',         accent: '#6D4AFF', bg: 'rgba(109,74,255,0.07)', border: 'rgba(109,74,255,0.22)' },
  objecion:         { emoji: '🛡️', title: 'Maneja la objeción',  accent: '#F2635B', bg: 'rgba(242,99,91,0.07)',  border: 'rgba(242,99,91,0.22)' },
  recomendar:       { emoji: '🏠', title: 'Propiedad sugerida',  accent: '#FF5CA8', bg: 'rgba(255,92,168,0.07)', border: 'rgba(255,92,168,0.24)' },
  afinar_gusto:     { emoji: '🧭', title: 'Conoce su gusto',     accent: '#E2982E', bg: 'rgba(226,152,46,0.08)', border: 'rgba(226,152,46,0.24)' },
  cerrar:           { emoji: '🤝', title: 'Cierra',              accent: '#1FA06A', bg: 'rgba(31,160,106,0.08)', border: 'rgba(31,160,106,0.24)' },
  coordinar_visita: { emoji: '📅', title: 'Agenda visita',       accent: '#1FA06A', bg: 'rgba(31,160,106,0.08)', border: 'rgba(31,160,106,0.24)' },
  reactivar:        { emoji: '🔄', title: 'Reactiva',            accent: '#E2982E', bg: 'rgba(226,152,46,0.08)', border: 'rgba(226,152,46,0.24)' },
  seguimiento:      { emoji: '🧭', title: 'Siguiente paso',      accent: '#6D4AFF', bg: 'rgba(109,74,255,0.07)', border: 'rgba(109,74,255,0.22)' },
  como:             { emoji: '🎓', title: 'Cómo tratarlo',       accent: '#E2982E', bg: 'rgba(226,152,46,0.08)', border: 'rgba(226,152,46,0.24)' },
  _default:         { emoji: '🤖', title: 'Copiloto',            accent: '#6D4AFF', bg: 'rgba(109,74,255,0.07)', border: 'rgba(109,74,255,0.22)' },
};

// ── Sistema de UI de la columna 3 · una sola fuente de verdad para jerarquía y ritmo ──
const COL3_GAP = 18;                        // separación uniforme entre secciones
const sectionStyle = { display: 'flex', flexDirection: 'column', gap: 9 };
const cardStyle = { borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', padding: 12 };
// Jerarquía de botones: 1 primario (degradado) por contexto · resto secundario/ghost
const btnPrimary = { width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#6D4AFF,#FF5CA8)', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px rgba(109,74,255,0.26)', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left' };
const btnSecondary = { width: '100%', padding: '11px 13px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left' };
const btnGhost = { padding: '7px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--cream-2)', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 };
function Eyebrow({ children, action }) {    // encabezado de sección consistente
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{children}</span>
      {action || null}
    </div>
  );
}

function authHeaders() {
  // Seguridad: la cookie httponly (access_token) autentica vía credentials:'include'.
  // Ya no se lee el token de localStorage (vector XSS).
  return {};
}

// B7+ · "hace cuánto" en español llano
function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}
const TEMP_COLOR = { hot: '#F2635B', caliente: '#F2635B', warm: '#E2982E', tibio: '#E2982E', cold: '#3B82F6', frio: '#3B82F6' };
function fmtMXNlocal(n) { try { return '$' + Number(n).toLocaleString('es-MX'); } catch { return '$' + n; } }
const BOARD_LABEL = { por_verificar: 'Por verificar', enviada: 'Enviada', le_gusto: 'Le gustó', cita: 'Cita', visitada: 'Visitada', oferta: 'Oferta', descartada: 'Descartada' };
// omnicanal · canales de mensajería directa (mismo store) · alineado al registro del backend
const DM = ['whatsapp', 'messenger', 'instagram', 'linkedin', 'tiktok', 'youtube'];
const CHANNEL_LABEL = {
  whatsapp: '💬 WhatsApp', messenger: '📘 Messenger', instagram: '📷 Instagram',
  linkedin: '💼 LinkedIn', tiktok: '🎵 TikTok', youtube: '▶️ YouTube',
  ai: '🤖 Atlax', web: '🤖 Atlax',
};
const CHANNEL_ACCENT = {
  whatsapp: '#25D366', messenger: '#0084FF', instagram: '#E1306C',
  linkedin: '#0A66C2', tiktok: '#010101', youtube: '#FF0000', ai: '#5B37E0',
};
// Logos de marca reales (founder: logos originales, sin nombres · menos amontonado)
const CHANNEL_ICON = {
  whatsapp: FaWhatsapp, messenger: FaFacebookMessenger, instagram: FaInstagram,
  linkedin: FaLinkedinIn, tiktok: FaTiktok, youtube: FaYoutube, ai: FaRobot, web: FaRobot,
};
const CHANNEL_NAME = {
  whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram',
  linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', ai: 'Atlax', web: 'Atlax',
};
function ChannelLogo({ ch, size = 15 }) {
  const Icon = CHANNEL_ICON[ch] || FaRobot;
  return <Icon size={size} style={{ color: CHANNEL_ACCENT[ch] || 'var(--cream-2)' }} title={CHANNEL_NAME[ch] || ch} />;
}

// B6 · Caja de respuesta para hilos de WhatsApp (con "Redactar con IA" · reusa B5.5.2)
function WaCompose({ onSend, onDraft, drafting, disabled, seed, onAttachProperty }) {
  const [text, setText] = useState('');
  const [attached, setAttached] = useState(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [sendErr, setSendErr] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const acceptRef = useRef('image/*');
  const taRef = useRef(null);
  // Auto-expandir el textarea con el contenido (founder: se cortaba a la 4a línea)
  const autosize = useCallback(() => {
    const el = taRef.current; if (!el) return;
    if (!el.value) { el.style.height = '84px'; return; }   // vacío → altura base (evita caja gigante en flex)
    el.style.height = '0px';                                // mide el contenido real
    el.style.height = Math.max(84, Math.min(el.scrollHeight, 320)) + 'px';
  }, []);
  useEffect(() => { if (seed) setText(seed); }, [seed]);  // "Usar" desde la IA en vivo llena la caja
  useEffect(() => { autosize(); }, [text, autosize]);     // recalcula alto al escribir o al recibir seed
  const send = async () => {
    let tt = text.trim();
    if (attached) tt = (tt ? tt + '\n' : '') + `📎 ${attached.name}`;
    if (!tt || sending) return;
    setSending(true); setSendErr(false);
    const ok = await onSend(tt);
    setSending(false);
    if (ok === false) { setSendErr(true); return; }  // fallo → conserva el texto para reintentar
    setText(''); setAttached(null);
  };
  const draft = async () => { const d = await onDraft(); if (d) setText(d); };
  const pickFile = (accept) => { acceptRef.current = accept; setAttachOpen(false); if (fileRef.current) { fileRef.current.accept = accept; fileRef.current.click(); } };
  const onFile = (e) => { const f = e.target.files && e.target.files[0]; if (f) setAttached({ name: f.name }); e.target.value = ''; };
  const attachProperty = () => { setAttachOpen(false); if (onAttachProperty) onAttachProperty(); };
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, position: 'relative', flexWrap: 'wrap' }}>
        <button type="button" onClick={draft} disabled={drafting}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: 'var(--theme-primary, #818CF8)', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, cursor: drafting ? 'default' : 'pointer' }}>
          ✨ {drafting ? 'Redactando…' : 'Redactar con IA'}
        </button>
        <button type="button" onClick={() => setAttachOpen((o) => !o)} disabled={disabled} data-testid="asr-attach-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          📎 Adjuntar
        </button>
        {attachOpen && (
          <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(20,16,40,0.15)', padding: 5, display: 'flex', flexDirection: 'column', minWidth: 160 }}>
            {[
              { label: '🏠 Propiedad', fn: attachProperty },
              { label: '🖼️ Foto', fn: () => pickFile('image/*') },
              { label: '🎬 Video', fn: () => pickFile('video/*') },
              { label: '📄 Documento', fn: () => pickFile('.pdf,.doc,.docx,application/pdf') },
            ].map((o) => (
              <button key={o.label} type="button" onClick={o.fn}
                style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, cursor: 'pointer' }}>{o.label}</button>
            ))}
          </div>
        )}
      </div>
      {attached && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 8, padding: '5px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--cream)' }}>
          📎 {attached.name}
          <button type="button" onClick={() => setAttached(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} rows={3} disabled={disabled}
          placeholder="Escribe tu mensaje…  (Enter envía · Shift+Enter salto de línea)"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, resize: 'none', overflowY: 'auto', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, lineHeight: 1.5, outline: 'none', minHeight: 84, maxHeight: 320 }} />
        <button type="button" onClick={send} disabled={disabled || sending || (!text.trim() && !attached)}
          style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, border: 'none', background: '#25D366', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 800, cursor: (disabled || sending || (!text.trim() && !attached)) ? 'default' : 'pointer', opacity: (disabled || sending || (!text.trim() && !attached)) ? 0.5 : 1 }}>
          {sending ? 'Enviando…' : 'Enviar →'}
        </button>
      </div>
      {sendErr && (
        <div style={{ marginTop: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#F87171' }}>
          No se pudo enviar. Tu mensaje sigue en la caja — vuelve a intentarlo.
        </div>
      )}
    </div>
  );
}

function ConversationInboxBody({ user }) {
  const { t } = useTranslation(['conversation_round2_ui', 'conversation_confidence']);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState(false);  // distingue "falló la carga" de "bandeja vacía"
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confSummary, setConfSummary] = useState(null); // W7.AS.3.H · confidence-history del hilo
  const [search, setSearch] = useState('');
  const [curConv, setCurConv] = useState(null);    // B6 · conv seleccionada (canal + lead_id)
  const [ctx, setCtx] = useState(null);            // B6 · contexto del lead (gusto + siguiente paso)
  const [convAI, setConvAI] = useState(null);      // Pieza 1 · IA en vivo (ánimo + objeción + recomendación + NBA + coaching)
  const [composeSeed, setComposeSeed] = useState(null); // Pieza 1 · "Usar" llena la caja de escribir
  // Copiloto en vivo · rediseño (founder): minimizar + cerrar sugerencias + chat contextual
  const [copilotMin, setCopilotMin] = useState(() => { try { return localStorage.getItem('dmx_copilot_min') === '1'; } catch { return false; } });
  const [copilotDismiss, setCopilotDismiss] = useState({});   // {clave: true} sugerencias cerradas (por conversación)
  const [copilotAsk, setCopilotAsk] = useState('');           // caja "pregúntale al copiloto"
  const [copilotAnswer, setCopilotAnswer] = useState(null);   // respuesta del copiloto
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotMetrics, setCopilotMetrics] = useState(null); // cierre #4 · métricas del Copiloto
  const [propPicker, setPropPicker] = useState(null);   // Adjuntar propiedad · catálogo {loading, items}
  const [atlaxCh, setAtlaxCh] = useState({});           // Pieza 2 · Atlax auto por canal {whatsapp:true,...}
  const [col3Tab, setCol3Tab] = useState('acciones');   // col3 · pestañas: acciones | ia | perfil
  const [aiSug, setAiSug] = useState(false);            // ✨ sugerencia IA cargando
  const [remind, setRemind] = useState(false);          // recordatorio en tarea/cita
  const [galBusy, setGalBusy] = useState(false);        // 📸 enviando Galería Personalizada
  const [agentsBusy, setAgentsBusy] = useState(false);  // ↻ corriendo los agentes ahora
  const [editBusq, setEditBusq] = useState(null);       // modal editar búsqueda {form}
  const [editSaving, setEditSaving] = useState(false);
  const [editRecs, setEditRecs] = useState(null);       // recomendaciones IA tras guardar
  const [addForm, setAddForm] = useState(null);         // null | 'tarea' | 'nota' | 'cita'
  const [addText, setAddText] = useState('');
  const [addDate, setAddDate] = useState('');
  const [showMore, setShowMore] = useState(false);      // col3 · "Más" (gusto/tablero/confianza) colapsado
  const [drafting, setDrafting] = useState(false); // B6 · draft IA (reusa B5.5.2)
  const [stats, setStats] = useState(null);        // B7+ · pulse del buzón
  const [segment, setSegment] = useState('todas'); // B7+ · segmento activo
  const navigate = useNavigate();
  const [fichaContact, setFichaContact] = useState(null);  // ficha como modal EN SU LUGAR (sin cambiar de tab)

  const loadList = useCallback(async () => {
    setLoading(true);
    setListErr(false);
    try {
      // B6 · bandeja UNIFICADA — WhatsApp (B5.5) + chats IA en una lista (los segmentos filtran en cliente).
      const res = await fetch(`${API}/api/asesor/conversations/unified`, { headers: authHeaders(), credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data.conversations) ? data.conversations : []);
        setStats(data.stats || null);
      } else {
        setList([]); setStats(null); setListErr(true);
      }
    } catch {
      setList([]); setStats(null); setListErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  // Pieza 2 · settings de Atlax (en qué canales contesta solo)
  useEffect(() => {
    fetch(`${API}/api/asesor/atlax-settings`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setAtlaxCh(d.channels || {}); }).catch(() => {});
  }, []);
  const toggleAtlax = useCallback(async (channel) => {
    const next = !atlaxCh[channel];
    setAtlaxCh((s) => ({ ...s, [channel]: next }));
    try {
      await fetch(`${API}/api/asesor/atlax-settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
        body: JSON.stringify({ channel, auto: next }),
      });
    } catch { /* no-op */ }
  }, [atlaxCh]);

  // Auto-refresco de la lista cada 25s (la lista, no el hilo abierto → no estorba al escribir)
  useEffect(() => {
    const id = setInterval(() => { loadList(); }, 25000);
    return () => clearInterval(id);
  }, [loadList]);

  // B6 · mapea el hilo de mensajería al shape del detalle del inbox
  const _waToDetail = (leadId, ch, d) => ({
    channel: ch, lead_id: leadId, status: 'active', sentiment: 'neutral',
    messages: (d.messages || []).map((m) => ({ role: m.direction === 'outbound' ? 'asesor' : 'user', content: m.text })),
  });

  const openThread = useCallback(async (conv) => {
    setSelected(conv.conversation_id);
    setCurConv(conv);
    setDetail(null);
    setConfSummary(null);
    setCtx(null);
    setConvAI(null);
    setDetailLoading(true);
    const isDM = DM.includes(conv.channel);
    try {
      if (isDM) {
        const r = await fetch(`${API}/api/asesor/contactos/${conv.lead_id}/whatsapp?channel=${conv.channel}`, { headers: authHeaders(), credentials: 'include' });
        if (r.ok) setDetail(_waToDetail(conv.lead_id, conv.channel, await r.json()));
      } else {
        const res = await fetch(`${API}/api/conversation/${conv.conversation_id}`, { headers: authHeaders(), credentials: 'include' });
        if (res.ok) setDetail(await res.json());
      }
    } catch {
      /* no-op */
    } finally {
      setDetailLoading(false);
    }
    // confianza IA del hilo (solo chats IA · best-effort)
    if (!isDM) {
      try {
        const cr = await fetch(`${API}/api/conversation/${conv.conversation_id}/confidence-history`, { headers: authHeaders(), credentials: 'include' });
        if (cr.ok) { const cd = await cr.json(); if (cd && cd.count > 0) setConfSummary(cd); }
      } catch { /* no-op */ }
    }
    // B6 · contexto del lead (perfil de gusto + siguiente paso) para la columna derecha
    if (conv.lead_id) {
      try {
        const xr = await fetch(`${API}/api/asesor/contactos/${conv.lead_id}/context`, { headers: authHeaders(), credentials: 'include' });
        if (xr.ok) setCtx(await xr.json());
      } catch { /* no-op */ }
      // Pieza 1 · IA en vivo de la conversación (ánimo + recomendación) · solo canales de mensajería
      if (isDM) {
        try {
          const ar = await fetch(`${API}/api/asesor/contactos/${conv.lead_id}/conversation-ai?channel=${conv.channel}`, { headers: authHeaders(), credentials: 'include' });
          if (ar.ok) setConvAI(await ar.json());
        } catch { /* no-op */ }
      }
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!curConv) return;
    try {
      if (DM.includes(curConv.channel)) {
        const r = await fetch(`${API}/api/asesor/contactos/${curConv.lead_id}/whatsapp?channel=${curConv.channel}`, { headers: authHeaders(), credentials: 'include' });
        if (r.ok) setDetail(_waToDetail(curConv.lead_id, curConv.channel, await r.json()));
      } else {
        const res = await fetch(`${API}/api/conversation/${curConv.conversation_id}`, { headers: authHeaders(), credentials: 'include' });
        if (res.ok) setDetail(await res.json());
      }
    } catch { /* no-op */ }
  }, [curConv]);

  // Devuelve true si el mensaje se envió (para que el composer solo limpie la caja en éxito
  // y no pierda el texto en silencio si el POST falla).
  const sendAsAsesor = useCallback(async (text) => {
    if (!curConv || !text) return false;
    try {
      let res;
      if (DM.includes(curConv.channel)) {
        res = await fetch(`${API}/api/asesor/contactos/${curConv.lead_id}/whatsapp`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ text, channel: curConv.channel }),
        });
      } else {
        res = await fetch(`${API}/api/conversation/message`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ conversation_id: curConv.conversation_id, message: text, role: 'asesor' }),
        });
      }
      if (res.ok) { await refreshDetail(); return true; }
      return false;
    } catch { return false; }
  }, [curConv, refreshDetail]);

  // B6 · draft IA del mensaje (reusa B5.5.2 · solo hilos con lead_id)
  const draftReply = useCallback(async () => {
    if (!curConv?.lead_id || drafting) return null;
    setDrafting(true);
    try {
      const r = await fetch(`${API}/api/asesor/contactos/${curConv.lead_id}/whatsapp/draft`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
      });
      if (r.ok) { const d = await r.json(); return d.text || null; }
    } catch { /* no-op */ } finally { setDrafting(false); }
    return null;
  }, [curConv, drafting]);

  // Adjuntar propiedad · abre el CATÁLOGO rankeado (reusa el recomendador) en vez de una default
  const openPropPicker = useCallback(async () => {
    const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
    if (!lid) return;
    setPropPicker({ loading: true, items: [] });
    try {
      const r = await fetch(`${API}/api/asesor/contactos/${lid}/suggestions`, { headers: authHeaders(), credentials: 'include' });
      const d = r.ok ? await r.json() : {};
      setPropPicker({ loading: false, items: Array.isArray(d.items) ? d.items : [] });
    } catch { setPropPicker({ loading: false, items: [] }); }
  }, [detail, curConv]);

  // Seleccionar propiedad → la sube al tablero (aparece en la ficha · tab Propiedades) + llena la caja
  const attachProp = useCallback(async (p) => {
    const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
    setPropPicker(null);
    if (lid) {
      // Guardar en el tablero del lead es best-effort; que falle NO impide recomendar en el chat.
      try {
        const res = await fetch(`${API}/api/asesor/contactos/${lid}/board`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ dev_id: p.id, name: p.name, price_from: p.price_from, colonia: p.colonia }),
        });
        if (!res.ok) console.warn('attachProp board add failed', res.status);
      } catch (e) { console.warn('attachProp board add error', e); }
    }
    setComposeSeed(`Te recomiendo ${p.name}${p.colonia ? ` en ${p.colonia}` : ''} — creo que te va a encantar. ¿Te la mando? 🙌`);
  }, [detail, curConv]);

  // Recargar el contexto del lead (tras crear tarea/nota/cita)
  const reloadCtx = useCallback(async (lid) => {
    try {
      const xr = await fetch(`${API}/api/asesor/contactos/${lid}/context`, { headers: authHeaders(), credentials: 'include' });
      if (xr.ok) setCtx(await xr.json());
    } catch { /* no-op */ }
  }, []);

  // Crear tarea / nota / cita desde la columna (founder: no veía cómo agregarlas)
  const submitAdd = useCallback(async () => {
    const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
    if (!lid || !addText.trim()) return;
    const name = ctx?.name || '';
    try {
      if (addForm === 'tarea') {
        await fetch(`${API}/api/asesor/tareas`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ titulo: addText.trim(), tipo: 'lead', entity_id: lid, entity_label: name, due_at: addDate ? new Date(addDate).toISOString() : new Date().toISOString(), reminder: remind }) });
      } else if (addForm === 'nota') {
        await fetch(`${API}/api/asesor/contactos/${lid}/timeline`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ kind: 'nota', body: addText.trim() }) });
      } else if (addForm === 'cita') {
        await fetch(`${API}/api/asesor/contactos/${lid}/cita`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ titulo: addText.trim(), datetime: addDate ? new Date(addDate).toISOString() : new Date(Date.now() + 86400000).toISOString() }) });
      }
    } catch { /* no-op */ }
    setAddForm(null); setAddText(''); setAddDate(''); setRemind(false);
    reloadCtx(lid);
  }, [addForm, addText, addDate, remind, detail, curConv, ctx, reloadCtx]);

  // ✨ Auto-redactar la tarea/nota/cita desde la conversación
  const aiSuggest = useCallback(async () => {
    const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
    if (!lid || !addForm) return;
    setAiSug(true);
    try {
      const ch = (curConv && curConv.channel) || 'whatsapp';
      const r = await fetch(`${API}/api/asesor/contactos/${lid}/ai-suggest?type=${addForm}&channel=${ch}`, { headers: authHeaders(), credentials: 'include' });
      if (r.ok) { const d = await r.json(); if (d.text) setAddText(d.text); if (d.date) setAddDate(String(d.date).slice(0, 16)); }
    } catch { /* no-op */ } finally { setAiSug(false); }
  }, [detail, curConv, addForm]);

  // Cierre #1 · usar una sugerencia del Copiloto → llena la caja Y registra el feedback (aprendizaje)
  const applySuggestion = useCallback((type, text, kind) => {
    if (text) setComposeSeed(text);
    const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
    try {
      fetch(`${API}/api/asesor/copilot/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
        body: JSON.stringify({ suggestion_type: type, outcome: 'used', lead_id: lid, kind: kind || type, text: (text || '').slice(0, 160) }),
      });
    } catch { /* no-op */ }
  }, [detail, curConv]);

  // Cierre #4 · carga las métricas del Copiloto (panel del tab)
  const loadCopilotMetrics = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/asesor/copilot/metrics`, { headers: authHeaders(), credentials: 'include' });
      if (r.ok) setCopilotMetrics(await r.json());
    } catch { /* no-op */ }
  }, []);
  // Cierre #4 · al abrir el tab Copiloto, carga sus métricas (definido tras loadCopilotMetrics · evita TDZ)
  useEffect(() => { if (col3Tab === 'copiloto') loadCopilotMetrics(); }, [col3Tab, loadCopilotMetrics]);

  // 📸 Enviar Galería Personalizada (link de swipe) → crea/reusa el link y llena la caja con el mensaje listo
  const sendGaleria = useCallback(async () => {
    const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
    if (!lid) return;
    setGalBusy(true);
    try {
      const r = await fetch(`${API}/api/asesor/contactos/${lid}/swipe-link`, { method: 'POST', headers: authHeaders(), credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        const abs = d.url && d.url.startsWith('http') ? d.url : `${window.location.origin}/p/${d.token}`;
        setComposeSeed(d.wa_text && d.url ? d.wa_text.replace(d.url, abs) : `Te armé una Galería Personalizada con propiedades a tu medida 👉 ${abs}`);
      }
    } catch { /* no-op */ } finally { setGalBusy(false); }
  }, [detail, curConv]);

  // Correr los 5 agentes ahora (revisan todos los leads y dejan pendientes) → refresca este lead
  const runAgents = useCallback(async () => {
    setAgentsBusy(true);
    try {
      await fetch(`${API}/api/agent-workforce/run-now`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include' });
      const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
      if (lid) await reloadCtx(lid);
    } catch { /* no-op */ } finally { setAgentsBusy(false); }
  }, [detail, curConv, reloadCtx]);

  // Convierte la sugerencia de un agente en una tarea (queda registrada y rastreable)
  const doAgentAction = useCallback((a) => {
    setCol3Tab('acciones'); setAddForm('tarea'); setAddText(a.title || ''); setAddDate('');
  }, []);

  // Ejecuta la "siguiente mejor acción" del Copiloto según su tipo (no siempre es una propiedad)
  const doNba = useCallback((action_type) => {
    const first = (ctx?.name || '').split(' ')[0] || '';
    switch (action_type) {
      case 'afinar_gusto': sendGaleria(); break;
      case 'recomendar': openPropPicker(); break;
      case 'cerrar':
      case 'coordinar_visita': setCol3Tab('acciones'); setAddForm('cita'); setAddText(''); setAddDate(''); break;
      case 'reactivar': setComposeSeed(`Hola ${first}! Hace un tiempo no platicamos — ¿sigues en la búsqueda? Tengo un par de opciones que te pueden interesar. 🙌`); break;
      case 'seguimiento':
      default: setComposeSeed(`Hola ${first}! ¿Cómo vas? Quedo al pendiente para ayudarte con el siguiente paso. 🙌`); break;
    }
  }, [sendGaleria, openPropPicker, ctx]);

  // Copiloto · minimizar (recuerda preferencia) + cerrar sugerencias individuales
  const toggleCopilotMin = useCallback(() => {
    setCopilotMin((m) => { const n = !m; try { localStorage.setItem('dmx_copilot_min', n ? '1' : '0'); } catch { /* no-op */ } return n; });
  }, []);
  const dismissSug = useCallback((key) => setCopilotDismiss((d) => ({ ...d, [key]: true })), []);

  // Copiloto · preguntar sobre ESTE lead (chat contextual)
  const askLeadCopilot = useCallback(async (overrideQ) => {
    const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
    // overrideQ permite disparar con un valor explícito (chips de pregunta rápida) sin depender
    // del estado copilotAsk aún no aplicado. Si llega el event (onClick), se ignora.
    const q = ((typeof overrideQ === 'string' ? overrideQ : copilotAsk) || '').trim();
    if (!lid || !q || copilotBusy) return;
    setCopilotBusy(true); setCopilotAnswer(null);
    try {
      const ch = (curConv && curConv.channel) || 'whatsapp';
      const r = await fetch(`${API}/api/asesor/contactos/${lid}/copilot-ask`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
        body: JSON.stringify({ question: q, channel: ch }),
      });
      if (r.ok) { const d = await r.json(); setCopilotAnswer(d.answer || '(sin respuesta)'); }
      else setCopilotAnswer('No pude responder ahora. Intenta de nuevo.');
    } catch { setCopilotAnswer('No pude responder ahora. Intenta de nuevo.'); }
    finally { setCopilotBusy(false); }
  }, [detail, curConv, copilotAsk, copilotBusy]);

  // Editar perfil de búsqueda (founder: el cliente sube presupuesto / amplía zona)
  const openEditBusqueda = useCallback(() => {
    const b = ctx?.busqueda || {};
    setEditRecs(null);
    setEditBusq({
      precio_min: b.precio_min || '', precio_max: b.precio_max || '',
      recamaras_min: b.recamaras_min || 1, banos_min: b.banos_min || 1,
      estacionamientos_min: b.estacionamientos_min || 0, m2_min: b.m2_min || '',
      colonias: (b.colonias || []).join(', '),
      amenidades: b.amenidades || [], mascotas: !!b.mascotas,
      no_negociables: (b.no_negociables || []).join('\n'), urgencia: b.urgencia || 'media',
    });
  }, [ctx]);

  const saveBusqueda = useCallback(async () => {
    const bid = ctx?.busqueda?.id;
    if (!bid || !editBusq) return;
    setEditSaving(true);
    const body = {
      precio_min: editBusq.precio_min ? Number(editBusq.precio_min) : null,
      precio_max: editBusq.precio_max ? Number(editBusq.precio_max) : null,
      recamaras_min: Number(editBusq.recamaras_min) || 1,
      banos_min: Number(editBusq.banos_min) || 1,
      estacionamientos_min: Number(editBusq.estacionamientos_min) || 0,
      m2_min: editBusq.m2_min ? Number(editBusq.m2_min) : null,
      colonias: editBusq.colonias.split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean),
      amenidades: editBusq.amenidades, mascotas: editBusq.mascotas,
      no_negociables: editBusq.no_negociables.split('\n').map((s) => s.trim()).filter(Boolean),
      urgencia: editBusq.urgencia,
    };
    try {
      const r = await fetch(`${API}/api/asesor/busquedas/${bid}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        setEditRecs(d);
        const lid = (detail && detail.lead_id) || (curConv && curConv.lead_id);
        if (lid) await reloadCtx(lid);
      }
    } catch { /* no-op */ } finally { setEditSaving(false); }
  }, [ctx, editBusq, detail, curConv, reloadCtx]);

  // Wizard de fecha/hora (founder: cero escribir a mano · botones de día y hora)
  const toLocalISO = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const pickDay = (offset) => { const cur = addDate ? new Date(addDate) : null; const nd = new Date(); nd.setDate(nd.getDate() + offset); nd.setHours(cur ? cur.getHours() : 11, cur ? cur.getMinutes() : 0, 0, 0); setAddDate(toLocalISO(nd)); };
  const pickTime = (h) => { const nd = addDate ? new Date(addDate) : new Date(); nd.setHours(h, 0, 0, 0); setAddDate(toLocalISO(nd)); };

  const filtered = useMemo(() => {
    let l = list;
    if (segment === 'sin_responder') l = l.filter((c) => c.needs_reply);
    else if (segment === 'atencion') l = l.filter((c) => c.sentiment === 'negative');
    else if (segment === 'calientes') l = l.filter((c) => ['hot', 'caliente'].includes(String(c.temperatura || '').toLowerCase()));
    else if (segment === 'ia') l = l.filter((c) => !DM.includes(c.channel));
    else if (DM.includes(segment)) l = l.filter((c) => c.channel === segment);
    const q = search.trim().toLowerCase();
    if (q) l = l.filter((c) =>
      `${c.lead_name || ''} ${c.lead_id || ''} ${c.last_message || ''} ${c.asesor_id || ''}`.toLowerCase().includes(q));
    return l;
  }, [list, search, segment]);

  const lastUserMessage = useMemo(() => {
    const msgs = (detail && detail.messages) || [];
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === 'user') return msgs[i].content || '';
    }
    return '';
  }, [detail]);

  const selectStyle = {
    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--cream)', padding: '6px 10px', fontSize: 12.5, outline: 'none',
  };
  const canTakeover = detail && detail.status !== 'taken_over' && detail.status !== 'closed';

  return (
    <div style={{ padding: '16px 24px', color: 'var(--cream)', fontFamily: 'DM Sans, system-ui, sans-serif', height: 'calc(100dvh - 60px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <MessageSquare size={22} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0 }}>{t('inbox.title')}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cream-3)' }}>{t('inbox.subtitle')}</p>
        </div>
        {/* Buscador en el lugar de "Actualizar" (founder: ya refresca solo · liberamos la fila) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...selectStyle, padding: '0 10px', width: 280, maxWidth: '40vw' }}>
          <Search size={14} style={{ color: 'var(--cream-3)' }} />
          <input placeholder={t('inbox.search')} aria-label={t('inbox.search')} value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--cream)', fontSize: 12.5, padding: '7px 0', width: '100%' }} />
        </div>
      </div>

      {/* B7+ · UNA fila de filtros con contador (clic = filtra · cada chip revela un estado) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { k: 'todas', label: 'Todas', n: stats?.total, accent: 'var(--theme-2)' },
          { k: 'sin_responder', label: 'Sin responder', n: stats?.sin_responder, accent: '#E2982E' },
          { k: 'atencion', label: 'Necesitan atención', n: stats?.atencion, accent: '#F2635B' },
          { k: 'calientes', label: '🔥 Calientes', n: stats?.calientes, accent: '#F2635B' },
          // canales: solo el LOGO de marca + contador (founder: sin nombres, menos amontonado)
          ...DM.map((ck) => ({ k: ck, ch: ck, n: stats?.[ck], accent: CHANNEL_ACCENT[ck] })),
          { k: 'ia', ch: 'ai', n: stats?.ia, accent: '#5B37E0' },
        ].map((s) => {
          const on = segment === s.k;
          return (
            <button key={s.k} type="button" onClick={() => setSegment(s.k)} title={s.ch ? CHANNEL_NAME[s.ch] : s.label}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: s.ch ? '7px 11px' : '7px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700,
                border: `1px solid ${on ? s.accent : 'var(--border)'}`, background: 'var(--surface)', color: on ? s.accent : 'var(--cream-2)', boxShadow: on ? `inset 0 0 0 1px ${s.accent}` : 'none' }}>
              {s.ch ? <ChannelLogo ch={s.ch} size={16} /> : s.label}
              <span style={{ minWidth: 18, textAlign: 'center', fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: on ? s.accent : 'var(--surface-2)', color: on ? '#fff' : 'var(--cream-3)' }}>{s.n ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* 3 columns · altura acotada para que la caja de escribir entre sin scroll de página */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 320px', gap: 14, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* col 1 · threads */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--cream-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> …
            </div>
          ) : listErr ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 10 }}>No pudimos cargar la bandeja</div>
              <button type="button" onClick={loadList}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--theme-2)', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Reintentar
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>💬</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 6 }}>
                {segment === 'todas' ? 'Aún no hay conversaciones' : 'Nada en este filtro'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--cream-3)', lineHeight: 1.5, marginBottom: 14 }}>
                {segment === 'todas'
                  ? 'Manda un link de propiedades o escríbele por WhatsApp a un lead desde su ficha para empezar.'
                  : 'Prueba con otro segmento o quita los filtros.'}
              </div>
              {segment === 'todas' && (
                <button type="button" onClick={() => navigate('/asesor/contactos')}
                  style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--theme-2)', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  Ir a Mis Leads →
                </button>
              )}
            </div>
          ) : filtered.map((c) => (
            <button key={c.conversation_id} type="button" onClick={() => openThread(c)}
              style={{
                width: '100%', textAlign: 'left',
                background: selected === c.conversation_id ? 'rgba(99,102,241,0.14)' : 'transparent',
                border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--cream)',
                padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.temperatura && <span title={`Temperatura: ${c.temperatura}`} style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: TEMP_COLOR[String(c.temperatura).toLowerCase()] || 'var(--cream-3)' }} />}
                  <span style={{ display: 'inline-flex', flexShrink: 0 }}><ChannelLogo ch={c.channel} size={14} /></span>
                  {c.lead_name || c.lead_id || (c.conversation_id || '').slice(0, 14)}
                </span>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
                  {c.needs_reply && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: 'rgba(232,147,12,0.18)', color: '#e8930c' }}>RESPONDER</span>
                  )}
                  {(c.disc_tier || c.disc_tone) && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'rgba(99,102,241,0.2)', color: 'var(--theme-primary, #818CF8)' }}>
                      {c.disc_tier || c.disc_tone}
                    </span>
                  )}
                </span>
              </div>
              {c.last_message && (
                <div style={{ fontSize: 11.5, color: 'var(--cream-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cream-3)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {c.status === 'handoff' && <AlertTriangle size={12} style={{ color: STATUS_COLOR.handoff }} />}
                  <span style={{ color: SENTIMENT_COLOR[c.sentiment] || SENTIMENT_COLOR.neutral }}>●</span>
                  {c.message_count || 0} {t('inbox.messages')}
                </span>
                {c.last_ts && <span>{timeAgo(c.last_ts)}</span>}
              </div>
            </button>
          ))}
        </div>

        {/* col 2 · thread */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ margin: 'auto', color: 'var(--cream-3)', fontSize: 13 }}>{t('inbox.select_hint')}</div>
          ) : detailLoading || !detail ? (
            <div style={{ margin: 'auto', color: 'var(--cream-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> …
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
                {(detail.messages || []).map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                    background: m.role === 'user' ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)',
                    borderRadius: 12, padding: '9px 12px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                  }}>
                    {m.content}
                    {/* W7.AS.3.H · confidence dot solo en respuestas IA con score persistido */}
                    {m.role === 'assistant' && m.confidence != null && (
                      <span style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                        <ConfidenceIndicator value={m.confidence} reason={m.confidence_reason} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {DM.includes(detail.channel) ? (
                <>
                  {/* Copiloto · UNA tira contextual (la prioritaria) · coloreada por tipo · cerrable.
                      El detalle completo + chat viven en el tab '🤖 Copiloto' de la derecha. */}
                  {convAI?.top && !copilotDismiss.top && (() => {
                    const k = COPILOT_KIND[convAI.top.kind] || COPILOT_KIND._default;
                    const isScript = convAI.top.action === 'use_script';
                    return (
                      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 11, background: k.bg, border: `1px solid ${k.border}` }}>
                        <span style={{ fontSize: 15, lineHeight: 1.2 }}>{k.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: k.accent, marginBottom: 2 }}>{k.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--cream)', lineHeight: 1.45 }}>{convAI.top.text || convAI.top.label}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 }}>
                          <button type="button" onClick={() => { if (isScript) applySuggestion(convAI.top.kind, convAI.top.text, convAI.top.kind); else doNba(convAI.top.kind); }}
                            style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: k.accent, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{convAI.top.cta || 'Usar'}</button>
                          <button type="button" onClick={() => { setCol3Tab('copiloto'); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', fontSize: 10.5, fontWeight: 700 }}>Ver más ›</button>
                        </div>
                        <button type="button" onClick={() => dismissSug('top')} title="Cerrar"
                          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', fontSize: 14, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
                      </div>
                    );
                  })()}
                  <WaCompose onSend={sendAsAsesor} onDraft={draftReply} drafting={drafting} disabled={detail.status === 'closed'} seed={composeSeed} onAttachProperty={openPropPicker} />
                </>
              ) : (
                <SuggestedReplies lastUserMessage={lastUserMessage} onSend={sendAsAsesor}
                  disabled={detail.status === 'closed'} />
              )}
            </>
          )}
        </div>

        {/* col 3 · lead info + actions */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, overflowY: 'auto' }}>
          {!detail ? (
            <div style={{ color: 'var(--cream-3)', fontSize: 13 }}>{t('inbox.col_info')}</div>
          ) : (
            <>
              {/* Header compacto: nombre + chips (temp · canal · estado) → sin las InfoRows largas */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 16.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ctx?.name || detail.lead_id || 'Lead'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11.5, color: 'var(--cream-3)', flexWrap: 'wrap' }}>
                  {ctx?.temperatura && <span style={{ color: TEMP_COLOR[String(ctx.temperatura).toLowerCase()] || 'var(--cream-2)', fontWeight: 700 }}>● {ctx.temperatura}</span>}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ChannelLogo ch={detail.channel} size={12} /> {CHANNEL_NAME[detail.channel] || detail.channel}</span>
                  <span style={{ color: STATUS_COLOR[detail.status] || 'var(--cream-2)' }}>● {t(`status.${detail.status}`, detail.status)}</span>
                  {ctx?.close_probability != null && <span style={{ color: 'var(--cream-2)', fontWeight: 700 }}>· cierre {Math.round(ctx.close_probability)}%</span>}
                </div>
                {/* Atlax · interruptor (control del cliente · vive en el encabezado, no en tabs) */}
                <div style={{ marginTop: 8 }}>
                  {detail.channel === 'ai' ? (
                    canTakeover ? (
                      <LiveTakeover conversationId={detail.conversation_id} onTakenOver={() => { loadList(); refreshDetail(); }} />
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#E2982E', background: 'rgba(226,152,46,0.10)', border: '1px solid rgba(226,152,46,0.25)', borderRadius: 999, padding: '5px 11px' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E2982E' }} /> Atlax: Manual · la llevas tú
                      </span>
                    )
                  ) : (
                    <button type="button" onClick={() => toggleAtlax(detail.channel)} title={atlaxCh[detail.channel] ? `Atlax atiende ${CHANNEL_NAME[detail.channel]} en automático` : `Actívalo y Atlax atenderá ${CHANNEL_NAME[detail.channel]} cuando conectes el canal`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', borderRadius: 999, padding: '6px 13px',
                        background: atlaxCh[detail.channel] ? 'rgba(91,55,224,0.12)' : 'var(--surface-2)', color: atlaxCh[detail.channel] ? '#5B37E0' : 'var(--cream-2)', border: `1px solid ${atlaxCh[detail.channel] ? 'rgba(91,55,224,0.30)' : 'var(--border)'}` }}>
                      <FaRobot size={12} /> Atlax: {atlaxCh[detail.channel] ? 'Auto' : 'Manual'}
                      <span style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.7 }}>{atlaxCh[detail.channel] ? '· toca para pausar' : '· toca para activar'}</span>
                    </button>
                  )}
                </div>
              </div>

              {(detail.lead_id || curConv?.lead_id) && (
                <button type="button" onClick={() => {
                  const lid = detail.lead_id || curConv?.lead_id;
                  const nm = (ctx?.name || '').split(' ');
                  setFichaContact({ id: lid, first_name: nm[0] || '', last_name: nm.slice(1).join(' ') });
                }}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none', background: 'var(--theme-2)', color: '#fff', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  👤 Ver ficha completa →
                </button>
              )}

              {/* Tabs (founder: 3 pestañas · una sola IA = Copiloto · Atlax va en el encabezado) */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
                {[{ k: 'acciones', e: '⚡', l: 'Acciones' }, { k: 'copiloto', e: '✨', l: 'Copiloto' }, { k: 'perfil', e: '👤', l: 'Perfil' }].map((tb) => (
                  <button key={tb.k} type="button" onClick={() => setCol3Tab(tb.k)} title={tb.l}
                    style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '6px 2px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, background: col3Tab === tb.k ? 'var(--surface)' : 'transparent', color: col3Tab === tb.k ? 'var(--theme-2)' : 'var(--cream-3)', boxShadow: col3Tab === tb.k ? '0 1px 3px rgba(20,16,40,0.1)' : 'none' }}>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{tb.e}</span>
                    <span style={{ fontSize: 10, lineHeight: 1 }}>{tb.l}</span>
                    {tb.k === 'copiloto' && convAI?.top && col3Tab !== 'copiloto' && (
                      <span style={{ position: 'absolute', top: 4, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#FF5CA8' }} />
                    )}
                  </button>
                ))}
              </div>

              {/* ═══ TAB: ACCIONES ═══ */}
              {col3Tab === 'acciones' && (<>
              {/* Crear (founder: tareas/notas/citas) · fila segmentada limpia, sin robot suelto */}
              <Eyebrow>Crear</Eyebrow>
              <div style={{ display: 'flex', gap: 7, marginTop: 8, marginBottom: addForm ? 10 : COL3_GAP }}>
                {[{ k: 'tarea', l: 'Tarea', Icon: ClipboardList }, { k: 'nota', l: 'Nota', Icon: FileText }, { k: 'cita', l: 'Cita', Icon: CalendarDays }].map((b) => (
                  <button key={b.k} type="button" onClick={() => { setAddForm(addForm === b.k ? null : b.k); setAddText(''); setAddDate(''); }}
                    style={{ flex: '1 1 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, border: `1px solid ${addForm === b.k ? 'var(--theme-2)' : 'var(--border)'}`, background: addForm === b.k ? 'rgba(var(--theme-rgb),0.10)' : 'var(--surface)', color: addForm === b.k ? 'var(--theme-2)' : 'var(--cream-2)' }}><b.Icon size={14} /> {b.l}</button>
                ))}
              </div>
              {addForm && (
                <div style={{ marginBottom: 14, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 10px 28px rgba(20,16,60,0.10)', overflow: 'hidden' }}>
                  {/* Header del formulario · estilo móvil (icono + título + IA) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(109,74,255,0.10), rgba(255,92,168,0.06))' }}>
                    <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--theme-2)' }}>
                      {(() => { const I = addForm === 'tarea' ? ClipboardList : addForm === 'nota' ? FileText : CalendarDays; return <I size={17} />; })()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 14.5, color: 'var(--cream)' }}>
                        {addForm === 'tarea' ? 'Nueva tarea' : addForm === 'nota' ? 'Nueva nota' : 'Nueva cita'}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--cream-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>para {ctx?.name || 'este lead'}</div>
                    </div>
                    <button type="button" onClick={aiSuggest} disabled={aiSug} title="Redactar con IA desde la conversación"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 999, border: 'none', background: aiSug ? 'var(--surface-2)' : 'linear-gradient(135deg,#6D4AFF,#FF5CA8)', color: aiSug ? 'var(--cream-3)' : '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 800, cursor: aiSug ? 'default' : 'pointer', boxShadow: aiSug ? 'none' : '0 4px 12px rgba(109,74,255,0.30)' }}>
                      ✨ {aiSug ? '…' : 'IA'}
                    </button>
                  </div>

                  {/* Cuerpo del formulario */}
                  <div style={{ padding: 14 }}>
                    {addForm === 'nota' ? (
                      <>
                        <textarea value={addText} onChange={(e) => setAddText(e.target.value)} rows={3} placeholder="Escribe la nota… o toca ✨ IA para resumir la conversación"
                          style={{ width: '100%', boxSizing: 'border-box', resize: 'none', padding: '11px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none', lineHeight: 1.45 }} />
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--cream-3)', margin: '11px 0 7px' }}>Etiqueta rápida</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {['Objeción', 'Presupuesto', 'Listo para cerrar'].map((tg) => (
                            <button key={tg} type="button" onClick={() => setAddText((x) => `[${tg}] ${x || ''}`.trim())}
                              style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{tg}</button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <input value={addText} onChange={(e) => setAddText(e.target.value)} placeholder={addForm === 'cita' ? 'Título de la cita…' : 'Qué hay que hacer…'}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none' }} />
                        {addForm === 'tarea' && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                            {[{ l: 'Llamar', e: '📞' }, { l: 'Enviar info', e: '📨' }, { l: 'Dar seguimiento', e: '🔄' }].map((pp) => (
                              <button key={pp.l} type="button" onClick={() => setAddText(pp.l)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999, border: `1px solid ${addText === pp.l ? 'var(--theme-2)' : 'var(--border)'}`, background: addText === pp.l ? 'rgba(99,102,241,0.10)' : 'var(--surface)', color: addText === pp.l ? 'var(--theme-2)' : 'var(--cream-2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{pp.e} {pp.l}</button>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--cream-3)', margin: '13px 0 7px' }}>{addForm === 'cita' ? 'Día' : 'Vence'}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[0, 1, 2, 3, 4, 5].map((off) => {
                          const dd = new Date(); dd.setDate(dd.getDate() + off); dd.setHours(0, 0, 0, 0);
                          const sel = addDate && new Date(addDate).toDateString() === dd.toDateString();
                          const lab = off === 0 ? 'Hoy' : off === 1 ? 'Mañana' : dd.toLocaleDateString('es-MX', { weekday: 'short' });
                          const sub = dd.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
                          return (
                            <button key={off} type="button" onClick={() => pickDay(off)}
                              style={{ padding: '8px 4px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${sel ? 'var(--theme-2)' : 'var(--border)'}`, background: sel ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: sel ? 'var(--theme-2)' : 'var(--cream-2)', textAlign: 'center', lineHeight: 1.2 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'capitalize' }}>{lab}</div>
                              <div style={{ fontSize: 9, color: sel ? 'var(--theme-2)' : 'var(--cream-3)' }}>{sub}</div>
                            </button>
                          );
                        })}
                      </div>
                      {addForm === 'cita' && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--cream-3)', margin: '11px 0 7px' }}>Hora</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                            {[9, 10, 11, 12, 13, 16, 17, 18].map((h) => {
                              const sel = addDate && new Date(addDate).getHours() === h;
                              const lab = h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
                              return (
                                <button key={h} type="button" onClick={() => pickTime(h)}
                                  style={{ padding: '7px 2px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${sel ? 'var(--theme-2)' : 'var(--border)'}`, background: sel ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: sel ? 'var(--theme-2)' : 'var(--cream-2)', fontSize: 11, fontWeight: 700 }}>{lab}</button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {addDate && (
                        <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', fontSize: 11.5, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 7, textTransform: 'capitalize' }}>
                          <CalendarDays size={14} color="var(--theme-2)" /> {new Date(addDate).toLocaleString('es-MX', addForm === 'cita' ? { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' } : { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>
                      )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, padding: '10px 12px', borderRadius: 12, background: (addForm === 'cita' || remind) ? 'rgba(99,102,241,0.08)' : 'var(--surface-2)', border: `1px solid ${(addForm === 'cita' || remind) ? 'rgba(99,102,241,0.30)' : 'var(--border)'}`, fontSize: 12, color: 'var(--cream-2)', cursor: addForm === 'cita' ? 'default' : 'pointer' }}>
                          <input type="checkbox" checked={addForm === 'cita' ? true : remind} disabled={addForm === 'cita'} onChange={(e) => setRemind(e.target.checked)} style={{ accentColor: 'var(--theme-2)', width: 16, height: 16 }} />
                          <span>🔔 Recordatorio <span style={{ color: 'var(--cream-3)', fontSize: 10.5 }}>{addForm === 'cita' ? '· automático 24h y 2h antes' : '· te aviso 24h antes'}</span></span>
                        </label>
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button type="button" onClick={() => { setAddForm(null); setAddText(''); setAddDate(''); setRemind(false); }}
                        style={{ flex: '0 0 auto', padding: '11px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                      <button type="button" onClick={submitAdd} disabled={!addText.trim()}
                        style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: addText.trim() ? 'linear-gradient(135deg,#6D4AFF,#FF5CA8)' : 'var(--surface-2)', color: addText.trim() ? '#fff' : 'var(--cream-3)', fontSize: 13, fontWeight: 800, cursor: addText.trim() ? 'pointer' : 'default', boxShadow: addText.trim() ? '0 8px 20px rgba(109,74,255,0.30)' : 'none' }}>
                        {addForm === 'cita' ? '📅 Agendar' : addForm === 'nota' ? '📝 Guardar' : '✅ Crear'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Pendientes del lead (próxima cita + tareas) · sección consistente */}
              {(ctx?.proxima_cita || (ctx?.tareas || []).length > 0) && (
                <div style={{ ...sectionStyle, marginBottom: COL3_GAP }}>
                  <Eyebrow>Pendientes</Eyebrow>
                  {ctx?.proxima_cita && (
                    <div style={{ padding: '10px 12px', borderRadius: 11, background: 'rgba(31,160,106,0.08)', border: '1px solid rgba(31,160,106,0.22)' }}>
                      <div style={{ fontSize: 12, color: 'var(--cream)', fontWeight: 700 }}>📅 {ctx.proxima_cita.titulo}</div>
                      <div style={{ fontSize: 11, color: 'var(--cream-2)', marginTop: 2 }}>{(ctx.proxima_cita.datetime || '').replace('T', ' · ').slice(0, 19)}</div>
                    </div>
                  )}
                  {(ctx?.tareas || []).map((tk) => (
                    <div key={tk.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--theme-2)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--cream)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk.titulo}</span>
                      {tk.due_at && <span style={{ fontSize: 10.5, color: 'var(--cream-3)', flexShrink: 0 }}>{String(tk.due_at).slice(5, 10)}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Enviar al cliente · 1 acción principal (Galería) + secundarias quietas */}
              {(detail.lead_id || curConv?.lead_id) && (
                <div style={{ ...sectionStyle, marginBottom: COL3_GAP }}>
                  <Eyebrow>Enviar al cliente</Eyebrow>
                  <button type="button" onClick={sendGaleria} disabled={galBusy} style={{ ...btnPrimary, opacity: galBusy ? 0.7 : 1, cursor: galBusy ? 'default' : 'pointer' }}>
                    <span style={{ fontSize: 16 }}>📸</span>
                    <span style={{ flex: 1 }}>{galBusy ? 'Creando link…' : 'Enviar Galería Personalizada'}</span>
                    <span style={{ fontSize: 12 }}>→</span>
                  </button>
                  <div style={{ fontSize: 10.5, color: 'var(--cream-3)', lineHeight: 1.4, marginTop: -3 }}>Desliza 👍/👎 · afina su gusto y vuelve a su tablero.</div>
                  {DM.includes(detail.channel) && (
                    <button type="button" onClick={openPropPicker} style={btnSecondary}>🏠 Adjuntar una propiedad</button>
                  )}
                  {ctx?.phone && (
                    <a href={`https://wa.me/${String(ctx.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ ...btnSecondary, textDecoration: 'none' }}>📲 Abrir WhatsApp</a>
                  )}
                </div>
              )}

              {/* Copiloto · acción discreta al final (no compite con lo demás) */}
              <button type="button" onClick={() => dispatchCopilotToggle('open')} style={{ ...btnGhost, width: '100%', justifyContent: 'center' }}>
                <FaRobot size={13} /> Preguntar al Copiloto
              </button>
              </>)}

              {/* ═══ TAB: PERFIL ═══ */}
              {col3Tab === 'perfil' && (<>
              {/* Datos del contacto · siempre presentes (founder: el tab no debe verse vacío) */}
              <div style={{ marginBottom: COL3_GAP }}>
                <div style={{ marginBottom: 8 }}><Eyebrow>Datos del contacto</Eyebrow></div>
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ctx?.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                      <span style={{ fontSize: 13 }}>📱</span>
                      <a href={`https://wa.me/${String(ctx.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cream)', textDecoration: 'none' }}>{ctx.phone}</a>
                    </div>
                  )}
                  {ctx?.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                      <span style={{ fontSize: 13 }}>✉️</span>
                      <span style={{ color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ctx.email}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {ctx?.tipo && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--cream-2)', textTransform: 'capitalize' }}>{ctx.tipo}</span>}
                    {ctx?.fuente && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--cream-2)', textTransform: 'capitalize' }}>vía {ctx.fuente}</span>}
                    {(ctx?.tags || []).map((tg) => (
                      <span key={tg} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', color: 'var(--theme-2)', textTransform: 'capitalize' }}>{tg}</span>
                    ))}
                  </div>
                  {!ctx?.phone && !ctx?.email && (ctx?.tags || []).length === 0 && !ctx?.tipo && !ctx?.fuente && (
                    <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Sin datos de contacto aún.</div>
                  )}
                </div>
              </div>

              {/* Lo que busca · perfil COMPLETO de la búsqueda activa + editar (founder) */}
              {ctx?.busqueda && (
                <div style={{ marginBottom: COL3_GAP }}>
                  <div style={{ marginBottom: 9 }}>
                    <Eyebrow action={<button type="button" onClick={openEditBusqueda} style={{ ...btnGhost, fontSize: 10.5, padding: '4px 10px', borderRadius: 999, color: 'var(--theme-2)' }}>✏️ Editar</button>}>Lo que busca</Eyebrow>
                  </div>
                  {/* grid de criterios · estético */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    {[
                      { ic: '💰', lb: 'Presupuesto', v: (ctx.busqueda.precio_min || ctx.busqueda.precio_max) ? `${ctx.busqueda.precio_min ? fmtMXNlocal(ctx.busqueda.precio_min) : '—'}${ctx.busqueda.precio_max ? ` – ${fmtMXNlocal(ctx.busqueda.precio_max)}` : ''}` : null, full: true },
                      { ic: '🛏️', lb: 'Recámaras', v: ctx.busqueda.recamaras_min ? `${ctx.busqueda.recamaras_min}+` : null },
                      { ic: '🛁', lb: 'Baños', v: ctx.busqueda.banos_min ? `${ctx.busqueda.banos_min}+` : null },
                      { ic: '🚗', lb: 'Estac.', v: (ctx.busqueda.estacionamientos_min != null) ? `${ctx.busqueda.estacionamientos_min}+` : null },
                      { ic: '📐', lb: 'm²', v: ctx.busqueda.m2_min ? `${ctx.busqueda.m2_min}+ m²` : null },
                    ].filter((x) => x.v).map((x) => (
                      <div key={x.lb} style={{ gridColumn: x.full ? '1 / -1' : 'auto', padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 1 }}>{x.ic} {x.lb}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                  {/* zonas */}
                  {(ctx.busqueda.colonias || []).length > 0 && (
                    <div style={{ marginTop: 9 }}>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 5 }}>📍 Zonas</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {ctx.busqueda.colonias.map((cl) => (
                          <span key={cl} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', color: 'var(--theme-2)', textTransform: 'capitalize' }}>{cl.replace(/-/g, ' ')}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* mascotas + amenidades */}
                  {(ctx.busqueda.mascotas || (ctx.busqueda.amenidades || []).length > 0) && (
                    <div style={{ marginTop: 9 }}>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 5 }}>✨ Imprescindibles</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {ctx.busqueda.mascotas && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--cream-2)' }}>🐾 Pet friendly</span>}
                        {(ctx.busqueda.amenidades || []).map((am) => (
                          <span key={am} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--cream-2)', textTransform: 'capitalize' }}>{AMEN_LABEL[am] || am}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* no negociables */}
                  {(ctx.busqueda.no_negociables || []).length > 0 && (
                    <div style={{ marginTop: 9 }}>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 5 }}>🚫 No negociables</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {ctx.busqueda.no_negociables.map((nn) => (
                          <div key={nn} style={{ fontSize: 12, color: 'var(--cream-2)', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: '#F2635B' }}>•</span> {nn}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ctx.busqueda.urgencia && (
                    <div style={{ marginTop: 9, fontSize: 11.5, color: 'var(--cream-3)' }}>⏱️ Urgencia: <b style={{ color: ctx.busqueda.urgencia === 'alta' ? '#F2635B' : 'var(--cream-2)', textTransform: 'capitalize' }}>{ctx.busqueda.urgencia}</b></div>
                  )}
                </div>
              )}

              {ctx?.taste && (ctx.taste.summary || (ctx.taste.rooms || []).length > 0 || (ctx.taste.features || []).length > 0) && (
                <div style={{ marginBottom: COL3_GAP }}>
                  <div style={{ marginBottom: 8 }}><Eyebrow>❤ Qué le gusta {ctx.taste.confidence_label ? `· ${ctx.taste.confidence_label}` : ''}</Eyebrow></div>
                  {ctx.taste.summary && <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 8, lineHeight: 1.45 }}>{ctx.taste.summary}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {(ctx.taste.rooms || []).slice(0, 4).map((r) => (
                      <span key={r.room} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.14)', color: 'var(--theme-primary, #818CF8)' }}>{r.label} {r.score}%</span>
                    ))}
                    {(ctx.taste.features || []).slice(0, 3).map((f) => (
                      <span key={f.key} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--cream-2)' }}>{f.label}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* B7+ · probabilidad de cierre (reusa close_probability) */}
              {ctx?.close_probability != null && (
                <div style={{ marginBottom: COL3_GAP }}>
                  <div style={{ marginBottom: 6 }}>
                    <Eyebrow action={<b style={{ fontSize: 12, color: 'var(--cream)' }}>{Math.round(ctx.close_probability)}%</b>}>Probabilidad de cierre</Eyebrow>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, ctx.close_probability))}%`, background: ctx.close_probability >= 60 ? '#1FA06A' : ctx.close_probability >= 35 ? '#E2982E' : '#F2635B' }} />
                  </div>
                </div>
              )}

              {/* B7+ · estado del tablero de propiedades */}
              {ctx?.board && Object.keys(ctx.board).length > 0 && (
                <div style={{ marginBottom: COL3_GAP }}>
                  <div style={{ marginBottom: 8 }}><Eyebrow>Tablero · {ctx.board_count} propiedades</Eyebrow></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {Object.entries(ctx.board).map(([st, n]) => (
                      <span key={st} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--cream-2)' }}>{BOARD_LABEL[st] || st}: <b style={{ color: 'var(--cream)' }}>{n}</b></span>
                    ))}
                  </div>
                </div>
              )}
              </>)}

              {/* ═══ TAB: COPILOTO ═══ (fusión: sugerencias proactivas + agentes + chat · una sola IA) */}
              {col3Tab === 'copiloto' && (<>
              {/* Zona SUGIERE · encabezado */}
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cream-3)', marginBottom: 10 }}>Sugiere</div>

              {/* Qué decirle · guion listo */}
              {convAI?.coaching?.que_decirle && (
                <div style={{ marginBottom: COL3_GAP, padding: '11px 12px', borderRadius: 12, background: COPILOT_KIND.que_decirle.bg, border: `1px solid ${COPILOT_KIND.que_decirle.border}` }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: COPILOT_KIND.que_decirle.accent, marginBottom: 5 }}>💬 Qué decirle</div>
                  <div style={{ fontSize: 12.5, color: 'var(--cream)', lineHeight: 1.5 }}>{convAI.coaching.que_decirle.script}</div>
                  {convAI.coaching.que_decirle.rationale && <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 4 }}>{convAI.coaching.que_decirle.rationale}</div>}
                  <button type="button" onClick={() => applySuggestion('que_decirle', convAI.coaching.que_decirle.script, 'coaching')}
                    style={{ marginTop: 9, padding: '7px 14px', borderRadius: 999, border: 'none', background: COPILOT_KIND.que_decirle.accent, color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>Usar como respuesta</button>
                </div>
              )}
              {/* Cómo tratarlo · tono */}
              {convAI?.coaching?.como_tratarlo && (
                <div style={{ marginBottom: COL3_GAP, padding: '11px 12px', borderRadius: 12, background: COPILOT_KIND.como.bg, border: `1px solid ${COPILOT_KIND.como.border}` }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: COPILOT_KIND.como.accent, marginBottom: 5 }}>🎓 Cómo tratarlo</div>
                  <div style={{ fontSize: 12.5, color: 'var(--cream)', fontWeight: 700 }}>{convAI.coaching.como_tratarlo.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--cream-2)', marginTop: 3, lineHeight: 1.45 }}>{convAI.coaching.como_tratarlo.tip}</div>
                </div>
              )}
              {/* Siguiente mejor acción */}
              {convAI?.nba && (() => {
                const k = COPILOT_KIND[convAI.nba.action_type] || COPILOT_KIND._default;
                return (
                  <div style={{ marginBottom: COL3_GAP, padding: '11px 12px', borderRadius: 12, background: k.bg, border: `1px solid ${k.border}` }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: k.accent, marginBottom: 5 }}>{k.emoji} {k.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--cream)', fontWeight: 700 }}>{convAI.nba.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--cream-2)', marginTop: 3, lineHeight: 1.45 }}>{convAI.nba.why}</div>
                    <button type="button" onClick={() => doNba(convAI.nba.action_type)}
                      style={{ marginTop: 9, padding: '7px 14px', borderRadius: 999, border: 'none', background: k.accent, color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>{convAI.nba.cta}</button>
                  </div>
                );
              })()}
              {/* Propiedad más afín */}
              {convAI?.recomendacion && (
                <div style={{ marginBottom: COL3_GAP, padding: '11px 12px', borderRadius: 12, background: COPILOT_KIND.recomendar.bg, border: `1px solid ${COPILOT_KIND.recomendar.border}` }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: COPILOT_KIND.recomendar.accent, marginBottom: 5 }}>🏠 Propiedad sugerida</div>
                  <div style={{ fontSize: 12.5, color: 'var(--cream)' }}><b>{convAI.recomendacion.name}</b> · <span style={{ color: COPILOT_KIND.recomendar.accent, fontWeight: 800 }}>{convAI.recomendacion.match}% afín</span></div>
                  <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 3, lineHeight: 1.4 }}>{convAI.recomendacion.reason || 'Por su gusto y presupuesto.'}</div>
                  <button type="button" onClick={() => setComposeSeed(`Hola! Creo que ${convAI.recomendacion.name}${convAI.recomendacion.colonia ? ` en ${convAI.recomendacion.colonia}` : ''} te va a encantar — va con lo que buscas. ¿Te la mando? 🙌`)}
                    style={{ marginTop: 9, padding: '7px 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Enviar al cliente</button>
                </div>
              )}

              {/* Agentes autónomos · fusionados aquí (founder: una sola IA) */}
              <div style={{ ...sectionStyle, marginBottom: COL3_GAP }}>
                <Eyebrow action={<button type="button" onClick={runAgents} disabled={agentsBusy} style={{ ...btnGhost, fontSize: 10.5, padding: '4px 9px', color: agentsBusy ? 'var(--cream-3)' : 'var(--theme-2)' }}>{agentsBusy ? 'Corriendo…' : '↻ Correr'}</button>}>🤖 Tus agentes (en automático)</Eyebrow>
                {(ctx?.agent_actions || []).length > 0 ? (
                  ctx.agent_actions.map((a) => (
                    <div key={a.id} style={cardStyle}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--theme-2)', marginBottom: 3 }}>{a.agent_label}</div>
                      <div style={{ fontSize: 12, color: 'var(--cream)', lineHeight: 1.4 }}>{a.title}</div>
                      <button type="button" onClick={() => doAgentAction(a)} style={{ ...btnGhost, border: 'none', background: 'var(--theme-2)', color: '#fff', marginTop: 9 }}>Convertir en tarea</button>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.45, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px dashed var(--border)' }}>Sin pendientes de los agentes. Revisan tus leads cada pocas horas; toca ↻ Correr para revisar ahora.</div>
                )}
              </div>

              {/* Zona PREGÚNTALE · chat contextual con el Copiloto */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ marginBottom: 8 }}><Eyebrow>Pregúntale</Eyebrow></div>
                {copilotAnswer && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, padding: '10px 11px', borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>✨</span>
                    <div style={{ flex: 1, minWidth: 0, color: 'var(--cream)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{copilotAnswer}</div>
                    <button type="button" onClick={() => setComposeSeed(copilotAnswer)} title="Usar como respuesta"
                      style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>Usar</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={copilotAsk} onChange={(e) => setCopilotAsk(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); askLeadCopilot(); } }}
                    placeholder={`Sobre ${(ctx?.name || 'este lead').split(' ')[0]}…`}
                    style={{ flex: 1, boxSizing: 'border-box', padding: '9px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, outline: 'none' }} />
                  <button type="button" onClick={askLeadCopilot} disabled={copilotBusy || !copilotAsk.trim()}
                    style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 999, border: 'none', background: (copilotBusy || !copilotAsk.trim()) ? 'var(--surface-2)' : 'var(--theme-2)', color: (copilotBusy || !copilotAsk.trim()) ? 'var(--cream-3)' : '#fff', fontSize: 11.5, fontWeight: 800, cursor: (copilotBusy || !copilotAsk.trim()) ? 'default' : 'pointer' }}>{copilotBusy ? '…' : 'Preguntar'}</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {['¿Cómo le doy seguimiento?', '¿Qué objeción puede tener?', 'Dame un cierre para este lead'].map((q) => (
                    <button key={q} type="button" onClick={() => { setCopilotAsk(q); askLeadCopilot(q); }}
                      style={{ fontSize: 10.5, fontWeight: 600, padding: '5px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', cursor: 'pointer' }}>{q}</button>
                  ))}
                </div>
              </div>

              {/* Cierre #4 · mini-panel de métricas (conecta Bandeja con tu Performance) */}
              {copilotMetrics && (copilotMetrics.used > 0 || (copilotMetrics.top_objeciones || []).length > 0) && (
                <div style={{ marginTop: COL3_GAP, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div style={{ marginBottom: 9 }}><Eyebrow>Tu Copiloto · últimos {copilotMetrics.days || 30} días</Eyebrow></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 9 }}>
                    <div style={{ ...cardStyle, padding: '9px 11px' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--cream)' }}>{copilotMetrics.used}</div>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>sugerencias usadas</div>
                    </div>
                    <div style={{ ...cardStyle, padding: '9px 11px' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: copilotMetrics.response_rate >= 0.5 ? '#1FA06A' : 'var(--cream)' }}>{Math.round((copilotMetrics.response_rate || 0) * 100)}%</div>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>respuesta positiva</div>
                    </div>
                  </div>
                  {(copilotMetrics.top_objeciones || []).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 5 }}>Objeciones más frecuentes de tus leads</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {copilotMetrics.top_objeciones.map((o) => (
                          <span key={o.type} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(242,99,91,0.10)', color: '#F2635B' }}>{o.type} · {o.count}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </>)}
            </>
          )}
        </div>
      </div>

      {/* Ficha completa como MODAL en su lugar (founder: sin sacarte de la bandeja) */}
      {fichaContact && (
        <Ficha360 open contact={fichaContact} user={user}
          onClose={() => setFichaContact(null)} onToast={() => {}} />
      )}

      {/* Adjuntar propiedad · catálogo rankeado (se sube al tablero/ficha al elegir) */}
      {propPicker && (
        <div onClick={() => setPropPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,45,0.45)', zIndex: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 560, maxHeight: '78vh', borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <b style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, color: 'var(--cream)' }}>Adjuntar propiedad</b>
              <div style={{ fontSize: 11.5, color: 'var(--theme-2)', marginTop: 2 }}>Ordenadas por lo que le encaja · al elegir, se suma a su tablero y a la ficha</div>
            </div>
            <div style={{ overflowY: 'auto', padding: '6px 12px 14px' }}>
              {propPicker.loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Cargando catálogo…</div>
              ) : (propPicker.items || []).length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>Sin opciones nuevas (ya tiene todo en el tablero).</div>
              ) : propPicker.items.map((p) => (
                <button key={p.id} type="button" onClick={() => attachProp(p)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 6px', borderBottom: '1px solid var(--border)', background: 'none', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer' }}>
                  {p.match?.score != null && (
                    <div style={{ flexShrink: 0, width: 42, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 14.5, color: p.match.score >= 80 ? '#10b981' : p.match.score >= 65 ? 'var(--theme-2)' : 'var(--cream-3)', lineHeight: 1 }}>{p.match.score}%</div>
                      <div style={{ fontSize: 8.5, color: 'var(--cream-3)', letterSpacing: 0.3, marginTop: 2 }}>MATCH</div>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13.5, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>{p.colonia || 'CDMX'}{p.price_from ? ` · ${fmtMXNlocal(p.price_from)}` : ''}</div>
                    {p.match?.reasons?.[0] && <div style={{ fontSize: 11, color: 'var(--theme-2)', marginTop: 2 }}>✓ {p.match.reasons[0].t}</div>}
                  </div>
                  <span style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme-2)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700 }}>Adjuntar</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Editar perfil de búsqueda + recomendaciones IA al guardar (founder) */}
      {editBusq && (
        <div onClick={() => { setEditBusq(null); setEditRecs(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,45,0.45)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 460, maxHeight: '88vh', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <b style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, color: 'var(--cream)' }}>Editar lo que busca{ctx?.name ? ` · ${ctx.name.split(' ')[0]}` : ''}</b>
              <button type="button" onClick={() => { setEditBusq(null); setEditRecs(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editRecs && (editRecs.recomendaciones || []).length > 0 && (
                <div style={{ borderRadius: 12, background: 'rgba(109,74,255,0.06)', border: '1px solid rgba(109,74,255,0.2)', padding: 12 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--theme-2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><FaRobot size={11} /> La IA detectó el cambio</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {editRecs.recomendaciones.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                        <span style={{ fontSize: 14 }}>{r.icon}</span>
                        <div><b style={{ color: 'var(--cream)' }}>{r.title}.</b> <span style={{ color: 'var(--cream-2)' }}>{r.detail}</span></div>
                      </div>
                    ))}
                  </div>
                  {(editRecs.nuevas_props || []).length > 0 && (
                    <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(109,74,255,0.15)' }}>
                      <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 5 }}>Nuevas coincidencias</div>
                      {editRecs.nuevas_props.map((p, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--cream-2)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span style={{ textTransform: 'capitalize' }}>{p.name} · {p.colonia}</span><b style={{ color: 'var(--theme-2)' }}>{p.score}%</b></div>
                      ))}
                      <button type="button" onClick={() => { setEditBusq(null); setEditRecs(null); setCol3Tab('acciones'); sendGaleria(); }}
                        style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#6D4AFF,#FF5CA8)', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>📸 Mandarle Galería con lo nuevo</button>
                    </div>
                  )}
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>💰 Presupuesto (MXN)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" value={editBusq.precio_min} onChange={(e) => setEditBusq((s) => ({ ...s, precio_min: e.target.value }))} placeholder="Mínimo" style={editInput} />
                  <input type="number" value={editBusq.precio_max} onChange={(e) => setEditBusq((s) => ({ ...s, precio_max: e.target.value }))} placeholder="Máximo" style={editInput} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { k: 'recamaras_min', lb: '🛏️ Recámaras (mín)' },
                  { k: 'banos_min', lb: '🛁 Baños (mín)' },
                  { k: 'estacionamientos_min', lb: '🚗 Estac. (mín)' },
                  { k: 'm2_min', lb: '📐 m² (mín)' },
                ].map((f) => (
                  <div key={f.k}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>{f.lb}</div>
                    <input type="number" value={editBusq[f.k]} onChange={(e) => setEditBusq((s) => ({ ...s, [f.k]: e.target.value }))} style={editInput} />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>📍 Zonas (separadas por coma)</div>
                <input value={editBusq.colonias} onChange={(e) => setEditBusq((s) => ({ ...s, colonias: e.target.value }))} placeholder="Polanco, Condesa, Roma Norte" style={editInput} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--cream-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={editBusq.mascotas} onChange={(e) => setEditBusq((s) => ({ ...s, mascotas: e.target.checked }))} style={{ accentColor: 'var(--theme-2)', width: 16, height: 16 }} /> 🐾 Necesita que acepten mascotas
              </label>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>✨ Amenidades deseadas</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AMEN_OPTS.map((am) => {
                    const on = editBusq.amenidades.includes(am);
                    return (
                      <button key={am} type="button" onClick={() => setEditBusq((s) => ({ ...s, amenidades: on ? s.amenidades.filter((x) => x !== am) : [...s.amenidades, am] }))}
                        style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 11px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--theme-2)' : 'var(--border)'}`, background: on ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: on ? 'var(--theme-2)' : 'var(--cream-2)' }}>{AMEN_LABEL[am] || am}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>🚫 No negociables (uno por línea)</div>
                <textarea value={editBusq.no_negociables} onChange={(e) => setEditBusq((s) => ({ ...s, no_negociables: e.target.value }))} rows={3} placeholder={'Cocina amplia\nEstacionamiento techado'} style={{ ...editInput, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-2)', marginBottom: 6 }}>⏱️ Urgencia</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['baja', 'media', 'alta'].map((u) => (
                    <button key={u} type="button" onClick={() => setEditBusq((s) => ({ ...s, urgencia: u }))}
                      style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', textTransform: 'capitalize', fontSize: 12, fontWeight: 700, border: `1px solid ${editBusq.urgencia === u ? 'var(--theme-2)' : 'var(--border)'}`, background: editBusq.urgencia === u ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: editBusq.urgencia === u ? 'var(--theme-2)' : 'var(--cream-2)' }}>{u}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => { setEditBusq(null); setEditRecs(null); }} style={{ flex: '0 0 auto', padding: '11px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{editRecs ? 'Cerrar' : 'Cancelar'}</button>
              <button type="button" onClick={saveBusqueda} disabled={editSaving} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#6D4AFF,#FF5CA8)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: editSaving ? 'default' : 'pointer', opacity: editSaving ? 0.6 : 1 }}>{editSaving ? 'Guardando…' : '💾 Guardar y recalcular'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5 }}>
      <span style={{ color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ color: color || 'var(--cream)', fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function ConversationInbox(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      {/* B7 · marco claro (.portal-asesor) → los tokens resuelven al tema claro */}
      <div className="portal-asesor">
        <ConversationInboxBody {...props} />
      </div>
    </PortalLayout>
  );
}
