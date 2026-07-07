/**
 * SuperadminDatosHub — el HUB DE DATOS & FUENTES (metodología Hub de Mercado).
 *
 * Una sola casa para la plomería de datos: ingesta & fuentes (Ingesta masiva IA, Conectores,
 * Gov Data MX, Drive), almacén & documentos (Data Lake, Documentos) y cobertura (Cobertura de
 * datos, Pulso del catálogo). Cada pestaña embebe la página existente — cero duplicación, cada
 * una sigue viva por su ruta directa (redirige con ?tab=). URL = fuente de verdad · lazy-load
 * por pestaña · roles ARIA.
 *
 * FUERA del hub a propósito: Hub de Mercado (terminal insignia de 7 tabs) y Cubo de métricas
 * (drill-down ciudad→unidad) — superficies full-screen que NO deben enterrarse en pestañas.
 *
 * Nota: casi todas las páginas usan `user`/`onLogout`; el hub los toma de useAuth y los pasa.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { useAuth } from '../../App';
import { FolderUp, Plug, Landmark, FolderOpen, Database, FileText, ListChecks, Activity } from 'lucide-react';

const SuperadminBulkIngest = lazy(() => import('./SuperadminBulkIngest'));
const SuperadminDataSourcesHub = lazy(() => import('./SuperadminDataSourcesHub'));
const SuperadminGovDataMx = lazy(() => import('./SuperadminGovDataMx'));
const SuperadminDrivePage = lazy(() => import('./SuperadminDrivePage'));
const SuperadminDataLake = lazy(() => import('./SuperadminDataLake'));
const DocumentsPage = lazy(() => import('./DocumentsPage'));
const SuperadminRecipesCoverage = lazy(() => import('./SuperadminRecipesCoverage'));
const SuperadminCatalogPulse = lazy(() => import('./SuperadminCatalogPulse'));

const TABS = [
  { k: 'bulk-ingest', label: 'Ingesta masiva', Icon: FolderUp, grupo: 'Ingesta & Fuentes', Page: SuperadminBulkIngest },
  { k: 'conectores', label: 'Conectores', Icon: Plug, grupo: 'Ingesta & Fuentes', Page: SuperadminDataSourcesHub },
  { k: 'gov-data', label: 'Gov Data MX', Icon: Landmark, grupo: 'Ingesta & Fuentes', Page: SuperadminGovDataMx },
  { k: 'drive', label: 'Drive', Icon: FolderOpen, grupo: 'Ingesta & Fuentes', Page: SuperadminDrivePage },
  { k: 'data-lake', label: 'Data Lake', Icon: Database, grupo: 'Almacén & Documentos', Page: SuperadminDataLake },
  { k: 'documents', label: 'Documentos', Icon: FileText, grupo: 'Almacén & Documentos', Page: DocumentsPage },
  { k: 'coverage', label: 'Cobertura de datos', Icon: ListChecks, grupo: 'Cobertura', Page: SuperadminRecipesCoverage },
  { k: 'catalog-pulse', label: 'Pulso del catálogo', Icon: Activity, grupo: 'Cobertura', Page: SuperadminCatalogPulse },
];

export default function SuperadminDatosHub() {
  const [sp, setSp] = useSearchParams();
  const { user, logout } = useAuth();
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'bulk-ingest';   // URL = única fuente de verdad
  const setTab = (k) => { const n = new URLSearchParams(sp); n.set('tab', k); setSp(n); };

  const tabBtn = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 11,
    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
    background: on ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
    color: on ? 'var(--theme)' : 'rgba(240,235,224,0.6)',
  });
  const Active = TABS.find((t) => t.k === tab).Page;
  let grupoActual = null;

  return (
    <SuperadminLayout>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--theme)', marginBottom: 2 }}>
        Datos & Fuentes
      </div>
      <div role="tablist" aria-label="Datos & Fuentes" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span aria-hidden="true" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo !== 'Ingesta & Fuentes' ? 8 : 0 }}>{t.grupo}</span>}
              <button role="tab" aria-selected={tab === t.k} data-testid={`datos-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
                <t.Icon size={13} /> {t.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <div role="tabpanel">
        <Suspense fallback={<div style={{ padding: 40, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Cargando…</div>}>
          <Active embedded user={user} onLogout={logout} />
        </Suspense>
      </div>
    </SuperadminLayout>
  );
}
