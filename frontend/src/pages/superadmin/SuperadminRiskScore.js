// W3.4A — Superadmin Risk Score page
import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import { listAllScores, recompute } from '../../api/riskScore';
import RiskScoreBreakdown from '../../components/developer/RiskScoreBreakdown';

const LETTERS = { A: 'ok', B: 'ok', C: 'warn', D: 'warn', E: 'bad', F: 'bad' };

function fmt(v, dec = 1) {
  if (v == null) return '—';
  return Number(v).toFixed(dec);
}

export default function SuperadminRiskScore() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState('');
  const [drawerZone, setDrawerZone] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listAllScores({ tier: tier || undefined, limit: 100 });
      setItems(r.zones || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tier]);

  const onRecompute = async () => {
    if (busy) return; setBusy(true);
    try { await recompute(); await refresh(); } finally { setBusy(false); }
  };

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.4A · Risk Score V1"
        title="Risk Score por colonia"
        sub="V1 backed por SESNSP (crime layer). V2 W3.4B agregará CENAPRED, RPP, ENVIPE."
        actions={
          <button data-testid="risk-recompute-btn" onClick={onRecompute} disabled={busy} style={btnPrimary(busy)}>
            <RefreshCw size={14} /> {busy ? 'Recalculando…' : 'Recalcular ahora'}
          </button>
        }
      />

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tier:</span>
          {['', 'colonia', 'alcaldia'].map(t => (
            <button key={t || 'all'} data-testid={`risk-tier-${t || 'all'}`}
              onClick={() => setTier(t)}
              style={{
                padding: '5px 14px', borderRadius: 9999,
                background: tier === t ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tier === t ? 'rgba(99,102,241,0.42)' : 'rgba(255,255,255,0.10)'}`,
                color: 'var(--cream)', cursor: 'pointer',
                fontFamily: 'DM Sans', fontSize: 12,
              }}
            >{t || 'todas'}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12 }}>
            <Shield size={11} style={{ marginRight: 4 }} />
            Zonas: <span style={{ color: 'var(--cream)', fontWeight: 700 }}>{items.length}</span>
          </span>
        </div>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : items.length === 0 ? (
        <Empty title="Sin scores aún" sub="Recalcula manualmente o espera al cron diario 05:00 MX." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="risk-zones-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Zona</Th><Th>Letter</Th><Th>Score</Th>
                  <Th>Crime</Th><Th>Natural</Th><Th>Título</Th><Th>Percep.</Th>
                  <Th>Fuentes</Th><Th>Computado</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((z) => {
                  const c = z.components || {};
                  return (
                  <tr key={z.zone_id}
                    data-testid={`risk-row-${z.zone_id}`}
                    onClick={() => setDrawerZone(z)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                    <Td>
                      <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{z.zone_id}</div>
                      {z.alcaldia && <div style={{ color: 'var(--cream-3)', fontSize: 11 }}>{z.alcaldia}</div>}
                    </Td>
                    <Td>
                      {z.score_letter
                        ? <Badge tone={LETTERS[z.score_letter] || 'warn'}>{z.score_letter}</Badge>
                        : <Badge tone="warn">—</Badge>}
                    </Td>
                    <Td>{fmt(z.score_numeric, 1)}</Td>
                    <Td>{fmt(c.crime_score, 1)}</Td>
                    <Td>{fmt(c.natural_score, 1)}</Td>
                    <Td>{fmt(c.title_risk_score, 1)}</Td>
                    <Td>{fmt(c.percepcion_score, 1)}</Td>
                    <Td>{(z.sources_active || []).length}</Td>
                    <Td>{(z.computed_at || '').slice(0, 19).replace('T', ' ')}</Td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {drawerZone && (
        <div data-testid="risk-drawer-overlay" onClick={() => setDrawerZone(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(6,8,15,0.78)' }}>
          <div onClick={e => e.stopPropagation()}
            data-testid="risk-drawer"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: 'min(680px, 96vw)', overflowY: 'auto',
              background: 'rgba(13,16,23,0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.10)', padding: 24,
            }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontWeight: 800 }}>
              Risk Score · {drawerZone.zone_id}
            </h3>
            <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12, marginTop: 4, marginBottom: 18 }}>
              Breakdown V1 · SESNSP · v{drawerZone.formula_version}
            </p>
            <RiskScoreBreakdown zoneId={drawerZone.zone_id} />
          </div>
        </div>
      )}
    </SuperadminLayout>
  );
}

const btnPrimary = (busy) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 9999,
  background: busy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(90deg,#6366F1,#EC4899)',
  border: '1px solid rgba(255,255,255,0.16)',
  color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
});
function Th({ children }) {
  return (<th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</th>);
}
function Td({ children }) {
  return (<td style={{ padding: '8px 8px', fontSize: 13, color: 'var(--cream-2)', verticalAlign: 'top' }}>{children}</td>);
}
