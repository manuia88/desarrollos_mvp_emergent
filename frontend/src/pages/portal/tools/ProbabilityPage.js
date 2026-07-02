// W5.19 wire · ProbabilityPage · standalone T0 público · consume ProbabilityCard
// Rediseño CLARO (Apple-tier) — mismo sistema visual que Mapa.js / InversionV4Calculator.
// Los inputs de texto (que exigían tipear IDs internos) → selectores con autocomplete:
//   · proyecto  (sells_complete)      ← /api/developments
//   · colonia   (drpi_up)             ← /api/colonias (slugs que el motor acepta)
//   · colonia + unidad (closes_below) ← arma el property_id sintético {colonia}_m2{m2}_r{rec}_b{ban}_a{age}
// El motor (probability_engine.py) NO se toca.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, Sparkle, Building, MapPin, Check } from '../../../components/icons';
import { fetchColonias, fetchDevelopments } from '../../../api/marketplace';
import ProbabilityCard from '../../../components/probability/ProbabilityCard';
import ToolNav from '../../../components/ui/ToolNav';

// ── Paleta CLARA (idéntica a Mapa.js) ─────────────────────────────────────────
const INK = '#1E2230';
const MUTED = '#5A5F6E';
const FAINT = '#9AA0AE';
const BORDER = '#ECECEC';
const TRACK = '#F1F2F6';
const SOFT = '#F6F4FF';   // relleno tenue de marca
const SOFT_BORDER = '#E7E0FF';
const THEME = 'var(--theme)';
const GRAD = 'var(--grad)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const cardShell = {
  background: '#fff',
  border: `1px solid ${BORDER}`,
  borderRadius: 16,
  boxShadow: '0 1px 2px rgba(16,18,28,0.04), 0 8px 24px rgba(16,18,28,0.05)',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: FAINT,
  marginBottom: 9,
  fontFamily: 'DM Sans, sans-serif',
  fontWeight: 700,
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  background: '#fff',
  border: `1px solid ${BORDER}`,
  color: INK,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: `border-color .15s ${EASE}, box-shadow .15s ${EASE}`,
};

const TYPE_OPTIONS = [
  { value: 'sells_complete', labelKey: 'probabilityPage.type_sells_complete', label: 'Vende todo', icon: Building },
  { value: 'drpi_up', labelKey: 'probabilityPage.type_drpi_up', label: 'Sube el precio', icon: Sparkle },
  { value: 'closes_below_listed', labelKey: 'probabilityPage.type_closes_below_listed', label: 'Cierra bajo listado', icon: MapPin },
];

