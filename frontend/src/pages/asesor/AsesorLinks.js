/**
 * Phase 4 Batch 20 · /asesor/links — Tracking links + QR.
 */
import React, { useEffect, useState, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader } from '../../components/advisor/primitives';
import { FilterChipsBar } from '../../components/shared/FilterChipsBar';
import SmartEmptyState from '../../components/shared/SmartEmptyState';
import { listLinks, postLink, deleteLink } from '../../api/metrics';
import { Trash, Copy, Download, Plus } from '../../components/icons';
import { Z } from '../../styles/zIndex';

const SOURCES = ['facebook', 'instagram', 'email', 'whatsapp', 'qr', 'other'];
const MEDIUMS = ['social', 'email', 'print', 'direct'];

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 9999,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--cream)', fontSize: 13, fontFamily: 'DM Sans', outline: 'none',
};

const btnPrimary = {
  padding: '9px 18px', borderRadius: 9999,
  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
  color: '#fff', border: 0, cursor: 'pointer',
  fontWeight: 600, fontSize: 13, fontFamily: 'DM Sans',
};

const btnGhost = {
  padding: '7px 14px', borderRadius: 9999,
  background: 'transparent', color: 'var(--cream)',
  border: '1px solid var(--border)', cursor: 'pointer',
  fontSize: 12, fontFamily: 'DM Sans',
};

function copyToClipboard(text) {
  try { navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }
}

