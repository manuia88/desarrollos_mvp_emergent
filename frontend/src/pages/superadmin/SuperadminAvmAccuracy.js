/**
 * W5.1 Sub-Chunk B — Superadmin AVM Accuracy Dashboard.
 *
 * KPIs · Drift por colonia · Promotion log · Trigger manual de retrain ·
 * Golden dataset validation · Cache stats.
 */
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import {
  fetchAvmAccuracySummary,
  fetchAvmPromotions,
  triggerAvmRetrain,
  fetchAvmGoldenValidation,
  invalidateAvmCache,
} from '../../api/avm';
import FsdDistributionTab from '../../components/superadmin/FsdDistributionTab';

function pct(n) {
  if (n === null || n === undefined) return '—';
  return `${(Number(n) * 100).toFixed(2)}%`;
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  try { return new Intl.NumberFormat('es-MX').format(n); } catch { return String(n); }
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(2)}%`;
}

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; }
}

const card = {
  padding: 18, borderRadius: 16,
  background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const kpi = {
  padding: 16, borderRadius: 14,
  background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)',
};

const btn = {
  padding: '9px 16px', borderRadius: 9999, border: 'none',
  background: 'linear-gradient(90deg,var(--theme),var(--theme-3))', color: '#fff',
  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};

const btnGhost = {
  padding: '9px 16px', borderRadius: 9999,
  background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme-2)',
  border: '1px solid rgba(var(--theme-rgb),0.4)',
  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};

const th = { textAlign: 'left', padding: '10px 12px', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const td = { padding: '9px 12px', fontFamily: 'DM Sans', fontSize: 12, color: '#F0EBE0', borderTop: '1px solid rgba(255,255,255,0.05)' };

export default function SuperadminAvmAccuracy() {
  const [summary, setSummary] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [golden, setGolden] = useState(null);
  const [loadingRetrain, setLoadingRetrain] = useState(false);
  const [loadingGolden, setLoadingGolden] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('accuracy');

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        fetchAvmAccuracySummary(),
        fetchAvmPromotions(50),
      ]);
      setSummary(s);
      setPromotions(p.promotions || []);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    document.title = 'Accuracy AVM · Superadmin · DesarrollosMX';
    load();
  }, [load]);

  const handleRetrain = async () => {
    setLoadingRetrain(true); setError(null);
    try {
      const r = await triggerAvmRetrain();
      setToast(`Retrain completo · zones=${r.run_summary?.zones_total} promoted=${r.run_summary?.promoted}`);
      await load();
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoadingRetrain(false); }
  };

  const handleGolden = async () => {
    setLoadingGolden(true); setError(null);
    try {
      const g = await fetchAvmGoldenValidation();
      setGolden(g);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoadingGolden(false); }
  };

  const handleCacheInvalidate = async () => {
    setError(null);
    try {
      const r = await invalidateAvmCache();
      setToast(`Cache invalidado · ${r.entries_removed} entries`);
      await load();
    } catch (e) { setError(String(e.message || e)); }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <SuperadminLayout>
    <div data-testid="superadmin-avm-accuracy" style={{ minHeight: '100vh', color: 'var(--cream)', padding: '32px 24px 60px', fontFamily: 'DM Sans' }}>
      <header style={{ maxWidth: 1300, margin: '0 auto 22px' }}>
        <div style={{ fontSize: 11, color: 'var(--theme-2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>
          Superadmin · W5.1
        </div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Precisión del modelo AVM
        </h1>
        <p style={{ color: 'rgba(240,235,224,0.65)', fontSize: 14, marginTop: 6, maxWidth: 720 }}>
          Métricas del modelo hedónico OLS, drift por colonia, log de promociones automáticas
          y validación contra dataset golden.
        </p>
      </header>

      {error && (
        <div style={{ maxWidth: 1300, margin: '0 auto 16px', padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>
          {error}
        </div>
      )}

      {toast && (
        <div data-testid="avm-accuracy-toast" style={{ maxWidth: 1300, margin: '0 auto 16px', padding: 12, borderRadius: 12, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontSize: 12 }}>
          {toast}
        </div>
      )}

      {/* W5.15 P2 — Tabs nav */}
      <nav data-testid="avm-accuracy-tabs" style={{ maxWidth: 1300, margin: '0 auto 18px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { key: 'accuracy',         label: 'AVM Accuracy' },
          { key: 'fsd_distribution', label: 'FSD Distribution' },
        ].map((tab) => (
          <button
            key={tab.key}
            data-testid={`avm-accuracy-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '9px 18px', borderRadius: 9999, cursor: 'pointer',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
              background: activeTab === tab.key
                ? 'linear-gradient(90deg, rgba(124,47,255,0.30), rgba(192,38,211,0.25))'
                : 'rgba(255,255,255,0.04)',
              color: activeTab === tab.key ? '#e0e7ff' : 'rgba(240,235,224,0.65)',
              border: activeTab === tab.key
                ? '1px solid rgba(124,47,255,0.55)'
                : '1px solid rgba(255,255,255,0.10)',
            }}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'fsd_distribution' ? (
        <div style={{ maxWidth: 1300, margin: '0 auto' }}>
          <FsdDistributionTab />
        </div>
      ) : (
      <>
      <section style={{ maxWidth: 1300, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 22 }}>
        <div style={kpi} data-testid="kpi-zones-modeled">
          <div style={{ fontSize: 10, color: 'rgba(var(--theme-rgb),0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zonas modeladas</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtNum(summary?.kpis?.total_zones_modeled)}</div>
        </div>
        <div style={kpi} data-testid="kpi-zones-promoted">
          <div style={{ fontSize: 10, color: 'rgba(var(--theme-rgb),0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zonas promovidas</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtNum(summary?.kpis?.total_zones_promoted)}</div>
        </div>
        <div style={kpi} data-testid="kpi-avg-r2">
          <div style={{ fontSize: 10, color: 'rgba(var(--theme-rgb),0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>R² promedio</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{pct(summary?.kpis?.avg_promoted_r2)}</div>
        </div>
        <div style={kpi} data-testid="kpi-avg-sample">
          <div style={{ fontSize: 10, color: 'rgba(var(--theme-rgb),0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sample size promedio</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtNum(summary?.kpis?.avg_sample_size)}</div>
        </div>
        <div style={kpi} data-testid="kpi-promos-30d">
          <div style={{ fontSize: 10, color: 'rgba(var(--theme-rgb),0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Promociones 30d</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtNum(summary?.kpis?.promotions_last_30d)}</div>
        </div>
      </section>

      <section style={{ maxWidth: 1300, margin: '0 auto 22px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button data-testid="btn-trigger-retrain" onClick={handleRetrain} disabled={loadingRetrain} style={{ ...btn, opacity: loadingRetrain ? 0.6 : 1, cursor: loadingRetrain ? 'wait' : 'pointer' }}>
          {loadingRetrain ? 'Re-entrenando…' : 'Disparar retrain manual'}
        </button>
        <button data-testid="btn-golden-validate" onClick={handleGolden} disabled={loadingGolden} style={{ ...btnGhost, opacity: loadingGolden ? 0.6 : 1, cursor: loadingGolden ? 'wait' : 'pointer' }}>
          {loadingGolden ? 'Validando…' : 'Validar contra Golden Dataset'}
        </button>
        <button data-testid="btn-cache-invalidate" onClick={handleCacheInvalidate} style={btnGhost}>
          Invalidar cache
        </button>
        <button data-testid="btn-refresh" onClick={load} style={btnGhost}>Refrescar</button>
      </section>

      {/* Cache + Last Run */}
      <section style={{ maxWidth: 1300, margin: '0 auto 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <div style={card}>
          <div style={{ fontSize: 11, color: 'var(--theme-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cache LRU</div>
          {summary?.cache_stats ? (
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>
              <div>Hits: <strong>{fmtNum(summary.cache_stats.hits)}</strong> · Misses: <strong>{fmtNum(summary.cache_stats.misses)}</strong></div>
              <div>Hit rate: <strong>{pct(summary.cache_stats.hit_rate)}</strong></div>
              <div>Size: <strong>{summary.cache_stats.size}</strong> / {summary.cache_stats.max_entries} · TTL: {summary.cache_stats.ttl_seconds}s</div>
              <div>Evictions: {fmtNum(summary.cache_stats.evictions)} · Invalidations: {fmtNum(summary.cache_stats.invalidations)}</div>
            </div>
          ) : <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>Sin datos</div>}
        </div>

        <div style={card}>
          <div style={{ fontSize: 11, color: 'var(--theme-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Última corrida nocturna</div>
          {summary?.last_retrain_run ? (
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>
              <div>Inició: {fmtDate(summary.last_retrain_run.started_at)}</div>
              <div>Terminó: {fmtDate(summary.last_retrain_run.finished_at)}</div>
              <div>Duración: <strong>{summary.last_retrain_run.duration_s}s</strong></div>
              <div>Zonas: <strong>{summary.last_retrain_run.zones_total}</strong> · Ok: <strong>{summary.last_retrain_run.fitted_ok}</strong></div>
              <div>Promovidas: <strong>{summary.last_retrain_run.promoted}</strong> · Errores: {summary.last_retrain_run.errors}</div>
            </div>
          ) : <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>Aún no se ha ejecutado el cron nocturno.</div>}
        </div>
      </section>

      {/* Drift table */}
      <section style={{ maxWidth: 1300, margin: '0 auto 22px' }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', fontSize: 11, color: 'var(--theme-2)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            Drift por colonia (últimos 100)
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table data-testid="drift-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(13,16,23,0.96)' }}>
                <tr>
                  <th style={th}>Zona</th>
                  <th style={th}>Tier</th>
                  <th style={th}>R² actual</th>
                  <th style={th}>R² promovido</th>
                  <th style={th}>Δ R²</th>
                  <th style={th}>Sample</th>
                  <th style={th}>Promovido</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.drift_by_zone || []).slice(0, 100).map((r, i) => (
                  <tr key={`${r.zone_id}-${i}`} data-testid={`drift-row-${r.zone_id}`}>
                    <td style={td}>{r.zone_id}</td>
                    <td style={td}>{r.tier}</td>
                    <td style={td}>{r.latest_r2 ?? '—'}</td>
                    <td style={td}>{r.promoted_r2 ?? '—'}</td>
                    <td style={{ ...td, color: r.delta_r2 == null ? '#aaa' : r.delta_r2 >= 0.05 ? '#86efac' : r.delta_r2 < -0.02 ? '#fca5a5' : '#fef08a' }}>
                      {r.delta_r2 == null ? '—' : (r.delta_r2 >= 0 ? `+${r.delta_r2}` : r.delta_r2)}
                    </td>
                    <td style={td}>{r.latest_sample_size ?? '—'}</td>
                    <td style={td}>{fmtDate(r.promoted_at)}</td>
                  </tr>
                ))}
                {!summary?.drift_by_zone?.length && (
                  <tr><td style={{ ...td, color: 'rgba(240,235,224,0.5)' }} colSpan={7}>Sin datos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Promotions log */}
      <section style={{ maxWidth: 1300, margin: '0 auto 22px' }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', fontSize: 11, color: 'var(--theme-2)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            Log de promociones (últimas 50)
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table data-testid="promotions-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(13,16,23,0.96)' }}>
                <tr>
                  <th style={th}>Zona</th>
                  <th style={th}>R² viejo</th>
                  <th style={th}>R² nuevo</th>
                  <th style={th}>Δ</th>
                  <th style={th}>Razón</th>
                  <th style={th}>Promovido</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map(p => (
                  <tr key={p.id}>
                    <td style={td}>{p.zone_id}</td>
                    <td style={td}>{p.old_r2 ?? '—'}</td>
                    <td style={td}>{p.new_r2 ?? '—'}</td>
                    <td style={{ ...td, color: '#86efac' }}>{p.delta_r2 != null ? (p.delta_r2 >= 0 ? `+${p.delta_r2}` : p.delta_r2) : '—'}</td>
                    <td style={td}>{p.reason}</td>
                    <td style={td}>{fmtDate(p.promoted_at)}</td>
                  </tr>
                ))}
                {!promotions.length && (
                  <tr><td style={{ ...td, color: 'rgba(240,235,224,0.5)' }} colSpan={6}>No hay promociones registradas todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Golden dataset */}
      {golden && (
        <section style={{ maxWidth: 1300, margin: '0 auto 22px' }}>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }} data-testid="golden-section">
            <div style={{ padding: '14px 18px', fontSize: 11, color: 'var(--theme-2)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              Golden Dataset · MAPE {fmtPct(golden.mape_pct)} · Evaluados {golden.evaluated}/{golden.total_cases}
              <span style={{ marginLeft: 12, color: 'rgba(240,235,224,0.55)' }}>
                ≤10% err: {golden.within_10pct} · ≤20% err: {golden.within_20pct}
              </span>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'rgba(13,16,23,0.96)' }}>
                  <tr>
                    <th style={th}>ID</th>
                    <th style={th}>Colonia</th>
                    <th style={th}>m²</th>
                    <th style={th}>Real</th>
                    <th style={th}>Estimado</th>
                    <th style={th}>Err %</th>
                    <th style={th}>Modelo</th>
                  </tr>
                </thead>
                <tbody>
                  {(golden.details || []).map(d => (
                    <tr key={d.id}>
                      <td style={td}>{d.id}</td>
                      <td style={td}>{d.colonia_slug}</td>
                      <td style={td}>{d.m2}</td>
                      <td style={td}>{fmtNum(d.real)}</td>
                      <td style={td}>{fmtNum(d.predicted)}</td>
                      <td style={{ ...td, color: d.abs_pct_error <= 10 ? '#86efac' : d.abs_pct_error <= 20 ? '#fef08a' : '#fca5a5' }}>
                        {fmtPct(d.abs_pct_error)}
                      </td>
                      <td style={td}>{d.pricing_model}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      </>
      )}
    </div>
    </SuperadminLayout>
  );
}
