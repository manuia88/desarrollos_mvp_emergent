/**
 * SuperadminProyectoFicha — FICHA UNIFICADA de UN proyecto (Ver + Editar, control total).
 * El founder pidió: "toda la info de un proyecto en una misma parte, sin cambiar de portal".
 * 6 tabs: Resumen (editable) · Unidades/lista de precios (editable por fila) · Amenidades (editable) ·
 * Zona y scores (granularidad) · Históricos (cambios de precio + ventas con días-para-vender) · Documentos.
 * Lee GET /alta/proyecto/{id}/full · escribe PATCH /alta/proyecto/{id} y /unidad/{unit_id}.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { ArrowLeft, Check, Pencil, MapPin, FileText, TrendingUp, Building2 } from 'lucide-react';
import { proyectoFull, editarProyecto, editarUnidad } from '../../api/superadminAlta';

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '18px 20px' };
const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', marginTop: 4 };
const lbl = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'rgba(240,235,224,0.6)' };
const btn = (on = true) => ({ padding: '9px 15px', borderRadius: 10, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: on ? 'pointer' : 'not-allowed', opacity: on ? 1 : 0.5, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.45)', color: 'var(--theme)' });
const chip = (bg, bd, c) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: c, border: `1px solid ${bd}` });
const th = { textAlign: 'left', padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.5)', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.85)', borderBottom: '1px solid rgba(255,255,255,0.05)' };
const tdInp = { ...inp, marginTop: 0, padding: '5px 8px', fontSize: 12.5, width: 96 };
const mxn = (n) => (Number(n) ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
const fecha = (iso) => (iso ? String(iso).slice(0, 10) : '—');

const ST_COLORS = { disponible: ['rgba(31,160,106,0.14)', 'rgba(31,160,106,0.3)', '#6EE7B7'], reservado: ['rgba(234,179,8,0.14)', 'rgba(234,179,8,0.3)', '#FCD34D'], vendido: ['rgba(242,99,91,0.14)', 'rgba(242,99,91,0.3)', '#FCA5A5'] };
const SOURCE_LABEL = { seed: 'Catálogo DMX', developments: 'Ingesta / publicado', projects: 'Wizard del dev' };
// Nombres humanos para los scores técnicos (regla del founder: cero jerga en la UI) — códigos reales de ie_scores
const SCORE_NAMES = {
  IE_COL_SEGURIDAD: 'Seguridad', IE_COL_AIRE: 'Calidad del aire', IE_COL_PRECIO: 'Nivel de precio de la zona',
  IE_COL_PLUSVALIA_HIST: 'Plusvalía histórica', IE_COL_PLUSVALIA_PROYECTADA: 'Plusvalía proyectada',
  IE_COL_DEMANDA_NETA: 'Demanda de la zona', IE_COL_LIQUIDEZ: 'Facilidad de reventa',
  IE_COL_EDUCACION: 'Escuelas', IE_COL_EDUCACION_CALIDAD: 'Calidad de escuelas', IE_COL_SALUD: 'Hospitales y salud',
  IE_COL_CLIMA_INUNDACION: 'Riesgo de inundación', IE_COL_CLIMA_SISMO: 'Riesgo sísmico',
  IE_COL_CLIMA_ISLA_CALOR: 'Isla de calor', IE_COL_AGUA_CONFIABILIDAD: 'Confiabilidad del agua',
  IE_COL_CONECTIVIDAD_TRANSPORTE: 'Transporte público', IE_COL_CONECTIVIDAD_VIALIDAD: 'Vialidades',
  IE_COL_CONECTIVIDAD_FIBRA: 'Internet de fibra', IE_COL_CULTURAL_PARQUES: 'Parques',
  IE_COL_CULTURAL_MUSEOS: 'Museos y cultura', IE_COL_CULTURAL_VIDA_NOCTURNA: 'Vida nocturna',
  IE_COL_DESARROLLOS_ACTIVOS: 'Obra nueva activa', IE_COL_USO_SUELO_MIXTO: 'Zona mixta (comercio+vivienda)',
  IE_COL_USO_SUELO_HABITACIONAL: 'Zona habitacional', IE_COL_TRUST_VECINDARIO: 'Confianza vecinal',
  IE_COL_N01_ECOSYSTEM_DIVERSITY: 'Variedad de comercios', IE_COL_N02_EMPLOYMENT_ACCESSIBILITY: 'Cercanía a empleos',
  IE_COL_N04_CRIME_TRAJECTORY: 'Tendencia de seguridad', IE_COL_N05_INFRASTRUCTURE_RESILIENCE: 'Infraestructura sólida',
  IE_COL_N06_SCHOOL_PREMIUM: 'Escuelas destacadas', IE_COL_N07_WATER_SECURITY: 'Seguridad hídrica',
  IE_COL_N08_WALKABILITY_MX: 'Caminabilidad', IE_COL_N09_NIGHTLIFE_ECONOMY: 'Economía nocturna',
  IE_COL_N10_SENIOR_LIVABILITY: 'Amigable para mayores', IE_COL_ROI_RENTA_TRADICIONAL: 'Retorno por renta',
  IE_COL_DEMOGRAFIA_INGRESO: 'Nivel de ingreso', IE_COL_DEMOGRAFIA_JOVEN: 'Población joven',
  IE_COL_DEMOGRAFIA_FAMILIA: 'Zona familiar', IE_COL_DEMOGRAFIA_EDUCACION: 'Nivel educativo',
  IE_COL_DEMOGRAFIA_ESTABILIDAD: 'Estabilidad de residentes',
};

function Field({ label, children }) {
  return <label style={{ display: 'block' }}><span style={lbl}>{label}</span>{children}</label>;
}

function StChip({ st }) {
  const [bg, bd, c] = ST_COLORS[st] || ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)', 'rgba(240,235,224,0.6)'];
  return <span style={chip(bg, bd, c)}>{st || '—'}</span>;
}

// ─── Tab: Resumen (características editables) ────────────────────────────────
function TabResumen({ f, onSaved, setMsg }) {
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const start = () => setE({
    name: f.name || '', address: f.ubicacion?.address || '', colonia: f.ubicacion?.colonia || '',
    alcaldia: f.ubicacion?.alcaldia || '', colonia_id: f.ubicacion?.colonia_id || '',
    stage: f.comercial?.stage || 'preventa', delivery_estimate: f.comercial?.delivery_estimate || '',
    maintenance_fee_mxn: f.comercial?.maintenance_fee_mxn || '', price_from: f.comercial?.price_from || '',
    price_to: f.comercial?.price_to || '',
  });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...e };
      ['maintenance_fee_mxn', 'price_from', 'price_to'].forEach((k) => { body[k] = body[k] === '' ? null : Number(body[k]); });
      await editarProyecto(f.id, body);
      setMsg({ tipo: 'ok', txt: 'Proyecto actualizado' }); setE(null); onSaved();
    } catch (er) { setMsg({ tipo: 'err', txt: er.message }); } finally { setBusy(false); }
  };
  const V = ({ l, v }) => <div><div style={lbl}>{l}</div><div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream)', marginTop: 2 }}>{v || '—'}</div></div>;
  if (!e) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Características</span>
          <button style={btn()} onClick={start} data-testid="edit-resumen"><Pencil size={12} style={{ marginRight: 5 }} />Editar</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          <V l="Dirección" v={f.ubicacion?.address} />
          <V l="Colonia" v={f.ubicacion?.colonia} />
          <V l="Alcaldía" v={f.ubicacion?.alcaldia} />
          <V l="Zona conectada (colonia_id)" v={f.ubicacion?.colonia_id} />
          <V l="Etapa" v={f.comercial?.stage} />
          <V l="Entrega" v={f.comercial?.delivery_estimate} />
          <V l="Mantenimiento" v={f.comercial?.maintenance_fee_mxn ? mxn(f.comercial.maintenance_fee_mxn) : null} />
          <V l="Precio desde" v={mxn(f.comercial?.price_from)} />
          <V l="Precio hasta" v={mxn(f.comercial?.price_to)} />
          <V l="Unidades" v={f.comercial?.total_units} />
          <V l="En el mapa" v={f.ubicacion?.has_geo ? `Sí (${f.ubicacion.lat?.toFixed(4)}, ${f.ubicacion.lng?.toFixed(4)})` : 'Sin ubicación aún'} />
        </div>
      </div>
    );
  }
  return (
    <div style={card}>
      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Editar características</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginTop: 14 }}>
        <Field label="Nombre"><input style={inp} value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} /></Field>
        <Field label="Dirección"><input style={inp} value={e.address} onChange={(ev) => setE({ ...e, address: ev.target.value })} /></Field>
        <Field label="Colonia"><input style={inp} value={e.colonia} onChange={(ev) => setE({ ...e, colonia: ev.target.value })} /></Field>
        <Field label="Alcaldía"><input style={inp} value={e.alcaldia} onChange={(ev) => setE({ ...e, alcaldia: ev.target.value })} /></Field>
        <Field label="Zona conectada (colonia_id)"><input style={inp} value={e.colonia_id} onChange={(ev) => setE({ ...e, colonia_id: ev.target.value })} placeholder="ej. juarez-cuauhtemoc" /></Field>
        <Field label="Etapa">
          <select style={inp} value={e.stage} onChange={(ev) => setE({ ...e, stage: ev.target.value })}>
            <option value="preventa">Preventa</option><option value="construccion">Construcción</option><option value="entrega">Entrega</option>
          </select>
        </Field>
        <Field label="Entrega (ej. 2027-06)"><input style={inp} value={e.delivery_estimate} onChange={(ev) => setE({ ...e, delivery_estimate: ev.target.value })} /></Field>
        <Field label="Mantenimiento $/mes"><input style={inp} type="number" value={e.maintenance_fee_mxn} onChange={(ev) => setE({ ...e, maintenance_fee_mxn: ev.target.value })} /></Field>
        <Field label="Precio desde"><input style={inp} type="number" value={e.price_from} onChange={(ev) => setE({ ...e, price_from: ev.target.value })} /></Field>
        <Field label="Precio hasta"><input style={inp} type="number" value={e.price_to} onChange={(ev) => setE({ ...e, price_to: ev.target.value })} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={btn(!busy)} disabled={busy} onClick={save} data-testid="save-resumen"><Check size={12} style={{ marginRight: 5 }} />{busy ? 'Guardando…' : 'Guardar'}</button>
        <button style={{ ...btn(), background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.8)' }} onClick={() => setE(null)}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── Tab: Unidades — tabla con GRUPOS de columnas (spec founder img-3): UNIDAD · M² DESGLOSADOS ·
// CARACTERÍSTICAS · ADICIONALES · FORMA DE PAGO · PRECIO. Editable por fila. ────────────────────
const GRP = {
  unidad: 'rgba(255,255,255,0.045)',
  m2: 'rgba(96,165,250,0.10)',        // azul
  caract: 'rgba(192,132,252,0.10)',   // morado
  extra: 'rgba(232,121,249,0.08)',    // violeta
  pago: 'rgba(251,191,36,0.09)',      // ámbar
  precio: 'rgba(52,211,153,0.10)',    // verde
};
const grpTh = (bg) => ({ ...th, background: bg, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.14)' });
const colTh = (bg) => ({ ...th, background: bg });
const num = (v, dec = 0) => (v == null || v === '' ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: dec }));
const pctTxt = (v) => (v == null ? '' : ` (${v}%)`);

function M2Total({ u }) {
  // "127 m² · 115+12bal" — el total con su fórmula de desglose (spec founder)
  const parts = [];
  if (u.m2_privative) parts.push(num(u.m2_privative, 2));
  if (u.m2_balcony) parts.push(`${num(u.m2_balcony, 2)}bal`);
  if (u.m2_terrace) parts.push(`${num(u.m2_terrace, 2)}ter`);
  if (u.m2_roof_garden) parts.push(`${num(u.m2_roof_garden, 2)}rg`);
  return (
    <div>
      <div style={{ fontWeight: 700 }}>{u.m2_total != null ? `${num(u.m2_total, 2)} m²` : '—'}</div>
      {parts.length > 1 && <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.45)' }}>{parts.join('+')}</div>}
    </div>
  );
}

function TabUnidades({ f, onSaved, setMsg }) {
  const [edit, setEdit] = useState(null);   // {unitId, price, status, bedrooms, bathrooms, m2_total}
  const [busy, setBusy] = useState(false);
  const r = f.unidades_resumen || {};
  const save = async () => {
    setBusy(true);
    try {
      const fields = {};
      ['price', 'bedrooms', 'bathrooms', 'm2_total'].forEach((k) => { if (edit[k] !== '' && edit[k] != null) fields[k] = Number(edit[k]); });
      if (edit.status) fields.status = edit.status;
      await editarUnidad(f.id, edit.unitId, fields);
      setMsg({ tipo: 'ok', txt: `Depto ${edit.unit_number} actualizado — el cambio queda en el histórico` });
      setEdit(null); onSaved();
    } catch (er) { setMsg({ tipo: 'err', txt: er.message }); } finally { setBusy(false); }
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Lista de precios · {r.total || 0} deptos</span>
        <span style={chip('rgba(31,160,106,0.14)', 'rgba(31,160,106,0.3)', '#6EE7B7')}>{r.disponible || 0} disponibles</span>
        <span style={chip('rgba(234,179,8,0.14)', 'rgba(234,179,8,0.3)', '#FCD34D')}>{r.apartado || 0} apartados</span>
        <span style={chip('rgba(242,99,91,0.14)', 'rgba(242,99,91,0.3)', '#FCA5A5')}>{r.vendido || 0} vendidos</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
          <thead>
            <tr>
              <th colSpan={3} style={grpTh(GRP.unidad)}>Unidad</th>
              <th colSpan={5} style={grpTh(GRP.m2)}>M² desglosados</th>
              <th colSpan={3} style={grpTh(GRP.caract)}>Características</th>
              <th colSpan={3} style={grpTh(GRP.extra)}>Adicionales</th>
              <th colSpan={3} style={grpTh(GRP.pago)}>Forma de pago</th>
              <th colSpan={3} style={grpTh(GRP.precio)}>Precio</th>
            </tr>
            <tr>
              <th style={colTh(GRP.unidad)}>Depto</th><th style={colTh(GRP.unidad)}>Proto.</th><th style={colTh(GRP.unidad)}>Nivel</th>
              <th style={colTh(GRP.m2)}>M² priv.</th><th style={colTh(GRP.m2)}>Balcón</th><th style={colTh(GRP.m2)}>Terraza</th><th style={colTh(GRP.m2)}>RG priv.</th><th style={colTh(GRP.m2)}>M² totales</th>
              <th style={colTh(GRP.caract)}>Rec.</th><th style={colTh(GRP.caract)}>Baños</th><th style={colTh(GRP.caract)}>Cajones</th>
              <th style={colTh(GRP.extra)}>Tipo cajón</th><th style={colTh(GRP.extra)}>Bodega</th><th style={colTh(GRP.extra)}>Vista</th>
              <th style={colTh(GRP.pago)}>Enganche</th><th style={colTh(GRP.pago)}>Crédito</th><th style={colTh(GRP.pago)}>Reservación</th>
              <th style={colTh(GRP.precio)}>Precio</th><th style={colTh(GRP.precio)}>Estado</th><th style={colTh(GRP.precio)} />
            </tr>
          </thead>
          <tbody>
            {(f.unidades || []).map((u) => {
              const isEd = edit && edit.unitId === u.id;
              return (
                <tr key={u.id || u.unit_number}>
                  <td style={{ ...td, fontWeight: 700 }}>{u.unit_number}</td>
                  <td style={td}>{u.prototype && u.prototype !== 'depto' ? <span style={chip('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)', 'rgba(240,235,224,0.8)')}>{String(u.prototype).slice(0, 10)}</span> : '—'}</td>
                  <td style={td}>{u.level ?? '—'}</td>
                  <td style={td}>{u.m2_privative != null ? num(u.m2_privative, 2) : '—'}</td>
                  <td style={td}>{u.m2_balcony != null ? num(u.m2_balcony, 2) : '—'}</td>
                  <td style={td}>{u.m2_terrace != null ? num(u.m2_terrace, 2) : '—'}</td>
                  <td style={td}>{u.m2_roof_garden != null ? num(u.m2_roof_garden, 2) : '—'}</td>
                  <td style={td}>{isEd ? <input style={{ ...tdInp, width: 72 }} type="number" value={edit.m2_total} onChange={(e) => setEdit({ ...edit, m2_total: e.target.value })} /> : <M2Total u={u} />}</td>
                  <td style={td}>{isEd ? <input style={{ ...tdInp, width: 48 }} type="number" value={edit.bedrooms} onChange={(e) => setEdit({ ...edit, bedrooms: e.target.value })} /> : (u.bedrooms ?? '—')}</td>
                  <td style={td}>{isEd ? <input style={{ ...tdInp, width: 48 }} type="number" value={edit.bathrooms} onChange={(e) => setEdit({ ...edit, bathrooms: e.target.value })} /> : (u.bathrooms ?? '—')}</td>
                  <td style={td}>{u.parking_spots ?? '—'}</td>
                  <td style={td}>{u.parking_type ? (u.parking_type === 'tandem' ? 'Tándem' : 'Individual') : '—'}</td>
                  <td style={td}>{u.bodega ? (u.storage_count ? `${u.storage_count}` : 'Sí') : '—'}</td>
                  <td style={td}>{u.vista || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{u.enganche_mxn ? <>{mxn(u.enganche_mxn)}<span style={{ color: '#FCD34D', fontSize: 10.5 }}>{pctTxt(u.enganche_pct)}</span></> : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{u.credito_mxn ? <>{mxn(u.credito_mxn)}<span style={{ color: '#FCD34D', fontSize: 10.5 }}>{pctTxt(u.credito_pct)}</span></> : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{u.reservacion_mxn ? mxn(u.reservacion_mxn) : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>{isEd ? <input style={{ ...tdInp, width: 105 }} type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /> : mxn(u.price)}</td>
                  <td style={td}>{isEd ? (
                    <select style={{ ...tdInp, width: 108 }} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                      <option value="disponible">disponible</option><option value="reservado">reservado</option><option value="vendido">vendido</option>
                    </select>) : <StChip st={u.status} />}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {isEd ? (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button style={{ ...btn(!busy), padding: '5px 10px', fontSize: 11.5 }} disabled={busy} onClick={save} data-testid={`save-unit-${u.unit_number}`}>{busy ? '…' : 'Guardar'}</button>
                        <button style={{ ...btn(), padding: '5px 10px', fontSize: 11.5, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.8)' }} onClick={() => setEdit(null)}>✕</button>
                      </span>
                    ) : (
                      u.id ? <button style={{ ...btn(), padding: '5px 10px', fontSize: 11.5 }} data-testid={`edit-unit-${u.unit_number}`}
                        onClick={() => setEdit({ unitId: u.id, unit_number: u.unit_number, price: u.price ?? '', status: u.status || 'disponible', bedrooms: u.bedrooms ?? '', bathrooms: u.bathrooms ?? '', m2_total: u.m2_total ?? '' })}>
                        <Pencil size={11} /></button> : null
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!(f.unidades || []).length && <div style={{ padding: 20, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Este proyecto aún no tiene lista de precios cargada.</div>}
      </div>
    </div>
  );
}

// ─── Multimedia / Avance de obra / Planos por prototipo (reglas founder 07-08) ──────────────────
// Multimedia = SOLO renders · foto de obra → Avance de obra (con fecha de extracción) · depto muestra NO se
// muestra. La clasificación (image_kind) la hace la IA al ingerir; imágenes viejas sin clasificar se marcan.
const assetSrc = (f, d) => `${process.env.REACT_APP_BACKEND_URL}/api/superadmin/alta/proyecto/${encodeURIComponent(f.id)}/archivo/${encodeURIComponent(d.drive_file_id)}`;

function ImgGrid({ f, items, emptyMsg, dateLabel }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginTop: 14 }}>
        {items.map((d, i) => (
          <a key={i} href={assetSrc(f, d)} target="_blank" rel="noreferrer" title={d.filename}
            style={{ display: 'block', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', aspectRatio: '4/3', background: 'rgba(255,255,255,0.03)', position: 'relative' }}>
            <img src={assetSrc(f, d)} alt={d.filename || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 8px', fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.85)', background: 'rgba(0,0,0,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {dateLabel && d.captured_at ? `${fecha(d.captured_at)} · ` : ''}{d.filename}
            </span>
          </a>
        ))}
      </div>
      {!items.length && <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)', marginTop: 14 }}>{emptyMsg}</div>}
    </>
  );
}

function TabMultimedia({ f }) {
  const imgs = (f.documentos || []).filter((d) => (d.mime || '').startsWith('image/') && d.drive_file_id);
  const renders = imgs.filter((d) => d.image_kind === 'render');
  const sinClasificar = imgs.filter((d) => !d.image_kind);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Renders · {renders.length}</span>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>
          Solo renders del proyecto. Las fotos de obra viven en "Avance de obra"; las de depto muestra no se muestran.
        </div>
        <ImgGrid f={f} items={renders} emptyMsg="Aún sin renders clasificados. Llegan solos con la ingesta (la IA los separa de las fotos reales)." />
      </div>
      {!!sinClasificar.length && (
        <div style={card}>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 14, color: 'rgba(240,235,224,0.7)' }}>Sin clasificar aún · {sinClasificar.length}</span>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.5)', marginTop: 4 }}>Imágenes de ingestas anteriores — se clasifican en la próxima corrida.</div>
          <ImgGrid f={f} items={sinClasificar.slice(0, 12)} emptyMsg="" />
        </div>
      )}
    </div>
  );
}

function TabObra({ f }) {
  const obra = (f.documentos || []).filter((d) => (d.mime || '').startsWith('image/') && d.drive_file_id && d.image_kind === 'obra');
  return (
    <div style={card}>
      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Avance de obra · {obra.length}</span>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.55)', marginTop: 4 }}>
        Fotos REALES de construcción con la fecha en que se extrajeron del Drive — la línea de tiempo del avance.
      </div>
      <ImgGrid f={f} items={obra} dateLabel emptyMsg="Aún sin fotos de obra clasificadas. Cuando el Drive traiga fotos de construcción, aparecen aquí con su fecha." />
    </div>
  );
}

// ─── Tab: Planos por prototipo (founder: depa 102 → plano del 'Tipo 02') ────────────────────────
const _normProtoJs = (s) => String(s || '').toLowerCase().replace(/\b(tipo|prototipo|modelo|planta)\b/g, '').replace(/[^a-z0-9]/g, '');
const _normUnitJs = (s) => {
  let t = String(s || '').replace(/\b(dep|depto|departamento|unidad|u)\b/gi, ' ').replace(/[^A-Za-z0-9 ]/g, '');
  const m = t.replace(/ /g, '').match(/\d+[A-Za-z]*/g);
  return (m ? m[m.length - 1] : t).toUpperCase();
};

