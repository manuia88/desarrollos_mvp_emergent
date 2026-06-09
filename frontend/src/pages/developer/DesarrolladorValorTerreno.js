/**
 * DesarrolladorValorTerreno — F1.2 · Motor de Valor Residual del Terreno.
 * Una sola pantalla: el dev elige colonia + m² + categoría → "Tu oferta máxima por este lote".
 * Método residual (estándar mundial). Cada número trae su origen (Doctrina de Datos).
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmtMXN, fmt0 } from '../../components/advisor/primitives';
import { MapPin, AlertTriangle, ChevronDown, Search, Sparkle } from '../../components/icons';
import { DataOrigin, DoctrineButton } from '../../components/shared/DataOrigin';
import * as api from '../../api/valorResidual';

const SEMAFORO = {
  verde:    { tone: 'ok',    bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.40)',  label: 'Margen sano' },
  amarillo: { tone: 'neutral', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.45)', label: 'Margen ajustado' },
  rojo:     { tone: 'bad',     bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.45)',  label: 'No cierra' },
};

const lbl = { fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, display: 'block' };
const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.6)', color: '#e2e8f0', fontSize: 14, outline: 'none',
};

export default function DesarrolladorValorTerreno() {
  const [categorias, setCategorias] = useState([]);
  const [terreno, setTerreno] = useState(1000);
  const [categoria, setCategoria] = useState('residencial');
  const [colonia, setColonia] = useState(null);     // {id,name,alcaldia,cus,precio_pm2,vsuelo_pm2_catastral}
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState([]);
  const [openList, setOpenList] = useState(false);
  const [adv, setAdv] = useState(false);
  const [margen, setMargen] = useState('');         // %
  const [precioManual, setPrecioManual] = useState('');
  const [costoManual, setCostoManual] = useState('');
  const [comision, setComision] = useState('');     // % · default 2 (CDMX)
  const [honorarios, setHonorarios] = useState(''); // % · default 16 (fee+gerencia), editable
  const [res, setRes] = useState(null);
  const [dd, setDd] = useState(null);
  const [n3, setN3] = useState(null);
  const [veredicto, setVeredicto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showBreak, setShowBreak] = useState(false);
  const [err, setErr] = useState('');
  const debounce = useRef(null);

  useEffect(() => {
    api.getCategorias().then(d => setCategorias(d.categorias || [])).catch(() => {});
  }, []);

  const search = useCallback((q) => {
    setQuery(q); setOpenList(true);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      api.buscarColonias(q).then(d => setOpts(d.items || [])).catch(() => setOpts([]));
    }, 220);
  }, []);

  const pick = (c) => {
    setColonia(c); setQuery(c.name); setOpenList(false);
  };

  const calcular = useCallback(async () => {
    setErr(''); setLoading(true); setRes(null); setDd(null); setN3(null); setVeredicto(null);
    setShowBreak(false);
    try {
      const body = {
        terreno_m2: Number(terreno),
        categoria,
        colonia_id: colonia?.id || null,
      };
      if (margen !== '') body.margen_objetivo = Number(margen) / 100;
      if (precioManual !== '') body.precio_venta_pm2_manual = Number(precioManual);
      if (costoManual !== '') body.costo_obra_pm2_manual = Number(costoManual);
      if (comision !== '') body.comision_pct_manual = Number(comision) / 100;
      if (honorarios !== '') body.honorarios_pct_manual = Number(honorarios) / 100;
      // F1.5 · una sola llamada: el asistente lee el lote completo y lo sintetiza.
      const d = await api.analizarLote(body);
      setVeredicto(d.veredicto || null);
      setRes(d.residual || null);
      setDd(d.due_diligence || null);
      setN3(d.norma3 || null);
    } catch (e) {
      setErr(e.message || 'No se pudo calcular');
    } finally {
      setLoading(false);
    }
  }, [terreno, categoria, colonia, margen, precioManual, costoManual, comision, honorarios]);

  const sem = res ? (SEMAFORO[res.respuesta?.semaforo] || SEMAFORO.amarillo) : null;

  return (
    <DeveloperLayout>
      <PageHeader
        eyebrow="Underwriting · Valor de Terreno"
        title="¿Cuánto pago por este terreno?"
        sub="Te decimos el máximo que puedes pagar sin perder tu utilidad — con lo que la norma te deja construir y el precio de venta de la zona."
        actions={<DoctrineButton />}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 18, alignItems: 'start' }}>
        {/* ── ENTRADAS ── */}
        <Card style={{ padding: 18 }}>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <label style={lbl}>Colonia / zona</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: '#64748b' }} />
              <input
                style={{ ...inp, paddingLeft: 34 }}
                placeholder="Busca tu colonia…"
                value={query}
                onChange={e => search(e.target.value)}
                onFocus={() => query && setOpenList(true)}
              />
            </div>
            {openList && opts.length > 0 && (
              <div style={{
                position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
                background: '#0f172a', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 10,
                maxHeight: 260, overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
              }}>
                {opts.map(c => (
                  <button key={c.id} onClick={() => pick(c)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                    padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#e2e8f0', textAlign: 'left', borderBottom: '1px solid rgba(148,163,184,0.08)',
                  }}>
                    <span><MapPin size={12} style={{ color: '#64748b', marginRight: 6 }} />
                      {c.name} <span style={{ color: '#64748b', fontSize: 12 }}>· {c.alcaldia}</span></span>
                    {(c.precio_pm2 || 0) > 0
                      ? <span style={{ fontSize: 11, color: '#22c55e' }}>precio real</span>
                      : <span style={{ fontSize: 11, color: '#64748b' }}>CUS {c.cus}</span>}
                  </button>
                ))}
              </div>
            )}
            {colonia && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <Badge tone="ok">CUS {colonia.cus}</Badge>
                {(colonia.precio_pm2 || 0) > 0 && <Badge tone="ok">Venta {fmtMXN(colonia.precio_pm2)}/m²</Badge>}
                {(colonia.vsuelo_pm2_catastral || 0) > 0 && <Badge tone="neutral">Suelo {fmtMXN(colonia.vsuelo_pm2_catastral)}/m²</Badge>}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Tamaño del terreno (m²)</label>
            <input type="number" min="1" style={inp} value={terreno}
              onChange={e => setTerreno(e.target.value)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Tipo de producto</label>
            <select style={inp} value={categoria} onChange={e => setCategoria(e.target.value)}>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {/* Avanzado (colapsado por defecto · lo técnico, chico y abajo) */}
          <button onClick={() => setAdv(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none',
            color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: adv ? 12 : 0,
          }}>
            <ChevronDown size={14} style={{ transform: adv ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
            Ajustes finos (opcional)
          </button>
          {adv && (
            <div style={{ display: 'grid', gap: 12, marginBottom: 4 }}>
              <div>
                <label style={lbl}>Utilidad que exiges (%)</label>
                <input type="number" style={inp} placeholder="20" value={margen}
                  onChange={e => setMargen(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Precio de venta $/m² (si tienes tu dato)</label>
                <input type="number" style={inp} placeholder="auto (zona)" value={precioManual}
                  onChange={e => setPrecioManual(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Costo de obra $/m² (si tienes tu dato)</label>
                <input type="number" style={inp} placeholder="auto (índice)" value={costoManual}
                  onChange={e => setCostoManual(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Comisión de ventas (%)</label>
                <input type="number" style={inp} placeholder="2 (estándar CDMX)" value={comision}
                  onChange={e => setComision(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Honorarios de desarrollo (%)</label>
                <input type="number" style={inp} placeholder="16 (fee + gerencia)" value={honorarios}
                  onChange={e => setHonorarios(e.target.value)} />
              </div>
            </div>
          )}

          <button onClick={calcular} disabled={loading || !terreno} style={{
            width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none',
            background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'default' : 'pointer',
          }}>
            {loading ? 'Calculando…' : 'Calcular oferta máxima'}
          </button>
          {err && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{err}</div>}
        </Card>

        {/* ── RESPUESTA ── */}
        <div>
          {!res && !loading && (
            <Card style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
              <Sparkle size={28} style={{ color: '#6366f1', marginBottom: 12 }} />
              <div style={{ fontSize: 15 }}>Elige una colonia y el tamaño del terreno, y te decimos
                cuánto máximo te conviene pagar.</div>
            </Card>
          )}

          {res && (
            <>
              {/* ── Veredicto del asistente (F1.5) · la lectura de todo el lote, primero ── */}
              {veredicto && <Veredicto v={veredicto} />}

              {/* Número grande */}
              <Card style={{ padding: 28, background: sem.bg, border: `1px solid ${sem.border}`, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Tu oferta máxima por este lote</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge tone={sem.tone}>{sem.label}</Badge>
                    <Badge tone={res.confianza === 'alta' ? 'good' : res.confianza === 'media' ? 'neutral' : 'bad'}>
                      Confianza {res.confianza}
                    </Badge>
                  </div>
                </div>
                <div style={{ fontSize: 42, fontWeight: 800, color: '#f1f5f9', marginTop: 6, lineHeight: 1.1 }}>
                  {fmtMXN(res.respuesta.oferta_maxima_terreno)}
                </div>
                <div style={{ fontSize: 15, color: '#cbd5e1', marginTop: 4 }}>
                  ≈ {fmtMXN(res.respuesta.oferta_pm2_terreno)} / m² de terreno
                </div>
                <div style={{ fontSize: 13.5, color: '#cbd5e1', marginTop: 12, lineHeight: 1.5 }}>{res.respuesta.lectura}</div>
              </Card>

              {/* Avisos honestos */}
              {(res.avisos || []).map((a, i) => (
                <Card key={i} style={{ padding: 12, marginBottom: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <div style={{ fontSize: 13, color: '#fcd34d', display: 'flex', gap: 8 }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{a}
                  </div>
                </Card>
              ))}

              {/* De dónde salen los números (los 3 insumos clave + su origen) */}
              <Card style={{ padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Con qué lo calculamos</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <InsumoRow label="Cuánto deja construir (CUS)" value={`${res.supuestos.cus}×`}
                    sub={`${fmt0(res.desglose.m2_construibles)} m² construibles`} origen={res.supuestos.cus_origen} />
                  <InsumoRow label="Precio de venta de la zona" value={`${fmtMXN(res.supuestos.precio_venta_pm2)}/m²`}
                    sub={res.supuestos.precio_origen?.fuente} origen={res.supuestos.precio_origen} />
                  <InsumoRow label="Costo de obra" value={`${fmtMXN(res.supuestos.costo_obra_pm2)}/m²`}
                    sub={res.supuestos.costo_origen?.fuente} origen={res.supuestos.costo_origen} />
                </div>
              </Card>

              {/* Desglose completo (colapsado) */}
              <Card style={{ padding: 16 }}>
                <button onClick={() => setShowBreak(v => !v)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none',
                  color: '#e2e8f0', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, width: '100%',
                }}>
                  <ChevronDown size={15} style={{ transform: showBreak ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
                  Ver el desglose completo
                </button>
                {showBreak && (
                  <div style={{ marginTop: 14, display: 'grid', gap: 7 }}>
                    <Row k="Ingreso por venta" v={res.desglose.ingreso_por_venta} strong plus />
                    <Row k="− Costo de obra" v={-res.desglose.costo_obra} />
                    <Row k="− Indirectos (licencias, proyecto, legal)" v={-res.desglose.indirectos} />
                    <Row k="− Gerencia de desarrollo" v={-res.desglose.gerencia_desarrollo} />
                    <Row k="− Imprevistos" v={-res.desglose.imprevistos} />
                    <Row k="− Comisión de ventas" v={-res.desglose.comision_ventas} />
                    <Row k="− Publicidad" v={-res.desglose.publicidad} />
                    <Row k="− Tu utilidad requerida" v={-res.desglose.utilidad_requerida} />
                    <div style={{ borderTop: '1px solid rgba(148,163,184,0.2)', margin: '4px 0' }} />
                    <Row k="= Oferta máxima por el terreno" v={res.respuesta.oferta_maxima_terreno} strong />
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>{res.metodo}</div>
                  </div>
                )}
              </Card>

              {/* ── Due Diligence (F1.3) · cierra el ciclo: qué revisar antes de comprar ── */}
              {dd && <DueDiligence dd={dd} />}

              {/* ── Norma 3 (F1.4) · oportunidad de fusión para subir el CUS ── */}
              {n3 && n3.disponible && (n3.oportunidades || []).length > 0 && <Norma3 n3={n3} />}
            </>
          )}
        </div>
      </div>
    </DeveloperLayout>
  );
}

function InsumoRow({ label, value, sub, origen }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{value}</span>
        <DataOrigin origen={origen?.origen} fuente={origen?.fuente} />
      </div>
    </div>
  );
}

const ESTADO = {
  ok:        { dot: '#22c55e', label: 'OK',         tone: 'ok' },
  alerta:    { dot: '#f59e0b', label: 'Atención',   tone: 'warn' },
  pendiente: { dot: '#94a3b8', label: 'Por revisar', tone: 'neutral' },
  info:      { dot: '#6366f1', label: 'Info',       tone: 'brand' },
};

function DueDiligence({ dd }) {
  const [open, setOpen] = useState(false);
  const sem = SEMAFORO[dd.semaforo] || SEMAFORO.amarillo;
  const c = dd.conteo || {};
  return (
    <Card style={{ padding: 18, marginTop: 14 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '.2s', color: '#94a3b8' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Antes de comprar, revisa el predio</span>
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          {c.alertas > 0 && <Badge tone="warn">{c.alertas} atención</Badge>}
          <Badge tone="neutral">{c.pendientes} por revisar</Badge>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, padding: '10px 12px',
            borderRadius: 10, background: sem.bg, border: `1px solid ${sem.border}`, marginBottom: 14 }}>
            {dd.resumen}
          </div>

          {dd.secciones.filter(s => (s.items || []).length > 0).map(s => (
            <div key={s.clave} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 8 }}>{s.titulo}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {s.items.map(it => {
                  const e = ESTADO[it.estado] || ESTADO.info;
                  return (
                    <div key={it.clave} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 12px', borderRadius: 10, background: 'rgba(15,23,42,0.4)',
                      border: '1px solid rgba(148,163,184,0.12)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: e.dot,
                        flexShrink: 0, marginTop: 6 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#e2e8f0' }}>{it.titulo}</span>
                          <Badge tone={e.tone}>{e.label}</Badge>
                        </div>
                        {it.detalle && <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 3, lineHeight: 1.45 }}>{it.detalle}</div>}
                        {it.accion && <div style={{ fontSize: 12.5, color: '#a5b4fc', marginTop: 4, lineHeight: 1.45 }}>→ {it.accion}</div>}
                        {it.fuente && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Fuente: {it.fuente}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5, marginTop: 4 }}>{dd.nota}</div>
        </div>
      )}
    </Card>
  );
}

function Veredicto({ v }) {
  const sem = SEMAFORO[v.semaforo] || SEMAFORO.amarillo;
  const temaColor = { Precio: '#86efac', Revisión: '#a5b4fc', Oportunidad: '#fcd34d', Confianza: '#94a3b8' };
  return (
    <Card style={{ padding: 22, marginBottom: 14, background: sem.bg, border: `1px solid ${sem.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Sparkle size={16} style={{ color: '#a5b4fc' }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Lo que vi en este lote
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2 }}>{v.titular}</div>
      <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>{v.resumen_corto}</div>

      <div style={{ display: 'grid', gap: 9, marginTop: 14 }}>
        {(v.lo_que_vi || []).map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, marginTop: 5, width: 7, height: 7, borderRadius: 999,
              background: temaColor[b.tema] || '#94a3b8' }} />
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
              <b style={{ color: '#e2e8f0' }}>{b.tema}:</b> {b.texto}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Norma3({ n3 }) {
  const [open, setOpen] = useState(false);
  const best = n3.oportunidades[0];
  return (
    <Card style={{ padding: 18, marginTop: 14, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.28)' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '.2s', color: '#a5b4fc' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Oportunidad: subir el CUS por fusión (Norma 3)</span>
        </span>
        <Badge tone="brand">+{best.uplift_pct}% potencial</Badge>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 14 }}>{n3.resumen}</div>

          <div style={{ display: 'grid', gap: 8 }}>
            {n3.oportunidades.map((o, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                padding: '11px 13px', borderRadius: 10, background: 'rgba(15,23,42,0.45)',
                border: '1px solid rgba(148,163,184,0.14)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e2e8f0' }}>
                    {o.colonia_vecina} <span style={{ color: '#64748b', fontSize: 12 }}>· {o.dist_km} km</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    CUS {o.cus_actual} → {o.cus_potencial} · +{fmt0(o.m2_construibles_extra)} m² construibles
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#86efac' }}>+{fmtMXN(o.uplift_mxn)}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>en valor de terreno</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 12, lineHeight: 1.5 }}>{n3.como_funciona}</div>
          <div style={{ fontSize: 11.5, color: '#fcd34d', marginTop: 8, lineHeight: 1.5, display: 'flex', gap: 7 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{n3.advertencia}
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ k, v, strong, plus }) {
  const neg = v < 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: strong ? 13.5 : 13, color: strong ? '#e2e8f0' : '#94a3b8', fontWeight: strong ? 700 : 500 }}>{k}</span>
      <span style={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 800 : 600,
        color: strong ? '#f1f5f9' : neg ? '#fca5a5' : plus ? '#86efac' : '#cbd5e1', whiteSpace: 'nowrap' }}>
        {neg ? '−' : ''}{fmtMXN(Math.abs(v))}
      </span>
    </div>
  );
}
