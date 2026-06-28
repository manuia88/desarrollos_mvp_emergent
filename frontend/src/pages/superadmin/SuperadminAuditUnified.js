// Superadmin · ACTIVIDAD UNIFICADA — toda la actividad de los 3 portales en UN timeline.
// Cierra la fragmentación de trails: audit_log + developer_audit + lead_events + price_events + engagement_events,
// normalizados y mezclados por tiempo, tagueados por fuente. Responde "¿toda acción de los portales se ve aquí?".
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import { listUnified } from '../../api/superadminAudit';

const SOURCE_LABEL = {
  audit_log: 'Mutaciones (central)', developer_audit: 'Dev · ediciones', lead_events: 'Asesor · actividad',
  price_events: 'Dev · precios', engagement_events: 'Marketplace · engagement',
};
const SOURCE_TONE = { audit_log: 'neutral', developer_audit: 'ok', lead_events: 'warn', price_events: 'bad', engagement_events: 'ok' };
const PORTAL_OF = { audit_log: 'todos', developer_audit: 'dev', price_events: 'dev', lead_events: 'asesor', engagement_events: 'marketplace' };

function fmt(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T'));
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ts.slice(0, 16); }
}

const PAGE = 50;

export default function SuperadminAuditUnified() {
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');     // '' = todas
  const [byAi, setByAi] = useState('');         // '', 'true', 'false'

  const load = useCallback(async (reset = true) => {
    setLoading(true);
    try {
      const f = { limit: PAGE, skip: reset ? 0 : skip + PAGE };
      if (source) f.source = source;
      if (byAi) f.by_ai = byAi;
      const r = await listUnified(f);
      setData(r);
      setItems((prev) => (reset ? r.entries || [] : [...prev, ...(r.entries || [])]));
      setSkip(reset ? 0 : skip + PAGE);
    } catch (e) { setData({ error: e.message }); }
    finally { setLoading(false); }
  }, [source, byAi, skip]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [source, byAi]);

  const sources = data?.sources || {};
  const totalEventos = Object.values(sources).reduce((a, b) => a + b, 0);

  return (
    <SuperadminLayout>
      <PageHeader
        title="Actividad unificada"
        sub="Toda la actividad de los 3 portales en un solo timeline — antes estaba fragmentada en trails por-portal."
      />

      {/* resumen de trails */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(sources).map(([s, n]) => (
          <Card key={s} style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{n.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{SOURCE_LABEL[s] || s}</div>
          </Card>
        ))}
        {totalEventos > 0 && (
          <Card style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--theme)' }}>{totalEventos.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: '#888' }}>eventos · {data?.total_trails || 0} trails</div>
          </Card>
        )}
      </div>

      {/* filtros */}
      <Card style={{ padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#888', marginRight: 4 }}>Fuente:</span>
          {['', ...(data?.available_sources || Object.keys(sources))].map((s) => (
            <button key={s || 'all'} onClick={() => setSource(s)}
              style={{ padding: '4px 10px', borderRadius: 9999, fontSize: 12, cursor: 'pointer',
                border: source === s ? '1px solid var(--theme)' : '1px solid rgba(255,255,255,0.12)',
                background: source === s ? 'rgba(var(--theme-rgb),0.12)' : 'transparent', color: source === s ? 'var(--theme)' : '#999' }}>
              {s ? (SOURCE_LABEL[s] || s) : 'Todas'}
            </button>
          ))}
          <span style={{ fontSize: 12, color: '#888', margin: '0 4px 0 12px' }}>Autor:</span>
          {[['', 'Todos'], ['false', 'Humano'], ['true', 'IA']].map(([v, l]) => (
            <button key={v || 'a'} onClick={() => setByAi(v)}
              style={{ padding: '4px 10px', borderRadius: 9999, fontSize: 12, cursor: 'pointer',
                border: byAi === v ? '1px solid var(--theme)' : '1px solid rgba(255,255,255,0.12)',
                background: byAi === v ? 'rgba(var(--theme-rgb),0.12)' : 'transparent', color: byAi === v ? 'var(--theme)' : '#999' }}>
              {l}
            </button>
          ))}
        </div>
      </Card>

      {data?.error && <Card style={{ padding: 20, color: '#dc2626' }}>Error: {data.error}</Card>}
      {!data?.error && items.length === 0 && !loading && <Empty title="Sin actividad para este filtro." />}

      <Card style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#888', background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '8px 12px' }}>Cuándo</th>
                <th style={{ padding: '8px 12px' }}>Fuente</th>
                <th style={{ padding: '8px 12px' }}>Portal</th>
                <th style={{ padding: '8px 12px' }}>Autor</th>
                <th style={{ padding: '8px 12px' }}>Acción</th>
                <th style={{ padding: '8px 12px' }}>Entidad</th>
                <th style={{ padding: '8px 12px' }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '7px 12px', whiteSpace: 'nowrap', color: '#999' }}>{fmt(e.ts)}</td>
                  <td style={{ padding: '7px 12px' }}><Badge tone={SOURCE_TONE[e.source] || 'neutral'}>{SOURCE_LABEL[e.source] || e.source}</Badge></td>
                  <td style={{ padding: '7px 12px', color: '#888', fontSize: 12 }}>{PORTAL_OF[e.source] || '—'}</td>
                  <td style={{ padding: '7px 12px' }}>
                    {(e.actor?.by_ai) ? <Badge tone="ok">IA</Badge> : null} {e.actor?.role || '—'}
                  </td>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 12 }}>{e.action || '—'}</td>
                  <td style={{ padding: '7px 12px', color: '#aaa', fontSize: 12 }}>{e.entity_type}/{String(e.entity_id || '').slice(0, 18)}</td>
                  <td style={{ padding: '7px 12px', color: '#888', fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button onClick={() => load(false)} disabled={loading}
          style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#aaa', cursor: 'pointer' }}>
          {loading ? 'Cargando…' : 'Cargar más'}
        </button>
      </div>
    </SuperadminLayout>
  );
}
