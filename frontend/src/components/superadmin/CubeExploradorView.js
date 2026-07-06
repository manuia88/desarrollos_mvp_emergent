/**
 * CubeExploradorView — el EXPLORADOR del Cubo Total (F2: motor de consulta libre).
 *
 * Cualquier pregunta = un corte: arma filtros sobre CUALQUIER campo del átomo (físico, financiero,
 * geo, mercado), agrupa por lo que sea, y responde con el número gordo + n + k-anon + las unidades
 * exactas detrás (drill al Átomo). La pregunta del founder ("absorción en BJ de deptos con balcón
 * <65m² con cajón, enganche ≤10% y mensualidad <$20k") se arma aquí en 6 chips.
 * Backend: POST /metrics-cube/consulta · GET /metrics-cube/consulta/campos (registro cerrado).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, Plus, X, AlertCircle, Box } from 'lucide-react';
import { getConsultaCampos, runConsulta } from '../../api/superadminMetricsCube';

const OP_LABEL = {
  eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', in: 'en', between: 'entre', exists: 'tiene dato',
};
const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const money = (v) => (v == null ? '—' : `$${nf.format(v)}`);
const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// La pregunta del founder, precargada como ejemplo vivo (se puede editar/quitar chip por chip).
const EJEMPLO = [
  { campo: 'alcaldia', op: 'eq', valor: 'benito-juarez' },
  { campo: 'has_balcon', op: 'eq', valor: true },
  { campo: 'm2', op: 'lt', valor: 65 },
  { campo: 'n_parking', op: 'gte', valor: 1 },
  { campo: 'enganche_min_pct', op: 'lte', valor: 10 },
  { campo: 'mens_80_20', op: 'lt', valor: 30000 },
];

export default function CubeExploradorView({ onDrillUnit }) {
  const [campos, setCampos] = useState([]);
  const [filtros, setFiltros] = useState(EJEMPLO);
  const [agrupar, setAgrupar] = useState(['colonia']);
  const [nuevo, setNuevo] = useState({ campo: 'precio', op: 'lt', valor: '' });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getConsultaCampos().then((d) => setCampos(d.campos || [])).catch(() => setCampos([]));
  }, []);

  const correr = async (fs = filtros, gs = agrupar) => {
    setBusy(true); setErr(null);
    try { setRes(await runConsulta(fs, gs)); }
    catch (e) { setErr(e?.message || 'No se pudo consultar.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { correr(); /* al montar, con el ejemplo */ // eslint-disable-next-line
  }, []);

  const tipoDe = (key) => (campos.find((c) => c.key === key) || {}).tipo || 'num';
  const labelDe = (key) => (campos.find((c) => c.key === key) || {}).label || key;
  const agrupables = useMemo(() => campos.filter((c) => c.agrupable), [campos]);

  const agregar = () => {
    if (nuevo.valor === '' && nuevo.op !== 'exists') return;
    let v = nuevo.valor;
    const t = tipoDe(nuevo.campo);
    if (t === 'num') v = Number(v);
    if (t === 'bool') v = String(v).toLowerCase() !== 'false' && v !== false;
    const fs = [...filtros, { campo: nuevo.campo, op: nuevo.op, valor: v }];
    setFiltros(fs); setNuevo((n) => ({ ...n, valor: '' })); correr(fs, agrupar);
  };
  const quitar = (i) => { const fs = filtros.filter((_, j) => j !== i); setFiltros(fs); correr(fs, agrupar); };
  const toggleGrupo = (k) => {
    const gs = agrupar.includes(k) ? agrupar.filter((x) => x !== k) : [...agrupar, k].slice(0, 3);
    setAgrupar(gs); correr(filtros, gs);
  };

  const k = res?.kpis || {};
  const pill = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '4px 11px', cursor: 'pointer' };
  const inputS = { padding: '7px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none' };

  return (
    <div data-testid="cube-explorador-view">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <SlidersHorizontal size={15} color="var(--theme)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Explorador — cualquier pregunta es un corte</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 12 }}>
        Combina los filtros que quieras (físicos, financieros, de zona) y agrupa por lo que sea. Cada respuesta dice cuántas unidades hay detrás.
      </div>

      {/* Chips de filtros activos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        {filtros.map((f, i) => (
          <span key={i} data-testid={`exp-filtro-${f.campo}`} style={{ ...pill, cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)' }}>
            {labelDe(f.campo)} {OP_LABEL[f.op] || f.op} {String(f.valor)}
            <X size={11} style={{ cursor: 'pointer' }} onClick={() => quitar(i)} />
          </span>
        ))}
        {filtros.length === 0 && <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.45)' }}>Sin filtros — todo el mercado.</span>}
      </div>

      {/* Constructor de filtro */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10, padding: '9px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <select value={nuevo.campo} onChange={(e) => setNuevo((n) => ({ ...n, campo: e.target.value }))} style={inputS} data-testid="exp-campo">
          {campos.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={nuevo.op} onChange={(e) => setNuevo((n) => ({ ...n, op: e.target.value }))} style={inputS} data-testid="exp-op">
          {Object.entries(OP_LABEL).filter(([o]) => o !== 'in' && o !== 'between').map(([o, l]) => <option key={o} value={o}>{l}</option>)}
        </select>
        {tipoDe(nuevo.campo) === 'bool' ? (
          <select value={String(nuevo.valor)} onChange={(e) => setNuevo((n) => ({ ...n, valor: e.target.value === 'true' }))} style={inputS}>
            <option value="true">Sí</option><option value="false">No</option>
          </select>
        ) : (
          <input value={nuevo.valor} onChange={(e) => setNuevo((n) => ({ ...n, valor: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && agregar()}
            placeholder={tipoDe(nuevo.campo) === 'num' ? 'número' : 'valor'} style={{ ...inputS, width: 140 }} data-testid="exp-valor" />
        )}
        <button onClick={agregar} data-testid="exp-agregar"
          style={{ ...pill, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.45)', color: 'var(--theme)' }}>
          <Plus size={12} /> Agregar filtro
        </button>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: 10 }}>Agrupar por:</span>
        {agrupables.map((c) => (
          <button key={c.key} onClick={() => toggleGrupo(c.key)}
            style={{ ...pill, background: agrupar.includes(c.key) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${agrupar.includes(c.key) ? 'rgba(240,235,224,0.35)' : 'rgba(255,255,255,0.07)'}`, color: agrupar.includes(c.key) ? 'var(--cream)' : 'rgba(240,235,224,0.55)' }}>
            {c.label}
          </button>
        ))}
      </div>

      {err && <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={14} /> {err}</div>}
      {busy && <div style={{ padding: 18, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cortando el cubo…</div>}

      {!busy && res && res.ok && (
        <>
          {/* El número gordo + n */}
          <div className="dmx-card" style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'baseline' }}>
              {[['Unidades del corte', nf.format(k.unidades ?? 0)],
                ['Absorción', k.absorcion_pct != null ? `${k.absorcion_pct}%` : '—'],
                ['Disponibles', nf.format(k.disponibles ?? 0)],
                ['Precio prom.', money(k.precio_prom)],
                ['$/m² prom.', money(k.precio_m2_prom)],
                ['Mensualidad prom. (80/20)', money(k.mens_80_20_prom)]].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', fontWeight: 600 }}>{l}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
            {!res.kanon_ok && (
              <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 11, color: '#FCD34D' }}>
                Muestra chica (n&lt;3): visible aquí (vista de dios), pero NO publicable fuera sin supresión.
              </div>
            )}
          </div>

          {/* Grupos */}
          {(res.grupos || []).length > 0 && (
            <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr>
                  {[...agrupar.map(labelDe), 'n', 'Absorción', 'Precio prom.', '$/m²', 'Mens. 80/20'].map((h, i) => (
                    <th key={h} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '8px 12px', textAlign: i < agrupar.length ? 'left' : 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {res.grupos.map((g, i) => (
                    <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent', opacity: g.kanon_ok ? 1 : 0.55 }}
                      title={g.kanon_ok ? undefined : 'n<3 — no publicable fuera sin supresión'}>
                      {agrupar.map((a) => <td key={a} style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', padding: '8px 12px' }}>{tc(g.valores[a])}</td>)}
                      {[g.n, g.kpis.absorcion_pct != null ? `${g.kpis.absorcion_pct}%` : '—', money(g.kpis.precio_prom), money(g.kpis.precio_m2_prom), money(g.kpis.mens_80_20_prom)].map((v, j) => (
                        <td key={j} style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.85)', padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Las unidades exactas (drill al Átomo) */}
          {(res.unidades || []).length > 0 && (
            <>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
                Las unidades del corte {res.unidades_truncadas > 0 ? `(primeras ${res.unidades.length} de ${res.n})` : `(${res.n})`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
                {res.unidades.map((u) => (
                  <button key={u.unit_id} onClick={() => onDrillUnit && onDrillUnit(u.unit_id)} data-testid={`exp-unit-${u.unit_id}`}
                    title="Ver el átomo completo de esta unidad"
                    style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', cursor: onDrillUnit ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Box size={11} color="var(--theme)" />
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream)', fontWeight: 700 }}>{u.unit_id}</span>
                    </div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.6)', marginTop: 3 }}>
                      {tc(u.colonia)} · {money(u.precio)} · {u.m2 || '—'}m² · mens {money(u.mens_80_20)} · {u.status}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
          {res.n === 0 && (
            <div style={{ padding: 20, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>
              Ninguna unidad cumple TODO el corte — honesto, no lo inventamos. Quita o relaja un filtro.
            </div>
          )}
        </>
      )}
    </div>
  );
}
