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
      onMouseEnter={item.done ? undefined : (e) => {
        e.currentTarget.style.borderColor = 'rgba(109,74,255,0.45)';
        e.currentTarget.style.background = 'rgba(109,74,255,0.06)';
        e.currentTarget.style.transform = 'translateX(2px)';
      }}
      onMouseLeave={item.done ? undefined : (e) => {
        e.currentTarget.style.borderColor = 'var(--border, rgba(var(--cream-rgb),0.10))';
        e.currentTarget.style.background = 'var(--surface-2, rgba(var(--cream-rgb),0.04))';
        e.currentTarget.style.transform = 'none';
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 13px', borderRadius: 10,
        background: item.done ? 'rgba(31,160,106,0.10)' : 'var(--surface-2, rgba(var(--cream-rgb),0.04))',
        border: `1px solid ${item.done ? 'rgba(31,160,106,0.3)' : 'var(--border, rgba(var(--cream-rgb),0.10))'}`,
        transition: 'all 0.16s', cursor: item.done ? 'default' : 'pointer',
        textDecoration: 'none', boxShadow: item.done ? 'none' : 'var(--asr-shadow, none)',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: item.done ? 'rgba(31,160,106,0.2)' : 'var(--surface-2, rgba(var(--cream-rgb),0.08))',
        border: `1.5px solid ${item.done ? 'var(--ok, #4ade80)' : 'var(--border-2, rgba(var(--cream-rgb),0.2))'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {item.done && <Check size={11} color="var(--ok, #4ade80)" />}
      </div>
      <span style={{
        fontSize: 12, flex: 1,
        color: item.done ? 'var(--cream-3)' : 'var(--cream)',
        textDecoration: item.done ? 'line-through' : 'none',
      }}>
        {item.label}
      </span>
      {!item.done && <ChevronRight size={12} color="var(--cream-3)" />}
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
        background: 'var(--surface, rgba(var(--cream-rgb),0.03))',
        border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))',
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--cream-3)', marginBottom: 2,
          }}>
            CONFIGURACIÓN INICIAL
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>
            {done} de {total} pasos completados
          </div>
        </div>
        <span style={{
          fontSize: 18, fontWeight: 800, color: pct === 100 ? 'var(--ok, #4ade80)' : 'var(--cream)',
          fontFamily: 'Outfit,sans-serif',
        }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2, rgba(var(--cream-rgb),0.1))', marginBottom: 14 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
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
