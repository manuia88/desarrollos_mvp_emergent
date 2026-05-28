/**
 * F1 · AsesorSidebarV2 — sidebar reorganizado (34 items → 10 grupos)
 *
 * Aditivo: se renderiza dentro del <aside> de PortalLayout vía render-prop
 * `renderSidebar` SOLO cuando REACT_APP_SIDEBAR_V2 === 'true' (rollback instant).
 * Props:
 *   user      — { name, email, picture }
 *   onLogout  — callback (PortalLayout.handleLogout, impersonation-aware)
 *   badges    — { [badge_source]: number } computado en PortalLayout
 *
 * Comportamiento:
 *   · Grupo sin children → navega a `to`.
 *   · Grupo con children → navega a `to` + toggle accordion.
 *   · Auto-expande el grupo activo según la ruta actual.
 *   · Búsqueda inline filtra label de grupos + children; Enter con 1 resultado navega.
 *   · User menu al pie abre dropdown vertical hacia arriba (perfil · config · logout).
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Search, LogOut, User, Settings } from 'lucide-react';
import { ASESOR_NAV_V2 } from '../../config/navByRoleV2';

const NS = 'asesor_sidebar_v2';

// Una ruta hoja está activa si coincide exacto o es prefijo de segmento.
function matchesPath(pathname, to) {
  return pathname === to || pathname.startsWith(to + '/');
}

// Devuelve la hoja activa más específica (to más largo) en todo el sidebar.
function findActiveLeaf(pathname) {
  let best = null;
  for (const group of ASESOR_NAV_V2) {
    const leaves = group.children
      ? group.children.map(c => ({ groupKey: group.key, childKey: c.key, to: c.to }))
      : [{ groupKey: group.key, childKey: null, to: group.to }];
    for (const leaf of leaves) {
      if (matchesPath(pathname, leaf.to) && (!best || leaf.to.length > best.to.length)) {
        best = leaf;
      }
    }
  }
  return best;
}

export default function AsesorSidebarV2({ user, onLogout, badges = {} }) {
  const { t } = useTranslation(NS);
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const active = useMemo(() => findActiveLeaf(location.pathname), [location.pathname]);

  // Auto-expande el grupo activo cuando cambia la ruta.
  useEffect(() => {
    if (active?.groupKey) {
      setExpanded(prev => (prev[active.groupKey] ? prev : { ...prev, [active.groupKey]: true }));
    }
  }, [active]);

  // Cierra el user menu al hacer click fuera.
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Etiqueta traducida por grupo / child (fallback al label del config).
  const groupLabel = useCallback((g) => t(`${g.key}.label`, g.label), [t]);
  const groupDesc = useCallback((g) => t(`${g.key}.description`, g.description || ''), [t]);
  const childLabel = useCallback((g, c) => t(`${g.key}.children.${c.key}`, c.label), [t]);

  // Filtrado por búsqueda: grupo visible si su label/description matchea, o algún child.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return ASESOR_NAV_V2.map(g => ({ group: g, children: g.children || null }));
    const out = [];
    for (const g of ASESOR_NAV_V2) {
      const groupHit =
        groupLabel(g).toLowerCase().includes(q) || (groupDesc(g) || '').toLowerCase().includes(q);
      const matchedChildren = (g.children || []).filter(c => childLabel(g, c).toLowerCase().includes(q));
      if (groupHit) {
        out.push({ group: g, children: g.children || null });
      } else if (matchedChildren.length) {
        out.push({ group: g, children: matchedChildren });
      }
    }
    return out;
  }, [q, groupLabel, groupDesc, childLabel]);

  // Hojas visibles (para "1 resultado + Enter → navega").
  const visibleLeaves = useMemo(() => {
    const leaves = [];
    for (const { group, children } of filtered) {
      if (children) children.forEach(c => leaves.push(c.to));
      else leaves.push(group.to);
    }
    return leaves;
  }, [filtered]);

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter' && visibleLeaves.length === 1) {
      e.preventDefault();
      navigate(visibleLeaves[0]);
      setQuery('');
    }
  };

  const handleGroupClick = (g) => {
    if (g.children) {
      setExpanded(prev => ({ ...prev, [g.key]: !prev[g.key] }));
    }
    navigate(g.to);
  };

  const rowBase =
    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 text-left';
  const activeCls =
    'bg-gradient-to-r from-[rgba(var(--theme-rgb),0.28)] to-[rgba(var(--theme-rgb),0.08)] text-[var(--cream)] font-bold shadow-[inset_3px_0_0_var(--theme)]';
  const idleCls =
    'font-medium text-[rgba(240,235,224,0.65)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.06)]';

  const Badge = ({ count }) =>
    count > 0 ? (
      <span className="ml-auto min-w-[20px] h-5 px-1 rounded-full bg-[var(--cream)] text-[var(--navy)] text-[10px] font-bold flex items-center justify-center">
        {count > 99 ? '99+' : count}
      </span>
    ) : null;

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-[52px] border-b border-[rgba(240,235,224,0.08)] shrink-0 bg-gradient-to-r from-[rgba(var(--theme-rgb),0.18)] to-transparent">
        <span className="text-[var(--cream)] font-bold text-lg tracking-tight">DMX</span>
        <span className="text-[rgba(240,235,224,0.4)] text-xs">Asesor</span>
      </div>

      {/* Búsqueda inline */}
      <div className="px-3 py-3 shrink-0">
        <div className="flex items-center gap-2 px-3 h-9 rounded-full bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.1)] focus-within:border-[rgba(var(--theme-rgb),0.5)] transition-colors">
          <Search size={15} className="text-[rgba(240,235,224,0.5)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={t('search_placeholder')}
            aria-label={t('search_placeholder')}
            data-testid="sidebar-v2-search"
            className="flex-1 min-w-0 bg-transparent outline-none text-[var(--cream)] text-sm placeholder:text-[rgba(240,235,224,0.4)]"
          />
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 scrollbar-none" aria-label="Navegación asesor">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-xs text-[rgba(240,235,224,0.4)]">{t('no_results')}</p>
        )}
        {filtered.map(({ group, children }) => {
          const hasChildren = !!group.children;
          const isGroupActive = active?.groupKey === group.key;
          const isOpen = !!expanded[group.key] || !!q; // búsqueda fuerza expandido
          // Badge del grupo: usa su propio badge_source si lo tiene; si no, suma los
          // de sus children (surface el contador relevante en estado colapsado).
          const childBadgeSum = (group.children || []).reduce((s, c) => s + (badges[c.badge_source] || 0), 0);
          const groupBadge = group.badge_source ? (badges[group.badge_source] || 0) : childBadgeSum;
          return (
            <div key={group.key} className="mb-0.5">
              <button
                type="button"
                onClick={() => handleGroupClick(group)}
                data-testid={`nav-v2-group-${group.key}`}
                title={groupDesc(group)}
                aria-expanded={hasChildren ? isOpen : undefined}
                className={`${rowBase} ${isGroupActive && !active?.childKey ? activeCls : (isGroupActive ? 'text-[var(--cream)] font-semibold' : idleCls)}`}
              >
                <group.Icon size={18} className="shrink-0" />
                <span className="truncate">{groupLabel(group)}</span>
                {groupBadge > 0 && !hasChildren && <Badge count={groupBadge} />}
                {hasChildren && (
                  <>
                    {groupBadge > 0 && <Badge count={groupBadge} />}
                    <span className={groupBadge > 0 ? 'ml-1' : 'ml-auto'}>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </>
                )}
              </button>

              {hasChildren && isOpen && (
                <div className="mt-0.5 ml-3 pl-3 border-l border-[rgba(240,235,224,0.1)] space-y-0.5">
                  {(children || group.children).map(child => {
                    const isChildActive = isGroupActive && active?.childKey === child.key;
                    const childBadge = badges[child.badge_source] || 0;
                    return (
                      <Link
                        key={child.key}
                        to={child.to}
                        data-testid={`nav-v2-item-${child.key}`}
                        className={`${rowBase} py-1.5 ${isChildActive ? activeCls : idleCls}`}
                      >
                        <child.Icon size={16} className="shrink-0" />
                        <span className="truncate">{childLabel(group, child)}</span>
                        <Badge count={childBadge} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User menu pie · dropdown hacia arriba */}
      <div className="mt-auto border-t border-[rgba(240,235,224,0.08)] p-2 shrink-0 relative" ref={userMenuRef}>
        {userMenuOpen && (
          <div
            className="absolute left-2 right-2 bottom-full mb-1 rounded-xl bg-[rgba(13,16,23,0.96)] border border-[rgba(255,255,255,0.16)] backdrop-blur-[24px] py-1 z-50"
            data-testid="sidebar-v2-usermenu"
          >
            <Link
              to="/asesor/perfil"
              onClick={() => setUserMenuOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[rgba(240,235,224,0.7)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.06)] transition-colors text-sm"
              data-testid="sidebar-v2-profile"
            >
              <User size={14} /> {t('user_menu.profile')}
            </Link>
            <Link
              to="/asesor/perfil#config"
              onClick={() => setUserMenuOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[rgba(240,235,224,0.7)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.06)] transition-colors text-sm"
            >
              <Settings size={14} /> {t('user_menu.config')}
            </Link>
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); if (onLogout) onLogout(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[rgba(240,235,224,0.7)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.06)] transition-colors text-sm"
              data-testid="sidebar-v2-logout"
            >
              <LogOut size={14} /> {t('user_menu.logout')}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setUserMenuOpen(o => !o)}
          className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-[rgba(240,235,224,0.06)] transition-colors"
          data-testid="sidebar-v2-usermenu-btn"
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
        >
          <span className="w-8 h-8 rounded-full bg-[rgba(240,235,224,0.15)] flex items-center justify-center text-[var(--cream)] text-xs font-bold shrink-0 overflow-hidden">
            {user?.picture
              ? <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
              : (user?.name?.[0] || 'U')}
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[var(--cream)] text-xs font-medium truncate">{user?.name || 'Usuario'}</span>
            <span className="block text-[rgba(240,235,224,0.4)] text-[10px] truncate">{user?.email || ''}</span>
          </span>
          <span className="ml-auto text-[rgba(240,235,224,0.4)]">
            {userMenuOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
        </button>
      </div>
    </>
  );
}
