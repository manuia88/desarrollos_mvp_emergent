// I04 — Superadmin · Terminal de Índices DMX (producto licenciable).
// Los 5 índices compuestos (IPV/IAB/IDS/IRE/ICO) + maestro IDM por colonia, ordenados por IDM.
// Bloomberg-style: malla de zonas con semáforo por índice. Mismo motor que dev/comprador.
import React, { useEffect, useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import { listIndices, ingestColonias, computeColoniasScores, syncComercios, syncSeguridad, fillChunk, syncCatastro, syncZonificacion, dedupeColonias, recalibrarComercial, getCalibracionComercial, getShf, refreshShf, ingestValoresUnitarios } from '../../api/indices';

const BAND = { verde: '#86efac', ambar: '#fcd34d', rojo: '#fca5a5' };
const cellCol = (i) => BAND[i.color] || 'var(--cream-2)';
const mmx = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);

export default function SuperadminIndices() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('');
  const [ingest, setIngest] = useState({ busy: false, msg: '' });
  const [calib, setCalib] = useState(null);
  const [shf, setShf] = useState(null);

  const refrescar = () => listIndices({ tier: tier || undefined, limit: 200 }).then(setData).catch(() => {});
  const refrescarCalib = () => getCalibracionComercial('CDMX').then(setCalib).catch(() => {});
  const refrescarShf = () => getShf().then(setShf).catch(() => {});

  const cargarCatalogo = async () => {
    setIngest({ busy: true, msg: '' });
    try {
      const r = await ingestColonias('CDMX');
      setIngest({ busy: false, msg: r.ok ? `Se cargaron ${r.cargadas} colonias.` : (r.reason || 'No se pudo cargar.') });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al cargar el catálogo.' });
    }
  };

  const computarScores = async () => {
    setIngest({ busy: true, msg: '' });
    try {
      const r = await computeColoniasScores('CDMX');
      setIngest({ busy: false, msg: r.ok ? `${r.con_scores_reales} colonias con scores reales · ${r.pendientes} pendientes (falta ingestar el dato de la zona).` : 'No se pudo computar.' });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al computar scores.' });
    }
  };

  const sincronizarComercios = async () => {
    setIngest({ busy: true, msg: 'Sincronizando comercios (OpenStreetMap)… puede tardar un minuto.' });
    try {
      const r = await syncComercios('CDMX', 'osm');
      const base = `${r.sincronizadas} colonias sincronizadas · ${r.con_datos} con comercios reales · ${r.scores?.con_scores_reales ?? 0} con scores reales.`;
      setIngest({ busy: false, msg: r.nota ? `${base} ${r.nota}` : base });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al sincronizar comercios.' });
    }
  };

  const llenarTodo = async () => {
    setIngest({ busy: true, msg: 'Llenando un lote (comercios + seguridad)… puede tardar un minuto. El resto se llena solo cada 12 min.' });
    try {
      const r = await fillChunk('CDMX', 40);
      const hechas = (r.total_colonias || 0) - (r.faltan_sin_tocar || 0);
      setIngest({ busy: false, msg: `Lote listo: ${r.procesadas} colonias (${r.con_comercio} con comercios · ${r.con_seguridad} con seguridad). Avance: ${hechas} de ${r.total_colonias} tocadas · ${r.con_scores_reales} con scores reales. El cron sigue solo.` });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al llenar el lote.' });
    }
  };

  const sincronizarSeguridad = async () => {
    setIngest({ busy: true, msg: 'Sincronizando seguridad (FGJ)… puede tardar un minuto.' });
    try {
      const r = await syncSeguridad('CDMX');
      const base = r.ok
        ? `${r.con_seguridad_real} colonias con seguridad real · ${r.scores?.con_scores_reales ?? 0} con scores reales.`
        : 'No se pudo sincronizar.';
      setIngest({ busy: false, msg: r.nota ? `${base} ${r.nota}` : base });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al sincronizar seguridad.' });
    }
  };

  const sincronizarCatastro = async () => {
    setIngest({ busy: true, msg: 'Sincronizando valor catastral del suelo (SIG CDMX)… puede tardar un minuto.' });
    try {
      const r = await syncCatastro('CDMX');
      const base = `${r.sincronizadas} colonias consultadas · ${r.con_dato} con valor catastral oficial del suelo.`;
      setIngest({ busy: false, msg: r.nota ? `${base} ${r.nota}` : base });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al sincronizar el valor catastral.' });
    }
  };

  // F1.0 · Calcula uso de suelo + COS + CUS por colonia (cuánto se puede construir).
  const sincronizarZonificacion = async () => {
    setIngest({ busy: true, msg: 'Calculando uso de suelo, COS y CUS por colonia (SIG CDMX)… puede tardar varios minutos.' });
    try {
      const r = await syncZonificacion('CDMX');
      const base = `${r.colonias_con_zonificacion} colonias con zonificación · ${r.con_cos_cus} con COS y CUS oficiales.`;
      setIngest({ busy: false, msg: base });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al sincronizar la zonificación.' });
    }
  };

  // F1.0 · Unifica el padrón (fusiona la misma colonia que venía duplicada de dos catálogos).
  const unificarPadron = async () => {
    setIngest({ busy: true, msg: 'Unificando el padrón de colonias (fusionando duplicados)…' });
    try {
      const r = await dedupeColonias('CDMX');
      const cob = r.cobertura || {};
      setIngest({ busy: false, msg: `Listo: ${r.colonias_eliminadas} duplicados fusionados · ${cob.total_colonias} colonias únicas · ${cob.total_con_zonificacion} con COS/CUS.` });
      refrescar();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al unificar el padrón.' });
    }
  };

  const refrescarPlusvalia = async () => {
    setIngest({ busy: true, msg: 'Refrescando la plusvalía oficial (SHF · XLSX trimestral)…' });
    try {
      const r = await refreshShf();
      const base = r.ok
        ? `Plusvalía actualizada · ${r.alcaldias_actualizadas ?? 0} alcaldías · ${r.serie?.cargadas ?? 0} trimestres en la serie.`
        : (r.reason || 'No se pudo refrescar.');
      setIngest({ busy: false, msg: base });
      refrescarShf();
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al refrescar la plusvalía.' });
    }
  };

  const cargarValoresUnitarios = async () => {
    setIngest({ busy: true, msg: 'Buscando la tabla oficial de Valores Unitarios 2026…' });
    try {
      const r = await ingestValoresUnitarios('CDMX');
      setIngest({ busy: false, msg: r.ok ? `Cargadas ${r.cargadas} colonias con valor unitario oficial.` : (r.reason || 'No se pudo cargar.') });
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al cargar los valores unitarios.' });
    }
  };

  const recalibrarValorComercial = async () => {
    setIngest({ busy: true, msg: 'Aprendiendo la relación entre el valor del suelo y el precio comercial con las ventas reales…' });
    try {
      const r = await recalibrarComercial('CDMX');
      setCalib(r);
      setIngest({ busy: false, msg: r.leyenda || `Modelo recalibrado con ${r.n} zonas.` });
    } catch (e) {
      setIngest({ busy: false, msg: 'Error al recalibrar el valor comercial.' });
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listIndices({ tier: tier || undefined, limit: 200 })
      .then(r => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(false); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tier]);

  useEffect(() => { refrescarCalib(); refrescarShf(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => (data && data.items) || [], [data]);
  const leyenda = (data && data.leyenda) || [];
  const kpis = (data && data.kpis) || {};
  const cobertura = (data && data.cobertura) || null;
  const tiers = useMemo(() => [...new Set(items.map(r => r.tier).filter(Boolean))], [items]);

  const exportCSV = () => {
    const cols = ['IPV', 'IAB', 'IDS', 'IRE', 'ICO'];
    const headers = ['zona', 'tier', 'price_m2', 'IDM', ...cols];
    const rows = items.map(r => {
      const by = Object.fromEntries((r.indices || []).map(i => [i.key, i.valor]));
      return [r.zona, r.tier, r.price_m2, r.idm.valor, ...cols.map(c => by[c] ?? '')].join(',');
    });
    const blob = new Blob([headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `indices_dmx_${items.length}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="I04 · ÍNDICES DMX"
        title="Índices DMX"
        sub="Los 5 índices compuestos por colonia (IPV plusvalía · IAB absorción · IDS demanda · IRE renta · ICO calidad) + el maestro IDM. Producto licenciable."
        actions={<button data-testid="ix-export-csv" onClick={exportCSV} style={btnSecondary}>Exportar CSV</button>}
      />

      {/* KPIs de la malla */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          ['IDM promedio', kpis.avg_idm ?? '—', <Gauge key="g" size={15} />],
          ['Zona más fuerte', kpis.zona_top || '—', null],
          ['IDM más alto', kpis.idm_top ?? '—', null],
          ['Zonas grado A', kpis.grado_A ?? '—', null],
        ].map(([lbl, val, icon], i) => (
          <Card key={i} style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{icon}{lbl}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginTop: 4 }}>{val}</div>
          </Card>
        ))}
      </div>

      {/* Cobertura de colonias por ciudad (EX · crece al cargar el catálogo oficial / otras ciudades) */}
      {cobertura && (
        <Card data-testid="ix-cobertura" style={{ marginBottom: 18, padding: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Cobertura</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>
              {cobertura.total_colonias} colonias · {cobertura.total_ciudades} ciudad{cobertura.total_ciudades === 1 ? '' : 'es'}
            </span>
            {cobertura.total_con_scores_reales != null && (
              <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
                <b style={{ color: 'var(--ok, #1FA06A)' }}>{cobertura.total_con_scores_reales}</b> con scores reales · <b style={{ color: 'var(--warm, #E2982E)' }}>{cobertura.total_pendientes}</b> pendientes
              </span>
            )}
            {cobertura.total_con_valor_suelo != null && (
              <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>
                · <b style={{ color: 'var(--cream)' }}>{cobertura.total_con_valor_suelo}</b> con valor de suelo · <b style={{ color: 'var(--cream)' }}>{cobertura.total_con_zonificacion}</b> con COS/CUS
              </span>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {(cobertura.ciudades || []).map(c => (
                <span key={c.city} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', padding: '4px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  {c.city} <b style={{ color: 'var(--cream)' }}>{c.colonias}</b>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            <button data-testid="ix-cargar-catalogo" onClick={cargarCatalogo} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              {ingest.busy ? 'Trabajando…' : 'Cargar Catálogo CDMX'}
            </button>
            <button data-testid="ix-sync-comercios" onClick={sincronizarComercios} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Sincronizar Comercios
            </button>
            <button data-testid="ix-sync-seguridad" onClick={sincronizarSeguridad} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Sincronizar Seguridad
            </button>
            <button data-testid="ix-sync-catastro" onClick={sincronizarCatastro} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Sincronizar Valor del Suelo
            </button>
            <button data-testid="ix-sync-zonificacion" onClick={sincronizarZonificacion} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Sincronizar Zonificación (COS/CUS)
            </button>
            <button data-testid="ix-dedupe" onClick={unificarPadron} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Unificar Padrón (Dedupe)
            </button>
            <button data-testid="ix-recalibrar-comercial" onClick={recalibrarValorComercial} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Recalibrar Valor Comercial
            </button>
            <button data-testid="ix-refrescar-shf" onClick={refrescarPlusvalia} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Refrescar Plusvalía (SHF)
            </button>
            <button data-testid="ix-valores-unitarios" onClick={cargarValoresUnitarios} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Cargar Valores Unitarios 2026
            </button>
            <button data-testid="ix-llenar-todo" onClick={llenarTodo} disabled={ingest.busy} style={{ ...btnSecondary, borderColor: 'rgba(var(--theme-rgb),0.5)', opacity: ingest.busy ? 0.6 : 1 }}>
              Llenar Todo (Auto)
            </button>
            <button data-testid="ix-computar-scores" onClick={computarScores} disabled={ingest.busy} style={{ ...btnSecondary, opacity: ingest.busy ? 0.6 : 1 }}>
              Computar Scores Reales
            </button>
            {ingest.msg && <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{ingest.msg}</span>}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 8 }}>
            Crece al cargar el catálogo oficial CDMX (~1,800) y nuevas ciudades. Las señales se comparan por ciudad. Los scores reales de cada colonia llegan al correr las recetas (siguiente paso).
          </div>

          {/* Modelo del valor del suelo al precio comercial (ING.2 · aprende de las ventas reales) */}
          {calib && (
            <div data-testid="ix-calib-comercial" style={{ marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(var(--cream-rgb),0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)' }}>Del Valor del Suelo al Precio Comercial</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 9999,
                  background: calib.estima ? 'rgba(31,160,106,0.12)' : 'rgba(252,165,165,0.10)',
                  border: `1px solid ${calib.estima ? 'rgba(31,160,106,0.30)' : 'rgba(252,165,165,0.30)'}`,
                  color: calib.estima ? 'var(--ok,#1FA06A)' : '#fca5a5', textTransform: 'capitalize' }}>
                  Confianza: {calib.confianza}
                </span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                  {calib.n} {calib.n === 1 ? 'zona' : 'zonas'} con valor del suelo y ventas reales
                  {calib.r2 != null && ` · ajuste ${Math.round(calib.r2 * 100)}%`}
                </span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', marginTop: 7, lineHeight: 1.45 }}>{calib.leyenda}</div>
              {calib.estima && (calib.muestras || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                  {(calib.muestras || []).slice(0, 8).map((m, i) => (
                    <span key={i} title={`${m.fuente}`} style={{ fontFamily: 'DM Sans', fontSize: 10.5, padding: '3px 9px', borderRadius: 9999, border: '1px solid var(--border)', color: 'var(--cream-2)' }}>
                      {m.colonia}: suelo {mmx(m.catastral)} → comercial {mmx(m.comercial)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Plusvalía oficial SHF por alcaldía (ING.3 · 5 propias + promedio CDMX) */}
          {shf && (shf.alcaldias || []).length > 0 && (
            <div data-testid="ix-shf" style={{ marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(var(--cream-rgb),0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)' }}>Plusvalía Oficial por Alcaldía (SHF)</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                  {shf.snapshot?.periodo} · {shf.serie_filas} trimestres de historia
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                {shf.alcaldias.map((a, i) => (
                  <span key={i} title={`Índice ${a.indice}`} style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: 'rgba(31,160,106,0.10)', border: '1px solid rgba(31,160,106,0.28)', color: 'var(--ok,#1FA06A)' }}>
                    {a.alcaldia}: +{a.plusvalia_anual_pct}%
                  </span>
                ))}
                {shf.cdmx_estatal && (
                  <span title={`Índice ${shf.cdmx_estatal.indice}`} style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, border: '1px solid var(--border)', color: 'var(--cream-2)' }}>
                    {shf.cdmx_estatal.alcaldia}: +{shf.cdmx_estatal.plusvalia_anual_pct}% (heredan las otras 11)
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 8 }}>
                Solo 5 alcaldías tienen índice SHF propio (volumen hipotecario suficiente); las demás usan el promedio CDMX. El +5.1% del boletín es la zona metropolitana (incluye Edomex), no la ciudad.
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Leyenda + filtro tier */}
      <Card style={{ marginBottom: 18, padding: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          {leyenda.map(l => (
            <span key={l.key} title={l.que_mide} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
              <b style={{ color: 'var(--cream)' }}>{l.key}</b> {l.nombre}
            </span>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>Tier:</span>
            {['', ...tiers].map(t => (
              <button key={t || 'all'} onClick={() => setTier(t)}
                style={{ padding: '5px 12px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer',
                  background: tier === t ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tier === t ? 'rgba(var(--theme-rgb),0.42)' : 'rgba(255,255,255,0.10)'}`, color: 'var(--cream)' }}>
                {t || 'todas'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : !data ? (
        <Empty title="No se pudo cargar" sub="Revisa el backend de índices." />
      ) : items.length === 0 ? (
        <Empty title="Sin zonas" sub="No hay colonias para ese tier." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="ix-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Zona</Th><Th>Tier</Th><Th>$/m²</Th>
                  <Th center>IDM</Th><Th center>IPV</Th><Th center>IAB</Th><Th center>IDS</Th><Th center>IRE</Th><Th center>ICO</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, idx) => {
                  const by = Object.fromEntries((r.indices || []).map(i => [i.key, i]));
                  return (
                    <tr key={r.zona + idx} data-testid={`ix-row-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <Td><span style={{ color: 'var(--cream)', fontWeight: 600 }}>{r.zona}</span></Td>
                      <Td>{r.tier}</Td>
                      <Td>${(r.price_m2 / 1000).toFixed(0)}k</Td>
                      <Td center>
                        <span style={{ fontWeight: 800, color: BAND[r.idm.color] || 'var(--cream)' }}>{r.idm.valor}<span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>{r.idm.letra}</span></span>
                        {r.idm.etiqueta && <div style={{ fontSize: 9.5, color: 'var(--cream-3)', marginTop: 2 }}>{r.idm.etiqueta}</div>}
                      </Td>
                      {['IPV', 'IAB', 'IDS', 'IRE', 'ICO'].map(k => (
                        <Td key={k} center>
                          <span title={by[k] && by[k].fuente === 'estimado' ? 'estimado' : ''} style={{ fontWeight: 700, color: by[k] ? cellCol(by[k]) : 'var(--cream-3)' }}>
                            {by[k] ? by[k].valor : '—'}
                          </span>
                        </Td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </SuperadminLayout>
  );
}

const btnSecondary = {
  padding: '8px 16px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.16)', color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
function Th({ children, center }) {
  return (<th style={{ textAlign: center ? 'center' : 'left', padding: '10px 8px', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</th>);
}
function Td({ children, center }) {
  return (<td style={{ padding: '9px 8px', fontSize: 13, color: 'var(--cream-2)', textAlign: center ? 'center' : 'left' }}>{children}</td>);
}
