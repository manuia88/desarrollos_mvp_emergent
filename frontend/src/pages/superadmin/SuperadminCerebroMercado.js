/**
 * F2.5 — SuperadminCerebroMercado (page).
 * Ruta: /superadmin/cerebro-mercado · Layout: SuperadminLayout (sección INTELIGENCIA).
 * "Cómo Aprende El Mercado": el Cerebro guarda cada predicción y, cuando pasa algo real,
 * la compara (predicción↔realidad), mide su error y descubre palancas. Lee
 * /api/superadmin/cerebro-mercado (cerebro_mercado_engine, reusa el Cerebro E4). Cero deuda.
 */
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getCerebroMercado } from '../../api/superadmin';

export default function SuperadminCerebroMercado({ user, onLogout, embedded }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => { getCerebroMercado().then(setData).catch(() => setErr(true)); }, []);

  const note = (t) => (
    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-3)', padding: '24px 0', textAlign: 'center' }}>{t}</div>
  );
  const cardStyle = { marginBottom: 14, padding: 16, borderRadius: 14, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)' };
  const h = { fontFamily: 'DM Sans, sans-serif', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 10 };

  const pal = data?.palancas || {};

  return (
    <SuperadminLayout user={user} onLogout={onLogout} bare={embedded}>
      <div style={{ padding: '8px 0 12px' }}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Inteligencia · Aprendizaje</div>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '4px 0 2px' }}>Cómo Aprende El Mercado</h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-3)', margin: 0, maxWidth: 760 }}>
          El Cerebro guarda cada predicción que hace y, cuando pasa algo real (una venta), la compara con lo que predijo: mide su error y descubre qué mueve la venta. Es el loop que vuelve la plataforma un organismo que aprende.
        </p>
      </div>

      {err && note('No se pudo cargar.')}
      {!err && !data && note('Cargando…')}

      {data && (
        <>
          {data.drift && (
            <div style={{ ...cardStyle, border: `1px solid ${data.drift.drift ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.35)'}`, background: data.drift.drift ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)' }}>
              <div style={h}>Autovigilancia del modelo (drift)</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: data.drift.drift ? '#fca5a5' : 'var(--cream-2)', fontWeight: data.drift.drift ? 600 : 400 }}>
                {data.drift.drift ? '⚠️ ' : '● '}{data.drift.lectura}
              </div>
              {(data.drift.señales || []).map((s, i) => (
                <div key={i} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>· {s.label}: {s.detalle} (recientes {s.n_reciente} vs histórico {s.n_baseline})</div>
              ))}
            </div>
          )}
          <div style={cardStyle}>
            <div style={h}>Qué tan bien le atina (predicción ↔ realidad)</div>
            {(data.calibracion || []).map((c) => (
              <div key={c.kind} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream)' }}>{c.label}</span>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: c.n ? 'var(--cream-2)' : 'var(--cream-3)' }}>{c.summary}</span>
              </div>
            ))}
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 10 }}>
              ◐ {data.predicciones?.resueltas || 0} predicciones calificadas · {data.predicciones?.abiertas || 0} esperando resultado.
            </div>
          </div>

          <div style={cardStyle}>
            <div style={h}>Palancas que mueven la venta</div>
            {(pal.palancas || []).length === 0 && note(pal.lectura || 'Aún aprendiendo.')}
            {(pal.palancas || []).map((p) => (
              <div key={p.factor} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream)' }}>{p.factor}</span>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--cream-2)' }}>
                  {p.vendido_pct}% vendido · <b style={{ color: p.lift_pp >= 0 ? '#22C55E' : '#ef4444' }}>{p.lift_pp >= 0 ? '+' : ''}{p.lift_pp} pp</b> · n={p.n}
                </span>
              </div>
            ))}
            {(pal.palancas || []).length > 0 && (
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 10 }}>◐ {pal.lectura}</div>
            )}
          </div>

          {(data.lecciones || []).length > 0 && (
            <div style={cardStyle}>
              <div style={h}>Lecciones recientes</div>
              {(data.lecciones || []).map((l, i) => (
                <div key={i} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--cream-2)', padding: '5px 0' }}>· {l.text || l}</div>
              ))}
            </div>
          )}

          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)' }}>◐ {data.lectura}</div>
        </>
      )}
    </SuperadminLayout>
  );
}
