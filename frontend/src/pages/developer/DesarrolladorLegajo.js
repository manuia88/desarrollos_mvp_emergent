// /desarrollador/desarrollos/:slug/legajo — Phase 7.4
// 5 tabs: Docs (full DocumentsList) · Fotos · Planos · Avance-Obra · 360°.
// Multi-tenant guard via backend (developer_admin sees only own dev_ids).
import React, { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import DocumentsList from '../../components/documents/DocumentsList';
import { ComplianceDotStrip } from '../../components/marketplace/ComplianceBadge';
import { FileText, Camera, Map, AlertTriangle, ArrowRight, Sparkle } from '../../components/icons';
import * as docsApi from '../../api/documents';

const API = process.env.REACT_APP_BACKEND_URL;


function PlaceholderTab({ icon: Icon, title, phase, description, children }) {
  return (
    <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 56, height: 56, borderRadius: 9999,
        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)',
        marginBottom: 14,
      }}>
        <Icon size={24} color="var(--indigo-3)" />
      </div>
      <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--indigo-3)' }}>
        {phase}
      </div>
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em', margin: '4px 0 8px' }}>
        {title}
      </h3>
      <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', maxWidth: 480, margin: '0 auto', lineHeight: 1.55 }}>
        {description}
      </p>
      {children}
    </Card>
  );
}


function DocsTabExtra({ devId, devName }) {
  // Show file-type filter strip + pending review summary above the existing DocumentsList.
  const [docTypes, setDocTypes] = useState({});
  useEffect(() => { docsApi.listDocTypes().then(r => setDocTypes(r.doc_types || {})).catch(() => {}); }, []);
  return (
    <>
      <DocumentsList devId={devId} devName={devName} scope="developer" compact={false} />
    </>
  );
}


export default function DesarrolladorLegajo({ user, onLogout }) {
  const { slug } = useParams();
  const [tab, setTab] = useState('docs');
  const [dev, setDev] = useState(null);
  const [accessErr, setAccessErr] = useState(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API}/api/developments/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(setDev);
    // Multi-tenant probe: hit the dev-list endpoint to confirm access.
    docsApi.listDevDocuments(slug, {}, 'developer').catch(e => {
      if (e.status === 403) setAccessErr('Este desarrollo no pertenece a tu cuenta.');
    });
  }, [slug]);

  if (accessErr) {
    return (
      <DeveloperLayout user={user} onLogout={onLogout}>
        <Card style={{ padding: 36, textAlign: 'center' }}>
          <AlertTriangle size={26} color="#fca5a5" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginTop: 12 }}>
            Acceso restringido
          </h3>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', marginTop: 4 }}>
            {accessErr}
          </p>
          <Link to="/desarrollador/inventario" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>
            Volver a Inventario <ArrowRight size={11} />
          </Link>
        </Card>
      </DeveloperLayout>
    );
  }

  const TABS = [
    { k: 'docs', label: 'Documentos', icon: FileText },
    { k: 'fotos', label: 'Fotos', icon: Camera },
    { k: 'planos', label: 'Planos', icon: Map },
    { k: 'avance', label: 'Avance de obra', icon: Sparkle },
    { k: 'tour360', label: 'Tour 360°', icon: Camera },
  ];

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      {/* Header with breadcrumb + dev name + compliance dots */}
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          <Link to="/desarrollador/inventario" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>
            Inventario
          </Link>{' / '}{dev?.name || slug}
        </div>
        <h1 data-testid="legajo-h1" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
          color: 'var(--cream)', letterSpacing: '-0.025em', margin: '4px 0 6px',
        }}>
          Legajo · {dev?.name || slug}
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55, marginBottom: 12 }}>
          Repositorio único de documentos legales, comerciales, fotos, planos y avance del desarrollo. Cada upload alimenta automáticamente la ficha pública del marketplace.
        </p>
        <ComplianceDotStrip devId={slug} />
      </div>

      {/* Tabs */}
      <div data-testid="legajo-tabs" style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.k;
          return (
            <button key={t.k} data-testid={`legajo-tab-${t.k}`} onClick={() => setTab(t.k)} style={{
              padding: '11px 16px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${active ? '#6366F1' : 'transparent'}`,
              color: active ? 'var(--cream)' : 'var(--cream-3)',
              fontFamily: 'DM Sans', fontWeight: active ? 600 : 500, fontSize: 13,
              cursor: 'pointer', marginBottom: -1,
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      {tab === 'docs' && <DocsTabExtra devId={slug} devName={dev?.name} />}

      {tab === 'fotos' && (
        <PlaceholderTab
          icon={Camera}
          phase="Phase 7.6 · Próximamente"
          title="Galería de fotos del desarrollo"
          description="Pipeline de assets fotográficos (hero, amenidades, render, departamento muestra) con versionado, watermark automático y publicación al marketplace en un click. Esta sección se habilita en la siguiente iteración."
        >
          <Link to="/desarrollador/inventario" className="btn btn-glass btn-sm" style={{ marginTop: 16 }}>
            Volver a Inventario <ArrowRight size={11} />
          </Link>
        </PlaceholderTab>
      )}

      {tab === 'planos' && (
        <PlaceholderTab
          icon={Map}
          phase="Phase 7.6 · Próximamente"
          title="Planos arquitectónicos"
          description="Galería interactiva de planos por tipo de unidad. Auto-extracción de m², distribución y orientación desde los PDFs de plano_arquitectonico (ya disponibles en Documentos). Aquí se renderizarán como thumbnails navegables."
        />
      )}

      {tab === 'avance' && (
        <PlaceholderTab
          icon={Sparkle}
          phase="Phase 7.10 · Próximamente"
          title="Avance de obra"
          description="Timeline de progreso con fotos antes/después por fase, % completado por área (cimentación, estructura, acabados), reportes mensuales del residente. Surface en la ficha pública con badge de transparencia."
        />
      )}

      {tab === 'tour360' && (
        <PlaceholderTab
          icon={Camera}
          phase="Phase 7.6 · Pedra · Próximamente"
          title="Tour virtual 360°"
          description="Integración con Pedra para tours virtuales fotorealistas del departamento muestra. Permite a compradores remotos recorrer el espacio antes de agendar visita física, multiplicando conversión."
        />
      )}
    </DeveloperLayout>
  );
}
