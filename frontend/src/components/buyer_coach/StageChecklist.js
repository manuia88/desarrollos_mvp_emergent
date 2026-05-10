// W4.14 — StageChecklist · lista de verificación por etapa
import React, { useState, useEffect } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const LS_KEY = (convId, stage) => `dmx_bc_checklist_${convId}_${stage}`;

export default function StageChecklist({ conversationId, stageNum }) {
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stageNum) return;
    setLoading(true);
    const lsKey = LS_KEY(conversationId, stageNum);
    const savedChecked = JSON.parse(localStorage.getItem(lsKey) || '{}');
    setChecked(savedChecked);

    fetch(`${API}/api/buyer-coach/${conversationId}/stage/${stageNum}/checklist`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.items && setItems(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conversationId, stageNum]);

  const toggle = (id) => {
    const newChecked = { ...checked, [id]: !checked[id] };
    setChecked(newChecked);
    localStorage.setItem(LS_KEY(conversationId, stageNum), JSON.stringify(newChecked));
  };

  const handlePrint = () => {
    const text = items.map((it, i) => `${i + 1}. [${checked[it.id] ? 'x' : ' '}] ${it.label}`).join('\n');
    const win = window.open('', '_blank');
    win.document.write(`<pre style="font-family:Arial;font-size:14px;padding:24px">${text}</pre>`);
    win.print();
    win.close();
  };

  if (loading) return (
    <div style={{ padding: 12, color: 'var(--cream-3)', fontSize: 12 }}>Cargando checklist...</div>
  );

  if (!items.length) return null;

  const doneCount = items.filter(it => checked[it.id]).length;

  return (
    <div
      data-testid={`buyer-coach-checklist-${stageNum}`}
      style={{
        background: 'rgba(13,16,23,0.9)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, padding: '14px 16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: 'var(--cream)' }}>
          Checklist · {doneCount}/{items.length}
        </span>
        <button
          onClick={handlePrint}
          style={{
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
            padding: '3px 10px', borderRadius: 9999, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: 'var(--cream-3)',
          }}
        >
          Imprimir
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 9999,
          background: 'linear-gradient(90deg, #6366F1, #EC4899)',
          width: `${(doneCount / items.length) * 100}%`,
          transition: 'width 0.3s',
        }} />
      </div>

      {items.map(item => (
        <label
          key={item.id}
          style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '6px 0', cursor: 'pointer',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}
        >
          <input
            type="checkbox"
            checked={!!checked[item.id]}
            onChange={() => toggle(item.id)}
            style={{ width: 13, height: 13, marginTop: 1, accentColor: '#6366F1', flexShrink: 0 }}
          />
          <span style={{
            fontFamily: 'DM Sans', fontSize: 12, color: checked[item.id] ? 'var(--cream-3)' : 'var(--cream)',
            lineHeight: 1.5, textDecoration: checked[item.id] ? 'line-through' : 'none',
            transition: 'color 0.2s',
          }}>
            {item.label}
          </span>
        </label>
      ))}
    </div>
  );
}
