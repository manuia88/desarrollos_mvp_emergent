/**
 * CubeReportesView — el GENERADOR DE REPORTES por menú (Ola B4 · GENOMA_DEMANDA_BLUEPRINT.md).
 * El founder elige territorio (colonias) + estudio 4S + bloques del catálogo + corte opcional →
 * reporte en pantalla con procedencia por bloque + imprimible (window.print).
 * RENDERER UNIVERSAL: no conoce los bloques — pinta lo que venga (lectura, tablas de objetos,
 * chips de escalares). Un bloque nuevo en el backend aparece aquí solo, sin tocar este archivo.
 */
import React, { useEffect, useState } from 'react';
import { FileText, Printer, Play } from 'lucide-react';
import { getReporteBloques, generarReporte } from '../../api/superadminMetricsCube';

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const tc = (s) => String(s ?? '—').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const ESTUDIOS = ['', 'coyoacan', 'insurgentes_antonio_caso', 'periferico', 'puente_alvarado'];
const PROC_COLOR = { medido: '#4ADE80', observado: '#58a6ff', real: '#4ADE80', transferido: '#fbbf24', 'medido+observado': '#4ADE80', sin_dato: '#8b949e', sin_prior: '#8b949e', estimado: '#d29922' };

// ── renderer universal ──
function Valor({ v }) {
  if (v == null) return <>—</>;
  if (typeof v === 'number') return <>{nf.format(v)}</>;
  if (Array.isArray(v)) return <>{v.slice(0, 4).map(String).join(', ')}{v.length > 4 ? '…' : ''}</>;
  if (typeof v === 'object') return <>{Object.entries(v).slice(0, 3).map(([k, x]) => `${tc(k)}: ${typeof x === 'object' ? '…' : x}`).join(' · ')}</>;
  return <>{String(v)}</>;
}

function TablaGenerica({ rows }) {
  const cols = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] == null).slice(0, 8);
  if (!cols.length) return null;
  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td = { fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.9)', padding: '6px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map((c) => <th key={c} style={th}>{tc(c)}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 12).map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {cols.map((c) => <td key={c} style={td}><Valor v={r[c]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 12 && <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)' }}>… {rows.length - 12} filas más (completo por API)</div>}
    </div>
  );
}

const _OMITIR = new Set(['bloque', 'titulo', 'procedencia', 'lectura', 'error', 'es_estimado', 'fuente', 'genoma_v', 'generado']);

function Seccion({ s }) {
  const pc = PROC_COLOR[s.procedencia] || '#8b949e';
  return (
    <div style={{ marginBottom: 22, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{s.titulo || tc(s.bloque)}</span>
        {s.procedencia && <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10, padding: '2px 9px', borderRadius: 9999, color: pc, background: `${pc}1c`, border: `1px solid ${pc}50` }}>{tc(s.procedencia)}</span>}
      </div>
      {s.error && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>⚠ {s.error}</div>}
      {s.lectura && <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.85)', margin: '0 0 8px' }}>{s.lectura}</p>}
      {Object.entries(s).filter(([k]) => !_OMITIR.has(k)).map(([k, v]) => {
        if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] !== null) {
          return <div key={k}><div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--theme)', textTransform: 'uppercase', margin: '6px 0 4px' }}>{tc(k)}</div><TablaGenerica rows={v} /></div>;
        }
        return null;
      })}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(s).filter(([k, v]) => !_OMITIR.has(k) && (typeof v === 'number' || typeof v === 'string')).slice(0, 10).map(([k, v]) => (
          <span key={k} style={{ fontFamily: 'DM Sans', fontSize: 11, padding: '3px 9px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.8)' }}>
            {tc(k)}: <b style={{ color: 'var(--cream)' }}><Valor v={v} /></b>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CubeReportesView() {
  const [catalogoB, setCatalogoB] = useState([]);
  const [sel, setSel] = useState(new Set(['demanda_viva', 'escasez', 'data_negativa', 'gap_radar']));
  const [colonias, setColonias] = useState('');
  const [estudio, setEstudio] = useState('');
  const [corteDim, setCorteDim] = useState('');
  const [corteVal, setCorteVal] = useState('');
  const [reporte, setReporte] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getReporteBloques().then((d) => alive && setCatalogoB(d.bloques || [])).catch(() => setCatalogoB([]));
    return () => { alive = false; };
  }, []);

  const toggle = (id) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const generar = async () => {
    setBusy(true); setErr(''); setReporte(null);
    try {
      const payload = {
        colonias: colonias.split(',').map((c) => c.trim()).filter(Boolean),
        estudio: estudio || null,
        bloques: [...sel],
        cortes: corteDim ? { dimension: corteDim, valor: corteVal || null } : null,
      };
      setReporte(await generarReporte(payload));
    } catch (e) { setErr(e?.message || 'No se pudo generar.'); } finally { setBusy(false); }
  };

  const inp = { padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 };

  return (
    <div data-testid="cube-reportes-view">
      <div className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <FileText size={18} color="var(--theme)" />
          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>Generador de Reportes</span>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.7)', margin: '0 0 12px' }}>
          Elige territorio, bloques y corte — el reporte sale a tu medida, macro→átomo, con procedencia por bloque.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input value={colonias} onChange={(e) => setColonias(e.target.value)} placeholder="Colonias (coma): Tabacalera, Condesa… (vacío = ciudad)" style={{ ...inp, minWidth: 320 }} data-testid="rep-colonias" />
          <select value={estudio} onChange={(e) => setEstudio(e.target.value)} style={inp} data-testid="rep-estudio">
            {ESTUDIOS.map((e) => <option key={e} value={e}>{e ? tc(e) : 'Sin estudio 4S'}</option>)}
          </select>
          <input value={corteDim} onChange={(e) => setCorteDim(e.target.value)} placeholder="Corte: dimensión (producto.recamaras)" style={{ ...inp, minWidth: 220 }} />
          <input value={corteVal} onChange={(e) => setCorteVal(e.target.value)} placeholder="valor (2)" style={{ ...inp, width: 90 }} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {catalogoB.map((b) => (
            <label key={b.id} title={b.desc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, background: sel.has(b.id) ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)', border: `1px solid ${sel.has(b.id) ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`, color: sel.has(b.id) ? 'var(--theme)' : 'rgba(240,235,224,0.6)' }}>
              <input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} style={{ display: 'none' }} />
              {b.titulo}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={generar} disabled={busy || !sel.size} data-testid="rep-generar"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            <Play size={14} /> {busy ? 'Generando…' : `Generar reporte (${sel.size} bloques)`}
          </button>
          {reporte && (
            <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              <Printer size={14} /> Imprimir / PDF
            </button>
          )}
          {err && <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5', alignSelf: 'center' }}>{err}</span>}
        </div>
      </div>

      {reporte && (
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 14 }}>
            Territorio: <b style={{ color: 'var(--cream)' }}>{Array.isArray(reporte.territorio.colonias) ? reporte.territorio.colonias.map(tc).join(', ') : 'Toda la ciudad'}</b>
            {reporte.territorio.estudio ? <> · Estudio: <b style={{ color: 'var(--cream)' }}>{tc(reporte.territorio.estudio)}</b></> : null}
            {' '}· {reporte.n_bloques} bloques · {String(reporte.generado).slice(0, 16).replace('T', ' ')}
          </div>
          {reporte.secciones.map((s) => <Seccion key={s.bloque} s={s} />)}
        </div>
      )}
    </div>
  );
}
