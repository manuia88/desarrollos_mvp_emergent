// W7.AS.3.D · Round 2 · ConversationInbox — bandeja estilo Slack en 3 columnas:
//   1) lista de threads (DISC badge + color sentimiento + alerta handoff) + filtros + search
//   2) hilo abierto: timeline + SentimentHeatmap inline + SuggestedReplies (modo piloto)
//   3) sidebar derecho: info del lead + acciones sugeridas + LiveTakeover
// Degrada con elegancia: lista vacía si DB sin conversaciones o sin permiso.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, RefreshCw, Loader2, Search, AlertTriangle, User } from 'lucide-react';
import SentimentHeatmap from '../../components/conversation/SentimentHeatmap';
import SuggestedReplies from '../../components/conversation/SuggestedReplies';
import LiveTakeover from '../../components/conversation/LiveTakeover';
import ConfidenceIndicator from '../../components/conversation/ConfidenceIndicator';
import PortalLayout from '../../components/shared/PortalLayout';

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

// B6 · Caja de respuesta para hilos de WhatsApp (con "Redactar con IA" · reusa B5.5.2)
function WaCompose({ onSend, onDraft, drafting, disabled }) {
  const [text, setText] = useState('');
  const send = async () => { const tt = text.trim(); if (!tt) return; await onSend(tt); setText(''); };
  const draft = async () => { const d = await onDraft(); if (d) setText(d); };
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <button type="button" onClick={draft} disabled={drafting}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', marginBottom: 8, borderRadius: 7, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: 'var(--theme-primary, #818CF8)', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700, cursor: drafting ? 'default' : 'pointer' }}>
        ✨ {drafting ? 'Redactando…' : 'Redactar con IA'}
      </button>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} disabled={disabled}
          placeholder="Escribe por WhatsApp…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, resize: 'none', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none' }} />
        <button type="button" onClick={send} disabled={disabled || !text.trim()}
          style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, border: 'none', background: '#25D366', color: '#0b1f12', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 800, cursor: (disabled || !text.trim()) ? 'default' : 'pointer', opacity: (disabled || !text.trim()) ? 0.5 : 1 }}>
          Enviar →
        </button>
      </div>
    </div>
  );
}

