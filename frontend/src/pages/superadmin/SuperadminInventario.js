/**
 * SuperadminInventario — FASE 3 del rebuild UX (la queja del founder: "miles de clicks").
 * UNA página, TRES niveles, CERO wizard:
 *   Nivel 1 · Desarrolladores (cards con conteos y su carpeta vigilada)
 *   Nivel 2 · Expediente del dev (sus proyectos con mini-torre por estado)
 *   Nivel 3 · El proyecto = LA TORRE clickeable: clic en unidad → editar estado/precio ahí mismo.
 * La bandeja del vigía vive arriba. Deep-link: ?dev= & ?proyecto=. Editar dispara audit+bitácora.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
export const fmtM = (n) => (n === null || n === undefined) ? '—' : `$${(Number(n) / 1e6).toFixed(2)}M`;

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

export function Torre({ unidades, onUnidad, seleccionada, colorDeMolde, moldeSel }) {
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
                  return (
                    <button key={u.id} data-testid={`unidad-${u.unit_number || u.id}`} onClick={() => onUnidad(u)}
                      title={`${u.unit_number || u.id} · ${u.status || 'disponible'} · ${fmtM(u.price_mxn || u.price)}${u.size_m2 ? ` · ${u.size_m2}m²` : ''}`}
                      style={{ minWidth: 52, padding: '7px 6px 5px', borderRadius: 6, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 10.5,
                        background: `${col}${sel ? 'ee' : '33'}`, border: `${sel ? 2 : 1}px solid ${col}`, color: sel ? '#000' : 'var(--cream)',
                        opacity: apagada ? 0.18 : 1, transition: 'opacity .15s',
                        borderBottom: molde ? `3px solid ${molde}` : undefined }}>
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
export function PanelUnidad({ u, onCerrar, onGuardado }) {
  const [status, setStatus] = useState((u.status || 'disponible').toLowerCase());
  const [precio, setPrecio] = useState(u.price_mxn || u.price || '');
  const [msg, setMsg] = useState('');
  const guardar = async () => {
    try {
      const body = {};
      if (status !== (u.status || 'disponible').toLowerCase()) body.status = status;
      const pNum = Number(precio);
      if (precio !== '' && pNum !== (u.price_mxn || u.price)) body.price_mxn = pNum;
      if (!Object.keys(body).length) { setMsg('Sin cambios.'); return; }
      await _patch(`/unidad/${u.id}`, body);
      setMsg('Guardado ✓ (queda en la bitácora)'); onGuardado();
    } catch (e) { setMsg(String(e.message)); }
  };
  return (
    <div style={{ ...S.card, border: '1px solid rgba(var(--theme-rgb),0.5)', position: 'sticky', top: 12 }} data-testid="panel-unidad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <b style={{ ...S.h, fontSize: 16 }}>Depto {u.unit_number || u.id}</b>
        <button onClick={onCerrar} style={{ ...S.btn, padding: '4px 8px' }}><X size={13} /></button>
      </div>
      <div style={{ ...S.mini, marginBottom: 10 }}>
        {u.bedrooms != null ? `${u.bedrooms} rec · ` : ''}{u.bathrooms ? `${u.bathrooms} baños · ` : ''}
        {u.size_m2 ? `${u.size_m2} m² · ` : ''}{u.level != null ? `piso ${u.level} · ` : ''}{u.prototype_id ? `molde ${u.prototype_id.split('__')[1]}` : ''}
      </div>
      <label style={{ ...S.mini, display: 'block', marginBottom: 8 }}>Estado
        <select data-testid="unidad-status" style={{ ...S.inp, marginTop: 3 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </label>
      <label style={{ ...S.mini, display: 'block', marginBottom: 10 }}>Precio (MXN)
        <input data-testid="unidad-precio" style={{ ...S.inp, marginTop: 3 }} type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <button style={S.btn} data-testid="unidad-guardar" onClick={guardar}>Guardar</button>
      {msg && <p style={{ ...S.p, marginTop: 8, color: msg.includes('✓') ? '#86efac' : '#fca5a5' }}>{msg}</p>}
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
                <MiniTorre porEstado={p.por_estado} total={p.unidades} />
              </button>
            ))}
          </div>
        )}

        {/* NIVEL 3 · la torre clickeable + panel de edición */}
        {proy && (
          <div style={{ display: 'grid', gridTemplateColumns: unidadSel ? '1fr 290px' : '1fr', gap: 14, alignItems: 'start' }}>
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
              <Torre unidades={proy.unidades} seleccionada={unidadSel?.id} onUnidad={setUnidadSel} colorDeMolde={colorDeMolde} moldeSel={moldeSel} />
            </div>
            {unidadSel && (
              <PanelUnidad u={unidadSel} onCerrar={() => setUnidadSel(null)}
                onGuardado={() => { _get(`/proyecto/${encodeURIComponent(proySel)}`).then(setProy); cargarArbol(); }} />
            )}
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
