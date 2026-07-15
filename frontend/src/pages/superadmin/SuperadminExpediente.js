/**
 * EL EXPEDIENTE DEL DESARROLLO — orden directa del founder (07-14, 4ª iteración de UX):
 * "cada desarrollo debe tener TODOS sus campos en un mismo espacio, no regado por media
 * plataforma. Sencillo, no tabs dentro de tabs."
 *
 * UNA página, UN scroll, CERO tabs: datos (editables aquí mismo) · completitud con faltantes en
 * lenguaje humano · LA TORRE clickeable · prototipos con su plano · multimedia visible · pagos ·
 * amenidades/servicios · avance/legal/comercial · confianza del dev. Todo con su "de dónde sale"
 * y cada FALTA en ámbar diciendo quién puede llenarla.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, ChevronLeft, Check, Globe } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Torre, FichaUnidad, S, fmtM, PALETA_MOLDE } from './SuperadminInventario';

const API = process.env.REACT_APP_BACKEND_URL;
const _j = async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || `HTTP ${r.status}`); return r.json(); };
const _get = (p) => fetch(`${API}/api/superadmin/inventario${p}`, { credentials: 'include' }).then(_j);
const _patch = (p, body) => fetch(`${API}/api/superadmin/inventario${p}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(_j);

const sec = { ...S.card, marginBottom: 14 };
const H = ({ children }) => <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: '0 0 10px' }}>{children}</h2>;
const Falta = ({ children }) => <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.45)', color: '#d29922', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700 }}>⚠ FALTA — {children}</span>;
const Dato = ({ l, v }) => (v || v === 0) ? <div style={{ minWidth: 130 }}><div style={S.mini}>{l}</div><div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>{v}</div></div> : null;

function CampoEditable({ label, value, onSave, ancho = '100%' }) {
  const [v, setV] = useState(value || '');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setV(value || ''); setDirty(false); }, [value]);
  return (
    <label style={{ display: 'block', width: ancho }}>
      <span style={S.mini}>{label}</span>
      <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
        <input style={{ ...S.inp }} value={v} onChange={(e) => { setV(e.target.value); setDirty(true); }} />
        {dirty && <button style={S.btn} onClick={() => { onSave(v); setDirty(false); }}><Check size={13} /></button>}
      </div>
    </label>
  );
}

export default function SuperadminExpediente({ user, onLogout }) {
  const nav = useNavigate();
  const { devId } = useParams();
  const [x, setX] = useState(null);
  const [err, setErr] = useState('');
  const [unidadSel, setUnidadSel] = useState(null);
  const [moldeSel, setMoldeSel] = useState(null);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(() => _get(`/expediente/${encodeURIComponent(devId)}`).then(setX).catch((e) => setErr(String(e.message))), [devId]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (campo, valor) => {
    try { await _patch(`/expediente/${encodeURIComponent(devId)}`, { [campo]: valor }); setMsg('Guardado ✓'); cargar(); }
    catch (e) { setMsg(String(e.message)); }
  };

  if (err) return <SuperadminLayout user={user} onLogout={onLogout}><div style={{ padding: 40, fontFamily: 'DM Sans', color: '#fca5a5' }}>⚠ {err}</div></SuperadminLayout>;
  if (!x) return <SuperadminLayout user={user} onLogout={onLogout}><div style={{ padding: 40, fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.6)' }}>Abriendo el expediente…</div></SuperadminLayout>;

  const d = x.desarrollo;
  const comp = x.completitud;
  const colorDeMolde = (pid) => {
    const i = (x.prototipos || []).findIndex((p) => p.prototype_id === pid);
    return i >= 0 ? PALETA_MOLDE[i % PALETA_MOLDE.length] : null;
  };
  const galeria = (x.multimedia.locales || []).filter((a) => a.url && (a.tipo || '').startsWith('foto'));
  const planosPT = (x.multimedia.locales || []).filter((a) => a.url && a.tipo === 'plano_prototipo');
  const CAT_HUMANO = { plano_unidad: 'Planos por unidad', plano_prototipo: 'Planos por prototipo', plano_roof_unidad: 'Planos de roof', plano_sotano: 'Planos de sótano/cajones', plano: 'Plantas tipo', imagen: 'Fotos (Drive)', lista_precios: 'Listas de precios', brochure: 'Brochure', video: 'Video', documento: 'Otros documentos' };

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ padding: '24px 30px', maxWidth: 1200, margin: '0 auto' }} data-testid="expediente">

        {/* ═══ CABECERA: identidad + completitud + publicar — todo lo importante arriba ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <button onClick={() => nav('/superadmin/inventario')} style={{ ...S.btn, padding: '5px 10px' }}><ChevronLeft size={14} /> Inventario</button>
          <Building2 size={22} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 23, color: 'var(--cream)', margin: 0 }}>{d.name}</h1>
          <span style={S.mini}>{d.colonia_name || d.colonia} · {d.alcaldia || ''} · {(d.stage || '').replace('_', ' ')}</span>
          <span style={{ flex: 1 }} />
          <button disabled={!comp.publishable} title={comp.publishable ? 'Publicar al marketplace' : `Falta ${100 - comp.pct}% para poder publicar`}
            style={{ ...S.btn, opacity: comp.publishable ? 1 : 0.45, background: comp.publishable ? 'rgba(74,222,128,0.15)' : undefined, border: comp.publishable ? '1px solid rgba(74,222,128,0.5)' : undefined, color: comp.publishable ? '#86efac' : undefined }}>
            <Globe size={14} /> {comp.publishable ? 'Publicar al marketplace' : `Publicable al 80% (va ${comp.pct}%)`}
          </button>
        </div>
        {msg && <p style={{ ...S.p, color: msg.includes('✓') ? '#86efac' : '#fca5a5' }}>{msg}</p>}

        {/* completitud: la verdad arriba, en humano */}
        <div style={{ ...sec, background: comp.publishable ? 'rgba(74,222,128,0.05)' : 'rgba(210,153,34,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: comp.publishable ? '#4ADE80' : '#d29922' }}>{comp.pct}%</span>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ ...S.p, fontWeight: 700, color: 'var(--cream)' }}>Ficha completa ({comp.passed}/{comp.total})</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {comp.missing.map((m) => <Falta key={m.label}>{m.label}</Falta>)}
                {!comp.missing.length && <span style={{ ...S.p, color: '#86efac' }}>Nada pendiente — lista para publicar 🎉</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 1 · DATOS DEL DESARROLLO (editables AQUÍ, sin wizard) ═══ */}
        <div style={sec}>
          <H>📋 Datos del desarrollo</H>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            <CampoEditable label="Nombre" value={d.name} onSave={(v) => guardar('name', v)} />
            <CampoEditable label="Dirección" value={d.address_full} onSave={(v) => guardar('address_full', v)} />
            <CampoEditable label="Entrega" value={d.delivery_estimate} onSave={(v) => guardar('delivery_estimate', v)} />
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
            <Dato l="Precio desde" v={fmtM(d.price_from)} />
            <Dato l="Precio hasta" v={fmtM(d.price_to)} />
            <Dato l="Unidades vivas" v={x.n_unidades} />
            <Dato l="Total del desarrollo" v={d.total_units_project || d.units_total} />
            <Dato l="Colonia (inteligencia de zona)" v={d.colonia_id ? '✓ conectada' : null} />
            <Dato l="Bitácora (historia total)" v={x.bitacora?.eventos ? `${x.bitacora.eventos} eventos` : null} />
            <Dato l="Última foto de lista" v={x.bitacora?.ultima_foto ? new Date(x.bitacora.ultima_foto).toLocaleString('es-MX') : null} />
            <Dato l="Fondo mant." v={d.fondo_mantenimiento_mxn ? `$${Number(d.fondo_mantenimiento_mxn).toLocaleString()}` : null} />
            <Dato l="Cuota equip." v={d.cuota_equipamiento_mxn ? `$${Number(d.cuota_equipamiento_mxn).toLocaleString()}` : null} />
          </div>
          <div style={{ marginTop: 10 }}>
            <CampoEditable label="Descripción (la historia que ve el comprador)" value={d.description} onSave={(v) => guardar('description', v)} />
          </div>
        </div>

        {/* ═══ 2 · LA TORRE (todas las unidades, clic = editar) ═══ */}
        <div style={sec}>
          <H>🏢 La torre — {x.n_unidades} unidades <span style={S.mini}>· clic en un molde para ver su patrón · clic en un depa = su ficha completa · anillo <span style={{ color: '#4ADE80' }}>verde</span> = barata vs sus gemelas (ajustado por piso) · <span style={{ color: '#d29922' }}>ámbar</span> = paga premium · sin anillo = en línea (±3%) o molde de 1 unidad</span></H>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {x.prototipos.map((pr, i) => {
              const col = PALETA_MOLDE[i % PALETA_MOLDE.length];
              const activo = moldeSel === pr.prototype_id;
              return (
                <button key={pr.prototype_id} onClick={() => setMoldeSel(activo ? null : pr.prototype_id)}
                  style={{ ...S.mini, padding: '3px 9px', borderRadius: 9999, cursor: 'pointer', border: `1px solid ${col}${activo ? '' : '66'}`, color: col, background: activo ? `${col}22` : 'transparent', fontWeight: activo ? 800 : 600 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: col, marginRight: 5, verticalAlign: -1 }} />
                  {pr.nombre} · {pr.unidades_total}u
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, alignItems: 'start' }}>
            <Torre unidades={x.unidades} posicion={x.posicion_unidades} seleccionada={unidadSel?.id} onUnidad={setUnidadSel} colorDeMolde={colorDeMolde} moldeSel={moldeSel} />
            {unidadSel && <FichaUnidad unitId={unidadSel.id} unidad={unidadSel} onCerrar={() => setUnidadSel(null)} onCambio={cargar} />}
          </div>
        </div>

        {/* ═══ 3 · EL CATÁLOGO DE MOLDES: permanente, con biografía, cotejo y programa ═══ */}
        <div style={sec}>
          <H>📐 El catálogo de moldes <span style={S.mini}>· el molde es permanente: nace, se agota (nunca se borra) y revive · sus planos viven anclados a él</span></H>
          {x.cotejo?.resumen && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ ...S.mini, padding: '4px 10px', borderRadius: 9999, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.4)', color: '#86efac', fontWeight: 700 }}>✓ {x.cotejo.resumen.coincide} datos verificados por 2+ fuentes</span>
              {x.cotejo.resumen.contradice > 0 && <span style={{ ...S.mini, padding: '4px 10px', borderRadius: 9999, background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.45)', color: '#d29922', fontWeight: 700 }}>⚠ {x.cotejo.resumen.contradice} contradicciones entre fuentes (abajo)</span>}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
            {x.prototipos.map((pr) => {
              const met = x.metricas_moldes?.[pr.prototype_id];
              const prog = x.programas?.[pr.prototype_id];
              const checksM = (x.cotejo?.checks || []).filter((c) => c.ref === pr.prototype_id);
              const verifs = checksM.filter((c) => c.veredicto === 'coincide').length;
              const contra = checksM.find((c) => c.veredicto === 'contradice');
              const coloc = met?.colocacion;
              const premMax = (met?.premium_piso || []).slice(-1)[0];
              return (
                <div key={pr.prototype_id} style={{ border: `1px solid ${pr.estado === 'agotado' ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, overflow: 'hidden', opacity: pr.estado === 'agotado' ? 0.75 : 1 }}>
                  {(pr.plano_amueblado_url || pr.floor_plan_url)
                    ? <img src={`${API}${pr.plano_amueblado_url || pr.floor_plan_url}`} alt={pr.nombre} style={{ width: '100%', height: 120, objectFit: 'cover', background: '#fff' }} />
                    : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Falta>plano de este molde</Falta></div>}
                  <div style={{ padding: 10, display: 'grid', gap: 4 }}>
                    <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12.5, color: 'var(--cream)' }}>
                      {pr.nombre}
                      {pr.estado === 'nuevo' && <span style={{ marginLeft: 6, fontSize: 10, color: '#9ecbff' }}>✨ nuevo</span>}
                      {pr.estado === 'agotado' && <span style={{ marginLeft: 6, fontSize: 10, color: '#fca5a5' }}>🔴 AGOTADO {pr.agoto_at ? new Date(pr.agoto_at).toLocaleDateString('es-MX') : ''}</span>}
                      {pr.revivio_at && <span style={{ marginLeft: 6, fontSize: 10, color: '#86efac' }}>↻ revivió</span>}
                    </div>
                    <div style={S.mini}>{pr.unidades_total} unidades{pr.precio_desde_mxn ? ` · desde ${fmtM(pr.precio_desde_mxn)}` : ''}</div>
                    {coloc?.pct != null && <div style={S.mini}>🏁 Colocado: <b style={{ color: 'var(--cream)' }}>{coloc.vendidas}/{coloc.total} ({coloc.pct}%)</b></div>}
                    {premMax?.premium_pct > 0 && <div style={S.mini}>📶 Premium por piso: hasta <b style={{ color: 'var(--cream)' }}>+{premMax.premium_pct}%</b> (piso {premMax.piso})</div>}
                    {prog?.espacios_detalle?.length > 0 && <div style={{ ...S.mini, lineHeight: 1.5 }}>🚪 {prog.espacios_detalle.join(' · ')}</div>}
                    {prog?.flex_visual && <span style={{ ...S.mini, color: '#d29922', fontWeight: 700 }}>⚡ recámara FLEX confirmada (la planta dibuja {prog.camas_dibujadas} camas)</span>}
                    {(met?.curva_precio || []).length > 0 && <div style={S.mini}>💲 curva: {met.curva_precio.slice(-3).map((c) => `${c.fecha.slice(5)} $${Math.round(c.pm2 / 1000)}k/m²`).join(' → ')}{met.curva_precio.length > 1 ? '' : ' (1ª foto)'}</div>}
                    {verifs > 0 && <span style={{ ...S.mini, color: '#86efac' }}>✓ {verifs} dato(s) verificados lista⨯plano</span>}
                    {contra && <span style={{ ...S.mini, color: '#d29922' }}>⚠ {contra.campo}: lista dice {String(contra.fuentes?.lista)} y el plano {String(contra.fuentes?.plano)}{contra.nota ? ` — ${contra.nota}` : ''}</span>}
                    {pr.plano_amueblado_url && pr.floor_plan_url && <div style={S.mini}>planta amueblada + plano arquitectónico ✓</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ 3b · POLÍTICA DE PRECIOS DEL DEV (su huella comercial, de la bitácora) ═══ */}
        <div style={sec}>
          <H>🧭 Política de precios del desarrollador</H>
          {x.playbook?.regla
            ? <span style={S.p}>Con {x.playbook.regla.n_ajustes} ajustes observados: <b style={{ color: 'var(--cream)' }}>{x.playbook.regla.humano}</b></span>
            : <span style={S.p}>⚪ {x.playbook?.nota || 'sin datos aún'} · la bitácora ya guarda cada precio ({x.playbook?.n_eventos || 0} eventos)</span>}
        </div>

        {/* ═══ 4 · MULTIMEDIA: lo que el comprador VERÁ + el archivo completo ═══ */}
        <div style={sec}>
          <H>📸 Multimedia — galería pública ({galeria.length})</H>
          {galeria.length === 0 ? <Falta>fotos/renders — súbelas o cosecha del Drive</Falta> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {galeria.map((a) => (
                <div key={a.id} style={{ position: 'relative' }}>
                  <img src={`${API}${a.url}`} alt={a.caption || a.nombre} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, border: a.cover ? '2px solid #4ADE80' : '1px solid rgba(255,255,255,0.12)' }} />
                  {a.cover && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 9.5, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: '#4ADE80', color: '#000' }}>PORTADA</span>}
                  {a.concepto && <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.65)', color: '#fff' }}>{a.concepto}</span>}
                </div>
              ))}
            </div>
          )}
          {galeria.some((a) => a.concepto) && (
            <div style={{ ...S.mini, marginTop: 8 }}>
              📷 Evidencia visual por concepto: {Object.entries(galeria.reduce((m, a) => { if (a.concepto) m[a.concepto] = (m[a.concepto] || 0) + 1; return m; }, {})).map(([c, n]) => `${c} (${n})`).join(' · ')}
            </div>
          )}
          {planosPT.length > 0 && <div style={{ ...S.mini, marginTop: 8 }}>+ {planosPT.length} plantas oficiales (arriba, en Prototipos)</div>}
          <div style={{ marginTop: 12 }}>
            <div style={{ ...S.mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>El archivo completo (referencias al Drive, con linaje)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(x.multimedia.drive).map(([cat, info]) => (
                <span key={cat} title={(info.muestra || []).join(' · ')}
                  style={{ ...S.mini, padding: '4px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {CAT_HUMANO[cat] || cat}: <b style={{ color: 'var(--cream)' }}>{info.n}</b>{info.con_unidad ? ` (${info.con_unidad} amarrados a unidad)` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ 5 · DINERO: pagos + amenidades/servicios + estado operativo ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          <div style={sec}>
            <H>💳 Formas de pago</H>
            {x.pagos.length === 0 ? <Falta>esquemas de pago — se extraen de la lista o los define el dev</Falta> :
              x.pagos.map((s2, i) => (
                <div key={i} style={{ ...S.p, padding: '6px 0' }}>
                  <b style={{ color: 'var(--cream)' }}>{s2.nombre || `Esquema ${i + 1}`}</b><br />
                  {s2.apartado_mxn ? `Apartado $${Number(s2.apartado_mxn).toLocaleString()} · ` : ''}
                  {s2.firma_pct ? `${s2.firma_pct}% firma · ` : ''}{s2.mensualidades_pct ? `${s2.mensualidades_pct}% mensualidades · ` : ''}{s2.escritura_pct ? `${s2.escritura_pct}% escritura` : ''}
                  {s2.nota && <div style={S.mini}>{s2.nota}</div>}
                </div>
              ))}
          </div>
          <div style={sec}>
            <H>🏊 Amenidades y servicios</H>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(x.amenidades || []).map((a) => <span key={a} style={{ ...S.mini, padding: '3px 9px', borderRadius: 9999, background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#9ecbff' }}>{a}</span>)}
              {!(x.amenidades || []).length && <Falta>amenidades</Falta>}
            </div>
            <div style={{ marginTop: 10 }}>
              {Object.keys(x.servicios || {}).length === 0
                ? <Falta>servicios (gas/agua/luz) — pedir a CLASS</Falta>
                : <span style={S.p}>{Object.keys(x.servicios).join(' · ')}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div style={sec}>
            <H>🏗 Avance de obra</H>
            {x.avance.pct != null ? <span style={{ ...S.p, fontSize: 15 }}><b style={{ color: '#4ADE80' }}>{x.avance.pct}%</b> · {x.avance.etapa || ''}</span> : <Falta>avance — pedir al dev</Falta>}
          </div>
          <div style={sec}>
            <H>⚖️ Legal</H>
            {x.legal.docs > 0 || ['aprobado', 'en_revision'].includes(x.legal.estado || '')
              ? <span style={S.p}>{x.legal.docs} documento(s) · {x.legal.estado || 'sin estatus'}</span>
              : <Falta>documentos legales — pedir a CLASS</Falta>}
          </div>
          <div style={sec}>
            <H>🤝 Política comercial</H>
            {x.comercializacion.configurada
              ? <span style={S.p}>Comisión {x.comercializacion.comision_pct || '—'}% · brokers: {x.comercializacion.brokers ? 'sí' : 'no'}</span>
              : <Falta>comisión y reglas para asesores — pedir a CLASS</Falta>}
          </div>
        </div>

        {/* ═══ 6 · CONFIANZA DEL DESARROLLADOR ═══ */}
        <div style={sec}>
          <H>🛡 El desarrollador</H>
          {d.developer ? (
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <Dato l="Nombre" v={d.developer.name} />
              <Dato l="Años de experiencia" v={d.developer.years_experience} />
              <Dato l="Desarrollos entregados" v={d.developer.projects_delivered} />
              <Dato l="Viviendas comercializadas" v={d.developer.unidades_comercializadas?.toLocaleString?.()} />
            </div>
          ) : <Falta>datos de confianza del dev (años, entregados)</Falta>}
        </div>

      </div>
    </SuperadminLayout>
  );
}
