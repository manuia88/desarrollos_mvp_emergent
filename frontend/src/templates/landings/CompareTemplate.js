// W5.22 Z.8.7 Sub-B2 · Compare Template · tabla VS competidor con checks ✓ rojas X · 70% Brunson · honest concession
// Consume schema LLM completo de memory/Z8_PROMPT_09_COMPARE.md
import React, { useState } from 'react';

const PAL = { bg: '#FFFFFF', surface: '#F8FAFC', ink: '#0F172A', dim: '#475569', faint: '#94A3B8', green: '#16A34A', red: '#DC2626', indigo: '#6366F1', border: '#E2E8F0' };
const HEAD = "'Outfit', sans-serif";
const BODY = "'DM Sans', sans-serif";
const renderCell = (v) => {
  if (v === '✓' || v === true) return <span style={{ color: PAL.green, fontSize: 18, fontWeight: 800 }}>✓</span>;
  if (v === '✗' || v === false) return <span style={{ color: PAL.red, fontSize: 18, fontWeight: 800 }}>✗</span>;
  if (v === '~') return <span style={{ color: '#EAB308', fontSize: 18, fontWeight: 800 }}>~</span>;
  return v || '—';
};

export default function CompareTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const preHeader = copy?.pre_header || 'Comparamos honestamente. Tú decides.';
  const headline = copy?.headline || intake.project_name || `${intake.project_name || 'Este desarrollo'} vs los 3 que ya estás viendo`;
  const subheadline = copy?.subheadline || 'Tabla editable. Sin sesgo. Con fuente en cada celda.';
  const reframe = copy?.reframe;
  const storyArc = copy?.story_arc;
  const compTable = copy?.comparison_table;
  const honestConcession = copy?.honest_concession_block;
  const threeSecrets = copy?.three_secrets_compare || copy?.secrets || [];
  const fascination = copy?.fascination_bullets || [];
  const antiObjections = copy?.anti_objections || [];
  const stack = copy?.stack_compare || copy?.stack || { items: [] };
  const riskReversal = copy?.risk_reversal_honesty || copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder_rational || copy?.yes_ladder;
  const scarcity = copy?.scarcity_block_sutil || copy?.scarcity_block;
  const leadForm = copy?.lead_form_compare || copy?.lead_form_copy || {};
  const faq = copy?.faq_compare || copy?.faq || [];
  const ps = copy?.ps_honest || copy?.ps || {};
  const footer = copy?.footer_text;

  return (
    <div data-testid="tpl-z87-compare" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh' }}>
      <div style={{ background: PAL.indigo, color: '#fff', padding: '10px 24px', textAlign: 'center', fontFamily: HEAD, fontSize: 13, fontWeight: 600 }}>{preHeader}</div>

      <section style={{ padding: '4rem 2rem', maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontFamily: HEAD, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800, margin: 0, lineHeight: 1.15 }}>{headline}</h1>
        <p style={{ marginTop: 20, fontSize: 18, color: PAL.dim, maxWidth: 720, marginInline: 'auto' }}>{subheadline}</p>
      </section>

      {reframe && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto', background: PAL.surface, borderRadius: 14 }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', fontWeight: 500, lineHeight: 1.7, color: PAL.ink, whiteSpace: 'pre-line', textAlign: 'center' }}>{reframe}</p></section>}

      {compTable?.row_groups?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
          {compTable.intro && <p style={{ color: PAL.dim, marginBottom: 24, textAlign: 'center' }}>{compTable.intro}</p>}
          <div style={{ overflowX: 'auto', border: `1px solid ${PAL.border}`, borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: PAL.surface }}>
                <tr>
                  <th style={{ padding: 14, textAlign: 'left', fontFamily: HEAD, color: PAL.ink, fontWeight: 700, borderBottom: `1px solid ${PAL.border}` }}>Métrica</th>
                  {(compTable.columns || []).map((c, i) => (
                    <th key={i} style={{ padding: 14, textAlign: 'center', fontFamily: HEAD, color: c.is_primary ? PAL.indigo : PAL.ink, fontWeight: 700, background: c.is_primary ? 'rgba(99,102,241,0.08)' : 'transparent', borderBottom: `1px solid ${PAL.border}` }}>{c.label || c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compTable.row_groups.map((g, gi) => (
                  <React.Fragment key={gi}>
                    <tr style={{ background: PAL.surface }}>
                      <td colSpan={(compTable.columns?.length || 0) + 1} style={{ padding: '12px 14px', fontFamily: HEAD, fontSize: 12, color: PAL.dim, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{g.group_name}</td>
                    </tr>
                    {(g.rows || []).map((r, ri) => (
                      <tr key={ri} style={{ borderBottom: `1px solid ${PAL.border}` }}>
                        <td style={{ padding: 14, color: PAL.dim }}>{r.metric}</td>
                        {(compTable.columns || []).map((c, i) => {
                          const cellKey = c.id || ['us', 'comp_a', 'comp_b', 'comp_c'][i];
                          const val = r[cellKey] ?? r.values?.[i];
                          return (
                            <td key={i} style={{ padding: 14, textAlign: 'center', background: c.is_primary ? 'rgba(99,102,241,0.04)' : 'transparent', fontFamily: HEAD, fontWeight: c.is_primary ? 700 : 500, color: c.is_primary ? PAL.indigo : PAL.ink }}>
                              {renderCell(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {compTable.footnote && <p style={{ marginTop: 14, fontSize: 11, color: PAL.faint, fontStyle: 'italic' }}>{compTable.footnote}</p>}
          {compTable.downloadable_excel_url && <a href={compTable.downloadable_excel_url} style={{ display: 'inline-block', marginTop: 18, padding: '12px 24px', background: PAL.indigo, color: '#fff', borderRadius: 8, textDecoration: 'none', fontFamily: HEAD, fontWeight: 700 }}>Descargar tabla editable (Excel)</a>}
        </section>
      )}

      {honestConcession?.concessions?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          <h3 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, margin: '0 0 18px' }}>{honestConcession.intro || 'Honestidad: lo que ellos hacen mejor'}</h3>
          {honestConcession.concessions.map((c, i) => (
            <div key={i} style={{ background: PAL.surface, padding: 22, borderRadius: 12, marginBottom: 14, border: `1px solid ${PAL.border}` }}>
              <p style={{ color: PAL.dim, fontSize: 13, margin: 0 }}>vs <span style={{ fontWeight: 700, color: PAL.ink }}>{c.competitor}</span></p>
              <p style={{ marginTop: 8, color: PAL.ink, lineHeight: 1.6 }}><strong>Ellos:</strong> {c.what_they_do_better}</p>
              <p style={{ marginTop: 8, color: PAL.indigo, lineHeight: 1.6 }}><strong>Nosotros:</strong> {c.our_compensation}</p>
            </div>
          ))}
        </section>
      )}

      {storyArc?.body && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}><p style={{ lineHeight: 1.8, color: PAL.dim, whiteSpace: 'pre-line' }}>{storyArc.body}</p></section>}

      {threeSecrets.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {threeSecrets.slice(0, 3).map((s, i) => (
              <div key={i} style={{ borderTop: `3px solid ${PAL.indigo}`, paddingTop: 20 }}>
                <p style={{ fontFamily: HEAD, fontSize: 11, color: PAL.indigo, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, fontWeight: 700 }}>Secreto #{i + 1}</p>
                <h3 style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 700, margin: '10px 0' }}>{s.title}</h3>
                <p style={{ color: PAL.dim, lineHeight: 1.7, fontSize: 14, whiteSpace: 'pre-line' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {fascination.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
            {fascination.slice(0, 10).map((b, i) => (
              <li key={i} style={{ background: PAL.surface, padding: '12px 16px 12px 42px', borderRadius: 8, position: 'relative', fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ position: 'absolute', left: 16, top: 12, color: PAL.indigo, fontWeight: 800 }}>·</span>{b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {antiObjections.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          {antiObjections.slice(0, 3).map((o, i) => (
            <div key={i} style={{ background: PAL.surface, padding: 22, borderRadius: 12, marginBottom: 14, border: `1px solid ${PAL.border}` }}>
              <p style={{ fontFamily: HEAD, color: PAL.indigo, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Si está pensando</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: PAL.ink, margin: '6px 0 14px' }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.dim, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {stack.items?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          {stack.intro && <p style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, margin: '0 0 20px', textAlign: 'center' }}>{stack.intro}</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {stack.items.map((it, i) => (
              <div key={i} style={{ background: '#fff', border: `1px solid ${PAL.border}`, padding: 16, borderRadius: 10, display: 'grid', gridTemplateColumns: '30px 1fr', gap: 12 }}>
                <span style={{ color: PAL.green, fontSize: 18, fontWeight: 800 }}>{it.icon || '✓'}</span>
                <div>
                  <h4 style={{ margin: 0, fontFamily: HEAD, fontWeight: 700, fontSize: 14 }}>{it.title}</h4>
                  <p style={{ marginTop: 4, color: PAL.dim, fontSize: 13, lineHeight: 1.5 }}>{it.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {riskReversal && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}><p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p></section>}
      {scarcity && <section style={{ padding: '2rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}><p style={{ color: PAL.dim, fontSize: 13 }}>{scarcity}</p></section>}

      <section data-testid="lead-form-section" style={{ padding: '5rem 2rem', background: PAL.ink, color: '#fff' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', textAlign: 'center', margin: '0 0 24px', fontWeight: 800 }}>{leadForm.intro || 'Recibir tabla editable + llamada 45 min'}</h2>
          <CompareForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 18, color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center' }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {yesLadder && <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.1rem, 1.5vw, 1.3rem)', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{yesLadder}</p></section>}

      {faq.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          {faq.map((f, i) => (
            <details key={i} style={{ background: PAL.surface, borderRadius: 10, padding: '14px 18px', marginBottom: 8, border: `1px solid ${PAL.border}` }}>
              <summary style={{ cursor: 'pointer', fontFamily: HEAD, fontWeight: 700, listStyle: 'none' }}>{f.q}</summary>
              <p style={{ marginTop: 8, color: PAL.dim, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          {ps.body && <p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 15 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 14, color: PAL.indigo, fontFamily: HEAD, fontWeight: 700 }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2rem', textAlign: 'center', color: PAL.faint, fontSize: 12 }}>{footer || `${intake.developer_name || ''} · Fuentes públicas citadas · LFPDPPP`}</footer>
    </div>
  );
}

function CompareForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Nombre', required: true },
    { id: 'email', label: 'Correo electrónico', required: true, type: 'email' },
    { id: 'comparing_with', label: '¿Con qué desarrollos comparas?' },
  ];
  const [state, setState] = useState({});
  const [sent, setSent] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) { setSent(true); return; }
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API}/api/landing/${slug}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ payload: state }) });
      setSent(true);
    } catch (_) { setSent(true); }
  };
  if (sent) return <p style={{ background: PAL.indigo, padding: 18, borderRadius: 10, textAlign: 'center', color: '#fff' }}>Tabla enviada. {advisor.full_name || 'Director comercial'} agenda llamada en 48h.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, background: '#fff', padding: 24, borderRadius: 14, color: PAL.ink }}>
      {fields.map((f) => (
        <label key={f.id}>
          <span style={{ display: 'block', fontSize: 12, color: PAL.dim, marginBottom: 6, fontWeight: 600 }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 12, border: `2px solid ${PAL.border}`, borderRadius: 10, fontSize: 14 }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 12, border: `2px solid ${PAL.border}`, borderRadius: 10, fontSize: 14 }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 6, padding: '14px 28px', background: PAL.indigo, color: '#fff', border: 'none', borderRadius: 10, fontFamily: HEAD, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{leadForm.submit_label || 'Recibir tabla + llamada 45 min'}</button>
    </form>
  );
}
