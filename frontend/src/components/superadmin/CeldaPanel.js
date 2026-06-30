// Superadmin · CELDA ATÓMICA (P6) — el átomo del cubo: un cruce (medida × dónde × tipología) como UN dato
// independiente, con su OFERTA y su DEMANDA al lado, scores de la zona, comparativo, lectura y drill nano↔macro.
// Consume GET /demand-intel/celda (terminal_celda.build_celda). Lenguaje simple, cero jerga.
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getCelda } from '../../api/superadminDemandIntel';

// Medidas legibles (etiqueta humana → id real del registro). Curado: las que el cubo calcula vivo.
const MEDIDAS = [
  { id: 'of.precio_m2', label: 'Precio por m²' },
  { id: 'of.precio_absoluto', label: 'Precio total' },
  { id: 'of.inventario_activo', label: 'Inventario disponible' },
  { id: 'of.sell_through', label: 'Ritmo de venta' },
];
const TIPOS = [{ id: '', label: 'Todas' }, { id: 'depto', label: 'Departamento' }, { id: 'casa', label: 'Casa' }];

const lbl = { fontSize: 11, color: '#a8a8b3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const fieldLbl = { fontSize: 11, color: '#a8a8b3', fontWeight: 600, marginBottom: 2 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px', minWidth: 140, cursor: 'pointer',
};
const inputStyle = { ...selStyle, cursor: 'text' };
const drillBtn = {
  padding: '6px 13px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
  background: 'rgba(255,255,255,0.05)', color: '#ddd', fontSize: 12, fontWeight: 600,
};

// Formato amable de números (MXN / m² / unidades).
const fmt = (v, unidad) => {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (unidad === '$/m²' || /\$|mxn|precio/i.test(unidad || '')) return '$' + Math.round(v).toLocaleString('es-MX');
    return v.toLocaleString('es-MX', { maximumFractionDigits: 1 });
  }
  return String(v);
};

// Fila etiqueta→valor dentro de una columna (oferta/demanda).
function Fila({ k, v, suf }) {
  if (v == null) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: 12.5, color: '#b9b9c4' }}>{k}</span>
      <span style={{ fontSize: 12.5, color: '#fff', fontWeight: 600 }}>{typeof v === 'number' ? v.toLocaleString('es-MX', { maximumFractionDigits: 1 }) : v}{suf || ''}</span>
    </div>
  );
}

