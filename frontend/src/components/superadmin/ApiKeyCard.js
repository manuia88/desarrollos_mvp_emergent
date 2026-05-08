// W3.5 — ApiKeyCard
import React from 'react';
import { Badge } from '../advisor/primitives';

const TIER_TONES = { free: 'muted', pro: 'brand', enterprise: 'pink' };
const STATUS_TONES = { active: 'ok', revoked: 'bad', paused: 'warn' };

export default function ApiKeyCard({ keyDoc, onClick, onRevoke }) {
  const quota = keyDoc.monthly_quota_calls || 0;
  const used = keyDoc.calls_this_month || 0;
  const pct = Math.min(100, quota > 0 ? Math.round((used / quota) * 100) : 0);

  return (
    <tr data-testid={`api-key-row-${keyDoc.id}`}
      onClick={() => onClick?.(keyDoc)}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
      <Td>
        <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{keyDoc.tenant_id}</div>
        <code style={{ color: 'var(--cream-3)', fontSize: 11 }}>{keyDoc.key_prefix}…</code>
      </Td>
      <Td><Badge tone={TIER_TONES[keyDoc.tier] || 'muted'}>{keyDoc.tier}</Badge></Td>
      <Td>
        <div style={{ width: 140 }}>
          <div style={{ height: 5, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: pct >= 90 ? '#fca5a5' : pct >= 60 ? '#fcd34d' : '#86efac',
            }} />
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 3 }}>
            {used.toLocaleString('es-MX')} / {quota.toLocaleString('es-MX')}
          </div>
        </div>
      </Td>
      <Td>{keyDoc.contact_email || '—'}</Td>
      <Td>{(keyDoc.last_used_at || '').slice(0, 19).replace('T', ' ') || 'nunca'}</Td>
      <Td><Badge tone={STATUS_TONES[keyDoc.status] || 'muted'}>{keyDoc.status}</Badge></Td>
      <Td>
        {keyDoc.status === 'active' && (
          <button data-testid={`api-key-revoke-${keyDoc.id}-btn`}
            onClick={(e) => { e.stopPropagation(); onRevoke?.(keyDoc); }}
            style={{
              padding: '4px 12px', borderRadius: 9999,
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.34)',
              color: '#fca5a5', cursor: 'pointer',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5,
            }}>Revocar</button>
        )}
      </Td>
    </tr>
  );
}

function Td({ children }) {
  return (<td style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cream-2)', verticalAlign: 'middle' }}>{children}</td>);
}
