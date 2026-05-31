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
  closed: 'var(--theme-muted-dark, #64748B)',
};

function authHeaders() {
  const tk = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return tk ? { Authorization: `Bearer ${tk}` } : {};
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
  const fileRef = useRef(null);
  const acceptRef = useRef('image/*');
  useEffect(() => { if (seed) setText(seed); }, [seed]);  // "Usar" desde la IA en vivo llena la caja
  const send = async () => {
    let tt = text.trim();
    if (attached) tt = (tt ? tt + '\n' : '') + `📎 ${attached.name}`;
    if (!tt) return;
    await onSend(tt); setText(''); setAttached(null);
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
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} disabled={disabled}
          placeholder="Escribe tu mensaje…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, resize: 'none', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none' }} />
        <button type="button" onClick={send} disabled={disabled || (!text.trim() && !attached)}
          style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, border: 'none', background: '#25D366', color: '#0b1f12', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 800, cursor: (disabled || (!text.trim() && !attached)) ? 'default' : 'pointer', opacity: (disabled || (!text.trim() && !attached)) ? 0.5 : 1 }}>
          Enviar →
        </button>
      </div>
    </div>
  );
}

function ConversationInboxBody({ user }) {
  const { t } = useTranslation(['conversation_round2_ui', 'conversation_confidence']);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confSummary, setConfSummary] = useState(null); // W7.AS.3.H · confidence-history del hilo
  const [search, setSearch] = useState('');
  const [curConv, setCurConv] = useState(null);    // B6 · conv seleccionada (canal + lead_id)
  const [ctx, setCtx] = useState(null);            // B6 · contexto del lead (gusto + siguiente paso)
  const [convAI, setConvAI] = useState(null);      // Pieza 1 · IA en vivo (ánimo + objeción + recomendación + NBA)
  const [composeSeed, setComposeSeed] = useState(null); // Pieza 1 · "Usar" llena la caja de escribir
  const [propPicker, setPropPicker] = useState(null);   // Adjuntar propiedad · catálogo {loading, items}
  const [atlaxCh, setAtlaxCh] = useState({});           // Pieza 2 · Atlax auto por canal {whatsapp:true,...}
  const [col3Tab, setCol3Tab] = useState('acciones');   // col3 · pestañas: acciones | ia | perfil
  const [aiSug, setAiSug] = useState(false);            // ✨ sugerencia IA cargando
  const [remind, setRemind] = useState(false);          // recordatorio en tarea/cita
  const [galBusy, setGalBusy] = useState(false);        // 📸 enviando Galería Personalizada
  const [agentsBusy, setAgentsBusy] = useState(false);  // ↻ corriendo los agentes ahora
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
    try {
      // B6 · bandeja UNIFICADA — WhatsApp (B5.5) + chats IA en una lista (los segmentos filtran en cliente).
      const res = await fetch(`${API}/api/asesor/conversations/unified`, { headers: authHeaders(), credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data.conversations) ? data.conversations : []);
        setStats(data.stats || null);
      } else {
        setList([]); setStats(null);
      }
    } catch {
      setList([]); setStats(null);
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
        const res = await fetch(`${API}/api/conversation/${conv.conversation_id}`, { headers: authHeaders() });
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
        const cr = await fetch(`${API}/api/conversation/${conv.conversation_id}/confidence-history`, { headers: authHeaders() });
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
        const res = await fetch(`${API}/api/conversation/${curConv.conversation_id}`, { headers: authHeaders() });
        if (res.ok) setDetail(await res.json());
      }
    } catch { /* no-op */ }
  }, [curConv]);

  const sendAsAsesor = useCallback(async (text) => {
    if (!curConv || !text) return;
    try {
      if (DM.includes(curConv.channel)) {
        const res = await fetch(`${API}/api/asesor/contactos/${curConv.lead_id}/whatsapp`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ text, channel: curConv.channel }),
        });
        if (res.ok) await refreshDetail();
      } else {
        const res = await fetch(`${API}/api/conversation/message`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ conversation_id: curConv.conversation_id, message: text, role: 'asesor' }),
        });
        if (res.ok) await refreshDetail();
      }
    } catch { /* no-op */ }
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
      try {
        await fetch(`${API}/api/asesor/contactos/${lid}/board`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ dev_id: p.id, name: p.name, price_from: p.price_from, colonia: p.colonia }),
        });
      } catch { /* no-op */ }
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
          <input placeholder={t('inbox.search')} value={search} onChange={(e) => setSearch(e.target.value)}
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
              <SentimentHeatmap messages={detail.messages || []} />
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
                  {/* Pieza 1 · COPILOTO EN VIVO: ánimo + qué hacer ahora (objeción/galería/propiedad/cierre) + propiedad afín */}
                  {convAI && (convAI.animo || convAI.nba || convAI.recomendacion) && (
                    <div style={{ marginBottom: 8, borderRadius: 12, background: 'rgba(109,74,255,0.05)', border: '1px solid rgba(109,74,255,0.18)', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderBottom: '1px solid rgba(109,74,255,0.12)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--theme-2)' }}>
                        <FaRobot size={11} /> Copiloto en vivo
                      </div>
                      <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {convAI.animo && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <span style={{ fontSize: 15, lineHeight: 1 }}>{convAI.animo.sentiment === 'negativo' ? '😟' : convAI.animo.sentiment === 'positivo' ? '😊' : '😐'}</span>
                            <span style={{ color: 'var(--cream-2)' }}>El cliente suena <b style={{ color: convAI.animo.sentiment === 'negativo' ? '#F2635B' : convAI.animo.sentiment === 'positivo' ? '#1FA06A' : 'var(--cream)' }}>{convAI.animo.label.toLowerCase()}</b><span style={{ color: 'var(--cream-3)' }}> · según sus mensajes</span></span>
                          </div>
                        )}
                        {convAI.nba && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, padding: '8px 9px', borderRadius: 9, background: convAI.nba.action_type === 'objecion' ? 'rgba(242,99,91,0.07)' : 'rgba(99,102,241,0.07)', border: `1px solid ${convAI.nba.action_type === 'objecion' ? 'rgba(242,99,91,0.20)' : 'rgba(99,102,241,0.18)'}` }}>
                            <span style={{ fontSize: 15, lineHeight: 1 }}>{convAI.nba.action_type === 'objecion' ? '🛡️' : '🧭'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: 'var(--cream)', fontWeight: 700 }}>{convAI.nba.title}{convAI.nba.urgency === 'alta' && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#F2635B', background: 'rgba(242,99,91,0.14)', padding: '1px 6px', borderRadius: 999 }}>urgente</span>}</div>
                              <div style={{ color: 'var(--cream-3)', fontSize: 10.5, marginTop: 2, lineHeight: 1.4 }}>{convAI.nba.why}</div>
                            </div>
                            <button type="button" onClick={() => doNba(convAI.nba.action_type)}
                              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg,#6D4AFF,#FF5CA8)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(109,74,255,0.28)' }}>{convAI.nba.cta}</button>
                          </div>
                        )}
                        {convAI.recomendacion && convAI.nba && convAI.nba.action_type !== 'afinar_gusto' && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
                            <span style={{ fontSize: 15, lineHeight: 1 }}>🎯</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: 'var(--cream-2)' }}>Propiedad más afín: <b style={{ color: 'var(--cream)' }}>{convAI.recomendacion.name}</b> <span style={{ color: 'var(--theme-2)', fontWeight: 800 }}>{convAI.recomendacion.match}%</span></div>
                              <div style={{ color: 'var(--cream-3)', fontSize: 10.5, marginTop: 2, lineHeight: 1.4 }}>{convAI.recomendacion.reason || 'Por su gusto y presupuesto.'}</div>
                            </div>
                            <button type="button" onClick={() => setComposeSeed(`Hola! Creo que ${convAI.recomendacion.name}${convAI.recomendacion.colonia ? ` en ${convAI.recomendacion.colonia}` : ''} te va a encantar — va con lo que buscas. ¿Te la mando? 🙌`)}
                              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Enviar</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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

              {/* Tabs (founder: 3 pestañas para no encimar) */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
                {[{ k: 'acciones', l: '⚡ Acciones' }, { k: 'ia', l: '🤖 IA' }, { k: 'perfil', l: '👤 Perfil' }].map((tb) => (
                  <button key={tb.k} type="button" onClick={() => setCol3Tab(tb.k)}
                    style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, background: col3Tab === tb.k ? 'var(--surface)' : 'transparent', color: col3Tab === tb.k ? 'var(--theme-2)' : 'var(--cream-3)', boxShadow: col3Tab === tb.k ? '0 1px 3px rgba(20,16,40,0.1)' : 'none' }}>{tb.l}</button>
                ))}
              </div>

              {/* ═══ TAB: ACCIONES ═══ */}
              {col3Tab === 'acciones' && (<>
              {/* Fila de CREAR (founder: poder agregar tareas/notas/citas) */}
              <div style={{ display: 'flex', gap: 6, marginBottom: addForm ? 8 : 12, flexWrap: 'wrap' }}>
                {[{ k: 'tarea', l: 'Tarea', Icon: ClipboardList }, { k: 'nota', l: 'Nota', Icon: FileText }, { k: 'cita', l: 'Cita', Icon: CalendarDays }].map((b) => (
                  <button key={b.k} type="button" onClick={() => { setAddForm(addForm === b.k ? null : b.k); setAddText(''); setAddDate(''); }}
                    style={{ flex: '1 1 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 4px', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, border: `1px solid ${addForm === b.k ? 'var(--theme-2)' : 'var(--border)'}`, background: addForm === b.k ? 'rgba(var(--theme-rgb),0.10)' : 'var(--surface)', color: addForm === b.k ? 'var(--theme-2)' : 'var(--cream-2)' }}><b.Icon size={13} /> {b.l}</button>
                ))}
                <button type="button" onClick={() => dispatchCopilotToggle('open')} title="Pregúntale al Copiloto"
                  style={{ flexShrink: 0, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.10)', color: 'var(--theme-primary, #818CF8)', display: 'inline-flex', alignItems: 'center' }}><FaRobot size={14} /></button>
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

              {/* Práctico del día: próxima cita + tareas pendientes (founder) */}
              {ctx?.proxima_cita && (
                <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(31,160,106,0.08)', border: '1px solid rgba(31,160,106,0.25)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: '#1FA06A', marginBottom: 3 }}>📅 Próxima cita</div>
                  <div style={{ fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>{ctx.proxima_cita.titulo}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--cream-2)', marginTop: 2 }}>{(ctx.proxima_cita.datetime || '').replace('T', ' · ').slice(0, 19)}</div>
                </div>
              )}
              {(ctx?.tareas || []).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cream-3)', marginBottom: 7 }}>✅ Tareas pendientes ({ctx.tareas.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ctx.tareas.map((tk) => (
                      <div key={tk.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--theme-2)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--cream)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk.titulo}</span>
                        {tk.due_at && <span style={{ fontSize: 10.5, color: 'var(--cream-3)', flexShrink: 0 }}>{String(tk.due_at).slice(5, 10)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Accesos directos: Galería Personalizada (principal) · adjuntar propiedad · WhatsApp */}
              {(detail.lead_id || curConv?.lead_id) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 1 }}>Enviar al cliente</div>
                  {/* Galería Personalizada (link de swipe · founder: botón para enviar propiedades) */}
                  <button type="button" onClick={sendGaleria} disabled={galBusy}
                    style={{ padding: '12px 14px', borderRadius: 12, border: 'none', background: galBusy ? 'var(--surface-2)' : 'linear-gradient(135deg,#6D4AFF,#FF5CA8)', color: galBusy ? 'var(--cream-3)' : '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 800, cursor: galBusy ? 'default' : 'pointer', textAlign: 'left', boxShadow: galBusy ? 'none' : '0 8px 20px rgba(109,74,255,0.28)', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 16 }}>📸</span>
                    <span style={{ flex: 1 }}>{galBusy ? 'Creando link…' : 'Enviar Galería Personalizada'}</span>
                    <span style={{ fontSize: 11 }}>→</span>
                  </button>
                  <div style={{ fontSize: 10.5, color: 'var(--cream-3)', lineHeight: 1.4, marginTop: -2, marginBottom: 3 }}>El cliente desliza 👍/👎 · cada deslizada afina su gusto y vuelve a su tablero.</div>
                  {DM.includes(detail.channel) && (
                    <button type="button" onClick={openPropPicker}
                      style={{ padding: '10px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>🏠 Adjuntar una propiedad</button>
                  )}
                  {ctx?.phone && (
                    <a href={`https://wa.me/${String(ctx.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                      style={{ padding: '10px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'block' }}>📲 Abrir WhatsApp del cliente</a>
                  )}
                </div>
              )}
              </>)}

              {/* ═══ TAB: IA ═══ */}
              {col3Tab === 'ia' && (<>
              {/* Pieza 3 · los 5 AGENTES (autónomos · dejan pendientes aquí y en tu Inicio) */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cream-3)' }}>🤖 Tus agentes sugieren</div>
                  <button type="button" onClick={runAgents} disabled={agentsBusy} style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: agentsBusy ? 'var(--cream-3)' : 'var(--theme-2)', cursor: agentsBusy ? 'default' : 'pointer' }}>{agentsBusy ? 'Corriendo…' : '↻ Correr'}</button>
                </div>
                {(ctx?.agent_actions || []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ctx.agent_actions.map((a) => (
                      <div key={a.id} style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(var(--theme-rgb),0.07)', border: '1px solid rgba(var(--theme-rgb),0.18)' }}>
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--theme-2)', marginBottom: 2 }}>{a.agent_label}</div>
                        <div style={{ fontSize: 12, color: 'var(--cream)', lineHeight: 1.4 }}>{a.title}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                          <button type="button" onClick={() => doAgentAction(a)} style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: 'none', background: 'var(--theme-2)', color: '#fff', cursor: 'pointer' }}>Convertir en tarea</button>
                          <button type="button" onClick={() => dispatchCopilotToggle('open')} style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream-2)', cursor: 'pointer' }}>Copiloto</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.45, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-2)', border: '1px dashed var(--border)' }}>Sin pendientes de los agentes para este lead. Corren solos cada pocas horas; toca ↻ Correr para revisarlo ahora.</div>
                )}
                <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 7, lineHeight: 1.4 }}>Tus 5 agentes (prospección, seguimiento, cierre, análisis y coach) revisan tus leads en automático y dejan pendientes aquí y en tu <b>Inicio</b>.</div>
              </div>

              {/* B6 · contexto del lead: siguiente paso + perfil de gusto (B5.4) */}
              {ctx?.brief?.next_step && (
                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--theme-primary, #818CF8)', marginBottom: 3 }}>🧭 Siguiente paso</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--cream)' }}>{ctx.brief.next_step.text}</div>
                </div>
              )}
              </>)}

              {/* ═══ TAB: PERFIL ═══ */}
              {col3Tab === 'perfil' && (<>
              {ctx?.taste && ((ctx.taste.rooms || []).length > 0 || (ctx.taste.features || []).length > 0) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cream-3)', marginBottom: 7 }}>
                    Perfil de gusto {ctx.taste.confidence_label ? `· confianza ${ctx.taste.confidence_label}` : ''}
                  </div>
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
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cream-3)', marginBottom: 5 }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Probabilidad de cierre</span>
                    <b style={{ color: 'var(--cream)' }}>{Math.round(ctx.close_probability)}%</b>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, ctx.close_probability))}%`, background: ctx.close_probability >= 60 ? '#1FA06A' : ctx.close_probability >= 35 ? '#E2982E' : '#F2635B' }} />
                  </div>
                </div>
              )}

              {/* B7+ · estado del tablero de propiedades */}
              {ctx?.board && Object.keys(ctx.board).length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cream-3)', marginBottom: 7 }}>Tablero · {ctx.board_count} propiedades</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {Object.entries(ctx.board).map(([st, n]) => (
                      <span key={st} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--cream-2)' }}>{BOARD_LABEL[st] || st}: <b style={{ color: 'var(--cream)' }}>{n}</b></span>
                    ))}
                  </div>
                </div>
              )}
              </>)}

              {/* IA (cont.) · confianza del hilo + interruptor Atlax */}
              {col3Tab === 'ia' && (<>
              {/* W7.AS.3.H · resumen de confianza IA del hilo (confidence-history) */}
              {confSummary && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cream-3)', marginBottom: 8 }}>
                    {t('conversation_confidence:history.title', 'Confianza IA del hilo')}
                  </div>
                  <InfoRow label={t('conversation_confidence:history.avg', 'Promedio')}
                    value={confSummary.avg_confidence != null ? `${confSummary.avg_confidence}%` : '—'}
                    color={confSummary.avg_confidence != null && confSummary.avg_confidence < 50 ? SENTIMENT_COLOR.negative : SENTIMENT_COLOR.positive} />
                  {confSummary.last_confidence != null && (
                    <InfoRow label={t('conversation_confidence:history.last', 'Última')} value={`${confSummary.last_confidence}%`} />
                  )}
                  <InfoRow label={t('conversation_confidence:history.low_turns', 'Turnos de baja confianza')}
                    value={confSummary.low_confidence_turns ?? 0}
                    color={(confSummary.low_confidence_turns || 0) > 0 ? STATUS_COLOR.handoff : undefined} />
                </div>
              )}

              {/* Pieza 2 · interruptor de Atlax (piloto del agente) · scopeado al canal correcto */}
              <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cream-3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FaRobot size={13} style={{ color: '#5B37E0' }} /> Atlax · piloto del agente
                </div>
                {detail.channel === 'ai' ? (
                  canTakeover ? (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1FA06A' }} /> <b style={{ color: 'var(--cream)' }}>Auto</b> · Atlax está contestando solo
                      </div>
                      <LiveTakeover conversationId={detail.conversation_id} onTakenOver={() => { loadList(); refreshDetail(); }} />
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E2982E' }} /> <b style={{ color: 'var(--cream)' }}>Manual</b> · la llevas tú
                    </div>
                  )
                ) : (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--cream-2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: atlaxCh[detail.channel] ? '#1FA06A' : '#E2982E' }} />
                      <b style={{ color: 'var(--cream)' }}>{atlaxCh[detail.channel] ? 'Auto' : 'Manual'}</b> · {atlaxCh[detail.channel] ? `Atlax atiende ${CHANNEL_NAME[detail.channel]} en automático` : 'la llevas tú'}
                    </div>
                    <button type="button" onClick={() => toggleAtlax(detail.channel)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 700,
                        background: atlaxCh[detail.channel] ? 'var(--surface-2)' : '#5B37E0', color: atlaxCh[detail.channel] ? 'var(--cream-2)' : '#fff', border: atlaxCh[detail.channel] ? '1px solid var(--border)' : 'none' }}>
                      {atlaxCh[detail.channel] ? 'Pasar a Manual' : '⚡ Activar Atlax (Auto)'}
                    </button>
                    <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 6, lineHeight: 1.45 }}>
                      {atlaxCh[detail.channel]
                        ? `Atlax contestará solo en ${CHANNEL_NAME[detail.channel]} en cuanto conectes el canal (Conversaciones IA → Conectar canales).`
                        : `Actívalo y Atlax atenderá ${CHANNEL_NAME[detail.channel]} por ti cuando el canal esté conectado.`}
                    </div>
                  </div>
                )}
              </div>
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
        <div onClick={() => setPropPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,40,0.45)', zIndex: 90, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
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
