// /desarrollador/desarrollos/:slug/legajo — Phase 7.4
// 5 tabs: Docs (full DocumentsList) · Fotos · Planos · Avance-Obra · 360°.
// Multi-tenant guard via backend (developer_admin sees only own dev_ids).
import React, { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import DocumentsList from '../../components/documents/DocumentsList';
import AssetGallery from '../../components/documents/AssetGallery';
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
        <AssetGallery devId={slug} scope="developer" filterType="foto_render" />
      )}

      {tab === 'planos' && (
        <PlanosTab devId={slug} />
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
        <Tour360Tab devId={slug} />
      )}
    </DeveloperLayout>
  );
}


function PlanosTab({ devId }) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const regenerate = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/desarrollador/developments/${encodeURIComponent(devId)}/assets/regenerate-plano-thumbnails`, {
        method: 'POST', credentials: 'include',
      });
      const data = await r.json();
      setToast({ ok: data.ok, msg: data.ok ? `Generadas ${data.count} miniaturas` : 'Error generando' });
    } catch (e) { setToast({ ok: false, msg: e.message }); }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
        <div>
          <div className="eyebrow">Planos · auto-generados desde docs</div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 0', letterSpacing: '-0.018em' }}>
            Miniaturas de planos
          </h3>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
            Renderizadas desde la primera página de cada documento `plano_arquitectonico`.
          </div>
        </div>
        <button onClick={regenerate} disabled={busy} data-testid="planos-regen-btn" style={{
          padding: '8px 16px', borderRadius: 9999,
          background: busy ? 'rgba(148,163,184,0.2)' : 'var(--grad)', border: 'none', color: '#fff',
          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer',
        }}>{busy ? 'Generando…' : 'Regenerar miniaturas'}</button>
      </div>
      <AssetGallery devId={devId} scope="developer" filterType="plano_thumbnail" />
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 620,
          padding: '12px 18px', borderRadius: 14,
          background: toast.ok ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.ok ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500, maxWidth: 360,
        }}>{toast.msg}</div>
      )}
    </div>
  );
}


function Tour360Tab({ devId }) {
  const [assets, setAssets] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/developments/${encodeURIComponent(devId)}/assets`)
      .then(r => r.json()).then(d => setAssets(d.assets || []))
      .catch(() => {});
  }, [devId]);

  const tours = assets.filter(a => a.tour_url);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Tours 360° · powered by Pedra</div>
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 6px', letterSpacing: '-0.018em' }}>
        Recorridos virtuales
      </h3>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55, marginBottom: 16, maxWidth: 640 }}>
        Genera tours 360° desde cualquier foto del desarrollo (ve a la pestaña <strong>Fotos</strong> y haz clic en el botón <strong>360°</strong> en cada imagen).
        Si Pedra no está configurado, el sistema te indicará qué hace falta.
      </p>

      {tours.length === 0 && (
        <div style={{ padding: 26, textAlign: 'center', background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 12 }}>
          <Camera size={26} color="var(--cream-3)" />
          <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 13.5, color: 'var(--cream-2)', marginTop: 8 }}>
            Aún no hay tours 360° generados.
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', marginTop: 4 }}>
            Ve a la pestaña Fotos y dispara la generación 360° por imagen.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
        {tours.map(a => (
          <div key={a.id} data-testid="tour-card" style={{ background: '#0D1118', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <iframe title={a.filename} src={a.tour_url}
                    style={{ width: '100%', height: 320, border: 'none', display: 'block' }} />
            <div style={{ padding: 12 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: 'var(--cream)' }}>
                {a.ai_caption || a.filename}
              </div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 4 }}>
                Pedra render · {a.pedra_render_id}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
