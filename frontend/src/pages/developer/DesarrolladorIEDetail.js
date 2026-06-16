// /desarrollador/desarrollos/:slug/ie — Lectura de la Zona en BANDAS (sin "/100")
// 12 indicadores agrupados en 4 categorías, cada uno en banda honesta (Muy Baja…Muy Alta).
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { Card, Badge } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { getZoneIndices } from '../../api/indices';
import { Sparkle, ArrowRight, X } from '../../components/icons';
import DiagnosticPanel from '../../components/developer/DiagnosticPanel';
import { Z } from '../../styles/zIndex';

// Color por banda (token del backend → estilo). Nada de "/100".
const BAND_COLORS = {
  verde:  { fg: '#86efac', bg: 'rgba(34,197,94,0.12)',  bd: 'rgba(34,197,94,0.32)' },
  ambar:  { fg: '#fcd34d', bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.32)' },
  rojo:   { fg: '#fca5a5', bg: 'rgba(239,68,68,0.12)',  bd: 'rgba(239,68,68,0.32)' },
  neutro: { fg: 'var(--cream-3)', bg: 'rgba(255,255,255,0.04)', bd: 'var(--border)' },
};
const bandOf = (token) => BAND_COLORS[token] || BAND_COLORS.neutro;

function BandPill({ etiqueta, color, size = 12.5 }) {
  const c = bandOf(color);
  return (
    <span style={{
      fontFamily: 'DM Sans', fontWeight: 700, fontSize: size, padding: '3px 11px',
      borderRadius: 9999, background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, whiteSpace: 'nowrap',
    }}>{etiqueta}</span>
  );
}

// Lectura comparativa cualitativa (sin número): mi banda vs la banda de la zona.
function cmpReading(mineVal, colVal) {
  const d = (mineVal || 0) - (colVal || 0);
  if (d >= 5) return { texto: 'Mejor que la Zona', color: 'verde' };
  if (d <= -5) return { texto: 'Bajo la Zona', color: 'rojo' };
  return { texto: 'En Línea con la Zona', color: 'ambar' };
}

