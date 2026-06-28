// Superadmin · VISIBILIDAD TOTAL DE GRANULARIDAD
// Responde "¿se refleja toda la granularidad de los motores en superadmin?": el MAPA (qué familias de scores existen,
// cuáles fluyen, cuáles están apagadas o son efímeras) + el INSPECTOR (todos los scores de UNA entidad en un lugar).
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty, Badge } from '../../components/advisor/primitives';
import { getCoverage, getEntity } from '../../api/superadminGranularity';

const ESTADO_COLOR = { vivo: '#16a34a', apagado: '#dc2626', error: '#a16207' };

function StatCard({ label, value, color }) {
  return (
    <Card style={{ padding: 16, minWidth: 140 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#111' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{label}</div>
    </Card>
  );
}

export default function SuperadminGranularidad() {
  const [cov, setCov] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [etype, setEtype] = useState('zona');
  const [eid, setEid] = useState('');
  const [insp, setInsp] = useState(null);
  const [inspLoading, setInspLoading] = useState(false);

  useEffect(() => {
    getCoverage().then(setCov).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const inspect = async () => {
    if (!eid.trim()) return;
    setInspLoading(true); setInsp(null);
    try { setInsp(await getEntity(etype, eid.trim())); }
    catch (e) { setInsp({ error: e.message }); }
    finally { setInspLoading(false); }
  };

  const r = cov?.resumen;
  const etypes = r?.entity_types || ['zona', 'desarrollo', 'unidad', 'lead', 'asesor', 'comprador'];

  return (
    <SuperadminLayout>
      <PageHeader
        title="Visibilidad de granularidad"
        sub="Todos los scores y features de los motores, en un solo lugar — qué fluye, qué está apagado, qué es efímero."
      />
      {loading && <Card style={{ padding: 24 }}>Cargando mapa…</Card>}
      {err && <Card style={{ padding: 24, color: '#dc2626' }}>Error: {err}</Card>}

      {cov && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label="Familias persistidas" value={r.familias_persistidas} />
            <StatCard label="Vivas (fluyen)" value={r.persistidas_vivas} color={ESTADO_COLOR.vivo} />
            <StatCard label="Apagadas (no persisten)" value={r.persistidas_apagadas} color={ESTADO_COLOR.apagado} />
            <StatCard label="Efímeras (se calculan y se tiran)" value={r.familias_efimeras} color="#a16207" />
          </div>

          <Card style={{ padding: 0, marginBottom: 20 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
              Mapa de familias de scores/features
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#666', background: '#fafafa' }}>
                    <th style={{ padding: '8px 12px' }}>Estado</th>
                    <th style={{ padding: '8px 12px' }}>Familia</th>
                    <th style={{ padding: '8px 12px' }}>Portal</th>
                    <th style={{ padding: '8px 12px' }}>Entidad</th>
                    <th style={{ padding: '8px 12px' }}>Colección</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Docs</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Entidades</th>
                  </tr>
                </thead>
                <tbody>
                  {cov.familias.map((f) => (
                    <tr key={f.key} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <Badge tone={f.estado === 'vivo' ? 'ok' : f.estado === 'apagado' ? 'bad' : 'warn'}>{f.estado}</Badge>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{f.label}</td>
                      <td style={{ padding: '8px 12px', color: '#666' }}>{f.portal}</td>
                      <td style={{ padding: '8px 12px', color: '#666' }}>{f.entity_type}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#888' }}>{f.collection}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f.docs.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f.entidades.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {cov.efimeras?.length > 0 && (
            <Card style={{ padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Scores efímeros (se calculan y NO se guardan → invisibles para histórico/analítica)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {cov.efimeras.map((e) => (
                  <Badge key={e.key} tone="warn">{e.label} · {e.engine}</Badge>
                ))}
              </div>
            </Card>
          )}

          <Card style={{ padding: '14px 18px' }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Inspector de entidad — todos los scores de una entidad</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={etype} onChange={(e) => setEtype(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd' }}>
                {etypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                value={eid} onChange={(e) => setEid(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && inspect()}
                placeholder="id de la entidad (ej. polanco)"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', minWidth: 240 }}
              />
              <button onClick={inspect} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#111', color: '#fff', cursor: 'pointer' }}>
                Inspeccionar
              </button>
            </div>

            {inspLoading && <div style={{ marginTop: 14, color: '#666' }}>Consultando…</div>}
            {insp?.error && <div style={{ marginTop: 14, color: '#dc2626' }}>{insp.error}</div>}
            {insp && !insp.error && (
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 10 }}>
                  Cobertura: <strong>{insp.cobertura}</strong> familias con dato para <code>{insp.entity_type}/{insp.entity_id}</code>
                </div>
                {insp.con_dato?.length === 0 && <Empty title="Sin scores para esta entidad." />}
                {insp.con_dato?.map((fa) => (
                  <details key={fa.key} style={{ marginBottom: 8, border: '1px solid #eee', borderRadius: 8 }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', fontWeight: 500 }}>
                      <span style={{ marginRight: 8 }}><Badge tone="ok">{fa.registros}</Badge></span>
                      {fa.label} <span style={{ color: '#999', fontFamily: 'monospace', fontSize: 12 }}>· {fa.collection}</span>
                    </summary>
                    <pre style={{ margin: 0, padding: 14, background: '#0b1021', color: '#cde', fontSize: 11, overflowX: 'auto', borderRadius: '0 0 8px 8px' }}>
                      {JSON.stringify(fa.datos, null, 2)}
                    </pre>
                  </details>
                ))}
                {insp.sin_dato?.length > 0 && (
                  <div style={{ marginTop: 10, color: '#999', fontSize: 12 }}>
                    Sin dato: {insp.sin_dato.map((s) => s.label).join(' · ')}
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </SuperadminLayout>
  );
}
