// W5.22 Z.8.7 Sub-B2 · PropertyIntakeForm · 14 secciones · split-pane preview · auto-save · IA
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from 'lucide-react';
import PortalLayout from '../../../components/shared/PortalLayout';
import TemplateDispatcher, { TEMPLATE_KEYS } from '../../../templates/landings/TemplateDispatcher';
import { createIntake, getIntake, patchIntake, generateCopy, publishIntake } from '../../../api/studio_intake';
import { useAuth } from '../../../App';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const BG_CARD = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(255,255,255,0.10)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const btnGradient = (x = {}) => ({ padding: '10px 18px', background: GRADIENT, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, transition: `transform 320ms ${EASE}`, ...x });
const btnSecondary = (x = {}) => ({ padding: '10px 16px', background: 'rgba(99,102,241,0.12)', color: '#F0EBE0', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, transition: `transform 320ms ${EASE}`, ...x });
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0', fontSize: 13, fontFamily: 'DM Sans, sans-serif' };
const labelStyle = { fontSize: 12, color: 'rgba(240,235,224,0.7)', display: 'block', marginBottom: 6, fontWeight: 600 };

// Mappings value → label español natural (UX-friendly · el value se sigue mandando al backend)
const PROPERTY_TYPES = [
  { value: 'development', label: 'Desarrollo nuevo (pre-venta)' },
  { value: 'resale', label: 'Reventa (propiedad existente)' },
  { value: 'rental', label: 'Renta' },
  { value: 'commercial', label: 'Local comercial' },
  { value: 'industrial', label: 'Industrial / nave' },
  { value: 'land', label: 'Terreno' },
];
const LISTING_INTENTS = [
  { value: 'sell', label: 'Vender' },
  { value: 'rent', label: 'Rentar' },
  { value: 'invest', label: 'Atraer inversionistas' },
  { value: 'promote', label: 'Promocionar (sin venta directa)' },
];
const BUYER_INTENTS = [
  { value: 'live', label: 'Para vivir' },
  { value: 'invest', label: 'Para invertir' },
  { value: 'mixed', label: 'Ambos (vivir o invertir)' },
];
const TEMPLATE_LABELS = {
  luxury: 'Lujo · serif elegante · sin precio público',
  investor: 'Inversionista · datos y proyecciones',
  family: 'Familia · escuelas, parques, calidez',
  first_home: 'Primer departamento · mensualidad accesible',
  boutique: 'Boutique · historia y materialidad',
  urgent: 'Urgente · escasez y countdown',
  social_proof: 'Testimonios · familias e inversionistas',
  video_first: 'Video · tour cinematográfico',
  compare: 'Comparativo · vs competencia',
  scrollytelling: 'Narrativa · capítulos cinemáticos',
  modern: 'Moderno · balanceado',
};
const PHOTO_CATS = [
  { value: 'exterior', label: 'Fachada / exterior' },
  { value: 'interior', label: 'Interior unidad' },
  { value: 'amenity', label: 'Amenidad' },
  { value: 'render', label: 'Render arquitectónico' },
  { value: 'drone', label: 'Drone aéreo' },
  { value: 'night', label: 'Foto nocturna' },
  { value: 'floor', label: 'Plano de planta' },
  { value: 'location', label: 'Contexto / barrio' },
];
const VIDEO_TYPES = [
  { value: 'walkthrough', label: 'Recorrido' },
  { value: 'drone', label: 'Drone' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'teaser', label: 'Teaser corto' },
  { value: 'interview', label: 'Entrevista' },
];

// 14 secciones · labels español natural con tildes
const SECTIONS = [
  { key: 'identity', label: '1. Identificación', icon: 'BadgeInfo' },
  { key: 'location', label: '2. Ubicación', icon: 'MapPin' },
  { key: 'developer', label: '3. Desarrollador o vendedor', icon: 'Building2' },
  { key: 'typologies', label: '4. Tipos de unidad y precios', icon: 'Layers' },
  { key: 'amenities', label: '5. Amenidades', icon: 'Sparkles' },
  { key: 'premium', label: '6. Servicios premium', icon: 'Crown' },
  { key: 'investment', label: '7. Métricas de inversión', icon: 'TrendingUp' },
  { key: 'media', label: '8. Fotos y videos', icon: 'Image' },
  { key: 'financing', label: '9. Financiamiento', icon: 'Banknote' },
  { key: 'trust', label: '10. Reputación y confianza', icon: 'ShieldCheck' },
  { key: 'advisor', label: '11. Asesor que recibe los leads', icon: 'UserCircle' },
  { key: 'legal', label: '12. Legal', icon: 'Scale' },
  { key: 'urgency', label: '13. Urgencia o promociones', icon: 'Timer' },
  { key: 'differentiators', label: '14. Lo que hace único al proyecto', icon: 'Star' },
];