function TabPlanos({ f }) {
  const unidades = f.unidades || [];
  const planosPdf = (f.documentos || []).filter((d) => (d.mime || '') === 'application/pdf' && d.drive_file_id
    && /plano|planta|prototipo|tipo |dep[-_ ]?\d|unidad/i.test(d.filename || ''));
  // agrupa unidades por prototipo (el derivado por terminación o el explícito)
  const grupos = {};
  unidades.forEach((u) => {
    const p = u.prototype && u.prototype !== 'depto' ? String(u.prototype) : null;
    const key = p || '(sin prototipo)';
    (grupos[key] = grupos[key] || []).push(u);
  });
  // liga planos a cada grupo: por prototipo en el nombre O por número de alguna unidad del grupo
  const planosDe = (key, us) => {
    const np = _normProtoJs(key);
    const unos = new Set(us.map((u) => _normUnitJs(u.unit_number)));
    return planosPdf.filter((d) => {
      const n = d.filename || '';
      if (np && _normProtoJs(n).includes(np) && /plano|planta|prototipo|tipo/i.test(n)) return true;
      const mm = n.replace(/[^A-Za-z0-9 ]/g, '').replace(/ /g, '').match(/\d+[A-Za-z]*/g);
      return !!(mm && mm.some((tok) => unos.has(tok.toUpperCase())));
    });
  };
  const keys = Object.keys(grupos).sort();
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {keys.map((k) => {
        const us = grupos[k];
        const u0 = us[0] || {};
        const pls = planosDe(k, us);
        return (
          <div key={k} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>
                {k === '(sin prototipo)' ? 'Sin prototipo asignado' : `Prototipo ${k}`}
              </span>
              <span style={chip('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)', 'rgba(240,235,224,0.7)')}>{us.length} deptos</span>
              {u0.bedrooms != null && <span style={chip('rgba(192,132,252,0.12)', 'rgba(192,132,252,0.3)', '#E9D5FF')}>{u0.bedrooms} rec · {u0.bathrooms ?? '?'} baños</span>}
              {u0.m2_total != null && <span style={chip('rgba(96,165,250,0.12)', 'rgba(96,165,250,0.3)', '#BFDBFE')}>{num(u0.m2_total, 2)} m²</span>}
              {u0.m2_balcony != null && <span style={chip('rgba(96,165,250,0.10)', 'rgba(96,165,250,0.25)', '#BFDBFE')}>balcón {num(u0.m2_balcony, 2)}</span>}
              {u0.m2_roof_garden != null && <span style={chip('rgba(96,165,250,0.10)', 'rgba(96,165,250,0.25)', '#BFDBFE')}>roof {num(u0.m2_roof_garden, 2)}</span>}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', marginTop: 6 }}>
              Deptos: {us.map((u) => u.unit_number).join(' · ')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {pls.map((d, i) => (
                <a key={i} href={assetSrc(f, d)} target="_blank" rel="noreferrer"
                  style={{ ...chip('rgba(var(--theme-rgb),0.12)', 'rgba(var(--theme-rgb),0.4)', 'var(--theme)'), textDecoration: 'none', padding: '6px 12px' }}>
                  <FileText size={12} /> {String(d.filename || '').slice(0, 46)}
                </a>
              ))}
              {!pls.length && <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.45)' }}>Sin plano ligado — si el Drive trae el plano de este prototipo, se liga solo.</span>}
            </div>
          </div>
        );
      })}
      {!keys.length && <div style={{ ...card, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Sin unidades aún.</div>}
    </div>
  );
}

// ─── Tab: Amenidades (editable) ──────────────────────────────────────────────
function TabAmenidades({ f, onSaved, setMsg }) {
  const [items, setItems] = useState(null);
  const [nueva, setNueva] = useState('');
  const [busy, setBusy] = useState(false);
  const list = items ?? (f.amenidades || []);
  const dirty = items != null;
  const save = async () => {
    setBusy(true);
    try { await editarProyecto(f.id, { amenities: list }); setMsg({ tipo: 'ok', txt: 'Amenidades guardadas' }); setItems(null); onSaved(); }
    catch (er) { setMsg({ tipo: 'err', txt: er.message }); } finally { setBusy(false); }
  };
  return (
    <div style={card}>
      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Amenidades · {list.length}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0' }}>
        {list.map((a) => (
          <span key={a} style={{ ...chip('rgba(255,255,255,0.05)', 'rgba(255,255,255,0.14)', 'rgba(240,235,224,0.85)'), fontSize: 12, padding: '5px 11px' }}>
            {a}
            <button onClick={() => setItems(list.filter((x) => x !== a))} style={{ background: 'none', border: 'none', color: 'rgba(240,235,224,0.5)', cursor: 'pointer', fontSize: 13, padding: 0, marginLeft: 3 }} title="Quitar">✕</button>
          </span>
        ))}
        {!list.length && <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Sin amenidades registradas.</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
        <input style={{ ...inp, marginTop: 0 }} placeholder="Agregar amenidad (ej. Gimnasio)" value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && nueva.trim()) { setItems([...list, nueva.trim()]); setNueva(''); } }} />
        <button style={btn(!!nueva.trim())} disabled={!nueva.trim()} onClick={() => { setItems([...list, nueva.trim()]); setNueva(''); }}>Agregar</button>
        {dirty && <button style={btn(!busy)} disabled={busy} onClick={save} data-testid="save-amenidades"><Check size={12} style={{ marginRight: 4 }} />{busy ? '…' : 'Guardar'}</button>}
      </div>
    </div>
  );
}

