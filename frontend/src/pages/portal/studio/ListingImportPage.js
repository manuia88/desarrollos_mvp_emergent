// W5.22 Z.1 Sub-B — Listing Import page · /portal/studio/import
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PortalLayout from '../../../components/shared/PortalLayout';
import { SmartEmptyState } from '../../../components/shared/SmartEmptyState';
import * as api from '../../../api/studio';
import { Globe, Link as LinkIcon, Loader2, Check, AlertTriangle, Trash2 } from 'lucide-react';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const PORTAL_LABELS = {
  easybroker: 'EasyBroker',
  propiedades_com: 'Propiedades.com',
  casas_terrenos: 'Casas y Terrenos',
};

export default function ListingImportPage({ user, onLogout }) {
  const { t } = useTranslation('common');
  const [url, setUrl] = useState('');
  const [portal, setPortal] = useState('easybroker');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState({ items: [], total: 0 });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [toast, setToast] = useState('');

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const r = await api.listImports(20, 0);
      setHistory(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const tm = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(tm);
  }, [toast]);

  const submit = async () => {
    if (!url) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await api.importListing({ source_url: url });
      setResult(r.import);
      await loadHistory();
      setToast(t('studio.listing.toast_imported'));
    } catch (e) {
      setError(e.message);
      if (e.status === 429) {
        setError(t('studio.listing.rate_limit_msg'));
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t('studio.listing.confirm_delete'))) return;
    try {
      await api.deleteImport(id);
      await loadHistory();
      setToast(t('studio.listing.toast_deleted'));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div data-testid="listing-import-page" style={{ padding: '22px 28px 80px', maxWidth: 1080 }}>
        <header style={{ marginBottom: 24 }}>
          <div className="eyebrow">DMX STUDIO Z.1</div>
          <h1 style={hStyle()}>{t('studio.listing.title')}</h1>
          <p style={subStyle()}>{t('studio.listing.subtitle')}</p>
        </header>

        {/* Import form */}
        <div style={{
          padding: '18px 20px', marginBottom: 22,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 22, backdropFilter: 'blur(24px)',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              data-testid="portal-select"
              value={portal}
              onChange={(e) => setPortal(e.target.value)}
              style={{
                padding: '10px 12px',
                background: 'var(--surface)', color: 'var(--cream)',
                border: '1px solid var(--border)', borderRadius: 9999,
                fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer',
              }}>
              <option value="easybroker">EasyBroker</option>
              <option value="propiedades_com">Propiedades.com</option>
              <option value="casas_terrenos">Casas y Terrenos</option>
            </select>
            <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 280 }}>
              <LinkIcon size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--cream-3)' }} />
              <input
                data-testid="listing-url-input"
                type="url"
                placeholder={t('studio.listing.url_placeholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px 10px 34px',
                  background: 'var(--surface)', color: 'var(--cream)',
                  border: '1px solid var(--border)', borderRadius: 9999,
                  fontFamily: 'DM Sans', fontSize: 13, outline: 'none',
                }} />
            </div>
            <button
              data-testid="import-submit"
              onClick={submit}
              disabled={!url || busy}
              style={{
                padding: '10px 20px',
                background: (!url || busy) ? 'rgba(99,102,241,0.20)' : GRADIENT,
                color: '#FFF', border: 'none', borderRadius: 9999,
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                cursor: (!url || busy) ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: (!url || busy) ? 0.7 : 1,
              }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
              {busy ? t('studio.listing.importing') : t('studio.listing.import_cta')}
            </button>
          </div>
          {error && (
            <div data-testid="import-error" style={{
              marginTop: 12, padding: '10px 12px',
              background: 'rgba(239,68,68,0.10)', color: '#EF4444',
              border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14,
              fontSize: 13,
            }}>
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
              {error}
            </div>
          )}
        </div>

        {/* Result preview */}
        {result && (
          <div data-testid="import-result" style={{
            padding: '18px 20px', marginBottom: 22,
            background: 'var(--surface)',
            border: '1px solid rgba(99,102,241,0.30)',
            borderRadius: 22, backdropFilter: 'blur(24px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>
                {result.status === 'parsed' ? t('studio.listing.parsed_title') : t('studio.listing.failed_title')}
              </h3>
              <StatusBadge status={result.status} t={t} />
            </div>
            {result.status === 'parsed' && result.parsed_data && (
              <ParsedFields data={result.parsed_data} t={t} />
            )}
            {result.status === 'failed' && (
              <div style={{ color: 'var(--cream-2)', fontSize: 13 }}>
                {result.error_msg || t('studio.listing.unknown_error')}
              </div>
            )}
          </div>
        )}

        {/* History */}
        <section>
          <h2 style={{ ...hStyle(), fontSize: 22, marginBottom: 12 }}>
            {t('studio.listing.history_title')}
          </h2>
          {historyLoading ? (
            <div style={{ padding: 24, color: 'var(--cream-3)', textAlign: 'center' }}>
              {t('studio.listing.loading_history')}
            </div>
          ) : history.total === 0 ? (
            <SmartEmptyState
              contextKey="studio.listing.empty"
              overrides={{
                title: t('studio.listing.empty_title'),
                body: t('studio.listing.empty_body'),
              }}
            />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              {history.items.map((it) => (
                <li key={it.id} data-testid={`history-row-${it.id}`} style={historyRowStyle()}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 13 }}>
                      {it.parsed_data?.title || it.source_url.slice(0, 80)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
                      {PORTAL_LABELS[it.source_portal] || it.source_portal} · {new Date(it.created_at).toLocaleDateString('es-MX')}
                    </div>
                  </div>
                  <StatusBadge status={it.status} t={t} />
                  <button onClick={() => remove(it.id)} style={iconBtn()} data-testid={`history-delete-${it.id}`}>
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {toast && (
          <div data-testid="listing-toast" role="status" style={toastStyle()}>{toast}</div>
        )}
      </div>
    </PortalLayout>
  );
}

function StatusBadge({ status, t }) {
  const map = {
    parsed:  { bg: 'rgba(34,197,94,0.15)', color: '#22C55E', Icon: Check, label: t('studio.listing.status_parsed') },
    pending: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B', Icon: Loader2, label: t('studio.listing.status_pending') },
    failed:  { bg: 'rgba(239,68,68,0.15)', color: '#EF4444', Icon: AlertTriangle, label: t('studio.listing.status_failed') },
  };
  const s = map[status] || map.failed;
  return (
    <span data-testid={`status-${status}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 9999,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      <s.Icon size={11} /> {s.label}
    </span>
  );
}

function ParsedFields({ data, t }) {
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      <Field label={t('studio.listing.field_title')} value={data.title} />
      <Field label={t('studio.listing.field_price')} value={data.price ? `$${Number(data.price).toLocaleString('es-MX')}` : '—'} />
      <Field label={t('studio.listing.field_area')} value={data.area_m2 ? `${data.area_m2} m²` : '—'} />
      <Field label={t('studio.listing.field_rooms')} value={data.rooms || '—'} />
      <Field label={t('studio.listing.field_baths')} value={data.bathrooms || '—'} />
      <Field label={t('studio.listing.field_address')} value={data.address || '—'} />
      <Field label={t('studio.listing.field_photos')} value={(data.photos || []).length} />
      <Field label={t('studio.listing.field_features')} value={(data.features || []).length} />
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--cream)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

const hStyle = () => ({
  fontFamily: 'Outfit', fontWeight: 800, fontSize: 36,
  letterSpacing: '-0.028em', margin: '6px 0 6px', color: 'var(--cream)',
});
const subStyle = () => ({ fontSize: 14, color: 'var(--cream-2)', maxWidth: 720, margin: 0 });
const historyRowStyle = () => ({
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 14px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14, backdropFilter: 'blur(24px)',
});
const iconBtn = () => ({
  width: 30, height: 30,
  background: 'transparent', color: '#EF4444',
  border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9999,
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});
const toastStyle = () => ({
  position: 'fixed', bottom: 24, right: 24,
  padding: '10px 16px',
  background: 'var(--surface)', color: 'var(--cream)',
  border: '1px solid rgba(99,102,241,0.30)', borderRadius: 9999,
  fontFamily: 'DM Sans', fontSize: 13, zIndex: 1500,
});
