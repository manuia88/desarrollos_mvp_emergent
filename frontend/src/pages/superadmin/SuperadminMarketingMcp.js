/**
 * W6.MOV.4 · Superadmin Marketing Distribution MCP dashboard.
 *
 * KPIs strip + 4 platform status cards + publish form + history table.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import {
  getMcpStats,
  getMcpHistory,
  publishMcp,
  scheduleMcp,
  cancelScheduledMcp,
} from '../../api/marketingMcp';

const CREAM = '#F0EBE0';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const PLATFORMS = ['twitter', 'linkedin', 'telegram', 'discord'];

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}
function fmtDt(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('es-MX'); } catch { return s; }
}

const card = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};
const kpi = {
  padding: 16, borderRadius: 14,
  background: 'rgba(99,102,241,0.06)',
  border: '1px solid rgba(99,102,241,0.18)',
};
const pillBase = {
  padding: '4px 10px', borderRadius: 9999, fontSize: 11,
  fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
};
const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 12,
  background: 'rgba(240,235,224,0.06)', border: '1px solid rgba(240,235,224,0.12)',
  color: CREAM, fontSize: 14, boxSizing: 'border-box',
};

export default function SuperadminMarketingMcp({ embedded }) {
  const { t } = useTranslation('common');
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    text: '',
    platforms: ['twitter', 'linkedin'],
    scheduled_at: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, h] = await Promise.all([getMcpStats(), getMcpHistory({ days: 30, limit: 50 })]);
      setStats(s);
      setHistory(h?.items || []);
    } catch (e) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePlatform = (p) => {
    setForm((f) => {
      const has = f.platforms.includes(p);
      return { ...f, platforms: has ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] };
    });
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!form.text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (form.scheduled_at) {
        await scheduleMcp({
          text: form.text,
          platforms: form.platforms,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
        });
      } else {
        await publishMcp({ text: form.text, platforms: form.platforms });
      }
      setForm({ text: '', platforms: form.platforms, scheduled_at: '' });
      await load();
    } catch (er) {
      setError(er?.message || 'publish_failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (sid) => {
    setBusy(true);
    try {
      await cancelScheduledMcp(sid);
      await load();
    } catch (er) {
      setError(er?.message || 'cancel_failed');
    } finally {
      setBusy(false);
    }
  };

  const adapters = stats?.adapters || {};
  const byPlat = useMemo(() => stats?.by_platform || {}, [stats]);
  const totalOk = useMemo(
    () => PLATFORMS.reduce((sum, p) => sum + ((byPlat[p] && byPlat[p].ok) || 0), 0),
    [byPlat],
  );

  return (
    <SuperadminLayout bare={embedded}>
      <div data-testid="superadmin-mcp-page" style={{ padding: 24, fontFamily: 'DM Sans, sans-serif', color: CREAM }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text',
          }}>
            DesarrollosMX · Crecimiento
          </div>
          <h1 style={{ margin: '6px 0 4px', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('marketingMcp.title', 'Marketing Distribution MCP')}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t('marketingMcp.subtitle', '4 platforms · stub-aware · cache 24h · audit inmutable')}
          </div>
        </header>

        {error && (
          <div style={{ ...card, borderColor: 'rgba(236,72,153,0.4)', marginBottom: 18, color: '#FBCFE8' }}>
            {error}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('marketingMcp.kpi.totalPublishes', 'Publicaciones totales')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.total_publishes)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('marketingMcp.kpi.totalOk', 'OK enviadas')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(totalOk)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('marketingMcp.kpi.scheduledPending', 'Pendientes scheduled')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.scheduled_pending)}
            </div>
          </div>
          <div style={kpi}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('marketingMcp.kpi.cacheEntries', 'Cache entries (24h)')}
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {fmtNum(stats?.cache_entries)}
            </div>
          </div>
        </div>

        {/* Platform cards */}
        <div style={{ ...card, marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            {t('marketingMcp.platformsTitle', 'Estado de canales')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {PLATFORMS.map((p) => {
              const a = adapters[p] || {};
              const cnt = byPlat[p] || {};
              return (
                <div key={p} style={{
                  padding: 14, borderRadius: 12,
                  background: 'rgba(240,235,224,0.04)',
                  border: '1px solid rgba(240,235,224,0.08)',
                }} data-testid={`mcp-platform-${p}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 700, textTransform: 'capitalize' }}>{p}</div>
                    <span style={{
                      ...pillBase,
                      background: a.configured ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: a.configured ? '#86EFAC' : '#FBBF24',
                      border: `1px solid ${a.configured ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    }}>
                      {a.configured ? t('marketingMcp.statusConfigured', 'Activo') : t('marketingMcp.statusSkipped', 'Sin keys')}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.65, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>OK {fmtNum(cnt.ok || 0)}</span>
                    <span>Err {fmtNum(cnt.error || 0)}</span>
                    <span>Skip {fmtNum(cnt.skipped || 0)}</span>
                    <span>Cache {fmtNum(cnt.cached || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Publish form */}
        <form onSubmit={handleSubmit} style={{ ...card, marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            {t('marketingMcp.publishTitle', 'Nueva publicación')}
          </div>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
              {t('marketingMcp.contentLabel', 'Contenido (máx 5000 chars · Twitter recorta a 280)')}
            </div>
            <textarea
              rows="4"
              value={form.text}
              maxLength={5000}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 96 }}
              data-testid="mcp-publish-text"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {PLATFORMS.map((p) => {
              const active = form.platforms.includes(p);
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => togglePlatform(p)}
                  data-testid={`mcp-toggle-${p}`}
                  style={{
                    ...pillBase,
                    cursor: 'pointer',
                    background: active ? 'rgba(99,102,241,0.20)' : 'transparent',
                    color: active ? CREAM : 'rgba(240,235,224,0.6)',
                    border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(240,235,224,0.18)'}`,
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
              {t('marketingMcp.scheduleLabel', 'Programar (opcional · vacío = publicar ahora)')}
            </div>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              style={inputStyle}
              data-testid="mcp-schedule-at"
            />
          </label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={busy || !form.text.trim() || form.platforms.length === 0}
              data-testid="mcp-submit"
              style={{
                padding: '8px 22px', borderRadius: 9999,
                background: GRAD, color: '#06080F',
                border: 'none', fontWeight: 700, fontSize: 12, letterSpacing: 0.4,
                textTransform: 'uppercase',
                cursor: busy ? 'progress' : 'pointer',
                opacity: busy || !form.text.trim() || form.platforms.length === 0 ? 0.5 : 1,
              }}
            >
              {busy
                ? t('common.loading', 'Cargando')
                : form.scheduled_at
                  ? t('marketingMcp.actionSchedule', 'Programar')
                  : t('marketingMcp.actionPublish', 'Publicar ahora')}
            </button>
          </div>
        </form>

        {/* History */}
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            {t('marketingMcp.historyTitle', 'Historial 30 días')} · {history.length}
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
              {t('common.loading', 'Cargando')}
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
              {t('marketingMcp.historyEmpty', 'Sin publicaciones aún')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                      {t('marketingMcp.col.date', 'Fecha')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                      {t('marketingMcp.col.text', 'Contenido')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                      {t('marketingMcp.col.platforms', 'Platforms')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                      {t('marketingMcp.col.actions', 'Acciones')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((it) => {
                    const text = (it.content && it.content.text) || '';
                    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
                    const results = it.results || {};
                    return (
                      <tr key={it.record_id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }} data-testid={`mcp-row-${it.record_id}`}>
                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', opacity: 0.85 }}>{fmtDt(it.created_at)}</td>
                        <td style={{ padding: '10px 8px', maxWidth: 360 }}>{preview}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(it.platforms || []).map((p) => {
                              const st = (results[p] || {}).status || 'unknown';
                              const color = st === 'ok' ? '#86EFAC' : st === 'cached' ? '#A5B4FC' : st === 'skipped' ? '#FBBF24' : '#FCA5A5';
                              return (
                                <span key={p} style={{
                                  ...pillBase,
                                  background: 'rgba(240,235,224,0.06)',
                                  color, border: `1px solid ${color}33`,
                                }}>{p}·{st}</span>
                              );
                            })}
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          {it.scheduled_id && it.status === 'pending' && (
                            <button
                              onClick={() => handleCancel(it.scheduled_id)}
                              disabled={busy}
                              style={{
                                padding: '5px 12px', borderRadius: 9999, fontSize: 11,
                                background: 'rgba(236,72,153,0.18)', color: CREAM,
                                border: '1px solid rgba(236,72,153,0.3)', cursor: 'pointer',
                              }}
                            >
                              {t('common.cancel', 'Cancelar')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SuperadminLayout>
  );
}