export default function CeldaPanel({ geoSel }) {
  const [measure, setMeasure] = useState('of.precio_m2');
  const [geoNivel, setGeoNivel] = useState('colonia');
  const [geoValor, setGeoValor] = useState((geoSel && (geoSel.valor || geoSel.id)) || 'polanco');
  const [tipologia, setTipologia] = useState('depto');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async (overrides = {}) => {
    const params = {
      measure, geo_nivel: geoNivel, geo_valor: geoValor, tipologia, lente: 'superadmin', ...overrides,
    };
    setLoading(true); setError(null);
    try {
      const d = await getCelda(params);
      setData(d);
      if (overrides.geo_nivel) setGeoNivel(overrides.geo_nivel);
      if (overrides.geo_valor !== undefined) setGeoValor(overrides.geo_valor);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [measure, geoNivel, geoValor, tipologia]);

  useEffect(() => { cargar(); }, [measure, tipologia]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = (data && data.oferta) || {};
  const dm = (data && data.demanda) || {};
  const medidaLabel = (MEDIDAS.find((m) => m.id === measure) || {}).label || measure;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Selectores: qué celda ── */}
      <Card style={{ padding: '14px 18px' }}>
        <div style={lbl}>La celda atómica</div>
        <div style={{ fontSize: 13, color: '#b9b9c4', marginBottom: 12 }}>
          Un cruce del cubo como un solo dato vivo: su valor, su <b style={{ color: '#fff' }}>oferta</b> y su <b style={{ color: '#fff' }}>demanda</b> al lado, y cómo se compara. Baja o sube de nivel sin perder el filtro.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <div><div style={fieldLbl}>Qué mido</div>
            <select style={selStyle} value={measure} onChange={(e) => setMeasure(e.target.value)}>
              {MEDIDAS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select></div>
          <div><div style={fieldLbl}>Tipo de producto</div>
            <select style={selStyle} value={tipologia} onChange={(e) => setTipologia(e.target.value)}>
              {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select></div>
          <div><div style={fieldLbl}>Colonia</div>
            <input style={inputStyle} value={geoValor} onChange={(e) => setGeoValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') cargar({ geo_nivel: 'colonia' }); }} placeholder="ej. polanco" /></div>
          <button style={{ ...drillBtn, background: 'var(--theme, #6366f1)', color: '#fff', borderColor: 'transparent' }}
            onClick={() => cargar({ geo_nivel: 'colonia' })}>Ver celda</button>
        </div>
      </Card>

      {error && <Card style={{ padding: '12px 16px', color: '#fca5a5', fontSize: 13 }}>No se pudo cargar la celda: {error}</Card>}
      {loading && <Card style={{ padding: '20px', color: '#a8a8b3', fontSize: 13 }}>Calculando la celda…</Card>}

      {data && !loading && (
        <>
          {/* ── Cabecera: valor + lectura + procedencia ── */}
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={lbl}>{medidaLabel} · {data.ejes?.geo?.id} {tipologia ? `· ${(TIPOS.find((t) => t.id === tipologia) || {}).label}` : ''}</div>
                <div style={{ fontSize: 34, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>
                  {fmt(data.valor, data.unidad)} <span style={{ fontSize: 15, color: '#a8a8b3', fontWeight: 500 }}>{data.unidad}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                {data.es_latente
                  ? <Badge tone="warn">Muestra insuficiente</Badge>
                  : <Badge tone="ok">Confianza {data.confidence || '—'}{data.n ? ` · n=${data.n}` : ''}</Badge>}
                {data.fuente && <span style={{ fontSize: 10.5, color: '#8a8a96', maxWidth: 260, textAlign: 'right' }}>Fuente: {data.fuente}</span>}
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13.5, color: '#e6e6ee' }}>
              {data.lectura}
            </div>
          </Card>

          {/* ── OFERTA ↔ DEMANDA lado a lado (la regla bilateral) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ ...lbl, color: '#86efac' }}>◤ Oferta · quién lo ofrece</div>
              <Fila k="Inventario disponible" v={o.inventario} suf=" u." />
              <Fila k="Vendidas" v={o.vendidas} suf=" u." />
              <Fila k="Unidades totales" v={o.unidades_total} suf=" u." />
              <Fila k="Precio medio" v={o.precio_med != null ? fmt(o.precio_med, '$') : null} />
              <Fila k="Precio por m²" v={o.ppm2_med != null ? fmt(o.ppm2_med, '$') + '/m²' : null} />
              <Fila k="m² promedio" v={o.m2_med} suf=" m²" />
              <Fila k="Ritmo de venta" v={o.sell_through != null ? o.sell_through + '%' : null} />
              {o.inventario == null && o.unidades_total == null && <div style={{ fontSize: 12, color: '#8a8a96', paddingTop: 6 }}>Sin oferta registrada en esta celda todavía.</div>}
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ ...lbl, color: '#93c5fd' }}>◢ Demanda · quién lo busca</div>
              <Fila k="Búsquedas (90 días)" v={dm.busquedas} />
              <Fila k="Segmentos buscados" v={dm.n_segmentos} />
              <Fila k="Tipología más buscada" v={dm.tipologia_buscada} />
              <Fila k="Banda de precio buscada" v={dm.banda_precio} />
              {dm.lectura_demanda && <div style={{ fontSize: 12, color: '#9a9aa6', paddingTop: 8 }}>{dm.lectura_demanda}</div>}
              {dm.busquedas == null && <div style={{ fontSize: 12, color: '#8a8a96', paddingTop: 6 }}>Sin demanda registrada en esta celda todavía.</div>}
            </Card>
          </div>

          {/* ── Scores de la zona + comparativo ── */}
          {(data.scores_zona?.length > 0 || (data.comparativo && Object.keys(data.comparativo).length > 0)) && (
            <Card style={{ padding: '14px 18px' }}>
              <div style={lbl}>Contexto de la zona</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                {(data.scores_zona || []).map((s) => (
                  <div key={s.codigo} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 9999 }}>
                    <span style={{ fontSize: 12, color: '#b9b9c4' }}>{s.nombre}</span>
                    <span style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>{s.valor != null ? Math.round(s.valor * 10) / 10 : '—'}{s.letra ? ` · ${s.letra}` : ''}</span>
                  </div>
                ))}
                {data.comparativo?.texto && <span style={{ fontSize: 12.5, color: '#b9b9c4' }}>· {data.comparativo.texto}</span>}
              </div>
            </Card>
          )}

          {/* ── Drill nano↔macro (navegable, acumulando filtro) ── */}
          <Card style={{ padding: '12px 18px' }}>
            <div style={{ ...lbl, marginBottom: 8 }}>Navegar · de lo nano a lo macro</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(data.drill?.padres || []).map((p, i) => (
                <button key={`p${i}`} style={drillBtn} disabled={!p.id}
                  onClick={() => cargar({ geo_nivel: p.nivel, geo_valor: p.id })}>↑ {p.label}</button>
              ))}
              {(data.drill?.hijos || []).map((c, i) => (
                <button key={`c${i}`} style={{ ...drillBtn, opacity: 0.7 }} title="Próximamente: lista de hijos">↓ {c.label}</button>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
