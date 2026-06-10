// F2.1.2 · Tarjeta "Qué Quiere La Demanda Aquí" — el Grafo del Comprador para el dev.
// Por colonia × etapa de vida: cuánta demanda y qué producto pide (recámaras, precio, amenidades,
// terraza). Lee /api/dev/grafo-comprador (motor grafo_comprador_engine). Honesto: si hay pocas
// búsquedas lo dice; k-anonimato oculta el producto de celdas con muy poca señal. Cero deuda.
import React, { useEffect, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import * as api from '../../api/developer';

const SEG_TONE = {
  inversionista: 'brand', pareja_con_hijos: 'ok', familia_consolidada: 'ok',
  soltero_joven: 'ok', pareja_sin_hijos: 'ok', indefinido: 'neutral',
};
const fmtMoney = (n) => (n ? `$${(n / 1e6).toFixed(1)}M` : '—');

function Chip({ children, muted }) {
  return (
    <span style={{
      fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
      background: muted ? 'rgba(var(--cream-rgb),0.04)' : 'rgba(99,102,241,0.12)',
      border: '1px solid var(--border)', color: muted ? 'var(--cream-3)' : 'var(--cream)',
    }}>{children}</span>
  );
}

export default function GrafoCompradorCard({ coloniaId, coloniaName }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setData(null); setErr(false);
    api.getGrafoComprador(coloniaId).then(setData).catch(() => setErr(true));
  }, [coloniaId]);

  const shell = (children) => (
    <Card data-testid="grafo-comprador-card" style={{ marginTop: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        QUÉ QUIERE LA DEMANDA AQUÍ{coloniaName ? ` · ${coloniaName}` : ''}
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '0 0 12px' }}>
        Por etapa de vida, qué producto busca la gente en esta zona. Anónimo y honesto: si hay pocas búsquedas, lo dice.
      </p>
      {children}
    </Card>
  );

  if (err) return shell(<div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>No se pudo cargar el Grafo del Comprador.</div>);
  if (!data) return shell(<div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Cargando…</div>);

  const colonias = data.colonias || [];
  const target = coloniaId ? (colonias.find(c => c.colonia_id === coloniaId) || null) : (colonias[0] || null);

  if (!target) {
    return shell(
      <div data-testid="grafo-empty" style={{ padding: '14px 0', textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12.5 }}>
        ◐ {data.lectura || 'Aún sin búsquedas suficientes en esta zona — el grafo se llena solo conforme entra demanda.'}
      </div>
    );
  }

  return shell(
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge tone="brand">{target.demanda_total} búsquedas</Badge>
        <Badge tone="neutral">Demanda {target.etiqueta}</Badge>
        {target.segmento_dominante_label && (
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
            Domina: <b>{target.segmento_dominante_label}</b>
          </span>
        )}
      </div>

      {(target.segmentos || []).map(s => (
        <div key={s.segmento} data-testid={`grafo-seg-${s.segmento}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>{s.label}</div>
            <Badge tone={SEG_TONE[s.segmento] || 'neutral'}>{s.demanda}</Badge>
          </div>
          {s.producto ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {s.producto.recamaras != null && <Chip>{s.producto.recamaras} rec</Chip>}
              {s.producto.banos != null && <Chip>{s.producto.banos} baños</Chip>}
              {s.producto.cajones != null && <Chip>{s.producto.cajones} cajones</Chip>}
              {s.producto.precio_tipico ? <Chip>{fmtMoney(s.producto.precio_tipico)}</Chip> : null}
              {s.producto.terraza_pct > 0 && <Chip>{s.producto.terraza_pct}% quiere terraza</Chip>}
              {(s.producto.top_amenidades || []).slice(0, 3).map(a => <Chip key={a} muted>{a}</Chip>)}
            </div>
          ) : (
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>{s.nota || 'Sin dato suficiente.'}</div>
          )}
        </div>
      ))}

      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 10 }}>
        ◐ {data.lectura} · Mínimo {data.k_anonimato} búsquedas por celda para mostrar producto (privacidad).
      </div>
    </>
  );
}
