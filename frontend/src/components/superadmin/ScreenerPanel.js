// Superadmin · SCREENER (buscar por criterios) — el buscador del ANALISTA.
// Pones condiciones sobre métricas ("se busca terraza más de lo que hay" Y "precio/m² bajo")
// y te devuelve la LISTA de colonias que cumplen TODAS (AND), ordenada.
// Reusa los endpoints /screener/metricas (catálogo) y /screener/buscar (POST body = criterios).
// Cero datos inventados: si una métrica está latente, esa colonia simplemente no hace match.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getScreenerMetricas, postScreenerBuscar } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px',
};
const inputStyle = { ...selStyle };
const btnStyle = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: 'var(--theme, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600,
};
const btnGhost = { ...btnStyle, background: 'rgba(255,255,255,0.05)', color: '#bbb' };
const th = {
  textAlign: 'left', fontSize: 10.5, color: '#888', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: 0.4, padding: '6px 10px 8px', borderBottom: '1px solid rgba(255,255,255,0.10)', whiteSpace: 'nowrap',
};
const td = { fontSize: 12, color: '#bbb', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };

// Formatea un valor según la unidad de su métrica (números grandes a $X/m² o Xk; gaps/enteros como enteros).
function fmtVal(v, unidad) {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v);
  const u = unidad || '';
  if (u === '$/m²') return `$${Math.round(v / 1000)}k/m²`;
  if (u === 'MXN') return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString('es-MX')}`;
  if (u === '%') return `${Number.isInteger(v) ? v : +v.toFixed(1)}%`;
  if (u === 'x') return `${+v.toFixed(2)}x`;
  if (u === 'idx') return `${+v.toFixed(2)}`;
  // unidades/búsquedas/señales/u·mes → entero si es entero, si no 1 decimal
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return Number.isInteger(v) ? v.toLocaleString('es-MX') : (+v.toFixed(1)).toLocaleString('es-MX');
}

export default function ScreenerPanel() {
  const [cat, setCat] = useState(null);       // {metricas, operadores, ejemplo}
  const [catErr, setCatErr] = useState(null);

  const [filas, setFilas] = useState([]);     // [{metrica, op, valor}]
  const [ordenarPor, setOrdenarPor] = useState('');
  const [desc, setDesc] = useState(true);

  const [data, setData] = useState(null);     // respuesta de /screener/buscar
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getScreenerMetricas()
      .then((d) => {
        setCat(d);
        const metricas = d?.metricas || [];
        const ej = (d?.ejemplo || []).filter((c) => metricas.some((m) => m.id === c.metrica));
        const inicio = ej.length > 0
          ? ej.map((c) => ({ metrica: c.metrica, op: c.op, valor: String(c.valor) }))
          : (metricas[0] ? [{ metrica: metricas[0].id, op: (d?.operadores?.[0]?.id) || 'gt', valor: '' }] : []);
        setFilas(inicio);
        setOrdenarPor(inicio[0]?.metrica || metricas[0]?.id || '');
      })
      .catch((e) => setCatErr(e.message));
  }, []);

  const metricas = cat?.metricas || [];
  const operadores = cat?.operadores || [];
  const metById = useMemo(() => Object.fromEntries(metricas.map((m) => [m.id, m])), [metricas]);

  // métricas en uso (las de las filas) → opciones del "ordenar por"
  const usadas = useMemo(() => {
    const ids = filas.map((f) => f.metrica).filter(Boolean);
    return metricas.filter((m) => ids.includes(m.id));
  }, [filas, metricas]);

  const setFila = (i, patch) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addFila = () => setFilas((fs) => [...fs, { metrica: metricas[0]?.id || '', op: operadores[0]?.id || 'gt', valor: '' }]);
  const delFila = (i) => setFilas((fs) => fs.filter((_, j) => j !== i));

  const buscar = () => {
    const criterios = filas
      .filter((f) => f.metrica && f.op && f.valor !== '' && f.valor != null && !isNaN(Number(f.valor)))
      .map((f) => ({ metrica: f.metrica, op: f.op, valor: Number(f.valor) }));
    if (criterios.length === 0) { setErr('Agrega al menos un criterio con número.'); return; }
    const orden = usadas.some((m) => m.id === ordenarPor) ? ordenarPor : criterios[0].metrica;
    setLoading(true); setErr(null);
    postScreenerBuscar(criterios, { ordenar_por: orden, desc })
      .then((d) => setData(d))
      .catch((e) => { setData(null); setErr(e.message); })
      .finally(() => setLoading(false));
  };

  if (catErr) return <Card style={{ ...card, color: '#dc2626' }}>{catErr}</Card>;
  if (!cat) return <Card style={card}>Cargando métricas del screener…</Card>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ── INTRO en lenguaje simple ──────────────────────────────────────── */}
      <Card style={{ ...card, borderLeft: '3px solid var(--theme, #6366f1)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#eee', marginBottom: 6 }}>
          Busca oportunidades por criterio
        </div>
        <div style={{ fontSize: 12.5, color: '#bbb', lineHeight: 1.55 }}>
          Pones condiciones sobre las métricas y te devuelve las colonias que las cumplen <strong style={{ color: '#ddd' }}>todas</strong>.
          {' '}Ej: colonias donde se busca <em>terraza</em> más de lo que hay <span style={{ color: 'var(--theme)' }}>Y</span> el precio por m² está bajo.
        </div>
      </Card>

      {/* ── CONSTRUCTOR DE CRITERIOS ──────────────────────────────────────── */}
      <div>
        <div style={{ ...lbl, fontSize: 12, marginBottom: 4 }}>Tus criterios</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10, lineHeight: 1.5 }}>
          Cada fila es una condición. Se cumplen <strong style={{ color: '#aaa' }}>todas a la vez</strong> (Y).
        </div>
        <Card style={card}>
          <div style={{ display: 'grid', gap: 9 }}>
            {filas.map((f, i) => {
              const m = metById[f.metrica];
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select style={{ ...selStyle, minWidth: 240 }} value={f.metrica} onChange={(e) => setFila(i, { metrica: e.target.value })}>
                    {metricas.map((mm) => <option key={mm.id} value={mm.id}>{mm.label}</option>)}
                  </select>
                  <select style={{ ...selStyle, width: 64, textAlign: 'center' }} value={f.op} onChange={(e) => setFila(i, { op: e.target.value })}>
                    {operadores.map((o) => <option key={o.id} value={o.id}>{o.txt}</option>)}
                  </select>
                  <input
                    style={{ ...inputStyle, width: 120 }} value={f.valor} type="number"
                    placeholder="número"
                    onChange={(e) => setFila(i, { valor: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
                  />
                  {m?.unidad && <span style={{ fontSize: 11, color: '#777' }}>{m.unidad}</span>}
                  <button
                    style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}
                    title="Quitar criterio" onClick={() => delFila(i)}
                    disabled={filas.length <= 1}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button style={btnGhost} onClick={addFila}>+ agregar criterio</button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#888' }}>Ordenar por</span>
              <select style={{ ...selStyle, minWidth: 200 }} value={usadas.some((m) => m.id === ordenarPor) ? ordenarPor : (usadas[0]?.id || '')} onChange={(e) => setOrdenarPor(e.target.value)}>
                {usadas.length === 0
                  ? <option value="">—</option>
                  : usadas.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#888' }}>Dirección</span>
              <button style={btnGhost} onClick={() => setDesc((v) => !v)}>
                {desc ? 'Mayor primero ▼' : 'Menor primero ▲'}
              </button>
            </div>

            <button style={btnStyle} onClick={buscar} disabled={loading}>
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {err && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{err}</div>}
        </Card>
      </div>

      {/* ── RESULTADO ──────────────────────────────────────────────────────── */}
      {loading && <Card style={card}>Recorriendo colonias…</Card>}
      {data && !loading && <Resultado data={data} metById={metById} ordenarPor={data.ordenar_por} />}
    </div>
  );
}

function Resultado({ data, metById, ordenarPor }) {
  const usadas = data.metricas_usadas || [];
  const resultados = data.resultados || [];

  return (
    <div>
      {/* lectura grande ("3 de 15 colonias cumplen: …") */}
      <Card style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#eee', lineHeight: 1.4 }}>{data.lectura}</div>
      </Card>

      {data.total === 0 ? (
        <Card style={{ ...card, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 13, color: '#fcd34d', fontWeight: 600 }}>Ninguna colonia cumple — afloja los criterios.</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Prueba con menos condiciones o números menos exigentes. Una métrica latente (sin datos aún) nunca encuentra match.
          </div>
        </Card>
      ) : (
        <Card style={card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>Colonia</th>
                  <th style={th}>Alcaldía</th>
                  {usadas.map((mid) => {
                    const m = metById[mid];
                    const isOrden = mid === ordenarPor;
                    return (
                      <th key={mid} style={{ ...th, textAlign: 'right', color: isOrden ? 'var(--theme)' : '#888' }}>
                        {m?.label || mid}{isOrden ? ' ↓' : ''}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, i) => (
                  <tr key={r.colonia || i}>
                    <td style={{ ...td, color: '#ddd', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.nombre || r.colonia}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.alcaldia || '—'}</td>
                    {usadas.map((mid) => {
                      const isOrden = mid === ordenarPor;
                      return (
                        <td key={mid} style={{
                          ...td, textAlign: 'right', whiteSpace: 'nowrap',
                          color: isOrden ? '#fff' : '#bbb', fontWeight: isOrden ? 700 : 400,
                          background: isOrden ? 'rgba(99,102,241,0.08)' : 'transparent',
                        }}>
                          {fmtVal(r.valores?.[mid], metById[mid]?.unidad)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: '#777', marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone="brand">{data.total} de {data.universo} colonias</Badge>
            <span>· mostrando {resultados.length} · la columna resaltada es por la que está ordenado.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