// ── Autocomplete genérico (proyecto / colonia) ────────────────────────────────
function Autocomplete({ options, value, onChange, placeholder, testid, loading, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = options.find((o) => o.id === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 40);
    return options
      .filter((o) => `${o.name} ${o.sub || ''}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [options, query]);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid={testid}
        onClick={() => setOpen((v) => !v)}
        style={{
          ...fieldStyle,
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer',
          borderColor: open ? 'var(--theme)' : BORDER,
          boxShadow: open ? '0 0 0 3px rgba(var(--theme-rgb),0.12)' : 'none',
        }}
      >
        {Icon && <Icon size={16} style={{ color: FAINT, flexShrink: 0 }} />}
        <span style={{ flex: 1, color: selected ? INK : FAINT, fontWeight: selected ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected ? selected.name : (loading ? 'Cargando…' : placeholder)}
        </span>
        <ChevronDown size={16} style={{ color: FAINT, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: `transform .15s ${EASE}` }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40,
            background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14,
            boxShadow: '0 12px 40px rgba(16,18,28,0.14)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: 10, borderBottom: `1px solid ${TRACK}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={15} style={{ color: FAINT }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              style={{ border: 'none', outline: 'none', flex: 1, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: INK, background: 'transparent' }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '14px 14px', color: FAINT, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>Sin resultados</div>
            )}
            {filtered.map((o) => {
              const active = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange(o.id); setOpen(false); setQuery(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 14px', border: 'none', cursor: 'pointer',
                    background: active ? SOFT : '#fff',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#FAFAFB'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = '#fff'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: INK, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</div>
                    {o.sub && <div style={{ fontSize: 12, color: FAINT, marginTop: 1 }}>{o.sub}</div>}
                  </div>
                  {active && <Check size={16} style={{ color: 'var(--theme)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Campo numérico compacto para el mini-form de unidad
function NumField({ label, value, min, max, step = 1, suffix, onChange, testid }) {
  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: 7 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          data-testid={testid}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...fieldStyle, paddingRight: suffix ? 44 : 14 }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--theme-rgb),0.12)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none'; }}
        />
        {suffix && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: FAINT, fontFamily: 'DM Sans, sans-serif' }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default function ProbabilityPage() {
  const { t } = useTranslation('common');
  const [type, setType] = useState('sells_complete');
  const [months, setMonths] = useState(12);
  const [submitted, setSubmitted] = useState(null);

  // Fuentes de datos para los selectores
  const [projects, setProjects] = useState([]);
  const [colonias, setColonias] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingColonias, setLoadingColonias] = useState(true);

  // Selección
  const [projectId, setProjectId] = useState('');
  const [coloniaId, setColoniaId] = useState('');

  // Mini-form de unidad (closes_below_listed) → arma el property_id sintético
  const [m2, setM2] = useState(80);
  const [rec, setRec] = useState(2);
  const [banos, setBanos] = useState(2);
  const [antiguedad, setAntiguedad] = useState(8);
  const [listed, setListed] = useState('');

  useEffect(() => {
    let alive = true;
    fetchDevelopments({ limit: 100 })
      .then((list) => { if (alive) setProjects(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setProjects([]); })
      .finally(() => { if (alive) setLoadingProjects(false); });
    fetchColonias()
      .then((list) => { if (alive) setColonias(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setColonias([]); })
      .finally(() => { if (alive) setLoadingColonias(false); });
    return () => { alive = false; };
  }, []);

  const projectOptions = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name || p.id, sub: p.alcaldia || p.colonia_id })),
    [projects]
  );
  const coloniaOptions = useMemo(
    () => colonias.map((c) => ({ id: c.id, name: c.name || c.id, sub: c.alcaldia })),
    [colonias]
  );
  const coloniaName = useMemo(
    () => (coloniaOptions.find((c) => c.id === coloniaId) || {}).name || '',
    [coloniaOptions, coloniaId]
  );

  const isSells = type === 'sells_complete';
  const isDrpi = type === 'drpi_up';
  const isCloses = type === 'closes_below_listed';

  // property_id sintético que el backend sabe parsear
  const syntheticPropertyId = useMemo(() => {
    if (!coloniaId) return '';
    return `${coloniaId}_m2${Number(m2) || 0}_r${Number(rec) || 0}_b${Number(banos) || 0}_a${Number(antiguedad) || 0}`;
  }, [coloniaId, m2, rec, banos, antiguedad]);

  const canSubmit = isSells
    ? !!projectId
    : isDrpi
      ? !!coloniaId
      : !!coloniaId && Number(listed) > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isSells) {
      setSubmitted({ type, id: projectId, months: Number(months) || 12 });
    } else if (isDrpi) {
      setSubmitted({ type, id: coloniaId, months: Number(months) || 12 });
    } else {
      setSubmitted({ type, id: syntheticPropertyId, listed: Number(listed) });
    }
  };

  // reset del resultado al cambiar de tipo (evita mostrar un card de otro evento)
  useEffect(() => { setSubmitted(null); }, [type]);

  return (
    <div
      className="theme-light-scope tool-surface"
      data-testid="probability-page"
      style={{ color: INK, fontFamily: 'DM Sans, sans-serif' }}
    >
      <ToolNav />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 96px' }}>
        {/* Hero */}
        <header style={{ marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '0.18em', fontSize: 11, color: THEME, textTransform: 'uppercase', marginBottom: 14, fontWeight: 700 }}>
            <Sparkle size={14} style={{ color: 'var(--theme)' }} />
            {t('probabilityPage.eyebrow', 'Probabilidad · datos reales')}
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(30px, 5vw, 46px)',
            letterSpacing: '-0.02em',
            color: INK,
            lineHeight: 1.05,
          }}>
            {t('probabilityPage.page_title', 'Probabilidad de inversión')}
          </h1>
          <p style={{ margin: '14px 0 0', color: MUTED, fontSize: 15, lineHeight: 1.55, maxWidth: 640 }}>
            {t('probabilityPage.page_subtitle', 'Calcula la probabilidad de eventos clave (venta completa, alza de precios, cierre por debajo del listado) con fuentes ponderadas Kalshi-style.')}
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 26 }}>
          {/* Form card */}
          <section className="dmx-card" style={{ ...cardShell, padding: 26 }}>
            {/* Selector de evento (segmented) */}
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>{t('probabilityPage.input_type', 'Tipo de evento')}</label>
              <div
                data-testid="prob-input-type"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
              >
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = opt.value === type;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-testid={`prob-type-${opt.value}`}
                      onClick={() => setType(opt.value)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                        padding: '12px 13px', borderRadius: 13, cursor: 'pointer', textAlign: 'left',
                        background: active ? SOFT : '#fff',
                        border: `1px solid ${active ? SOFT_BORDER : BORDER}`,
                        transition: `all .15s ${EASE}`,
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      <span style={{
                        width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: active ? 'var(--grad)' : TRACK,
                      }}>
                        <Icon size={16} style={{ color: active ? '#fff' : FAINT }} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: active ? INK : MUTED, lineHeight: 1.2 }}>
                        {t(opt.labelKey, opt.label)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Entidad: proyecto / colonia según evento */}
            {isSells && (
              <div style={{ marginBottom: 22 }}>
                <label style={labelStyle}>{t('probabilityPage.input_id_property', 'Proyecto')}</label>
                <Autocomplete
                  testid="prob-input-project"
                  options={projectOptions}
                  value={projectId}
                  onChange={setProjectId}
                  loading={loadingProjects}
                  placeholder={t('probabilityPage.pick_project', 'Elige un proyecto…')}
                  icon={Building}
                />
              </div>
            )}

            {(isDrpi || isCloses) && (
              <div style={{ marginBottom: 22 }}>
                <label style={labelStyle}>{t('probabilityPage.input_id_zone', 'Colonia')}</label>
                <Autocomplete
                  testid="prob-input-colonia"
                  options={coloniaOptions}
                  value={coloniaId}
                  onChange={setColoniaId}
                  loading={loadingColonias}
                  placeholder={t('probabilityPage.pick_colonia', 'Elige una colonia…')}
                  icon={MapPin}
                />
              </div>
            )}

            {/* Mini-form de unidad (solo closes_below_listed) */}
            {isCloses && (
              <div style={{ marginBottom: 22, padding: 16, background: '#FAFAFB', border: `1px solid ${TRACK}`, borderRadius: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Building size={14} style={{ color: FAINT }} />
                  {t('probabilityPage.unit_form_title', 'La unidad')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                  <NumField testid="prob-input-m2" label={t('probabilityPage.unit_m2', 'Superficie')} value={m2} min={20} max={600} suffix="m²" onChange={setM2} />
                  <NumField testid="prob-input-rec" label={t('probabilityPage.unit_rec', 'Recámaras')} value={rec} min={0} max={8} onChange={setRec} />
                  <NumField testid="prob-input-banos" label={t('probabilityPage.unit_banos', 'Baños')} value={banos} min={1} max={8} onChange={setBanos} />
                  <NumField testid="prob-input-antiguedad" label={t('probabilityPage.unit_antiguedad', 'Antigüedad')} value={antiguedad} min={0} max={80} suffix="años" onChange={setAntiguedad} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={{ ...labelStyle, marginBottom: 7 }}>{t('probabilityPage.input_listed', 'Precio listado (MXN)')}</label>
                  <input
                    data-testid="prob-input-listed"
                    type="number"
                    min={0}
                    value={listed}
                    onChange={(e) => setListed(e.target.value)}
                    placeholder="8500000"
                    style={fieldStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--theme)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--theme-rgb),0.12)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
                {syntheticPropertyId && (
                  <div style={{ marginTop: 12, fontSize: 11, color: FAINT, fontFamily: 'DM Sans, sans-serif' }}>
                    {t('probabilityPage.unit_ref', 'Referencia interna')}: <code style={{ color: MUTED, background: TRACK, padding: '2px 6px', borderRadius: 6, fontSize: 11 }}>{syntheticPropertyId}</code>
                  </div>
                )}
              </div>
            )}

            {/* Horizonte (no aplica a closes_below_listed) */}
            {!isCloses && (
              <div style={{ marginBottom: 22 }}>
                <label style={labelStyle}>
                  {t('probabilityPage.input_months', 'Horizonte')} · <span style={{ color: INK, fontWeight: 800 }}>{months} {t('probabilityPage.months_unit', 'meses')}</span>
                </label>
                <input
                  data-testid="prob-input-months"
                  type="range"
                  min={1}
                  max={24}
                  step={1}
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#6D4AFF' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: FAINT, marginTop: 4 }}>
                  <span>1</span><span>12</span><span>24</span>
                </div>
              </div>
            )}

            <button
              data-testid="prob-input-submit"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '14px 22px',
                borderRadius: 9999,
                border: 'none',
                background: canSubmit ? 'var(--grad)' : TRACK,
                color: canSubmit ? '#fff' : FAINT,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '0.01em',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: `transform .15s ${EASE}, opacity .15s ${EASE}`,
              }}
              onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              {t('probabilityPage.btn_calculate', 'Calcular probabilidad')}
            </button>
          </section>

          {/* Result */}
          {submitted && (
            <section data-testid="probability-result">
              <ProbabilityCard
                type={submitted.type}
                id={submitted.id}
                months={submitted.months}
                listed={submitted.listed}
                title={submitted.type === 'drpi_up' ? `${t('probabilityCard.title_drpi_up', 'Sube el precio')} · ${coloniaName || ''}`.trim() : undefined}
              />
            </section>
          )}

          {/* Disclaimer */}
          <aside style={{
            padding: '16px 18px',
            borderRadius: 14,
            background: SOFT,
            border: `1px solid ${SOFT_BORDER}`,
            color: MUTED,
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            {t('probabilityPage.disclaimer', 'Predicciones basadas en datos verificados (AVM, Forecast, WhatIf). Pueden tener insuficiente historial para zonas o proyectos recientes. No constituyen recomendación de inversión.')}
          </aside>
        </div>
      </div>
    </div>
  );
}
