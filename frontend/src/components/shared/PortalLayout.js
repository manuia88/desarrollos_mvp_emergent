/**
 * Phase 4 Batch 0 — PortalLayout
 * Unified layout component for all portal roles.
 * Backward-compat: DeveloperLayout/AdvisorLayout/etc become thin wrappers.
 *
 * Props:
 *   role        — 'developer_admin' | 'advisor' | 'inmobiliaria_admin' | 'superadmin' | ...
 *   user        — { name, email, picture, role }
 *   onLogout    — callback
 *   children    — page content
 *   projectSwitcherSlot — optional JSX for topbar project switcher
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link, NavLink } from 'react-router-dom';
import { navByRole } from '../../config/navByRole';
import { UniversalSearch } from './UniversalSearch';
import { NotificationsBell } from './NotificationsBell';
import ReportProblemButton from './ReportProblemButton';
import {
  ChevronDown, ChevronRight, Menu, X, Search, LogOut, User,
  ChevronLeft,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── Badge counter cache ───────────────────────────────────────────────────────
const BADGE_SOURCES = {
  crm_unread_leads:        () => fetch(`${API}/api/dev/leads/count-unread`, { credentials: 'include' }).then(r => r.json()).then(d => d.count ?? 0).catch(() => 0),
  citas_today:             () => fetch(`${API}/api/dev/citas/count-today`,  { credentials: 'include' }).then(r => r.json()).then(d => d.count ?? 0).catch(() => 0),
  projects_health_below_60: () => fetch(`${API}/api/dev/projects/count-unhealthy`, { credentials: 'include' }).then(r => r.json()).then(d => d.count ?? 0).catch(() => 0),
  asesor_contacts_new:     () => fetch(`${API}/api/asesor/contacts/count-new`,     { credentials: 'include' }).then(r => r.json()).then(d => d.count ?? 0).catch(() => 0),
};

// Role label map
const ROLE_LABELS = {
  developer_admin: 'Desarrolladora',
  developer:       'Desarrolladora',
  superadmin:      'Superadmin',
  advisor:         'Asesor',
  asesor_admin:    'Asesor Admin',
  inmobiliaria_admin: 'Inmobiliaria',
  inmobiliaria_member: 'Inmobiliaria',
  buyer:           'Comprador',
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function NavItem({ item, collapsed, badge }) {
  const location = useLocation();
  const isActive = item.end
    ? location.pathname === item.to
    : location.pathname.startsWith(item.to);

  return (
    <NavLink
      to={item.to}
      end={item.end}
      data-testid={`nav-item-${item.key}`}
      className={({ isActive: ia }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 relative group
        ${ia
          ? 'bg-[rgba(99,102,241,0.18)] text-[var(--cream)] font-semibold shadow-[inset_3px_0_0_#6366F1]'
          : 'font-medium text-[rgba(240,235,224,0.65)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.06)]'}`
      }
    >
      <item.Icon size={17} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge > 0 && (
        <span className="ml-auto min-w-[20px] h-5 px-1 rounded-full bg-[var(--cream)] text-[var(--navy)] text-[10px] font-bold flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {collapsed && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--cream)] text-[var(--navy)] text-[9px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {collapsed && (
        <span className="absolute left-full ml-2 px-2 py-1 rounded bg-[var(--navy)] border border-[rgba(240,235,224,0.15)] text-[var(--cream)] text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
          {item.label}
        </span>
      )}
    </NavLink>
  );
}

function NavTier({ tier, collapsed, badges }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-1 text-[10px] font-semibold tracking-widest uppercase text-[rgba(240,235,224,0.35)] hover:text-[rgba(240,235,224,0.55)] transition-colors"
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {tier.label}
        </button>
      )}
      {(open || collapsed) && (
        <div className="space-y-0.5 mt-0.5">
          {tier.items.map(item => (
            <NavItem
              key={item.key}
              item={item}
              collapsed={collapsed}
              badge={badges[item.badge_source] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main PortalLayout ─────────────────────────────────────────────────────────
export function PortalLayout({ role, user, onLogout, children, projectSwitcherSlot }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const tiers = navByRole[role] || navByRole['buyer'] || [];

  // Load badge counts
  useEffect(() => {
    const sources = new Set(tiers.flatMap(t => t.items.map(i => i.badge_source).filter(Boolean)));
    if (!sources.size) return;
    const load = async () => {
      const result = {};
      await Promise.all([...sources].map(async src => {
        const fn = BADGE_SOURCES[src];
        if (fn) result[src] = await fn();
      }));
      setBadges(result);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [role]);

  // Global Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close mobile sidebar on route change
  const location = useLocation();
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (_) {}
    if (onLogout) onLogout();
    navigate('/');
  }, [onLogout, navigate]);

  const sidebarContent = (
    <>
      {/* Logo area */}
      <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'} py-5 border-b border-[rgba(240,235,224,0.08)] mb-3`}>
        {!collapsed ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[var(--cream)] font-bold text-lg tracking-tight">DMX</span>
            <span className="text-[rgba(240,235,224,0.4)] text-xs truncate">{ROLE_LABELS[role] || role}</span>
          </div>
        ) : (
          <span className="text-[var(--cream)] font-bold text-sm">D</span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] transition-colors hidden md:flex"
          data-testid="sidebar-collapse-btn"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Nav tiers */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-2 scrollbar-none">
        {tiers.map(tier => (
          <NavTier key={tier.tier} tier={tier} collapsed={collapsed} badges={badges} />
        ))}
      </nav>

      {/* User section */}
      <div className={`mt-auto border-t border-[rgba(240,235,224,0.08)] p-2 ${collapsed ? 'flex justify-center' : ''}`}>
        {!collapsed ? (
          <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-[rgba(240,235,224,0.06)] transition-colors">
            <div className="w-8 h-8 rounded-full bg-[rgba(240,235,224,0.15)] flex items-center justify-center text-[var(--cream)] text-xs font-bold shrink-0">
              {user?.picture
                ? <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                : (user?.name?.[0] || 'U')}
            </div>
            <div className="min-w-0">
              <p className="text-[var(--cream)] text-xs font-medium truncate">{user?.name || 'Usuario'}</p>
              <p className="text-[rgba(240,235,224,0.4)] text-[10px] truncate">{user?.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="ml-auto text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] transition-colors"
              title="Cerrar sesión"
              data-testid="sidebar-logout-btn"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="text-[rgba(240,235,224,0.4)] hover:text-[var(--cream)] transition-colors p-1"
            title="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[var(--navy)] overflow-hidden" data-testid="portal-layout">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-[#0b0e18] border-r border-[rgba(240,235,224,0.08)] transition-all duration-200 ease-in-out ${collapsed ? 'w-[56px]' : 'w-[220px]'}`}
        data-testid="portal-sidebar"
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] flex flex-col bg-[#0b0e18] border-r border-[rgba(240,235,224,0.08)]">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(240,235,224,0.08)] bg-[#0b0e18] shrink-0" data-testid="portal-topbar">
          {/* Mobile hamburger */}
          <button
            className="md:hidden text-[rgba(240,235,224,0.6)] hover:text-[var(--cream)] transition-colors"
            onClick={() => setMobileOpen(o => !o)}
            data-testid="mobile-menu-btn"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Project switcher slot */}
          {projectSwitcherSlot && (
            <div className="shrink-0">{projectSwitcherSlot}</div>
          )}

          {/* Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(240,235,224,0.06)] border border-[rgba(240,235,224,0.1)] text-[rgba(240,235,224,0.5)] hover:text-[var(--cream)] hover:border-[rgba(240,235,224,0.2)] transition-all text-sm"
            data-testid="search-trigger-btn"
          >
            <Search size={14} />
            <span className="hidden sm:inline text-xs">Buscar…</span>
            <kbd className="hidden sm:inline ml-auto text-[9px] px-1 rounded bg-[rgba(240,235,224,0.1)]">⌘K</kbd>
          </button>

          <div className="flex-1" />

          {/* Notifications bell */}
          <NotificationsBell user={user} />

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className="w-8 h-8 rounded-full bg-[rgba(240,235,224,0.12)] flex items-center justify-center text-[var(--cream)] text-xs font-bold hover:bg-[rgba(240,235,224,0.2)] transition-colors"
              data-testid="user-menu-btn"
            >
              {user?.picture
                ? <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                : <User size={14} />}
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 rounded-xl bg-[#131722] border border-[rgba(240,235,224,0.12)] shadow-2xl py-1 z-50">
                <div className="px-3 py-2 border-b border-[rgba(240,235,224,0.08)]">
                  <p className="text-[var(--cream)] text-xs font-medium truncate">{user?.name}</p>
                  <p className="text-[rgba(240,235,224,0.4)] text-[10px] truncate">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[rgba(240,235,224,0.65)] hover:text-[var(--cream)] hover:bg-[rgba(240,235,224,0.06)] transition-colors text-sm"
                  data-testid="topbar-logout-btn"
                >
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" data-testid="portal-main">
          {children}
        </main>
      </div>

      {/* Universal search modal */}
      {searchOpen && (
        <UniversalSearch onClose={() => setSearchOpen(false)} user={user} />
      )}

      {/* Phase 4 Batch 0.5 — Report Problem floating button */}
      <ReportProblemButton user={user} />
    </div>
  );
}

export default PortalLayout;
