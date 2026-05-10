/**
 * W4.6 Y.3B — VisitPrepDossier
 * Card asesor con dossier preparatorio AI · 6 secciones colapsables + mark-viewed + download PDF.
 * Mounted en AsesorTareas alongside del legacy VisitAutoPrepCard.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye, FileDown, ChevronDown, ChevronRight, Cpu, Database, Zap,
  User, Layers, AlertCircle, Sparkles, Building, Home, Loader2,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

const LAYER_META = {
  llm:       { label: 'LLM',       color: '#6366F1', Icon: Cpu },
  cached:    { label: 'Cached',    color: '#F59E0B', Icon: Database },
  cache:     { label: 'Cached',    color: '#F59E0B', Icon: Database },
  heuristic: { label: 'Heurística', color: '#94A3B8', Icon: Zap },
};

const SECTIONS = [
  { key: 'buyer_profile',                   label: 'Perfil del comprador',  Icon: User       },
  { key: 'top_3_comparables_likely_asked',  label: 'Top 3 comparables',     Icon: Layers     },
  { key: 'likely_objections',               label: 'Objeciones probables',  Icon: AlertCircle },
  { key: 'talking_points',                  label: 'Talking points',        Icon: Sparkles   },
  { key: 'key_project_data',                label: 'Datos del proyecto',    Icon: Building   },
  { key: 'recommended_units',               label: 'Unidades recomendadas', Icon: Home       },
];

function PillButton({ children, onClick, variant = 'primary', disabled, testid, Icon }) {
  const styles = {
    primary: { background: 'linear-gradient(90deg, #6366F1, #EC4899)', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: 'var(--cream)', border: '1px solid rgba(240,235,224,0.18)' },
    success: { background: 'transparent', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' },
  };
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full"
      style={{
        ...styles[variant],
        padding: '6px 14px', borderRadius: 9999, fontFamily: 'DM Sans',
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'transform 120ms ease, opacity 120ms ease',
      }}
    >
      {Icon ? <Icon size={12} /> : null}
      {children}
    </button>
  );
}

function Badge({ label, color, Icon }) {
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 9999, fontSize: 10.5,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: `${color}22`, border: `1px solid ${color}44`, color,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {Icon ? <Icon size={10} /> : null}
      {label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { hour12: false }); }
  catch { return iso; }
}

// ─── Section renderers ───────────────────────────────────────────────────────
function renderSection(key, value) {
  if (key === 'buyer_profile') {
    return (
      <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.85)',
                  lineHeight: 1.6, margin: 0 }}>
        {value || '—'}
      </p>
    );
  }
  if (key === 'top_3_comparables_likely_asked') {
    if (!value || value.length === 0) {
      return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.45)' }}>—</div>;
    }
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {value.map((c, i) => (
          <li key={i} style={{
            padding: 8, background: 'rgba(0,0,0,0.20)',
            borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)',
          }}>
            <strong style={{ color: '#A5B4FC' }}>{c.name || c.unit_id || '—'}</strong>
            {c.project_id ? <span style={{ color: 'rgba(240,235,224,0.55)' }}> · {c.project_id}</span> : null}
            {c.why_asked ? (
              <div style={{ marginTop: 3, fontSize: 11.5, color: 'rgba(240,235,224,0.70)' }}>{c.why_asked}</div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  if (key === 'likely_objections') {
    if (!value || value.length === 0) return <div style={{ color: 'rgba(240,235,224,0.45)', fontFamily: 'DM Sans', fontSize: 12 }}>—</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.map((o, i) => (
          <div key={i} style={{ padding: 10, background: 'rgba(0,0,0,0.20)', borderRadius: 10 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#FCA5A5', fontWeight: 600 }}>
              {o.objection || '—'}
            </div>
            {o.rebuttal ? (
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.75)', marginTop: 4, lineHeight: 1.5 }}>
                <span style={{ color: '#A5B4FC', fontWeight: 600 }}>↳ </span>{o.rebuttal}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }
  if (key === 'talking_points') {
    if (!value || value.length === 0) return <div style={{ color: 'rgba(240,235,224,0.45)', fontFamily: 'DM Sans', fontSize: 12 }}>—</div>;
    return (
      <ol style={{ paddingLeft: 18, margin: 0, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>
        {value.map((tp, i) => <li key={i} style={{ margin: '4px 0', lineHeight: 1.5 }}>{tp}</li>)}
      </ol>
    );
  }
  if (key === 'key_project_data') {
    if (!value || Object.keys(value).length === 0) return <div style={{ color: 'rgba(240,235,224,0.45)', fontFamily: 'DM Sans', fontSize: 12 }}>—</div>;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ padding: 8, background: 'rgba(0,0,0,0.20)', borderRadius: 10 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5,
                          color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {k}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', marginTop: 3, lineHeight: 1.4 }}>
              {Array.isArray(v) ? v.join(' · ') : (typeof v === 'number' ? v.toLocaleString('es-MX') : (v || '—'))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (key === 'recommended_units') {
    if (!value || value.length === 0) return <div style={{ color: 'rgba(240,235,224,0.45)', fontFamily: 'DM Sans', fontSize: 12 }}>—</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {value.map((u, i) => (
          <div key={i} style={{ padding: 8, background: 'rgba(0,0,0,0.20)', borderRadius: 10 }}>
            <strong style={{ color: '#A5B4FC', fontFamily: 'DM Sans', fontSize: 12.5 }}>
              {u.name || u.unit_id || '—'}
            </strong>
            {u.rationale ? (
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.75)', marginTop: 3, lineHeight: 1.5 }}>
                {u.rationale}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function VisitPrepDossier({
  leadId, asesorId, projectId, visitScheduledAt,
  projectName, dossierId: initialDossierId,
}) {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({ buyer_profile: true });
  const [busyAction, setBusyAction] = useState(null);

  const tryLoadExisting = useCallback(async () => {
    if (!asesorId) return;
    try {
      const data = await apiFetch(`/api/agentic-crm/visit-prep/dossiers?asesor_id=${asesorId}&limit=20`);
      const found = (data.dossiers || []).find((d) =>
        d.lead_id === leadId && d.project_id === projectId
        && d.visit_scheduled_at?.slice(0, 16) === (visitScheduledAt || '').slice(0, 16),
      );
      if (found) setDossier(found);
    } catch (e) {
      // silencioso · botón "Generar" sigue disponible
    }
  }, [leadId, asesorId, projectId, visitScheduledAt]);

  useEffect(() => {
    if (initialDossierId) {
      apiFetch(`/api/agentic-crm/visit-prep/dossiers?limit=200`)
        .then((data) => {
          const f = (data.dossiers || []).find((d) => d.dossier_id === initialDossierId);
          if (f) setDossier(f);
        })
        .catch(() => { /* ignore */ });
    } else {
      tryLoadExisting();
    }
  }, [initialDossierId, tryLoadExisting]);

  const handleGenerate = async () => {
    if (!leadId || !asesorId || !projectId || !visitScheduledAt) {
      setError('Faltan datos: lead_id, asesor_id, project_id, visit_scheduled_at');
      return;
    }
    setLoading(true); setError(null);
    try {
      const result = await apiFetch('/api/agentic-crm/visit-prep/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId, asesor_id: asesorId, project_id: projectId,
          visit_scheduled_at: visitScheduledAt,
        }),
      });
      setDossier(result);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleMarkViewed = async () => {
    if (!dossier?.dossier_id) return;
    setBusyAction('view'); setError(null);
    try {
      await apiFetch(`/api/agentic-crm/visit-prep/dossiers/${dossier.dossier_id}/mark-viewed`, { method: 'POST' });
      setDossier((d) => ({ ...d, status: 'viewed' }));
    } catch (e) { setError(e.message); }
    finally { setBusyAction(null); }
  };

  const handleDownloadPdf = () => {
    if (!dossier?.dossier_content) return;
    // Print-to-PDF fallback (sin nueva dependencia · usuario usa diálogo navegador)
    const c = dossier.dossier_content;
    const win = window.open('', '_blank');
    if (!win) return;
    const safeArr = (a, k) => (a || []).map((x) =>
      typeof x === 'string' ? x : (x?.[k] || x?.objection || x?.name || JSON.stringify(x))
    );
    win.document.write(`<!doctype html><html><head><title>Dossier · ${projectName || projectId}</title>
      <style>body{font-family:Inter,Arial;background:#fff;color:#06080F;padding:32px;max-width:780px;margin:0 auto}
      h1{font-size:22px;margin:0 0 8px}h3{font-size:13px;margin:18px 0 6px;color:#6366F1;text-transform:uppercase;letter-spacing:0.10em}
      ul,ol{padding-left:20px;font-size:13px;line-height:1.6}
      .meta{font-size:11px;color:#6b7280;margin-bottom:20px}
      .obj{padding:8px 12px;background:#f9fafb;border-radius:8px;margin:6px 0}
      .obj b{color:#dc2626}.obj div{font-size:12px;color:#374151;margin-top:3px}</style></head>
      <body>
      <h1>Dossier de visita · ${projectName || projectId || ''}</h1>
      <div class="meta">Visita: ${fmtDate(visitScheduledAt)} · Generado: ${fmtDate(dossier.dossier_generated_at)} · Capa: ${dossier.layer_used || '—'}</div>
      <h3>Perfil del comprador</h3><p>${c.buyer_profile || '—'}</p>
      <h3>Top 3 comparables probables</h3><ul>${(c.top_3_comparables_likely_asked || []).map((x) => `<li>${x.name || x.unit_id || '—'} ${x.why_asked ? `· ${x.why_asked}` : ''}</li>`).join('') || '<li>—</li>'}</ul>
      <h3>Objeciones probables</h3>${(c.likely_objections || []).map((o) => `<div class="obj"><b>${o.objection || '—'}</b><div>↳ ${o.rebuttal || ''}</div></div>`).join('') || '<p>—</p>'}
      <h3>Talking points</h3><ol>${safeArr(c.talking_points).map((t) => `<li>${t}</li>`).join('') || '<li>—</li>'}</ol>
      <h3>Datos del proyecto</h3><ul>${Object.entries(c.key_project_data || {}).map(([k, v]) => `<li><b>${k}:</b> ${Array.isArray(v) ? v.join(', ') : v}</li>`).join('') || '<li>—</li>'}</ul>
      <h3>Unidades recomendadas</h3><ul>${(c.recommended_units || []).map((u) => `<li><b>${u.name || u.unit_id || '—'}</b>${u.rationale ? ` · ${u.rationale}` : ''}</li>`).join('') || '<li>—</li>'}</ul>
      <p style="margin-top:30px;font-size:10px;color:#9ca3af">Generado automáticamente por DesarrollosMX · Visit Prep AI · Capa ${dossier.layer_used} · Cost USD ${dossier.cost_usd ?? '0.00'}</p>
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  const layerMeta = LAYER_META[dossier?.layer_used] || LAYER_META.heuristic;
  const content = dossier?.dossier_content || {};
  const cardId = dossier?.dossier_id || `vpd-pending-${leadId}`;

  return (
    <div data-testid={`visit-prep-dossier-${cardId}`} style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(240,235,224,0.10)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 14, padding: 16, marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.55)',
                        letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 3 }}>
            W4.6 Y.3B · Dossier visita
          </div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)',
                       margin: 0, letterSpacing: '-0.01em' }}>
            {projectName || projectId || '—'}
          </h3>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.65)', marginTop: 2 }}>
            Visita: {fmtDate(visitScheduledAt)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {dossier ? (
            <>
              <Badge label={layerMeta.label} color={layerMeta.color} Icon={layerMeta.Icon} />
              {dossier.data_quality === 'simulated'
                ? <Badge label="simulado" color="#F59E0B" /> : null}
              {dossier.status === 'viewed'
                ? <Badge label="Visto" color="#4ADE80" Icon={Eye} /> : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {!dossier ? (
          <PillButton testid={`vpd-btn-generate-${leadId}`}
                      onClick={handleGenerate} disabled={loading}
                      Icon={loading ? Loader2 : Sparkles}>
            {loading ? 'Generando dossier…' : 'Generar dossier'}
          </PillButton>
        ) : (
          <>
            {dossier.status !== 'viewed' ? (
              <PillButton testid={`vpd-btn-mark-viewed-${cardId}`}
                          onClick={handleMarkViewed}
                          disabled={busyAction === 'view'}
                          variant="success" Icon={Eye}>
                {busyAction === 'view' ? 'Marcando…' : 'Marcar visto'}
              </PillButton>
            ) : null}
            <PillButton testid={`vpd-btn-pdf-${cardId}`}
                        onClick={handleDownloadPdf}
                        variant="ghost" Icon={FileDown}>
              Descargar PDF
            </PillButton>
            <PillButton testid={`vpd-btn-regenerate-${cardId}`}
                        onClick={handleGenerate}
                        disabled={loading}
                        variant="ghost"
                        Icon={loading ? Loader2 : Sparkles}>
              {loading ? 'Regenerando…' : 'Regenerar'}
            </PillButton>
          </>
        )}
      </div>

      {error ? (
        <div style={{ marginTop: 10, padding: 8,
                      background: 'rgba(248,113,113,0.10)',
                      border: '1px solid rgba(248,113,113,0.30)',
                      borderRadius: 10, color: '#FCA5A5',
                      fontFamily: 'DM Sans', fontSize: 11.5 }}>
          {error}
        </div>
      ) : null}

      {/* Sections */}
      {dossier ? (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SECTIONS.map(({ key, label, Icon }) => {
            const open = !!openSections[key];
            const value = content[key];
            const empty = key === 'key_project_data'
              ? !value || Object.keys(value).length === 0
              : !value || (Array.isArray(value) ? value.length === 0 : !value);
            return (
              <div key={key} data-testid={`vpd-section-${key}-${cardId}`} style={{
                border: '1px solid rgba(240,235,224,0.06)', borderRadius: 10,
                background: 'rgba(255,255,255,0.015)',
              }}>
                <button
                  data-testid={`vpd-toggle-${key}-${cardId}`}
                  onClick={() => setOpenSections((s) => ({ ...s, [key]: !s[key] }))}
                  className="rounded-full"
                  style={{
                    width: '100%', padding: '10px 14px', display: 'flex',
                    alignItems: 'center', gap: 10, cursor: 'pointer',
                    background: 'transparent', border: 'none', color: 'var(--cream)',
                    fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
                    textAlign: 'left', borderRadius: 9999,
                  }}
                >
                  <Icon size={13} style={{ color: '#A5B4FC' }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {empty ? (
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.40)' }}>vacío</span>
                  ) : null}
                  {open ? <ChevronDown size={14} style={{ opacity: 0.7 }} /> : <ChevronRight size={14} style={{ opacity: 0.7 }} />}
                </button>
                {open ? (
                  <div style={{ padding: '0 14px 12px' }}>
                    {renderSection(key, value)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Footer */}
      {dossier ? (
        <div style={{
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap',
          gap: 8, marginTop: 14, paddingTop: 10,
          borderTop: '1px dashed rgba(240,235,224,0.08)',
          fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.50)',
        }}>
          <span>Generado: {fmtDate(dossier.dossier_generated_at)}</span>
          <span>{(dossier.tokens_in || 0) + (dossier.tokens_out || 0)} tokens · ${(dossier.cost_usd || 0).toFixed(4)}</span>
          <span>Vence: {fmtDate(dossier.expires_at)}</span>
        </div>
      ) : null}
    </div>
  );
}
