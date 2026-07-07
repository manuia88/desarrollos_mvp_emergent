/**
 * SuperadminDevtoolsHub — el HUB DE DEV TOOLS (metodología Hub de Mercado).
 *
 * Una sola casa para las herramientas internas de ingeniería: catálogo de primitivas de UI,
 * mapa del sistema y diagnóstico de usuarios. Cada pestaña embebe la página existente (bare) —
 * cero duplicación, cada una sigue viva por su ruta directa (redirige con ?tab=). URL = fuente
 * de verdad · lazy-load por pestaña · roles ARIA. Las 3 usan user/onLogout: el hub los pasa.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { useAuth } from '../../App';
import { Sparkles, Network, Activity } from 'lucide-react';

const PrimitivesDemo = lazy(() => import('./PrimitivesDemo'));
const SystemMapPage = lazy(() => import('./SystemMap'));
const UserDiagnosticsPage = lazy(() => import('./UserDiagnostics'));

const TABS = [
  { k: 'primitives', label: 'Primitives demo', Icon: Sparkles, Page: PrimitivesDemo },
  { k: 'system-map', label: 'Mapa del sistema', Icon: Network, Page: SystemMapPage },
  { k: 'user-diagnostics', label: 'Diagnóstico de usuarios', Icon: Activity, Page: UserDiagnosticsPage },
];

export default function SuperadminDevtoolsHub() {
  const [sp, setSp] = useSearchParams();
  const { user, logout } = useAuth();
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'primitives';   // URL = única fuente de verdad
  const setTab = (k) => { const n = new URLSearchParams(sp); n.set('tab', k); setSp(n); };

  const tabBtn = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 11,
    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
    background: on ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
    color: on ? 'var(--theme)' : 'rgba(240,235,224,0.6)',
  });
  const Active = TABS.find((t) => t.k === tab).Page;

  return (
    <SuperadminLayout>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--theme)', marginBottom: 2 }}>
        Dev Tools
      </div>
      <div role="tablist" aria-label="Dev Tools" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} data-testid={`dev-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
            <t.Icon size={13} /> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <Suspense fallback={<div style={{ padding: 40, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Cargando…</div>}>
          <Active embedded user={user} onLogout={logout} />
        </Suspense>
      </div>
    </SuperadminLayout>
  );
}
