// W5.22 Z.8.2 — LandingsPage REWORK: split-pane editor + drag-drop + multi-step modal
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import * as api from '../../../api/studio_z8';
import { listIntakes } from '../../../api/studio_intake';
import * as Icons from 'lucide-react';
import { SECTION_TYPES, SECTION_META } from '../../../components/studio/sections/SectionRenderer';
import SectionRenderer from '../../../components/studio/sections/SectionRenderer';
import { TEMPLATE_KEYS as Z87_TEMPLATE_KEYS } from '../../../templates/landings/TemplateDispatcher';
import { useNavigate } from 'react-router-dom';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const BG_CARD = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(255,255,255,0.10)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const btnGradient = (extra = {}) => ({ padding: '10px 18px', background: GRADIENT, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, transition: `transform 320ms ${EASE}`, ...extra });
const btnSecondary = (extra = {}) => ({ padding: '10px 16px', background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, transition: `transform 320ms ${EASE}`, ...extra });
const btnGhost = (extra = {}) => ({ padding: '6px 10px', background: 'transparent', color: '#a0a4b0', border: 'none', cursor: 'pointer', borderRadius: 9999, ...extra });

const VIEWPORTS = { desktop: 1440, tablet: 768, mobile: 375 };
const LANDING_TYPE_META = [
  { key: 'property', icon: 'Home', label: 'Property', desc: 'Landing para 1 propiedad' },
  { key: 'personal_brand', icon: 'UserCircle', label: 'Personal Brand', desc: 'Tu marca como asesor' },
  { key: 'marketplace', icon: 'Grid3x3', label: 'Marketplace', desc: 'Tu portafolio completo' },
];
const TEMPLATE_KEYS_DEFAULT = ['modern', 'luxury', 'family', 'investor', 'boutique', 'urgent', 'scrollytelling', 'video_first', 'social_proof', 'compare'];

function PaletteDots({ palette = {} }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, marginRight: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 9999, background: palette.primary || '#6366F1', border: '1px solid rgba(255,255,255,0.1)' }} />
      <span style={{ width: 10, height: 10, borderRadius: 9999, background: palette.secondary || '#EC4899', border: '1px solid rgba(255,255,255,0.1)' }} />
      <span style={{ width: 10, height: 10, borderRadius: 9999, background: palette.bg || '#06080F', border: '1px solid rgba(255,255,255,0.15)' }} />
    </div>
  );
}

function ThemeCard({ themeMeta, active, onSelect, compact = false }) {
  const palette = themeMeta?.preview_palette || {};
  const fits = (themeMeta?.use_case_fit || []).join(' · ');
  return (
    <button
      type="button"
      data-testid={`theme-card-${themeMeta.key}`}
      onClick={onSelect}
      title={`${themeMeta.name} · ${fits}`}
      style={{
        padding: compact ? 10 : 14,
        borderRadius: 12,
        background: active ? `${palette.primary || '#6366F1'}22` : 'rgba(13,16,23,0.6)',
        border: active ? `2px solid ${palette.primary || '#6366F1'}` : '1px solid rgba(99,102,241,0.18)',
        cursor: 'pointer',
        textAlign: 'left',
        color: '#F0EBE0',
        transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), border-color 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
      }}
    >
      <PaletteDots palette={palette} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: compact ? 12 : 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{themeMeta.name}</div>
        {!compact && <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.55)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fits}</div>}
      </div>
    </button>
  );
}

function Toast({ msg, onClose }) {
  useEffect(() => { if (msg) { const id = setTimeout(onClose, 3200); return () => clearTimeout(id); } return undefined; }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div data-testid="toast" style={{ position: 'fixed', bottom: 24, right: 24, background: BG_CARD, color: '#F0EBE0', padding: '12px 18px', borderRadius: 9999, border: BORDER, zIndex: 1100, backdropFilter: 'blur(24px)', transition: `transform 320ms ${EASE}` }}>
      {msg}
    </div>
  );
}

const PORTALS = [
  { value: 'easybroker.com', label: 'EasyBroker', sample: 'https://propiedades.easybroker.com/property/EB-XXXXX' },
  { value: 'propiedades.com', label: 'Propiedades.com', sample: 'https://propiedades.com/inmuebles/...' },
  { value: 'casasyterrenos.com', label: 'Casas y Terrenos', sample: 'https://www.casasyterrenos.com/...' },
];