// ─── Tab: Zona y scores (granularidad conectada) ─────────────────────────────
function TabScores({ f }) {
  const zs = f.zona_score;
  const scores = f.scores || [];
  const tierC = { green: '#6EE7B7', yellow: '#FCD34D', red: '#FCA5A5' };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Inteligencia de la zona</span>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.6)', marginTop: 4 }}>
          {f.ubicacion?.colonia_id
            ? <>Conectado a la zona <b style={{ color: 'var(--cream)' }}>{f.ubicacion.colonia_id}</b> — estos indicadores alimentan la ficha pública, el mapa y los análisis.</>
            : 'Este proyecto aún no está conectado a una zona (asigna colonia_id en Resumen para prender la inteligencia de zona).'}
        </div>
        {zs && (
          <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 34, color: 'var(--theme)' }}>{Math.round(zs.overall || 0)}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(zs.subscores || {}).map(([k, v]) => (
                <span key={k} style={chip('rgba(255,255,255,0.05)', 'rgba(255,255,255,0.14)', 'rgba(240,235,224,0.85)')}>{k}: {Math.round(v)}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      {!!scores.length && (
        <div style={card}>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Indicadores de la zona · {scores.length}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginTop: 12 }}>
            {scores.map((s) => (
              <div key={s.code} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 13px' }}>
                <div style={{ ...lbl, marginBottom: 3 }}>{SCORE_NAMES[s.code] || s.code.replace(/^IE_(ZONE|PROY)_/, '').replace(/_/g, ' ').toLowerCase()}</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: tierC[s.tier] || 'var(--cream)' }}>{typeof s.value === 'number' ? Math.round(s.value) : s.value ?? '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Históricos (la data que crece con el tiempo) ───────────────────────
function TabHistoricos({ f }) {
  const precios = f.historicos?.precios || [];
  const estatus = f.historicos?.estatus || [];
  const FUENTES = { reingesta: 'Lista nueva (ingesta)', superadmin_edit: 'Edición superadmin', inventory_edit: 'Edición del dev' };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Cambios de precio · {precios.length}</span>
        {precios.length ? (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Depto</th><th style={th}>Antes</th><th style={th}>Ahora</th><th style={th}>Cambio</th><th style={th}>Fecha</th><th style={th}>Origen</th></tr></thead>
              <tbody>{precios.map((e, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 700 }}>{e.unit_number || '—'}</td>
                  <td style={td}>{mxn(e.old_price)}</td><td style={td}>{mxn(e.new_price)}</td>
                  <td style={{ ...td, color: (e.delta_pct || 0) >= 0 ? '#6EE7B7' : '#FCA5A5', fontWeight: 700 }}>{e.delta_pct != null ? `${e.delta_pct > 0 ? '+' : ''}${e.delta_pct}%` : '—'}</td>
                  <td style={td}>{fecha(e.changed_at)}</td><td style={td}>{FUENTES[e.source] || e.label || e.source || '—'}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)', marginTop: 10 }}>Aún sin cambios de precio. Cada vez que subas una lista nueva del dev (o edites un precio aquí), el cambio queda registrado y esta tabla crece sola.</div>}
      </div>
      <div style={card}>
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Ventas y apartados · {estatus.length}</span>
        {estatus.length ? (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Depto</th><th style={th}>Cambio</th><th style={th}>Precio</th><th style={th}>Días en venderse</th><th style={th}>Fecha</th><th style={th}>Origen</th></tr></thead>
              <tbody>{estatus.map((e, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 700 }}>{e.unit_number || '—'}</td>
                  <td style={td}><StChip st={e.old_status} /> → <StChip st={e.new_status} /></td>
                  <td style={td}>{mxn(e.price)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{e.days_to_sell != null ? `${e.days_to_sell} días` : '—'}</td>
                  <td style={td}>{fecha(e.changed_at)}</td><td style={td}>{FUENTES[e.source] || e.source || '—'}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)', marginTop: 10 }}>Aún sin ventas registradas. Cuando una lista nueva marque un depto como vendido/apartado, aquí verás cuál, cuándo y cuántos días tardó en venderse — el ritmo real del proyecto.</div>}
      </div>
    </div>
  );
}

// ─── Tab: Documentos ─────────────────────────────────────────────────────────
function TabDocumentos({ f }) {
  const docs = f.documentos || [];
  return (
    <div style={card}>
      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--cream)' }}>Documentos del proyecto · {docs.length}</span>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {docs.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 13px' }}>
            <FileText size={15} style={{ color: 'rgba(240,235,224,0.5)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.85)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename || d.drive_file_id}</span>
            {d.drive_file_id && (
              <a href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} target="_blank" rel="noreferrer"
                style={{ ...chip('rgba(var(--theme-rgb),0.14)', 'rgba(var(--theme-rgb),0.4)', 'var(--theme)'), textDecoration: 'none' }}>Ver en Drive</a>
            )}
          </div>
        ))}
        {!docs.length && <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Sin documentos ligados. Los archivos llegan solos con la ingesta desde Drive.</span>}
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
const TABS = [
  ['resumen', 'Resumen', Building2], ['unidades', 'Unidades', TrendingUp], ['planos', 'Planos', FileText],
  ['multimedia', 'Multimedia', FileText], ['obra', 'Avance de obra', Building2],
  ['amenidades', 'Amenidades', Check], ['scores', 'Zona y scores', MapPin], ['historicos', 'Históricos', TrendingUp],
  ['documentos', 'Documentos', FileText],
];

export default function SuperadminProyectoFicha() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('resumen');
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => { proyectoFull(projectId).then(setF).catch((e) => setErr(e.message)); }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 4200); return () => clearTimeout(t); } }, [msg]);

  if (err) return <SuperadminLayout title="Proyecto"><div style={{ ...card, color: '#FCA5A5', fontFamily: 'DM Sans' }}>{err}</div></SuperadminLayout>;
  if (!f) return <SuperadminLayout title="Proyecto"><div style={{ ...card, fontFamily: 'DM Sans', color: 'rgba(240,235,224,0.6)' }}>Cargando…</div></SuperadminLayout>;

  const mp = f.comercial?.marketplace_published;
  return (
    <SuperadminLayout title={f.name || 'Proyecto'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.6)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans', fontSize: 12.5 }}><ArrowLeft size={15} />Volver</button>
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--cream)' }}>{f.name}</span>
        <span style={chip('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.14)', 'rgba(240,235,224,0.7)')}>{SOURCE_LABEL[f.source] || f.source}</span>
        {mp === true && <span style={chip('rgba(31,160,106,0.14)', 'rgba(31,160,106,0.3)', '#6EE7B7')}>Publicado</span>}
        {mp === 'pending' && <span style={chip('rgba(234,179,8,0.14)', 'rgba(234,179,8,0.3)', '#FCD34D')}>Pendiente de aprobar</span>}
      </div>
      {msg && <div style={{ ...card, padding: '10px 16px', marginBottom: 12, borderColor: msg.tipo === 'ok' ? 'rgba(31,160,106,0.4)' : 'rgba(242,99,91,0.4)', color: msg.tipo === 'ok' ? '#6EE7B7' : '#FCA5A5', fontFamily: 'DM Sans', fontSize: 13 }} data-testid="ficha-msg">{msg.txt}</div>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`} style={{
            padding: '8px 15px', borderRadius: 10, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
            background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === k ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.1)'}`,
            color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.7)',
          }}>{label}</button>
        ))}
      </div>
      {tab === 'resumen' && <TabResumen f={f} onSaved={load} setMsg={setMsg} />}
      {tab === 'unidades' && <TabUnidades f={f} onSaved={load} setMsg={setMsg} />}
      {tab === 'planos' && <TabPlanos f={f} />}
      {tab === 'multimedia' && <TabMultimedia f={f} />}
      {tab === 'obra' && <TabObra f={f} />}
      {tab === 'amenidades' && <TabAmenidades f={f} onSaved={load} setMsg={setMsg} />}
      {tab === 'scores' && <TabScores f={f} />}
      {tab === 'historicos' && <TabHistoricos f={f} />}
      {tab === 'documentos' && <TabDocumentos f={f} />}
    </SuperadminLayout>
  );
}
