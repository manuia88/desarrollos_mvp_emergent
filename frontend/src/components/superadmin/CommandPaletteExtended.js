// W2.6 SA8 — Cmd+K extended palette for superadmin (overlays UniversalSearch B0)
// Uses /api/superadmin/founder-console/commands?q= with 200ms debounce.
// Recent commands persisted in localStorage (top 10).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, ArrowRight,
  LayoutDashboard, Users, Layers, DollarSign, Briefcase, Shield, Activity,
  Plug, Eye, FolderOpen, FolderUp, BarChart3, RefreshCw, AlertCircle, Clock,
  UserCheck, Camera, Star,
} from 'lucide-react';
import { searchCommands, executeCommand } from '../../api/superadminFounderConsole';
import { Z } from '../../styles/zIndex';

const ICON_MAP = {
  LayoutDashboard, Users, Layers, DollarSign, Briefcase, Shield, Activity,
  Plug, Eye, FolderOpen, FolderUp, BarChart3, RefreshCw, AlertCircle, Clock,
  UserCheck, Camera, Star,
};

const RECENTS_KEY = 'dmx_founder_recents_v1';
const API = process.env.REACT_APP_BACKEND_URL;

function loadRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function pushRecent(cmd) {
  try {
    const cur = loadRecents().filter(c => c.id !== cmd.id);
    cur.unshift({ id: cmd.id, label: cmd.label, category: cmd.category,
                  icon_key: cmd.icon_key });
    localStorage.setItem(RECENTS_KEY, JSON.stringify(cur.slice(0, 10)));
  } catch {}
}

