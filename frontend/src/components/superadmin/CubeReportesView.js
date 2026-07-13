/**
 * CubeReportesView — el GENERADOR DE REPORTES por menú (Ola B4 · GENOMA_DEMANDA_BLUEPRINT.md).
 * El founder elige territorio (colonias) + estudio 4S + bloques del catálogo + corte opcional →
 * reporte en pantalla con procedencia por bloque + imprimible (window.print).
 * RENDERER UNIVERSAL: no conoce los bloques — pinta lo que venga (lectura, tablas de objetos,
 * chips de escalares). Un bloque nuevo en el backend aparece aquí solo, sin tocar este archivo.
 */
import React, { useEffect, useState } from 'react';
import { FileText, Printer, Play } from 'lucide-react';
import { getReporteBloques, generarReporte, getReportesGuardados, getReporteGuardado, getCubo4sCatalogo, generarEstudioDmx } from '../../api/superadminMetricsCube';

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const tc = (s) => String(s ?? '—').replace(/[_.-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// UNIVERSALIDAD: los estudios NO se hardcodean — se preguntan al backend (un 5º estudio aparece solo)
const PROC_COLOR = { medido: '#4ADE80', observado: '#58a6ff', real: '#4ADE80', transferido: '#fbbf24', 'medido+observado': '#4ADE80', sin_dato: '#8b949e', sin_prior: '#8b949e', estimado: '#d29922' };

// ── renderer universal ──
function Valor({ v }) {
  if (v == null) return <>—</>;
  if (typeof v === 'number') return <>{nf.format(v)}</>;
  if (Array.isArray(v)) return <>{v.slice(0, 4).map(String).join(', ')}{v.length > 4 ? '…' : ''}</>;
  if (typeof v === 'object') return <>{Object.entries(v).slice(0, 3).map(([k, x]) => `${tc(k)}: ${typeof x === 'object' ? '…' : x}`).join(' · ')}</>;
  return <>{String(v)}</>;
}

// CSV para el founder (no-dev): todas las filas, columnas escalares, listo para Excel.
function descargarCSV(nombre, rows) {
  const cols = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] == null);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${nombre}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// Server-driven POR FILA: el bloque declara la acción (endpoint + qué campo de la fila mandar)
// y cada fila que tenga ese campo gana su botón — universal, sin cablear bloques aquí.
function BotonFila({ accion, fila }) {
  const [msg, setMsg] = React.useState('');
  const valor = fila[accion.param_de_fila];
  if (valor == null) return null;
  const correr = async () => {
    if (accion.confirmacion && !window.confirm(`"${valor}" — ${accion.confirmacion}`)) return;
    setMsg('…');
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      const r = await fetch(`${API}${accion.endpoint}?${accion.param_de_fila}=${encodeURIComponent(valor)}`,
        { method: accion.metodo || 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const d = await r.json();
      setMsg(r.ok && d.ok !== false ? '✓' : (d.error || d.detail || '✗'));
    } catch { setMsg('✗'); }
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <button onClick={correr} className="no-print" title={accion.titulo}
        style={{ padding: '2px 9px', borderRadius: 7, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5, cursor: 'pointer' }}>
        {accion.titulo}
      </button>
      {msg && <span style={{ fontSize: 10.5, color: msg === '✓' ? '#4ADE80' : '#fca5a5' }}>{msg}</span>}
    </span>
  );
}

function TablaGenerica({ rows, nombre, accionesFila }) {
  const [verTodo, setVerTodo] = React.useState(false);
  const cols = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] == null).slice(0, 8);
  if (!cols.length) return null;
  const conBoton = (accionesFila || []).filter((a) => a.param_de_fila && rows[0][a.param_de_fila] !== undefined);
  const visibles = verTodo ? rows : rows.slice(0, 12);
  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const td = { fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.9)', padding: '6px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const lk = { fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--theme)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 };
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map((c) => <th key={c} style={th}>{tc(c)}</th>)}{conBoton.length > 0 && <th style={th} className="no-print" />}</tr></thead>
        <tbody>
          {visibles.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {cols.map((c) => <td key={c} style={td}><Valor v={r[c]} /></td>)}
              {conBoton.length > 0 && (
                <td style={td} className="no-print">{conBoton.map((a) => <BotonFila key={a.id} accion={a} fila={r} />)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {rows.length > 12 && (
          <button onClick={() => setVerTodo(!verTodo)} style={lk} data-testid="tabla-ver-todo">
            {verTodo ? 'Ver menos' : `Ver todas las ${rows.length} filas`}
          </button>
        )}
        <button onClick={() => descargarCSV(nombre || 'tabla', rows)} style={lk} data-testid="tabla-csv">
          Descargar CSV ({rows.length})
        </button>
      </div>
    </div>
  );
}

const _OMITIR = new Set(['bloque', 'titulo', 'procedencia', 'lectura', 'error', 'es_estimado', 'fuente', 'genoma_v', 'generado']);

// Server-driven: el botón de ACCIÓN viene declarado por el bloque (backend). El clic = la
// autorización explícita del founder — nada llega al dev sin este botón.
function BotonAccion({ accion, params }) {
  const [msg, setMsg] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const correr = async () => {
    if (accion.confirmacion && !window.confirm(accion.confirmacion)) return;
    setBusy(true); setMsg('');
    try {
      const qs = (accion.params || []).map((p) => (params[p] ? `${p}=${encodeURIComponent(params[p])}` : null))
        .filter(Boolean).join('&');
      const API = process.env.REACT_APP_BACKEND_URL;
      const r = await fetch(`${API}${accion.endpoint}${qs ? `?${qs}` : ''}`,
        { method: accion.metodo || 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const d = await r.json();
      setMsg(r.ok && d.ok !== false ? `✓ ${d.lectura || 'Autorizado y enviado'}` : (d.error || d.detail || 'No se pudo'));
    } catch (e) { setMsg(e?.message || 'No se pudo'); } finally { setBusy(false); }
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button onClick={correr} disabled={busy} className="no-print"
        style={{ padding: '6px 14px', borderRadius: 9, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Enviando…' : accion.titulo}
      </button>
      {msg && <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: msg.startsWith('✓') ? '#4ADE80' : '#fca5a5' }}>{msg}</span>}
    </span>
  );
}

function Seccion({ s, acciones, accionesFila, params }) {
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
          return <div key={k}><div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--theme)', textTransform: 'uppercase', margin: '6px 0 4px' }}>{tc(k)}</div><TablaGenerica rows={v} nombre={`${s.bloque}-${k}`} accionesFila={accionesFila} /></div>;
        }
        // DESGLOSE (hipergranularidad): dict {valor: [serie]} → una sub-tabla por valor
        if (v && typeof v === 'object' && !Array.isArray(v)
            && Object.values(v).every((x) => Array.isArray(x) && x.length && typeof x[0] === 'object')) {
          return (
            <div key={k}>
              {Object.entries(v).map(([val, rows]) => (
                <div key={val}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--theme)', textTransform: 'uppercase', margin: '6px 0 4px' }}>{tc(k)} · {tc(val)}</div>
                  <TablaGenerica rows={rows} nombre={`${s.bloque}-${k}-${val}`} accionesFila={accionesFila} />
                </div>
              ))}
            </div>
          );
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
      {(acciones || []).length > 0 && !s.error && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {acciones.map((a) => <BotonAccion key={a.id} accion={a} params={params} />)}
        </div>
      )}
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
  const [unitId, setUnitId] = useState('');
  const [reporte, setReporte] = useState(null);
  const [reporteB, setReporteB] = useState(null);   // comparador: reporte guardado lado a lado
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [guardar, setGuardar] = useState(false);
  const [guardados, setGuardados] = useState([]);
  const [estudios, setEstudios] = useState(['']);
  const [granularidad, setGranularidad] = useState('mes');
  const [desglose, setDesglose] = useState('');
  const [fecha, setFecha] = useState('');
  const [vendDesde, setVendDesde] = useState('');
  const [vendHasta, setVendHasta] = useState('');

  useEffect(() => {
    let alive = true;
    getReporteBloques().then((d) => alive && setCatalogoB(d.bloques || [])).catch(() => setCatalogoB([]));
    getReportesGuardados().then((d) => alive && setGuardados(d.reportes || [])).catch(() => setGuardados([]));
    // estudios data-driven: los que existan en los átomos 4S (un estudio nuevo aparece solo)
    getCubo4sCatalogo().then((d) => alive && setEstudios(['', ...(d.estudios || []).map((e) => e.estudio)]))
      .catch(() => setEstudios(['']));
    return () => { alive = false; };
  }, []);

  const abrirGuardado = async (id) => {
    if (!id) return;
    try { setReporte(await getReporteGuardado(id)); setReporteB(null); } catch (e) { setErr(e?.message || 'No se pudo abrir.'); }
  };

  // COMPARADOR: el reporte de hoy vs uno guardado (¿qué cambió en un mes?) — lado a lado.
  const compararCon = async (id) => {
    if (!id) { setReporteB(null); return; }
    try { setReporteB(await getReporteGuardado(id)); } catch (e) { setErr(e?.message || 'No se pudo abrir.'); }
  };

  // G1 · EL PRODUCTO: genera el Estudio DMX de la zona (16 secciones + folio), lo guarda en la
  // memoria de reportes y lo abre en pantalla — un clic, cero API a mano.
  const [folioEstudio, setFolioEstudio] = useState('');
  const generarEstudio = async () => {
    setBusy(true); setErr(''); setFolioEstudio('');
    try {
      const cols = colonias.split(',').map((c) => c.trim()).filter(Boolean);
      const r = await generarEstudioDmx(cols);
      setFolioEstudio(r.folio || '');
      setReporte({ territorio: r.territorio, n_bloques: r.n_secciones, generado: r.generado,
                   secciones: r.secciones, folio: r.folio, resumen_ejecutivo: r.resumen_ejecutivo });
      setReporteB(null);
      getReportesGuardados().then((d) => setGuardados(d.reportes || [])).catch(() => {});
    } catch (e) { setErr(e?.message || 'No se pudo generar el estudio.'); } finally { setBusy(false); }
  };

  const toggle = (id) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const generar = async () => {
    setBusy(true); setErr(''); setReporte(null);
    try {
      const payload = {
        colonias: colonias.split(',').map((c) => c.trim()).filter(Boolean),
        estudio: estudio || null,
        bloques: [...sel],
        cortes: corteDim ? { dimension: corteDim, valor: corteVal || null } : null,
        unit_id: unitId || null,
        granularidad,
        desglosar_por: desglose || null,
        fecha: fecha || null,
        vendidas_desde: vendDesde || null,
        vendidas_hasta: vendHasta || null,
        guardar,
      };
      const r = await generarReporte(payload);
      setReporte(r);
      if (r.guardado) {
        getReportesGuardados().then((d) => setGuardados(d.reportes || [])).catch(() => {});
      }
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
            {estudios.map((e) => <option key={e} value={e}>{e ? tc(e) : 'Sin estudio 4S'}</option>)}
          </select>
          <input value={corteDim} onChange={(e) => setCorteDim(e.target.value)} placeholder="Corte: dimensión (producto.recamaras)" style={{ ...inp, minWidth: 220 }} />
          <input value={corteVal} onChange={(e) => setCorteVal(e.target.value)} placeholder="valor (2)" style={{ ...inp, width: 90 }} />
          {/* server-driven: los inputs aparecen solo si un bloque marcado los declara */}
          {catalogoB.some((b) => sel.has(b.id) && (b.necesita || []).includes('unit_id')) && (
            <input value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Unidad (unit_id)" style={{ ...inp, minWidth: 160 }} data-testid="rep-unit" />
          )}
          {catalogoB.some((b) => sel.has(b.id) && (b.necesita || []).includes('tiempo')) && (
            <>
              <select value={granularidad} onChange={(e) => setGranularidad(e.target.value)} style={inp} data-testid="rep-granularidad">
                <option value="hora">Por hora</option>
                <option value="dia">Por día</option>
                <option value="semana">Por semana</option>
                <option value="mes">Por mes</option>
                <option value="trimestre">Por trimestre</option>
                <option value="ano">Por año</option>
              </select>
              <input value={desglose} onChange={(e) => setDesglose(e.target.value)}
                placeholder="Desglosar por dimensión (producto.recamaras)" style={{ ...inp, minWidth: 240 }} data-testid="rep-desglose" />
            </>
          )}
          {catalogoB.some((b) => sel.has(b.id) && (b.necesita || []).includes('fecha')) && (
            <>
              <input value={fecha} onChange={(e) => setFecha(e.target.value)}
                placeholder="Como era en… (2027-05)" style={{ ...inp, width: 160 }} data-testid="rep-fecha" />
              <input value={vendDesde} onChange={(e) => setVendDesde(e.target.value)}
                placeholder="Vendidas desde (2027-05)" style={{ ...inp, width: 170 }} />
              <input value={vendHasta} onChange={(e) => setVendHasta(e.target.value)}
                placeholder="hasta (2027-05)" style={{ ...inp, width: 140 }} />
            </>
          )}
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
          <button onClick={generarEstudio} disabled={busy} data-testid="rep-estudio-dmx"
            title="El estudio de zona completo (16 secciones + folio) — se guarda solo en la memoria de reportes"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            <FileText size={14} /> {busy ? 'Generando…' : 'Generar Estudio DMX'}
          </button>
          {folioEstudio && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--theme)', alignSelf: 'center' }}>✓ {folioEstudio} guardado</span>}
          {reporte && (
            <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              <Printer size={14} /> Imprimir / PDF
            </button>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 12, color: guardar ? '#4ADE80' : 'rgba(240,235,224,0.6)', cursor: 'pointer' }}>
            <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} /> Guardar (memoria)
          </label>
          {guardados.length > 0 && (
            <select defaultValue="" onChange={(e) => abrirGuardado(e.target.value)} style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12 }} data-testid="rep-guardados">
              <option value="">Abrir guardado… ({guardados.length})</option>
              {guardados.map((g) => <option key={g.id} value={g.id}>{g.nombre} · {String(g.generado).slice(0, 10)}</option>)}
            </select>
          )}
          {reporte && guardados.length > 0 && (
            <select defaultValue="" onChange={(e) => compararCon(e.target.value)} style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12 }} data-testid="rep-comparar">
              <option value="">Comparar con… (lado a lado)</option>
              {guardados.map((g) => <option key={g.id} value={g.id}>{g.nombre} · {String(g.generado).slice(0, 10)}</option>)}
            </select>
          )}
          {err && <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5', alignSelf: 'center' }}>{err}</span>}
        </div>
      </div>

      {reporte && (() => {
        const pinta = (rep, etiqueta) => (
          <div>
            {etiqueta && <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--theme)', marginBottom: 6 }}>{etiqueta}</div>}
            {rep.folio && (
              <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.07)', border: '1px solid rgba(var(--theme-rgb),0.25)' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Estudio DMX de Zona · <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--theme)' }}>{rep.folio}</span></div>
                {(rep.resumen_ejecutivo || []).length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {rep.resumen_ejecutivo.map((l, i) => (
                      <li key={i} style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.85)', marginBottom: 3 }}>{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 14 }}>
              Territorio: <b style={{ color: 'var(--cream)' }}>{Array.isArray(rep.territorio?.colonias) ? rep.territorio.colonias.map(tc).join(', ') : 'Toda la ciudad'}</b>
              {rep.territorio?.estudio ? <> · Estudio: <b style={{ color: 'var(--cream)' }}>{tc(rep.territorio.estudio)}</b></> : null}
              {' '}· {rep.n_bloques} bloques · {String(rep.generado).slice(0, 16).replace('T', ' ')}
            </div>
            {(rep.secciones || []).map((s) => {
              const meta = catalogoB.find((b) => b.id === s.bloque) || {};
              return <Seccion key={s.bloque} s={s} acciones={meta.acciones} accionesFila={meta.acciones_por_fila}
                params={{ colonias, estudio, unit_id: unitId }} />;
            })}
          </div>
        );
        // COMPARADOR: dos reportes lado a lado (hoy vs guardado) — misma vara, mismo renderer
        return reporteB ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }} data-testid="rep-lado-a-lado">
            {pinta(reporte, `A · ${String(reporte.generado).slice(0, 10)}`)}
            {pinta(reporteB, `B · ${reporteB.nombre || ''} ${String(reporteB.generado).slice(0, 10)}`)}
          </div>
        ) : pinta(reporte, null);
      })()}
    </div>
  );
}
