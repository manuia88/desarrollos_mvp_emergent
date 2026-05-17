// W5.ASR.3 Parte 1 · SmartListsSidebar — sidebar asesor con 5 presets + counters
// Auto-refresh cada 60s · mobile collapse <768px.
import React, { useCallback, useEffect, useState } from 'react';
import { Flame, Clock, AlertTriangle, Calendar, TrendingUp, ChevronDown, X } from 'lucide-react';
import { getSmartListPresets, getSmartListCounts } from '../../api/smart_lists';

const ICONS = {
  Flame, Clock, AlertTriangle, Calendar, TrendingUp,
};

const COLOR_TOKENS = {
  rose:   { bg: 'rgba(236,72,153,0.10)', bd: 'rgba(236,72,153,0.32)', fg: '#f9a8d4' },
  amber:  { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.32)', fg: '#fcd34d' },
  indigo: { bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.32)', fg: '#a5b4fc' },
  green:  { bg: 'rgba(34,197,94,0.10)',  bd: 'rgba(34,197,94,0.32)',  fg: '#86efac' },
  neutral:{ bg: 'rgba(240,235,224,0.04)', bd: 'var(--border)', fg: 'var(--cream-2)' },
};

const REFRESH_MS = 60 * 1000;

function useIsMobile() {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return m;
}

export default function SmartListsSidebar({ activePreset, onSelectPreset, onClear }) {
  const [presets, setPresets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const refreshCounts = useCallback(async () => {
    try {
      const r = await getSmartListCounts();
      setCounts(r.counts || {});
    } catch (_) {
      /* mantener counts previos */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, c] = await Promise.all([
          getSmartListPresets(),
          getSmartListCounts().catch(() => ({ counts: {} })),
        ]);
        if (cancelled) return;
        setPresets(p.presets || []);
        setCounts(c.counts || {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-refresh 60s
  useEffect(() => {
    const t = setInterval(refreshCounts, REFRESH_MS);
    return () => clearInterval(t);
  }, [refreshCounts]);

  const activeMeta = presets.find(p => p.key === activePreset);

  if (isMobile) {
    return (
      <div data-testid="smart-lists-sidebar-mobile" style={{ marginBottom: 12 }}>
        <button
          data-testid="smart-lists-mobile-toggle"
          onClick={() => setMobileOpen(v => !v)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
          }}>
          <span>
            {activeMeta ? `Smart list · ${activeMeta.label}` : 'Smart lists'}
          </span>
          <ChevronDown size={14} style={{
            transform: mobileOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}/>
        </button>
        {mobileOpen && (
          <div style={{ marginTop: 8 }}>
            <SmartListItems
              presets={presets} counts={counts} loading={loading}
              activePreset={activePreset}
              onSelectPreset={(k) => { onSelectPreset(k); setMobileOpen(false); }}
              onClear={() => { onClear(); setMobileOpen(false); }}
            />
          </div>
        )}
      </div>
    );
  }

  // Desktop: sidebar sticky
  return (
    <aside
      data-testid="smart-lists-sidebar"
      style={{
        position: 'sticky', top: 12, alignSelf: 'flex-start',
        width: 240, minWidth: 240, flexShrink: 0,
      }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        SMART LISTS
      </div>
      <SmartListItems
        presets={presets} counts={counts} loading={loading}
        activePreset={activePreset} onSelectPreset={onSelectPreset} onClear={onClear}
      />
    </aside>
  );
}

function SmartListItems({ presets, counts, loading, activePreset, onSelectPreset, onClear }) {
  if (loading && presets.length === 0) {
    return (
      <div data-testid="smart-lists-skeleton" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            height: 44, borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            opacity: 0.5,
          }}/>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {presets.map(p => {
        const Icon = ICONS[p.icon] || Flame;
        const palette = COLOR_TOKENS[p.color] || COLOR_TOKENS.neutral;
        const count = counts[p.key] ?? 0;
        const isActive = activePreset === p.key;
        return (
          <button
            key={p.key}
            data-testid={`smart-list-${p.key}`}
            onClick={() => onSelectPreset(p.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12,
              background: isActive ? palette.bg : 'transparent',
              border: `1px solid ${isActive ? palette.bd : 'var(--border)'}`,
              color: isActive ? palette.fg : 'var(--cream-2)',
              fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: 'background 0.15s, color 0.15s',
            }}
            title={p.description}>
            <Icon size={15} color={isActive ? palette.fg : 'var(--cream-3)'} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.label}
            </span>
            <span
              data-testid={`smart-list-${p.key}-count`}
              style={{
                padding: '2px 8px', borderRadius: 9999,
                background: isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                color: isActive ? palette.fg : 'var(--cream-3)',
                fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700,
                minWidth: 22, textAlign: 'center',
              }}>
              {count}
            </span>
          </button>
        );
      })}
      {activePreset && (
        <button
          data-testid="smart-list-clear-btn"
          onClick={onClear}
          style={{
            marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 9999,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 11.5,
            cursor: 'pointer', alignSelf: 'flex-start',
          }}>
          <X size={11} /> Limpiar filtro
        </button>
      )}
    </div>
  );
}
