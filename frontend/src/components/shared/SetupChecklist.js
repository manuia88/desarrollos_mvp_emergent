/**
 * Phase 4 Batch 14 — SetupChecklist
 * First-project onboarding checklist with 5 steps and a progress bar.
 * Hidden when all 5 items are done.
 *
 * Props: className
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

function Item({ item }) {
  const content = (
    <div
      data-testid={`setup-item-${item.key}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 8,
        background: item.done ? 'rgba(74,222,128,0.06)' : 'rgba(240,235,224,0.04)',
        border: `1px solid ${item.done ? 'rgba(74,222,128,0.2)' : 'rgba(240,235,224,0.10)'}`,
        transition: 'all 0.2s',
        textDecoration: 'none',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: item.done ? 'rgba(74,222,128,0.2)' : 'rgba(240,235,224,0.08)',
        border: `1.5px solid ${item.done ? '#4ade80' : 'rgba(240,235,224,0.2)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {item.done && <Check size={11} color="#4ade80" />}
      </div>
      <span style={{
        fontSize: 12, flex: 1,
        color: item.done ? 'rgba(240,235,224,0.45)' : 'var(--cream)',
        textDecoration: item.done ? 'line-through' : 'none',
      }}>
        {item.label}
      </span>
      {!item.done && <ChevronRight size={12} color="rgba(240,235,224,0.35)" />}
    </div>
  );

  if (item.done || !item.action_url) return content;
  return <Link to={item.action_url} style={{ textDecoration: 'none' }}>{content}</Link>;
}

export function SetupChecklist({ className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.fetch(`${API}/api/panel/setup-progress`, { credentials: 'include' });
        if (res.ok) setData(await res.json());
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  if (loading || !data || data.all_done) return null;

  const { items, done, total, pct } = data;

  return (
    <div
      className={className}
      data-testid="setup-checklist"
      style={{
        background: 'rgba(240,235,224,0.03)',
        border: '1px solid rgba(240,235,224,0.10)',
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'rgba(240,235,224,0.4)', marginBottom: 2,
          }}>
            CONFIGURACIÓN INICIAL
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>
            {done} de {total} pasos completados
          </div>
        </div>
        <span style={{
          fontSize: 18, fontWeight: 800, color: pct === 100 ? '#4ade80' : 'var(--cream)',
          fontFamily: 'Outfit,sans-serif',
        }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(240,235,224,0.1)', marginBottom: 14 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          transition: 'width 0.5s ease',
        }} />
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => <Item key={item.key} item={item} />)}
      </div>
    </div>
  );
}

export default SetupChecklist;