function ConversationInboxBody() {
  const { t } = useTranslation(['conversation_round2_ui', 'conversation_confidence']);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confSummary, setConfSummary] = useState(null); // W7.AS.3.H · confidence-history del hilo
  const [fSentiment, setFSentiment] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fChannel, setFChannel] = useState('');   // B6 · WhatsApp / IA
  const [search, setSearch] = useState('');
  const [curConv, setCurConv] = useState(null);    // B6 · conv seleccionada (canal + lead_id)
  const [ctx, setCtx] = useState(null);            // B6 · contexto del lead (gusto + siguiente paso)
  const [drafting, setDrafting] = useState(false); // B6 · draft IA (reusa B5.5.2)

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fChannel) qs.set('channel', fChannel);
      // B6 · bandeja UNIFICADA — WhatsApp (B5.5) + chats IA en una lista, con nombre + canal.
      const res = await fetch(`${API}/api/asesor/conversations/unified?${qs.toString()}`, { headers: authHeaders(), credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data.conversations) ? data.conversations : []);
      } else {
        setList([]);
      }
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [fChannel]);

  useEffect(() => { loadList(); }, [loadList]);

  // B6 · mapea el hilo de WhatsApp (B5.5) al shape del detalle del inbox
  const _waToDetail = (leadId, d) => ({
    channel: 'whatsapp', lead_id: leadId, status: 'active',
    messages: (d.messages || []).map((m) => ({ role: m.direction === 'outbound' ? 'asesor' : 'user', content: m.text })),
  });

  const openThread = useCallback(async (conv) => {
    setSelected(conv.conversation_id);
    setCurConv(conv);
    setDetail(null);
    setConfSummary(null);
    setCtx(null);
    setDetailLoading(true);
    const isWa = conv.channel === 'whatsapp';
    try {
      if (isWa) {
        const r = await fetch(`${API}/api/asesor/contactos/${conv.lead_id}/whatsapp`, { headers: authHeaders(), credentials: 'include' });
        if (r.ok) setDetail(_waToDetail(conv.lead_id, await r.json()));
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
    if (!isWa) {
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
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!curConv) return;
    try {
      if (curConv.channel === 'whatsapp') {
        const r = await fetch(`${API}/api/asesor/contactos/${curConv.lead_id}/whatsapp`, { headers: authHeaders(), credentials: 'include' });
        if (r.ok) setDetail(_waToDetail(curConv.lead_id, await r.json()));
      } else {
        const res = await fetch(`${API}/api/conversation/${curConv.conversation_id}`, { headers: authHeaders() });
        if (res.ok) setDetail(await res.json());
      }
    } catch { /* no-op */ }
  }, [curConv]);

  const sendAsAsesor = useCallback(async (text) => {
    if (!curConv || !text) return;
    try {
      if (curConv.channel === 'whatsapp') {
        const res = await fetch(`${API}/api/asesor/contactos/${curConv.lead_id}/whatsapp`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, credentials: 'include',
          body: JSON.stringify({ text }),
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

  const filtered = useMemo(() => {
    let l = list;
    if (fSentiment) l = l.filter((c) => c.sentiment === fSentiment);
    if (fStatus) l = l.filter((c) => c.status === fStatus);
    const q = search.trim().toLowerCase();
    if (q) l = l.filter((c) =>
      `${c.lead_name || ''} ${c.lead_id || ''} ${c.last_message || ''} ${c.asesor_id || ''}`.toLowerCase().includes(q));
    return l;
  }, [list, search, fSentiment, fStatus]);

  const lastUserMessage = useMemo(() => {
    const msgs = (detail && detail.messages) || [];
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === 'user') return msgs[i].content || '';
    }
    return '';
  }, [detail]);

  const selectStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--cream, #F0EBE0)', padding: '6px 10px', fontSize: 12.5, outline: 'none',
  };
  const canTakeover = detail && detail.status !== 'taken_over' && detail.status !== 'closed';

  return (
    <div style={{ padding: 24, color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <MessageSquare size={22} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0 }}>{t('inbox.title')}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>{t('inbox.subtitle')}</p>
        </div>
        <button type="button" onClick={loadList}
          style={{ ...selectStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> {t('inbox.refresh')}
        </button>
      </div>

      {/* filters + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...selectStyle, padding: '0 10px', flex: '1 1 220px' }}>
          <Search size={14} style={{ color: 'rgba(240,235,224,0.5)' }} />
          <input placeholder={t('inbox.search')} value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--cream, #F0EBE0)', fontSize: 12.5, padding: '7px 0', width: '100%' }} />
        </div>
        <select value={fChannel} onChange={(e) => setFChannel(e.target.value)} style={selectStyle}>
          <option value="">Canal: todos</option>
          <option value="whatsapp">💬 WhatsApp</option>
          <option value="ai">🤖 Chat IA</option>
        </select>
        <select value={fSentiment} onChange={(e) => setFSentiment(e.target.value)} style={selectStyle}>
          <option value="">{t('inbox.filter_sentiment')}: {t('inbox.all')}</option>
          <option value="positive">{t('sentiment.positive')}</option>
          <option value="neutral">{t('sentiment.neutral')}</option>
          <option value="negative">{t('sentiment.negative')}</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={selectStyle}>
          <option value="">{t('inbox.filter_status')}: {t('inbox.all')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="handoff">{t('status.handoff')}</option>
          <option value="closed">{t('status.closed')}</option>
        </select>
      </div>

      {/* 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 300px', gap: 14, height: 'calc(100vh - 270px)' }}>
        {/* col 1 · threads */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> …
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('inbox.empty')}</div>
          ) : filtered.map((c) => (
            <button key={c.conversation_id} type="button" onClick={() => openThread(c)}
              style={{
                width: '100%', textAlign: 'left',
                background: selected === c.conversation_id ? 'rgba(99,102,241,0.14)' : 'transparent',
                border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--cream, #F0EBE0)',
                padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span title={c.channel === 'whatsapp' ? 'WhatsApp' : 'Chat IA'}>{c.channel === 'whatsapp' ? '💬' : '🤖'}</span>
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
                <div style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(240,235,224,0.45)' }}>
                <span>{c.channel === 'whatsapp' ? 'WhatsApp' : (c.asesor_id || 'Chat IA')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {c.status === 'handoff' && <AlertTriangle size={12} style={{ color: STATUS_COLOR.handoff }} />}
                  <span style={{ color: SENTIMENT_COLOR[c.sentiment] || SENTIMENT_COLOR.neutral }}>●</span>
                  {c.message_count || 0} {t('inbox.messages')}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* col 2 · thread */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ margin: 'auto', color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('inbox.select_hint')}</div>
          ) : detailLoading || !detail ? (
            <div style={{ margin: 'auto', color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> …
            </div>
          ) : (
            <>
              <SentimentHeatmap messages={detail.messages || []} />
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
                {(detail.messages || []).map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                    background: m.role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
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
              {detail.channel === 'whatsapp' ? (
                <WaCompose onSend={sendAsAsesor} onDraft={draftReply} drafting={drafting} disabled={detail.status === 'closed'} />
              ) : (
                <SuggestedReplies lastUserMessage={lastUserMessage} onSend={sendAsAsesor}
                  disabled={detail.status === 'closed'} />
              )}
            </>
          )}
        </div>

        {/* col 3 · lead info + actions */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, overflowY: 'auto' }}>
          {!detail ? (
            <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('inbox.col_info')}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <User size={16} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{t('inbox.lead_info')}</span>
              </div>
              <InfoRow label="Lead" value={detail.lead_id || t('inbox.no_lead')} />
              <InfoRow label="Asesor" value={detail.asesor_id || '—'} />
              <InfoRow label={t('inbox.channel')} value={detail.channel || '—'} />
              <InfoRow label={t('inbox.filter_status')} value={t(`status.${detail.status}`, detail.status)}
                color={STATUS_COLOR[detail.status]} />
              <InfoRow label={t('inbox.filter_sentiment')} value={t(`sentiment.${detail.sentiment}`, detail.sentiment)}
                color={SENTIMENT_COLOR[detail.sentiment]} />
              {detail.taken_over_by && <InfoRow label={t('inbox.taken_over_by')} value={detail.taken_over_by} />}

              {/* B6 · contexto del lead: siguiente paso + perfil de gusto (B5.4) */}
              {ctx?.brief?.next_step && (
                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--theme-primary, #818CF8)', marginBottom: 3 }}>🧭 Siguiente paso</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--cream, #F0EBE0)' }}>{ctx.brief.next_step.text}</div>
                </div>
              )}
              {ctx?.taste && ((ctx.taste.rooms || []).length > 0 || (ctx.taste.features || []).length > 0) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(240,235,224,0.5)', marginBottom: 7 }}>
                    Perfil de gusto {ctx.taste.confidence_label ? `· confianza ${ctx.taste.confidence_label}` : ''}
                  </div>
                  {ctx.taste.summary && <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.8)', marginBottom: 8, lineHeight: 1.45 }}>{ctx.taste.summary}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {(ctx.taste.rooms || []).slice(0, 4).map((r) => (
                      <span key={r.room} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.14)', color: 'var(--theme-primary, #818CF8)' }}>{r.label} {r.score}%</span>
                    ))}
                    {(ctx.taste.features || []).slice(0, 3).map((f) => (
                      <span key={f.key} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(240,235,224,0.75)' }}>{f.label}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* W7.AS.3.H · resumen de confianza IA del hilo (confidence-history) */}
              {confSummary && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(240,235,224,0.5)', marginBottom: 8 }}>
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

              <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(240,235,224,0.5)', marginBottom: 10 }}>
                  {t('inbox.suggested_actions')}
                </div>
                {canTakeover ? (
                  <LiveTakeover conversationId={detail.conversation_id} onTakenOver={() => { loadList(); refreshDetail(); }} />
                ) : (
                  <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.4)' }}>—</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5 }}>
      <span style={{ color: 'rgba(240,235,224,0.5)' }}>{label}</span>
      <span style={{ color: color || 'var(--cream, #F0EBE0)', fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function ConversationInbox(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <ConversationInboxBody {...props} />
    </PortalLayout>
  );
}
