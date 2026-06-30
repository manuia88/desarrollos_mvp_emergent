// Superadmin · ATLAS DE MÉTRICAS — el explorador de entidades. Navega de lo nano a lo macro
// (ciudad→alcaldía→corredor→colonia→desarrollo→prototipo→unidad) y por cada entidad muestra su
// FICHA COMPLETA de métricas: conductual + oferta/demanda/cruce (con procedencia) + fusión + insights.
import React, { useEffect, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import Indicador from './Indicador';
import { getAtlasEntity } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
// Header de sección — contraste subido para legibilidad (consistencia con otros paneles).
const lbl = { fontSize: 12, color: '#a8a8b3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 };
// Sub-etiqueta de columna dentro de tarjetas (también con contraste accesible).
const subLbl = { fontSize: 10.5, color: '#a8a8b3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 };

// ── Skeleton de carga (pulso CSS, inyectado una vez, SSR-safe) ───────────────
const SKELETON_STYLE_ID = 'atlaspanel-skeleton-keyframes';
function ensureSkeletonStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SKELETON_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = SKELETON_STYLE_ID;
  el.textContent = '@keyframes apPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.85; } }';
  document.head.appendChild(el);
}
const skBlock = (w, h = 10, extra = {}) => ({
  width: w, height: h, borderRadius: 4,
  background: 'rgba(255,255,255,0.10)',
  animation: 'apPulse 1.2s ease-in-out infinite',
  ...extra,
});

// Tarjeta fantasma de un "tema" (insinúa título + grilla de indicadores).
function SkeletonTemaCard() {
  return (
    <Card style={card} aria-hidden="true">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={skBlock(170, 11)} />
        <div style={skBlock(90, 18, { borderRadius: 9999 })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: 'grid', gap: 8, padding: '13px 16px', border: '1px solid var(--border)', borderRadius: 16 }}>
            <div style={skBlock('60%', 11)} />
            <div style={skBlock(90, 24)} />
            <div style={skBlock('80%', 9)} />
            <div style={skBlock('45%', 9)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// Bloque de carga completo (breadcrumb + conductual + tarjetas de tema) con etiqueta accesible.
function FichaSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 16 }} role="status" aria-live="polite" aria-busy="true">
      <span style={{
        position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
        overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
      }}>Cargando ficha de la entidad…</span>
      {/* breadcrumb + ventana fantasma */}
      <Card style={card} aria-hidden="true">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[120, 96, 110].map((w, i) => <div key={i} style={skBlock(w, 22, { borderRadius: 7 })} />)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[64, 64, 64, 64, 64].map((w, i) => <div key={i} style={skBlock(w, 26, { borderRadius: 9999 })} />)}
        </div>
      </Card>
      <SkeletonTemaCard />
      <SkeletonTemaCard />
    </div>
  );
}

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

const fmtMX = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);
const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';

