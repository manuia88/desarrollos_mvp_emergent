/**
 * DesarrolladorFeedback — Retro de mercado del desarrollador (Batch 7 feature).
 * Muestra el índice de feedback ESTRUCTURADO de sus desarrollos (objeciones, atractores, perfil, gap
 * de producto por colonia). NUNCA muestra conversaciones — solo señales de taxonomía cerrada.
 * Backend: GET /api/dev/feedback-index (k-anonimato por colonia).
 */
import React, { useEffect, useState } from 'react';
import { getDevFeedbackIndex } from '../../api/feedbackSignals';

const LABEL = {
  precio: 'Precio', producto: 'Producto', amenidad: 'Amenidad', ubicacion: 'Ubicación',
  entrega: 'Tiempo de entrega', financiamiento: 'Financiamiento', timing_cliente: 'Timing del cliente',
  confianza: 'Confianza', competencia: 'Competencia',
  amenidades: 'Amenidades', diseno: 'Diseño', marca: 'Marca', tamano: 'Tamaño',
  tipo_comprador: 'Tipo de comprador', uso: 'Uso', urgencia: 'Urgencia', forma_pago: 'Forma de pago',
  composicion: 'Composición',
  primera_vivienda: '1ª vivienda', inversion: 'Inversión', segunda_casa: '2ª casa',
  upgrade: 'Upgrade', downsize: 'Downsize',
};
const lbl = (k) => LABEL[k] || (k || '').replace(/_/g, ' ');

function Barra({ data, total }) {
  const entries = Object.entries(data || {});
  if (!entries.length) return <p style={{ color: '#8a8a8a', fontSize: 13 }}>Sin datos aún.</p>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 150, fontSize: 13 }}>{lbl(k)}</span>
          <div style={{ flex: 1, background: '#1c1f2a', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(v / max) * 100}%`, minWidth: 2, height: 18,
              background: 'linear-gradient(90deg,#6366F1,#EC4899)' }} />
          </div>
          <span style={{ width: 40, textAlign: 'right', fontSize: 13, color: '#c9c9c9' }}>
            {v}{total ? ` · ${Math.round((v / total) * 100)}%` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DesarrolladorFeedback() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getDevFeedbackIndex()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div style={{ padding: 40 }}>Cargando retro de mercado…</div>;
  if (err) return <div style={{ padding: 40, color: '#EC4899' }}>Error: {err}</div>;

  const n = data?.n_leads_con_feedback || 0;
  return (
    <div style={{ padding: '32px 40px', maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Retro de mercado</h1>
      <p style={{ color: '#9a9a9a', marginBottom: 24 }}>
        Qué dicen los compradores de tus desarrollos — de {n} leads con feedback. Señales estructuradas
        (sin conversaciones). {data?.k_anonimato_min ? `Colonias con ≥${data.k_anonimato_min} señales.` : ''}
      </p>

      <div className="dmx-card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>¿Por qué NO avanzan? (objeciones)</h3>
        <Barra data={data?.objeciones} total={n} />
      </div>

      <div className="dmx-card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>¿Qué SÍ les gusta? (atractores)</h3>
        <Barra data={data?.atractores} total={n} />
      </div>

      {data?.perfil && Object.keys(data.perfil).length > 0 && (
        <div className="dmx-card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Perfil de tus compradores</h3>
          {Object.entries(data.perfil).map(([dim, dist]) => (
            <div key={dim} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#8a8a8a', marginBottom: 6 }}>{lbl(dim)}</div>
              <Barra data={dist} />
            </div>
          ))}
        </div>
      )}

      {data?.objeciones_por_colonia && Object.keys(data.objeciones_por_colonia).length > 0 && (
        <div className="dmx-card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Objeciones por colonia</h3>
          {Object.entries(data.objeciones_por_colonia).map(([col, dist]) => (
            <div key={col} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{col}</div>
              <Barra data={dist} />
            </div>
          ))}
        </div>
      )}

      {data?.recamaras_deseadas_promedio != null && (
        <div className="dmx-card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 8 }}>Gap de producto</h3>
          <p style={{ fontSize: 14 }}>
            Recámaras deseadas (promedio): <b>{data.recamaras_deseadas_promedio}</b>
          </p>
        </div>
      )}
    </div>
  );
}
