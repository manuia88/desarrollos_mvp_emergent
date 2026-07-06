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
import { SlidersHorizontal, Plus, X, AlertCircle, Box, Sparkles, Users, Bookmark, Bell } from 'lucide-react';
import {
  getConsultaCampos, runConsulta, parsePregunta, runEspejo, listVistas, saveVista, deleteVista,
} from '../../api/superadminMetricsCube';

const OP_LABEL = {
  eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', in: 'en', between: 'entre', exists: 'tiene dato',
};
const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const money = (v) => (v == null ? '—' : `$${nf.format(v)}`);
const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// PRESETS de mundos DISTINTOS — demuestran que el espacio es universal (físico + financiero +
// zona + edificio + etapa). Cada uno es solo un punto de partida editable; el default es TODO el mercado.
const PRESETS = [
  { nombre: 'Asequibilidad', filtros: [
    { campo: 'alcaldia', op: 'eq', valor: 'benito-juarez' },
    { campo: 'has_balcon', op: 'eq', valor: true },
    { campo: 'm2', op: 'lt', valor: 65 },
    { campo: 'enganche_min_pct', op: 'lte', valor: 10 },
    { campo: 'mens_80_20', op: 'lt', valor: 30000 },
  ], agrupar: ['colonia'] },
  { nombre: 'Vida a pie y segura', filtros: [
    { campo: 'walkability', op: 'gt', valor: 90 },
    { campo: 'escuelas_zona', op: 'gt', valor: 70 },
    { campo: 'recamaras', op: 'gte', valor: 2 },
  ], agrupar: ['colonia'] },
  { nombre: 'Inversión temprana', filtros: [
    { campo: 'etapa', op: 'eq', valor: 'preventa' },
    { campo: 'gentrificacion_zona', op: 'gt', valor: 45 },
    { campo: 'precio_m2', op: 'lt', valor: 75000 },
  ], agrupar: ['colonia', 'etapa'] },
  { nombre: 'Edificio con vida', filtros: [
    { campo: 'amenidades_edificio', op: 'eq', valor: 'alberca' },
    { campo: 'vida_nocturna_zona', op: 'gt', valor: 60 },
  ], agrupar: ['development_id'] },
];

// Presets del MODO ZONA (universo = las 2,400+ colonias)
const PRESETS_ZONA = [
  { nombre: 'Para familias', filtros: [
    { campo: 'escuelas_zona', op: 'gt', valor: 70 },
    { campo: 'walkability', op: 'gt', valor: 60 },
    { campo: 'gentrificacion_zona', op: 'lt', valor: 45 },
  ], agrupar: ['alcaldia'] },
  { nombre: 'Seguras y con vida', filtros: [
    { campo: 'riesgo_zona', op: 'gt', valor: 60 },
    { campo: 'vida_nocturna_zona', op: 'gt', valor: 60 },
  ], agrupar: ['alcaldia'] },
  { nombre: 'Gentrificación temprana', filtros: [
    { campo: 'gentrificacion_zona', op: 'between', valor: [40, 60] },
    { campo: 'walkability', op: 'gt', valor: 70 },
  ], agrupar: ['alcaldia'] },
];

