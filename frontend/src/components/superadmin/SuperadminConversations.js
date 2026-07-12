// W7.AS.3.A · SuperadminConversations — bandeja tipo Slack (lista + drill-down).
// Filtros: asesor / sentimiento / estado(handoff). Click → detalle + tomar conversación.
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, RefreshCw, Hand, Loader2 } from 'lucide-react';
import SuperadminLayout from './SuperadminLayout';

const API = process.env.REACT_APP_BACKEND_URL || '';
// F11 fix · tokens var(--theme*) en lugar de hex hardcoded (aurora design system).
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

// Auth via cookie httponly (credentials:'include'); sin Bearer/localStorage (XSS).
function authHeaders() {
  return {};
}

export default function SuperadminConversations({ embedded }) {
  const { t } = useTranslation('conversation_round1');
  const [stats, setStats] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [fSentiment, setFSentiment] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fAsesor, setFAsesor] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/superadmin/conversations/stats`, { credentials: 'include', headers: authHeaders() });
      if (res.ok) setStats(await res.json());
    } catch (e) { /* no-op */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fSentiment) qs.set('sentiment', fSentiment);
      if (fStatus) qs.set('status', fStatus);
      if (fAsesor) qs.set('asesor_id', fAsesor);
      const res = await fetch(`${API}/api/superadmin/conversations/list?${qs.toString()}`, { credentials: 'include', headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setList(data.conversations || []);
      }
    } catch (e) { /* no-op */ } finally { setLoading(false); }
  }, [fSentiment, fStatus, fAsesor]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);

  const openConv = useCallback(async (conv) => {
    setSelected(conv.conversation_id);
    setDetail(null);
    try {
      const res = await fetch(`${API}/api/conversation/${conv.conversation_id}`, { credentials: 'include', headers: authHeaders() });
      if (res.ok) setDetail(await res.json());
    } catch (e) { /* no-op */ }
  }, []);

  const takeover = useCallback(async (convId) => {
    try {
      const res = await fetch(`${API}/api/superadmin/conversations/takeover`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ conversation_id: convId }),
      });
      if (res.ok) { await loadList(); openConv({ conversation_id: convId }); }
    } catch (e) { /* no-op */ }
  }, [loadList, openConv]);

  const selectStyle = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--cream, #F0EBE0)', padding: '6px 10px', fontSize: 12.5, outline: 'none',
  };

  return (
    <SuperadminLayout bare={embedded}>
    <div style={{ padding: 24, color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <MessageCircle size={22} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0 }}>{t('inbox.title')}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>{t('inbox.subtitle')}</p>
        </div>
        <button type="button" onClick={() => { loadStats(); loadList(); }}
          style={{ ...selectStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> {t('inbox.refresh')}
        </button>
      </div>

      {/* stats strip */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Stat label={t('inbox.stats_total')} value={stats.total_conversations} />
          <Stat label={t('inbox.stats_active')} value={stats.active} color="var(--theme-success, #22C55E)" />
          <Stat label={t('inbox.stats_handoff')} value={stats.handoff} color="var(--theme-warning, #F59E0B)" />
          <Stat label={t('inbox.stats_negative')} value={stats.negative_sentiment} color="var(--theme-danger, #EF4444)" />
        </div>
      )}

      {/* filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
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

      {/* Slack-style: list | detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, height: 'calc(100vh - 300px)' }}>
        {/* list */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> ...
            </div>
          ) : list.length === 0 ? (
            <div style={{ padding: 24, color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('inbox.empty')}</div>
          ) : list.map((c) => (
            <button key={c.conversation_id} type="button" onClick={() => openConv(c)}
              style={{
                width: '100%', textAlign: 'left', background: selected === c.conversation_id ? 'rgba(99,102,241,0.14)' : 'transparent',
                border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--cream, #F0EBE0)',
                padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{c.lead_id || c.conversation_id.slice(0, 14)}</span>
                <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: STATUS_COLOR[c.status] || '#94A3B8' }}>{t(`status.${c.status}`)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'rgba(240,235,224,0.5)' }}>
                <span>{c.asesor_id || '—'} · {t(`channels.${c.channel}`, c.channel)}</span>
                <span style={{ color: SENTIMENT_COLOR[c.sentiment] || '#94A3B8' }}>● {c.message_count} {t('inbox.messages')}</span>
              </div>
            </button>
          ))}
        </div>

        {/* detail */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13, margin: 'auto' }}>{t('inbox.select_hint')}</div>
          ) : !detail ? (
            <div style={{ color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> ...
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{detail.lead_id || detail.conversation_id}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>
                    {detail.asesor_id || '—'} · <span style={{ color: STATUS_COLOR[detail.status] }}>{t(`status.${detail.status}`)}</span>
                    {detail.taken_over_by ? ` · ${t('inbox.taken_over_by')} ${detail.taken_over_by}` : ''}
                  </div>
                </div>
                {detail.status !== 'taken_over' && detail.status !== 'closed' && (
                  <button type="button" onClick={() => takeover(detail.conversation_id)}
                    style={{ background: 'linear-gradient(135deg,#6366F1,#EC4899)', border: 'none', borderRadius: 9, color: '#fff', padding: '8px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Hand size={14} /> {t('inbox.takeover')}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(detail.messages || []).map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '78%',
                    background: m.role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                    borderRadius: 12, padding: '9px 12px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                  }}>
                    {m.content}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </SuperadminLayout>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
      <div style={{ fontSize: 11.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--cream, #F0EBE0)', marginTop: 2 }}>{value ?? 0}</div>
    </div>
  );
}
