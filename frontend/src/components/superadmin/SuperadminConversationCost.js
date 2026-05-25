// W7.AS.3.F · SuperadminConversationCost — dashboard de costos 3-tier.
// 4 KPI cards + distribución por modelo (Haiku/Sonnet/Opus) + tabla top 10 caras.
// Componente standalone · Terminal D lo registra como route + namespace i18n.
// Aurora design · rounded-full bars. (Sin modal en Round 2; si se añade, usar
// ESC + body-scroll-lock como el resto del sistema.)
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, Building2, User, MessageCircle, RefreshCw, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const BASE = `${API}/api/superadmin/conversation-cost`;
// E.12 fix · tokens var(--theme*) (aurora design system · no hex hardcoded · paridad F11 R1)
const TIER_COLOR = {
  haiku: 'var(--theme-success, #22C55E)',
  sonnet: 'var(--theme-primary, #6366F1)',
  opus: 'var(--theme-accent, #EC4899)',
  other: 'var(--theme-muted-dark, #64748B)',
};

function authHeaders() {
  const t = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function fmtUsd(v) {
  const n = Number(v || 0);
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

export default function SuperadminConversationCost() {
  const { t } = useTranslation('conversation_cost');
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [dist, setDist] = useState(null);
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, dRes, tRes] = await Promise.all([
        fetch(`${BASE}/stats-summary?days=${days}`, { headers: authHeaders() }),
        fetch(`${BASE}/model-distribution?days=${days}`, { headers: authHeaders() }),
        fetch(`${BASE}/top-expensive?days=${days}&limit=10`, { headers: authHeaders() }),
      ]);
      setSummary(sRes.ok ? await sRes.json() : null);
      setDist(dRes.ok ? await dRes.json() : null);
      setTop(tRes.ok ? (await tRes.json()).conversations || [] : []);
    } catch (e) {
      setSummary(null); setDist(null); setTop([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const cards = [
    { key: 'total', Icon: DollarSign, label: t('kpi_total_cost'),
      value: summary ? fmtUsd(summary.total_cost_usd) : '$0', color: 'var(--theme-success, #22C55E)' },
    { key: 'tenant', Icon: Building2, label: t('kpi_top_tenant'),
      value: summary?.top_tenant?.tenant_id || '—',
      sub: summary ? fmtUsd(summary.top_tenant?.cost_usd) : null, color: 'var(--theme-primary, #6366F1)' },
    { key: 'asesor', Icon: User, label: t('kpi_top_asesor'),
      value: summary?.top_asesor?.asesor_id || '—',
      sub: summary ? fmtUsd(summary.top_asesor?.cost_usd) : null, color: 'var(--theme-accent, #EC4899)' },
    { key: 'avg', Icon: MessageCircle, label: t('kpi_avg_convo'),
      value: summary ? fmtUsd(summary.avg_cost_per_convo_usd) : '$0', color: 'var(--theme-warning, #F59E0B)' },
  ];

  const dl = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--cream, #F0EBE0)', padding: '6px 10px', fontSize: 12.5, outline: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ padding: 24, color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <DollarSign size={22} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, margin: 0 }}>{t('title')}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>{t('subtitle')}</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={dl}>
          <option value={7}>{t('days_7')}</option>
          <option value={30}>{t('days_30')}</option>
          <option value={90}>{t('days_90')}</option>
        </select>
        <button type="button" onClick={load} style={{ ...dl, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> {t('refresh')}
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {cards.map(({ key, Icon, label, value, sub, color }) => (
          <div key={key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(240,235,224,0.5)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Icon size={14} color={color} /> {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, color: 'var(--cream, #F0EBE0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
            {sub ? <div style={{ fontSize: 12, color, marginTop: 2 }}>{sub}</div> : null}
          </div>
        ))}
      </div>

      {/* model distribution */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t('model_distribution')}</div>
        {loading ? (
          <span style={{ color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('loading')}
          </span>
        ) : !dist || !dist.distribution || dist.distribution.length === 0 ? (
          <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('empty')}</div>
        ) : (
          <>
            {/* rounded-full stacked bar */}
            <div style={{ display: 'flex', height: 14, borderRadius: 9999, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
              {dist.distribution.map((d) => (
                <div key={d.tier} style={{ width: `${d.pct}%`, background: TIER_COLOR[d.tier] || TIER_COLOR.other }} title={`${d.tier} ${d.pct}%`} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
              {dist.distribution.map((d) => (
                <div key={d.tier} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 9999, background: TIER_COLOR[d.tier] || TIER_COLOR.other, display: 'inline-block' }} />
                  <span style={{ fontWeight: 600 }}>{t(`tier_${d.tier}`, d.tier)}</span>
                  <span style={{ color: 'rgba(240,235,224,0.55)' }}>{d.pct}% · {d.calls} {t('calls')} · {fmtUsd(d.cost_usd)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* top expensive table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t('top_expensive')}</div>
        {loading ? (
          <span style={{ color: 'rgba(240,235,224,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('loading')}
          </span>
        ) : top.length === 0 ? (
          <div style={{ color: 'rgba(240,235,224,0.4)', fontSize: 13 }}>{t('empty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em' }}>
                  <th style={{ padding: '6px 8px' }}>{t('col_conversation')}</th>
                  <th style={{ padding: '6px 8px' }}>{t('col_asesor')}</th>
                  <th style={{ padding: '6px 8px' }}>{t('col_tenant')}</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('col_messages')}</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('col_tokens')}</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('col_cost')}</th>
                  <th style={{ padding: '6px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {top.map((c) => (
                  <tr key={c.conversation_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11.5 }}>{(c.conversation_id || '').slice(0, 16)}</td>
                    <td style={{ padding: '8px' }}>{c.asesor_id || '—'}</td>
                    <td style={{ padding: '8px' }}>{c.tenant_id || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{c.message_count}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{(c.tokens || 0).toLocaleString()}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{fmtUsd(c.cost_usd)}</td>
                    <td style={{ padding: '8px' }}>
                      <a href={`/superadmin/conversations?focus=${c.conversation_id}`}
                        style={{ color: 'var(--theme-primary, #A5B4FC)', textDecoration: 'none', fontSize: 12 }}>{t('view_thread')}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
