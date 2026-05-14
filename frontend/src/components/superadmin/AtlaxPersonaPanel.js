/**
 * W4.7 Y.4A — AtlaxPersonaPanel
 * Tab "Atlax Persona" en TenantDrawer (Superadmin).
 * Configura la personalidad de Atlax por org (tone, formality, brand voice, etc.)
 * Tier T2+ required para guardar.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Save, Eye, X, RefreshCw, AlertCircle, ChevronDown,
  Tag, Shield, MessageSquare, Globe, Loader2,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return '—'; }
}

const TONE_OPTIONS = [
  { value: 'formal',   label: 'Formal'   },
  { value: 'casual',   label: 'Casual'   },
  { value: 'tecnico',  label: 'Técnico'  },
  { value: 'cercano',  label: 'Cercano'  },
  { value: 'premium',  label: 'Premium'  },
];

const REGISTER_OPTIONS = [
  { value: 'mx-formal',  label: 'Formal mexicano'  },
  { value: 'mx-casual',  label: 'Coloquial mexicano' },
  { value: 'mx-neutral', label: 'Neutro mexicano'  },
];

const DEFAULT_FORM = {
  persona_name: 'Atlax',
  persona_tagline: 'Tu asistente para encontrar casa en CDMX',
  tone: 'cercano',
  formality_level: 3,
  warmth_level: 4,
  tech_jargon_allowed: false,
  brand_voice_keywords: [],
  forbidden_topics: [],
  custom_greetings: [],
  custom_signature: '',
  language_register: 'mx-neutral',
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionTitle({ Icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <Icon size={13} color="var(--theme)" />
      <span style={{
        fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'rgba(240,235,224,0.55)',
      }}>{title}</span>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)',
      marginBottom: 5, fontWeight: 600,
    }}>{children}</div>
  );
}

function TextInput({ value, onChange, placeholder, testid, maxLength = 120 }) {
  return (
    <input
      data-testid={testid}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 9, padding: '8px 12px', color: 'var(--cream)',
        fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
      }}
    />
  );
}

function Dropdown({ value, onChange, options, testid }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <select
        data-testid={testid}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', appearance: 'none', WebkitAppearance: 'none',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 9, padding: '8px 32px 8px 12px', color: 'var(--cream)',
          fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer', outline: 'none',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: '#0d111c' }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} color="rgba(240, 235, 224, 0.68)" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </div>
  );
}

function RangeSlider({ value, onChange, min = 1, max = 5, label, testid }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <FieldLabel>{label}</FieldLabel>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
          color: 'var(--theme)', minWidth: 20, textAlign: 'right',
        }}>{value}</span>
      </div>
      <input
        data-testid={testid}
        type="range"
        min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={{ width: '100%', accentColor: 'var(--theme)', cursor: 'pointer', height: 4 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240,235,224,0.35)' }}>{min}</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(240,235,224,0.35)' }}>{max}</span>
      </div>
    </div>
  );
}

function Toggle({ value, onChange, label, testid }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>{label}</span>
      <button
        data-testid={testid}
        onClick={() => onChange(!value)}
        style={{
          width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
          background: value ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))' : 'rgba(255,255,255,0.12)',
          position: 'relative', transition: 'background 0.25s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: value ? 21 : 3, width: 14, height: 14,
          borderRadius: '50%', background: '#fff',
          transition: 'left 0.25s',
        }} />
      </button>
    </div>
  );
}

function ChipInput({ chips, onChange, placeholder, testid }) {
  const [inputVal, setInputVal] = useState('');

  const addChip = () => {
    const val = inputVal.trim();
    if (val && !chips.includes(val) && chips.length < 10) {
      onChange([...chips, val]);
      setInputVal('');
    }
  };

  const removeChip = (idx) => onChange(chips.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {chips.map((chip, idx) => (
          <span key={idx} style={{
            padding: '3px 9px', borderRadius: 9999, fontSize: 11.5,
            fontFamily: 'DM Sans', fontWeight: 600,
            background: 'rgba(var(--theme-rgb),0.15)', border: '1px solid rgba(var(--theme-rgb),0.35)',
            color: 'var(--theme)', display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {chip}
            <button
              onClick={() => removeChip(idx)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--theme)', lineHeight: 1 }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          data-testid={testid}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(); } }}
          placeholder={placeholder}
          maxLength={60}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 9, padding: '7px 11px', color: 'var(--cream)',
            fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none',
          }}
        />
        <button
          onClick={addChip}
          style={{
            padding: '7px 12px', borderRadius: 9999, border: '1px solid rgba(var(--theme-rgb),0.40)',
            background: 'rgba(var(--theme-rgb),0.12)', color: 'var(--theme)',
            fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

function ForbiddenChipInput({ chips, onChange, placeholder, testid }) {
  const [inputVal, setInputVal] = useState('');

  const addChip = () => {
    const val = inputVal.trim();
    if (val && !chips.includes(val) && chips.length < 10) {
      onChange([...chips, val]);
      setInputVal('');
    }
  };

  const removeChip = (idx) => onChange(chips.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {chips.map((chip, idx) => (
          <span key={idx} style={{
            padding: '3px 9px', borderRadius: 9999, fontSize: 11.5,
            fontFamily: 'DM Sans', fontWeight: 600,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.30)',
            color: '#F87171', display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {chip}
            <button
              onClick={() => removeChip(idx)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#F87171', lineHeight: 1 }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          data-testid={testid}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(); } }}
          placeholder={placeholder}
          maxLength={60}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 9, padding: '7px 11px', color: 'var(--cream)',
            fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none',
          }}
        />
        <button
          onClick={addChip}
          style={{
            padding: '7px 12px', borderRadius: 9999, border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.10)', color: '#F87171',
            fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

// ─── Preview Modal ─────────────────────────────────────────────────────────────
function PreviewModal({ orgId, form, onClose }) {
  const [sampleQuery, setSampleQuery] = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const runPreview = async () => {
    if (!sampleQuery.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch(`/api/superadmin/atlax-persona/${encodeURIComponent(orgId)}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_dict: {
            ...form,
            custom_greetings: (form.greetings_raw || '').split('\n').map(s => s.trim()).filter(Boolean),
            version: 1,
          },
          sample_query: sampleQuery.trim(),
        }),
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(10px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        data-testid="persona-preview-modal"
        style={{ width: '100%', maxWidth: 560, background: 'rgba(13,17,28,0.98)', border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 18, padding: '24px 26px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', margin: 0 }}>
            Preview de Persona
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.55)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Consulta de prueba</FieldLabel>
          <textarea
            data-testid="persona-preview-query-input"
            value={sampleQuery}
            onChange={e => setSampleQuery(e.target.value)}
            placeholder="Ej: ¿Cuánto cuesta un depto de 2 rec en Polanco?"
            rows={2}
            maxLength={300}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 9, padding: '8px 12px', color: 'var(--cream)',
              fontFamily: 'DM Sans', fontSize: 13, outline: 'none', resize: 'vertical',
            }}
          />
        </div>
        <button
          data-testid="persona-preview-run-btn"
          onClick={runPreview}
          disabled={loading || !sampleQuery.trim()}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 9999, border: 'none', cursor: 'pointer',
            background: loading || !sampleQuery.trim() ? 'rgba(255,255,255,0.08)' : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
            color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            marginBottom: 14, transition: 'background 0.25s',
          }}
        >
          {loading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Consultando LLM…</> : 'Probar con persona'}
        </button>
        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 10 }}>
            {error}
          </div>
        )}
        {result && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Respuesta de Atlax ({result.persona_name})</FieldLabel>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.08)', border: '1px solid rgba(var(--theme-rgb),0.22)', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', lineHeight: 1.6 }}>
                {result.response_text}
              </div>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)', cursor: 'pointer', userSelect: 'none' }}>
                Ver system prompt usado (debug)
              </summary>
              <pre style={{ margin: '8px 0 0', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto' }}>
                {result.system_prompt_used}
              </pre>
            </details>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.68)' }}>
                Modelo: {result.model}
              </span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.68)' }}>
                Costo: ${result.cost_usd?.toFixed(6)} USD
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AtlaxPersonaPanel({ orgId }) {
  const [form, setForm]           = useState(DEFAULT_FORM);
  const [greetings_raw, setGreetingsRaw] = useState('');
  const [tier, setTier]           = useState('off');
  const [masterOn, setMasterOn]   = useState(false);
  const [version, setVersion]     = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [recentAudit, setRecentAudit] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [saved, setSaved]         = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const tierNum = (() => {
    if (!tier || tier === 'off') return 0;
    try { return parseInt(tier.replace('T', ''), 10); } catch { return 0; }
  })();
  const canEdit = tierNum >= 2;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/superadmin/atlax-persona/${encodeURIComponent(orgId)}`);
      setForm({
        persona_name:          data.persona_name          || DEFAULT_FORM.persona_name,
        persona_tagline:       data.persona_tagline       || DEFAULT_FORM.persona_tagline,
        tone:                  data.tone                  || DEFAULT_FORM.tone,
        formality_level:       data.formality_level       || DEFAULT_FORM.formality_level,
        warmth_level:          data.warmth_level          || DEFAULT_FORM.warmth_level,
        tech_jargon_allowed:   !!data.tech_jargon_allowed,
        brand_voice_keywords:  data.brand_voice_keywords  || [],
        forbidden_topics:      data.forbidden_topics      || [],
        custom_signature:      data.custom_signature      || '',
        language_register:     data.language_register     || DEFAULT_FORM.language_register,
      });
      setGreetingsRaw((data.custom_greetings || []).join('\n'));
      setTier(data.tier || 'off');
      setMasterOn(!!data.master_switch);
      setVersion(data.version || 0);
      setUpdatedAt(data.updated_at);
      setUpdatedBy(data.updated_by);
      setRecentAudit(data.recent_audit || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = {
        ...form,
        custom_greetings: greetings_raw.split('\n').map(s => s.trim()).filter(Boolean),
      };
      const data = await apiFetch(`/api/superadmin/atlax-persona/${encodeURIComponent(orgId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setVersion(data.version || version + 1);
      setUpdatedAt(data.updated_at);
      setUpdatedBy(data.updated_by);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>
        Cargando persona…
      </div>
    );
  }

  return (
    <div data-testid="atlax-persona-panel" style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>
            Atlax Persona
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240, 235, 224, 0.70)', marginTop: 2 }}>
            Personalidad del asistente por organización
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            data-testid="atlax-persona-refresh-btn"
            onClick={load}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9999, padding: '5px 10px', cursor: 'pointer', color: 'rgba(240,235,224,0.55)', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={12} />
          </button>
          {/* Tier badge */}
          <span style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 10.5,
            fontFamily: 'DM Sans', fontWeight: 700,
            background: canEdit ? 'rgba(var(--theme-rgb),0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${canEdit ? 'rgba(var(--theme-rgb),0.40)' : 'rgba(255,255,255,0.12)'}`,
            color: canEdit ? 'var(--theme)' : 'rgba(240, 235, 224, 0.68)',
          }}>
            {tier === 'off' ? 'Sin tier' : tier}
          </span>
        </div>
      </div>

      {/* Tier gate notice */}
      {!canEdit && (
        <div data-testid="atlax-persona-tier-notice" style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
          <AlertCircle size={13} color="#FBBF24" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)' }}>
            Atlax Persona requiere tier T2+. Actualmente la org tiene tier <strong style={{ color: '#FBBF24' }}>{tier === 'off' ? 'desactivado' : tier}</strong>. Puedes configurar la persona pero no guardar.
          </span>
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {saved && (
        <div data-testid="atlax-persona-saved-msg" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 12.5, marginBottom: 14 }}>
          Persona guardada correctamente
        </div>
      )}

      {/* SECTION 1: Identidad */}
      <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12 }}>
        <SectionTitle Icon={MessageSquare} title="Identidad" />
        <div style={{ marginBottom: 10 }}>
          <FieldLabel>Nombre del asistente</FieldLabel>
          <TextInput
            value={form.persona_name}
            onChange={v => setField('persona_name', v)}
            placeholder="Atlax"
            testid="atlax-persona-name-input"
            maxLength={60}
          />
        </div>
        <div>
          <FieldLabel>Tagline de marca</FieldLabel>
          <TextInput
            value={form.persona_tagline}
            onChange={v => setField('persona_tagline', v)}
            placeholder="Tu asistente para encontrar casa en CDMX"
            testid="atlax-persona-tagline-input"
            maxLength={120}
          />
        </div>
      </div>

      {/* SECTION 2: Tono */}
      <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12 }}>
        <SectionTitle Icon={Tag} title="Tono y Estilo" />
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Tono comunicacional</FieldLabel>
          <Dropdown
            value={form.tone}
            onChange={v => setField('tone', v)}
            options={TONE_OPTIONS}
            testid="atlax-persona-tone-select"
          />
        </div>
        <RangeSlider
          value={form.formality_level}
          onChange={v => setField('formality_level', v)}
          min={1} max={5}
          label="Nivel de formalidad"
          testid="atlax-persona-formality-slider"
        />
        <RangeSlider
          value={form.warmth_level}
          onChange={v => setField('warmth_level', v)}
          min={1} max={5}
          label="Nivel de calidez"
          testid="atlax-persona-warmth-slider"
        />
        <Toggle
          value={form.tech_jargon_allowed}
          onChange={v => setField('tech_jargon_allowed', v)}
          label="Permitir jerga técnica inmobiliaria"
          testid="atlax-persona-jargon-toggle"
        />
      </div>

      {/* SECTION 3: Voz de marca */}
      <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12 }}>
        <SectionTitle Icon={Tag} title="Voz de Marca" />
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Palabras clave de marca (Enter o coma para agregar)</FieldLabel>
          <ChipInput
            chips={form.brand_voice_keywords}
            onChange={v => setField('brand_voice_keywords', v)}
            placeholder="Ej: plusvalía, exclusivo, CDMX…"
            testid="atlax-persona-keywords-input"
          />
        </div>
        <div>
          <FieldLabel>Temas prohibidos (Enter o coma para agregar)</FieldLabel>
          <ForbiddenChipInput
            chips={form.forbidden_topics}
            onChange={v => setField('forbidden_topics', v)}
            placeholder="Ej: competencia, precios negociables…"
            testid="atlax-persona-forbidden-input"
          />
        </div>
      </div>

      {/* SECTION 4: Greetings & Firma */}
      <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12 }}>
        <SectionTitle Icon={MessageSquare} title="Saludos y Firma" />
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Saludos personalizados (1-3 variantes · una por línea)</FieldLabel>
          <textarea
            data-testid="atlax-persona-greetings-textarea"
            value={greetings_raw}
            onChange={e => setGreetingsRaw(e.target.value)}
            placeholder={'Ej: Hola, soy Atlax\nBienvenido a DesarrollosMX\nCon gusto te ayudo'}
            rows={3}
            maxLength={300}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 9, padding: '8px 12px', color: 'var(--cream)',
              fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', resize: 'vertical',
            }}
          />
        </div>
        <div>
          <FieldLabel>Firma al cierre de respuestas largas</FieldLabel>
          <TextInput
            value={form.custom_signature}
            onChange={v => setField('custom_signature', v)}
            placeholder="Ej: Equipo DesarrollosMX"
            testid="atlax-persona-signature-input"
            maxLength={80}
          />
        </div>
      </div>

      {/* SECTION 5: Registro de idioma */}
      <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16 }}>
        <SectionTitle Icon={Globe} title="Registro de Idioma" />
        <Dropdown
          value={form.language_register}
          onChange={v => setField('language_register', v)}
          options={REGISTER_OPTIONS}
          testid="atlax-persona-register-select"
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          data-testid="atlax-persona-save-btn"
          onClick={handleSave}
          disabled={saving || !canEdit}
          title={!canEdit ? 'Requiere tier T2+' : undefined}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 9999, border: 'none', cursor: canEdit ? 'pointer' : 'not-allowed',
            background: canEdit && !saving ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))' : 'rgba(255,255,255,0.08)',
            color: canEdit ? '#fff' : 'rgba(240,235,224,0.35)',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'background 0.25s',
          }}
        >
          {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Guardando…</> : <><Save size={13} /> Guardar persona</>}
        </button>
        <button
          data-testid="atlax-persona-preview-btn"
          onClick={() => setShowPreview(true)}
          style={{
            padding: '10px 18px', borderRadius: 9999, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(var(--theme-rgb),0.40)',
            color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          <Eye size={13} /> Preview
        </button>
      </div>

      {/* Footer meta */}
      <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.68)' }}>
            Versión: <strong style={{ color: 'rgba(240,235,224,0.65)' }}>v{version}</strong>
          </span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.68)' }}>
            Actualizado: <strong style={{ color: 'rgba(240,235,224,0.65)' }}>{fmtDate(updatedAt)}</strong>
          </span>
          {updatedBy && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.68)' }}>
              Por: <strong style={{ color: 'rgba(240,235,224,0.65)' }}>{updatedBy}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Audit log */}
      {recentAudit.length > 0 && (
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Ultimos cambios
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {recentAudit.map((a, i) => (
              <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={10} color="rgba(var(--theme-rgb),0.60)" />
                <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream)' }}>
                  {a.action || 'update'} · <span style={{ color: 'rgba(240, 235, 224, 0.72)' }}>{(a.diff_keys || []).join(', ') || 'sin campos'}</span>
                </span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.35)' }}>{fmtDate(a.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview modal */}
      {showPreview && (
        <PreviewModal
          orgId={orgId}
          form={{ ...form, greetings_raw }}
          onClose={() => setShowPreview(false)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
