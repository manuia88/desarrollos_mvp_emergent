// F2.4.3 · Tarjeta "Demanda Potencial (Demografía)" — modelo EPRAV para el dev.
// Estima la demanda anual de una colonia AUNQUE no haya búsquedas: población × NSE × EPRAV
// → GAP vertical → captura objetivo. Lee /api/dev/demanda-demografica. Honesto: siempre estimado,
// supuestos visibles. Complementa al Grafo (búsquedas reales) con el potencial. Cero deuda.
import React, { useEffect, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import * as api from '../../api/developer';

const fmt = (n) => (n != null ? Number(n).toLocaleString('es-MX') : '—');

function Stat({ label, value, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 90 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: tone || 'var(--cream)' }}>{value}</div>
    </div>
  );
}

export default function DemandaDemograficaCard({ coloniaId, coloniaName, categoria = 'media' }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setData(null); setErr(false);
    api.getDemandaDemografica(coloniaId, categoria).then(setData).catch(() => setErr(true));
  }, [coloniaId, categoria]);

  const shell = (children) => (
    <Card data-testid="demanda-demografica-card" style={{ marginTop: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        DEMANDA POTENCIAL (DEMOGRAFÍA){coloniaName ? ` · ${coloniaName}` : ''}
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '0 0 12px' }}>
        Cuántas familias al año podrían comprar aquí — aunque no haya búsquedas todavía (modelo EPRAV del estudio 4S). Siempre estimado; se afina al conectar INEGI.
      </p>
      {children}
    </Card>
  );

  if (err) return shell(<div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>No se pudo calcular.</div>);
  if (!data) return shell(<div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Calculando…</div>);
  if (!coloniaId) return shell(<div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12.5 }}>Selecciona una colonia en el mapa para ver su demanda potencial.</div>);

  const bk = data.demanda_breakdown || {};
  return shell(
    <>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="Familias/año" value={fmt(data.demanda_anual_total)} />
        <Stat label="Buscan vertical" value={fmt(data.demanda_vertical)} />
        <Stat label="Hueco (GAP)" value={fmt(data.gap_vertical)} tone={data.gap_vertical > 0 ? '#22C55E' : 'var(--cream-2)'} />
        <Stat label="Captura objetivo" value={fmt(data.captura_objetivo)} tone="#a5b4fc" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Badge tone="neutral">Población {fmt(data.poblacion)}</Badge>
        <Badge tone="brand">NSE {data.nse_objetivo?.bandas?.join('+')} · {data.nse_objetivo?.participacion_pct}%</Badge>
        <Badge tone="neutral">Inventario vertical {fmt(data.inventario_vertical)}</Badge>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 4 }}>
        De dónde viene: demográfico {fmt(bk.demografico)} · movilidad {fmt(bk.movilidad)} · 2ª vivienda {fmt(bk.segunda_vivienda)} · migración {fmt(bk.migracion)}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', marginTop: 6 }}>◐ {data.lectura}</div>
    </>
  );
}
