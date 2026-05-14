// W4.18.1 — Apify Google Trends Superadmin page (es-MX)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Search, RefreshCw, Trash2, TrendingUp, TrendingDown, Minus, AlertTriangle, ZapOff } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

function api(path, opts = {}) {
  return fetch(`${API}${path}`, { credentials: 'include', ...opts }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
    return data;
  });
}

const TIMEFRAMES = [
  { v: 'now 1-d', label: 'Último día' },
  { v: 'now 7-d', label: 'Última semana' },
  { v: 'today 1-m', label: 'Último mes' },
  { v: 'today 3-m', label: '90 días' },
  { v: 'today 5-y', label: '5 años' },
  { v: 'all', label: 'Todo el histórico' },
];

const GEOS = [
  { v: 'MX', label: 'México (nacional)' },
  { v: 'US', label: 'Estados Unidos' },
  { v: '', label: 'Mundial' },
];

function Card({ children, ...rest }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(240,235,224,0.10)',
        backdropFilter: 'blur(14px)',
        borderRadius: 16,
        padding: 20,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function PillButton({ children, onClick, variant = 'primary', disabled, testid, icon: Icon }) {
  const styles = {
    primary: { background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', color: '#fff', border: 'none' },
    ghost: { background: 'transparent', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.18)' },
    danger: { background: 'transparent', color: '#FCA5A5', border: '1px solid rgba(252,165,165,0.30)' },
  };
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full"
      style={{
        ...styles[variant],
        padding: '8px 18px',
        fontFamily: 'DM Sans',
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        transition: 'transform 120ms ease, opacity 120ms ease',
      }}
    >
      {Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <Card>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 28, color: 'var(--cream)', marginTop: 6 }}>
        {value ?? '—'}
      </div>
      {sub ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </Card>
  );
}

function TrendArrow({ direction }) {
  if (direction === 'rising') return <TrendingUp size={16} style={{ color: '#4ADE80' }} />;
  if (direction === 'falling') return <TrendingDown size={16} style={{ color: '#F87171' }} />;
  return <Minus size={16} style={{ color: 'rgba(240, 235, 224, 0.72)' }} />;
}

function TrendChart({ points }) {
  if (!points || points.length === 0) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240, 235, 224, 0.70)', fontFamily: 'DM Sans', fontSize: 13 }}>
        Sin datos en el período seleccionado.
      </div>
    );
  }
  const W = 800, H = 180, padL = 30, padR = 8, padT = 14, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const values = points.map((p) => Number(p.value || 0));
  const maxV = Math.max(...values, 1);
  const xs = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const ys = (v) => padT + innerH - (v / maxV) * innerH;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(p.value)}`).join(' ');
  const areaPath = `${linePath} L ${xs(points.length - 1)} ${padT + innerH} L ${xs(0)} ${padT + innerH} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H }} data-testid="trends-chart">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(var(--theme-rgb),0.32)" />
          <stop offset="100%" stopColor="rgba(var(--theme-rgb),0.00)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendGrad)" />
      <path d={linePath} fill="none" stroke="var(--theme)" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={xs(i)} cy={ys(p.value)} r="2.4" fill="var(--theme)">
          <title>{`${p.time}: ${p.value}`}</title>
        </circle>
      ))}
      <text x={padL - 4} y={padT + 4} fill="rgba(240, 235, 224, 0.72)" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9">{maxV}</text>
      <text x={padL - 4} y={padT + innerH - 1} fill="rgba(240, 235, 224, 0.70)" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9">0</text>
      <text x={padL} y={H - 5} fill="rgba(240, 235, 224, 0.70)" fontFamily="DM Mono, monospace" fontSize="9">{points[0]?.time}</text>
      <text x={W - padR - 80} y={H - 5} fill="rgba(240, 235, 224, 0.70)" fontFamily="DM Mono, monospace" fontSize="9">{points[points.length - 1]?.time}</text>
    </svg>
  );
}