function emptyIntake() {
  return {
    project_name: '',
    template_key: 'luxury',
    property_type: 'development',
    listing_intent: 'sell',
    buyer_intent: 'mixed',
    language: 'es-MX',
    country: 'MX',
    typologies: [],
    photos: [],
    videos: [],
    floor_plans: [],
    landmarks: [],
    amenities_by_category: {},
    premium_services: [],
    comparable_developments: [],
    payment_schedule: [],
    credit_options: [],
    phases: [],
    testimonials: [],
    media_mentions: [],
    certifications: [],
    awards: [],
    unique_selling_points: [],
    competitive_advantages: [],
    price_visible: true,
    assigned_advisor: { full_name: '' },
  };
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.45)', marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function ArrayChips({ list, onChange, placeholder, max = 10, testid }) {
  const [val, setVal] = useState('');
  const add = () => {
    const v = val.trim();
    if (!v || (list || []).length >= max) return;
    onChange([...(list || []), v]);
    setVal('');
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input data-testid={testid} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder={placeholder} style={inputStyle} />
        <button type="button" onClick={add} style={btnSecondary({ padding: '8px 14px' })}><Icons.Plus size={14} /></button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(list || []).map((s, i) => (
          <span key={i} style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 9999, fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {s}
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: 'rgba(240,235,224,0.7)', cursor: 'pointer', padding: 0 }}><Icons.X size={11} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionIdentity({ data, set }) {
  return (
    <div data-testid="sec-identity">
      <Field label="Nombre del proyecto" hint="Como quieres que aparezca en la landing">
        <input data-testid="f-project-name" value={data.project_name || ''} onChange={(e) => set({ project_name: e.target.value })} style={inputStyle} placeholder="Residencial Roma Norte" />
      </Field>
      <Field label="URL pública (opcional · se genera automática)" hint="a-z, 0-9, guiones · 3 a 80 caracteres">
        <input data-testid="f-slug" value={data.slug || ''} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} style={inputStyle} placeholder="residencial-roma" />
      </Field>
      <Field label="Estilo visual de la landing" hint="Define paleta, tipografía y secciones únicas">
        <select data-testid="f-template" value={data.template_key || 'luxury'} onChange={(e) => set({ template_key: e.target.value })} style={inputStyle}>
          {TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{TEMPLATE_LABELS[k] || k}</option>)}
        </select>
      </Field>
      <Field label="¿Qué tipo de propiedad es?">
        <select data-testid="f-prop-type" value={data.property_type} onChange={(e) => set({ property_type: e.target.value })} style={inputStyle}>
          {PROPERTY_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </Field>
      <Field label="¿Qué quieres lograr con esta landing?">
        <select value={data.listing_intent} onChange={(e) => set({ listing_intent: e.target.value })} style={inputStyle}>
          {LISTING_INTENTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </Field>
      <Field label="¿Para qué tipo de comprador?" hint="El copy se adapta automáticamente a este perfil">
        <select data-testid="f-buyer-intent" value={data.buyer_intent || 'mixed'} onChange={(e) => set({ buyer_intent: e.target.value })} style={inputStyle}>
          {BUYER_INTENTS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </Field>
    </div>
  );
}

function SectionLocation({ data, set }) {
  return (
    <div data-testid="sec-location">
      <Field label="Direccion"><input value={data.address || ''} onChange={(e) => set({ address: e.target.value })} style={inputStyle} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Colonia"><input value={data.colonia || ''} onChange={(e) => set({ colonia: e.target.value })} style={inputStyle} /></Field>
        <Field label="Alcaldia/Municipio"><input value={data.alcaldia_municipio || ''} onChange={(e) => set({ alcaldia_municipio: e.target.value })} style={inputStyle} /></Field>
        <Field label="Ciudad"><input value={data.city || ''} onChange={(e) => set({ city: e.target.value })} style={inputStyle} /></Field>
        <Field label="Estado"><input value={data.state || ''} onChange={(e) => set({ state: e.target.value })} style={inputStyle} /></Field>
        <Field label="Lat"><input type="number" step="0.000001" value={data.lat ?? ''} onChange={(e) => set({ lat: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} /></Field>
        <Field label="Lng"><input type="number" step="0.000001" value={data.lng ?? ''} onChange={(e) => set({ lng: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} /></Field>
        <Field label="Walkscore (0-100)"><input type="number" min="0" max="100" value={data.walkscore ?? ''} onChange={(e) => set({ walkscore: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} /></Field>
        <Field label="Transitscore (0-100)"><input type="number" min="0" max="100" value={data.transitscore ?? ''} onChange={(e) => set({ transitscore: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} /></Field>
      </div>
      <Field label={`Landmarks (${(data.landmarks || []).length})`}>
        <div style={{ display: 'grid', gap: 6 }}>
          {(data.landmarks || []).map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 6 }}>
              <input value={l.name || ''} onChange={(e) => { const next = [...data.landmarks]; next[i] = { ...l, name: e.target.value }; set({ landmarks: next }); }} placeholder="Nombre" style={inputStyle} />
              <input value={l.type || ''} onChange={(e) => { const next = [...data.landmarks]; next[i] = { ...l, type: e.target.value }; set({ landmarks: next }); }} placeholder="tipo" style={inputStyle} />
              <input type="number" value={l.walking_minutes ?? ''} onChange={(e) => { const next = [...data.landmarks]; next[i] = { ...l, walking_minutes: Number(e.target.value) || 0 }; set({ landmarks: next }); }} placeholder="min" style={inputStyle} />
              <button type="button" onClick={() => set({ landmarks: data.landmarks.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
            </div>
          ))}
          <button type="button" onClick={() => set({ landmarks: [...(data.landmarks || []), { name: '', type: '', walking_minutes: 0 }] })} style={btnSecondary({ alignSelf: 'flex-start' })}><Icons.Plus size={12} /> Anadir landmark</button>
        </div>
      </Field>
    </div>
  );
}

function SectionDeveloper({ data, set }) {
  const isDev = data.property_type === 'development';
  const isResale = data.property_type === 'resale';
  return (
    <div data-testid="sec-developer">
      {isDev && (
        <>
          <Field label="Nombre desarrollador (requerido para development)"><input data-testid="f-developer-name" value={data.developer_name || ''} onChange={(e) => set({ developer_name: e.target.value })} style={inputStyle} /></Field>
          <Field label="Track record (texto largo)"><textarea value={data.developer_track_record || ''} onChange={(e) => set({ developer_track_record: e.target.value })} style={{ ...inputStyle, minHeight: 110 }} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Proyectos totales"><input type="number" value={data.developer_total_projects ?? ''} onChange={(e) => set({ developer_total_projects: Number(e.target.value) || null })} style={inputStyle} /></Field>
            <Field label="Unidades entregadas"><input type="number" value={data.developer_units_delivered ?? ''} onChange={(e) => set({ developer_units_delivered: Number(e.target.value) || null })} style={inputStyle} /></Field>
          </div>
        </>
      )}
      {isResale && (
        <>
          <Field label="Tipo de duenio (requerido para resale)"><select data-testid="f-resale-owner" value={data.resale_owner_type || ''} onChange={(e) => set({ resale_owner_type: e.target.value })} style={inputStyle}><option value="">--</option><option value="owner">owner</option><option value="broker">broker</option></select></Field>
          <Field label="Anios de propiedad"><input type="number" value={data.resale_years_owned ?? ''} onChange={(e) => set({ resale_years_owned: Number(e.target.value) || null })} style={inputStyle} /></Field>
          <Field label="Motivo de venta"><input value={data.resale_reason || ''} onChange={(e) => set({ resale_reason: e.target.value })} style={inputStyle} /></Field>
        </>
      )}
      {!isDev && !isResale && (
        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(99,102,241,0.08)', color: 'rgba(240,235,224,0.7)', fontSize: 13 }}>
          Esta sección solo aplica si elegiste <strong>Desarrollo nuevo</strong> o <strong>Reventa</strong> en la sección anterior. Como tu propiedad es <strong>{(PROPERTY_TYPES.find((p) => p.value === data.property_type)?.label || data.property_type).toLowerCase()}</strong>, puedes saltarla.
        </div>
      )}
    </div>
  );
}

function SectionTypologies({ data, set }) {
  const list = data.typologies || [];
  const upd = (i, k, v) => { const next = [...list]; next[i] = { ...next[i], [k]: v }; set({ typologies: next }); };
  return (
    <div data-testid="sec-typologies">
      <div style={{ display: 'grid', gap: 10 }}>
        {list.map((t, i) => (
          <div key={i} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <input placeholder="Code" value={t.code || ''} onChange={(e) => upd(i, 'code', e.target.value)} style={inputStyle} />
              <input placeholder="Nombre" value={t.name || ''} onChange={(e) => upd(i, 'name', e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Recamaras" value={t.bedrooms ?? ''} onChange={(e) => upd(i, 'bedrooms', Number(e.target.value) || 0)} style={inputStyle} />
              <input type="number" placeholder="Banos" value={t.bathrooms ?? ''} onChange={(e) => upd(i, 'bathrooms', Number(e.target.value) || 0)} style={inputStyle} />
              <input type="number" placeholder="m2" value={t.area_m2 ?? ''} onChange={(e) => upd(i, 'area_m2', Number(e.target.value) || 0)} style={inputStyle} />
              <input type="number" placeholder="Precio MXN" value={t.price_mxn ?? ''} onChange={(e) => upd(i, 'price_mxn', Number(e.target.value) || 0)} style={inputStyle} />
              <input type="number" placeholder="Total" value={t.units_total ?? ''} onChange={(e) => upd(i, 'units_total', Number(e.target.value) || 0)} style={inputStyle} />
              <input type="number" placeholder="Disponibles" value={t.units_available ?? ''} onChange={(e) => upd(i, 'units_available', Number(e.target.value) || 0)} style={inputStyle} />
            </div>
            <button type="button" onClick={() => set({ typologies: list.filter((_, j) => j !== i) })} style={{ ...btnSecondary({ padding: '4px 10px', marginTop: 8, fontSize: 11, color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' }) }}><Icons.Trash2 size={11} /> Quitar</button>
          </div>
        ))}
        <button type="button" data-testid="add-typology" onClick={() => set({ typologies: [...list, { code: `T${list.length + 1}` }] })} style={btnSecondary({ alignSelf: 'flex-start' })}><Icons.Plus size={12} /> Anadir tipologia</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
        <Field label="Precio desde (MXN)"><input type="number" value={data.price_from_mxn ?? ''} onChange={(e) => set({ price_from_mxn: Number(e.target.value) || null })} style={inputStyle} /></Field>
        <Field label="Precio hasta (MXN)"><input type="number" value={data.price_to_mxn ?? ''} onChange={(e) => set({ price_to_mxn: Number(e.target.value) || null })} style={inputStyle} /></Field>
        <Field label="Precio visible"><select value={data.price_visible ? '1' : '0'} onChange={(e) => set({ price_visible: e.target.value === '1' })} style={inputStyle}><option value="1">Si</option><option value="0">No</option></select></Field>
      </div>
    </div>
  );
}

function SectionAmenities({ data, set }) {
  const cats = ['wellness', 'work', 'family', 'social', 'security', 'pet', 'parking', 'sustainability', 'technology', 'services'];
  const map = data.amenities_by_category || {};
  return (
    <div data-testid="sec-amenities" style={{ display: 'grid', gap: 14 }}>
      <Field label="Areas comunes (m2)"><input type="number" value={data.common_areas_m2 ?? ''} onChange={(e) => set({ common_areas_m2: Number(e.target.value) || null })} style={inputStyle} /></Field>
      {cats.map((c) => (
        <div key={c}>
          <div style={{ fontSize: 12, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>{c}</div>
          <ArrayChips list={map[c] || []} onChange={(next) => set({ amenities_by_category: { ...map, [c]: next } })} placeholder={`Amenidad ${c}`} testid={`amenity-${c}`} />
        </div>
      ))}
    </div>
  );
}

function SectionPremium({ data, set }) {
  const list = data.premium_services || [];
  return (
    <div data-testid="sec-premium" style={{ display: 'grid', gap: 10 }}>
      {list.map((s, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 32px', gap: 6 }}>
          <input placeholder="Nombre servicio" value={s.name || ''} onChange={(e) => { const next = [...list]; next[i] = { ...s, name: e.target.value }; set({ premium_services: next }); }} style={inputStyle} />
          <input placeholder="Descripcion" value={s.description || ''} onChange={(e) => { const next = [...list]; next[i] = { ...s, description: e.target.value }; set({ premium_services: next }); }} style={inputStyle} />
          <button type="button" onClick={() => set({ premium_services: list.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
        </div>
      ))}
      <button type="button" onClick={() => set({ premium_services: [...list, { name: '', description: '', included: true }] })} style={btnSecondary({ alignSelf: 'flex-start' })}><Icons.Plus size={12} /> Anadir servicio</button>
    </div>
  );
}

function SectionInvestment({ data, set }) {
  const m = data.investment_metrics || {};
  const upd = (k, v) => set({ investment_metrics: { ...m, [k]: v === '' ? null : Number(v) } });
  const required = data.template_key === 'investor';
  return (
    <div data-testid="sec-investment">
      {required && <div style={{ padding: 10, borderRadius: 8, background: 'rgba(236,72,153,0.1)', color: '#F472B6', fontSize: 12, marginBottom: 12 }}>Template=investor: al menos una metrica es requerida.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="ROI esperado %"><input data-testid="m-roi" type="number" step="0.1" value={m.expected_roi_pct ?? ''} onChange={(e) => upd('expected_roi_pct', e.target.value)} style={inputStyle} /></Field>
        <Field label="Yield anual %"><input type="number" step="0.1" value={m.expected_yield_pct ?? ''} onChange={(e) => upd('expected_yield_pct', e.target.value)} style={inputStyle} /></Field>
        <Field label="Apreciacion %"><input type="number" step="0.1" value={m.expected_capital_appreciation_pct ?? ''} onChange={(e) => upd('expected_capital_appreciation_pct', e.target.value)} style={inputStyle} /></Field>
        <Field label="Cap rate %"><input type="number" step="0.1" value={m.cap_rate_pct ?? ''} onChange={(e) => upd('cap_rate_pct', e.target.value)} style={inputStyle} /></Field>
        <Field label="Payback (anios)"><input type="number" step="0.1" value={m.payback_years ?? ''} onChange={(e) => upd('payback_years', e.target.value)} style={inputStyle} /></Field>
        <Field label="IRR %"><input type="number" step="0.1" value={m.irr_pct ?? ''} onChange={(e) => upd('irr_pct', e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <span style={labelStyle}>Comparables ({(data.comparable_developments || []).length})</span>
        {(data.comparable_developments || []).map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="Nombre" value={c.name || ''} onChange={(e) => { const next = [...data.comparable_developments]; next[i] = { ...c, name: e.target.value }; set({ comparable_developments: next }); }} style={inputStyle} />
            <input type="number" placeholder="Precio desde" value={c.price_from_mxn ?? ''} onChange={(e) => { const next = [...data.comparable_developments]; next[i] = { ...c, price_from_mxn: Number(e.target.value) || 0 }; set({ comparable_developments: next }); }} style={inputStyle} />
            <input type="number" step="0.1" placeholder="Yield %" value={c.yield_pct ?? ''} onChange={(e) => { const next = [...data.comparable_developments]; next[i] = { ...c, yield_pct: Number(e.target.value) || 0 }; set({ comparable_developments: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ comparable_developments: data.comparable_developments.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ comparable_developments: [...(data.comparable_developments || []), { name: '' }] })} style={btnSecondary()}><Icons.Plus size={12} /> Comparable</button>
      </div>
    </div>
  );
}

function SectionMedia({ data, set }) {
  const photos = data.photos || [];
  const videos = data.videos || [];
  const plans = data.floor_plans || [];
  return (
    <div data-testid="sec-media" style={{ display: 'grid', gap: 14 }}>
      <div>
        <span style={labelStyle}>Fotos ({photos.length}) · recomendado 12 o mas</span>
        {photos.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 2fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="URL" value={p.url || ''} onChange={(e) => { const next = [...photos]; next[i] = { ...p, url: e.target.value }; set({ photos: next }); }} style={inputStyle} />
            <select value={p.category || 'exterior'} onChange={(e) => { const next = [...photos]; next[i] = { ...p, category: e.target.value }; set({ photos: next }); }} style={inputStyle}>{PHOTO_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input placeholder="Caption" value={p.caption || ''} onChange={(e) => { const next = [...photos]; next[i] = { ...p, caption: e.target.value }; set({ photos: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ photos: photos.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" data-testid="add-photo" onClick={() => set({ photos: [...photos, { url: '', category: 'exterior', order: photos.length }] })} style={btnSecondary()}><Icons.Plus size={12} /> Foto</button>
      </div>
      <div>
        <span style={labelStyle}>Videos ({videos.length})</span>
        {videos.map((v, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 2fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="URL" value={v.url || ''} onChange={(e) => { const next = [...videos]; next[i] = { ...v, url: e.target.value }; set({ videos: next }); }} style={inputStyle} />
            <select value={v.type || 'walkthrough'} onChange={(e) => { const next = [...videos]; next[i] = { ...v, type: e.target.value }; set({ videos: next }); }} style={inputStyle}>{VIDEO_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input placeholder="Titulo" value={v.title || ''} onChange={(e) => { const next = [...videos]; next[i] = { ...v, title: e.target.value }; set({ videos: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ videos: videos.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ videos: [...videos, { url: '', type: 'walkthrough' }] })} style={btnSecondary()}><Icons.Plus size={12} /> Video</button>
      </div>
      <Field label="Tour virtual URL (3DGS)"><input value={data.virtual_tour_url || ''} onChange={(e) => set({ virtual_tour_url: e.target.value })} style={inputStyle} /></Field>
      <Field label="Drone video URL"><input value={data.drone_video_url || ''} onChange={(e) => set({ drone_video_url: e.target.value })} style={inputStyle} /></Field>
      <div>
        <span style={labelStyle}>Floor plans ({plans.length})</span>
        {plans.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 2fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="URL" value={p.url || ''} onChange={(e) => { const next = [...plans]; next[i] = { ...p, url: e.target.value }; set({ floor_plans: next }); }} style={inputStyle} />
            <input placeholder="typology" value={p.typology_code || ''} onChange={(e) => { const next = [...plans]; next[i] = { ...p, typology_code: e.target.value }; set({ floor_plans: next }); }} style={inputStyle} />
            <input placeholder="label" value={p.label || ''} onChange={(e) => { const next = [...plans]; next[i] = { ...p, label: e.target.value }; set({ floor_plans: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ floor_plans: plans.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ floor_plans: [...plans, { url: '' }] })} style={btnSecondary()}><Icons.Plus size={12} /> Floor plan</button>
      </div>
    </div>
  );
}

function SectionFinancing({ data, set }) {
  return (
    <div data-testid="sec-financing">
      <Field label="Enganche % (global)"><input type="number" step="0.1" value={data.enganche_pct ?? ''} onChange={(e) => set({ enganche_pct: Number(e.target.value) || null })} style={inputStyle} /></Field>
      <div>
        <span style={labelStyle}>Calendario de pagos</span>
        {(data.payment_schedule || []).map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="Etapa" value={p.label || ''} onChange={(e) => { const next = [...data.payment_schedule]; next[i] = { ...p, label: e.target.value }; set({ payment_schedule: next }); }} style={inputStyle} />
            <input type="number" placeholder="%" value={p.percent ?? ''} onChange={(e) => { const next = [...data.payment_schedule]; next[i] = { ...p, percent: Number(e.target.value) || 0 }; set({ payment_schedule: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ payment_schedule: data.payment_schedule.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ payment_schedule: [...(data.payment_schedule || []), { label: '', percent: 0 }] })} style={btnSecondary()}><Icons.Plus size={12} /> Hito de pago</button>
      </div>
      <div style={{ marginTop: 14 }}>
        <span style={labelStyle}>Opciones de credito</span>
        {(data.credit_options || []).map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="Banco/Institucion" value={c.bank_or_institution || ''} onChange={(e) => { const next = [...data.credit_options]; next[i] = { ...c, bank_or_institution: e.target.value }; set({ credit_options: next }); }} style={inputStyle} />
            <input placeholder="tipo" value={c.type || ''} onChange={(e) => { const next = [...data.credit_options]; next[i] = { ...c, type: e.target.value }; set({ credit_options: next }); }} style={inputStyle} />
            <input type="number" placeholder="CAT %" value={c.cat_pct ?? ''} onChange={(e) => { const next = [...data.credit_options]; next[i] = { ...c, cat_pct: Number(e.target.value) || 0 }; set({ credit_options: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ credit_options: data.credit_options.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ credit_options: [...(data.credit_options || []), { bank_or_institution: '' }] })} style={btnSecondary()}><Icons.Plus size={12} /> Credito</button>
      </div>
      <div style={{ marginTop: 14 }}>
        <span style={labelStyle}>Fases del proyecto</span>
        {(data.phases || []).map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="Nombre fase" value={p.phase_name || ''} onChange={(e) => { const next = [...data.phases]; next[i] = { ...p, phase_name: e.target.value }; set({ phases: next }); }} style={inputStyle} />
            <input placeholder="Entrega" value={p.delivery_estimate || ''} onChange={(e) => { const next = [...data.phases]; next[i] = { ...p, delivery_estimate: e.target.value }; set({ phases: next }); }} style={inputStyle} />
            <input placeholder="status" value={p.status || ''} onChange={(e) => { const next = [...data.phases]; next[i] = { ...p, status: e.target.value }; set({ phases: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ phases: data.phases.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ phases: [...(data.phases || []), { phase_name: '' }] })} style={btnSecondary()}><Icons.Plus size={12} /> Fase</button>
      </div>
    </div>
  );
}

function SectionTrust({ data, set }) {
  return (
    <div data-testid="sec-trust" style={{ display: 'grid', gap: 14 }}>
      <div>
        <span style={labelStyle}>Testimoniales</span>
        {(data.testimonials || []).map((t, i) => (
          <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 64px', gap: 6 }}>
              <input placeholder="Autor" value={t.author || ''} onChange={(e) => { const next = [...data.testimonials]; next[i] = { ...t, author: e.target.value }; set({ testimonials: next }); }} style={inputStyle} />
              <input placeholder="Rol" value={t.role || ''} onChange={(e) => { const next = [...data.testimonials]; next[i] = { ...t, role: e.target.value }; set({ testimonials: next }); }} style={inputStyle} />
              <input type="number" min="1" max="5" placeholder="Rating" value={t.rating ?? ''} onChange={(e) => { const next = [...data.testimonials]; next[i] = { ...t, rating: Number(e.target.value) || 5 }; set({ testimonials: next }); }} style={inputStyle} />
            </div>
            <textarea placeholder="Quote" value={t.quote || ''} onChange={(e) => { const next = [...data.testimonials]; next[i] = { ...t, quote: e.target.value }; set({ testimonials: next }); }} style={{ ...inputStyle, marginTop: 6, minHeight: 60 }} />
            <button type="button" onClick={() => set({ testimonials: data.testimonials.filter((_, j) => j !== i) })} style={btnSecondary({ marginTop: 6, color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' })}><Icons.Trash2 size={11} /> Quitar</button>
          </div>
        ))}
        <button type="button" onClick={() => set({ testimonials: [...(data.testimonials || []), { author: '', quote: '', rating: 5 }] })} style={btnSecondary()}><Icons.Plus size={12} /> Testimonial</button>
      </div>
      <div>
        <span style={labelStyle}>Menciones en medios</span>
        {(data.media_mentions || []).map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr 32px', gap: 6, marginBottom: 6 }}>
            <input placeholder="Medio" value={m.outlet || ''} onChange={(e) => { const next = [...data.media_mentions]; next[i] = { ...m, outlet: e.target.value }; set({ media_mentions: next }); }} style={inputStyle} />
            <input placeholder="Titulo" value={m.title || ''} onChange={(e) => { const next = [...data.media_mentions]; next[i] = { ...m, title: e.target.value }; set({ media_mentions: next }); }} style={inputStyle} />
            <input placeholder="URL" value={m.url || ''} onChange={(e) => { const next = [...data.media_mentions]; next[i] = { ...m, url: e.target.value }; set({ media_mentions: next }); }} style={inputStyle} />
            <button type="button" onClick={() => set({ media_mentions: data.media_mentions.filter((_, j) => j !== i) })} style={btnSecondary({ padding: 6 })}><Icons.Trash2 size={12} /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ media_mentions: [...(data.media_mentions || []), { outlet: '' }] })} style={btnSecondary()}><Icons.Plus size={12} /> Mencion</button>
      </div>
      <Field label="Trust score (0-100)"><input type="number" min="0" max="100" value={data.trust_score ?? ''} onChange={(e) => set({ trust_score: Number(e.target.value) || null })} style={inputStyle} /></Field>
    </div>
  );
}

function SectionAdvisor({ data, set }) {
  const a = data.assigned_advisor || {};
  const upd = (k, v) => set({ assigned_advisor: { ...a, [k]: v } });
  const prefilled = Boolean(a.user_id);
  return (
    <div data-testid="sec-advisor">
      {prefilled && (
        <div style={{ padding: 10, marginBottom: 14, borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#86EFAC', fontSize: 12 }}>
          <Icons.UserCheck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Datos precargados desde tu perfil · puedes editar cualquier campo
        </div>
      )}
      <Field label="Nombre completo (aparece en la landing y firma)"><input data-testid="f-advisor-name" value={a.full_name || ''} onChange={(e) => upd('full_name', e.target.value)} style={inputStyle} /></Field>
      <Field label="Email"><input type="email" value={a.email || ''} onChange={(e) => upd('email', e.target.value)} style={inputStyle} /></Field>
      <Field label="WhatsApp / teléfono" hint="Aparece en el botón sticky de los templates Video-first y Urgent"><input value={a.phone || ''} onChange={(e) => upd('phone', e.target.value)} style={inputStyle} placeholder="+52 55 1234 5678" /></Field>
      <Field label="Foto (URL pública)" hint="Aparece junto a los testimonios y firma"><input value={a.photo_url || ''} onChange={(e) => upd('photo_url', e.target.value)} style={inputStyle} /></Field>
      <Field label="Cédula AMPI (opcional · refuerza credibilidad)"><input value={a.ampi_id || ''} onChange={(e) => upd('ampi_id', e.target.value)} style={inputStyle} /></Field>
      <Field label="Bio corta (cómo te presentas en la landing · máx 1000 caracteres)"><textarea value={a.bio || ''} onChange={(e) => upd('bio', e.target.value)} style={{ ...inputStyle, minHeight: 90 }} /></Field>
    </div>
  );
}

function SectionLegal({ data, set }) {
  return (
    <div data-testid="sec-legal">
      <Field label="Aviso legal (disclaimer)"><textarea value={data.legal_disclaimer || ''} onChange={(e) => set({ legal_disclaimer: e.target.value })} style={{ ...inputStyle, minHeight: 80 }} /></Field>
      <Field label="Reglas de uso"><textarea value={data.rule_of_use || ''} onChange={(e) => set({ rule_of_use: e.target.value })} style={{ ...inputStyle, minHeight: 80 }} /></Field>
      <Field label="Notaria"><input value={data.notary_office || ''} onChange={(e) => set({ notary_office: e.target.value })} style={inputStyle} /></Field>
      <Field label="Permiso de construccion ID"><input value={data.construction_permit_id || ''} onChange={(e) => set({ construction_permit_id: e.target.value })} style={inputStyle} /></Field>
    </div>
  );
}

function SectionUrgency({ data, set }) {
  return (
    <div data-testid="sec-urgency">
      <Field label="Fase actual cierra el..." hint="Formato ISO · usado por UrgentTemplate countdown">
        <input type="datetime-local" value={data.urgent_expires_at ? String(data.urgent_expires_at).slice(0, 16) : ''} onChange={(e) => set({ urgent_expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} style={inputStyle} />
      </Field>
      <Field label="Aviso ultimas unidades">
        <select value={data.last_units_warning ? '1' : '0'} onChange={(e) => set({ last_units_warning: e.target.value === '1' })} style={inputStyle}><option value="0">No</option><option value="1">Si</option></select>
      </Field>
      <Field label="Etiqueta de promocion"><input value={data.promo_label || ''} onChange={(e) => set({ promo_label: e.target.value })} style={inputStyle} placeholder="Pre-venta · Bono entrega" /></Field>
      <Field label="Descuento %"><input type="number" step="0.5" value={data.promo_discount_pct ?? ''} onChange={(e) => set({ promo_discount_pct: Number(e.target.value) || null })} style={inputStyle} /></Field>
    </div>
  );
}

function SectionDifferentiators({ data, set }) {
  return (
    <div data-testid="sec-diff" style={{ display: 'grid', gap: 14 }}>
      <Field label="¿Para quién es el proyecto ideal?" hint="Describe en una línea al comprador objetivo">
        <input value={data.target_buyer_persona || ''} onChange={(e) => set({ target_buyer_persona: e.target.value })} placeholder="Ej: familia con 2 hijos · pareja joven · inversionista patrimonial" style={inputStyle} />
      </Field>
      <div>
        <span style={labelStyle}>¿Qué hace único a este proyecto? (3 a 10 puntos)</span>
        <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 8 }}>Escribe cada característica única en un chip · enter para agregar</div>
        <ArrayChips list={data.unique_selling_points} onChange={(v) => set({ unique_selling_points: v })} placeholder="Ej: Roof garden 800m² · arquitecto reconocido · vista al Bosque de Chapultepec" testid="usp-input" max={10} />
      </div>
      <div>
        <span style={labelStyle}>Ventajas frente a la competencia de la zona</span>
        <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 8 }}>Lo que SÍ tienes que los desarrollos cercanos NO ofrecen</div>
        <ArrayChips list={data.competitive_advantages} onChange={(v) => set({ competitive_advantages: v })} placeholder="Ej: bodega incluida · cero comisión reventa · concierge 24/7" max={10} />
      </div>
    </div>
  );
}

const SECTION_RENDERERS = {
  identity: SectionIdentity,
  location: SectionLocation,
  developer: SectionDeveloper,
  typologies: SectionTypologies,
  amenities: SectionAmenities,
  premium: SectionPremium,
  investment: SectionInvestment,
  media: SectionMedia,
  financing: SectionFinancing,
  trust: SectionTrust,
  advisor: SectionAdvisor,
  legal: SectionLegal,
  urgency: SectionUrgency,
  differentiators: SectionDifferentiators,
};

function Toast({ msg, onClose }) {
  useEffect(() => { if (msg) { const id = setTimeout(onClose, 3200); return () => clearTimeout(id); } return undefined; }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div data-testid="intake-toast" style={{ position: 'fixed', bottom: 24, right: 24, background: BG_CARD, color: '#F0EBE0', padding: '12px 18px', borderRadius: 9999, border: BORDER, zIndex: 1100, backdropFilter: 'blur(24px)' }}>{msg}</div>
  );
}

export default function PropertyIntakeForm({ user, onLogout }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { t } = useTranslation('common');

  const [intakeId, setIntakeId] = useState(id || null);
  const [data, setData] = useState(emptyIntake());
  const [copy, setCopy] = useState(null);
  const [active, setActive] = useState('identity');
  const [loading, setLoading] = useState(Boolean(id));
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState('');
  const [warnings, setWarnings] = useState([]);
  const debouncer = useRef(null);
  const dirty = useRef(false);

  // Carga inicial si hay id
  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const r = await getIntake(id);
        if (!alive) return;
        setData({ ...emptyIntake(), ...(r.intake || {}) });
        setCopy(r.intake?.generated_copy_cached || null);
        setWarnings(r.intake?._warnings || []);
      } catch (e) {
        setToast('Error cargando: ' + e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // Si llega ?template=X en query y no hay id, pre-llena template_key
  useEffect(() => {
    const qTpl = search.get('template');
    if (qTpl && !id) setData((d) => ({ ...d, template_key: qTpl }));
  }, [search, id]);

  // Auto-fill asesor desde el user logueado · solo si intake nuevo (sin id) y advisor vacío
  const auth = useAuth();
  useEffect(() => {
    if (id) return; // intake existente · respeta lo que ya tenga guardado
    const u = auth?.user;
    if (!u) return;
    setData((d) => {
      if (d.assigned_advisor?.full_name) return d; // ya está rellenado · no sobreescribir
      const fullName = u.full_name || u.name || [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      return {
        ...d,
        assigned_advisor: {
          user_id: u.user_id || u.id || null,
          full_name: fullName || '',
          email: u.email || '',
          phone: u.phone || u.whatsapp || '',
          photo_url: u.photo_url || u.avatar_url || '',
          ampi_id: u.ampi_id || '',
          bio: u.bio || '',
        },
      };
    });
    dirty.current = true;
  }, [id, auth?.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => {
    setData((d) => ({ ...d, ...patch }));
    dirty.current = true;
  };

  // Auto-save: tras 1.8s sin cambios, POST (crea) o PATCH (actualiza)
  useEffect(() => {
    if (!dirty.current) return;
    if (debouncer.current) clearTimeout(debouncer.current);
    debouncer.current = setTimeout(async () => {
      if (!data.project_name || !data.template_key) return; // mins para POST
      if (!data.assigned_advisor?.full_name) return; // backend requirement
      setSaveStatus('saving');
      try {
        if (!intakeId) {
          const r = await createIntake(data);
          setIntakeId(r.intake_id);
          setWarnings(r._warnings || []);
          // Push id en la url para que recarga preserve
          navigate(`/portal/studio/property-intake/${r.intake_id}`, { replace: true });
        } else {
          const r = await patchIntake(intakeId, data);
          setWarnings(r._warnings || []);
        }
        setSaveStatus('saved');
        dirty.current = false;
      } catch (e) {
        setSaveStatus('error');
        setToast('Guardado fallido: ' + (e.body?.detail || e.message || 'error'));
      }
    }, 1800);
    return () => { if (debouncer.current) clearTimeout(debouncer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, intakeId]);

  const onGenerateCopy = async () => {
    if (!intakeId) { setToast('Guarda el intake primero · llena nombre + asesor'); return; }
    setGenerating(true);
    try {
      const r = await generateCopy(intakeId, false);
      setCopy(r.copy_json || null);
      if (r.fallback) setToast('Copy generado en modo fallback');
      else if (r.cached) setToast('Copy desde cache');
      else setToast('Copy generado en ' + r.generation_time_ms + 'ms');
    } catch (e) {
      setToast('Error IA: ' + (e.body?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  };

  const onTogglePublish = async () => {
    if (!intakeId) { setToast('Guarda el intake primero'); return; }
    const next = !data.published;
    setPublishing(true);
    try {
      const r = await publishIntake(intakeId, next);
      set('published', r.published);
      if (r.public_url) {
        // eslint-disable-next-line no-restricted-globals
        const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
        const fullUrl = `${origin}${r.public_url}`;
        try {
          await navigator.clipboard.writeText(fullUrl);
          setToast(`Publicada · URL copiada: ${fullUrl}`);
        } catch (_) {
          setToast(`Publicada · ${fullUrl}`);
        }
      } else {
        setToast('Despublicada · la landing ya no es visible');
      }
    } catch (e) {
      setToast('Error publicar: ' + (e.body?.detail || e.message));
    } finally {
      setPublishing(false);
    }
  };

  const Section = SECTION_RENDERERS[active] || SectionIdentity;
  const completedSteps = useMemo(() => {
    const map = {};
    map.identity = Boolean(data.project_name && data.template_key);
    map.location = Boolean(data.colonia || data.lat);
    map.developer = data.property_type === 'development' ? Boolean(data.developer_name) : true;
    map.typologies = (data.typologies || []).length > 0;
    map.amenities = Object.values(data.amenities_by_category || {}).some((arr) => arr.length > 0);
    map.premium = (data.premium_services || []).length > 0;
    map.investment = data.template_key === 'investor' ? Boolean(data.investment_metrics?.expected_roi_pct) : true;
    map.media = (data.photos || []).length > 0;
    map.financing = (data.payment_schedule || []).length > 0 || (data.credit_options || []).length > 0;
    map.trust = (data.testimonials || []).length > 0;
    map.advisor = Boolean(data.assigned_advisor?.full_name);
    map.legal = Boolean(data.legal_disclaimer);
    map.urgency = Boolean(data.urgent_expires_at || data.promo_label);
    map.differentiators = (data.unique_selling_points || []).length > 0;
    return map;
  }, [data]);

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="property-intake-form" style={{ padding: '20px 8px', color: '#F0EBE0', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ letterSpacing: '0.3em', fontSize: 11, color: '#6366F1', textTransform: 'uppercase' }}>Studio · Z.8.7</div>
            <h1 style={{ margin: '6px 0 0', fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.5rem, 2.6vw, 2rem)', fontWeight: 800 }}>Crear landing con IA</h1>
            <p style={{ color: 'rgba(240,235,224,0.6)', marginTop: 4, fontSize: 13 }}>Llena las 14 secciones · auto-save activo · IA genera el copy final.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span data-testid="save-status" style={{ fontSize: 12, color: saveStatus === 'error' ? '#F87171' : 'rgba(240,235,224,0.6)' }}>
              {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? 'Guardado' : saveStatus === 'error' ? 'Error guardado' : ''}
            </span>
            <button data-testid="back-to-landings" type="button" onClick={() => navigate('/portal/studio/landings')} style={btnSecondary()}><Icons.ChevronLeft size={12} /> Volver</button>
            <button data-testid="generate-copy-btn" type="button" onClick={onGenerateCopy} disabled={generating || !intakeId} style={btnGradient({ opacity: (!intakeId || generating) ? 0.6 : 1 })}>
              <Icons.Sparkles size={14} /> {generating ? 'Generando...' : 'Generar copy con IA'}
            </button>
            <button data-testid="publish-btn" type="button" onClick={onTogglePublish} disabled={publishing || !intakeId} style={{ ...btnSecondary({ color: data.published ? '#FBBF24' : '#22C55E', borderColor: data.published ? '#FBBF24aa' : '#22C55Eaa' }), opacity: (!intakeId || publishing) ? 0.6 : 1 }}>
              {data.published ? <Icons.EyeOff size={14} /> : <Icons.Globe size={14} />}
              {publishing ? '...' : (data.published ? 'Despublicar' : 'Publicar')}
            </button>
            {data.published && data.slug && (
              <a data-testid="view-public-link" href={`/landing/${data.slug}`} target="_blank" rel="noreferrer" style={{ ...btnSecondary({ color: '#6366F1', borderColor: '#6366F1aa' }) }}>
                <Icons.ExternalLink size={12} /> Ver landing
              </a>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'rgba(240,235,224,0.6)' }}>Cargando intake...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 14, minHeight: '70vh' }}>
            {/* Vertical stepper · 14 sections */}
            <aside style={{ background: BG_CARD, border: BORDER, borderRadius: 14, padding: 12, alignSelf: 'flex-start', position: 'sticky', top: 12, maxHeight: '85vh', overflowY: 'auto' }}>
              {SECTIONS.map((s) => {
                const Ico = Icons[s.icon] || Icons.Circle;
                const done = completedSteps[s.key];
                const isActive = active === s.key;
                return (
                  <button key={s.key} type="button" data-testid={`step-${s.key}`} onClick={() => setActive(s.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 10, border: isActive ? '1px solid #6366F1' : '1px solid transparent', background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent', color: '#F0EBE0', cursor: 'pointer', marginBottom: 4, fontSize: 12 }}>
                    <Ico size={14} color={done ? '#22C55E' : '#6366F1'} />
                    <span style={{ flex: 1 }}>{s.label}</span>
                    {done && <Icons.Check size={12} color="#22C55E" />}
                  </button>
                );
              })}
            </aside>

            {/* Formulario activo */}
            <section style={{ background: BG_CARD, border: BORDER, borderRadius: 14, padding: 16, maxHeight: '85vh', overflowY: 'auto' }}>
              <h2 style={{ marginTop: 0, fontFamily: 'Outfit, sans-serif', fontSize: 18 }}>{SECTIONS.find((s) => s.key === active)?.label}</h2>
              <Section data={data} set={set} />
              {warnings.length > 0 && (
                <div data-testid="warnings" style={{ marginTop: 18, padding: 12, borderRadius: 10, background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.3)', color: '#FBBF24', fontSize: 12 }}>
                  <strong>Avisos:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
            </section>

            {/* Split-pane preview */}
            <section data-testid="intake-preview" style={{ background: BG_CARD, border: BORDER, borderRadius: 14, padding: 8, maxHeight: '85vh', overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Preview · {data.template_key}</span>
                {copy && <span style={{ fontSize: 11, color: '#22C55E' }}>copy IA activo</span>}
              </div>
              <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(85vh - 40px)' }}>
                <div style={{ transform: 'scale(0.62)', transformOrigin: 'top left', width: '161%', height: '161%' }}>
                  <TemplateDispatcher templateKey={data.template_key} intake={data} copy={copy} isPreview />
                </div>
              </div>
            </section>
          </div>
        )}
        <Toast msg={toast} onClose={() => setToast('')} />
      </div>
    </PortalLayout>
  );
}
