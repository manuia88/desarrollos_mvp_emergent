// Superadmin · ATLAS DE MÉTRICAS — el explorador de entidades. Navega de lo nano a lo macro
// (ciudad→alcaldía→corredor→colonia→desarrollo→prototipo→unidad) y por cada entidad muestra su
// FICHA COMPLETA de métricas: conductual + oferta/demanda/cruce (con procedencia) + fusión + insights.
import React, { useEffect, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getAtlasEntity } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 };
const th = { fontSize: 11, color: '#888', textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' };
const td = { fontSize: 12.5, padding: '5px 8px', borderTop: '1px solid rgba(255,255,255,0.05)' };

const VENTANAS = [
  { key: 'live', label: 'Live' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
  { key: '6m', label: '6 meses' },
  { key: '12m', label: '12 meses' },
];

const TIPO_LABEL = {
  ciudad: 'Ciudad', alcaldia: 'Alcaldía', corredor: 'Corredor', colonia: 'Colonia',
  cp: 'CP', desarrollo: 'Desarrollo', prototipo: 'Prototipo', unidad: 'Unidad',
  atributo: 'Atributo', tipologia: 'Tipología', tier: 'Tier', perfil: 'Perfil', desarrollador: 'Desarrollador',
};

const confTone = (c) => {
  const v = String(c || '').toLowerCase();
  if (v.startsWith('alta')) return '#22c55e';
  if (v.startsWith('media')) return '#f59e0b';
  if (v.startsWith('baja')) return '#dc2626';
  return '#888';
};

const fmtVal = (v) => {
  if (v == null) return '—';
  if (typeof v === 'number') return v.toLocaleString('es-MX');
  return String(v);
};
const fmtMX = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);
const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';

export default function AtlasPanel() {
  // entidad actual + ventana
  const [entidad, setEntidad] = useState({ tipo: 'ciudad', id: 'CDMX' });
  const [ventana, setVentana] = useState('90d');
  const [panel, setPanel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    getAtlasEntity(entidad.tipo, entidad.id, ventana)
      .then((d) => { if (alive) { if (d?.error) setErr(d.error); setPanel(d); } })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [entidad.tipo, entidad.id, ventana]);

  const go = (tipo, id) => { if (tipo && id) { setPanel(null); setEntidad({ tipo, id }); } };

  const crumbs = panel?.breadcrumb || [{ tipo: 'ciudad', id: 'CDMX', nombre: 'CDMX' }];
  const hijos = panel?.hijos || [];
  const temas = panel?.temas || {};
  const cond = panel?.conductual || {};
  const cob = panel?.cobertura || {};
  const latentes = ['oferta', 'demanda', 'cruce'].reduce((acc, k) => acc + (temas[k] || []).filter((m) => m.latente).length, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16, alignItems: 'start' }}>
      {/* ── NAVEGACIÓN (drill-down: hijos) ── */}
      <Card style={{ ...card, position: 'sticky', top: 12 }}>
        <div style={lbl}>Navegar · de lo nano a lo macro</div>
        <div style={{ fontSize: 12.5, color: '#ccc', marginBottom: 4 }}>
          Estás en: <strong style={{ color: 'var(--theme)' }}>{TIPO_LABEL[entidad.tipo] || entidad.tipo}</strong>
        </div>
        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 12, wordBreak: 'break-all' }}>{entidad.id}</div>

        <div style={{ fontSize: 10.5, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Bajar a hijos {hijos.length > 0 ? `(${hijos.length})` : ''}
        </div>
        {hijos.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>Sin hijos — es una hoja del árbol.</div>}
        <div style={{ display: 'grid', gap: 5, maxHeight: 360, overflowY: 'auto' }}>
          {hijos.map((c) => (
            <button key={`${c.tipo}:${c.id}`} onClick={() => go(c.tipo, c.id)}
              style={{ textAlign: 'left', padding: '6px 9px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#ddd' }}>
              <span style={{ fontSize: 12.5 }}>{c.nombre || c.id}</span>
              <span style={{ fontSize: 10, color: '#888', marginLeft: 6 }}>· {TIPO_LABEL[c.tipo] || c.tipo}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={() => go('ciudad', 'CDMX')}
            style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ↑ Volver a la cima (CDMX)
          </button>
        </div>
      </Card>

      {/* ── FICHA ── */}
      <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
        {/* breadcrumb + ventana + cobertura */}
        <Card style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={`${c.tipo}:${c.id}:${i}`}>
                {i > 0 && <span style={{ color: '#555' }}>/</span>}
                <button onClick={() => go(c.tipo, c.id)}
                  style={{ padding: '3px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: i === crumbs.length - 1 ? 'var(--theme, #6366f1)' : 'transparent',
                    color: i === crumbs.length - 1 ? '#fff' : '#bbb', fontWeight: i === crumbs.length - 1 ? 700 : 500 }}>
                  {c.nombre || c.id}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {VENTANAS.map((v) => (
                <button key={v.key} onClick={() => setVentana(v.key)}
                  style={{ padding: '5px 12px', borderRadius: 9999, cursor: 'pointer', fontSize: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: ventana === v.key ? 'var(--theme, #6366f1)' : 'transparent',
                    color: ventana === v.key ? '#fff' : '#aaa', fontWeight: 600 }}>
                  {v.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: '#aaa', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span>cobertura: <strong style={{ color: 'var(--theme)' }}>{cob.reales ?? 0}/{cob.total ?? 0}</strong> métricas con valor</span>
              {latentes > 0 && <span style={{ color: '#777' }}>· {latentes} latentes (esperan dato)</span>}
            </div>
          </div>
        </Card>

        {loading && <Card style={card}>Cargando ficha de la entidad…</Card>}
        {err && <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>}

        {panel && !err && (
          <>
            {/* CONDUCTUAL — lo más importante, primero */}
            <ConductualSection cond={cond} />

            {/* OFERTA · DEMANDA · CRUCE */}
            <TemaSection title="Oferta · lo que existe" tone="ok" medidas={temas.oferta} />
            <TemaSection title="Demanda · lo que se busca" tone="brand" medidas={temas.demanda} />
            <TemaSection title="Cruce · oferta × demanda" tone="warn" medidas={temas.cruce} />

            {/* FUSIÓN */}
            {panel.fusion && <FusionSection fusion={panel.fusion} />}

            {/* INSIGHTS */}
            {(panel.insights || []).length > 0 && (
              <Card style={card}>
                <div style={lbl}>Insights de la entidad</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {panel.insights.map((it, i) => (
                    <div key={i} style={{ borderLeft: '3px solid var(--theme)', paddingLeft: 12, fontSize: 13, color: '#ddd', lineHeight: 1.45 }}>
                      {typeof it === 'string' ? it : (it.insight || JSON.stringify(it))}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── CONDUCTUAL ──────────────────────────────────────────────────────────────
function ConductualSection({ cond }) {
  const umv = cond.unidades_mas_vistas || [];
  const vsc = cond.vistas_sin_cita || {};
  const pc = cond.perfil_cliente || {};
  const pago = cond.forma_pago || {};
  const piden = cond.lo_que_mas_piden || {};
  const hasAny = umv.length > 0 || Object.keys(vsc).length > 0 || Object.keys(pc).length > 0 || Object.keys(pago).length > 0 || Object.keys(piden).length > 0;
  return (
    <Card style={card}>
      <div style={lbl}>Conductual · cómo se comportan los compradores</div>
      {!hasAny && <div style={{ fontSize: 12.5, color: '#666' }}>Aún sin señales conductuales para esta entidad y ventana.</div>}
      {hasAny && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {/* vistas sin cita — % grande */}
          {(vsc.sin_cita_pct != null || vsc.vistas != null) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>Vistas sin cita</span>
              <span style={{ fontSize: 34, fontWeight: 800, color: vsc.sin_cita_pct != null ? '#f59e0b' : '#777', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {vsc.sin_cita_pct != null ? `${vsc.sin_cita_pct}%` : '—'}
              </span>
              <span style={{ fontSize: 11.5, color: '#888' }}>
                {vsc.vistas ?? 0} vistas · {vsc.convirtieron_a_contacto ?? 0} contactaron
              </span>
            </div>
          )}

          {/* perfil del cliente */}
          {Object.keys(pc).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>Perfil del cliente</span>
              <div style={{ fontSize: 12.5, color: '#ddd', lineHeight: 1.7 }}>
                <div>Visitantes únicos: <strong>{pc.visitantes_unicos ?? 0}</strong></div>
                <div>Intención: <span style={{ color: '#bbb' }}>{kv(pc.intencion)}</span></div>
                <div>Dispositivo: <span style={{ color: '#bbb' }}>{kv(pc.dispositivo)}</span></div>
              </div>
            </div>
          )}

          {/* forma de pago */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>Forma de pago</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(pago).length === 0 && <span style={{ fontSize: 12, color: '#666' }}>—</span>}
              {Object.entries(pago).map(([k, v]) => <Badge key={k} tone="neutral">{k} {v}</Badge>)}
            </div>
          </div>

          {/* lo que más piden */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>Lo que más piden</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {(piden.amenidades || []).length === 0 && <span style={{ fontSize: 12, color: '#666' }}>—</span>}
              {(piden.amenidades || []).map((a) => <Badge key={a} tone="neutral">{a}</Badge>)}
            </div>
            <span style={{ fontSize: 11.5, color: '#888' }}>Enganche típico: <strong style={{ color: '#bbb' }}>{fmtMX(piden.enganche_tipico)}</strong></span>
          </div>

          {/* unidades más vistas */}
          {umv.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 10.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>Unidades más vistas</span>
              <div style={{ display: 'grid', gap: 5 }}>
                {(() => {
                  const mx = Math.max(1, ...umv.map((u) => u.vistas || 0));
                  return umv.map((u) => (
                    <div key={u.unidad} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                      <span style={{ width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ddd' }}>Unidad {u.unidad}</span>
                      <span style={{ flex: 1, height: 9, borderRadius: 2, background: 'var(--theme)', opacity: 0.7, width: `${(u.vistas / mx) * 100}%` }} />
                      <strong style={{ width: 50, textAlign: 'right', color: 'var(--theme)' }}>{u.vistas}</strong>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── OFERTA / DEMANDA / CRUCE ─────────────────────────────────────────────────
function TemaSection({ title, tone, medidas }) {
  const rows = medidas || [];
  if (rows.length === 0) return null;
  const conValor = rows.filter((m) => !m.latente).length;
  return (
    <Card style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={lbl}>{title}</div>
        <Badge tone={tone}>{conValor}/{rows.length} con valor</Badge>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr><th style={th}>medida</th><th style={{ ...th, textAlign: 'right' }}>valor</th><th style={{ ...th, textAlign: 'right' }}>n</th><th style={{ ...th, textAlign: 'right' }}>confianza</th></tr>
        </thead>
        <tbody>
          {rows.map((m) => <MedidaRow key={m.id} m={m} />)}
        </tbody>
      </table>
    </Card>
  );
}

function MedidaRow({ m }) {
  const [open, setOpen] = useState(false);
  const p = m.procedencia || {};
  const hasProc = p.fuente || p.almacen_salida || p.formula || p.cohorte || p.actualizado;
  return (
    <>
      <tr onClick={() => hasProc && setOpen((o) => !o)} style={{ cursor: hasProc ? 'pointer' : 'default' }}>
        <td style={td}>
          <span style={{ color: m.latente ? '#777' : '#ddd' }}>{m.medida || m.id}</span>
          {hasProc && <span style={{ fontSize: 10, color: '#666', marginLeft: 6 }}>{open ? '▾' : '▸'}</span>}
        </td>
        <td style={{ ...td, textAlign: 'right' }}>
          {m.latente
            ? <span style={{ fontSize: 10.5, color: '#777', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 5 }}>latente</span>
            : <span style={{ color: 'var(--theme)', fontWeight: 600 }}>{fmtVal(m.valor)}{m.unidad ? <span style={{ color: '#888', fontWeight: 400 }}> {m.unidad}</span> : ''}</span>}
        </td>
        <td style={{ ...td, textAlign: 'right', color: '#aaa' }}>{m.n ?? '—'}</td>
        <td style={{ ...td, textAlign: 'right', color: confTone(m.confianza), fontWeight: 600 }}>{m.confianza || '—'}</td>
      </tr>
      {open && hasProc && (
        <tr>
          <td colSpan={4} style={{ padding: '0 8px 8px' }}>
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Procedencia · de dónde sale</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 11.5 }}>
                <span style={{ color: '#888' }}>Fuente</span><span style={{ color: '#ddd' }}>{p.fuente || '—'}</span>
                <span style={{ color: '#888' }}>Almacén</span>
                <span style={{ color: '#ddd' }}>{p.almacen_entrada || '—'} <span style={{ color: '#666' }}>→</span> {p.almacen_salida || '—'}</span>
                {p.formula && <><span style={{ color: '#888' }}>Fórmula</span><span style={{ color: '#ccc', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{p.formula}</span></>}
                <span style={{ color: '#888' }}>Cohorte</span><span style={{ color: '#ddd' }}>{p.cohorte || '—'}</span>
                {p.actualizado && <><span style={{ color: '#888' }}>Actualizado</span><span style={{ color: '#ddd' }}>{p.actualizado}</span></>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── FUSIÓN institucional ─────────────────────────────────────────────────────
function FusionSection({ fusion }) {
  const f = fusion || {};
  const items = [];
  const push = (label, val) => { if (val != null && val !== '' && val !== '—') items.push([label, val]); };
  push('Precio/m²', f.precio_m2 != null ? fmtMX(f.precio_m2) : null);
  push('Demanda', f.demanda);
  push('Absorción', f.absorcion?.vendido_pct != null ? `${f.absorcion.vendido_pct}%` : (typeof f.absorcion === 'number' ? `${f.absorcion}` : null));
  push('Score zona', f.score_zona);
  push('Riesgo', f.riesgo?.letra || f.riesgo);
  push('Inversión', f.inversion?.score != null ? `${f.inversion.score}${f.inversion.tier ? ` (${f.inversion.tier})` : ''}` : f.inversion);
  push('Cap rate STR', f.cap_rate_str != null ? `${f.cap_rate_str}%` : null);
  push('Tier', f.tier);
  push('Alcaldía', f.alcaldia);
  push('Project score', f.project_score);
  push('Margen', f.margen?.pct != null ? `${f.margen.pct}%` : null);
  push('P(venta 12m)', f.prob_venta_12m?.pct != null ? `${f.prob_venta_12m.pct}%` : null);
  if (items.length === 0) return null;
  return (
    <Card style={card}>
      <div style={lbl}>Fusión institucional · síntesis de motores</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px 18px' }}>
        {items.map(([label, val]) => (
          <div key={label} style={{ fontSize: 12.5 }}>
            <span style={{ color: '#888' }}>{label}: </span>
            <strong style={{ color: '#ddd' }}>{String(val)}</strong>
          </div>
        ))}
      </div>
      {(fusion.recomendacion || fusion.ciclo) && (
        <div style={{ fontSize: 12, color: '#bbb', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontStyle: 'italic' }}>
          {fusion.ciclo ? `${fusion.ciclo} — ` : ''}{fusion.recomendacion || ''}
        </div>
      )}
    </Card>
  );
}