function ResaleInlineImporter({ resales, setResales, linkedEntityId, setLinkedEntityId, title, setTitle, t }) {
  const [formOpen, setFormOpen] = useState(resales.length === 0);
  const [portalHint, setPortalHint] = useState(PORTALS[0].value);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const trySubmit = async () => {
    setError(''); setSuccessMsg('');
    if (!url || !url.startsWith('http')) {
      setError('Pega un link valido del portal');
      return;
    }
    setBusy(true);
    try {
      const r = await api.importListingInline(url);
      if (r?.ok && r.import?.id) {
        const imp = r.import;
        if (imp.status === 'parsed') {
          // Refresh list + auto-select new one
          const fresh = await api.catalogResales(30, 0).catch(() => ({ items: [] }));
          setResales(fresh.items || []);
          setLinkedEntityId(imp.id);
          if (!title && imp.parsed_data?.title) setTitle(imp.parsed_data.title);
          setSuccessMsg('Propiedad importada ✓');
          setUrl('');
          setFormOpen(false);
        } else {
          setError(imp.error_msg || 'Import falló · revisa el link');
        }
      } else {
        setError('Respuesta inesperada · reintenta');
      }
    } catch (e) {
      const detail = e?.body?.detail || e?.message || 'Error al importar';
      setError(detail.length > 120 ? detail.slice(0, 120) + '…' : detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="resale-inline-importer">
      {/* Form inline */}
      {formOpen ? (
        <div style={{ padding: 14, borderRadius: 12, background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.3)', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: '#F0EBE0', fontSize: 13 }}>Importar propiedad</div>
            {resales.length > 0 && <button type="button" onClick={() => { setFormOpen(false); setError(''); setSuccessMsg(''); }} style={{ background: 'transparent', border: 'none', color: '#a0a4b0', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>}
          </div>
          <select data-testid="import-portal" value={portalHint} onChange={(e) => setPortalHint(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0', fontSize: 12, marginBottom: 8 }}>
            {PORTALS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input
            data-testid="import-url"
            type="url"
            placeholder={PORTALS.find((p) => p.value === portalHint)?.sample || 'https://...'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(236,72,153,0.3)', color: '#F0EBE0', fontSize: 13, marginBottom: 8 }}
          />
          <button
            data-testid="import-submit"
            type="button"
            disabled={busy}
            onClick={trySubmit}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 9999, background: busy ? 'rgba(236,72,153,0.4)' : GRADIENT, color: '#fff', border: 'none', cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13 }}
          >
            {busy ? 'Importando…' : `Importar de ${PORTALS.find((p) => p.value === portalHint)?.label}`}
          </button>
          {error && <div data-testid="import-error" style={{ marginTop: 8, padding: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 6, color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
          {successMsg && <div data-testid="import-success" style={{ marginTop: 8, padding: 8, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 6, color: '#86EFAC', fontSize: 12 }}>{successMsg}</div>}
        </div>
      ) : (
        <button data-testid="import-toggle" type="button" onClick={() => setFormOpen(true)} style={{ width: '100%', padding: '8px 14px', borderRadius: 9999, background: 'rgba(236,72,153,0.12)', color: '#F0EBE0', border: '1px solid rgba(236,72,153,0.3)', cursor: 'pointer', fontSize: 12, marginBottom: 10 }}>
          + Importar nueva propiedad
        </button>
      )}

      {/* Lista existing resales (compact · scroll dentro) */}
      {resales.length > 0 ? (
        <div data-testid="resales-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 4 }}>
          {resales.map((r) => (
            <button key={r.id} type="button" data-testid={`resale-${r.id}`} onClick={() => { setLinkedEntityId(r.id); if (!title) setTitle(r.title); }} style={{ padding: 12, borderRadius: 10, background: linkedEntityId === r.id ? 'rgba(236,72,153,0.18)' : 'rgba(13,16,23,0.6)', border: linkedEntityId === r.id ? '2px solid #EC4899' : '1px solid rgba(236,72,153,0.18)', cursor: 'pointer', textAlign: 'left', color: '#F0EBE0' }}>
              <div style={{ fontWeight: 600, fontFamily: 'Outfit, sans-serif', fontSize: 12, lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)', marginTop: 2 }}>{r.colonia || '—'} · {r.source_portal}</div>
              {r.price && <div style={{ fontSize: 11, color: '#EC4899', marginTop: 2, fontWeight: 700 }}>${r.price.toLocaleString()}</div>}
            </button>
          ))}
        </div>
      ) : !formOpen && (
        <div data-testid="no-resales-hint" style={{ padding: 18, textAlign: 'center', color: 'rgba(240,235,224,0.5)', fontSize: 12 }}>
          {t('studio.landings.no_resales_yet') || 'Aún no tienes reventas · usa el form arriba para importar la primera'}
        </div>
      )}
    </div>
  );
}

const MARKETPLACE_CONFIG_DEFAULTS = {
  limit: 100,
  sort_by: 'date_new',
  default_filters: { cities: [], colonias: [], status: [], price_min: null, price_max: null, amenities_required: [] },
  enable_map: true,
  enable_search: true,
  pagination_mode: 'buttons',
};

function CreateModal({ open, onClose, onCreated, starters, developments, asesor, themes, marketplaceFacets }) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(1);
  const [landingType, setLandingType] = useState('property');
  const [propertySource, setPropertySource] = useState('development');
  const [resales, setResales] = useState([]);
  const [linkedEntityId, setLinkedEntityId] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [tpl, setTpl] = useState('modern');
  const [starterKey, setStarterKey] = useState('property');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchDev, setSearchDev] = useState('');
  const [mpCfg, setMpCfg] = useState(MARKETPLACE_CONFIG_DEFAULTS);
  const [mpPreviewCount, setMpPreviewCount] = useState(null);
  const [mpPreviewTotal, setMpPreviewTotal] = useState(null);

  // Z.8.5.1 — Load resales on switch to resale source
  useEffect(() => {
    if (!open || landingType !== 'property' || propertySource !== 'resale') return undefined;
    let alive = true;
    api.catalogResales(30, 0).then((r) => { if (alive) setResales(r.items || []); }).catch(() => { if (alive) setResales([]); });
    return () => { alive = false; };
  }, [open, landingType, propertySource]);

  useEffect(() => {
    if (!open) {
      setStep(1); setLandingType('property'); setLinkedEntityId(''); setTitle(''); setSlug('');
      setTpl('modern'); setStarterKey('property'); setError(''); setSearchDev('');
      setMpCfg(MARKETPLACE_CONFIG_DEFAULTS); setMpPreviewCount(null); setMpPreviewTotal(null);
      setPropertySource('development'); setResales([]);
    }
  }, [open]);

  // Reset linked entity when source changes
  useEffect(() => {
    setLinkedEntityId('');
  }, [propertySource]);

  // Live preview count for marketplace builder
  useEffect(() => {
    if (!open || landingType !== 'marketplace') return undefined;
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const r = await api.previewMarketplace('_new', mpCfg);
        if (!alive) return;
        setMpPreviewCount(r.total);
        setMpPreviewTotal(r.total_unfiltered);
      } catch (e) { /* silent */ }
    }, 350);
    return () => { alive = false; clearTimeout(id); };
  }, [open, landingType, mpCfg]);

  useEffect(() => {
    if (landingType === 'personal_brand' && asesor?.user_id) setLinkedEntityId(asesor.user_id);
    if (landingType !== 'personal_brand') setStarterKey(landingType);
  }, [landingType, asesor]);

  const filteredDevs = useMemo(() => {
    const q = searchDev.trim().toLowerCase();
    return (developments || []).filter((d) => !q || d.name?.toLowerCase().includes(q) || d.colonia?.toLowerCase().includes(q));
  }, [searchDev, developments]);

  const handleCreate = async () => {
    setError('');
    setLoading(true);
    try {
      const r = await api.createLanding({
        template_key: tpl,
        title: title || 'Mi landing',
        slug: slug || undefined,
        landing_type: landingType,
        linked_entity_id: linkedEntityId || null,
        starter_key: starterKey,
        property_source: landingType === 'property' ? propertySource : undefined,
      });
      // Z.8.4 — Si marketplace · persistir config inicial despues de crear
      if (landingType === 'marketplace' && r?.landing?.id) {
        try { await api.updateMarketplaceConfig(r.landing.id, mpCfg); } catch (e) { /* soft-fail · usa defaults */ }
      }
      onCreated(r.landing);
    } catch (e) {
      setError(e.body?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const mpToggleArr = (key, val) => {
    setMpCfg((c) => {
      const arr = c.default_filters?.[key] || [];
      const has = arr.includes(val);
      return { ...c, default_filters: { ...c.default_filters, [key]: has ? arr.filter((x) => x !== val) : [...arr, val] } };
    });
  };

  if (!open) return null;
  return (
    <div data-testid="create-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: 'min(960px, 100%)', maxHeight: '90vh', overflow: 'hidden', background: BG_CARD, border: BORDER, borderRadius: 20, padding: 16, color: '#F0EBE0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ letterSpacing: '0.25em', fontSize: 11, color: '#6366F1', textTransform: 'uppercase' }}>Paso {step}/3</div>
            <h2 style={{ margin: '4px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 18 }}>
              {step === 1 && 'Que landing quieres crear?'}
              {step === 2 && (landingType === 'property' ? 'Selecciona la propiedad' : landingType === 'personal_brand' ? 'Confirma tu marca' : 'Define el alcance')}
              {step === 3 && 'Detalles finales'}
            </h2>
          </div>
          <button data-testid="modal-close" type="button" onClick={onClose} style={btnGhost()} aria-label="Close"><Icons.X size={18} /></button>
        </div>

        {/* Z.8.6 SUB-B · Body scroll container · solo contenido scrollea · header+footer sticky */}
        <div data-testid="modal-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, paddingRight: 4 }}>

        {step === 1 && (
          <div data-testid="step-type" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {LANDING_TYPE_META.map((m) => {
              const Ico = Icons[m.icon] || Icons.Square;
              const active = landingType === m.key;
              return (
                <button key={m.key} type="button" data-testid={`type-card-${m.key}`} onClick={() => setLandingType(m.key)} style={{ padding: 22, borderRadius: 14, background: active ? 'rgba(99,102,241,0.15)' : 'rgba(13,16,23,0.6)', border: active ? '2px solid #6366F1' : '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', textAlign: 'left', color: '#F0EBE0', transition: `transform 320ms ${EASE}` }}>
                  <Ico size={28} color="#6366F1" />
                  <div style={{ marginTop: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 17 }}>{m.label}</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(240,235,224,0.62)' }}>{m.desc}</div>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && landingType === 'property' && (
          <div data-testid="step-property">
            {/* Z.8.5.1 — Radio Desarrollo / Reventa */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('studio.landings.property_source_label') || 'Origen de la propiedad'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  data-testid="src-development"
                  type="button"
                  onClick={() => setPropertySource('development')}
                  style={{ flex: 1, padding: '14px 18px', borderRadius: 12, background: propertySource === 'development' ? 'rgba(99,102,241,0.18)' : 'rgba(13,16,23,0.6)', border: propertySource === 'development' ? '2px solid #6366F1' : '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', color: '#F0EBE0', textAlign: 'left' }}
                >
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>🏗️ {t('studio.landings.property_source_dev') || 'Desarrollo nuevo'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)', marginTop: 4 }}>Pre-venta · construccion · obra avanzada</div>
                </button>
                <button
                  data-testid="src-resale"
                  type="button"
                  onClick={() => setPropertySource('resale')}
                  style={{ flex: 1, padding: '14px 18px', borderRadius: 12, background: propertySource === 'resale' ? 'rgba(236,72,153,0.18)' : 'rgba(13,16,23,0.6)', border: propertySource === 'resale' ? '2px solid #EC4899' : '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', color: '#F0EBE0', textAlign: 'left' }}
                >
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>🔁 {t('studio.landings.property_source_resale') || 'Reventa'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)', marginTop: 4 }}>Listing importado · Z.1 EasyBroker etc</div>
                </button>
              </div>
            </div>

            {propertySource === 'development' ? (
              <>
                <input data-testid="search-dev" placeholder="Buscar proyecto..." value={searchDev} onChange={(e) => setSearchDev(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0', marginBottom: 14 }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 4 }}>
                  {filteredDevs.map((d) => (
                    <button key={d.id} type="button" data-testid={`dev-${d.id}`} onClick={() => { setLinkedEntityId(d.id); if (!title) setTitle(d.name); }} style={{ padding: 14, borderRadius: 10, background: linkedEntityId === d.id ? 'rgba(99,102,241,0.18)' : 'rgba(13,16,23,0.6)', border: linkedEntityId === d.id ? '2px solid #6366F1' : '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', textAlign: 'left', color: '#F0EBE0' }}>
                      <div style={{ fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>{d.colonia} · {d.stage}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <ResaleInlineImporter
                resales={resales}
                setResales={setResales}
                linkedEntityId={linkedEntityId}
                setLinkedEntityId={setLinkedEntityId}
                title={title}
                setTitle={setTitle}
                t={t}
              />
            )}
          </div>
        )}

        {step === 2 && landingType === 'personal_brand' && (
          <div data-testid="step-personal" style={{ padding: 18, borderRadius: 12, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, marginBottom: 6 }}>Tu perfil asesor</div>
            <div style={{ color: 'rgba(240,235,224,0.7)', fontSize: 13 }}>
              {asesor?.profile ? `${asesor.profile.full_name || 'Asesor'} · ${asesor.profile.zone || 'CDMX'}` : 'No tienes asesor_profile aun. Se creara automaticamente con datos basicos.'}
            </div>
          </div>
        )}

        {step === 2 && landingType === 'marketplace' && (
          <div data-testid="step-marketplace-builder" style={{ display: 'grid', gap: 14 }}>
            <div style={{ padding: 14, borderRadius: 12, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: '#F0EBE0', fontSize: 14 }}>
                {mpPreviewCount != null ? (
                  <>Tu marketplace mostrara <span style={{ color: '#6366F1' }}>{mpPreviewCount}</span> propiedades{mpPreviewTotal != null ? ` de ${mpPreviewTotal} en tu catalogo` : ''}.</>
                ) : 'Calculando preview...'}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>Ajusta filtros default · podras cambiarlos despues en el editor.</div>
            </div>

            {/* Filtros default */}
            <div style={{ padding: 14, borderRadius: 12, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12, color: '#a0a4b0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Filtros default</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Estado (multi)</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {['preventa', 'venta', 'cerrado'].map((s) => {
                      const on = mpCfg.default_filters.status.includes(s);
                      return <button key={s} data-testid={`mp-cfg-status-${s}`} type="button" onClick={() => mpToggleArr('status', s)} style={{ padding: '6px 14px', borderRadius: 9999, background: on ? GRADIENT : 'rgba(99,102,241,0.12)', color: on ? '#fff' : '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', fontSize: 12, textTransform: 'capitalize' }}>{s}</button>;
                    })}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Precio min
                    <input data-testid="mp-cfg-price-min" type="number" value={mpCfg.default_filters.price_min ?? ''} onChange={(e) => setMpCfg((c) => ({ ...c, default_filters: { ...c.default_filters, price_min: e.target.value ? Number(e.target.value) : null } }))} placeholder="ej. 3000000" style={{ marginTop: 4, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.3)', color: '#F0EBE0', fontSize: 13 }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Precio max
                    <input data-testid="mp-cfg-price-max" type="number" value={mpCfg.default_filters.price_max ?? ''} onChange={(e) => setMpCfg((c) => ({ ...c, default_filters: { ...c.default_filters, price_max: e.target.value ? Number(e.target.value) : null } }))} placeholder="ej. 10000000" style={{ marginTop: 4, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.3)', color: '#F0EBE0', fontSize: 13 }} />
                  </label>
                </div>
                {(marketplaceFacets?.cities || []).length > 0 && (
                  <div>
                    <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Zonas (alcaldias)</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                      {(marketplaceFacets.cities || []).map((c) => {
                        const on = mpCfg.default_filters.cities.includes(c);
                        return <button key={c} type="button" onClick={() => mpToggleArr('cities', c)} style={{ padding: '4px 10px', borderRadius: 9999, background: on ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', fontSize: 11 }}>{c}</button>;
                      })}
                    </div>
                  </div>
                )}
                {(marketplaceFacets?.amenities || []).length > 0 && (
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Amenidades requeridas ({mpCfg.default_filters.amenities_required.length})</summary>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 140, overflowY: 'auto' }}>
                      {(marketplaceFacets.amenities || []).slice(0, 30).map((a) => {
                        const on = mpCfg.default_filters.amenities_required.includes(a);
                        return <button key={a} type="button" onClick={() => mpToggleArr('amenities_required', a)} style={{ padding: '4px 10px', borderRadius: 9999, background: on ? 'rgba(236,72,153,0.5)' : 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', fontSize: 11 }}>{a}</button>;
                      })}
                    </div>
                  </details>
                )}
              </div>
            </div>

            {/* Visualizacion */}
            <div style={{ padding: 14, borderRadius: 12, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12, color: '#a0a4b0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Visualizacion</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Orden default
                    <select data-testid="mp-cfg-sort" value={mpCfg.sort_by} onChange={(e) => setMpCfg((c) => ({ ...c, sort_by: e.target.value }))} style={{ marginTop: 4, width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.3)', color: '#F0EBE0', fontSize: 13 }}>
                      <option value="date_new">Mas recientes</option>
                      <option value="price_asc">Precio asc</option>
                      <option value="price_desc">Precio desc</option>
                      <option value="name_az">Nombre A-Z</option>
                      <option value="zone">Zona</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Limite ({mpCfg.limit === 500 ? 'Todos' : mpCfg.limit})
                    <input data-testid="mp-cfg-limit" type="range" min="12" max="500" step="12" value={mpCfg.limit} onChange={(e) => setMpCfg((c) => ({ ...c, limit: Number(e.target.value) }))} style={{ marginTop: 4, width: '100%' }} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#F0EBE0', cursor: 'pointer' }}>
                    <input data-testid="mp-cfg-map" type="checkbox" checked={mpCfg.enable_map} onChange={(e) => setMpCfg((c) => ({ ...c, enable_map: e.target.checked }))} /> Habilitar mapa
                  </label>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#F0EBE0', cursor: 'pointer' }}>
                    <input data-testid="mp-cfg-search" type="checkbox" checked={mpCfg.enable_search} onChange={(e) => setMpCfg((c) => ({ ...c, enable_search: e.target.checked }))} /> Habilitar busqueda
                  </label>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)' }}>Paginacion</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {[['buttons', 'Botones'], ['infinite', 'Infinito'], ['none', 'Mostrar todos']].map(([k, label]) => (
                      <button key={k} data-testid={`mp-cfg-pag-${k}`} type="button" onClick={() => setMpCfg((c) => ({ ...c, pagination_mode: k }))} style={{ padding: '6px 14px', borderRadius: 9999, background: mpCfg.pagination_mode === k ? GRADIENT : 'rgba(99,102,241,0.12)', color: mpCfg.pagination_mode === k ? '#fff' : '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', fontSize: 12 }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div data-testid="step-detail" style={{ display: 'grid', gap: 14 }}>
            <label style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>Titulo principal
              <input data-testid="detail-title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginTop: 6, width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0' }} />
            </label>
            <label style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>Slug (URL)
              <input data-testid="detail-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="auto-generado" style={{ marginTop: 6, width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0' }} />
            </label>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)', marginBottom: 8 }}>Template visual · cada uno aplica paleta y layout unicos</div>
              <div data-testid="detail-tpl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {(themes && themes.length ? themes : TEMPLATE_KEYS_DEFAULT.map((k) => ({ key: k, name: k, use_case_fit: [], preview_palette: {} }))).map((tm) => (
                  <ThemeCard key={tm.key} themeMeta={tm} active={tpl === tm.key} onSelect={() => setTpl(tm.key)} />
                ))}
              </div>
            </div>
            <label style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>Starter (sections precargadas)
              <select data-testid="detail-starter" value={starterKey} onChange={(e) => setStarterKey(e.target.value)} style={{ marginTop: 6, width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0' }}>
                <option value="property">Property starter ({(starters?.property || []).length} secciones)</option>
                <option value="personal_brand">Personal brand ({(starters?.personal_brand || []).length} secciones)</option>
                <option value="marketplace">Marketplace ({(starters?.marketplace || []).length} secciones)</option>
              </select>
            </label>
          </div>
        )}

        {error && <div data-testid="modal-error" style={{ color: '#F87171', marginTop: 10, fontSize: 13 }}>{error}</div>}

        </div>
        {/* /modal-body · Footer sticky */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {step > 1 ? <button data-testid="modal-back" type="button" onClick={() => setStep(step - 1)} style={btnSecondary()}>Atras</button> : <span />}
          {step < 3 ? (
            <button data-testid="modal-next" type="button" onClick={() => setStep(step + 1)} disabled={step === 2 && landingType === 'property' && !linkedEntityId} style={btnGradient({ opacity: (step === 2 && landingType === 'property' && !linkedEntityId) ? 0.5 : 1 })}>Siguiente</button>
          ) : (
            <button data-testid="modal-create" type="button" disabled={loading} onClick={handleCreate} style={btnGradient()}>{loading ? 'Creando...' : 'Crear landing'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionPickerModal({ open, onClose, onAdd }) {
  if (!open) return null;
  return (
    <div data-testid="section-picker" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(900px, 100%)', maxHeight: '85vh', overflow: 'auto', background: BG_CARD, border: BORDER, borderRadius: 20, padding: 28, color: '#F0EBE0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif' }}>Anadir seccion</h2>
          <button type="button" onClick={onClose} style={btnGhost()} aria-label="Close"><Icons.X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {SECTION_TYPES.map((k) => {
            const meta = SECTION_META[k];
            const Ico = Icons[meta.icon] || Icons.Square;
            return (
              <button key={k} type="button" data-testid={`picker-${k}`} onClick={() => onAdd(k)} style={{ padding: 16, borderRadius: 14, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', textAlign: 'left', color: '#F0EBE0', transition: `transform 320ms ${EASE}` }}>
                <Ico size={22} color="#6366F1" />
                <div style={{ marginTop: 10, fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{meta.label}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>{meta.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionRow({ section, index, isActive, onClick, onToggleVis, onRemove, onDragStart, onDragOver, onDrop }) {
  const meta = SECTION_META[section.type] || { label: section.type, icon: 'Square' };
  const Ico = Icons[meta.icon] || Icons.Square;
  return (
    <div
      data-testid={`sidebar-section-${section.id || index}`}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: isActive ? 'rgba(99,102,241,0.18)' : 'rgba(13,16,23,0.55)', border: isActive ? '1px solid #6366F1' : '1px solid rgba(255,255,255,0.06)', cursor: 'grab', marginBottom: 6 }}
    >
      <Icons.GripVertical size={14} color="rgba(240,235,224,0.5)" />
      <Ico size={16} color="#6366F1" />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{meta.label}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onToggleVis(); }} style={btnGhost({ padding: 4 })} aria-label="visibility" data-testid={`toggle-vis-${index}`}>
        {section.visible === false ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} style={btnGhost({ padding: 4, color: '#F87171' })} aria-label="remove" data-testid={`remove-section-${index}`}>
        <Icons.Trash2 size={14} />
      </button>
    </div>
  );
}

function SectionInlineEditor({ section, onChange }) {
  const updateConfig = (key, val) => onChange({ ...section, config: { ...(section.config || {}), [key]: val } });
  const updateStyle = (key, val) => onChange({ ...section, style_overrides: { ...(section.style_overrides || {}), [key]: val } });
  const cfg = section.config || {};
  const style = section.style_overrides || {};
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EBE0', fontSize: 13 };

  return (
    <div data-testid="section-inline-editor" style={{ padding: 12, marginTop: 6, marginBottom: 12, borderRadius: 10, background: 'rgba(13,16,23,0.4)', border: '1px solid rgba(99,102,241,0.18)', display: 'grid', gap: 10 }}>
      {(section.type === 'hero') && (
        <>
          <input data-testid="cfg-headline" placeholder="Headline" value={cfg.headline || ''} onChange={(e) => updateConfig('headline', e.target.value)} style={inputStyle} />
          <textarea data-testid="cfg-subhead" placeholder="Subhead" value={cfg.subhead || ''} onChange={(e) => updateConfig('subhead', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />
          <select data-testid="cfg-variant" value={cfg.variant || 'centered'} onChange={(e) => updateConfig('variant', e.target.value)} style={inputStyle}>
            <option value="centered">Centered</option>
            <option value="split">Split</option>
            <option value="fullscreen">Fullscreen</option>
          </select>
        </>
      )}
      {section.type === 'lead_form' && (
        <>
          <input placeholder="Headline" value={cfg.headline || ''} onChange={(e) => updateConfig('headline', e.target.value)} style={inputStyle} />
          <input type="number" min="1" max="3" placeholder="Pasos" value={cfg.steps || 1} onChange={(e) => updateConfig('steps', Math.max(1, Math.min(3, Number(e.target.value))))} style={inputStyle} />
          <input placeholder="Texto del boton" value={cfg.submit_text || ''} onChange={(e) => updateConfig('submit_text', e.target.value)} style={inputStyle} />
        </>
      )}
      {section.type === 'video' && (
        <input data-testid="cfg-video-url" placeholder="YouTube / Vimeo / R2 MP4 URL" value={cfg.url || ''} onChange={(e) => updateConfig('url', e.target.value)} style={inputStyle} />
      )}
      {section.type === 'map' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <input placeholder="Lat" value={cfg.lat || ''} onChange={(e) => updateConfig('lat', Number(e.target.value) || 0)} style={inputStyle} />
          <input placeholder="Lng" value={cfg.lng || ''} onChange={(e) => updateConfig('lng', Number(e.target.value) || 0)} style={inputStyle} />
          <input placeholder="Zoom" value={cfg.zoom || 15} onChange={(e) => updateConfig('zoom', Number(e.target.value) || 15)} style={inputStyle} />
        </div>
      )}
      {section.type === 'countdown' && (
        <>
          <input type="datetime-local" value={cfg.expires_at || ''} onChange={(e) => updateConfig('expires_at', e.target.value)} style={inputStyle} />
          <select value={cfg.variant || 'inline'} onChange={(e) => updateConfig('variant', e.target.value)} style={inputStyle}>
            <option value="inline">Inline</option>
            <option value="banner">Banner</option>
            <option value="scarcity">Scarcity</option>
          </select>
        </>
      )}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>Estilos avanzados</summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <input placeholder="bg color #hex" value={style.bg_color || ''} onChange={(e) => updateStyle('bg_color', e.target.value)} style={inputStyle} />
          <select value={style.text_align || 'left'} onChange={(e) => updateStyle('text_align', e.target.value)} style={inputStyle}>
            <option value="left">Izquierda</option>
            <option value="center">Centrado</option>
            <option value="right">Derecha</option>
          </select>
          <input type="number" placeholder="padding top" value={style.padding_top ?? ''} onChange={(e) => updateStyle('padding_top', Number(e.target.value) || 0)} style={inputStyle} />
          <input type="number" placeholder="padding bottom" value={style.padding_bottom ?? ''} onChange={(e) => updateStyle('padding_bottom', Number(e.target.value) || 0)} style={inputStyle} />
        </div>
      </details>
    </div>
  );
}

function ABStatsPanel({ groupId, onClose, onWinner }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');
  const load = async () => {
    try { setStats(await api.getABStats(groupId)); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div style={{ color: '#F87171', padding: 12 }}>{err}</div>;
  if (!stats) return <div style={{ color: '#a0a4b0', padding: 12 }}>...</div>;
  const declare = async (variant) => { await api.declareWinner(groupId, variant); await load(); onWinner?.(); };
  return (
    <div data-testid="ab-panel" style={{ padding: 16, background: BG_CARD, border: BORDER, borderRadius: 12, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ fontFamily: 'Outfit, sans-serif' }}>A/B Testing</strong>
        <button type="button" onClick={onClose} style={btnGhost()} aria-label="Close"><Icons.X size={14} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 12 }}>
        <div style={{ padding: 10, background: 'rgba(99,102,241,0.06)', borderRadius: 8 }}>A views: {stats.stats?.a_views || 0} · leads: {stats.stats?.a_leads || 0} · {stats.conversion_rate_a}%</div>
        <div style={{ padding: 10, background: 'rgba(236,72,153,0.06)', borderRadius: 8 }}>B views: {stats.stats?.b_views || 0} · leads: {stats.stats?.b_leads || 0} · {stats.conversion_rate_b}%</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#a0a4b0' }}>Chi-square: {stats.chi_square?.stat ?? 0} · {stats.chi_square?.significant ? 'significativo' : 'aun no significativo'}</div>
      {!stats.winner_id ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button type="button" onClick={() => declare('A')} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}>A gana</button>
          <button type="button" onClick={() => declare('B')} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}>B gana</button>
          <button type="button" onClick={() => declare(null)} disabled={!stats.can_declare} style={btnGradient({ padding: '6px 10px', fontSize: 12, opacity: stats.can_declare ? 1 : 0.5 })}>Auto</button>
        </div>
      ) : (
        <div style={{ marginTop: 10, color: '#22C55E', fontSize: 13, fontWeight: 600 }}>Ganador declarado</div>
      )}
    </div>
  );
}

const ROUTING_STRATEGIES = [
  { key: 'asesor_directo', label: 'Asesor directo · owner landing' },
  { key: 'hybrid', label: 'Hibrido · zone → load → round robin' },
  { key: 'round_robin', label: 'Round robin · turno equipo' },
  { key: 'by_zone', label: 'Por zona · match colonias asesor' },
  { key: 'by_load', label: 'Por carga · asesor con menos leads' },
  { key: 'by_disc', label: 'Por DISC · match perfil asesor' },
  { key: 'manual_queue', label: 'Cola manual · asignacion human' },
];

function RoutingConfigPanel({ landing, userRole, onToast, onChanged }) {
  const isAdmin = ['inmobiliaria_admin', 'tenant_admin', 'superadmin'].includes(userRole);
  const [cfg, setCfg] = useState(landing.lead_routing_config || { strategy: isAdmin ? 'hybrid' : 'asesor_directo', priority_order: ['by_zone', 'by_load', 'round_robin'], override_score_threshold: 80, override_pin_asesor_id: null });
  const [saving, setSaving] = useState(false);

  const persist = async (next) => {
    setCfg(next);
    setSaving(true);
    try {
      await api.updateRoutingConfig(landing.id, next);
      onToast('Routing actualizado');
      onChanged?.();
    } catch (e) {
      onToast(e.body?.detail || 'No se pudo actualizar routing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="routing-panel" style={{ marginTop: 12, padding: 12, background: BG_CARD, border: BORDER, borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: '#a0a4b0', marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Routing de Leads {saving ? '· guardando...' : ''}
      </div>
      <select data-testid="routing-strategy" value={cfg.strategy} onChange={(e) => persist({ ...cfg, strategy: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.3)', color: '#F0EBE0', fontSize: 12 }}>
        {ROUTING_STRATEGIES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      {cfg.strategy === 'hybrid' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#a0a4b0', marginBottom: 6 }}>Priority order ({(cfg.priority_order || []).join(' → ')})</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['by_zone', 'by_load', 'by_disc', 'round_robin'].map((s) => {
              const on = (cfg.priority_order || []).includes(s);
              return (
                <button key={s} type="button" onClick={() => { const cur = cfg.priority_order || []; const next = on ? cur.filter((x) => x !== s) : [...cur, s]; persist({ ...cfg, priority_order: next }); }} style={{ padding: '4px 10px', borderRadius: 9999, background: on ? GRADIENT : 'rgba(99,102,241,0.12)', color: on ? '#fff' : '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', fontSize: 11 }}>{s}</button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11, color: '#a0a4b0' }}>Override score threshold ({cfg.override_score_threshold || 80})
          <input data-testid="routing-threshold" type="range" min="0" max="100" step="5" value={cfg.override_score_threshold || 80} onChange={(e) => setCfg({ ...cfg, override_score_threshold: Number(e.target.value) })} onMouseUp={() => persist(cfg)} onTouchEnd={() => persist(cfg)} style={{ width: '100%', marginTop: 4 }} />
        </label>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11, color: '#a0a4b0' }}>Pin manual asesor (user_id)
          <input data-testid="routing-pin" value={cfg.override_pin_asesor_id || ''} onChange={(e) => setCfg({ ...cfg, override_pin_asesor_id: e.target.value || null })} onBlur={() => persist(cfg)} placeholder="vacio = sin pin" style={{ width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.3)', color: '#F0EBE0', fontSize: 12 }} />
        </label>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#a0a4b0' }}>{isAdmin ? '✓ Eres admin · cambios aplican al equipo' : 'Modo asesor · sin team routing'}</div>
    </div>
  );
}

function EditorLayout({ landing, brandKit, linkedEntity, themes, onBack, onChanged, onToast, userRole }) {
  const [sections, setSections] = useState(landing.sections || []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [showThemeSwitcher, setShowThemeSwitcher] = useState(false);
  const [viewport, setViewport] = useState('desktop');
  const [showAB, setShowAB] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // saving | saved | error
  const [templateKey, setTemplateKey] = useState(landing.template_key);
  const [theme, setTheme] = useState(landing.theme || null);
  // Z.8.6 · theme_mode dark/light · default per template signature
  const [themeMode, setThemeMode] = useState(landing.theme_mode || 'dark');
  const dragIdx = useRef(null);
  const debounce = useRef(null);

  const toggleThemeMode = async () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    try {
      await api.updateThemeMode(landing.id, next);
      onToast(`Modo ${next === 'dark' ? 'oscuro' : 'claro'} activo`);
    } catch (e) {
      onToast(e.body?.detail || 'No se pudo cambiar modo');
      setThemeMode(themeMode); // revert
    }
  };

  const persist = (next) => {
    setSections(next);
    setSaveStatus('saving');
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        await api.patchSections(landing.id, next);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1800);
  };

  const handleDragStart = (e, i) => { dragIdx.current = i; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e, dst) => {
    e.preventDefault();
    const src = dragIdx.current;
    if (src == null || src === dst) return;
    const next = [...sections];
    const [moved] = next.splice(src, 1);
    next.splice(dst, 0, moved);
    persist(next);
    setActiveIdx(dst);
  };
  const handleAdd = (type) => {
    const newSec = { id: `s_${type}_${Date.now()}`, type, config: {}, style_overrides: {}, visible: true };
    persist([...sections, newSec]);
    setActiveIdx(sections.length);
    setShowPicker(false);
    onToast('Seccion anadida');
  };
  const handleRemove = (i) => {
    const next = [...sections];
    next.splice(i, 1);
    persist(next);
    setActiveIdx(Math.max(0, i - 1));
  };
  const handleToggleVis = (i) => {
    const next = [...sections];
    next[i] = { ...next[i], visible: next[i].visible === false ? true : false };
    persist(next);
  };
  const handleSectionChange = (i, sec) => {
    const next = [...sections];
    next[i] = sec;
    persist(next);
  };

  const undo = async () => {
    try {
      const r = await api.undoSections(landing.id);
      if (r.ok) { setSections(r.sections); onToast('Deshecho'); }
    } catch (e) { onToast(e.body?.detail || 'Nada que deshacer'); }
  };

  const switchTemplate = async (newKey) => {
    if (!newKey || newKey === templateKey) return;
    setSaveStatus('saving');
    try {
      await api.patchLanding(landing.id, { template_key: newKey });
      setTemplateKey(newKey);
      const fresh = await api.getLanding(landing.id);
      setTheme(fresh?.landing?.theme || null);
      setSaveStatus('saved');
      onToast('Template aplicado');
    } catch (e) {
      setSaveStatus('error');
      onToast(e.body?.detail || 'No se pudo cambiar template');
    }
  };

  const togglePublish = async () => {
    try {
      await api.publishLanding(landing.id, !landing.published);
      onToast(landing.published ? 'Despublicada' : 'Publicada');
      onChanged?.();
    } catch (e) { onToast(e.message); }
  };

  const deleteIt = async () => {
    if (!window.confirm('Borrar esta landing?')) return;
    try { await api.deleteLanding(landing.id); onToast('Eliminada'); onBack(); } catch (e) { onToast(e.message); }
  };

  const maxW = VIEWPORTS[viewport];
  const activeThemeMeta = (themes || []).find((tm) => tm.key === templateKey);

  return (
    <div data-testid="editor-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 30%) 1fr', gap: 16, minHeight: '70vh' }}>
      {/* LEFT sidebar */}
      <aside style={{ background: BG_CARD, border: BORDER, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button data-testid="editor-back" type="button" onClick={onBack} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}>
            <Icons.ChevronLeft size={12} /> Volver
          </button>
          <span style={{ fontSize: 11, color: '#a0a4b0' }}>
            {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? 'Guardado' : 'Error guardado'}
          </span>
        </div>
        <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, color: '#F0EBE0', marginBottom: 8 }}>Secciones · {sections.length}</strong>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 200, marginBottom: 12 }}>
          {sections.map((sec, i) => (
            <React.Fragment key={sec.id || i}>
              <SectionRow
                section={sec}
                index={i}
                isActive={activeIdx === i}
                onClick={() => setActiveIdx(activeIdx === i ? -1 : i)}
                onToggleVis={() => handleToggleVis(i)}
                onRemove={() => handleRemove(i)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
              {activeIdx === i && <SectionInlineEditor section={sec} onChange={(s) => handleSectionChange(i, s)} />}
            </React.Fragment>
          ))}
          {!sections.length && (
            <div data-testid="editor-empty" style={{ padding: 20, textAlign: 'center', color: 'rgba(240,235,224,0.5)', fontSize: 13 }}>
              Anade tu primera seccion. Click + para empezar.
            </div>
          )}
        </div>
        <button data-testid="add-section-btn" type="button" onClick={() => setShowPicker(true)} style={btnGradient({ width: '100%', justifyContent: 'center' })}>
          <Icons.Plus size={14} /> Anadir seccion
        </button>
        <SectionPickerModal open={showPicker} onClose={() => setShowPicker(false)} onAdd={handleAdd} />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button data-testid="editor-undo" type="button" onClick={undo} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}><Icons.Undo size={12} /> Undo</button>
          <button data-testid="editor-switch-template" type="button" onClick={() => setShowThemeSwitcher(!showThemeSwitcher)} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}>
            <Icons.Palette size={12} /> {showThemeSwitcher ? 'Cerrar' : 'Cambiar template'}
          </button>
          <button data-testid="editor-theme-mode" type="button" onClick={toggleThemeMode} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}>
            {themeMode === 'dark' ? <Icons.Sun size={12} /> : <Icons.Moon size={12} />} Modo {themeMode === 'dark' ? 'claro' : 'oscuro'}
          </button>
          {landing.landing_type === 'property' && (
            <>
              <button data-testid="editor-apply-structure" type="button" onClick={async () => { try { const r = await api.applyTemplateStructure(landing.id); onToast(`Template aplicado · ${r.sections_count} secciones`); onChanged?.(); } catch (e) { onToast(e.body?.detail || 'No se pudo aplicar'); } }} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}>
                <Icons.LayoutTemplate size={12} /> Aplicar estructura
              </button>
              <button data-testid="editor-auto-fill" type="button" onClick={async () => { try { await api.autoFillLanding(landing.id); onToast('Auto-fill DMX completo · copy + data Atlax'); onChanged?.(); } catch (e) { onToast(e.body?.detail || 'No se pudo auto-fill'); } }} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}>
                <Icons.Sparkles size={12} /> Auto-fill Atlax
              </button>
            </>
          )}
          {!landing.ab_group_id ? null : (
            <button data-testid="editor-ab" type="button" onClick={() => setShowAB(!showAB)} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}><Icons.GitBranch size={12} /> A/B</button>
          )}
        </div>
        {landing.landing_type === 'property' && (
          <RoutingConfigPanel landing={landing} userRole={userRole} onToast={onToast} onChanged={onChanged} />
        )}
        {showThemeSwitcher && (
          <div data-testid="theme-switcher-panel" style={{ marginTop: 12, padding: 12, background: BG_CARD, border: BORDER, borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: '#a0a4b0', marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Template activo · sections se preservan</div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {(themes || []).map((tm) => (
                <ThemeCard key={tm.key} themeMeta={tm} active={templateKey === tm.key} onSelect={() => switchTemplate(tm.key)} compact />
              ))}
            </div>
            {activeThemeMeta && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#a0a4b0' }}>
                Hero variant: <strong style={{ color: '#F0EBE0' }}>{activeThemeMeta.hero_variant}</strong> · spacing {activeThemeMeta.spacing_scale}
              </div>
            )}
          </div>
        )}
        {showAB && landing.ab_group_id && (
          <ABStatsPanel groupId={landing.ab_group_id} onClose={() => setShowAB(false)} onWinner={onChanged} />
        )}
      </aside>

      {/* RIGHT preview */}
      <section style={{ background: BG_CARD, border: BORDER, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.keys(VIEWPORTS).map((vp) => (
              <button key={vp} data-testid={`vp-${vp}`} type="button" onClick={() => setViewport(vp)} style={{ ...btnSecondary({ padding: '6px 12px', fontSize: 12 }), background: viewport === vp ? GRADIENT : 'rgba(99,102,241,0.12)', color: viewport === vp ? '#fff' : '#F0EBE0' }}>
                {vp === 'desktop' ? <Icons.Monitor size={12} /> : vp === 'tablet' ? <Icons.Tablet size={12} /> : <Icons.Smartphone size={12} />}
                {vp}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a data-testid="open-preview" href={`/landing/${landing.slug}?preview=1`} target="_blank" rel="noreferrer" style={{ ...btnSecondary(), textDecoration: 'none' }}>
              <Icons.ExternalLink size={12} /> Preview
            </a>
            <a data-testid="export-pdf" href={api.exportPdfUrl(landing.id)} target="_blank" rel="noreferrer" style={{ ...btnSecondary(), textDecoration: 'none' }}>
              <Icons.FileDown size={12} /> PDF
            </a>
            <button data-testid="publish-btn" type="button" onClick={togglePublish} style={btnGradient()}>
              {landing.published ? 'Despublicar' : 'Publicar'}
            </button>
            <button data-testid="delete-btn" type="button" onClick={deleteIt} style={btnSecondary({ color: '#F87171', borderColor: '#F87171aa' })} aria-label="Delete"><Icons.Trash2 size={12} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', borderRadius: 14, background: theme?.palette?.bg || '#06080F', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'center', padding: 12, transition: `background 320ms ${EASE}` }}>
          <div style={{ width: '100%', maxWidth: maxW, transition: `max-width 320ms ${EASE}, background 320ms ${EASE}`, background: theme?.palette?.bg || '#06080F', borderRadius: 10, overflow: 'auto', maxHeight: '70vh' }}>
            {sections.length ? sections.map((sec) => {
              const sectionConfig = sec.type === 'marketplace'
                ? { ...(sec.config || {}), marketplace_config: landing.content?.marketplace_config }
                : sec.config;
              return (
                <SectionRenderer key={sec.id} section={{ ...sec, config: sectionConfig }} brandKit={brandKit} linkedEntity={linkedEntity} isPreview theme={theme} onLead={() => Promise.resolve({ ok: true })} landingSlug={landing.slug} templateKey={landing.template_key} themeMode={themeMode} />
              );
            }) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'rgba(240,235,224,0.4)' }}>Preview vacio · anade secciones</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function LandingCard({ item, onOpen, onDelete, themes }) {
  const { t } = useTranslation('common');
  const themeMeta = (themes || []).find((tm) => tm.key === item.template_key);
  const pal = themeMeta?.preview_palette || {};
  const cardBg = pal.gradient || `linear-gradient(135deg, ${pal.primary || '#6366F1'}40, ${pal.secondary || '#EC4899'}40)`;
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
  const handleDeleteClick = (e) => { stop(e); if (onDelete) onDelete(item); };
  return (
    <div data-testid={`landing-card-wrapper-${item.id}`} style={{ position: 'relative' }}>
      <button data-testid={`landing-card-${item.id}`} type="button" onClick={onOpen} style={{ width: '100%', textAlign: 'left', background: BG_CARD, border: BORDER, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0, color: '#F0EBE0', transition: `transform 320ms ${EASE}` }}>
        <div style={{ aspectRatio: '16/9', background: cardBg, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 10, right: 10, padding: '4px 10px', borderRadius: 9999, background: item.published ? 'rgba(34,197,94,0.85)' : 'rgba(99,102,241,0.5)', color: '#fff', fontSize: 11, fontWeight: 700 }}>
            {item.published ? 'Publicada' : 'Borrador'}
          </div>
          {item.landing_type && (
            <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11 }}>
              {item.landing_type}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#fff', fontSize: 11, padding: '2px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 9999 }}>
            {(item.sections || []).length} secciones
          </div>
          {themeMeta && (
            <div style={{ position: 'absolute', bottom: 10, right: 10, padding: '4px 8px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <PaletteDots palette={pal} />
              {item.template_key}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 14px 14px 14px' }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 38 }}>{item.content?.hero?.title || item.slug}</div>
          <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/landing/{item.slug}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>
            <span>{item.views_count || 0} vistas</span>
            <span>· {item.leads_count || 0} leads</span>
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          data-testid={`landing-card-delete-${item.id}`}
          type="button"
          onClick={handleDeleteClick}
          onMouseDown={stop}
          aria-label={t('studio.landings.delete') || 'Eliminar'}
          title={t('studio.landings.delete') || 'Eliminar'}
          style={{ position: 'absolute', bottom: 56, right: 12, zIndex: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(248,113,113,0.18)', border: '1px solid rgba(248,113,113,0.45)', color: '#F87171', cursor: 'pointer', padding: 0 }}
        >
          <Icons.Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export default function LandingsPage({ user, onLogout }) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAIWizard, setShowAIWizard] = useState(false);
  const [aiTpl, setAiTpl] = useState('luxury');
  const [intakes, setIntakes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ status: '', template_key: '', project_id: '' });
  const [toast, setToast] = useState('');
  const [starters, setStarters] = useState({ property: [], personal_brand: [], marketplace: [] });
  const [developments, setDevelopments] = useState([]);
  const [asesor, setAsesor] = useState(null);
  const [themes, setThemes] = useState([]);
  const [marketplaceFacets, setMarketplaceFacets] = useState(null);
  const [editingFull, setEditingFull] = useState(null); // landing + brand_kit + linked_entity

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.listLandings(filters);
      setItems(r.items || []);
    } catch (e) { console.error(e); } // eslint-disable-line no-console
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filters.status, filters.template_key, filters.project_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const [s, d, a, th, mf] = await Promise.all([
          api.getStarters().catch(() => null),
          api.catalogDevelopments().catch(() => null),
          api.catalogAsesor().catch(() => null),
          api.listThemes().catch(() => null),
          api.previewMarketplace('_new', {}).catch(() => null),
        ]);
        if (s) setStarters(s);
        if (d) setDevelopments(d.items || []);
        if (a) setAsesor(a);
        if (th && th.themes) setThemes(th.themes);
        if (mf && mf.facets) setMarketplaceFacets(mf.facets);
      } catch (e) { /* fail-soft */ }
    })();
  }, []);

  // Z.8.7 Sub-B2 · Carga intakes para mostrar landings con IA del usuario
  useEffect(() => {
    (async () => {
      try {
        const r = await listIntakes({ limit: 30 });
        setIntakes(r.items || []);
      } catch (e) { /* fail-soft · puede no estar disponible aun */ }
    })();
  }, []);

  const refreshEdit = async () => {
    if (!editing) return;
    try {
      const r = await api.getLanding(editing.id);
      setEditing(r.landing);
      const pub = await api.getPublicLanding(r.landing.slug, true).catch(() => null);
      setEditingFull({ landing: r.landing, brand_kit: pub?.brand_kit, linked_entity: pub?.landing?.linked_entity });
      await load();
    } catch (e) { console.error(e); } // eslint-disable-line no-console
  };

  const openEdit = async (item) => {
    setEditing(item);
    try {
      const pub = await api.getPublicLanding(item.slug, true).catch(() => null);
      setEditingFull({ landing: item, brand_kit: pub?.brand_kit, linked_entity: pub?.landing?.linked_entity });
    } catch (e) {
      setEditingFull({ landing: item, brand_kit: null, linked_entity: null });
    }
  };

  const handleDeleteCard = async (item) => {
    if (!item?.id) return;
    const msg = t('studio.landings.confirm_delete') || 'Borrar esta landing? La accion no se puede deshacer.';
    // eslint-disable-next-line no-alert
    if (!window.confirm(msg)) return;
    const prev = items;
    setItems((arr) => arr.filter((x) => x.id !== item.id)); // optimistic
    // Si el usuario estaba viendo el editor del landing eliminado · cerrar
    if (editing && editing.id === item.id) { setEditing(null); setEditingFull(null); }
    try {
      await api.deleteLanding(item.id);
      setToast(t('studio.landings.toast_deleted') || 'Landing eliminada.');
      await load(); // refetch real para asegurar consistencia
    } catch (e) {
      setItems(prev); // revert
      setToast(e?.message || 'Error al eliminar');
    }
  };

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="landings-page" style={{ padding: '24px 8px', color: '#F0EBE0', fontFamily: 'DM Sans, sans-serif' }}>
        {editing && editingFull ? (
          <EditorLayout
            landing={editing}
            brandKit={editingFull.brand_kit}
            linkedEntity={editingFull.linked_entity}
            themes={themes}
            onBack={() => { setEditing(null); setEditingFull(null); }}
            onChanged={refreshEdit}
            onToast={setToast}
            userRole={user?.role}
          />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
              <div>
                <div style={{ letterSpacing: '0.3em', fontSize: 11, color: '#6366F1', textTransform: 'uppercase' }}>DMX STUDIO · Z.8.2</div>
                <h1 style={{ margin: '8px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', fontWeight: 800 }}>{t('studio.landings.title')}</h1>
                <p style={{ color: 'rgba(240,235,224,0.62)', marginTop: 6, maxWidth: 640 }}>{t('studio.landings.subtitle')}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button data-testid="new-ai-landing-btn" type="button" onClick={() => setShowAIWizard(true)} style={btnSecondary({ padding: '12px 20px', fontSize: 14, borderColor: '#EC4899', color: '#F0EBE0' })}>
                  <Icons.Sparkles size={16} color="#EC4899" /> Crear con IA
                </button>
                <button data-testid="new-landing-btn" type="button" onClick={() => setShowCreate(true)} style={btnGradient({ padding: '12px 22px', fontSize: 14 })}>
                  <Icons.Plus size={16} /> Nueva landing
                </button>
              </div>
            </div>

            {intakes.length > 0 && (
              <div data-testid="ai-intakes-list" style={{ marginBottom: 28, padding: 16, background: BG_CARD, border: BORDER, borderRadius: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Icons.Sparkles size={14} color="#EC4899" />
                  <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14 }}>Landings con IA ({intakes.length})</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {intakes.map((it) => (
                    <button key={it.id} type="button" data-testid={`intake-card-${it.id}`} onClick={() => navigate(`/portal/studio/property-intake/${it.id}`)} style={{ textAlign: 'left', padding: 12, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 12, cursor: 'pointer', color: '#F0EBE0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13 }}>{it.project_name}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(236,72,153,0.18)', borderRadius: 9999, color: '#F472B6' }}>{it.template_key}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginTop: 4 }}>/landing/{it.slug}</div>
                      <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 4 }}>
                        {it.generated_copy_cached ? 'copy IA ok' : 'sin copy IA'} · {it.property_type}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              <select data-testid="filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }}>
                <option value="">Todas</option>
                <option value="published">Publicadas</option>
                <option value="draft">Borradores</option>
              </select>
              <select data-testid="filter-template" value={filters.template_key} onChange={(e) => setFilters({ ...filters, template_key: e.target.value })} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }}>
                <option value="">Cualquier template</option>
                {(themes && themes.length ? themes.map((tm) => ({ k: tm.key, label: tm.name })) : TEMPLATE_KEYS_DEFAULT.map((k) => ({ k, label: k }))).map((it) => <option key={it.k} value={it.k}>{it.label}</option>)}
              </select>
            </div>

            {loading ? (
              <div data-testid="loading">Cargando...</div>
            ) : !items.length ? (
              <div data-testid="empty" style={{ padding: 48, textAlign: 'center', background: BG_CARD, border: BORDER, borderRadius: 16 }}>
                <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif' }}>Aun no tienes landings</h3>
                <p style={{ color: 'rgba(240,235,224,0.62)', marginTop: 8 }}>Crea tu primera landing con uno de los 3 starters.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
                {items.map((it) => <LandingCard key={it.id} item={it} onOpen={() => openEdit(it)} onDelete={handleDeleteCard} themes={themes} />)}
              </div>
            )}
          </>
        )}
      </div>

      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(landing) => { setShowCreate(false); openEdit(landing); load(); setToast('Landing creada'); }}
        starters={starters}
        developments={developments}
        asesor={asesor}
        themes={themes}
        marketplaceFacets={marketplaceFacets}
      />
      {showAIWizard && (
        <div data-testid="ai-wizard" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ width: 'min(640px, 100%)', background: BG_CARD, border: BORDER, borderRadius: 20, padding: 26, color: '#F0EBE0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div style={{ letterSpacing: '0.25em', fontSize: 11, color: '#EC4899', textTransform: 'uppercase' }}>Studio Z.8.7</div>
                <h2 style={{ margin: '6px 0 0', fontFamily: 'Outfit, sans-serif' }}>Crear landing con IA</h2>
                <p style={{ marginTop: 6, fontSize: 13, color: 'rgba(240,235,224,0.62)' }}>Selecciona un template y completa las 14 secciones · la IA generara el copy automaticamente.</p>
              </div>
              <button type="button" data-testid="ai-wizard-close" onClick={() => setShowAIWizard(false)} style={btnGhost()}><Icons.X size={16} /></button>
            </div>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,235,224,0.7)', marginBottom: 6, fontWeight: 600 }}>Template visual</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginBottom: 20 }}>
              {Z87_TEMPLATE_KEYS.map((k) => (
                <button key={k} type="button" data-testid={`ai-tpl-${k}`} onClick={() => setAiTpl(k)} style={{ padding: '10px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: aiTpl === k ? 'rgba(99,102,241,0.25)' : 'rgba(13,16,23,0.6)', border: aiTpl === k ? '1px solid #6366F1' : '1px solid rgba(99,102,241,0.18)', color: '#F0EBE0', cursor: 'pointer' }}>{k}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAIWizard(false)} style={btnSecondary()}>Cancelar</button>
              <button type="button" data-testid="ai-wizard-start" onClick={() => { setShowAIWizard(false); navigate(`/portal/studio/property-intake/new?template=${aiTpl}`); }} style={btnGradient()}><Icons.Sparkles size={14} /> Empezar</button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast} onClose={() => setToast('')} />
    </PortalLayout>
  );
}