export default function DesarrolladorIEDetail({ user, onLogout }) {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [indices, setIndices] = useState(null);
  const [drillScore, setDrillScore] = useState(null);
  const [drillData, setDrillData] = useState(null);

  useEffect(() => {
    if (!slug) return;
    api.getIEBreakdown(slug).then(setData).catch(() => setData({ error: true }));
    api.getColoniaBenchmark(slug).then(setBenchmark).catch(() => setBenchmark({ error: true }));
  }, [slug]);

  // Índices DMX de la colonia del proyecto (mismo motor que el superadmin/comprador).
  useEffect(() => {
    if (!data || data.error || !data.colonia) return;
    let alive = true;
    getZoneIndices(data.colonia)
      .then(r => { if (alive) setIndices(r); })
      .catch(() => { if (alive) setIndices({ error: true }); });
    return () => { alive = false; };
  }, [data]);

  const openDrill = async (score) => {
    setDrillScore(score);
    setDrillData(null);
    try {
      const r = await api.getIEImprove(slug, score.code);
      setDrillData(r);
    } catch (e) { setDrillData({ error: true }); }
  };

  if (!data) return <DeveloperLayout user={user} onLogout={onLogout}><div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</div></DeveloperLayout>;
  if (data.error) return <DeveloperLayout user={user} onLogout={onLogout}><Card style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>No se pudo cargar la lectura.</Card></DeveloperLayout>;

  const oc = bandOf(data.overall_color);
  const totalScores = (data.categories || []).reduce((a, c) => a + c.scores.length, 0);

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          <Link to="/desarrollador/inventario" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>Inventario</Link>
          {' / '}
          <Link to={`/desarrollador/desarrollos/${slug}/legajo`} style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>{data.project_name}</Link>
          {' / Lectura de la zona'}
        </div>
        <h1 data-testid="ie-h1" style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.025em', margin: '4px 0 6px' }}>
          Lectura de la Zona · {data.project_name}
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
          12 indicadores en 4 grupos, cada uno en su banda (Muy Baja a Muy Alta). Toca cualquiera para ver cómo mejorarlo. Más abajo, otras señales que el motor ya calcula.
        </p>
      </div>

      {/* Lectura general (banda, no número) */}
      <Card data-testid="ie-overall" style={{ marginBottom: 12, background: `linear-gradient(140deg, ${oc.bg}, transparent)`, border: `1px solid ${oc.bd}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">LECTURA GENERAL · {data.colonia}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 40, color: oc.fg, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 6 }}>
              {data.overall_etiqueta}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 6 }}>
              {data.es_estimado ? 'Incluye indicadores estimados con el dato real de la zona' : 'Basado en señales reales de la zona'} · {totalScores} indicadores
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.categories.map(c => (
              <div key={c.key} style={{ padding: '10px 14px', background: 'rgba(var(--bg-rgb),0.6)', border: '1px solid var(--border)', borderRadius: 12, minWidth: 120 }}>
                <div className="eyebrow" style={{ marginBottom: 6, fontSize: 9 }}>{c.label}</div>
                <BandPill etiqueta={c.etiqueta} color={c.color} />
              </div>
            ))}
          </div>
        </div>
      </Card>
      {data.leyenda && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 18 }}>{data.leyenda}</div>
      )}

      {/* Comparativa vs la zona */}
      {benchmark && !benchmark.error && benchmark.projects_count > 0 && (
        <ColoniaBenchmarkCard myData={data} benchmark={benchmark} />
      )}

      {/* Índices DMX de la colonia (IPV/IAB/IDS/IRE/ICO + maestro IDM) */}
      {indices && !indices.error && Array.isArray(indices.indices) && indices.indices.length > 0 && (
        <IndicesDmxCard colonia={data.colonia} data={indices} />
      )}

      <DiagnosticPanel devId={slug} devName={data.project_name} />

      {/* Categorías */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        {data.categories.map(cat => (
          <Card key={cat.key} data-testid={`ie-cat-${cat.key}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="eyebrow">{cat.label}</div>
              <BandPill etiqueta={cat.etiqueta} color={cat.color} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cat.scores.map(s => (
                <button
                  key={s.code}
                  data-testid={`ie-score-${s.code}`}
                  onClick={() => openDrill(s)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', padding: 12, borderRadius: 10,
                    background: 'rgba(var(--cream-rgb),0.02)', border: '1px solid var(--border)',
                    display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 10, transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--cream-rgb),0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(var(--cream-rgb),0.02)'}
                >
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: bandOf(s.vs_zona?.color).fg }}>{s.vs_zona?.texto}</span>
                      {s.es_estimado && <span style={{ padding: '1px 6px', background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, color: 'var(--amber, #fcd34d)', fontSize: 9 }}>Estimado</span>}
                    </div>
                  </div>
                  <BandPill etiqueta={s.etiqueta} color={s.color} />
                  <ArrowRight size={13} color="var(--cream-3)" />
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Más indicadores que el motor calcula (Ley #4: nada calculado-pero-oculto) */}
      {Array.isArray(data.extra_scores) && data.extra_scores.length > 0 && (
        <ExtraScoresSection items={data.extra_scores} />
      )}

      {drillScore && (
        <DrillDownModal score={drillScore} data={drillData} onClose={() => { setDrillScore(null); setDrillData(null); }} />
      )}
    </DeveloperLayout>
  );
}

// Indicadores que el motor IE calcula pero que no entran en los 12 agrupados.
// Cada uno con su valor real + banda/número, o estado honesto "Esperando dato".
function ExtraScoresSection({ items }) {
  return (
    <Card data-testid="ie-extra-scores" style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 4 }}>
        <div className="eyebrow">MÁS INDICADORES DE TU PROYECTO</div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '4px 0 0', maxWidth: 720, lineHeight: 1.5 }}>
          Señales adicionales que el motor ya calcula. Las que aún no tienen dato aparecen como "Esperando dato" (nada inventado).
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 12 }}>
        {items.map(s => (
          <div
            key={s.code}
            data-testid={`ie-extra-${s.code}`}
            style={{
              padding: 12, borderRadius: 10, background: 'rgba(var(--cream-rgb),0.02)',
              border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>{s.name}</div>
              {s.estado === 'esperando'
                ? <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream-3)', fontSize: 10, whiteSpace: 'nowrap' }}>Esperando dato</span>
                : <BandPill etiqueta={s.etiqueta} color={s.color} size={11.5} />}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', lineHeight: 1.45 }}>
              {s.estado === 'esperando' ? (s.estado_motivo || 'El motor aún no tiene este dato para tu proyecto.') : s.powers}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Índices DMX de la colonia del proyecto — sellos estilo FICO (nombre + valor/banda + qué mide).
// Mismo motor que el superadmin/comprador. Honesto: muestra el número si el plan lo da; si no,
// la banda cualitativa (Alta/Media/Baja). Marca "Estimado" cuando el motor lo señala. Nada inventado.
function IndicesDmxCard({ colonia, data }) {
  const idm = data.idm || {};
  const items = data.indices || [];
  const idmColor = bandOf(idm.color);
  const hasNumber = idm.valor != null; // plan Pro/Enterprise da el valor exacto; free da solo la banda

  return (
    <Card data-testid="ie-indices-dmx" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div className="eyebrow">ÍNDICES DMX · {colonia}</div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: '4px 0 0', maxWidth: 640, lineHeight: 1.5 }}>
            Los cinco índices de la zona (plusvalía, absorción, demanda, renta y calidad) más el Índice DMX maestro. Cada uno comparado con el resto de la ciudad.
          </p>
        </div>
        {/* Sello maestro IDM */}
        <div data-testid="ie-indice-IDM" style={{
          textAlign: 'center', padding: '12px 18px', borderRadius: 14,
          background: `linear-gradient(140deg, ${idmColor.bg}, transparent)`, border: `1px solid ${idmColor.bd}`, minWidth: 132,
        }}>
          <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Índice DMX</div>
          {hasNumber ? (
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: idmColor.fg, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {idm.valor}{idm.letra && <span style={{ fontSize: 14, opacity: 0.7, marginLeft: 4 }}>{idm.letra}</span>}
            </div>
          ) : (
            <div style={{ marginTop: 2 }}><BandPill etiqueta={idm.etiqueta || '—'} color={idm.color} size={13} /></div>
          )}
          {hasNumber && idm.etiqueta && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 4 }}>{idm.etiqueta}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {items.map(ix => {
          const c = bandOf(ix.color);
          const estimado = ix.es_estimado || ix.fuente === 'estimado';
          const ixHasNumber = ix.valor != null;
          return (
            <div
              key={ix.key}
              data-testid={`ie-indice-${ix.key}`}
              style={{
                padding: 14, borderRadius: 12, background: 'rgba(var(--cream-rgb),0.02)',
                border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', fontWeight: 700 }}>
                  <span style={{ color: 'var(--cream-3)', fontWeight: 600, marginRight: 6 }}>{ix.key}</span>{ix.nombre}
                </div>
                {ixHasNumber ? (
                  <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: c.fg, lineHeight: 1 }}>
                    {ix.valor}{ix.letra && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 3 }}>{ix.letra}</span>}
                  </span>
                ) : (
                  <BandPill etiqueta={ix.etiqueta || '—'} color={ix.color} size={11.5} />
                )}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', lineHeight: 1.45 }}>{ix.que_mide}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {ixHasNumber && ix.etiqueta && <BandPill etiqueta={ix.etiqueta} color={ix.color} size={10.5} />}
                {estimado && (
                  <span style={{ padding: '1px 7px', background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, color: 'var(--amber, #fcd34d)', fontSize: 9.5 }}>Estimado</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(data.senal_leyenda || data.nota) && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 12, lineHeight: 1.5 }}>
          {data.senal_leyenda}{data.senal_leyenda && data.nota ? ' · ' : ''}{data.nota}
        </div>
      )}
    </Card>
  );
}

function DrillDownModal({ score, data, onClose }) {
  return (
    <div
      data-testid="ie-drill-modal"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: Z.STICKY, background: 'rgba(var(--bg-rgb),0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'linear-gradient(180deg, #1c2233, #11151f)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 22, maxWidth: 640, width: '100%', maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="eyebrow">CÓMO MEJORAR</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)', margin: '4px 0 0' }}>{score.name}</h3>
          </div>
          <button onClick={onClose} data-testid="ie-drill-close" style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 18 }}>
          <MiniBand label="Tu proyecto" etiqueta={score.etiqueta} color={score.color} />
          <MiniBand label="Vs la zona" etiqueta={score.vs_zona?.texto} color={score.vs_zona?.color} />
        </div>

        {!data ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando recomendaciones…</div>
         : data.error ? <div style={{ padding: 20, color: 'var(--red)' }}>No se pudieron cargar las recomendaciones.</div>
         : (
          <>
            <div style={{ padding: 14, background: 'linear-gradient(140deg, rgba(236,72,153,0.08), transparent)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Sparkle size={13} color="#f9a8d4" />
                <div className="eyebrow" style={{ marginBottom: 0 }}>LO QUE VEO</div>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6 }}>{data.narrative_stub}</div>
            </div>

            <div className="eyebrow" style={{ marginBottom: 10 }}>QUÉ HACER PARA SUBIRLO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.recommendations.map((r, i) => (
                <div key={i} data-testid={`ie-rec-${i}`} style={{ padding: 14, borderRadius: 12, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', flex: 1 }}>{r.title}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Badge tone={r.impact === 'alto' ? 'ok' : 'neutral'}>Impacto {r.impact}</Badge>
                      <Badge tone={r.effort === 'baja' ? 'ok' : r.effort === 'alta' ? 'bad' : 'warn'}>Esfuerzo {r.effort}</Badge>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55 }}>{r.detail}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniBand({ label, etiqueta, color }) {
  return (
    <div style={{ padding: 12, background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>{label}</div>
      <BandPill etiqueta={etiqueta || '—'} color={color} />
    </div>
  );
}

function ColoniaBenchmarkCard({ myData, benchmark }) {
  const myCats = {};
  (myData.categories || []).forEach(c => { myCats[c.key] = c; });
  const zb = benchmark.bandas_zona || {};
  const myOverallVal = (myData.categories || []).reduce((a, c) => a + (c.valor_barra || 0), 0) / Math.max(1, (myData.categories || []).length);
  const colOverallVal = (zb.overall && zb.overall.valor_barra) || 0;
  const overallCmp = cmpReading(myOverallVal, colOverallVal);

  const CATS = [
    { key: 'fundamentals', label: 'Fundamentos' },
    { key: 'market', label: 'Mercado' },
    { key: 'risk', label: 'Riesgo' },
    { key: 'sentiment', label: 'Percepción de la Zona' },
  ];

  return (
    <div data-testid="ie-colonia-benchmark" style={{
      background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.04))',
      border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div className="eyebrow">VS EL PROMEDIO DE LA ZONA</div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 2px', letterSpacing: '-0.018em' }}>
            {myData.project_name} vs {benchmark.colonia}
          </h3>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
            Comparado con {benchmark.projects_count} proyecto{benchmark.projects_count === 1 ? '' : 's'} de la zona · estimación
          </div>
        </div>
        <BandPill etiqueta={overallCmp.texto} color={overallCmp.color} size={13} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {CATS.map(c => {
          const mine = myCats[c.key];
          const zone = zb[c.key];
          const reading = cmpReading(mine?.valor_barra, zone?.valor_barra);
          return (
            <div key={c.key} data-testid={`ie-bench-${c.key}`} style={{ padding: 12, borderRadius: 12, background: 'rgba(var(--bg-rgb),0.55)', border: '1px solid var(--border)' }}>
              <div className="eyebrow" style={{ marginBottom: 6, fontSize: 9 }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <BandPill etiqueta={mine?.etiqueta || '—'} color={mine?.color} size={11.5} />
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>zona: {zone?.etiqueta || '—'}</span>
              </div>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: bandOf(reading.color).fg }}>{reading.texto}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
