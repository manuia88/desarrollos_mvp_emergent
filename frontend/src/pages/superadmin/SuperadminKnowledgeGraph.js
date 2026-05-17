/**
 * W5.12 Parte 2 — SuperadminKnowledgeGraph (page).
 *
 * Ruta: /superadmin/knowledge-graph
 * Layout: SuperadminLayout (seccion INTELIGENCIA · morado)
 * Tabs: Preguntas · Grafo · Anomalias · Monitoring
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import KGQueryTemplates from '../../components/superadmin/KGQueryTemplates';
import KGGraphViz from '../../components/superadmin/KGGraphViz';
import KGAnomaliesPanel from '../../components/superadmin/KGAnomaliesPanel';
import KGMonitoringPanel from '../../components/superadmin/KGMonitoringPanel';
import { Activity, AlertTriangle, FileText, Network } from 'lucide-react';
import { getKgHealth } from '../../api/knowledge_graph';

const TABS = [
  { key: 'preguntas',  i18nKey: 'tabs.preguntas',   Icon: FileText },
  { key: 'grafo',      i18nKey: 'tabs.grafo',       Icon: Network },
  { key: 'anomalias',  i18nKey: 'tabs.anomalias',   Icon: AlertTriangle },
  { key: 'monitoring', i18nKey: 'tabs.monitoring',  Icon: Activity },
];

function TabBtn({ tab, active, onClick }) {
  const Icon = tab.Icon;
  return (
    <button
      data-testid={`kg-tab-${tab.key}`}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', borderRadius: 9999,
        fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
        cursor: 'pointer',
        background: active ? 'linear-gradient(90deg, rgba(124,47,255,0.22), rgba(192,38,211,0.18))' : 'rgba(255,255,255,0.04)',
        border: active ? '1px solid rgba(124,47,255,0.45)' : '1px solid var(--border, rgba(255,255,255,0.10))',
        color: active ? '#e0e7ff' : 'var(--cream-2, #d6d2c4)',
        transition: 'all 0.18s',
      }}>
      <Icon size={12} />
      {tab.label}
    </button>
  );
}

export default function SuperadminKnowledgeGraph({ user, onLogout }) {
  const { t } = useTranslation();
  const [active, setActive] = useState('preguntas');
  const [kgAvailable, setKgAvailable] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const r = await getKgHealth();
      if (!cancel) setKgAvailable(!!r?.body?.kg_available);
    })();
    return () => { cancel = true; };
  }, []);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="kg-page" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 60 }}>
        {/* Header */}
        <div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: 'var(--cream-3, rgba(240,235,224,0.55))', textTransform: 'uppercase', marginBottom: 8 }}>
            {t('knowledge_graph.eyebrow', 'SUPERADMIN · KNOWLEDGE GRAPH')}
          </div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
            {t('knowledge_graph.title', 'Knowledge Graph')}
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3, rgba(240,235,224,0.65))', marginTop: 8, maxWidth: 720, lineHeight: 1.55 }}>
            {t('knowledge_graph.subtitle', 'Explora relaciones del grafo de DesarrollosMX. Plantillas seguras, visualizacion Cytoscape, deteccion de anomalias nocturna y monitoring del servicio Neo4j.')}
          </p>
        </div>

        {/* Sticky tabs */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(13,16,23,0.85)', backdropFilter: 'blur(24px)',
          padding: '12px 0', borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))',
        }} data-testid="kg-tabs-bar">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TABS.map(tab => (
              <TabBtn
                key={tab.key}
                tab={{ ...tab, label: t(`knowledge_graph.${tab.i18nKey}`, tab.key) }}
                active={active === tab.key}
                onClick={() => setActive(tab.key)}
              />
            ))}
          </div>
        </div>

        {active === 'preguntas'  && <KGQueryTemplates />}
        {active === 'grafo'      && <KGGraphViz />}
        {active === 'anomalias'  && <KGAnomaliesPanel kgAvailable={kgAvailable} />}
        {active === 'monitoring' && <KGMonitoringPanel />}
      </div>
    </SuperadminLayout>
  );
}
