/**
 * W6.MOV.2 · Superadmin Gov Data MX dashboard.
 *
 * 3 tabs:
 *   - API (Track A): 6 connectors gov MX · status + force refresh
 *   - Cron (Track B): 6 parsers · last run per parser
 *   - Upload (Track C): drag-drop + tabla uploads
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import AdminUploadPanel from '../../components/superadmin/govDataMx/AdminUploadPanel';
import {
  getCronStatus,
  getStats,
  listSources,
  refreshSource,
} from '../../api/govDataMx';

const CREAM = '#F0EBE0';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const TABS = ['api', 'cron', 'upload'];

const card = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};
const kpi = {
  padding: 16, borderRadius: 14,
  background: 'rgba(var(--theme-rgb, 99 102 241),0.06)',
  border: '1px solid rgba(var(--theme-rgb, 99 102 241),0.18)',
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX'); } catch { return iso; }
}

function StatusPill({ status }) {
  const map = {
    ok: { bg: 'rgba(34,197,94,0.18)', fg: '#86EFAC', border: 'rgba(34,197,94,0.35)' },
    stale: { bg: 'rgba(234,179,8,0.18)', fg: '#FDE68A', border: 'rgba(234,179,8,0.35)' },
    error: { bg: 'rgba(236,72,153,0.18)', fg: '#FBCFE8', border: 'rgba(236,72,153,0.35)' },
    skipped: { bg: 'rgba(148,163,184,0.18)', fg: '#CBD5E1', border: 'rgba(148,163,184,0.35)' },
    missing: { bg: 'rgba(148,163,184,0.10)', fg: '#94A3B8', border: 'rgba(148,163,184,0.25)' },
  };
  const s = map[status] || map.missing;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
      background: s.bg, color: s.fg, border: `1px solid ${s.border}`,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase',
    }}>{status || '—'}</span>
  );
}

function ApiTab() {
  const { t } = useTranslation('common');
  const [sources, setSources] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSources();
      setSources(data?.sources || []);
      setCounts(data?.counts || null);
    } catch (e) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async (sourceId) => {
    setBusyId(sourceId);
    try {
      await refreshSource(sourceId);
      await load();
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error && (
        <div style={{ ...card, borderColor: 'rgba(236,72,153,0.4)', marginBottom: 16, color: '#FBCFE8' }}>
          {error}
        </div>
      )}
      {counts && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {Object.keys(counts).map((k) => (
            <div key={k} style={kpi}>
              <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t(`govDataMx.status.${k}`, k)}
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                {counts[k] ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('govDataMx.api.title', 'Connectors API (Track A)')} · {sources.length}
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              background: GRAD, color: '#06080F',
              border: 'none', fontWeight: 700, fontSize: 11, letterSpacing: 0.4,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {loading ? t('common.loading', 'Cargando') : t('common.refresh', 'Refrescar')}
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.api.col.source', 'Fuente')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.api.col.status', 'Status')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.api.col.fetched', 'Última lectura')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.api.col.expires', 'Expira')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.api.col.actions', 'Acciones')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source_id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }} data-testid={`gov-data-mx-source-${s.source_id}`}>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ fontWeight: 600 }}>{s.label || s.source_id}</div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>{s.source_id}</div>
                  </td>
                  <td style={{ padding: '10px 8px' }}><StatusPill status={s.status} /></td>
                  <td style={{ padding: '10px 8px', opacity: 0.75 }}>{fmtDate(s.fetched_at)}</td>
                  <td style={{ padding: '10px 8px', opacity: 0.75 }}>{fmtDate(s.expires_at)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleRefresh(s.source_id)}
                      disabled={busyId === s.source_id}
                      style={{
                        padding: '5px 12px', borderRadius: 9999, fontSize: 11,
                        background: 'rgba(99,102,241,0.18)', color: CREAM,
                        border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer',
                      }}
                    >
                      {busyId === s.source_id
                        ? t('common.loading', 'Cargando')
                        : t('govDataMx.api.forcePull', 'Force pull')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CronTab() {
  const { t } = useTranslation('common');
  const [parsers, setParsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCronStatus();
      setParsers(data?.parsers || []);
    } catch (e) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {error && (
        <div style={{ ...card, borderColor: 'rgba(236,72,153,0.4)', marginBottom: 16, color: '#FBCFE8' }}>
          {error}
        </div>
      )}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('govDataMx.cron.title', 'Parsers cron (Track B)')} · {parsers.length}
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              background: GRAD, color: '#06080F',
              border: 'none', fontWeight: 700, fontSize: 11, letterSpacing: 0.4,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {loading ? t('common.loading', 'Cargando') : t('common.refresh', 'Refrescar')}
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 10 }}>
          {t('govDataMx.cron.schedule', 'Weekly · dom 04:00 UTC · Monthly · día 1 05:00 UTC')}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(240,235,224,0.10)' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.cron.col.parser', 'Parser')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.cron.col.schedule', 'Schedule')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.cron.col.lastPeriod', 'Último period')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'left', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.cron.col.lastRun', 'Último run')}
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'right', opacity: 0.7, fontWeight: 600 }}>
                  {t('govDataMx.cron.col.bytes', 'Bytes')}
                </th>
              </tr>
            </thead>
            <tbody>
              {parsers.map((p) => (
                <tr key={p.parser_id} style={{ borderBottom: '1px solid rgba(240,235,224,0.06)' }} data-testid={`gov-data-mx-parser-${p.parser_id}`}>
                  <td style={{ padding: '10px 8px' }}>{p.parser_id}</td>
                  <td style={{ padding: '10px 8px', opacity: 0.75 }}>{p.schedule}</td>
                  <td style={{ padding: '10px 8px', opacity: 0.75 }}>{p.last_period || '—'}</td>
                  <td style={{ padding: '10px 8px', opacity: 0.75 }}>{fmtDate(p.last_ingested_at)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{p.last_byte_count ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SuperadminGovDataMx({ embedded }) {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState('api');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getStats().then((s) => { if (!cancelled) setStats(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [tab]);

  return (
    <SuperadminLayout bare={embedded}>
      <div data-testid="superadmin-gov-data-mx-page" style={{ padding: 24, fontFamily: 'DM Sans, sans-serif', color: CREAM }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text',
          }}>
            DesarrollosMX · Datos
          </div>
          <h1 style={{ margin: '6px 0 4px', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('govDataMx.title', 'Gov Data MX')}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t('govDataMx.subtitle', '3 tracks · 6 fuentes API + 6 parsers cron + admin upload · INEGI · BANXICO · DataMéxico · CONAVI · SESNSP · CENAPRED')}
          </div>
        </header>

        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div style={kpi}>
              <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('govDataMx.stats.trackA', 'Track A · API')}
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                {stats?.track_a?.total ?? 0}
              </div>
            </div>
            <div style={kpi}>
              <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('govDataMx.stats.trackB', 'Track B · raw rows')}
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                {stats?.track_b_raw_total ?? 0}
              </div>
            </div>
            <div style={kpi}>
              <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('govDataMx.stats.trackC', 'Track C · uploads')}
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                {stats?.track_c_uploads_active ?? 0}
              </div>
            </div>
            <div style={kpi}>
              <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('govDataMx.stats.cache', 'Cache entries')}
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800, marginTop: 4 }}>
                {stats?.cache_entries ?? 0}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(240,235,224,0.08)' }}>
          {TABS.map((tk) => (
            <button
              key={tk}
              onClick={() => setTab(tk)}
              data-testid={`gov-data-mx-tab-${tk}`}
              style={{
                padding: '10px 18px', background: 'transparent',
                color: tab === tk ? CREAM : 'rgba(240,235,224,0.6)',
                border: 'none', borderBottom: `2px solid ${tab === tk ? '#6366F1' : 'transparent'}`,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.2,
              }}
            >
              {t(`govDataMx.tab.${tk}`, tk.toUpperCase())}
            </button>
          ))}
        </div>

        {tab === 'api' && <ApiTab />}
        {tab === 'cron' && <CronTab />}
        {tab === 'upload' && <AdminUploadPanel />}
      </div>
    </SuperadminLayout>
  );
}