export default function AtlasPanel() {
  // entidad actual + ventana
  const [entidad, setEntidad] = useState({ tipo: 'ciudad', id: 'CDMX' });
  const [ventana, setVentana] = useState('90d');
  const [panel, setPanel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { ensureSkeletonStyle(); }, []);

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

        <div style={{ ...subLbl, marginBottom: 6 }}>
          Bajar a hijos {hijos.length > 0 ? `(${hijos.length})` : ''}
        </div>
        {hijos.length === 0 && <div style={{ fontSize: 12, color: '#888' }}>Sin hijos — es una hoja del árbol (el nivel más fino).</div>}
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
              {latentes > 0 && <span style={{ color: '#a8a8b3' }}>· {latentes} latentes (esperan dato)</span>}
            </div>
          </div>
        </Card>

        {loading && <FichaSkeleton />}
        {err && <Card style={{ ...card, color: '#dc2626' }} role="alert">{err}</Card>}

        {panel && !err && !loading && (
          <>
            {/* CONDUCTUAL — lo más importante, primero */}
            <ConductualSection cond={cond} />

            {/* OFERTA · DEMANDA · CRUCE */}
            <TemaSection title="Oferta · lo que existe" toneLabel="oferta" tone="ok" medidas={temas.oferta} entidad={panel.entidad || entidad} />
            <TemaSection title="Demanda · lo que se busca" toneLabel="demanda" tone="brand" medidas={temas.demanda} entidad={panel.entidad || entidad} />
            <TemaSection title="Cruce · oferta × demanda" toneLabel="cruce" tone="warn" medidas={temas.cruce} entidad={panel.entidad || entidad} />

            {/* FUSIÓN */}
            <FusionSection fusion={panel.fusion} />

            {/* INSIGHTS */}
            <Card style={card}>
              <div style={lbl}>Insights de la entidad</div>
              {(panel.insights || []).length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#888' }}>
                  Sin insights generados para esta entidad y ventana — surgen al cruzar suficiente oferta, demanda y conducta.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {panel.insights.map((it, i) => (
                    <div key={i} style={{ borderLeft: '3px solid var(--theme)', paddingLeft: 12, fontSize: 13, color: '#ddd', lineHeight: 1.45 }}>
                      {typeof it === 'string' ? it : (it.insight || JSON.stringify(it))}
                    </div>
                  ))}
                </div>
              )}
            </Card>
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
      {!hasAny && (
        <div style={{ fontSize: 12.5, color: '#888' }}>
          Aún sin señales conductuales para esta entidad y ventana — se llenan cuando los compradores interactúan (vistas, perfil, forma de pago, lo que piden).
        </div>
      )}
      {hasAny && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {/* vistas sin cita — % grande */}
          {(vsc.sin_cita_pct != null || vsc.vistas != null) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={subLbl}>Vistas sin cita</span>
              <span style={{ fontSize: 34, fontWeight: 800, color: vsc.sin_cita_pct != null ? '#f59e0b' : '#777', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {vsc.sin_cita_pct != null ? `${vsc.sin_cita_pct}%` : '—'}
              </span>
              <span style={{ fontSize: 11.5, color: '#a8a8b3' }}>
                miraron pero no agendaron · {vsc.vistas ?? 0} vistas · {vsc.convirtieron_a_contacto ?? 0} contactaron
              </span>
            </div>
          )}

          {/* perfil del cliente */}
          {Object.keys(pc).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={subLbl}>Perfil del cliente</span>
              <div style={{ fontSize: 12.5, color: '#ddd', lineHeight: 1.7 }}>
                <div>Visitantes únicos: <strong>{pc.visitantes_unicos ?? 0}</strong></div>
                <div>Intención: <span style={{ color: '#bbb' }}>{kv(pc.intencion)}</span></div>
                <div>Dispositivo: <span style={{ color: '#bbb' }}>{kv(pc.dispositivo)}</span></div>
              </div>
            </div>
          )}

          {/* forma de pago */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={subLbl}>Forma de pago</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(pago).length === 0 && <span style={{ fontSize: 12, color: '#888' }}>Sin dato de forma de pago aún.</span>}
              {Object.entries(pago).map(([k, v]) => <Badge key={k} tone="neutral">{k} {v}</Badge>)}
            </div>
          </div>

          {/* lo que más piden */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={subLbl}>Lo que más piden</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {(piden.amenidades || []).length === 0 && <span style={{ fontSize: 12, color: '#888' }}>Sin amenidades pedidas aún.</span>}
              {(piden.amenidades || []).map((a) => <Badge key={a} tone="neutral">{a}</Badge>)}
            </div>
            <span style={{ fontSize: 11.5, color: '#a8a8b3' }}>Enganche típico: <strong style={{ color: '#ddd' }}>{fmtMX(piden.enganche_tipico)}</strong></span>
          </div>

          {/* unidades más vistas */}
          {umv.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <span style={subLbl}>Unidades más vistas</span>
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
// Cada métrica pasa por el estándar <Indicador>: nombre humano · valor · comparativo (vs ciudad) ·
// granularidad · dimensión · uso · fuente (procedencia) · n + confianza · latente con razón.
function TemaSection({ title, tone, toneLabel, medidas, entidad }) {
  const rows = medidas || [];
  const conValor = rows.filter((m) => !m.latente).length;
  const ent = entidad || {};
  const granularidad = `${TIPO_LABEL[ent.tipo] || ent.tipo}: ${ent.id}`;
  // Estado vacío explícito en vez de ocultar la sección en silencio.
  if (rows.length === 0) {
    return (
      <Card style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={lbl}>{title}</div>
          <Badge tone="neutral">{toneLabel} · sin medidas</Badge>
        </div>
        <div style={{ fontSize: 12.5, color: '#888' }}>
          Aún no hay medidas de {toneLabel} para esta entidad y ventana. Aparecerán al acumular dato.
        </div>
      </Card>
    );
  }
  return (
    <Card style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={lbl}>{title}</div>
        {/* texto + color: el badge nombra el tema (oferta/demanda/cruce), no depende solo del color */}
        <Badge tone={tone}>{toneLabel} · {conValor}/{rows.length} con valor</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {rows.map((m) => {
          const ind = {
            nombre: m.medida || m.id,
            valor: m.valor,
            unidad: m.unidad,
            comparativo: m.comparativo || { vs_ciudad: null, señal: '—', texto: '' },
            granularidad,
            dimension: m.id,
            uso: m.uso,
            fuente: Array.isArray(m.procedencia?.fuente) ? m.procedencia.fuente.join(' + ') : m.procedencia?.fuente,
            n: m.n,
            confianza: m.confianza,
            latente: m.latente,
            razon_latente: m.latente ? 'n por debajo del mínimo — se activa con más volumen' : null,
          };
          return <Indicador key={m.id} ind={ind} />;
        })}
      </div>
    </Card>
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
  return (
    <Card style={card}>
      <div style={lbl}>Fusión institucional · síntesis de motores</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#888' }}>
          Sin síntesis de motores para esta entidad — la fusión institucional (precio/m², absorción, riesgo, score) aparece cuando los motores tienen dato suficiente.
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px 18px' }}>
        {items.map(([label, val]) => (
          <div key={label} style={{ fontSize: 12.5 }}>
            <span style={{ color: '#a8a8b3' }}>{label}: </span>
            <strong style={{ color: '#ddd' }}>{String(val)}</strong>
          </div>
        ))}
      </div>
      )}
      {(f.recomendacion || f.ciclo) && (
        <div style={{ fontSize: 12, color: '#bbb', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontStyle: 'italic' }}>
          {f.ciclo ? `${f.ciclo} — ` : ''}{f.recomendacion || ''}
        </div>
      )}
    </Card>
  );
}
