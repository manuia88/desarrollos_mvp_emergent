/**
 * Phase 4 Batch 0 — UniversalSearch
 * Cmd+K command palette with multi-type results.
 * Backend: GET /api/search?q=&types=
 * Recent searches stored in localStorage (10 max).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X, Clock, Building2, MapPin, Users, Home, Briefcase, ArrowRight, Sparkles, Wrench } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const STORAGE_KEY = 'dmx_recent_searches';

// P3.B · Command Bar IA — heurística: ¿la query es una PREGUNTA o COMANDO?
// Prefijos interrogativos/imperativos es-MX + signos de pregunta.
const ASK_RE = /^(¿|cómo|como|qué|que|cuál|cual|cuándo|cuando|quién|quien|dónde|donde|por qué|porque|muéstrame|muestrame|enséñame|ensename|agéndame|agendame|agenda|genera|créame|creame|crea|dame|hazme|haz|escribe|redacta|recomiéndame|recomiendame|sugiéreme|sugiereme|necesito|quiero|ayúdame|ayudame|llama|envía|envia|manda|resume|analiza|compara)\b/i;
function looksLikeQuestion(q) {
  if (!q) return false;
  const s = q.trim();
  return ASK_RE.test(s) || s.includes('?') || s.includes('¿');
}
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
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(getRecent());
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef(null);

  // P3.B · estado modo "preguntar a Atlax" (aditivo · no afecta búsqueda entidad)
  const [atlaxLoading, setAtlaxLoading] = useState(false);
  const [atlaxAnswer, setAtlaxAnswer] = useState(null);   // {reply, tools_used[]}
  const [atlaxError, setAtlaxError] = useState(false);

  // Mostrar fila Atlax: pregunta/comando explícito, o texto largo sin match de entidad.
  const q = query.trim();
  const isQuestion = looksLikeQuestion(q);
  const longNoMatch = !loading && results.length === 0 && q.length > 15;
  const showAtlax = q.length >= 2 && (isQuestion || longNoMatch);

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
      else if (showAtlax) askAtlax();          // P3.B · pregunta → Atlax
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

  // P3.B · Preguntar a Atlax — reusa endpoint /api/asistente/ask (54 tools · FAIL-OPEN).
  const askAtlax = async () => {
    const text = query.trim();
    if (!text || atlaxLoading) return;
    setAtlaxLoading(true);
    setAtlaxError(false);
    setAtlaxAnswer(null);
    addRecent(text);
    setRecent(getRecent());
    try {
      const res = await fetch(`${API}/api/asistente/ask`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok === false && !data.reply) setAtlaxError(true);
        else setAtlaxAnswer({ reply: data.reply || '', tools_used: data.tools_used || [] });
      } else {
        setAtlaxError(true);
      }
    } catch (_) {
      setAtlaxError(true);
    }
    setAtlaxLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="universal-search-modal"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative w-full max-w-xl mx-4 rounded-2xl bg-[rgba(var(--bg-rgb),0.92)] border border-[rgba(var(--cream-rgb),0.16)] backdrop-blur-[24px] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(var(--cream-rgb),0.08)]">
          <Search size={17} className="text-[rgba(var(--cream-rgb),0.4)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(-1); setAtlaxAnswer(null); setAtlaxError(false); }}
            onKeyDown={handleKey}
            placeholder="Buscar proyectos, colonias, leads…"
            className="flex-1 bg-transparent text-[var(--cream)] placeholder-[rgba(var(--cream-rgb),0.3)] outline-none text-sm"
            data-testid="universal-search-input"
          />
          {loading && (
            <span className="w-4 h-4 border-2 border-[rgba(var(--cream-rgb),0.2)] border-t-[var(--cream)] rounded-full animate-spin" />
          )}
          <button onClick={onClose} className="text-[rgba(var(--cream-rgb),0.4)] hover:text-[var(--cream)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* P3.B · Fila "Preguntar a Atlax" (aditiva · arriba de los resultados) */}
          {showAtlax && (
            <div className="px-2 pt-2">
              <button
                onClick={askAtlax}
                disabled={atlaxLoading}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border border-[rgba(124,108,255,0.35)] bg-[rgba(124,108,255,0.12)] hover:bg-[rgba(124,108,255,0.2)] transition-colors disabled:opacity-60"
                data-testid="search-ask-atlax"
              >
                <Sparkles size={15} className="text-[#a99bff] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[var(--cream)] text-sm font-medium">{t('commandBar.askAtlax', '🤖 Preguntar a Atlax')}</p>
                  <p className="text-[rgba(var(--cream-rgb),0.5)] text-xs truncate">"{q}"</p>
                </div>
                {atlaxLoading
                  ? <span className="w-4 h-4 border-2 border-[rgba(169,155,255,0.3)] border-t-[#a99bff] rounded-full animate-spin shrink-0" />
                  : <ArrowRight size={12} className="text-[rgba(169,155,255,0.6)] shrink-0" />}
              </button>

              {atlaxLoading && !atlaxAnswer && (
                <p className="px-3 py-2 text-xs text-[rgba(var(--cream-rgb),0.4)]">{t('commandBar.thinking', 'Atlax está pensando…')}</p>
              )}

              {atlaxAnswer && (
                <div className="mt-2 rounded-xl bg-[rgba(var(--cream-rgb),0.04)] border border-[rgba(var(--cream-rgb),0.08)] p-3" data-testid="atlax-answer">
                  <p className="text-[var(--cream)] text-sm whitespace-pre-wrap leading-relaxed">{atlaxAnswer.reply}</p>
                  {atlaxAnswer.tools_used && atlaxAnswer.tools_used.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-[rgba(var(--cream-rgb),0.06)] flex flex-wrap items-center gap-1.5">
                      <Wrench size={11} className="text-[rgba(var(--cream-rgb),0.35)]" />
                      <span className="text-[10px] uppercase tracking-wider text-[rgba(var(--cream-rgb),0.35)] mr-1">{t('commandBar.toolsUsed', 'Herramientas usadas')}</span>
                      {atlaxAnswer.tools_used.map((tool, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-[rgba(124,108,255,0.15)] text-[10px] text-[#a99bff]">{tool}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {atlaxError && (
                <p className="px-3 py-2 text-xs text-[#ff8f8f]" data-testid="atlax-error">{t('commandBar.error', 'Atlax no pudo responder. Intenta de nuevo.')}</p>
              )}
            </div>
          )}

          {query.length >= 2 && results.length === 0 && !loading && !showAtlax && (
            <div className="px-4 py-8 text-center text-[rgba(var(--cream-rgb),0.4)] text-sm">
              Sin resultados para "{query}"
            </div>
          )}

          {query.length >= 2 && results.length > 0 && (
            <div className="py-2">
              {Object.entries(grouped).map(([type, items]) => {
                const Icon = TYPE_ICONS[type] || Search;
                return (
                  <div key={type} className="mb-1">
                    <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-[rgba(var(--cream-rgb),0.3)]">
                      {TYPE_LABELS[type] || type}
                    </div>
                    {items.map((item, i) => {
                      const globalIdx = flatList.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigateTo(item)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[rgba(var(--cream-rgb),0.06)] transition-colors text-left
                            ${globalIdx === activeIdx ? 'bg-[rgba(var(--cream-rgb),0.08)]' : ''}`}
                          data-testid={`search-result-${item.id}`}
                        >
                          <Icon size={14} className="text-[rgba(var(--cream-rgb),0.4)] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[var(--cream)] text-sm truncate">{item.label}</p>
                            {item.sub && <p className="text-[rgba(var(--cream-rgb),0.4)] text-xs truncate">{item.sub}</p>}
                          </div>
                          <ArrowRight size={12} className="text-[rgba(var(--cream-rgb),0.2)] shrink-0" />
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
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-[rgba(var(--cream-rgb),0.3)]">
                Recientes
              </div>
              {recent.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[rgba(var(--cream-rgb),0.06)] transition-colors text-left"
                >
                  <Clock size={13} className="text-[rgba(var(--cream-rgb),0.3)] shrink-0" />
                  <span className="text-[rgba(var(--cream-rgb),0.65)] text-sm truncate">{r}</span>
                </button>
              ))}
            </div>
          )}

          {!query && recent.length === 0 && (
            <div className="px-4 py-8 text-center text-[rgba(var(--cream-rgb),0.3)] text-sm">
              Escribe para buscar proyectos, colonias, leads…
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[rgba(var(--cream-rgb),0.06)] text-[10px] text-[rgba(var(--cream-rgb),0.25)]">
          <span><kbd className="px-1 rounded bg-[rgba(var(--cream-rgb),0.08)]">↑↓</kbd> navegar</span>
          <span><kbd className="px-1 rounded bg-[rgba(var(--cream-rgb),0.08)]">↵</kbd> abrir</span>
          <span><kbd className="px-1 rounded bg-[rgba(var(--cream-rgb),0.08)]">esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}

export default UniversalSearch;
