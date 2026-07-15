/**
 * SuperadminInventario — FASE 3 del rebuild UX (la queja del founder: "miles de clicks").
 * UNA página, TRES niveles, CERO wizard:
 *   Nivel 1 · Desarrolladores (cards con conteos y su carpeta vigilada)
 *   Nivel 2 · Expediente del dev (sus proyectos con mini-torre por estado)
 *   Nivel 3 · El proyecto = LA TORRE clickeable: clic en unidad → editar estado/precio ahí mismo.
 * La bandeja del vigía vive arriba. Deep-link: ?dev= & ?proyecto=. Editar dispara audit+bitácora.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Radar, FolderUp, UserPlus, X, Home } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';

const API = process.env.REACT_APP_BACKEND_URL;
const _j = async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || `HTTP ${r.status}`); return r.json(); };
const _get = (p) => fetch(`${API}/api/superadmin/inventario${p}`, { credentials: 'include' }).then(_j);
const _patch = (p, body) => fetch(`${API}/api/superadmin/inventario${p}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(_j);

export const C = { disponible: '#58a6ff', apartada: '#d29922', vendida: '#4ADE80', bloqueada: '#8b949e', renta: '#a78bfa' };
export const ESTADOS = ['disponible', 'apartada', 'vendida', 'bloqueada', 'renta'];
export const S = {
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16 },
  h: { fontFamily: 'Outfit', fontWeight: 800, color: 'var(--cream)' },
  p: { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)', margin: 0 },
  mini: { fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.4)', color: 'var(--theme)', textDecoration: 'none' },
  inp: { padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, width: '100%' },
};
export const fmtM = (n) => (n === null || n === undefined) ? '—' : `$${Math.round(Number(n)).toLocaleString('en-US')}`;

/* mini-torre: una franja por estado, proporcional (resumen de un proyecto en 1 vistazo) */
function MiniTorre({ porEstado, total }) {
  if (!total) return <div style={{ ...S.mini }}>sin unidades aún</div>;
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
      {ESTADOS.map((e) => {
        const n = porEstado[e] || 0;
        return n ? <div key={e} title={`${n} ${e}`} style={{ width: `${(n / total) * 100}%`, background: C[e] }} /> : null;
      })}
    </div>
  );
}

/* LA TORRE: el grid real de unidades, clickeable. v2 (feedback founder):
   - torres separadas (A y B ya no se mezclan en el piso)
   - PATRÓN DE MOLDES visible: clic en un molde (chip) → sus unidades se iluminan */
