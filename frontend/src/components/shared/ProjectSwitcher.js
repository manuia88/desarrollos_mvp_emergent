/**
 * Batch 18 Sub-A — <ProjectSwitcher>
 *
 * Topbar dropdown for /desarrollador/* routes.
 * - Reads current project from URL (/proyectos/:slug) or prefs.last_project_id.
 * - Dropdown 360px: search (debounce 200ms) + Recientes + Todos.
 * - Each item: cover thumbnail + name + zona + HealthScoreWidget size=sm.
 * - Click item: navigate + push to recent_project_ids via API.
 * - Cmd+P (Mac) / Ctrl+P (Win) opens dropdown and focuses search.
 * - Mobile (≤430px): fullscreen modal.
 * - Empty 0 projects: SmartEmptyState type="projects_empty".
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Search, Building, X } from 'lucide-react';
import { HealthScoreWidget } from './HealthScoreWidget';
import { SmartEmptyState } from './SmartEmptyState';
import { pushRecentProject, getMyPreferences } from '../../api/preferences18';
import { listProjectsWithStats } from '../../api/developer';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function isMobile() {
  return window.innerWidth <= 430;
}

// ─── Single project item row ──────────────────────────────────────────────────
function ProjectItem({ project, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      data-testid={`switcher-item-${project.id}`}
      onClick={() => onClick(project.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', background: hover ? 'rgba(240,235,224,0.06)' : 'transparent',
        border: 'none', padding: '8px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        textAlign: 'left', transition: 'background 0.1s',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 36, height: 36, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
        background: 'rgba(240,235,224,0.08)', border: '1px solid rgba(240,235,224,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {project.cover_photo ? (
          <img
            src={project.cover_photo}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <Building size={15} color="rgba(240,235,224,0.25)" />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--cream)',
          fontFamily: 'DM Sans, sans-serif',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.name}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--cream-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.colonia || ''}
        </div>
      </div>

      {/* Health badge */}
      <div style={{ flexShrink: 0 }}>
        <HealthScoreWidget
          entity_type="project"
          entity_id={project.id}
          size="sm"
          initialScore={project.health_score || 0}
          showAlerts={false}
          showTrend={false}
        />
      </div>
    </button>
  );
}