export default function CommandPaletteExtended({ onClose }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [recents, setRecents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Initial load: recents + first 50 commands
  useEffect(() => {
    setRecents(loadRecents());
    setLoading(true);
    searchCommands('', 50).then(r => setItems(r.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Focus input
  useEffect(() => {
    inputRef.current && inputRef.current.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      searchCommands(q, 50).then(r => {
        setItems(r.items || []);
        setActiveIdx(0);
      }).catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  // Group by category
  const groups = useMemo(() => {
    const list = items;
    const out = {};
    list.forEach(it => {
      const cat = it.category || 'Otros';
      out[cat] = out[cat] || [];
      out[cat].push(it);
    });
    return out;
  }, [items]);

  const flatList = useMemo(() => {
    return Object.entries(groups).flatMap(([_, arr]) => arr);
  }, [groups]);

  // Show recents at top when no query
  const visibleRecents = !q.trim() && recents.length > 0 ? recents : [];

  const runCommand = async (cmd) => {
    pushRecent(cmd);
    setRecents(loadRecents());
    try {
      const result = await executeCommand(cmd.id);
      onClose && onClose();
      if (result.redirect_url) {
        if (result.method === 'POST' && result.redirect_url.startsWith('/api/')) {
          // Impersonate flow: POST to api then redirect
          await fetch(`${API}${result.redirect_url}`, {
            method: 'POST', credentials: 'include',
            headers: { Authorization: `Bearer ${localStorage.getItem('dmx_token')}` },
          });
          window.location.href = '/desarrollador';
        } else if (result.redirect_url.startsWith('/')) {
          navigate(result.redirect_url);
        }
      } else if (result.api_call) {
        const a = result.api_call;
        const url = a.url.startsWith('http') ? a.url : `${API}${a.url}`;
        await fetch(url, {
          method: a.method || 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json',
                     Authorization: `Bearer ${localStorage.getItem('dmx_token')}` },
        });
      }
    } catch (e) {
      console.warn('command exec failed', e);
    }
  };

  // Keyboard nav
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose && onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(flatList.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = flatList[activeIdx];
      if (cmd) runCommand(cmd);
    }
  };

  return (
    <div
      data-testid="command-palette-extended"
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
      onKeyDown={onKey}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(10px)',
        zIndex: Z.TOAST,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '12vh 20px 20px',
      }}>
      <div className="cmd-palette" style={{
        width: '100%', maxWidth: 720,
        background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(var(--theme-rgb),0.30)',
        borderRadius: 16, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        maxHeight: '76vh',
        boxShadow: '0 24px 60px -12px rgba(0,0,0,0.6)',
      }}>
        {/* Search input */}
        <div style={{
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <Search size={14} style={{ color: 'rgba(240,235,224,0.55)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            data-testid="cmd-palette-input"
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Comando, tenant, ruta…  (↑↓ navega · Enter ejecuta · Esc cierra)"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14,
            }}
          />
          <span style={{
            padding: '3px 9px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            fontFamily: 'DM Mono, monospace', fontSize: 10.5,
            color: 'rgba(240,235,224,0.55)',
          }}>{loading ? '…' : `${flatList.length}`}</span>
          <button onClick={onClose}
            data-testid="cmd-palette-close"
            style={{
              padding: 4, borderRadius: 9999, background: 'transparent',
              border: 'none', cursor: 'pointer',
              color: 'rgba(240,235,224,0.55)',
            }}><X size={13} /></button>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 14px' }}>
          {visibleRecents.length > 0 && (
            <div style={{ padding: '8px 12px 4px' }}>
              <div style={{
                fontFamily: 'DM Mono, monospace', fontSize: 9.5,
                color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase',
                letterSpacing: '0.07em', marginBottom: 4, padding: '4px 8px',
              }}>Recientes</div>
              {visibleRecents.slice(0, 5).map((c) => {
                const Icon = ICON_MAP[c.icon_key] || Star;
                return (
                  <button key={`r-${c.id}`}
                    data-testid={`cmd-recent-${c.id}`}
                    onClick={() => runCommand(c)}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 9,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'rgba(240,235,224,0.75)', fontFamily: 'DM Sans',
                      fontSize: 12.5, textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 9,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Icon size={11} style={{ color: 'rgba(240,235,224,0.55)' }} />
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <span style={{
                      fontFamily: 'DM Mono, monospace', fontSize: 10,
                      color: 'rgba(240, 235, 224, 0.68)',
                    }}>{c.category}</span>
                  </button>
                );
              })}
            </div>
          )}

          {Object.entries(groups).map(([cat, arr]) => (
            <div key={cat} style={{ padding: '8px 12px 4px' }}>
              <div style={{
                fontFamily: 'DM Mono, monospace', fontSize: 9.5,
                color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase',
                letterSpacing: '0.07em', marginBottom: 4, padding: '4px 8px',
              }}>{cat}</div>
              {arr.map(it => {
                const flatI = flatList.findIndex(x => x.id === it.id);
                const active = flatI === activeIdx;
                const Icon = ICON_MAP[it.icon_key] || Star;
                return (
                  <button key={it.id}
                    data-testid={`cmd-item-${it.id}`}
                    onClick={() => runCommand(it)}
                    onMouseEnter={() => setActiveIdx(flatI)}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 9,
                      background: active ? 'rgba(var(--theme-rgb),0.14)' : 'transparent',
                      border: active ? '1px solid rgba(var(--theme-rgb),0.40)'
                                     : '1px solid transparent',
                      cursor: 'pointer', color: active ? 'var(--cream)'
                                                       : 'rgba(240,235,224,0.75)',
                      fontFamily: 'DM Sans', fontSize: 12.5, textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 9,
                      transition: 'background 120ms',
                    }}
                  >
                    <Icon size={11} style={{
                      color: active ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                    }} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {active && <ArrowRight size={11} color="var(--theme)" />}
                  </button>
                );
              })}
            </div>
          ))}

          {!loading && flatList.length === 0 && (
            <div data-testid="cmd-palette-empty" style={{
              padding: 30, textAlign: 'center', fontFamily: 'DM Sans',
              fontSize: 12.5, color: 'rgba(240, 235, 224, 0.70)',
            }}>Sin coincidencias.</div>
          )}
        </div>

        {/* Footer hints */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.07)',
          fontFamily: 'DM Mono, monospace', fontSize: 9.5,
          color: 'rgba(240, 235, 224, 0.68)',
          display: 'flex', gap: 12, flexWrap: 'wrap',
        }}>
          <span>↑↓ navegar</span>
          <span>↵ ejecutar</span>
          <span>esc cerrar</span>
          <span style={{ marginLeft: 'auto' }}>cmd+/ búsqueda universal</span>
        </div>
      </div>
    </div>
  );
}
