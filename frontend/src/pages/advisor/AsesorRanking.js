// /asesor/ranking — leaderboard of advisors
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';
import { Shield } from '../../components/icons';

export default function AsesorRanking({ user, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getLeaderboard().then(setItems).finally(() => setLoading(false)); }, []);

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · RANKING"
        title="Ranking de asesores"
        sub="Score Elo computado de cierres + reviews. Opt-in: tu presencia en el ranking público es voluntaria."
      />

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : items.length === 0 ? <Empty title="Sin perfiles aún" />
        : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {items.map((p, i) => (
              <div key={p.user_id} data-testid={`lb-row-${p.user_id}`} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                background: i === 0 ? 'linear-gradient(90deg, rgba(99,102,241,0.08), transparent)' : 'transparent',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: i === 0 ? 'var(--grad)' : 'rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: i === 0 ? '#fff' : 'var(--cream-2)',
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>
                    {p.full_name || '—'}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                    {p.brokerage || '—'} {p.colonias?.length > 0 && `· Especializa en ${p.colonias.slice(0, 3).join(', ')}`}
                  </div>
                </div>
                <Badge tone="brand"><Shield size={10} /> {p.cierres_total} cierres</Badge>
                <div style={{ textAlign: 'right', minWidth: 80 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    {p.score_elo}
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Elo</div>
                </div>
              </div>
            ))}
          </Card>
        )}
    </AdvisorLayout>
  );
}
