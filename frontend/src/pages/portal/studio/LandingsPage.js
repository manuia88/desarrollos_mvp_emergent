// W5.22 Z.8.2 — LandingsPage REWORK: split-pane editor + drag-drop + multi-step modal
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import * as api from '../../../api/studio_z8';
import * as Icons from 'lucide-react';
import { SECTION_TYPES, SECTION_META } from '../../../components/studio/sections/SectionRenderer';
import SectionRenderer from '../../../components/studio/sections/SectionRenderer';

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

function Toast({ msg, onClose }) {
  useEffect(() => { if (msg) { const id = setTimeout(onClose, 3200); return () => clearTimeout(id); } return undefined; }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div data-testid="toast" style={{ position: 'fixed', bottom: 24, right: 24, background: BG_CARD, color: '#F0EBE0', padding: '12px 18px', borderRadius: 9999, border: BORDER, zIndex: 1100, backdropFilter: 'blur(24px)', transition: `transform 320ms ${EASE}` }}>
      {msg}
    </div>
  );
}

function CreateModal({ open, onClose, onCreated, starters, developments, asesor }) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(1);
  const [landingType, setLandingType] = useState('property');
  const [linkedEntityId, setLinkedEntityId] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [tpl, setTpl] = useState('modern');
  const [starterKey, setStarterKey] = useState('property');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchDev, setSearchDev] = useState('');

  useEffect(() => {
    if (!open) {
      setStep(1); setLandingType('property'); setLinkedEntityId(''); setTitle(''); setSlug('');
      setTpl('modern'); setStarterKey('property'); setError(''); setSearchDev('');
    }
  }, [open]);

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
      });
      onCreated(r.landing);
    } catch (e) {
      setError(e.body?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div data-testid="create-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: 'min(900px, 100%)', maxHeight: '90vh', overflow: 'auto', background: BG_CARD, border: BORDER, borderRadius: 20, padding: 28, color: '#F0EBE0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ letterSpacing: '0.25em', fontSize: 11, color: '#6366F1', textTransform: 'uppercase' }}>Paso {step}/3</div>
            <h2 style={{ margin: '4px 0 0', fontFamily: 'Outfit, sans-serif' }}>
              {step === 1 && 'Que landing quieres crear?'}
              {step === 2 && (landingType === 'property' ? 'Selecciona la propiedad' : landingType === 'personal_brand' ? 'Confirma tu marca' : 'Define el alcance')}
              {step === 3 && 'Detalles finales'}
            </h2>
          </div>
          <button data-testid="modal-close" type="button" onClick={onClose} style={btnGhost()} aria-label="Close"><Icons.X size={18} /></button>
        </div>

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
            <input data-testid="search-dev" placeholder="Buscar proyecto..." value={searchDev} onChange={(e) => setSearchDev(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0', marginBottom: 14 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, maxHeight: 360, overflow: 'auto' }}>
              {filteredDevs.map((d) => (
                <button key={d.id} type="button" data-testid={`dev-${d.id}`} onClick={() => { setLinkedEntityId(d.id); if (!title) setTitle(d.name); }} style={{ padding: 14, borderRadius: 10, background: linkedEntityId === d.id ? 'rgba(99,102,241,0.18)' : 'rgba(13,16,23,0.6)', border: linkedEntityId === d.id ? '2px solid #6366F1' : '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', textAlign: 'left', color: '#F0EBE0' }}>
                  <div style={{ fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>{d.colonia} · {d.stage}</div>
                </button>
              ))}
            </div>
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
          <div data-testid="step-marketplace" style={{ padding: 18, borderRadius: 12, background: 'rgba(13,16,23,0.6)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p style={{ color: 'rgba(240,235,224,0.7)', margin: 0, fontSize: 14 }}>Tu marketplace mostrara hasta 12 proyectos publicos del catalogo. Podras filtrar por zona y precio en el editor.</p>
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
            <label style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>Template visual
              <select data-testid="detail-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)} style={{ marginTop: 6, width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0' }}>
                {['modern', 'luxury', 'family', 'investor', 'boutique', 'urgent', 'scrollytelling', 'video_first', 'social_proof', 'compare'].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>Starter (sections precargadas)
              <select data-testid="detail-starter" value={starterKey} onChange={(e) => setStarterKey(e.target.value)} style={{ marginTop: 6, width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0' }}>
                <option value="property">Property starter ({(starters?.property || []).length} secciones)</option>
                <option value="personal_brand">Personal brand ({(starters?.personal_brand || []).length} secciones)</option>
                <option value="marketplace">Marketplace ({(starters?.marketplace || []).length} secciones)</option>
              </select>
            </label>
          </div>
        )}

        {error && <div data-testid="modal-error" style={{ color: '#F87171', marginTop: 14, fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
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

function EditorLayout({ landing, brandKit, linkedEntity, starters, onBack, onChanged, onToast }) {
  const [sections, setSections] = useState(landing.sections || []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [viewport, setViewport] = useState('desktop');
  const [showAB, setShowAB] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // saving | saved | error
  const dragIdx = useRef(null);
  const debounce = useRef(null);

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

  const previewLanding = { ...landing, sections, brand_kit: brandKit };
  const maxW = VIEWPORTS[viewport];

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
          {!landing.ab_group_id ? null : (
            <button data-testid="editor-ab" type="button" onClick={() => setShowAB(!showAB)} style={btnSecondary({ padding: '6px 10px', fontSize: 12 })}><Icons.GitBranch size={12} /> A/B</button>
          )}
        </div>
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

        <div style={{ flex: 1, overflow: 'auto', borderRadius: 14, background: '#06080F', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'center', padding: 12 }}>
          <div style={{ width: '100%', maxWidth: maxW, transition: `max-width 320ms ${EASE}`, background: '#06080F', borderRadius: 10, overflow: 'auto', maxHeight: '70vh' }}>
            {sections.length ? sections.map((sec) => (
              <SectionRenderer key={sec.id} section={sec} brandKit={brandKit} linkedEntity={linkedEntity} isPreview onLead={() => Promise.resolve({ ok: true })} />
            )) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'rgba(240,235,224,0.4)' }}>Preview vacio · anade secciones</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function LandingCard({ item, onOpen }) {
  return (
    <button data-testid={`landing-card-${item.id}`} type="button" onClick={onOpen} style={{ textAlign: 'left', background: BG_CARD, border: BORDER, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0, color: '#F0EBE0', transition: `transform 320ms ${EASE}` }}>
      <div style={{ aspectRatio: '16/9', background: `linear-gradient(135deg, rgba(99,102,241,0.25), rgba(236,72,153,0.25))`, position: 'relative' }}>
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
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600 }}>{item.content?.hero?.title || item.slug}</div>
        <div style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)', marginTop: 4 }}>/landing/{item.slug}</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>
          <span>{item.views_count || 0} vistas</span>
          <span>· {item.leads_count || 0} leads</span>
        </div>
      </div>
    </button>
  );
}

export default function LandingsPage({ user, onLogout }) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ status: '', template_key: '', project_id: '' });
  const [toast, setToast] = useState('');
  const [starters, setStarters] = useState({ property: [], personal_brand: [], marketplace: [] });
  const [developments, setDevelopments] = useState([]);
  const [asesor, setAsesor] = useState(null);
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
        const [s, d, a] = await Promise.all([
          api.getStarters().catch(() => null),
          api.catalogDevelopments().catch(() => null),
          api.catalogAsesor().catch(() => null),
        ]);
        if (s) setStarters(s);
        if (d) setDevelopments(d.items || []);
        if (a) setAsesor(a);
      } catch (e) { /* fail-soft */ }
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

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="landings-page" style={{ padding: '24px 8px', color: '#F0EBE0', fontFamily: 'DM Sans, sans-serif' }}>
        {editing && editingFull ? (
          <EditorLayout
            landing={editing}
            brandKit={editingFull.brand_kit}
            linkedEntity={editingFull.linked_entity}
            starters={starters}
            onBack={() => { setEditing(null); setEditingFull(null); }}
            onChanged={refreshEdit}
            onToast={setToast}
          />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
              <div>
                <div style={{ letterSpacing: '0.3em', fontSize: 11, color: '#6366F1', textTransform: 'uppercase' }}>DMX STUDIO · Z.8.2</div>
                <h1 style={{ margin: '8px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', fontWeight: 800 }}>{t('studio.landings.title')}</h1>
                <p style={{ color: 'rgba(240,235,224,0.62)', marginTop: 6, maxWidth: 640 }}>{t('studio.landings.subtitle')}</p>
              </div>
              <button data-testid="new-landing-btn" type="button" onClick={() => setShowCreate(true)} style={btnGradient({ padding: '12px 22px', fontSize: 14 })}>
                <Icons.Plus size={16} /> Nueva landing
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              <select data-testid="filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }}>
                <option value="">Todas</option>
                <option value="published">Publicadas</option>
                <option value="draft">Borradores</option>
              </select>
              <select data-testid="filter-template" value={filters.template_key} onChange={(e) => setFilters({ ...filters, template_key: e.target.value })} style={{ padding: '8px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)' }}>
                <option value="">Cualquier template</option>
                {['modern', 'luxury', 'family', 'investor', 'boutique', 'urgent', 'scrollytelling', 'video_first', 'social_proof', 'compare'].map((k) => <option key={k} value={k}>{k}</option>)}
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
                {items.map((it) => <LandingCard key={it.id} item={it} onOpen={() => openEdit(it)} />)}
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
      />
      <Toast msg={toast} onClose={() => setToast('')} />
    </PortalLayout>
  );
}
