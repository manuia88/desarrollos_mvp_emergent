// W2.4 SA5 — FeatureFlagsChecklist
import React, { useState, useEffect } from 'react';
import { Calendar, Save } from 'lucide-react';

const CATEGORY_LABEL = {
  intelligence: 'Intelligence',
  marketing: 'Marketing',
  data: 'Datos',
  ai: 'IA',
};

export default function FeatureFlagsChecklist({ catalog = [], current = [], onSave }) {
  // current: [{ feature_key, enabled, expires_at }, ...]
  const [flags, setFlags] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const m = {};
    catalog.forEach(c => {
      const cur = current.find(f => f.feature_key === c.key);
      m[c.key] = {
        enabled: !!cur?.enabled,
        expires_at: cur?.expires_at?.slice(0, 10) || '',
      };
    });
    setFlags(m);
  }, [catalog, current]);

  const grouped = catalog.reduce((acc, f) => {
    (acc[f.category] = acc[f.category] || []).push(f);
    return acc;
  }, {});

  const toggle = (k) => setFlags(s => ({ ...s, [k]: { ...s[k], enabled: !s[k].enabled } }));
  const setExpiry = (k, v) => setFlags(s => ({ ...s, [k]: { ...s[k], expires_at: v } }));

  const save = async () => {
    setBusy(true);
    try {
      const items = catalog.map(c => ({
        feature_key: c.key,
        enabled: flags[c.key]?.enabled || false,
        expires_at: flags[c.key]?.expires_at ? `${flags[c.key].expires_at}T23:59:59Z` : null,
      }));
      await onSave(items);
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="feature-flags-checklist" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Object.entries(grouped).map(([cat, feats]) => (
        <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
            {CATEGORY_LABEL[cat] || cat}
          </div>
          {feats.map(f => {
            const fl = flags[f.key] || {};
            return (
              <div key={f.key} data-testid={`feature-row-${f.key}`}
                style={{
                  padding: '10px 13px', borderRadius: 10,
                  background: fl.enabled ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${fl.enabled ? 'rgba(74,222,128,0.22)' : 'rgba(255,255,255,0.07)'}`,
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                <input type="checkbox" data-testid={`feature-check-${f.key}`}
                  checked={!!fl.enabled} onChange={() => toggle(f.key)}
                  style={{ accentColor: '#6366F1', width: 16, height: 16 }} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>
                    {f.name}
                  </div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.45)' }}>
                    {f.key} · ${f.monthly_price_mxn || 0}/mes · {f.default_plan_tier}
                  </div>
                </div>
                {fl.enabled && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Calendar size={11} color="rgba(240,235,224,0.45)" />
                    <input type="date" data-testid={`feature-exp-${f.key}`}
                      value={fl.expires_at || ''} onChange={e => setExpiry(f.key, e.target.value)}
                      style={{ padding: '4px 9px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 11, outline: 'none' }} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <button data-testid="features-save" onClick={save} disabled={busy}
        style={{ padding: '10px 20px', borderRadius: 9999, background: 'linear-gradient(90deg,#6366F1,#EC4899)', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Save size={11} /> {busy ? 'Guardando…' : 'Guardar features'}
      </button>
    </div>
  );
}
