/**
 * W4.7 Y.4C — ArgumentarioPanel
 * Argumentario personalizado por lead · DISC-adaptive scripts para el asesor.
 * Secciones: Opening Script · Value Pitch · Objeciones · Cierre · Descubrimiento
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy, RefreshCw, CheckCircle, ChevronDown, ChevronUp,
  Loader2, Phone, MessageSquare, Mail, AlertCircle, Zap, Check,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DISC_COLORS = {
  D:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#F87171', label: 'Dominante' },
  I:   { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)', text: '#FBBF24', label: 'Influyente' },
  S:   { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.35)', text: '#4ADE80', label: 'Estable' },
  C:   { bg: 'rgba(var(--theme-rgb),0.12)', border: 'rgba(var(--theme-rgb),0.35)', text: 'var(--theme)', label: 'Concienzudo' },
  MIX: { bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.30)', text: '#9CA3AF', label: 'Mixto' },
};

const LAYER_COLORS = {
  llm:       { text: '#4ADE80', label: 'LLM' },
  cache:     { text: '#FBBF24', label: 'Caché' },
  heuristic: { text: 'var(--theme)', label: 'Heurística' },
};

const OBJECTION_LABELS = {
  precio_alto:               'Precio alto',
  timing:                    'Timing / urgencia',
  pareja_decide:             'Pareja decide',
  prefiero_otra_zona:        'Prefiere otra zona',
  necesito_pensarlo:         'Necesita pensarlo',
  financiamiento_complicado: 'Financiamiento complicado',
};

const CHANNEL_ICONS = {
  call:      Phone,
  whatsapp:  MessageSquare,
  email:     Mail,
};

const CHANNEL_LABELS = { call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useCopyToast() {
  const [copied, setCopied] = useState('');
  const copy = (text, key) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };
  return { copied, copy };
}

function DiscBadge({ type }) {
  const c = DISC_COLORS[type] || DISC_COLORS.MIX;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 11,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    }}>
      {type} · {c.label}
    </span>
  );
}

function LayerBadge({ layer }) {
  const c = LAYER_COLORS[layer] || LAYER_COLORS.heuristic;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 9999, fontSize: 10,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
      color: c.text,
    }}>
      {c.label}
    </span>
  );
}

function CopyBtn({ text, copyKey, copied, copy }) {
  const active = copied === copyKey;
  return (
    <button
      onClick={() => copy(text, copyKey)}
      title="Copiar"
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '3px 6px', borderRadius: 6, color: active ? '#4ADE80' : 'rgba(240,235,224,0.40)',
        display: 'flex', alignItems: 'center', gap: 3,
        transition: 'color 0.2s',
      }}
    >
      {active ? <Check size={12} /> : <Copy size={12} />}
      <span style={{ fontFamily: 'DM Sans', fontSize: 10.5 }}>{active ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}

function SectionHeader({ title, expanded, toggle, Icon }) {
  return (
    <button
      onClick={toggle}
      style={{
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={13} color="var(--theme)" />}
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: 'var(--cream)' }}>
          {title}
        </span>
      </div>
      {expanded ? <ChevronUp size={13} color="rgba(240,235,224,0.40)" /> : <ChevronDown size={13} color="rgba(240,235,224,0.40)" />}
    </button>
  );
}

function ScriptBlock({ text, copyKey, copied, copy, small = false }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        padding: '10px 36px 10px 12px',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, fontFamily: 'DM Sans',
        fontSize: small ? 12 : 12.5, color: 'var(--cream)',
        lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
      </div>
      <div style={{ position: 'absolute', top: 6, right: 4 }}>
        <CopyBtn text={text} copyKey={copyKey} copied={copied} copy={copy} />
      </div>
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────
function OpeningSection({ content, copied, copy, expanded, toggle }) {
  const [activeChannel, setActiveChannel] = useState('call');
  const script = content?.opening_script || {};

  return (
    <div style={{ borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 }}>
      <SectionHeader title="Apertura de contacto" expanded={expanded} toggle={toggle} Icon={Phone} />
      {expanded && (
        <div style={{ padding: '12px 14px' }}>
          {/* Channel tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {Object.entries(CHANNEL_LABELS).map(([ch, label]) => {
              const Icon = CHANNEL_ICONS[ch];
              return (
                <button
                  key={ch}
                  data-testid={`argumentario-channel-${ch}`}
                  onClick={() => setActiveChannel(ch)}
                  style={{
                    padding: '5px 12px', borderRadius: 9999, cursor: 'pointer',
                    border: activeChannel === ch ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)',
                    background: activeChannel === ch ? 'rgba(var(--theme-rgb),0.15)' : 'transparent',
                    color: activeChannel === ch ? 'var(--theme)' : 'rgba(240,235,224,0.50)',
                    fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Icon size={11} /> {label}
                </button>
              );
            })}
          </div>
          <ScriptBlock
            text={script[activeChannel] || '—'}
            copyKey={`opening_${activeChannel}`}
            copied={copied} copy={copy}
          />
        </div>
      )}
    </div>
  );
}

function ValuePitchSection({ content, copied, copy, expanded, toggle }) {
  return (
    <div style={{ borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 }}>
      <SectionHeader title="Propuesta de valor" expanded={expanded} toggle={toggle} Icon={Zap} />
      {expanded && (
        <div style={{ padding: '12px 14px' }}>
          <ScriptBlock text={content?.value_pitch || '—'} copyKey="value_pitch" copied={copied} copy={copy} />
        </div>
      )}
    </div>
  );
}

function ObjectionsSection({ content, copied, copy, expanded, toggle }) {
  const [openObj, setOpenObj] = useState(null);
  const responses = content?.objection_responses || {};

  return (
    <div style={{ borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 }}>
      <SectionHeader title="Respuestas a objeciones" expanded={expanded} toggle={toggle} Icon={MessageSquare} />
      {expanded && (
        <div style={{ padding: '12px 14px' }}>
          {Object.entries(OBJECTION_LABELS).map(([key, label]) => (
            <div key={key} style={{ marginBottom: 7 }}>
              <button
                data-testid={`argumentario-objection-${key}`}
                onClick={() => setOpenObj(openObj === key ? null : key)}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: openObj === key ? '8px 8px 0 0' : 8, cursor: 'pointer',
                  padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.85)', fontWeight: 600 }}>
                  {label}
                </span>
                {openObj === key ? <ChevronUp size={12} color="rgba(240,235,224,0.40)" /> : <ChevronDown size={12} color="rgba(240,235,224,0.40)" />}
              </button>
              {openObj === key && (
                <div style={{
                  padding: '10px 12px', borderRadius: '0 0 8px 8px',
                  background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)',
                  borderTop: 'none', position: 'relative',
                }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', lineHeight: 1.65, paddingRight: 36 }}>
                    {responses[key] || '—'}
                  </div>
                  <div style={{ position: 'absolute', top: 6, right: 6 }}>
                    <CopyBtn text={responses[key] || ''} copyKey={`obj_${key}`} copied={copied} copy={copy} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClosingSection({ content, copied, copy, expanded, toggle, discType }) {
  const ct = content?.closing_technique || {};
  const discColor = (DISC_COLORS[discType] || DISC_COLORS.MIX).text;

  return (
    <div style={{ borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 }}>
      <SectionHeader title="Técnica de cierre recomendada" expanded={expanded} toggle={toggle} Icon={CheckCircle} />
      {expanded && (
        <div style={{ padding: '12px 14px' }}>
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.22)',
            marginBottom: 10,
          }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: discColor, marginBottom: 5 }}>
              {ct.name || ct.recommended || '—'}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.60)', marginBottom: 8 }}>
              {ct.rationale}
            </div>
          </div>
          {ct.script && (
            <ScriptBlock text={ct.script} copyKey="closing_script" copied={copied} copy={copy} />
          )}
        </div>
      )}
    </div>
  );
}

function DiscoverySection({ content, copied, copy, expanded, toggle }) {
  const questions = content?.discovery_questions || [];

  return (
    <div style={{ borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 8 }}>
      <SectionHeader title="Preguntas de descubrimiento" expanded={expanded} toggle={toggle} Icon={AlertCircle} />
      {expanded && (
        <div style={{ padding: '12px 14px' }}>
          {questions.map((q, i) => (
            <div key={i} style={{ marginBottom: 7, position: 'relative' }}>
              <div style={{
                padding: '9px 36px 9px 12px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
              }}>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.50)', marginRight: 8 }}>{i + 1}.</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>{q}</span>
              </div>
              <div style={{ position: 'absolute', top: 5, right: 4 }}>
                <CopyBtn text={q} copyKey={`dq_${i}`} copied={copied} copy={copy} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ArgumentarioPanel({ leadId, asesorId, leadName }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefresh] = useState(false);
  const [error, setError]       = useState('');
  const [markUsedDone, setMarkUsedDone] = useState(false);
  const [rateLimitHint, setRateLimitHint] = useState('');

  // Section expanded state — all expanded by default
  const [sections, setSections] = useState({
    opening: true, value_pitch: true, objections: true,
    closing: true, discovery: true,
  });

  const { copied, copy } = useCopyToast();

  const toggleSection = (key) => setSections(s => ({ ...s, [key]: !s[key] }));

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError('');
    try {
      const params = asesorId ? `?asesor_id=${encodeURIComponent(asesorId)}` : '';
      const res = await apiFetch(`/api/agentic-crm/argumentario/${encodeURIComponent(leadId)}${params}`);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [leadId, asesorId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefresh(true);
    setError('');
    setRateLimitHint('');
    try {
      const params = asesorId ? `?asesor_id=${encodeURIComponent(asesorId)}` : '';
      const res = await apiFetch(
        `/api/agentic-crm/argumentario/${encodeURIComponent(leadId)}/refresh${params}`,
        { method: 'POST' }
      );
      setData(res);
    } catch (e) {
      if (e.message.includes('Rate limit') || e.message.includes('refresh')) {
        setRateLimitHint(e.message);
      } else {
        setError(e.message);
      }
    } finally {
      setRefresh(false);
    }
  };

  const handleMarkUsed = async () => {
    try {
      await apiFetch(
        `/api/agentic-crm/argumentario/${encodeURIComponent(leadId)}/mark-used`,
        { method: 'POST' }
      );
      setMarkUsedDone(true);
      setTimeout(() => setMarkUsedDone(false), 4000);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div data-testid="argumentario-panel-loading" style={{ padding: '18px 0', textAlign: 'center', color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 12 }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 6 }} />
        <div>Generando argumentario…</div>
        <style>{'@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }'}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div data-testid="argumentario-panel-error" style={{
        padding: '12px 14px', borderRadius: 10,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
        fontFamily: 'DM Sans', fontSize: 12.5, color: '#F87171',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertCircle size={13} />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const content = data.content || {};
  const discType = data.disc_type || 'MIX';
  const layer = data.layer_used || 'heuristic';
  const discConf = DISC_COLORS[discType] || DISC_COLORS.MIX;
  const status = data.status;
  const cadence = content.followup_cadence || {};

  return (
    <div data-testid="argumentario-panel" style={{ marginTop: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>
            Argumentario {leadName ? `· ${leadName}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
            <DiscBadge type={discType} />
            <LayerBadge layer={layer} />
            {status === 'used' && (
              <span style={{
                padding: '2px 8px', borderRadius: 9999, fontSize: 10,
                background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)',
                color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 700,
              }}>Usado</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button
            data-testid="argumentario-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refrescar argumentario (máx 1 vez / 12h)"
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 9999, padding: '5px 10px', cursor: refreshing ? 'not-allowed' : 'pointer',
              color: 'rgba(240,235,224,0.55)', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {refreshing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
            <span style={{ fontFamily: 'DM Sans', fontSize: 11 }}>Refrescar</span>
          </button>
        </div>
      </div>

      {rateLimitHint && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: '#FBBF24', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 10 }}>
          {rateLimitHint}
        </div>
      )}
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* Sections */}
      <OpeningSection
        content={content} copied={copied} copy={copy}
        expanded={sections.opening} toggle={() => toggleSection('opening')}
      />
      <ValuePitchSection
        content={content} copied={copied} copy={copy}
        expanded={sections.value_pitch} toggle={() => toggleSection('value_pitch')}
      />
      <ObjectionsSection
        content={content} copied={copied} copy={copy}
        expanded={sections.objections} toggle={() => toggleSection('objections')}
      />
      <ClosingSection
        content={content} copied={copied} copy={copy} discType={discType}
        expanded={sections.closing} toggle={() => toggleSection('closing')}
      />
      <DiscoverySection
        content={content} copied={copied} copy={copy}
        expanded={sections.discovery} toggle={() => toggleSection('discovery')}
      />

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.40)' }}>
            Seguimiento: <strong style={{ color: 'rgba(240,235,224,0.65)' }}>
              1ro {cadence.first} · 2do {cadence.second} · 3ro {cadence.third}
            </strong>
          </span>
          {data.cost_usd > 0 && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.35)' }}>
              ${data.cost_usd?.toFixed(6)} USD
            </span>
          )}
        </div>
        <button
          data-testid="argumentario-mark-used-btn"
          onClick={handleMarkUsed}
          disabled={markUsedDone}
          style={{
            padding: '8px 16px', borderRadius: 9999, border: 'none', cursor: markUsedDone ? 'default' : 'pointer',
            background: markUsedDone ? 'rgba(52,211,153,0.15)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            color: markUsedDone ? '#4ADE80' : '#fff',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'background 0.25s',
          }}
        >
          {markUsedDone ? <><Check size={12} /> Argumentario usado</> : 'Marcar como usado'}
        </button>
      </div>

      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
