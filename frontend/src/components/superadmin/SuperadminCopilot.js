// Copiloto · panel founder/superadmin — inteligencia agregada de toda la operación.
// Alertas accionables + adopción + eficacia + objeciones del mercado + guiones top +
// ranking de asesores. Lee /api/asesor/superadmin/copilot/overview.
import React, { useCallback, useEffect, useState } from 'react';
import { FaRobot } from 'react-icons/fa6';
import { RefreshCw, Loader2, Users, MessageCircle, TrendingUp } from 'lucide-react';
import PortalLayout from '../shared/PortalLayout';

const API = process.env.REACT_APP_BACKEND_URL || '';
const BASE = `${API}/api/asesor/superadmin/copilot`;

// Auth via cookie httponly (credentials:'include'); sin Bearer/localStorage (XSS).
function authHeaders() {
  return {};
}

const SCRIPT_LABEL = {
  que_decirle: 'Qué decirle', objecion: 'Objeción', recomendar: 'Propiedad',
  afinar_gusto: 'Conoce su gusto', seguimiento: 'Seguimiento', cerrar: 'Cierre',
};
const ALERT_STYLE = {
  good: { bg: 'rgba(31,160,106,0.10)', border: 'rgba(31,160,106,0.30)', color: '#1FA06A', icon: '✅' },
  warn: { bg: 'rgba(242,99,91,0.10)', border: 'rgba(242,99,91,0.30)', color: '#F2635B', icon: '⚠️' },
  info: { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.28)', color: '#818CF8', icon: '💡' },
};

function CopilotBody() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/overview?days=${days}`, { headers: authHeaders(), credentials: 'include' });
      setData(r.ok ? await r.json() : null);
    } catch { setData(null); } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const card = { background: 'var(--surface, rgba(13,16,23,0.92))', border: '1px solid var(--border, rgba(240,235,224,0.10))', borderRadius: 14, padding: 16 };
  const kpi = { ...card, textAlign: 'center' };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px 60px', color: 'var(--cream, #F0EBE0)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}><FaRobot size={20} color="#818CF8" /> Copiloto · inteligencia de operación</h1>
          <p style={{ fontSize: 13, color: 'var(--cream-3, rgba(240,235,224,0.6))', margin: '6px 0 0' }}>Cómo usan tus asesores el Copiloto, qué funciona y qué objeta el mercado.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${days === d ? '#818CF8' : 'var(--border, rgba(240,235,224,0.15))'}`, background: days === d ? 'rgba(99,102,241,0.15)' : 'transparent', color: days === d ? '#818CF8' : 'var(--cream-3, rgba(240,235,224,0.6))', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{d}d</button>
          ))}
          <button type="button" onClick={load} title="Actualizar" style={{ padding: 7, borderRadius: 9, border: '1px solid var(--border, rgba(240,235,224,0.15))', background: 'transparent', color: 'var(--cream-3, rgba(240,235,224,0.6))', cursor: 'pointer' }}><RefreshCw size={14} /></button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 50, textAlign: 'center', color: 'var(--cream-3, rgba(240,235,224,0.6))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Cargando…</div>
      ) : !data ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>No se pudo cargar.</div>
      ) : (
        <>
          {/* Alertas accionables (lo primero que ve el founder) */}
          {(data.alerts || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {data.alerts.map((a, i) => {
                const s = ALERT_STYLE[a.level] || ALERT_STYLE.info;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 14px', borderRadius: 11, background: s.bg, border: `1px solid ${s.border}`, fontSize: 13 }}>
                    <span style={{ fontSize: 15, lineHeight: 1.2 }}>{s.icon}</span>
                    <span style={{ color: 'var(--cream, #F0EBE0)', lineHeight: 1.45 }}>{a.text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
            <div style={kpi}><Users size={16} color="#818CF8" /><div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{data.active_advisors}</div><div style={{ fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>asesores activos</div></div>
            <div style={kpi}><MessageCircle size={16} color="#818CF8" /><div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{data.total_used}</div><div style={{ fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>sugerencias usadas</div></div>
            <div style={kpi}><TrendingUp size={16} color={data.response_rate >= 0.5 ? '#1FA06A' : '#818CF8'} /><div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: data.response_rate >= 0.5 ? '#1FA06A' : 'var(--cream)' }}>{Math.round((data.response_rate || 0) * 100)}%</div><div style={{ fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>respuesta positiva</div></div>
            <div style={kpi}><FaRobot size={15} color="#818CF8" /><div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{data.total_ask}</div><div style={{ fontSize: 11, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>preguntas al Copiloto</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Objeciones del mercado */}
            <div style={card}>
              <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3, rgba(240,235,224,0.6))', marginBottom: 12 }}>Objeciones que dominan el mercado</div>
              {(data.top_objeciones || []).length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>Aún sin datos.</div>
              ) : data.top_objeciones.map((o) => {
                const max = data.top_objeciones[0].count || 1;
                return (
                  <div key={o.type} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}><span>{o.label}</span><b>{o.count}</b></div>
                    <div style={{ height: 6, borderRadius: 4, background: 'rgba(240,235,224,0.08)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.round((o.count / max) * 100)}%`, background: '#F2635B' }} /></div>
                  </div>
                );
              })}
            </div>
            {/* Guiones top */}
            <div style={card}>
              <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3, rgba(240,235,224,0.6))', marginBottom: 12 }}>Sugerencias más usadas</div>
              {(data.top_scripts || []).length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>Aún sin datos.</div>
              ) : data.top_scripts.map((s) => {
                const max = data.top_scripts[0].count || 1;
                return (
                  <div key={s.type} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}><span>{SCRIPT_LABEL[s.type] || s.type}</span><b>{s.count}</b></div>
                    <div style={{ height: 6, borderRadius: 4, background: 'rgba(240,235,224,0.08)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.round((s.count / max) * 100)}%`, background: '#6D4AFF' }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ranking de asesores */}
          <div style={card}>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3, rgba(240,235,224,0.6))', marginBottom: 12 }}>Quién aprovecha más el Copiloto</div>
            {(data.top_advisors || []).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>Aún nadie ha usado el Copiloto en este período.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {data.top_advisors.map((a, i) => (
                  <div key={a.owner_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, background: 'rgba(240,235,224,0.04)' }}>
                    <span style={{ width: 20, fontSize: 12, fontWeight: 800, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--cream-3, rgba(240,235,224,0.6))' }}>{a.used} usadas</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: a.rate >= 0.5 ? '#1FA06A' : 'var(--cream-2, rgba(240,235,224,0.8))' }}>{Math.round((a.rate || 0) * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SuperadminCopilot(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <CopilotBody />
    </PortalLayout>
  );
}