export const PALETA_MOLDE = ['#58a6ff', '#4ADE80', '#d29922', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c', '#e879f9', '#a3e635', '#38bdf8', '#facc15', '#f87171'];

export function Torre({ unidades, onUnidad, seleccionada, colorDeMolde, moldeSel, posicion }) {
  // torre desde el número ('A-1402' → 'A'); nivel para las filas
  const porTorre = useMemo(() => {
    const t = {};
    unidades.forEach((u) => {
      const m = /^([A-Za-z]{1,2})\s*-/.exec(u.unit_number || '');
      const torre = m ? m[1].toUpperCase() : '·';
      const lvl = (u.level ?? '—').toString();
      ((t[torre] = t[torre] || {})[lvl] = t[torre][lvl] || []).push(u);
    });
    return Object.entries(t).sort(([a], [b]) => a.localeCompare(b));
  }, [unidades]);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {porTorre.map(([torre, niveles]) => (
        <div key={torre}>
          {porTorre.length > 1 && (
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)', margin: '2px 0 8px' }}>
              🏢 Torre {torre} <span style={S.mini}>· {Object.values(niveles).flat().length} unidades</span>
            </div>
          )}
          <div style={{ display: 'grid', gap: 6 }}>
            {Object.entries(niveles).sort((a, b) => (Number(b[0]) || 0) - (Number(a[0]) || 0)).map(([nivel, us]) => (
              <div key={nivel} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...S.mini, width: 34, textAlign: 'right' }}>{nivel === '—' ? '' : `p.${nivel}`}</span>
                {us.sort((a, b) => (a.unit_number || '').localeCompare(b.unit_number || '')).map((u) => {
                  const col = C[(u.status || 'disponible').toLowerCase()] || C.disponible;
                  const sel = seleccionada === u.id;
                  const molde = colorDeMolde(u.prototype_id);
                  const apagada = moldeSel && u.prototype_id !== moldeSel;
                  const pos = (posicion || {})[u.id];   // 💎 semáforo vs sus gemelas
                  const halo = pos?.banda === 'ganga' ? '0 0 0 2px rgba(74,222,128,0.75)'
                    : pos?.banda === 'premium' ? '0 0 0 2px rgba(210,153,34,0.7)' : undefined;
                  const esDelMolde = moldeSel && u.prototype_id === moldeSel;
                  return (
                    <button key={u.id} data-testid={`unidad-${u.unit_number || u.id}`} onClick={() => onUnidad(u)}
                      title={`${u.unit_number || u.id} · ${u.status || 'disponible'} · ${fmtM(u.price_mxn || u.price)}${u.size_m2 ? ` · ${u.size_m2}m²` : ''}${pos ? ` · ${pos.vs_molde_pct > 0 ? '+' : ''}${pos.vs_molde_pct}% vs sus gemelas${pos.metodo === 'ajustado_piso' ? ' (ajustado por piso)' : ''}` : ' · sin anillo: precio en línea o molde sin gemelas'}`}
                      style={{ minWidth: 52, padding: '7px 6px 5px', borderRadius: 6, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10.5,
                        // el MOLDE es la identidad visual: fondo teñido de su color siempre;
                        // seleccionado el molde → color PLENO (founder: 'que se iluminen')
                        background: esDelMolde ? molde : (molde ? `${molde}2e` : `${col}${sel ? 'ee' : '33'}`),
                        border: `${sel ? 2 : 1}px solid ${sel ? col : (molde || col)}`,
                        color: esDelMolde || sel ? '#000' : 'var(--cream)',
                        opacity: apagada ? 0.15 : 1, transition: 'all .15s', boxShadow: halo,
                        borderBottom: `3px solid ${col}` }}>
                      {u.unit_number || '·'}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
        {ESTADOS.map((e) => (
          <span key={e} style={{ ...S.mini, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C[e], display: 'inline-block' }} />{e}
          </span>
        ))}
        <span style={S.mini}>· la franja inferior de cada depto = su molde (clic en un molde arriba para iluminar su patrón)</span>
      </div>
    </div>
  );
}

/* panel de edición: aparece al clic en una unidad — SIN wizard */
const ORIENTACIONES = ['', 'norte', 'sur', 'oriente', 'poniente', 'noreste', 'noroeste', 'sureste', 'suroeste'];

const CAMPOS_EDITABLES = [
  ['bedrooms', 'Recámaras', 'num'], ['bathrooms', 'Baños', 'num'],
  ['size_m2', 'm² habitables', 'num'], ['m2_balcony', 'm² balcón', 'num'],
  ['m2_terrace', 'm² terraza', 'num'], ['m2_roof_garden', 'm² roof', 'num'],
  ['patio_m2', 'm² patio', 'num'], ['m2_total', 'm² totales', 'num'],
  ['parking_spots', 'Cajones', 'num'], ['parking_type', 'Tipo de cajón', 'txt'],
  ['bodega', 'Bodega', 'txt'], ['mantenimiento_mxn', 'Mantenimiento $', 'num'],
  ['reservacion_mxn', 'Reservación $', 'num'], ['contrato_mxn', 'A la firma $', 'num'],
  ['a_diferir_mxn', 'A diferir $', 'num'], ['escritura_mxn', 'Escritura $', 'num'],
  ['acabados', 'Nivel de acabados', 'txt'], ['altura_techo_m', 'Altura techo (m)', 'num'],
  ['notas', 'Notas', 'txt'],
];

export function FichaUnidad({ unitId, onCerrar, onCambio, unidad }) {
  const nav = useNavigate();
  const [x, setX] = useState(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState((unidad?.status || 'disponible').toLowerCase());
  const [precio, setPrecio] = useState(unidad?.price_mxn || unidad?.price || '');
  const [orientacion, setOrientacion] = useState(unidad?.orientacion || '');
  const [vista, setVista] = useState(unidad?.vista || '');
  const [msg, setMsg] = useState('');
  const cargarFicha = useCallback(() => _get(`/unidad/${unitId}/ficha`).then(setX).catch((e) => setErr(String(e.message))), [unitId]);
  useEffect(() => { setX(null); cargarFicha(); }, [cargarFicha]);
  useEffect(() => {   // candado: la página de atrás NO scrollea mientras la ficha está abierta
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const [editar, setEditar] = useState(false);
  const [form, setForm] = useState({});
  const guardarDatos = async () => {
    try {
      const body = {};
      CAMPOS_EDITABLES.forEach(([campo, _l, tipo]) => {
        const v = form[campo];
        if (v !== undefined && v !== '') body[campo] = tipo === 'num' ? Number(v) : v;
      });
      if (!Object.keys(body).length) { setMsg('Sin cambios.'); return; }
      await _patch(`/unidad/${unitId}`, body);
      setMsg('Datos guardados ✓ (con auditoría)'); setEditar(false); setForm({});
      cargarFicha(); onCambio && onCambio();
    } catch (e) { setMsg(String(e.message)); }
  };
  const guardar = async () => {
    try {
      const body = {};
      if (unidad && status !== (unidad.status || 'disponible').toLowerCase()) body.status = status;
      const pNum = Number(String(precio).replace(/[^0-9.]/g, ''));
      if (unidad && precio !== '' && pNum !== (unidad.price_mxn || unidad.price)) body.price_mxn = pNum;
      if (unidad && orientacion !== (unidad.orientacion || '')) body.orientacion = orientacion;
      if (unidad && vista !== (unidad.vista || '')) body.vista = vista;
      if (!Object.keys(body).length) { setMsg('Sin cambios.'); return; }
      await _patch(`/unidad/${unitId}`, body);
      setMsg('Guardado ✓ (queda en la bitácora)'); cargarFicha(); onCambio && onCambio();
    } catch (e) { setMsg(String(e.message)); }
  };
  const a = x?.analisis || {};
  const chip = (txt, tono = 'neutro') => (
    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, marginRight: 6, marginBottom: 6,
      background: tono === 'ok' ? 'rgba(74,222,128,0.12)' : tono === 'alerta' ? 'rgba(210,153,34,0.12)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${tono === 'ok' ? 'rgba(74,222,128,0.4)' : tono === 'alerta' ? 'rgba(210,153,34,0.45)' : 'rgba(255,255,255,0.12)'}`,
      color: tono === 'ok' ? '#86efac' : tono === 'alerta' ? '#d29922' : 'rgba(240,235,224,0.8)' }}>{txt}</span>
  );
  return createPortal(
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,10,0.94)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(880px, 96vw)', maxHeight: '92vh', overflowY: 'auto', background: '#14131c', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', border: '1px solid rgba(var(--theme-rgb),0.45)', padding: '20px 24px' }} data-testid="ficha-unidad">
        {!x ? <p style={S.p}>{err || 'Abriendo la ficha…'}</p> : (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: 0 }}>Depto {x.unidad.numero}</h2>
            {x.score && <span title={(x.score.porque || []).join(' · ')} style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, padding: '3px 10px', borderRadius: 8, background: x.score.letra.startsWith('A') ? 'rgba(74,222,128,0.15)' : 'rgba(210,153,34,0.15)', border: `1px solid ${x.score.letra.startsWith('A') ? 'rgba(74,222,128,0.5)' : 'rgba(210,153,34,0.5)'}`, color: x.score.letra.startsWith('A') ? '#86efac' : '#d29922' }}>DMX {x.score.letra} · {x.score.puntos}pts</span>}
            <span style={{ ...S.mini, color: x.unidad.estatus === 'disponible' ? '#86efac' : '#fca5a5', fontWeight: 800, textTransform: 'uppercase' }}>{x.unidad.estatus}</span>
            <span style={{ ...S.mini, fontWeight: 700, color: 'var(--cream)' }}>
              {[x.unidad.recamaras != null ? `${x.unidad.recamaras} rec` : null, x.unidad.banos ? `${x.unidad.banos} baños` : null,
                x.unidad.m2 ? `${x.unidad.m2} m²` : null, x.unidad.piso != null ? `piso ${x.unidad.piso}` : null].filter(Boolean).join(' · ')}
            </span>
            <span style={S.mini}>{x.unidad.desarrollo}{x.molde ? ` · molde ${x.molde.nombre}` : ''}</span>
            <span style={{ flex: 1 }} />
            <button style={{ ...S.btn, background: editar ? 'rgba(210,153,34,0.2)' : undefined, border: editar ? '1px solid rgba(210,153,34,0.5)' : undefined, color: editar ? '#d29922' : undefined }} onClick={() => setEditar(!editar)}>✏️ {editar ? 'Cerrar edición' : 'Editar datos'}</button>
            <button style={S.btn} onClick={() => nav(`/superadmin/expediente/${x.unidad.development_id}`)}>Expediente del desarrollo</button>
            <button style={{ ...S.btn, padding: '5px 9px' }} onClick={onCerrar}><X size={14} /></button>
          </div>

          {/* EL ANÁLISIS del motor: la posición de este átomo contra su contexto */}
          <div style={{ margin: '10px 0 4px' }}>
            {a.pm2 != null && chip(`$${a.pm2.toLocaleString('en-US')}/m²`)}
            {a.vs_molde_ajustado_pct != null
              ? chip(`${a.vs_molde_ajustado_pct > 0 ? '+' : ''}${a.vs_molde_ajustado_pct}% vs sus gemelas${a.metodo_posicion === 'ajustado_piso' ? ' (ajustado por piso)' : ''}`, a.banda === 'premium' ? 'alerta' : a.banda === 'ganga' ? 'ok' : 'neutro')
              : a.vs_molde_pct != null && chip(`${a.vs_molde_pct > 0 ? '+' : ''}${a.vs_molde_pct}% vs sus gemelas (mismo plano)`, a.vs_molde_pct > 3 ? 'alerta' : a.vs_molde_pct < -3 ? 'ok' : 'neutro')}
            {a.vs_piso_pct != null && chip(`${a.vs_piso_pct > 0 ? '+' : ''}${a.vs_piso_pct}% vs su piso`, 'neutro')}
            {a.percentil_pm2 != null && chip(`percentil ${a.percentil_pm2} de $/m² en el desarrollo`)}
            {a.exterior_pct != null && chip(`${a.exterior_pct}% del total es exterior`)}
            {a.busquedas_compatibles != null && chip(`${a.busquedas_compatibles} búsquedas reales le quedan`, a.busquedas_compatibles > 0 ? 'ok' : 'neutro')}
            {a.gemelas_disponibles != null && a.gemela_mas_barata && chip(`${a.gemelas_disponibles} gemelas disponibles · la más barata: ${a.gemela_mas_barata.unidad} $${(a.gemela_mas_barata.precio || 0).toLocaleString('en-US')} (p${a.gemela_mas_barata.piso})`)}
            {a.primera_foto && chip(`en bitácora desde ${a.primera_foto} · ${a.cambios_de_precio || 0} cambios de precio`)}
            {x.zona && chip(`zona: ${x.zona.grade ? `calidad ${x.zona.grade}` : ''}${x.zona.riesgo ? ` · riesgo ${x.zona.riesgo}` : ''}`)}
            {x.suelo?.premium_obra_nueva_pct != null && chip(`obra nueva: ${x.suelo.premium_obra_nueva_pct > 0 ? '+' : ''}${x.suelo.premium_obra_nueva_pct}% vs el AVM de la colonia ($${(x.suelo.avm_m2_colonia || 0).toLocaleString('en-US')}/m², 1.08M avalúos)`)}
            {x.finanzas?.mensualidad && chip(`~$${x.finanzas.mensualidad.toLocaleString('en-US')}/mes (tasa ${(x.finanzas.tasa * 100).toFixed(1)}%, ${x.finanzas.plazo_anios}a) · ingreso req. $${(x.finanzas.ingreso_requerido || 0).toLocaleString('en-US')}`)}
            {x.capacidad && chip(`${x.capacidad.alcanzan} de ${x.capacidad.de} perfiles del genoma pueden pagarla`, x.capacidad.alcanzan > 0 ? 'ok' : 'neutro')}
          </div>

          {/* ⚖️ LA ECUACIÓN DEL PRECIO v1 */}
          {x.ecuacion && (
            <div style={{ margin: '4px 0 8px', padding: '9px 13px', borderRadius: 10, background: '#1a1923', border: '1px solid rgba(255,255,255,0.09)', fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.85)' }}>
              <b style={{ color: 'var(--cream)' }}>⚖️ De qué está hecho el precio:</b>{' '}
              {x.ecuacion.factores.map((fa, i) => (
                <span key={i}>{i > 0 ? ' ' : ''}{fa.factor}: <b style={{ color: 'var(--cream)' }}>${fa.monto.toLocaleString('en-US')}</b>{fa.pct != null ? ` (${fa.pct > 0 ? '+' : ''}${fa.pct}%)` : ''} ·</span>
              ))}
              {x.ecuacion.premium_obra_nueva_pct != null && <span> premium obra nueva vs colonia: <b style={{ color: 'var(--cream)' }}>{x.ecuacion.premium_obra_nueva_pct > 0 ? '+' : ''}{x.ecuacion.premium_obra_nueva_pct}%</b></span>}
            </div>
          )}

          {/* 🎯 PRECIO ÓPTIMO v1: modelo × demanda observada — recomendación al dev */}
          {x.precio_optimo && (
            <div style={{ margin: '4px 0 8px', padding: '9px 13px', borderRadius: 10, background: x.precio_optimo.recomendacion === 'subir' ? 'rgba(74,222,128,0.06)' : x.precio_optimo.recomendacion === 'revisar' ? 'rgba(248,113,113,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${x.precio_optimo.recomendacion === 'subir' ? 'rgba(74,222,128,0.35)' : x.precio_optimo.recomendacion === 'revisar' ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.1)'}`, fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.85)' }}>
              <b style={{ color: 'var(--cream)' }}>🎯 Precio óptimo: {({ subir: `SUBIR ~${x.precio_optimo.delta_sugerido_pct}%`, revisar: `REVISAR (${x.precio_optimo.delta_sugerido_pct}%)`, gancho: 'GANCHO consciente', mantener: 'MANTENER' })[x.precio_optimo.recomendacion]}</b>
              {' — '}{x.precio_optimo.porque}
            </div>
          )}

          {/* 🗡 EL ARGUMENTO DE VENTA (battle card del átomo) */}
          {(x.argumento || []).length > 0 && (
            <div style={{ margin: '4px 0 8px', padding: '9px 13px', borderRadius: 10, background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.3)' }}>
              <b style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#9ecbff' }}>🗡 Argumento de venta (auto-generado):</b>
              {x.argumento.map((p, i) => <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.85)', marginTop: 3 }}>· {p}</div>)}
              <button style={{ ...S.mini, marginTop: 6, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.4)', color: '#9ecbff', fontWeight: 700 }}
                onClick={() => { navigator.clipboard.writeText(x.argumento.join('\n')); }}>📋 Copiar para el asesor</button>
            </div>
          )}
          {(x.rieles_pendientes || []).length > 0 && (
            <div style={{ ...S.mini, opacity: 0.5, margin: '0 0 6px' }}>⏳ {x.rieles_pendientes[0]}</div>
          )}

          {/* EDITAR aquí mismo (un clic = todo: ver y corregir) */}
          {unidad && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', margin: '4px 0 10px', padding: '10px 12px', borderRadius: 10, background: '#1a1923', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ ...S.mini }}>Estado
                <select data-testid="unidad-status" style={{ ...S.inp, marginTop: 3, minWidth: 120 }} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </label>
              <label style={{ ...S.mini }}>Precio (MXN)
                <input data-testid="unidad-precio" style={{ ...S.inp, marginTop: 3, minWidth: 130 }} value={precio === '' ? '' : `$${Number(String(precio).replace(/[^0-9.]/g, '') || 0).toLocaleString('en-US')}`}
                  onChange={(e) => setPrecio(e.target.value.replace(/[^0-9.]/g, ''))} />
              </label>
              <label style={{ ...S.mini }}>Orientación
                <select data-testid="unidad-orientacion" style={{ ...S.inp, marginTop: 3 }} value={orientacion} onChange={(e) => setOrientacion(e.target.value)}>
                  {ORIENTACIONES.map((o) => <option key={o} value={o}>{o || '— sin dato —'}</option>)}
                </select>
              </label>
              <label style={{ ...S.mini, flex: 1, minWidth: 140 }}>Vista
                <input data-testid="unidad-vista" style={{ ...S.inp, marginTop: 3 }} placeholder="calle / interior / parque" value={vista} onChange={(e) => setVista(e.target.value)} />
              </label>
              <button style={S.btn} data-testid="unidad-guardar" onClick={guardar}>Guardar</button>
              {msg && <span style={{ ...S.mini, color: msg.includes('✓') ? '#86efac' : '#fca5a5' }}>{msg}</span>}
            </div>
          )}

          {/* ✏️ EDITAR DATOS: corregir cualquier campo de la ficha, con auditoría */}
          {editar && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, margin: '4px 0 12px', padding: '12px', borderRadius: 10, background: '#1a1923', border: '1px solid rgba(210,153,34,0.35)' }}>
              {CAMPOS_EDITABLES.map(([campo, label, tipo]) => (
                <label key={campo} style={S.mini}>{label}
                  <input style={{ ...S.inp, marginTop: 3 }} type={tipo === 'num' ? 'number' : 'text'}
                    value={form[campo] ?? ''} placeholder="—"
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })} />
                </label>
              ))}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <button style={S.btn} onClick={guardarDatos}>Guardar datos</button>
              </div>
            </div>
          )}

          {/* planos del átomo */}
          {(x.unidad.plano_url || x.unidad.plano_amueblado_url) && (
            <div style={{ display: 'flex', gap: 10, margin: '8px 0 12px', flexWrap: 'wrap' }}>
              {x.unidad.plano_amueblado_url && <img src={`${API}${x.unidad.plano_amueblado_url}`} alt="planta amueblada" style={{ height: 150, borderRadius: 10, background: '#fff' }} />}
              {x.unidad.plano_url && <img src={`${API}${x.unidad.plano_url}`} alt="plano" style={{ height: 150, borderRadius: 10, background: '#fff' }} />}
            </div>
          )}

          {/* las SECCIONES del registro universal: dato o FALTA con quién lo llena */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {x.secciones.map((sec) => (
              <div key={sec.titulo} style={{ background: '#1a1923', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ ...S.mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{sec.titulo}</div>
                {sec.campos.map((c) => (
                  <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', borderBottom: '1px dashed rgba(255,255,255,0.05)' }}>
                    <span style={{ ...S.mini, flexShrink: 0 }}>{c.label}</span>
                    {c.valor != null
                      ? <span style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, color: 'var(--cream)', textAlign: 'right' }}>{String(c.valor)}</span>
                      : <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#d29922', textAlign: 'right' }} title={`Lo llena: ${c.quien_llena}`}>FALTA · {c.quien_llena}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>,
    document.body
  );
}

const EJES_CORTE = [
  ['Geografía', ['ciudad', 'alcaldia', 'colonia', 'microzona', 'desarrollo']],
  ['Edificio', ['torre', 'piso', 'molde', 'exterior', 'espacios', 'flex']],
  ['Producto', ['tipologia', 'banos', 'estacionamientos', 'banda_m2', 'etapa', 'estatus', 'orientacion', 'vista', 'amueblado', 'cuarto_servicio']],
  ['Dinero', ['banda_precio', 'banda_pm2', 'banda_enganche']],
  ['Tiempo', ['cohorte']],
  ['Fuente', ['fuente']],
];
const NOMBRE_DIM = { banda_m2: 'tamaño', banda_precio: 'precio', banda_pm2: '$/m²', banda_enganche: 'enganche', tipologia: 'recámaras', banos: 'baños', estacionamientos: 'cajones', cuarto_servicio: 'cto. servicio', orientacion: 'orientación' };

function Corte() {
  const nav = useNavigate();
  const [dims, setDims] = useState(['colonia', 'tipologia']);
  const [pins, setPins] = useState({});          // 📌 segmentos anclados: {dim: valor}
  const [abierta, setAbierta] = useState(null);  // fila expandida hasta el átomo
  const [fichaId, setFichaId] = useState(null);  // ficha completa del átomo (modal)
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!dims.length && !Object.keys(pins).length) { setData(null); return; }
    const qs = `por=${dims.join(',') || 'desarrollo'}&con_atomos=1` +
      (Object.keys(pins).length ? `&filtros=${encodeURIComponent(JSON.stringify(pins))}` : '');
    _get(`/corte?${qs}`).then(setData).catch(() => setData(null));
    setAbierta(null);
  }, [dims, pins]);
  const toggle = (d) => setDims(dims.includes(d) ? dims.filter((x) => x !== d) : [...dims, d].slice(-3));
  const anclar = (r) => {   // clic en 📌: el segmento se vuelve filtro y sigues cortando más hondo
    const nuevos = { ...pins };
    dims.forEach((d) => { if (r[d] != null) nuevos[d] = String(r[d]); });
    setPins(nuevos); setDims([]);
  };
  const soltar = (d) => { const p = { ...pins }; delete p[d]; setPins(p); };
  const filas = (data?.filas || []).slice(0, 25);
  const maxU = Math.max(1, ...filas.map((f) => f.unidades || 0));
  const tot = (data?.filas || []).reduce((a, f) => a + (f.unidades || 0), 0);
  const grid = { display: 'grid', gridTemplateColumns: 'minmax(170px, 1.6fr) 1.4fr 76px 92px 84px 90px 70px', gap: 10, alignItems: 'center' };
  const num = { fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 700 };
  const th = { ...S.mini, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.7, fontSize: 9.5, fontWeight: 800 };
  const tension = (t) => t == null ? null : (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 800,
      background: t >= 1 ? 'rgba(248,113,113,0.15)' : t >= 0.4 ? 'rgba(210,153,34,0.15)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${t >= 1 ? 'rgba(248,113,113,0.45)' : t >= 0.4 ? 'rgba(210,153,34,0.45)' : 'rgba(255,255,255,0.12)'}`,
      color: t >= 1 ? '#fca5a5' : t >= 0.4 ? '#d29922' : 'rgba(240,235,224,0.55)' }}>{t >= 1 ? '🔥 ' : ''}{t}</span>
  );
  return (
    <div style={{ ...S.card, margin: '4px 0 12px', padding: '18px 20px' }} data-testid="corte-mercado" className="dmx-card">
      {/* cabecera + resumen */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>El corte del mercado</h2>
        <span style={S.mini}>cruza hasta 3 dimensiones — de la ciudad al átomo · oferta ⨯ demanda real</span>
        <span style={{ flex: 1 }} />
        {data && <span style={{ ...S.mini, fontVariantNumeric: 'tabular-nums' }}><b style={{ color: 'var(--cream)' }}>{tot}</b> unidades · <b style={{ color: 'var(--cream)' }}>{(data.filas || []).length}</b> segmentos</span>}
      </div>

      {/* selector por eje (agrupado y legible) */}
      <div style={{ display: 'grid', gap: 6, margin: '12px 0 4px' }}>
        {EJES_CORTE.map(([eje, ds]) => (
          <div key={eje} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ ...S.mini, width: 72, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800, fontSize: 9.5, opacity: 0.65 }}>{eje}</span>
            {ds.map((d) => {
              const on = dims.includes(d);
              const orden = dims.indexOf(d) + 1;
              return (
                <button key={d} onClick={() => toggle(d)}
                  style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: on ? 800 : 600, padding: '4px 11px', borderRadius: 8, cursor: 'pointer',
                    background: on ? 'var(--theme)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${on ? 'var(--theme)' : 'rgba(255,255,255,0.14)'}`,
                    color: on ? '#0b0b0b' : 'rgba(240,235,224,0.8)', transition: 'all .15s' }}>
                  {on ? `${orden}· ` : ''}{NOMBRE_DIM[d] || d}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 📌 segmentos anclados (profundidad sin límite) */}
      {Object.keys(pins).length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
          <span style={{ ...S.mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, fontSize: 9.5 }}>📌 Anclado</span>
          {Object.entries(pins).map(([d, v]) => (
            <button key={d} onClick={() => soltar(d)} title="Quitar este ancla"
              style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, padding: '4px 11px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(var(--theme-rgb),0.14)', border: '1px solid rgba(var(--theme-rgb),0.5)', color: 'var(--theme)' }}>
              {(NOMBRE_DIM[d] || d)}: {v} ✕
            </button>
          ))}
          <span style={S.mini}>· ahora corta por otra dimensión dentro de este segmento</span>
        </div>
      )}

      {/* la tabla del corte */}
      {filas.length === 0 ? <p style={{ ...S.p, marginTop: 10 }}>Elige una dimensión con datos (o afloja el cruce).</p> : (
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <div style={{ ...grid, padding: '0 0 6px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <span style={{ ...th, textAlign: 'left' }}>Segmento</span>
            <span style={{ ...th, textAlign: 'left' }}>Oferta</span>
            <span style={th}>Colocado</span>
            <span style={th}>$/m² prom</span>
            <span style={th}>Desde</span>
            <span style={th} title="Búsquedas reales del marketplace cuyos criterios le quedan a este segmento">Demanda</span>
            <span style={th} title="Búsquedas compatibles ÷ unidades disponibles">Tensión</span>
          </div>
          {filas.map((r, i) => (
            <React.Fragment key={i}>
              <div style={{ ...grid, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                onClick={() => setAbierta(abierta === i ? null : i)} title="Clic: ver sus unidades (el átomo)">
                <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ opacity: 0.5, fontSize: 10 }}>{abierta === i ? '▾' : '▸'}</span>
                  {dims.map((d) => r[d]).filter(Boolean).join('  ×  ') || '(todo el segmento anclado)'}
                  {dims.length > 0 && <button onClick={(e) => { e.stopPropagation(); anclar(r); }} title="Anclar este segmento y seguir cortando más hondo"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: '0 2px' }}>📌</button>}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ height: 8, width: `${Math.max(3, (r.unidades / maxU) * 100)}%`, maxWidth: '70%', borderRadius: 4, background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.85), rgba(var(--theme-rgb),0.35))' }} />
                  <span style={{ ...S.mini, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}><b style={{ color: 'var(--cream)' }}>{r.unidades}</b>u · {r.disponibles} disp</span>
                </span>
                <span style={num}>{r.colocacion_pct != null && r.colocacion_pct > 0 ? `${r.colocacion_pct}%` : '—'}</span>
                <span style={num} title={r.pm2_min ? `mediana $${r.pm2_mediana.toLocaleString('en-US')} · rango $${r.pm2_min.toLocaleString('en-US')}–$${r.pm2_max.toLocaleString('en-US')}` : ''}>{r.pm2_prom ? `$${r.pm2_prom.toLocaleString('en-US')}` : '—'}</span>
                <span style={num}>{r.precio_min ? `$${r.precio_min.toLocaleString('en-US')}` : '—'}</span>
                <span style={{ ...num, color: r.demanda_busquedas ? 'var(--cream)' : 'rgba(240,235,224,0.4)' }}>{r.demanda_busquedas ?? '—'}{r.leads ? ` · ${r.leads} leads` : ''}</span>
                <span style={{ textAlign: 'right' }}>{tension(r.tension) || <span style={{ ...S.mini, opacity: 0.4 }}>—</span>}</span>
              </div>
              {abierta === i && (r.atomos || []).length > 0 && (
                <div style={{ padding: '8px 0 10px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
                  <div style={{ ...S.mini, marginBottom: 6 }}>
                    Las {r.atomos.length} unidades de este segmento{r.atomos_truncados ? ` (+${r.atomos_truncados} más)` : ''} · $/m² mediana <b style={{ color: 'var(--cream)' }}>${(r.pm2_mediana || 0).toLocaleString('en-US')}</b> · rango ${(r.pm2_min || 0).toLocaleString('en-US')}–${(r.pm2_max || 0).toLocaleString('en-US')}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 5 }}>
                    {r.atomos.map((a) => (
                      <button key={`${a.development_id}-${a.unidad}`} onClick={() => a.id && setFichaId(a)}
                        title={a.id ? `Ficha completa del ${a.unidad}` : `${a.unidad} · dato de mercado 4S (sin ficha propia)`}
                        style={{ textAlign: 'left', cursor: 'pointer', padding: '6px 10px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 800, color: 'var(--cream)' }}>{a.unidad}</span>
                        <span style={{ ...S.mini, marginLeft: 6 }}>
                          {a.piso != null ? `p${a.piso} · ` : ''}{a.m2 ? `${a.m2}m² · ` : ''}{a.precio ? `$${a.precio.toLocaleString('en-US')}` : ''}
                          {a.pm2 ? ` · $${a.pm2.toLocaleString('en-US')}/m²` : ''}
                        </span>
                        <span style={{ ...S.mini, marginLeft: 6, color: a.estatus === 'disponible' ? '#86efac' : '#fca5a5' }}>{a.estatus}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
          {(data?.filas || []).length > 25 && <p style={{ ...S.mini, marginTop: 6 }}>… {(data.filas.length - 25)} segmentos más — afina el cruce para verlos.</p>}
          <p style={{ ...S.mini, marginTop: 8, opacity: 0.65 }}>Demanda = búsquedas reales del marketplace que le quedan al segmento (criterios completos) · señales y leads se atribuyen a nivel desarrollo · la serie en el tiempo vive en Mercado.</p>
        </div>
      )}
      {fichaId && <FichaUnidad unitId={fichaId.id} unidad={{ id: fichaId.id, status: fichaId.estatus, price_mxn: fichaId.precio }} onCerrar={() => setFichaId(null)} />}
    </div>
  );
}

function PerfilDev({ org }) {
  const [pf, setPf] = useState(null);
  useEffect(() => { _get(`/dev/${encodeURIComponent(org)}/perfil`).then(setPf).catch(() => setPf(null)); }, [org]);
  if (!pf || !pf.radar?.length) return null;
  const ag = pf.agregados || {};
  const ETAPA_COLOR = { preventa: '#9ecbff', entrega_inmediata: '#86efac', inversion: '#d29922', rentas: '#f0abfc', 'sin etiqueta': 'rgba(240,235,224,0.5)' };
  return (
    <div style={{ ...S.card, marginBottom: 12 }} data-testid="perfil-dev">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <b style={{ ...S.h, fontSize: 15 }}>🏢 El portafolio completo de {pf.nombre}</b>
        <span style={S.mini}>lo que el Vigía VE en su Drive · {ag.proyectos_drive} proyectos{ag.fuera_alcance ? ` (${ag.fuera_alcance} fuera de alcance)` : ''} · {ag.con_lista} con lista · <b style={{ color: '#d29922' }}>{ag.sin_ingerir} sin ingerir</b></span>
        <span style={{ flex: 1 }} />
        {pf.temperatura_dato?.ultima_lista && <span style={{ ...S.mini, fontWeight: 700 }}>🌡 última lista: {String(pf.temperatura_dato.ultima_lista).slice(0, 10)}</span>}
        {(pf.indice || []).length > 0 && <span style={{ ...S.mini, fontWeight: 700 }}>📈 índice del dev: ${pf.indice[pf.indice.length - 1].pm2_indice.toLocaleString('en-US')}/m² ({pf.indice.length} punto{pf.indice.length > 1 ? 's' : ''} — crece con cada lista)</span>}
        {Object.entries(ag.por_etapa || {}).map(([e, n]) => (
          <span key={e} style={{ ...S.mini, padding: '3px 9px', borderRadius: 9999, border: `1px solid ${ETAPA_COLOR[e] || '#888'}55`, color: ETAPA_COLOR[e] || '#ccc', fontWeight: 700 }}>{e.replace('_', ' ')}: {n}</span>
        ))}
      </div>
      {(pf.catalogo || []).length > 1 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '4px 0 10px' }}>
          {pf.catalogo.map((c) => (
            <div key={c.id} style={{ minWidth: 170 }}>
              <div style={{ ...S.mini, fontWeight: 700, color: 'var(--cream)' }}>{c.name} · {c.unidades}u{c.colocacion_pct != null ? ` · ${c.colocacion_pct}%` : ''}</div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 3 }}>
                <div style={{ height: '100%', width: `${c.readiness_pct || 0}%`, background: (c.readiness_pct || 0) >= 80 ? '#4ADE80' : '#d29922' }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6 }}>
        {pf.radar.map((p) => (
          <div key={p.proyecto} style={{ padding: '8px 11px', borderRadius: 10, opacity: p.fuera_alcance ? 0.4 : 1, background: p.ingerido ? 'rgba(74,222,128,0.05)' : 'rgba(255,255,255,0.025)', border: `1px solid ${p.ingerido ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.09)'}` }}>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>
              {p.ingerido ? '✓ ' : ''}{p.proyecto.length > 42 ? p.proyecto.slice(0, 42) + '…' : p.proyecto}
            </div>
            <div style={{ ...S.mini, marginTop: 2 }}>
              {p.etapa && <span style={{ color: ETAPA_COLOR[p.etapa] || '#ccc', fontWeight: 700 }}>{p.etapa.replace('_', ' ')} · </span>}
              {p.n_archivos} archivos{p.tiene_lista ? ' · 📄 lista ✓' : ''}
              {p.fuera_alcance ? <span style={{ fontWeight: 700 }}> · 🚫 fuera de alcance</span> : (!p.ingerido && <span style={{ color: '#d29922', fontWeight: 700 }}> · sin ingerir</span>)}
            </div>
            <div style={{ ...S.mini, opacity: 0.7 }}>{Object.entries(p.documentos || {}).filter(([t]) => t !== 'otro').map(([t, n]) => `${t}:${n}`).join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapaCatalogo() {
  const [pins, setPins] = useState(null);
  const nav = useNavigate();
  const mapRef = useRef(null);
  const contRef = useRef(null);
  useEffect(() => { _get('/pins').then((r) => setPins(r.pins)).catch(() => setPins(null)); }, []);
  useEffect(() => {
    if (!pins || !pins.length || !contRef.current || mapRef.current) return;
    let mapboxgl;
    try { mapboxgl = require('mapbox-gl'); } catch (e) { return; }
    const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!TOKEN) return;
    mapboxgl.accessToken = TOKEN;
    const centro = [pins.reduce((a, p) => a + p.lng, 0) / pins.length, pins.reduce((a, p) => a + p.lat, 0) / pins.length];
    const map = new mapboxgl.Map({ container: contRef.current, style: 'mapbox://styles/mapbox/dark-v11', center: centro, zoom: 10.5 });
    mapRef.current = map;
    pins.forEach((p) => {
      const el = document.createElement('div');
      const ok = (p.readiness_pct || 0) >= 80;
      el.style.cssText = `width:16px;height:16px;border-radius:50%;cursor:pointer;background:${ok ? '#4ADE80' : '#d29922'};border:2px solid rgba(0,0,0,0.6);box-shadow:0 0 8px ${ok ? 'rgba(74,222,128,0.6)' : 'rgba(210,153,34,0.5)'}`;
      el.title = `${p.name} · ${p.unidades}u${p.colocacion_pct != null ? ` · ${p.colocacion_pct}% colocado` : ''} · ficha ${p.readiness_pct || 0}%`;
      el.onclick = () => nav(`/superadmin/expediente/${p.id}`);
      new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).addTo(map);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [pins, nav]);
  if (!pins || !pins.length || !process.env.REACT_APP_MAPBOX_TOKEN) return null;
  return (
    <div style={{ ...S.card, margin: '4px 0 12px', padding: 0, overflow: 'hidden' }} data-testid="mapa-catalogo">
      <div style={{ padding: '12px 18px 8px', display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>🗺 El catálogo en el mapa</h2>
        <span style={S.mini}>{pins.length} proyectos · verde = publicable · clic en el pin = Expediente</span>
      </div>
      <div ref={contRef} style={{ height: 260, width: '100%' }} />
    </div>
  );
}

function BandejaUnica() {
  const [b, setB] = useState(null);
  const [eco, setEco] = useState(null);
  const nav = useNavigate();
  useEffect(() => {
    _get('/bandeja').then(setB).catch(() => setB(null));
    _get('/unit-economics').then(setEco).catch(() => setEco(null));
  }, []);
  if (!b) return null;
  return (
    <div style={{ ...S.card, margin: '4px 0 12px', border: b.al_dia ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(var(--theme-rgb),0.4)' }} data-testid="bandeja-unica">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: b.al_dia ? 0 : 8 }}>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>📥 Tu bandeja de hoy {b.al_dia ? '— al día 🎉' : `(${b.n})`}</h2>
        <span style={S.mini}>todo lo accionable, ordenado por valor — una sola lista</span>
        {eco && <span style={{ ...S.mini, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>economics del dato: {eco.proyectos} proyectos · {eco.unidades}u · API acumulado ${eco.costo_api_acumulado_mxn.toLocaleString('en-US')}</span>}
      </div>
      {(b.items || []).slice(0, 8).map((it, i) => (
        <button key={i} onClick={() => nav(it.link)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 9, cursor: 'pointer', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', marginTop: 4 }}>
          <span>{it.icono}</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>{it.titulo}</span>
          <span style={{ ...S.mini, marginLeft: 'auto', opacity: 0.5 }}>→</span>
        </button>
      ))}
    </div>
  );
}

function MercadoCruces() {
  const [mc, setMc] = useState(null);
  useEffect(() => { _get('/mercado-cruces').then(setMc).catch(() => setMc(null)); }, []);
  if (!mc || (!mc.gaps?.length && !mc.demanda_revelada?.length)) return null;
  return (
    <div style={{ ...S.card, margin: '4px 0 12px' }} data-testid="mercado-cruces">
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 4px' }}>🕳 Gaps de producto y demanda revelada</h2>
      <span style={S.mini}>{mc.nota}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 10 }}>
        <div>
          <div style={{ ...S.mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5 }}>Qué falta construir/traer (el mercado lo agotó)</div>
          {(mc.gaps || []).slice(0, 6).map((g, i) => (
            <div key={i} style={{ ...S.mini, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              🕳 <b style={{ color: 'var(--cream)' }}>{g.banda_precio}</b> en <b style={{ color: 'var(--cream)' }}>{g.colonia}</b> · {g.colocacion_observada_pct}% colocado observado ({g.unidades_observadas}u)
            </div>
          ))}
          {!(mc.gaps || []).length && <span style={S.mini}>sin gaps detectables aún</span>}
        </div>
        <div>
          <div style={{ ...S.mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5 }}>Demanda revelada (lo que SÍ compró)</div>
          {(mc.demanda_revelada || []).slice(0, 6).map((d, i) => (
            <div key={i} style={{ ...S.mini, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: `${Math.min(70, d.colocacion_pct * 0.7)}%`, maxWidth: '55%', height: 6, borderRadius: 3, background: 'linear-gradient(90deg, rgba(74,222,128,0.8), rgba(74,222,128,0.3))' }} />
              <b style={{ color: 'var(--cream)' }}>{d.colonia}</b> {d.colocacion_pct}% ({d.unidades}u)
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SuperadminInventario({ user, onLogout }) {
  const nav = useNavigate();
  const loc = useLocation();
  const q = new URLSearchParams(loc.search);
  const [arbol, setArbol] = useState(null);
  const [err, setErr] = useState('');
  const devSel = q.get('dev') || '';
  const proySel = q.get('proyecto') || '';
  const [proy, setProy] = useState(null);        // {proyecto, unidades, prototipos}
  const [unidadSel, setUnidadSel] = useState(null);
  const [moldeSel, setMoldeSel] = useState(null);
  const colorDeMolde = (pid) => {
    const i = (proy?.prototipos || []).findIndex((p) => p.prototype_id === pid);
    return i >= 0 ? PALETA_MOLDE[i % PALETA_MOLDE.length] : null;
  };

  const cargarArbol = useCallback(() => _get('/arbol').then(setArbol).catch((e) => setErr(String(e.message))), []);
  useEffect(() => { cargarArbol(); }, [cargarArbol]);
  useEffect(() => {
    if (proySel) _get(`/proyecto/${encodeURIComponent(proySel)}`).then(setProy).catch((e) => setErr(String(e.message)));
    else { setProy(null); setUnidadSel(null); }
  }, [proySel]);

  const ir = (params) => nav(`/superadmin/inventario${params ? `?${params}` : ''}`);
  const dev = arbol?.devs?.find((d) => d.dev_org_id === devSel);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ padding: '26px 30px', maxWidth: 1280, margin: '0 auto' }} data-testid="inventario">
        {/* header + bandeja + acciones: TODO a un clic */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <Building2 size={22} color="var(--theme)" />
          <h1 style={{ ...S.h, fontSize: 24, margin: 0 }}>Inventario</h1>
          {arbol && <span style={S.mini}>{arbol.n_devs} devs · {arbol.n_proyectos} proyectos · {arbol.n_unidades} unidades</span>}
          <span style={{ flex: 1 }} />
          <button style={{ ...S.btn, ...(arbol?.vigia_pendientes ? { background: 'rgba(210,153,34,0.15)', border: '1px solid rgba(210,153,34,0.5)', color: '#d29922' } : {}) }}
            onClick={() => nav('/superadmin/alta?tab=vigia')} data-testid="ir-vigia">
            <Radar size={13} /> Vigía {arbol?.vigia_pendientes ? `(${arbol.vigia_pendientes} por aprobar)` : ''}
          </button>
          <button style={S.btn} onClick={() => nav('/superadmin/alta?tab=masiva')}><FolderUp size={13} /> Cargar</button>
          <button style={S.btn} onClick={() => nav('/superadmin/alta?tab=manual')}><UserPlus size={13} /> Alta</button>
        </div>

        {/* acceso directo al ANÁLISIS (la página Desarrollos con Panorama/Inteligencia/lentes
            sigue viva completa — esto evita que quede escondida tras el buscador) */}
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', margin: '2px 0 4px' }}>
          <span style={{ ...S.mini, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800 }}>Análisis</span>
          {[['📊 Panorama', '/superadmin/desarrollos'],
            ['🔬 Inteligencia · 7 lentes', '/superadmin/desarrollos?view=inteligencia'],
            ['✅ Catálogo y aprobación', '/superadmin/desarrollos?view=catalogo'],
            ['🧩 Granularidad', '/superadmin/alta?tab=granularidad'],
            ['📦 Prototipos', '/superadmin/alta?tab=prototipos']].map(([l, to]) => (
            <button key={l} onClick={() => nav(to)}
              style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, padding: '5px 12px', borderRadius: 9999, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.85)' }}>{l}</button>
          ))}
        </div>

        {/* 📥 LA BANDEJA ÚNICA + los cruces de mercado (solo en la raíz) */}
        {!devSel && <BandejaUnica />}
        {!devSel && <MapaCatalogo />}
        {!devSel && <Corte />}
        {!devSel && <MercadoCruces />}

        {/* breadcrumb del drill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 16px', flexWrap: 'wrap' }}>
          <button onClick={() => ir('')} style={{ ...S.btn, padding: '4px 10px', background: !devSel ? 'rgba(var(--theme-rgb),0.2)' : 'rgba(255,255,255,0.04)' }}><Home size={12} /> Desarrolladores</button>
          {dev && <><ChevronRight size={13} color="rgba(240,235,224,0.4)" />
            <button onClick={() => ir(`dev=${encodeURIComponent(devSel)}`)} style={{ ...S.btn, padding: '4px 10px', background: devSel && !proySel ? 'rgba(var(--theme-rgb),0.2)' : 'rgba(255,255,255,0.04)' }}>{dev.nombre}</button></>}
          {proy && <><ChevronRight size={13} color="rgba(240,235,224,0.4)" />
            <span style={{ ...S.p, fontWeight: 700, color: 'var(--cream)' }}>{proy.proyecto.name}</span></>}
        </div>

        {err && <p style={{ ...S.p, color: '#fca5a5' }}>⚠ {err}</p>}
        {!arbol && !err && <p style={S.p}>Cargando el inventario…</p>}

        {/* LA TAREA PENDIENTE — el flujo te lleva: un clic y caes en el botón de Aprobar */}
        {arbol && arbol.revision_pendientes > 0 && (
          <button data-testid="banner-aprobar" onClick={() => nav('/superadmin/alta?tab=masiva&cola=1')}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 14, padding: '16px 20px',
              borderRadius: 14, background: 'rgba(210,153,34,0.12)', border: '2px solid rgba(210,153,34,0.55)',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 26 }}>📋</span>
            <span style={{ flex: 1, minWidth: 220 }}>
              <b style={{ ...S.h, fontSize: 16, color: '#d29922', display: 'block' }}>
                {arbol.revision_pendientes} proyecto{arbol.revision_pendientes > 1 ? 's' : ''} esperando TU aprobación
              </b>
              <span style={{ ...S.p, fontSize: 12.5 }}>Ya está extraído y revisado — solo falta tu clic para que entre al catálogo.</span>
            </span>
            <span style={{ padding: '10px 20px', borderRadius: 10, background: '#d29922', color: '#000', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5 }}>
              Revisar y aprobar →
            </span>
          </button>
        )}

        {/* estado inicial: catálogo en cero → onboarding con propósito (no un vacío) */}
        {arbol && !devSel && arbol.n_proyectos === 0 && (
          <div style={{ ...S.card, marginBottom: 14, padding: 22, background: 'linear-gradient(135deg, rgba(var(--theme-rgb),0.06), rgba(255,255,255,0.02))' }}>
            <b style={{ ...S.h, fontSize: 17 }}>El catálogo está en cero — enciéndelo en 3 pasos</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
              {[['1', '👁 El vigía ya vigila tu Drive', 'Revisa su bandeja y mapea cada carpeta a su desarrollador.', 'Abrir Vigía', '/superadmin/alta?tab=vigia'],
                ['2', '✅ Aprueba lo detectado', 'Cada lista aprobada entra al catálogo con su historia desde el día uno.', 'Ver pendientes', '/superadmin/alta?tab=vigia'],
                ['3', '🏢 Mira crecer las torres', 'Cada proyecto se pinta unidad por unidad — clic para editar sin asistentes.', 'Cargar a mano', '/superadmin/alta?tab=masiva']].map(([n, t, d, cta, to]) => (
                <div key={n} style={{ display: 'grid', gap: 6 }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.45)', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--theme)' }}>{n}</span>
                  <b style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, color: 'var(--cream)' }}>{t}</b>
                  <span style={{ ...S.p, fontSize: 12 }}>{d}</span>
                  <button onClick={() => nav(to)} style={{ ...S.btn, alignSelf: 'start', padding: '5px 12px', fontSize: 11.5 }}>{cta}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NIVEL 1 · devs */}
        {arbol && !devSel && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>

            {arbol.devs.map((d) => {
              const iniciales = (d.nombre || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
              return (
              <button key={d.dev_org_id} data-testid={`dev-${d.dev_org_id}`} onClick={() => ir(`dev=${encodeURIComponent(d.dev_org_id)}`)}
                style={{ ...S.card, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 10, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(var(--theme-rgb),0.15)', border: '1px solid rgba(var(--theme-rgb),0.4)',
                    fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--theme)' }}>{iniciales}</span>
                  <b style={{ ...S.h, fontSize: 15.5 }}>{d.nombre}</b>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...S.mini, padding: '3px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>🏗 {d.n_proyectos} proyectos</span>
                  <span style={{ ...S.mini, padding: '3px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>🚪 {d.n_unidades} unidades</span>
                </div>
                <span style={{ ...S.mini, display: 'inline-flex', alignItems: 'center', gap: 5, color: d.carpeta_vigilada ? '#86efac' : 'rgba(240,235,224,0.45)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.carpeta_vigilada ? '#4ADE80' : '#8b949e', display: 'inline-block' }} />
                  {d.carpeta_vigilada ? `Vigilado: ${d.carpeta_vigilada}` : 'Sin carpeta vigilada aún'}
                </span>
                <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, color: 'var(--theme)' }}>Abrir expediente →</span>
              </button>
            ); })}
          </div>
        )}

        {/* NIVEL 2 · expediente del dev */}
        {arbol && dev && !proySel && <PerfilDev org={devSel} />}
        {arbol && dev && !proySel && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {dev.proyectos.length === 0 && <p style={S.p}>Este dev aún no tiene proyectos cargados. Usa «Cargar» o aprueba su carpeta en el Vigía.</p>}
            {dev.proyectos.map((p) => (
              <button key={p.id} data-testid={`proy-${p.id}`} onClick={() => nav(`/superadmin/expediente/${encodeURIComponent(p.id)}`)}
                style={{ ...S.card, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 7 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(var(--theme-rgb),0.5)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ ...S.h, fontSize: 14.5 }}>{p.nombre}</b>
                  {p.publicado ? <span style={{ ...S.mini, color: '#86efac' }}>publicado</span> : <span style={S.mini}>borrador</span>}
                </div>
                <span style={S.mini}>{p.colonia}{p.etapa ? ` · ${p.etapa}` : ''} · {p.unidades} unidades · {p.prototipos} moldes {p.precio_desde ? `· desde ${fmtM(p.precio_desde)}` : ''}</span>
                {p.avance_pct != null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={`Ficha completa al ${p.avance_pct}% · publicable al 80%`}>
                    <span style={{ flex: 1, maxWidth: 160, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'inline-block' }}>
                      <span style={{ display: 'block', height: '100%', width: `${p.avance_pct}%`, background: p.avance_pct >= 80 ? '#4ADE80' : '#d29922' }} />
                    </span>
                    <span style={{ ...S.mini, fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: p.avance_pct >= 80 ? '#86efac' : '#d29922' }}>{p.avance_pct}%</span>
                    {p.salud_dato && (p.salud_dato.error > 0 || p.salud_dato.alerta > 0) && (
                      <span style={{ ...S.mini, color: p.salud_dato.error ? '#fca5a5' : '#d29922' }}>🩺 {p.salud_dato.error || 0}E·{p.salud_dato.alerta || 0}A</span>
                    )}
                  </span>
                )}
                <MiniTorre porEstado={p.por_estado} total={p.unidades} />
              </button>
            ))}
          </div>
        )}

        {/* NIVEL 3 · la torre clickeable — un clic en el depa = SU FICHA COMPLETA */}
        {proy && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, alignItems: 'start' }}>
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                  <b style={{ ...S.h, fontSize: 16 }}>{proy.proyecto.name}</b>
                  <div style={S.mini}>{proy.n_unidades} unidades · {proy.prototipos.length} moldes · clic en una unidad para editarla</div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {proy.prototipos.map((pr, i) => {
                    const col = PALETA_MOLDE[i % PALETA_MOLDE.length];
                    const activo = moldeSel === pr.prototype_id;
                    return (
                      <button key={pr.prototype_id} data-testid={`molde-${i}`}
                        onClick={() => setMoldeSel(activo ? null : pr.prototype_id)}
                        title={activo ? 'Quitar filtro' : 'Iluminar este molde en la torre'}
                        style={{ ...S.mini, padding: '3px 9px', borderRadius: 9999, cursor: 'pointer',
                          border: `1px solid ${col}${activo ? '' : '66'}`, color: col,
                          background: activo ? `${col}22` : 'transparent', fontWeight: activo ? 800 : 600 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: col, marginRight: 5, verticalAlign: -1 }} />
                        {pr.nombre} · {pr.unidades_total}u
                      </button>
                    );
                  })}
                </div>
              </div>
              <Torre unidades={proy.unidades} posicion={proy.posicion_unidades} seleccionada={unidadSel?.id} onUnidad={setUnidadSel} colorDeMolde={colorDeMolde} moldeSel={moldeSel} />
            </div>
            {unidadSel && (
              <FichaUnidad unitId={unidadSel.id} unidad={unidadSel} onCerrar={() => setUnidadSel(null)}
                onCambio={() => { _get(`/proyecto/${encodeURIComponent(proySel)}`).then(setProy); cargarArbol(); }} />
            )}
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
