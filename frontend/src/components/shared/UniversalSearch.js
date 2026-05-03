/**
 * Phase 4 Batch 0 — UniversalSearch
 * Cmd+K command palette with multi-type results.
 * Backend: GET /api/search?q=&types=
 * Recent searches stored in localStorage (10 max).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Clock, Building2, MapPin, Users, Home, Briefcase, ArrowRight } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const STORAGE_KEY = 'dmx_recent_searches';
const TYPE_ICONS = {
  development: Building2,
  colonia:     MapPin,
  lead:        Users,
  unit:        Home,
  asesor:      Briefcase,
  project:     Building2,
};
const TYPE_LABELS = {
  development: 'Desarrollos',
  colonia:     'Colonias',
  lead:        'Leads',
  unit:        'Unidades',
  asesor:      'Asesores',
  project:     'Proyectos',
};

function getRecent() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function addRecent(q) {
  if (!q?.trim()) return;
  const prev = getRecent().filter(s => s !== q);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([q, ...prev].slice(0, 10)));
}

export function UniversalSearch({ onClose, user }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(getRecent());
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef(null);

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});
  const flatList = results;

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // ESC closes
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}&limit=15`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  // Keyboard navigation
  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatList[activeIdx];
      if (item) navigateTo(item);
      else if (query.trim()) searchRecent(query);
    }
  };

  const navigateTo = (item) => {
    addRecent(query);
    setRecent(getRecent());
    navigate(item.url);
    onClose();
  };

  const searchRecent = (q) => {
    addRecent(q);
    setRecent(getRecent());
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="universal-search-modal"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative w-full max-w-xl mx-4 rounded-2xl bg-[rgba(13,16,23,0.92)] border border-[rgba(255,255,255,0.16)] backdrop-blur-[24px] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(240,235,224,0.08)]">
          <Search size={17} className="text-[rgba(240,235,224,0.4)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
            onKeyDown={handleKey}
            placeholder="Buscar proyectos, colonias, leads…"
            className="flex-1 bg-transparent text-[var(--cream)] placeholder-[rgba(240,235,224,0.3)] outline-none text-sm"
            data-testid="universal-search-input"
          />
          {loading && (
            <span className="w-4 h-4 border-2 border-[rgba(240,235,224,0.2)] border-t-[var(--cream)] rounded-full animate-spin" />
          )}
          <button onClick={onClose} className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length >= 2 && results.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-[rgba(240,235,224,0.4)] text-sm">
              Sin resultados para "{query}"
            </div>
          )}

          {query.length >= 2 && results.length > 0 && (
            <div className="py-2">
              {Object.entries(grouped).map(([type, items]) => {
                const Icon = TYPE_ICONS[type] || Search;
                return (
                  <div key={type} className="mb-1">
                    <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-[rgba(240,235,224,0.3)]">
                      {TYPE_LABELS[type] || type}
                    </div>
                    {items.map((item, i) => {
                      const globalIdx = flatList.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigateTo(item)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[rgba(240,235,224,0.06)] transition-colors text-left
                            ${globalIdx === activeIdx ? 'bg-[rgba(240,235,224,0.08)]' : ''}`}
                          data-testid={`search-result-${item.id}`}
                        >
                          <Icon size={14} className="text-[rgba(240,235,224,0.4)] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[var(--cream)] text-sm truncate">{item.label}</p>
                            {item.sub && <p className="text-[rgba(240,235,224,0.4)] text-xs truncate">{item.sub}</p>}
                          </div>
                          <ArrowRight size={12} className="text-[rgba(240,235,224,0.2)] shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent searches */}
          {!query && recent.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-[rgba(240,235,224,0.3)]">
                Recientes
              </div>
              {recent.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[rgba(240,235,224,0.06)] transition-colors text-left"
                >
                  <Clock size={13} className="text-[rgba(240,235,224,0.3)] shrink-0" />
                  <span className="text-[rgba(240,235,224,0.65)] text-sm truncate">{r}</span>
                </button>
              ))}
            </div>
          )}

          {!query && recent.length === 0 && (
            <div className="px-4 py-8 text-center text-[rgba(240,235,224,0.3)] text-sm">
              Escribe para buscar proyectos, colonias, leads…
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[rgba(240,235,224,0.06)] text-[10px] text-[rgba(240,235,224,0.25)]">
          <span><kbd className="px-1 rounded bg-[rgba(240,235,224,0.08)]">↑↓</kbd> navegar</span>
          <span><kbd className="px-1 rounded bg-[rgba(240,235,224,0.08)]">↵</kbd> abrir</span>
          <span><kbd className="px-1 rounded bg-[rgba(240,235,224,0.08)]">esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}

export default UniversalSearch;
