// W5.x F11 wire · AsesorMarketplace · vista marketplace para advisor con fit-score per-card.
// Standalone (NO modifica Marketplace.js · usa DevelopmentCardWithFit wrapper).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DevelopmentCardWithFit from '../../components/marketplace/DevelopmentCardWithFit';
import { fetchDevelopments } from '../../api/marketplace';
import { getKanban } from '../../api/leads';
import PortalLayout from '../../components/shared/PortalLayout';

const BG = 'var(--bg)';
const CREAM = 'var(--cream)';
const INDIGO = '#6366F1';
const MUTED = 'var(--cream-2)';
const CARD_BG = 'var(--surface)';
const BORDER = '1px solid var(--border)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const selectStyle = {
  width: '100%',
  maxWidth: 360,
  padding: '10px 14px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: CREAM,
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  outline: 'none',
  transition: `border-color 320ms ${EASE}`,
};

function AsesorMarketplaceBody({ user }) {
  const { t } = useTranslation('common');
  const [developments, setDevelopments] = useState([]);
  const [leads, setLeads] = useState([]);
  const [leadId, setLeadId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [devs, kanban] = await Promise.all([
          fetchDevelopments({ limit: 60 }).catch(() => ({ items: [] })),
          getKanban({}).catch(() => ({ columns: [] })),
        ]);
        if (!mounted) return;
        const items = Array.isArray(devs?.items) ? devs.items : Array.isArray(devs) ? devs : [];
        setDevelopments(items);
        // flatten leads from kanban columns
        const flat = [];
        const cols = Array.isArray(kanban?.columns) ? kanban.columns : [];
        cols.forEach((col) => {
          (col.leads || []).forEach((l) => flat.push({ id: l.id, name: l.full_name || l.name || l.id }));
        });
        setLeads(flat);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const userRole = user?.role;

  return (
    <div
      data-testid="asesor-marketplace"
      style={{
        minHeight: '100vh',
        background: BG,
        color: CREAM,
        fontFamily: 'DM Sans, sans-serif',
        padding: '40px 24px 96px',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <header style={{ marginBottom: 28 }}>
          <div style={{ letterSpacing: '0.22em', fontSize: 11, color: INDIGO, textTransform: 'uppercase', marginBottom: 8 }}>
            {t('asesorMarketplace.page_subtitle', 'Selecciona un lead para ver fit-score sobre cada propiedad.')}
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 42px)',
            letterSpacing: '-0.02em',
          }}>
            {t('asesorMarketplace.page_title', 'Marketplace · Vista Asesor')}
          </h1>
        </header>

        <section style={{
          ...{ background: CARD_BG, border: BORDER, borderRadius: 20, padding: 22, marginBottom: 28, backdropFilter: 'blur(24px)' },
        }}>
          <label style={{
            display: 'block', fontSize: 11, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: MUTED, marginBottom: 8, fontWeight: 500,
          }}>
            {t('asesorMarketplace.lead_selector_label', 'Lead activo')}
          </label>
          <select
            data-testid="asesor-marketplace-lead-selector"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            style={selectStyle}
          >
            <option value="" style={{ background: BG, color: CREAM }}>
              {leads.length === 0
                ? t('asesorMarketplace.lead_selector_empty', 'No tienes leads asignados')
                : t('asesorMarketplace.lead_selector_placeholder', 'Sin lead seleccionado')}
            </option>
            {leads.map((l) => (
              <option key={l.id} value={l.id} style={{ background: BG, color: CREAM }}>
                {l.name}
              </option>
            ))}
          </select>
          {!leadId && (
            <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 13 }}>
              {t('asesorMarketplace.fit_hint', 'Selecciona un lead para ver fit-score en cada card.')}
            </p>
          )}
        </section>

        {loading && (
          <p style={{ color: MUTED, fontSize: 14 }}>{t('asesorMarketplace.loading', 'Cargando marketplace...')}</p>
        )}
        {error && (
          <p style={{ color: '#FCA5A5', fontSize: 14 }}>{t('asesorMarketplace.error', 'No fue posible cargar el marketplace.')} · {error}</p>
        )}

        {!loading && !error && (
          <>
            <div style={{ color: MUTED, fontSize: 13, marginBottom: 14 }}>
              {t('asesorMarketplace.results_count', '{{count}} desarrollos', { count: developments.length })}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 18,
            }}>
              {developments.map((dev, i) => (
                <DevelopmentCardWithFit
                  key={dev.id || i}
                  dev={dev}
                  index={i}
                  leadId={leadId || null}
                  userRole={userRole}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function AsesorMarketplace(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <AsesorMarketplaceBody {...props} />
    </PortalLayout>
  );
}
