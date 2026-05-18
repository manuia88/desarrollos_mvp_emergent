// W5.FF3 · FeatureMatrixGrid — grid users (rows) × features (cols)
// Solo añadir · cero hex hardcoded · usa var(--theme*) y var(--cream*).
import React from 'react';
import { Check, X } from 'lucide-react';

function cellStyle(active) {
  return {
    width: 40,
    height: 28,
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: active ? 'rgba(var(--theme-rgb), 0.22)' : 'rgba(255,255,255,0.03)',
    border: active ? '1px solid rgba(var(--theme-rgb), 0.45)' : '1px solid var(--border)',
    color: active ? 'var(--theme-2)' : 'var(--cream-3)',
    transition: 'all 0.15s',
  };
}

const HEADER_CELL = {
  fontFamily: 'DM Sans',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--cream-2)',
  padding: '8px 6px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
  position: 'sticky',
  top: 0,
  background: 'var(--bg)',
  zIndex: 2,
};

const ROW_LABEL = {
  fontFamily: 'DM Sans',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--cream)',
  padding: '8px 12px',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
  position: 'sticky',
  left: 0,
  background: 'var(--bg)',
  zIndex: 1,
};

const ROW_META = {
  fontFamily: 'DM Sans',
  fontSize: 10,
  color: 'var(--cream-3)',
  marginTop: 2,
};

export default function FeatureMatrixGrid({ users, catalog, onToggle, busyKey }) {
  if (!users || users.length === 0 || !catalog || catalog.length === 0) {
    return (
      <div style={{
        padding: 28,
        textAlign: 'center',
        color: 'var(--cream-3)',
        fontFamily: 'DM Sans',
        fontSize: 13,
      }}>
        Sin datos para mostrar.
      </div>
    );
  }
  return (
    <div style={{
      overflowX: 'auto',
      overflowY: 'auto',
      maxHeight: '64vh',
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
    }}>
      <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ ...HEADER_CELL, textAlign: 'left', padding: '8px 14px', position: 'sticky', left: 0, zIndex: 3 }}>
              Usuario
            </th>
            {catalog.map(f => (
              <th key={f.key} style={HEADER_CELL} title={`${f.name} · ${f.plan_tier} · ${f.category}`}>
                <div style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name}
                </div>
                <div style={{ fontSize: 9, fontWeight: 500, color: 'var(--cream-3)', marginTop: 2 }}>
                  {f.plan_tier}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.user_id} data-testid={`matrix-row-${u.user_id}`}>
              <td style={ROW_LABEL}>
                <div>{u.name || u.email || u.user_id}</div>
                <div style={ROW_META}>
                  {u.email} · <span style={{ color: 'var(--theme-2)' }}>{u.tier}</span>
                </div>
              </td>
              {catalog.map(f => {
                const active = (u.features_enabled || []).includes(f.key);
                const cellKey = `${u.user_id}:${f.key}`;
                const isBusy = busyKey === cellKey;
                return (
                  <td key={f.key} style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    <div
                      role="checkbox"
                      aria-checked={active}
                      tabIndex={0}
                      data-testid={`cell-${u.user_id}-${f.key}`}
                      style={{
                        ...cellStyle(active),
                        opacity: isBusy ? 0.4 : 1,
                        pointerEvents: isBusy ? 'none' : 'auto',
                      }}
                      onClick={() => onToggle && onToggle(u, f, !active)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggle && onToggle(u, f, !active);
                        }
                      }}
                    >
                      {active ? <Check size={14} /> : <X size={12} />}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
