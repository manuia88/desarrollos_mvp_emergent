/**
 * CubeAtomView — el ÁTOMO del cubo (máxima hipergranularidad). Una unidad → TODOS sus indicadores
 * agrupados por familia según el contrato: hechos de la unidad + los scores IE de su colonia + zone score
 * + demanda, cada uno con su valor y LINEAJE. Sin dato → "—" honesto (nunca inventa). El Modelo del Mundo
 * de la Demanda hasta el último ladrillo.
 */
import React, { useState } from 'react';
import { Box, Search, Database, Shield, AlertCircle, Layers } from 'lucide-react';
import { getCubeAtom, getAtomEventos } from '../../api/superadminMetricsCube';

const FAMILY_COLOR = {
  oferta: '#6366F1', demanda: '#EC4899', dinero: '#10B981', riesgo: '#EF4444',
  gusto: '#F59E0B', ia: '#8B5CF6', indice: '#06B6D4', leads: '#3B82F6', meta: '#94A3B8',
};
const money = (v) => `$${Math.round(v).toLocaleString('es-MX')}`;

function fmtVal(m) {
  if (m.value == null || m.value === '') return { text: m.note || '—', dim: true };
  const v = m.value;
  if (typeof v === 'object') return { text: 'ver detalle', dim: false };
  if (m.fmt === 'pesos') return { text: money(v), dim: false };
  if (m.fmt === 'pct' || m.fmt === 'pp') return { text: `${(+v).toFixed(1)}%`, dim: false };
  if (m.fmt === 'score') return { text: `${Math.round(v)}`, dim: false };
  if (m.fmt === 'conteo') return { text: (+v).toLocaleString('es-MX'), dim: false };
  return { text: String(v), dim: false };
}

function scoreColor(m) {
  if (m.fmt !== 'score' || m.value == null) return 'var(--cream)';
  const good = m.direction === 'lower' ? (m.value <= 40) : (m.value >= 70);
  const bad = m.direction === 'lower' ? (m.value >= 70) : (m.value <= 40);
  return good ? '#4ADE80' : bad ? '#F87171' : '#FCD34D';
}