export default function CubeExploradorView({ onDrillUnit }) {
  const [universo, setUniverso] = useState('unidades');   // 'unidades' (oferta) | 'zonas' (2,400+ colonias)
  const [campos, setCampos] = useState([]);
  const [filtros, setFiltros] = useState([]);           // default: TODO el mercado (universal, no un ejemplo)
  const [agrupar, setAgrupar] = useState(['colonia']);
  const [nuevo, setNuevo] = useState({ campo: 'precio', op: 'lt', valor: '' });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // F3 · Atlax compilador + espejo de demanda + vistas guardadas
  const [pregunta, setPregunta] = useState('');
  const [interp, setInterp] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [espejo, setEspejo] = useState(null);
  const [vistas, setVistas] = useState([]);
  const [nombreVista, setNombreVista] = useState('');
  const [alertaOn, setAlertaOn] = useState(true);

  useEffect(() => {
    getConsultaCampos().then((d) => setCampos(d.campos || [])).catch(() => setCampos([]));
  }, []);

  const correr = async (fs = filtros, gs = agrupar, uni = universo) => {
    setBusy(true); setErr(null); setEspejo(null);
    let data = null;
    try { data = await runConsulta(fs, gs, uni); setRes(data); }
    catch (e) { setErr(e?.message || 'No se pudo consultar.'); }
    finally { setBusy(false); }
    // el espejo (lado demanda del MISMO corte) carga aparte — nunca bloquea el corte.
    // Con n del corte el back calcula la tensión (personas por unidad = el número del moat).
    runEspejo(fs, uni, data?.ok ? data.n : null).then(setEspejo).catch(() => setEspejo(null));
  };

  // Pregunta en español → corte (Atlax compilador; LLM con fallback heurístico en el back)
  const preguntar = async () => {
    const t = pregunta.trim();
    if (!t || parsing) return;
    setParsing(true); setInterp(null);
    try {
      const r = await parsePregunta(t);
      if (r.ok) {
        const uni = r.universo || 'unidades';
        const gs = (r.agrupar_por || []).length ? r.agrupar_por : (uni === 'zonas' ? ['alcaldia'] : ['colonia']);
        setUniverso(uni); setFiltros(r.filtros || []); setAgrupar(gs); setInterp(r);
        correr(r.filtros || [], gs, uni);
      } else {
        setInterp({ interpretacion: (r.errores || []).join(' · ') || 'No entendí la pregunta.', fuente: 'error' });
      }
    } catch (e) { setInterp({ interpretacion: e?.message || 'No se pudo interpretar.', fuente: 'error' }); }
    finally { setParsing(false); }
  };

  // Vistas guardadas (tipo 'explorador' — REUSA saved_views de demand-intel)
  const cargarVistas = () => {
    listVistas().then((d) => setVistas((d.vistas || []).filter((v) => v.tipo === 'explorador'))).catch(() => {});
  };
  useEffect(cargarVistas, []);
  const aplicarVista = (v) => {
    const d = v.definicion || {};
    const uni = d.universo || 'unidades';
    const fs = d.filtros || [];
    const gs = (d.agrupar_por || []).length ? d.agrupar_por : ['colonia'];
    setUniverso(uni); setFiltros(fs); setAgrupar(gs); correr(fs, gs, uni);
  };
  const guardarVista = async () => {
    const nombre = nombreVista.trim();
    if (!nombre) return;
    try {
      await saveVista(nombre, { filtros, agrupar_por: agrupar, universo },
        alertaOn ? { tipo: 'corte', activa: true, umbral_pct: 10 } : null);
      setNombreVista(''); cargarVistas();
    } catch (e) { setErr(e?.message || 'No se pudo guardar la vista.'); }
  };
  const borrarVista = async (id) => {
    try { await deleteVista(id); cargarVistas(); } catch { /* la lista se recarga igual */ }
  };
  // al cambiar de universo: en zonas solo campos de zona; limpia filtros que no apliquen
  const cambiarUniverso = (uni) => {
    setUniverso(uni);
    const okZona = new Set(campos.filter((c) => c.zona).map((c) => c.key));
    const fs = uni === 'zonas' ? filtros.filter((f) => okZona.has(f.campo)) : filtros;
    const gs = uni === 'zonas' ? (agrupar.filter((g) => okZona.has(g) || g === 'colonia' || g === 'alcaldia').length ? agrupar : ['alcaldia']) : agrupar;
    setFiltros(fs); setAgrupar(gs); correr(fs, gs, uni);
  };
  useEffect(() => { correr(); /* al montar, con el ejemplo */ // eslint-disable-next-line
  }, []);

  const tipoDe = (key) => (campos.find((c) => c.key === key) || {}).tipo || 'num';
  const labelDe = (key) => (campos.find((c) => c.key === key) || {}).label || key;
  const camposVisibles = useMemo(() => (universo === 'zonas' ? campos.filter((c) => c.zona) : campos), [campos, universo]);
  const agrupables = useMemo(() => camposVisibles.filter((c) => c.agrupable), [camposVisibles]);

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

      {/* F3 · Pregúntale al cubo en español — Atlax compila la pregunta a un corte */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, padding: '10px 12px', borderRadius: 13, background: 'rgba(var(--theme-rgb),0.05)', border: '1px solid rgba(var(--theme-rgb),0.18)' }}>
        <Sparkles size={14} color="var(--theme)" style={{ flexShrink: 0 }} />
        <input value={pregunta} onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && preguntar()} data-testid="exp-pregunta"
          placeholder="Pregúntale al cubo en español… ej: depas con balcón bajo $30 mil de mensualidad en Benito Juárez, por colonia"
          style={{ ...inputS, flex: 1, background: 'transparent', border: 'none' }} />
        <button onClick={preguntar} disabled={parsing} data-testid="exp-preguntar"
          style={{ ...pill, background: 'rgba(var(--theme-rgb),0.16)', border: '1px solid rgba(var(--theme-rgb),0.45)', color: 'var(--theme)', opacity: parsing ? 0.6 : 1 }}>
          {parsing ? 'Interpretando…' : 'Preguntar'}
        </button>
      </div>
      {interp && (
        <div data-testid="exp-interpretacion" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10, fontFamily: 'DM Sans', fontSize: 11.5, color: interp.fuente === 'error' ? '#fecaca' : 'rgba(240,235,224,0.75)' }}>
          <span>{interp.interpretacion}</span>
          {interp.fuente !== 'error' && (
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.55)' }}>
              {interp.fuente === 'llm' ? 'IA' : 'sin IA (reglas)'}{interp.cached ? ' · cache' : ''}
            </span>
          )}
          {(interp.descartados || []).length > 0 && (
            <span style={{ color: '#FCD34D' }}>No pude filtrar: {interp.descartados.join(' · ')}</span>
          )}
        </div>
      )}

      {/* Toggle de UNIVERSO: oferta (unidades con inventario) vs el Modelo del Mundo (2,400+ colonias) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        {[['unidades', 'Unidades (oferta)'], ['zonas', 'Zonas (2,400+ colonias)']].map(([u, l]) => (
          <button key={u} data-testid={`exp-universo-${u}`} onClick={() => cambiarUniverso(u)}
            style={{ padding: '6px 16px', borderRadius: 11, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
              background: universo === u ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${universo === u ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
              color: universo === u ? 'var(--theme)' : 'rgba(240,235,224,0.6)' }}>{l}</button>
        ))}
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.45)' }}>
          {universo === 'unidades' ? 'Cortes de producto/precio/financiero — donde hay inventario cargado.' : 'El Modelo del Mundo: toda colonia por sus índices, tenga o no unidades.'}
        </span>
      </div>

      {/* Presets: mundos distintos como punto de partida (editables) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Empieza por:</span>
        {(universo === 'zonas' ? PRESETS_ZONA : PRESETS).map((p) => (
          <button key={p.nombre} data-testid={`exp-preset-${p.nombre.replace(/\s+/g, '-').toLowerCase()}`}
            onClick={() => { setFiltros(p.filtros); setAgrupar(p.agrupar); correr(p.filtros, p.agrupar); }}
            style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '4px 12px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,235,224,0.75)' }}>
            {p.nombre}
          </button>
        ))}
        <button onClick={() => { setFiltros([]); setAgrupar(['colonia']); correr([], ['colonia']); }}
          style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '4px 12px', cursor: 'pointer', background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(240,235,224,0.5)' }}>
          Limpiar todo
        </button>
      </div>

      {/* F3 · Mis cortes guardados: vuelve a cualquier corte con un clic; la campana = te avisa si cambia */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mis cortes:</span>
        {vistas.map((v) => (
          <span key={v.id} data-testid={`exp-vista-${v.id}`} style={{ ...pill, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.8)' }}>
            <span onClick={() => aplicarVista(v)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Bookmark size={10} /> {v.nombre}
              {v.alerta?.tipo === 'corte' && v.alerta?.activa && <Bell size={10} color="var(--theme)" title="Te avisa si el corte cambia" />}
              {v.disparada && <span style={{ width: 6, height: 6, borderRadius: 9999, background: '#FCD34D' }} title="Este corte cambió en la última revisión" />}
            </span>
            <X size={10} style={{ cursor: 'pointer' }} onClick={() => borrarVista(v.id)} />
          </span>
        ))}
        <input value={nombreVista} onChange={(e) => setNombreVista(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && guardarVista()} data-testid="exp-vista-nombre"
          placeholder="nombre del corte…" style={{ ...inputS, width: 150, padding: '4px 10px', fontSize: 11 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.6)', cursor: 'pointer' }}>
          <input type="checkbox" checked={alertaOn} onChange={(e) => setAlertaOn(e.target.checked)} style={{ accentColor: 'var(--theme)' }} />
          avisarme si cambia
        </label>
        <button onClick={guardarVista} data-testid="exp-vista-guardar"
          style={{ ...pill, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.8)' }}>
          Guardar corte
        </button>
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
          {camposVisibles.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
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
              {(universo === 'zonas'
                ? [['Colonias del corte', nf.format(k.colonias ?? 0)],
                   ['Calidad prom.', k.zone_score_prom != null ? Math.round(k.zone_score_prom) : '—'],
                   ['Caminabilidad prom.', k.walkability_prom != null ? Math.round(k.walkability_prom) : '—'],
                   ['Seguridad prom.', k.seguridad_prom != null ? Math.round(k.seguridad_prom) : '—'],
                   ['Escuelas prom.', k.escuelas_prom != null ? Math.round(k.escuelas_prom) : '—'],
                   ['Gentrif. prom.', k.gentrificacion_prom != null ? Math.round(k.gentrificacion_prom) : '—']]
                : [['Unidades del corte', nf.format(k.unidades ?? 0)],
                   ['Absorción', k.absorcion_pct != null ? `${k.absorcion_pct}%` : '—'],
                   ['Disponibles', nf.format(k.disponibles ?? 0)],
                   ['Precio prom.', money(k.precio_prom)],
                   ['$/m² prom.', money(k.precio_m2_prom)],
                   ['Mensualidad prom. (80/20)', money(k.mens_80_20_prom)]]).map(([l, v]) => (
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

          {/* F3 · Espejo de demanda: el MISMO corte del lado comprador (el moat) */}
          {espejo && (
            <div data-testid="exp-espejo" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '11px 14px', borderRadius: 13, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.2)', marginBottom: 12 }}>
              <Users size={14} color="#93C5FD" style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.85)' }}>
                <b style={{ color: '#BFDBFE' }}>Espejo de demanda:</b>{' '}
                {espejo.espejo_total_mercado
                  ? <>ningún filtro de este corte tiene cara de demanda — las {espejo.busquedas} búsquedas ({espejo.desde_dias}d) son TODO el mercado, no este corte.</>
                  : espejo.busquedas > 0
                    ? <>{espejo.personas} persona{espejo.personas === 1 ? '' : 's'} ({espejo.busquedas} búsqueda{espejo.busquedas === 1 ? '' : 's'}, últimos {espejo.desde_dias} días) buscaron con su pedido declarado dentro de este corte.</>
                    : <>sin búsquedas con pedido dentro del corte en {espejo.desde_dias} días — honesto: nadie lo ha pedido todavía.</>}
              </span>
              {espejo.tension_por_unidad != null && (
                <span data-testid="exp-tension" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, padding: '3px 12px', borderRadius: 9999, background: espejo.tension_por_unidad >= 1 ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${espejo.tension_por_unidad >= 1 ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.12)'}`, color: espejo.tension_por_unidad >= 1 ? '#6EE7B7' : 'rgba(240,235,224,0.7)' }}>
                  Tensión: {espejo.tension_por_unidad > 0 && espejo.tension_por_unidad < 0.01 ? '<0.01' : espejo.tension_por_unidad} personas/unidad
                </span>
              )}
              {espejo.momentum_pct != null && !espejo.espejo_total_mercado && (
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: espejo.momentum_pct > 0 ? '#6EE7B7' : '#FCA5A5' }}>
                  demanda {espejo.momentum_pct > 0 ? '↑' : '↓'} {Math.abs(espejo.momentum_pct)}% (90d vs 90d previos)
                </span>
              )}
              {!espejo.espejo_total_mercado && espejo.espejo_parcial && (
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' }}>
                  Espejo parcial: {(espejo.no_espejables || []).join(', ')} no tienen cara de demanda.
                </span>
              )}
              {espejo.busquedas_sin_identidad > 0 && (
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' }}>
                  +{espejo.busquedas_sin_identidad} búsquedas sin identidad (no cuentan como personas).
                </span>
              )}
            </div>
          )}

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

          {/* Modo ZONA: las colonias del corte con sus índices */}
          {universo === 'zonas' && (res.colonias || []).length > 0 && (
            <>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
                Las colonias del corte {res.colonias_truncadas > 0 ? `(primeras ${res.colonias.length} de ${res.n})` : `(${res.n})`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8, marginBottom: 12 }}>
                {res.colonias.map((c) => (
                  <div key={c.colonia} data-testid={`exp-colonia-${c.colonia}`} style={{ padding: '10px 12px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, color: 'var(--cream)' }}>{tc(c.colonia)}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', marginTop: 3, lineHeight: 1.5 }}>
                      {c.tc} {[c.zone_score != null && `calidad ${Math.round(c.zone_score)}`, c.walkability != null && `caminable ${Math.round(c.walkability)}`, c.gentrificacion != null && `gentrif ${Math.round(c.gentrificacion)}`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Modo UNIDADES: las unidades exactas (drill al Átomo) */}
          {universo === 'unidades' && (res.unidades || []).length > 0 && (
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
              {universo === 'zonas' ? 'Ninguna colonia' : 'Ninguna unidad'} cumple TODO el corte — honesto, no lo inventamos. Quita o relaja un filtro.
            </div>
          )}
        </>
      )}
    </div>
  );
}
