import React, { useState } from 'react';
import { Card, Badge } from '../advisor/primitives';

// INDICADOR universal — cada número con su VALOR: nombre humano · valor · comparativo (vs ciudad) ·
// granularidad (nano→macro) · dimensión · uso (¿para qué?) · fuente (procedencia) · n + confianza.
// Resuelve la queja: nada de jerga de motores, todo legible y accionable.

const fmt = (v, unidad) => {
  if (v == null) return '—';
  if (typeof v === 'object') return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(' · ');
  if (typeof v === 'string') return v;
  if (unidad === 'MXN') return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}k`;
  if (unidad === '%') return `${v}%`;
  if (unidad === '$/m²') return `$${Math.round(v).toLocaleString('es-MX')}`;
  return typeof v === 'number' ? v.toLocaleString('es-MX') : String(v);
};

const toneConf = (c) => (c === 'alta' ? 'ok' : c === 'media' ? 'warn' : 'neutral');
const colorSenal = (s) => (s === 'alta' || s === 'demanda>oferta' ? '#22c55e' : (s === 'baja' || s === 'oferta>demanda') ? '#f59e0b' : '#888');
const arrow = (s) => (s === 'alta' ? '▲' : s === 'baja' ? '▼' : '');

export default function Indicador({ ind, compact = false }) {
  const [verFuente, setVerFuente] = useState(false);
  if (!ind) return null;
  const lat = ind.latente;
  const comp = ind.comparativo || {};

  return (
    <Card style={{ padding: '13px 16px', opacity: lat ? 0.62 : 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* nombre + badges de contexto */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <strong style={{ fontSize: 13.5 }}>{ind.nombre}</strong>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {ind.granularidad && <Badge tone="neutral">{ind.granularidad}</Badge>}
          {ind.confianza && <Badge tone={toneConf(ind.confianza)}>conf {ind.confianza}</Badge>}
        </div>
      </div>

      {/* valor grande (o latente) */}
      {lat ? (
        <div style={{ fontSize: 12.5, color: '#f59e0b', padding: '4px 0' }}>
          Latente — <span style={{ color: '#999' }}>{ind.razon_latente || 'sin dato aún'}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{fmt(ind.valor, ind.unidad)}</span>
          {ind.unidad && ind.unidad !== 'MXN' && ind.unidad !== '%' && <span style={{ fontSize: 12, color: '#888' }}>{ind.unidad}</span>}
          {comp.texto && (
            <span style={{ fontSize: 12, color: colorSenal(comp.señal), fontWeight: 600 }}>{arrow(comp.señal)} {comp.texto}</span>
          )}
        </div>
      )}

      {/* oferta vs demanda (cuando aplica) */}
      {!lat && (ind.oferta != null || ind.demanda != null) && (
        <div style={{ display: 'flex', gap: 10, fontSize: 12, alignItems: 'center' }}>
          <span style={{ color: '#22c55e' }}>oferta <strong>{ind.oferta}</strong></span>
          <span style={{ color: '#a78bfa' }}>demanda <strong>{ind.demanda}</strong></span>
          {ind.gap != null && (
            <Badge tone={ind.gap > 0 ? 'ok' : ind.gap < 0 ? 'warn' : 'neutral'}>
              {ind.gap > 0 ? `falta ${ind.gap}` : ind.gap < 0 ? `sobra ${-ind.gap}` : 'equilibrio'}
            </Badge>
          )}
        </div>
      )}

      {/* uso: ¿para qué sirve? */}
      {ind.uso && !compact && <div style={{ fontSize: 11.5, color: '#9aa', fontStyle: 'italic', lineHeight: 1.4 }}>{ind.uso}</div>}

      {/* dimensión + fuente (procedencia) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#777', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 5 }}>
        <span>{ind.dimension} · n={ind.n ?? '—'}</span>
        {ind.fuente && (
          <button onClick={() => setVerFuente((v) => !v)} style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
            {verFuente ? 'ocultar fuente' : 'fuente'}
          </button>
        )}
      </div>
      {verFuente && ind.fuente && <div style={{ fontSize: 10.5, color: '#888', background: 'rgba(255,255,255,0.03)', padding: '5px 7px', borderRadius: 5 }}>de dónde sale: {ind.fuente}</div>}
    </Card>
  );
}