function ListBlock({ title, rows, testid }) {
  return (
    <div data-testid={testid}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        {title}
      </div>
      {(!rows || rows.length === 0) ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.70)' }}>—</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed rgba(240,235,224,0.08)' }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{r.label}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'rgba(240,235,224,0.65)' }}>
                {typeof r.value === 'number' ? r.value : (r.value === 'Breakout' ? 'Breakout' : r.value || '')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SuperadminTrends({ user, onLogout }) {
  const [query, setQuery] = useState('polanco');
  const [geo, setGeo] = useState('MX');
  const [timeframe, setTimeframe] = useState('today 3-m');
  const [waitForResult, setWaitForResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [keywords, setKeywords] = useState({ daily_hot: [], weekly_zones: [] });
  const [busyAction, setBusyAction] = useState(null);

  const loadOverview = useCallback(async () => {
    try {
      const [s, e, k] = await Promise.all([
        api('/api/superadmin/trends/cache/stats'),
        api('/api/superadmin/trends/cache?limit=50'),
        api('/api/superadmin/trends/keywords'),
      ]);
      setStats(s.stats);
      setEntries(e.entries || []);
      setKeywords({
        daily_hot: k.daily_hot || [],
        weekly_zones: k.weekly_zones || [],
        default_geo: k.default_geo,
        default_timeframe: k.default_timeframe,
      });
    } catch (e) {
      setError(`No se pudo cargar el overview: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const lookup = useCallback(async (forceRefresh = false) => {
    if (!query || query.trim().length < 2) {
      setError('Ingresa una keyword (mínimo 2 caracteres).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        geo: geo || '',
        timeframe: timeframe || '',
        force_refresh: forceRefresh ? 'true' : 'false',
        wait_for_result: waitForResult ? 'true' : 'false',
      });
      const data = await api(`/api/superadmin/trends/lookup?${params.toString()}`);
      setResult(data.result);
      // Refresh stats/entries non-blocking
      loadOverview();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, geo, timeframe, waitForResult, loadOverview]);

  const triggerBatch = useCallback(async (scope) => {
    setBusyAction(`batch_${scope}`);
    setError(null);
    try {
      const data = await api(`/api/superadmin/trends/refresh?scope=${scope}`, { method: 'POST' });
      // No bloqueante: refrescamos el overview tras pequeñísima pausa
      await loadOverview();
      const n = (data.refreshed || []).length;
      const f = (data.failed || []).length;
      setError(`Batch ${scope} completado · refrescadas ${n} · fallidas ${f}`);
    } catch (e) {
      setError(`Batch ${scope} falló: ${e.message}`);
    } finally {
      setBusyAction(null);
    }
  }, [loadOverview]);

  const invalidate = useCallback(async (cacheKey) => {
    if (!cacheKey) return;
    setBusyAction(`del_${cacheKey}`);
    try {
      await api(`/api/superadmin/trends/cache/${cacheKey}`, { method: 'DELETE' });
      await loadOverview();
    } catch (e) {
      setError(`Invalidación falló: ${e.message}`);
    } finally {
      setBusyAction(null);
    }
  }, [loadOverview]);

  const sourceColor = (s) => {
    if (s === 'apify') return '#4ADE80';
    if (s === 'heuristic') return '#F87171';
    return 'rgba(240,235,224,0.55)';
  };

  const cacheBadge = (status) => {
    const map = {
      hit: { c: '#4ADE80', t: 'cache hit' },
      miss_refreshed: { c: 'var(--theme)', t: 'cache miss · refrescada' },
      miss_refreshing_background: { c: '#F59E0B', t: 'refrescando en background' },
      stale_refreshing: { c: '#F59E0B', t: 'caché expirada · refrescando bg' },
      stale_apify_error: { c: '#F87171', t: 'caché vencida · Apify falló' },
      miss_no_cache: { c: '#F87171', t: 'sin caché y Apify falló' },
    };
    return map[status] || { c: 'rgba(240,235,224,0.55)', t: status || '—' };
  };

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="sa-trends-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>W4.18.1 · Apify Google Trends</div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.025em', margin: 0 }}>
            Google Trends · CDMX
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'rgba(240,235,224,0.65)', maxWidth: 700, marginTop: 8 }}>
            Búsquedas reales de Google para keywords inmobiliarias CDMX, vía Apify Actor con caché de 7 días.
            Las cron diarias y semanales mantienen vigentes las keywords curadas.
          </p>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <StatTile label="Total cache" value={stats?.total_entries ?? 0} testid="sa-trends-stat-total" />
          <StatTile label="Vigentes" value={stats?.live_entries ?? 0} sub={`TTL ${stats?.ttl_days ?? 7}d`} />
          <StatTile label="Vencidas" value={stats?.stale_entries ?? 0} />
          <StatTile label="Actor" value={(stats?.actor || '—').split('/').pop()} sub={stats?.actor || ''} />
        </div>

        {/* Lookup form */}
        <Card>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginBottom: 12 }}>
            Búsqueda en vivo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginBottom: 6 }}>
                KEYWORD
              </label>
              <input
                data-testid="sa-trends-input-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookup(false)}
                placeholder="ej. departamento polanco"
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(0,0,0,0.30)',
                  border: '1px solid rgba(240,235,224,0.18)',
                  borderRadius: 9999,
                  color: 'var(--cream)',
                  fontFamily: 'DM Sans', fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginBottom: 6 }}>
                GEO
              </label>
              <select
                data-testid="sa-trends-select-geo"
                value={geo}
                onChange={(e) => setGeo(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(240,235,224,0.18)',
                  borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14, outline: 'none',
                }}
              >
                {GEOS.map((g) => <option key={g.v} value={g.v}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginBottom: 6 }}>
                PERÍODO
              </label>
              <select
                data-testid="sa-trends-select-timeframe"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(240,235,224,0.18)',
                  borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14, outline: 'none',
                }}
              >
                {TIMEFRAMES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <PillButton
                testid="sa-trends-btn-lookup"
                onClick={() => lookup(false)}
                disabled={loading}
                icon={Search}
              >
                {loading ? 'Buscando…' : 'Buscar'}
              </PillButton>
              <PillButton
                testid="sa-trends-btn-force-refresh"
                onClick={() => lookup(true)}
                variant="ghost"
                disabled={loading}
                icon={RefreshCw}
              >
                Forzar refresh
              </PillButton>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.75)', cursor: 'pointer' }}>
              <input
                data-testid="sa-trends-toggle-wait"
                type="checkbox"
                checked={waitForResult}
                onChange={(e) => setWaitForResult(e.target.checked)}
              />
              Esperar resultado del actor (puede tardar 1-3 min · sólo CLI/local)
            </label>
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.72)' }}>
              Por defecto se devuelve caché stale o heurística mientras Apify refresca en background.
            </span>
          </div>
          {error ? (
            <div style={{ marginTop: 14, padding: 12, background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', borderRadius: 12, color: '#FCA5A5', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          ) : null}
        </Card>

        {/* Result */}
        {result ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <TrendArrow direction={result.trend_direction} />
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)' }}>
                    {result.query}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
                    {result.geo || 'WW'} · {result.timeframe || '—'} · interés {result.average_interest ?? '—'} avg, {result.peak_interest ?? '—'} peak
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.30)', border: `1px solid ${sourceColor(result.source)}40`, color: sourceColor(result.source), fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  {result.source}
                </span>
                <span style={{ padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.30)', border: `1px solid ${cacheBadge(result.cache_status).c}40`, color: cacheBadge(result.cache_status).c, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  {cacheBadge(result.cache_status).t}
                </span>
              </div>
            </div>

            {result.cache_status === 'miss_no_cache' || result.source === 'heuristic' ? (
              <div style={{ marginBottom: 14, padding: 12, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 12, color: '#FCD34D', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                <ZapOff size={14} />
                {result.error
                  ? `Apify no respondió: ${result.error}. Mostrando heurística vacía. Reintenta en ~15 min o forza refresh.`
                  : 'Apify aún no ha cacheado esta query. Refresh corriendo en background; reintenta en 1-3 min.'}
              </div>
            ) : null}

            <TrendChart points={result.interest_over_time} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 18 }}>
              <ListBlock
                title="Top regiones"
                testid="sa-trends-list-regions"
                rows={(result.interest_by_region || []).slice(0, 8).map((r) => ({ label: r.name, value: r.value }))}
              />
              <ListBlock
                title="Queries relacionadas · top"
                testid="sa-trends-list-rqtop"
                rows={(result.related_queries_top || []).slice(0, 8).map((r) => ({ label: r.label, value: r.value }))}
              />
              <ListBlock
                title="Queries relacionadas · rising"
                testid="sa-trends-list-rqrising"
                rows={(result.related_queries_rising || []).slice(0, 8).map((r) => ({ label: r.label, value: r.value }))}
              />
            </div>
          </Card>
        ) : null}

        {/* Curated batches */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
                Cron · keywords curadas
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)' }}>
                Daily refresh 05:30 MX · Weekly refresh Lun 06:00 MX. Disparo manual disponible aquí.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <PillButton
                testid="sa-trends-btn-batch-daily"
                onClick={() => triggerBatch('daily')}
                disabled={busyAction === 'batch_daily'}
                icon={RefreshCw}
              >
                {busyAction === 'batch_daily' ? 'Ejecutando…' : 'Refresh daily'}
              </PillButton>
              <PillButton
                testid="sa-trends-btn-batch-weekly"
                onClick={() => triggerBatch('weekly')}
                disabled={busyAction === 'batch_weekly'}
                variant="ghost"
                icon={RefreshCw}
              >
                {busyAction === 'batch_weekly' ? 'Ejecutando…' : 'Refresh weekly'}
              </PillButton>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div data-testid="sa-trends-curated-daily">
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
                DAILY ({keywords.daily_hot?.length || 0})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(keywords.daily_hot || []).map((k) => (
                  <span key={k} style={{ padding: '4px 10px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.25)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)' }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
            <div data-testid="sa-trends-curated-weekly">
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
                WEEKLY ({keywords.weekly_zones?.length || 0})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(keywords.weekly_zones || []).map((k) => (
                  <span key={k} style={{ padding: '4px 10px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.25)', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)' }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Cache table */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
              Caché · entradas recientes
            </div>
            <PillButton
              testid="sa-trends-btn-reload"
              onClick={loadOverview}
              variant="ghost"
              icon={RefreshCw}
            >
              Recargar
            </PillButton>
          </div>
          {(!entries || entries.length === 0) ? (
            <div style={{ padding: 18, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)' }}>
              Aún no hay entradas en caché. Ejecuta una búsqueda o un refresh batch.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Mono, monospace', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 8px' }}>Query</th>
                    <th style={{ padding: '10px 8px' }}>Geo</th>
                    <th style={{ padding: '10px 8px' }}>Período</th>
                    <th style={{ padding: '10px 8px' }}>Source</th>
                    <th style={{ padding: '10px 8px' }}>Hits</th>
                    <th style={{ padding: '10px 8px' }}>Cached</th>
                    <th style={{ padding: '10px 8px' }}>Vence</th>
                    <th style={{ padding: '10px 8px' }}></th>
                  </tr>
                </thead>
                <tbody data-testid="sa-trends-cache-table-body">
                  {entries.map((e) => (
                    <tr key={e.cache_key} style={{ borderTop: '1px solid rgba(240,235,224,0.06)', color: 'var(--cream)' }}>
                      <td style={{ padding: '8px' }}>{e.query}</td>
                      <td style={{ padding: '8px' }}>{e.geo}</td>
                      <td style={{ padding: '8px' }}>{e.timeframe}</td>
                      <td style={{ padding: '8px', color: sourceColor(e.source) }}>{e.source}</td>
                      <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace' }}>{e.hit_count}</td>
                      <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
                        {e.cached_at ? new Date(e.cached_at).toLocaleString('es-MX', { hour12: false }) : '—'}
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
                        {e.expires_at ? new Date(e.expires_at).toLocaleString('es-MX', { hour12: false }) : '—'}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <PillButton
                          testid={`sa-trends-btn-invalidate-${e.cache_key.slice(0, 8)}`}
                          onClick={() => invalidate(e.cache_key)}
                          disabled={busyAction === `del_${e.cache_key}`}
                          variant="danger"
                          icon={Trash2}
                        >
                          Invalidar
                        </PillButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </SuperadminLayout>
  );
}
