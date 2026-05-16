/**
 * W5.3 Parte 2A Sub-B — Superadmin Forecast Accuracy Dashboard.
 *
 * KPIs · MAPE por horizonte · Drift per zona · trend chart · backtest manual.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import {
  fetchForecastAccuracySummary,
  fetchForecastAccuracyPerZone,
  triggerForecastBacktest,
} from '../../api/forecastAccuracy';

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toFixed(2);
}
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; }
}
function daysAgo(s) {
  if (!s) return '—';
  try {
    const d = (Date.now() - new Date(s).getTime()) / 86400000;
    return `hace ${Math.round(d)} d`;
  } catch { return s; }
}

const card = { padding: 18, borderRadius: 16, background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)' };
const kpi  = { padding: 16, borderRadius: 14, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' };
const btn  = { padding: '9px 16px', borderRadius: 9999, border: 'none', background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const th = { textAlign: 'left', padding: '10px 12px', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const td = { padding: '9px 12px', fontFamily: 'DM Sans', fontSize: 12, color: '#F0EBE0', borderTop: '1px solid rgba(255,255,255,0.05)' };

export default function SuperadminForecastAccuracy() {
  const [summary, setSummary] = useState(null);
  const [perZone, setPerZone] = useState([]);
  const [horizon, setHorizon] = useState(12);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [loadingBacktest, setLoadingBacktest] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, pz] = await Promise.all([
        fetchForecastAccuracySummary(),
        fetchForecastAccuracyPerZone(horizon, 50),
      ]);
      setSummary(s);
      setPerZone(pz.rows || []);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [horizon]);

  useEffect(() => {
    document.title = 'Forecast Accuracy · Superadmin · DesarrollosMX';
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleBacktest = async () => {
    setLoadingBacktest(true); setError(null);
    try {
      const r = await triggerForecastBacktest();
      const sm = r.summary || {};
      setToast(`Backtest ok · ${sm.snapshots_inserted} snapshots · ${sm.duration_s}s`);
      // refresh tras 5s
      setTimeout(load, 5000);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoadingBacktest(false); }
  };

  const trendData = (summary?.accuracy_30d_trend || []).map(p => ({
    date: p.date, mape_12m: p.mape_pct, count: p.sample_size,
  }));

  const mapeH = (k) => summary?.mape_by_horizon?.[k] || {};

  return (
    <div data-testid="superadmin-forecast-accuracy" style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0', padding: '32px 24px 60px', fontFamily: 'DM Sans' }}>
      <header style={{ maxWidth: 1300, margin: '0 auto 22px' }}>
        <div style={{ fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>
          Superadmin · W5.3
        </div>
        <h1 style={{ fontFamily: 'Outfit', fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          Precisión del modelo Forecast
        </h1>
        <p style={{ color: 'rgba(240,235,224,0.65)', fontSize: 14, marginTop: 6, maxWidth: 720 }}>
          MAPE histórico por horizonte (6m / 12m / 24m), drift por colonia y validación contra DRPI realizado.
        </p>
      </header>

      {error && (
        <div style={{ maxWidth: 1300, margin: '0 auto 16px', padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>
          {error}
        </div>
      )}
      {toast && (
        <div data-testid="fa-toast" style={{ maxWidth: 1300, margin: '0 auto 16px', padding: 12, borderRadius: 12, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontSize: 12 }}>
          {toast}
        </div>
      )}

      {/* KPI strip */}
      <section style={{ maxWidth: 1300, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 22 }}>
        <div style={kpi} data-testid="kpi-mape-6m">
          <div style={{ fontSize: 10, color: 'rgba(165,180,252,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>MAPE 6m</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmt(mapeH('6m').mape_pct)}%</div>
          <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>{mapeH('6m').sample_size || 0} muestras</div>
        </div>
        <div style={kpi} data-testid="kpi-mape-12m">
          <div style={{ fontSize: 10, color: 'rgba(165,180,252,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>MAPE 12m</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmt(mapeH('12m').mape_pct)}%</div>
          <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>{mapeH('12m').sample_size || 0} muestras</div>
        </div>
        <div style={kpi} data-testid="kpi-mape-24m">
          <div style={{ fontSize: 10, color: 'rgba(165,180,252,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>MAPE 24m</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmt(mapeH('24m').mape_pct)}%</div>
          <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>{mapeH('24m').sample_size || 0} muestras</div>
        </div>
        <div style={kpi} data-testid="kpi-zones-modeled">
          <div style={{ fontSize: 10, color: 'rgba(165,180,252,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zonas modeladas</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, marginTop: 4 }}>{summary?.zones_modeled ?? '—'}</div>
        </div>
        <div style={kpi} data-testid="kpi-last-run">
          <div style={{ fontSize: 10, color: 'rgba(165,180,252,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Último backtest</div>
          <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{daysAgo(summary?.last_run?.finished_at)}</div>
          <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>{summary?.total_snapshots ?? 0} snapshots</div>
        </div>
      </section>

      {/* Acciones */}
      <section style={{ maxWidth: 1300, margin: '0 auto 22px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button data-testid="btn-run-backtest" onClick={handleBacktest} disabled={loadingBacktest} style={{ ...btn, opacity: loadingBacktest ? 0.6 : 1, cursor: loadingBacktest ? 'wait' : 'pointer' }}>
          {loadingBacktest ? 'Corriendo…' : 'Correr backtest'}
        </button>
        <button data-testid="btn-refresh" onClick={load} style={btnGhost}>Refrescar</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(240,235,224,0.65)' }}>
          <span>Horizonte tabla:</span>
          {[6, 12, 24].map(h => (
            <button
              key={h}
              data-testid={`btn-horizon-${h}`}
              onClick={() => setHorizon(h)}
              style={{
                ...btnGhost,
                padding: '6px 12px',
                background: horizon === h ? 'rgba(99,102,241,0.30)' : btnGhost.background,
                color: horizon === h ? '#F0EBE0' : btnGhost.color,
              }}
            >{h}m</button>
          ))}
        </div>
      </section>

      {/* Trend chart */}
      <section style={{ maxWidth: 1300, margin: '0 auto 22px' }}>
        <div style={card} data-testid="trend-card">
          <div style={{ fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 12 }}>
            MAPE por horizonte (histórico 30d)
          </div>
          {trendData.length === 0 ? (
            <div data-testid="trend-empty" style={{ padding: 40, textAlign: 'center', color: 'rgba(240,235,224,0.5)', fontFamily: 'DM Sans', fontSize: 13 }}>
              Backtest necesita ≥6 meses de forecasts históricos. Presiona &quot;Correr backtest&quot; para procesar los disponibles.
            </div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={trendData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(240,235,224,0.5)" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} />
                  <YAxis stroke="rgba(240,235,224,0.5)" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: 'rgba(6,8,15,0.96)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 12, color: '#F0EBE0' }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.65)' }} />
                  <Line type="monotone" dataKey="mape_12m" name="MAPE 12m" stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: '#6366F1' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Per-zona table */}
      <section style={{ maxWidth: 1300, margin: '0 auto 22px' }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', fontSize: 11, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            Drift por zona · horizonte {horizon}m
            <span style={{ marginLeft: 10, color: 'rgba(240,235,224,0.5)' }}>
              ({perZone.length} zonas con ≥3 muestras)
            </span>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table data-testid="fa-per-zone-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(13,16,23,0.96)' }}>
                <tr>
                  <th style={th}>Zona</th>
                  <th style={th}>MAPE</th>
                  <th style={th}>Muestras</th>
                  <th style={th}>Modelo fitted</th>
                  <th style={th}>Último snapshot</th>
                </tr>
              </thead>
              <tbody>
                {perZone.map(r => {
                  const high = r.mape_pct > 20;
                  return (
                    <tr key={r.zone_slug} data-testid={`fa-row-${r.zone_slug}`}>
                      <td style={td}>{r.zone_slug}</td>
                      <td style={{ ...td, color: high ? '#fca5a5' : '#86efac', fontWeight: 700 }}>{fmt(r.mape_pct)}%</td>
                      <td style={td}>{r.sample_size}</td>
                      <td style={td}>{fmtDate(r.fitted_at_original)}</td>
                      <td style={td}>{fmtDate(r.last_snapshot)}</td>
                    </tr>
                  );
                })}
                {!perZone.length && (
                  <tr><td colSpan={5} style={{ ...td, color: 'rgba(240,235,224,0.5)' }}>Sin zonas con ≥3 muestras todavía. Espera a que el backtest acumule snapshots.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