// ─── Dropdown content ─────────────────────────────────────────────────────────
function SwitcherDropdown({ projects, recentIds, onSelect, onClose, searchRef }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);

  const recentProjects = recentIds
    .map(id => projects.find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 5);

  const allFiltered = projects
    .filter(p =>
      !debouncedQuery ||
      p.name?.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      (p.colonia || '').toLowerCase().includes(debouncedQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);

  const showEmpty = projects.length === 0;

  return (
    <div data-testid="project-switcher-dropdown" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <div style={{
        padding: '10px 12px', borderBottom: '1px solid rgba(240,235,224,0.08)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Search size={14} color="rgba(240,235,224,0.35)" style={{ flexShrink: 0 }} />
        <input
          ref={searchRef}
          data-testid="switcher-search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar proyecto…"
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: 'var(--cream)', fontSize: 13, outline: 'none',
            fontFamily: 'DM Sans, sans-serif',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 0 }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 420 }}>
        {showEmpty ? (
          <div style={{ padding: 16 }}>
            <SmartEmptyState contextKey="projects_empty" compact />
          </div>
        ) : (
          <>
            {/* Recientes */}
            {!debouncedQuery && recentProjects.length > 0 && (
              <div>
                <div style={{
                  padding: '8px 12px 4px',
                  fontSize: 10, fontWeight: 700, color: 'var(--cream-3)',
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                }}>
                  Recientes
                </div>
                {recentProjects.map(p => (
                  <ProjectItem key={`r-${p.id}`} project={p} onClick={onSelect} />
                ))}
                <div style={{ margin: '6px 12px', borderTop: '1px solid rgba(240,235,224,0.07)' }} />
              </div>
            )}

            {/* Todos */}
            <div>
              <div style={{
                padding: '8px 12px 4px',
                fontSize: 10, fontWeight: 700, color: 'var(--cream-3)',
                letterSpacing: '0.07em', textTransform: 'uppercase',
              }}>
                {debouncedQuery ? `Resultados (${allFiltered.length})` : 'Todos'}
              </div>
              {allFiltered.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--cream-3)', textAlign: 'center' }}>
                  Sin resultados para "{debouncedQuery}"
                </div>
              ) : (
                allFiltered.map(p => (
                  <ProjectItem key={p.id} project={p} onClick={onSelect} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ProjectSwitcher({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [recentIds, setRecentIds] = useState([]);
  const [lastProjectId, setLastProjectId] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  // Extract current project slug from URL (/proyectos/:slug)
  const urlMatch = location.pathname.match(/\/proyectos\/([^/?]+)/);
  const currentSlug = urlMatch ? urlMatch[1] : lastProjectId;
  const currentProject = projects.find(p => p.id === currentSlug);
  const displayName = currentProject?.name || (currentSlug ? currentSlug : 'Mis proyectos');

  // Load projects + recent prefs
  const loadData = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const [projs, prefs] = await Promise.all([
        listProjectsWithStats().catch(() => []),
        getMyPreferences().catch(() => ({})),
      ]);
      setProjects(projs || []);
      setRecentIds(prefs.recent_project_ids || []);
      setLastProjectId(prefs.last_project_id || null);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  // Load on open
  useEffect(() => {
    if (open && projects.length === 0) {
      loadData();
    } else if (open) {
      // Refresh recent from prefs
      getMyPreferences()
        .then(p => setRecentIds(p.recent_project_ids || []))
        .catch(() => {});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Cmd+P / Ctrl+P shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = useCallback(async (projectId) => {
    setOpen(false);
    // Push to recents
    try {
      const result = await pushRecentProject(projectId);
      setRecentIds(result.recent_project_ids || []);
    } catch (_) {}
    navigate(`/desarrollador/proyectos/${projectId}`);
  }, [navigate]);

  const mobile = isMobile();

  // ─── Trigger button ─────────────────────────────────────────────────────
  const triggerButton = (
    <button
      data-testid="project-switcher-btn"
      onClick={() => setOpen(o => !o)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: open ? 'rgba(99,102,241,0.14)' : 'rgba(240,235,224,0.06)',
        border: `1px solid ${open ? 'rgba(99,102,241,0.40)' : 'rgba(240,235,224,0.12)'}`,
        borderRadius: 8, padding: '6px 10px',
        cursor: 'pointer', transition: 'all 0.15s',
        maxWidth: 220,
      }}
      title="Cambiar proyecto (Cmd+P)"
    >
      <Building size={13} color={open ? '#818CF8' : 'rgba(240,235,224,0.5)'} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: 12, fontWeight: 600, color: open ? '#a5b4fc' : 'var(--cream-2)',
        fontFamily: 'DM Sans, sans-serif',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: 160,
      }}>
        {loadingProjects ? '…' : displayName}
      </span>
      <ChevronDown
        size={12}
        color="rgba(240,235,224,0.35)"
        style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s' }}
      />
    </button>
  );

  // ─── Dropdown (desktop) ──────────────────────────────────────────────────
  const dropdown = open && !mobile && (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      width: 360,
      background: 'rgba(13,16,23,0.98)',
      border: '1px solid rgba(240,235,224,0.14)',
      borderRadius: 12,
      overflow: 'hidden',
      backdropFilter: 'blur(16px)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
      zIndex: 1000,
    }}>
      <SwitcherDropdown
        projects={projects}
        recentIds={recentIds}
        onSelect={handleSelect}
        onClose={() => setOpen(false)}
        searchRef={searchRef}
      />
    </div>
  );

  // ─── Mobile fullscreen modal ─────────────────────────────────────────────
  const mobileModal = open && mobile && (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
        display: 'flex', flexDirection: 'column',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        data-testid="project-switcher-modal"
        onClick={e => e.stopPropagation()}
        style={{
          flex: 1, background: '#0b0e18',
          borderTop: '1px solid rgba(240,235,224,0.12)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '90vh', overflowY: 'auto',
          marginTop: 'auto', borderRadius: '16px 16px 0 0',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', borderBottom: '1px solid rgba(240,235,224,0.08)',
        }}>
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>
            Cambiar proyecto
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
        <SwitcherDropdown
          projects={projects}
          recentIds={recentIds}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          searchRef={searchRef}
        />
      </div>
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {triggerButton}
      {dropdown}
      {mobileModal}
    </div>
  );
}

export default ProjectSwitcher;
