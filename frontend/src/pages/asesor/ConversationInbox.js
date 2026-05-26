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

export default function ConversationInbox() {
  const { t } = useTranslation('conversation_round2_ui');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fSentiment, setFSentiment] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fAsesor, setFAsesor] = useState('');
  const [search, setSearch] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fSentiment) qs.set('sentiment', fSentiment);
      if (fStatus) qs.set('status', fStatus);
      if (fAsesor) qs.set('asesor_id', fAsesor);
      const res = await fetch(`${API}/api/superadmin/conversations/list?${qs.toString()}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data.conversations) ? data.conversations : []);
      } else {
        setList([]); // 403 (asesor) o error → bandeja vacía, sin romper
      }
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [fSentiment, fStatus, fAsesor]);

  useEffect(() => { loadList(); }, [loadList]);

  const openThread = useCallback(async (conv) => {
    setSelected(conv.conversation_id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API}/api/conversation/${conv.conversation_id}`, { headers: authHeaders() });
      if (res.ok) setDetail(await res.json());
    } catch {
      /* no-op */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await fetch(`${API}/api/conversation/${selected}`, { headers: authHeaders() });
      if (res.ok) setDetail(await res.json());
    } catch { /* no-op */ }
  }, [selected]);

  const sendAsAsesor = useCallback(async (text) => {
    if (!selected || !text) return;
    try {
      const res = await fetch(`${API}/api/conversation/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ conversation_id: selected, message: text, role: 'asesor' }),
      });
      if (res.ok) await refreshDetail();
    } catch { /* no-op */ }
  }, [selected, refreshDetail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      `${c.lead_id || ''} ${c.asesor_id || ''} ${c.conversation_id || ''}`.toLowerCase().includes(q));
  }, [list, search]);

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
        <input placeholder={t('inbox.filter_asesor')} value={fAsesor} onChange={(e) => setFAsesor(e.target.value)} style={selectStyle} />
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
                <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.lead_id || (c.conversation_id || '').slice(0, 14)}
                </span>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
                  {(c.disc_tier || c.disc_tone) && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'rgba(99,102,241,0.2)', color: 'var(--theme-primary, #818CF8)' }}>
                      {c.disc_tier || c.disc_tone}
                    </span>
                  )}
                  <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: STATUS_COLOR[c.status] || SENTIMENT_COLOR.neutral }}>
                    {t(`status.${c.status}`, c.status)}
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'rgba(240,235,224,0.5)' }}>
                <span>{c.asesor_id || '—'}</span>
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
              <SuggestedReplies lastUserMessage={lastUserMessage} onSend={sendAsAsesor}
                disabled={detail.status === 'closed'} />
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