export default function AsesorLinks({ user, onLogout }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ utm_source: null, status: 'active' });
  const [form, setForm] = useState({
    project_id: '', utm_source: 'facebook', utm_medium: 'social',
    utm_campaign: '', expires_at: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [recentQR, setRecentQR] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.utm_source) params.utm_source = filters.utm_source;
      if (filters.status) params.status = filters.status;
      const data = await listLinks(params);
      setLinks(data.items || []);
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async () => {
    if (!form.project_id.trim()) {
      setToast({ kind: 'error', text: 'Falta el ID del proyecto' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.expires_at) delete payload.expires_at;
      const created = await postLink(payload);
      setRecentQR(created);
      setToast({ kind: 'success', text: 'Link creado' });
      setShowForm(false);
      setForm({ project_id: '', utm_source: 'facebook', utm_medium: 'social', utm_campaign: '', expires_at: '' });
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.message || 'Error al crear' });
    } finally { setSubmitting(false); }
  };

  const onDelete = async (linkId) => {
    if (!window.confirm('¿Desactivar este link? Las métricas se conservan.')) return;
    try {
      await deleteLink(linkId);
      setToast({ kind: 'success', text: 'Link desactivado' });
      load();
    } catch (e) {
      setToast({ kind: 'error', text: e.message });
    }
  };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="MARKETING · LINKS"
        title="Mis links de tracking"
        sub="Genera URLs con UTM + QR para redes, ads o flyers."
      />

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10,
      }}>
        <FilterChipsBar
          filters_config={[
            { key: 'utm_source', label: 'Fuente',
              options: SOURCES.map(s => ({ value: s, label: s })) },
            { key: 'status', label: 'Estado',
              options: [
                { value: 'active', label: 'Activos' },
                { value: 'expired', label: 'Inactivos' },
              ] },
          ]}
          current_state={filters}
          on_change={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
          sync_url={true}
        />
        <button data-testid="link-create-btn" onClick={() => setShowForm(s => !s)}
                style={btnPrimary}>
          <Plus size={13} style={{ display: 'inline', marginRight: 5 }} />
          {showForm ? 'Cancelar' : 'Nuevo link'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div data-testid="link-create-form" style={{
          padding: 16, borderRadius: 14, marginBottom: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          backdropFilter: 'blur(24px)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10, fontFamily: 'DM Sans',
        }}>
          <Field label="Proyecto (slug)">
            <input data-testid="link-project-input" style={inputStyle}
                    value={form.project_id}
                    placeholder="altavista-polanco"
                    onChange={(e) => setForm({ ...form, project_id: e.target.value })} />
          </Field>
          <Field label="Fuente UTM">
            <select data-testid="link-utm-source" style={inputStyle}
                     value={form.utm_source}
                     onChange={(e) => setForm({ ...form, utm_source: e.target.value })}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Medio UTM">
            <select data-testid="link-utm-medium" style={inputStyle}
                     value={form.utm_medium}
                     onChange={(e) => setForm({ ...form, utm_medium: e.target.value })}>
              {MEDIUMS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Campaña (libre)">
            <input data-testid="link-campaign" style={inputStyle}
                    value={form.utm_campaign}
                    placeholder="primavera_2026"
                    onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} />
          </Field>
          <Field label="Expira (opcional)">
            <input data-testid="link-expires" type="date" style={inputStyle}
                    value={form.expires_at?.slice(0, 10) || ''}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button data-testid="link-submit-btn" onClick={onSubmit}
                     disabled={submitting} style={{ ...btnPrimary, width: '100%' }}>
              {submitting ? 'Creando…' : 'Generar link + QR'}
            </button>
          </div>
        </div>
      )}

      {/* Recent QR preview */}
      {recentQR && (
        <div data-testid="link-recent-qr" style={{
          padding: 16, borderRadius: 14, marginBottom: 16,
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.30)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          fontFamily: 'DM Sans',
        }}>
          <img src={recentQR.qr_png_data_url} alt="QR"
                style={{ width: 110, height: 110, borderRadius: 10, background: '#fff' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--cream-3)', marginBottom: 4 }}>
              Link generado · slug <code>{recentQR.link_id}</code>
            </div>
            <input readOnly value={recentQR.booking_url}
                    onClick={(e) => e.target.select()}
                    style={{ ...inputStyle, fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button data-testid="qr-copy" style={btnGhost}
                       onClick={() => copyToClipboard(recentQR.booking_url)}>
                <Copy size={11} /> Copiar URL
              </button>
              <a data-testid="qr-download" href={recentQR.qr_png_data_url}
                 download={`qr-${recentQR.link_id}.png`} style={{ ...btnGhost, textDecoration: 'none' }}>
                <Download size={11} /> Descargar QR
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>
          Cargando links…
        </div>
      ) : links.length === 0 ? (
        <SmartEmptyState
          contextKey="suggestions.none"
          testId="links-empty"
          overrides={{
            title: 'Crea tu primer link',
            body: 'Compártelo en WhatsApp, ads o flyers QR. Cada click queda atribuido a ti.',
            ctas: [{ label: 'Nuevo link', key: 'open_form',
                      testId: 'links-empty-cta', primary: true }],
          }}
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div style={{
          borderRadius: 14, border: '1px solid var(--border, var(--border))',
          overflow: 'auto',
        }}>
          <table data-testid="links-table"
                  style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Slug', 'Proyecto', 'UTM', 'Clicks', 'Bookings', 'Conv %', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px', fontSize: 10.5, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--cream-3)', textAlign: h === '' ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.map(l => (
                <tr key={l.link_id} data-testid={`link-row-${l.link_id}`}
                    style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream)' }}>
                    <code>{l.link_id}</code>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream-2)' }}>
                    {l.project_id}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--cream-3)' }}>
                    {l.utm_source} · {l.utm_medium}
                    {l.utm_campaign ? ` · ${l.utm_campaign}` : ''}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream-2)' }}>
                    {l.total_clicks || 0}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--cream)' }}>
                    {l.total_bookings || 0}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13,
                                color: l.conversion_rate_pct > 5 ? '#22c55e' : 'var(--cream-2)' }}>
                    {l.conversion_rate_pct || 0}%
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                    <button data-testid={`link-copy-${l.link_id}`}
                             style={{ ...btnGhost, padding: '5px 10px', marginRight: 4 }}
                             onClick={() => { copyToClipboard(l.booking_url); setToast({ kind: 'success', text: 'URL copiada' }); }}>
                      <Copy size={10} />
                    </button>
                    {l.active && (
                      <button data-testid={`link-delete-${l.link_id}`}
                               style={{ ...btnGhost, padding: '5px 10px', color: '#fca5a5' }}
                               onClick={() => onDelete(l.link_id)}>
                        <Trash size={10} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div data-testid="links-toast" role="status"
              style={{
                position: 'fixed', bottom: 16, right: 16, zIndex: Z.DROPDOWN,
                padding: '8px 14px', borderRadius: 9999,
                background: toast.kind === 'success' ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                border: `1px solid ${toast.kind === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                color: 'var(--cream)', fontSize: 13, fontFamily: 'DM Sans',
              }} onAnimationEnd={() => setTimeout(() => setToast(null), 2500)}>
          {toast.text}
        </div>
      )}
    </AdvisorLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 10.5, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 4,
      }}>{label}</label>
      {children}
    </div>
  );
}
