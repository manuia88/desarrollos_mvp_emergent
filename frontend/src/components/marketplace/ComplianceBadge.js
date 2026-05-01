// ComplianceBadge — Phase 7.4 · Public-facing badge powered by IE_PROY_* scores.
// Shows in marketplace cards (overlay top-right) and on /desarrollo/:id ficha (below title).
// Hidden if no docs uploaded OR RISK_LEGAL=red (cero overshare, cero fearmongering).
import React, { useEffect, useState } from 'react';
import { Sparkle, Check, X } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

const TONE = {
  green: {
    bg: 'linear-gradient(92deg, rgba(34,197,94,0.92), rgba(16,185,129,0.92))',
    border: 'rgba(34,197,94,0.55)', fg: '#fff',
    icon: Check,
  },
  amber: {
    bg: 'linear-gradient(92deg, rgba(245,158,11,0.85), rgba(249,115,22,0.85))',
    border: 'rgba(245,158,11,0.55)', fg: '#fff',
    icon: Sparkle,
  },
};


function fetchBadge(devId) {
  return fetch(`${API}/api/developments/${encodeURIComponent(devId)}/compliance-badge`).then(r => r.json()).catch(() => null);
}


function ScoreRow({ label, score }) {
  const v = score?.value;
  const tier = score?.tier;
  const color = tier === 'green' ? '#86efac' : tier === 'amber' ? '#fcd34d' : '#fca5a5';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 9999, background: color }} />
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream)', minWidth: 50, textAlign: 'right' }}>
          {v == null ? '—' : `${Math.round(v)}/100`}
        </span>
      </div>
    </div>
  );
}


function BreakdownModal({ data, onClose }) {
  return (
    <div data-testid="badge-breakdown-modal" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 800,
      background: 'rgba(6,8,15,0.84)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 460, maxWidth: '100%',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)', borderRadius: 18, padding: 26,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div className="eyebrow">Compliance · DMX Document Intelligence</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
              {data.label_es}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{
            background: 'transparent', border: '1px solid var(--border)', padding: 8, borderRadius: 9999,
            color: 'var(--cream-3)', cursor: 'pointer',
          }}><X size={14} /></button>
        </div>

        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55, marginBottom: 14 }}>
          DMX procesa los documentos legales y comerciales del developer (escrituras, permisos SEDUVI, licencias de construcción, listas de precios, predial, etc.) con OCR + IA estructurada. Cada documento queda cifrado, los datos se cruzan entre sí para detectar inconsistencias y los scores reflejan el resultado.
        </p>

        <ScoreRow label="Riesgo legal (cross-check)" score={data.scores.risk_legal} />
        <ScoreRow label="Cumplimiento de reglas" score={data.scores.compliance} />
        <ScoreRow label="Calidad documental" score={data.scores.quality_docs} />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14, padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            <strong style={{ color: 'var(--cream-2)' }}>{data.verified_docs_count}</strong> documento{data.verified_docs_count === 1 ? '' : 's'} verificado{data.verified_docs_count === 1 ? '' : 's'}
          </span>
          {data.last_update_at && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
              Actualizado {new Date(data.last_update_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Overlay variant for marketplace card (top-right corner) ───────────────
export function ComplianceBadgeOverlay({ devId }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (devId) fetchBadge(devId).then(setData); }, [devId]);
  if (!data?.tier) return null;
  const tone = TONE[data.tier];
  const Icon = tone.icon;
  return (
    <div data-testid={`compliance-badge-overlay-${data.tier}`} style={{
      position: 'absolute', top: 44, right: 10, zIndex: 3,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 9999,
      background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 9.5,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      boxShadow: '0 4px 14px rgba(0,0,0,0.32)',
      pointerEvents: 'none',
    }}>
      <Icon size={9} color={tone.fg} />
      {data.tier === 'green' ? 'DMX Verificado' : 'Verificación parcial'}
    </div>
  );
}


// ─── Inline variant for ficha header (clickable → modal) ────────────────────
export function ComplianceBadgeInline({ devId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (devId) fetchBadge(devId).then(setData); }, [devId]);
  if (!data?.tier) return null;
  const tone = TONE[data.tier];
  const Icon = tone.icon;
  return (
    <>
      <button
        data-testid={`compliance-badge-inline-${data.tier}`}
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 14px', borderRadius: 9999,
          background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 11,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        }}
      >
        <Icon size={10} color={tone.fg} />
        {data.label_es}
      </button>
      {open && <BreakdownModal data={data} onClose={() => setOpen(false)} />}
    </>
  );
}


// ─── 3-dot summary for legajo header ────────────────────────────────────────
export function ComplianceDotStrip({ devId }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (devId) fetchBadge(devId).then(setData); }, [devId]);
  if (!data) return null;
  const dot = (score) => {
    const tier = score?.tier;
    return tier === 'green' ? '#22c55e' : tier === 'amber' ? '#f59e0b' : tier === 'red' ? '#ef4444' : 'rgba(148,163,184,0.4)';
  };
  return (
    <div data-testid="compliance-dot-strip" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div title="Riesgo legal" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 9999, background: dot(data.scores.risk_legal), boxShadow: `0 0 12px ${dot(data.scores.risk_legal)}66` }} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)' }}>Riesgo legal</span>
      </div>
      <div title="Cumplimiento" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 9999, background: dot(data.scores.compliance), boxShadow: `0 0 12px ${dot(data.scores.compliance)}66` }} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)' }}>Cumplimiento</span>
      </div>
      <div title="Calidad documental" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 9999, background: dot(data.scores.quality_docs), boxShadow: `0 0 12px ${dot(data.scores.quality_docs)}66` }} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)' }}>Calidad docs</span>
      </div>
      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
        · {data.verified_docs_count} doc{data.verified_docs_count === 1 ? '' : 's'} verificado{data.verified_docs_count === 1 ? '' : 's'}
      </span>
    </div>
  );
}
