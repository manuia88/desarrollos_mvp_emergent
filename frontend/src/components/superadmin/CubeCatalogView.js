/**
 * CubeCatalogView — el CONTRATO del cubo hecho visible (rebuild hipergranular). Renderiza el registro único
 * cube_catalog: cada métrica/score/índice con su familia, granularidad geo+temporal, dimensiones de corte,
 * motor que la produce, lineaje (de qué dato crudo sale) y si requiere k-anon. Es la "tabla de contenidos"
 * del Modelo del Mundo de la Demanda: qué se puede saber, a qué detalle, de dónde sale. Cero jerga.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Database, Shield, Layers, AlertCircle } from 'lucide-react';
import { getCubeCatalog } from '../../api/superadminMetricsCube';

const FAMILY_COLOR = {
  oferta: '#6366F1', demanda: '#EC4899', dinero: '#10B981', riesgo: '#EF4444',
  gusto: '#F59E0B', ia: '#8B5CF6', indice: '#06B6D4', leads: '#3B82F6', meta: '#94A3B8',
};

export default function CubeCatalogView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [fam, setFam] = useState('todas');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    getCubeCatalog()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e?.message || 'No se pudo cargar el catálogo.'); });
    return () => { alive = false; };
  }, []);

  const metrics = useMemo(() => {
    const all = (data && data.metrics) || [];
    const nq = q.trim().toLowerCase();
    return all.filter((m) => (fam === 'todas' || m.family === fam)
      && (!nq || `${m.label} ${m.question} ${m.key} ${m.lineage}`.toLowerCase().includes(nq)));
  }, [data, fam, q]);

  if (err) {
    return <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={15} /> {err}</div>;
  }
  if (!data) return <div style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando el catálogo del cubo…</div>;

  const fmLabel = Object.fromEntries((data.families || []).map((f) => [f.key, f.label]));
  const geoLabel = Object.fromEntries((data.geo_levels || []).map((g) => [g.key, g.label]));

  const pill = (active, color) => ({
    padding: '5px 12px', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, cursor: 'pointer',
    background: active ? `${color || 'var(--theme)'}22` : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? `${color || 'var(--theme)'}88` : 'rgba(255,255,255,0.08)'}`,
    color: active ? (color || 'var(--theme)') : 'rgba(240,235,224,0.6)',
  });

  return (
    <div data-testid="cube-catalog-view">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>Todo lo que el cubo sabe</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>
          {data.counts?.total} indicadores · {data.counts?.vivos} activos · {data.counts?.stub} en preparación
        </div>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', marginBottom: 14, lineHeight: 1.5, maxWidth: 720 }}>
        Cada indicador declara de dónde sale (lineaje), a qué detalle baja (unidad → ciudad), cada cuándo se mide y si protege privacidad. Es el Modelo del Mundo de la Demanda: la fuente única que alimenta todas las vistas.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={() => setFam('todas')} style={pill(fam === 'todas')}>Todas</button>
        {(data.families || []).map((f) => (
          <button key={f.key} onClick={() => setFam(f.key)} style={pill(fam === f.key, FAMILY_COLOR[f.key])}>{f.label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar indicador…"
          style={{ marginLeft: 'auto', minWidth: 180, padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
        {metrics.map((m) => {
          const color = FAMILY_COLOR[m.family] || '#94A3B8';
          return (
            <div key={m.key} className="dmx-card" data-testid={`catalog-${m.key}`}
              style={{ padding: '14px 15px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: `3px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)', lineHeight: 1.2 }}>{m.label}</div>
                <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700, color, background: `${color}18`, borderRadius: 9999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{fmLabel[m.family] || m.family}</span>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.7)', marginTop: 5, lineHeight: 1.4 }}>{m.question}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                {(m.geo || []).map((g) => (
                  <span key={g} title="Nivel de detalle" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'rgba(240,235,224,0.6)', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '2px 6px' }}><Layers size={9} />{geoLabel[g] || g}</span>
                ))}
                {m.kanon && <span title="Protege privacidad (k-anon ≥3)" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#4ADE80', background: 'rgba(74,222,128,0.1)', borderRadius: 5, padding: '2px 6px' }}><Shield size={9} />privacidad</span>}
                {m.status === 'stub' && <span title="El motor existe, espera datos" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#FCD34D', background: 'rgba(251,191,36,0.1)', borderRadius: 5, padding: '2px 6px' }}>en preparación</span>}
              </div>
              {m.lineage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 9, fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.4)', lineHeight: 1.4 }}>
                  <Database size={10} style={{ flexShrink: 0 }} /> {m.lineage}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {metrics.length === 0 && <div style={{ padding: 20, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Sin indicadores para ese filtro.</div>}
    </div>
  );
}
