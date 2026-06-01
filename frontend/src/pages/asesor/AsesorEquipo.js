// AsesorEquipo — Tablero del gerente (E5). Métricas por asesor del equipo (Livoo).
// Solo gerentes (rol asesor_admin/admin): el endpoint /api/asesor/metrics/team gatea
// server-side; aquí mostramos un aviso claro si un asesor sin permiso entra.
import React, { useState, useEffect, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { getAsesorTeamMetrics } from '../../api/metrics';
import { Users, AlertCircle } from '../../components/icons';

const PESO = (n) => {
  const v = Number(n) || 0;
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString('es-MX')}`;
};

export default function AsesorEquipo({ user, onLogout }) {
  const [rows, setRows] = useState([]);
  const [avg, setAvg] = useState(0);
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setLoading(true); setErr('');
    getAsesorTeamMetrics(period)
      .then((r) => { setRows(r.asesores || []); setAvg(r.team_average_pipeline || 0); })
      .catch((e) => {
        const m = String(e?.message || '');
        setErr(m.includes('403') || /administrador|permiso/i.test(m) ? 'manager' : 'error');
      })
      .finally(() => setLoading(false));
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const th = { textAlign: 'left', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 12px', fontWeight: 700 };
  const td = { fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', padding: '12px', borderTop: '1px solid var(--border)' };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div data-testid="asesor-equipo-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>Equipo</h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: '4px 0 0' }}>Cómo va cada asesor · pipeline, conversión y seguimiento</p>
          </div>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="equipo-period"
            style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 }}>
            <option value="7d">7 días</option>
            <option value="30d">30 días</option>
            <option value="90d">90 días</option>
          </select>
        </div>

        {err === 'manager' ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13.5 }}>
            <AlertCircle size={34} color="var(--cream-3)" style={{ marginBottom: 12, opacity: 0.6 }} />
            <div>Esta vista es solo para <b style={{ color: 'var(--cream-2)' }}>gerentes</b> del equipo.</div>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando equipo…</div>
        ) : err === 'error' ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>No se pudo cargar el equipo.</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            <Users size={34} color="var(--cream-3)" style={{ marginBottom: 12, opacity: 0.5 }} />
            <div>Aún no hay asesores en el equipo.</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-block' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{PESO(avg)}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>Pipeline promedio del equipo · {rows.length} asesor{rows.length === 1 ? '' : 'es'}</div>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Asesor</th>
                    <th style={th}>Pipeline</th>
                    <th style={th}>vs prom</th>
                    <th style={th}>Leads</th>
                    <th style={th}>Conversión</th>
                    <th style={th}>Citas</th>
                    <th style={th}>Actividad 7d</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const vs = r.vs_team_avg_pct || 0;
                    return (
                      <tr key={r.asesor_id} data-testid={`equipo-row-${r.asesor_id}`}>
                        <td style={{ ...td, fontWeight: 800, color: 'var(--cream-3)' }}>{r.rank}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                        <td style={td}>{PESO(r.pipeline_value_mxn)}</td>
                        <td style={{ ...td, color: vs > 0 ? '#4ADE80' : vs < 0 ? '#F87171' : 'var(--cream-3)', fontWeight: 700 }}>{vs > 0 ? '+' : ''}{vs}%</td>
                        <td style={td}>{r.leads_active ?? '—'}</td>
                        <td style={td}>{r.conversion_rate_pct != null ? `${r.conversion_rate_pct}%` : '—'}</td>
                        <td style={td}>{r.citas_booked_30d ?? '—'}</td>
                        <td style={td}>{r.activity_score_7d ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdvisorLayout>
  );
}