// ── Render de UNA característica (prototipo/tamaño/precio/espacio/extra) ──
function featText(f) {
  if (f.value == null || f.value === '') return '—';
  if (f.fmt === 'pesos') return money(f.value);
  if (typeof f.value === 'boolean') return f.value ? 'Sí' : 'No';
  return String(f.value);
}
// Cuánto mueve el precio/m² (hedónico): binario = la feature entera; marginal = cada unidad extra
function ImpactoBadge({ f }) {
  if (f.impacto_pct == null) return null;
  const pos = f.impacto_pct >= 0;
  const sign = pos ? '+' : '';
  const suffix = f.impacto_tipo === 'marginal' ? ' c/u' : '';
  const title = f.impacto_tipo === 'marginal'
    ? `Cada unidad adicional mueve el precio/m² ${sign}${f.impacto_pct}%`
    : `Tener esta característica mueve el precio/m² ${sign}${f.impacto_pct}%`;
  return (
    <span title={title} style={{ fontFamily: 'DM Sans', fontSize: 10, fontWeight: 800, color: pos ? '#4ADE80' : '#F87171', background: pos ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {sign}{f.impacto_pct}%{suffix}
    </span>
  );
}
// Posicionamiento del precio/m² de la unidad vs. la mediana de su colonia
function PosBadge({ f }) {
  if (f.vs_colonia_pct == null) return null;
  const up = f.vs_colonia_pct >= 0;
  return (
    <span title={`Mediana de la colonia: ${money(f.ref_colonia)}/m²`} style={{ fontFamily: 'DM Sans', fontSize: 10, fontWeight: 800, color: 'rgba(240,235,224,0.78)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {Math.abs(f.vs_colonia_pct)}% vs. colonia
    </span>
  );
}

export default function CubeAtomView({ initialUnitId = '' }) {
  const [q, setQ] = useState(initialUnitId);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [eventos, setEventos] = useState([]);   // F5 · línea de tiempo de la unidad

  const load = async (uid) => {
    const id = (uid ?? q).trim();
    if (!id) return;
    setBusy(true); setErr(null);
    try {
      setData(await getCubeAtom(id));
      getAtomEventos(id).then((r) => setEventos(r?.eventos || [])).catch(() => setEventos([]));
    }
    catch (e) { setErr(e?.status === 404 ? `No se encontró la unidad "${id}".` : (e?.message || 'Error.')); setData(null); }
    finally { setBusy(false); }
  };
  React.useEffect(() => { if (initialUnitId) load(initialUnitId); /* eslint-disable-next-line */ }, [initialUnitId]);

  const u = data?.unit;

  return (
    <div data-testid="cube-atom-view">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, maxWidth: 460 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: 10, color: 'rgba(240,235,224,0.4)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="ID de unidad (ej. roma-norte-85-02A)" data-testid="atom-input"
            style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={() => load()} disabled={busy} data-testid="atom-go"
          style={{ padding: '8px 16px', borderRadius: 9999, border: '1px solid rgba(var(--theme-rgb),0.45)', background: 'rgba(var(--theme-rgb),0.16)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}>Ver átomo</button>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.5)', marginBottom: 14 }}>
        Todo lo que sabemos de UNA unidad: sus hechos, los índices de su colonia y su lineaje.
      </div>

      {err && <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={15} /> {err}</div>}

      {u && (
        <>
          {/* Cabecera del átomo */}
          <div className="dmx-card" style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Box size={16} color="var(--theme)" />
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>
                {data.development?.name || '—'} · {u.unit_number || u.id}
              </span>
              {u.status && <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: 'rgba(240,235,224,0.6)', background: 'rgba(255,255,255,0.06)', borderRadius: 9999, padding: '2px 9px' }}>{u.status}</span>}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.85)' }}>
              {u.precio != null && <span>Precio: <b style={{ color: 'var(--cream)' }}>{money(u.precio)}</b></span>}
              {u.m2 != null && <span>{u.m2} m²</span>}
              {u.recamaras != null && <span>{u.recamaras} rec</span>}
              {u.banos != null && <span>{u.banos} baños</span>}
              {data.colonia && <span>Colonia: <b style={{ color: 'var(--cream)' }}>{data.colonia}</b></span>}
              {data.zone_score?.score_letter && <span>Zona: <b style={{ color: 'var(--theme)' }}>{data.zone_score.score_letter} ({Math.round(data.zone_score.score_numeric)})</b></span>}
            </div>
          </div>

          {/* Características hipergranulares: qué la compone y cuánto vale cada parte (hedónico + posición) */}
          {(data.caracteristicas || []).length > 0 && (
            <div className="dmx-card" style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <Layers size={15} color="var(--theme)" />
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Características</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 12 }}>
                Qué la compone y cuánto vale cada parte.{' '}
                {data.hedonico_disponible
                  ? 'El % es cuánto mueve el precio/m² (modelo hedónico, controlando por colonia).'
                  : 'El impacto por característica se activa cuando hay muestra suficiente.'}
              </div>
              {data.caracteristicas.map((g) => (
                <div key={g.grupo} style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.5)', marginBottom: 6 }}>{g.grupo}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(184px,1fr))', gap: 7 }}>
                    {g.features.map((f) => (
                      <div key={f.key} data-testid={`feat-${f.key}`} style={{ padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.6)', fontWeight: 600 }}>{f.label}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)', letterSpacing: '-0.01em' }}>{featText(f)}</span>
                          <ImpactoBadge f={f} />
                          <PosBadge f={f} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Familias × métricas (hipergranular) */}
          {(data.families || []).map((fam) => {
            const color = FAMILY_COLOR[fam.key] || '#94A3B8';
            return (
              <div key={fam.key} style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color, marginBottom: 8 }}>{fam.label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 8 }}>
                  {fam.metrics.map((m) => {
                    const fv = fmtVal(m);
                    return (
                      <div key={m.key} data-testid={`atom-${m.key}`} style={{ padding: '11px 13px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `2px solid ${color}55` }}>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.7)', fontWeight: 600 }}>{m.label}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                          <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: fv.dim ? 'rgba(240,235,224,0.35)' : scoreColor(m), letterSpacing: '-0.01em' }}>{fv.text}</span>
                          {m.kanon && <Shield size={10} style={{ color: 'rgba(74,222,128,0.6)' }} title="Protege privacidad" />}
                        </div>
                        {m.lineage && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontFamily: 'DM Mono, monospace', fontSize: 8.5, color: 'rgba(240,235,224,0.35)', lineHeight: 1.3 }}><Database size={8} style={{ flexShrink: 0 }} /> {m.lineage}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
      {/* F5 · el TIEMPO del átomo: qué le ha pasado a esta unidad (developer_audit) */}
      {u && eventos.length > 0 && (
        <div data-testid="atom-eventos" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 13, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
            Historial de la unidad ({eventos.length})
          </div>
          {eventos.slice(0, 12).map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none', fontFamily: 'DM Sans', fontSize: 12 }}>
              <span style={{ color: 'rgba(240,235,224,0.45)', whiteSpace: 'nowrap', fontFamily: 'DM Mono, monospace', fontSize: 10.5 }}>{String(e.ts || '').slice(0, 10)}</span>
              <span style={{ color: 'var(--cream)' }}>{e.descripcion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
