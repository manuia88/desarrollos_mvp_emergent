// W5.9 · SuperadminClimateMigration · debug · todos patterns + stats
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getMigrationPatterns, getMigrationHeatmap } from '../../api/climate_migration';

const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const CONFIDENCE_FILTERS = [
  { value: 'all', key: 'climateMigration.tier_all' },
  { value: 'alta', key: 'climateMigration.pattern_confidence_alta' },
  { value: 'media', key: 'climateMigration.pattern_confidence_media' },
  { value: 'baja', key: 'climateMigration.pattern_confidence_baja' },
];

function chipStyle(active) {
  return {
    padding: '6px 12px', borderRadius: 9999,
    fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer',
    border: active ? '1px solid rgba(99,102,241,0.55)' : '1px solid rgba(240,235,224,0.10)',
    background: active ? 'rgba(99,102,241,0.14)' : 'rgba(240,235,224,0.04)',
    color: active ? '#C7D2FE' : 'rgba(240,235,224,0.72)',
    transition: `transform 280ms ${EASE}`,
  };
}

function confColor(conf) {
  switch (String(conf || '').toLowerCase()) {
    case 'alta': return { bg: GRAD, color: '#FFF' };
    case 'media': return { bg: 'rgba(99,102,241,0.14)', color: '#C7D2FE' };
    default: return { bg: 'rgba(240,235,224,0.04)', color: MUTED };
  }
}

function topCounter(arr, key) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const counts = arr.reduce((acc, it) => {
    const k = it?.[key] || '—';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function StatCard({ label, value }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14,
      background: CARD_BG, border: BORDER,
    }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED_2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: CREAM, letterSpacing: '-0.02em' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

export default function SuperadminClimateMigration({ embedded }) {
  const { t } = useTranslation('common');
  const [confFilter, setConfFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState(null);
  const [patterns, setPatterns] = useState({ patterns: [], total: 0 });
  const [heatmap, setHeatmap] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const [p, h] = await Promise.all([
        getMigrationPatterns(90, 50),
        getMigrationHeatmap(),
      ]);
      if (!mounted) return;
      setPatterns(p || { patterns: [], total: 0 });
      setHeatmap(h);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const allPatterns = useMemo(
    () => (Array.isArray(patterns?.patterns) ? patterns.patterns : []),
    [patterns],
  );

  const filtered = useMemo(() => {
    return allPatterns.filter((p) => {
      if (confFilter !== 'all' && String(p.confidence || '').toLowerCase() !== confFilter) return false;
      if (driverFilter && p.climate_driver !== driverFilter) return false;
      return true;
    });
  }, [allPatterns, confFilter, driverFilter]);

  const uniqueDrivers = useMemo(() => {
    const s = new Set();
    allPatterns.forEach((p) => { if (p.climate_driver) s.add(p.climate_driver); });
    return Array.from(s).slice(0, 10);
  }, [allPatterns]);

  const stats = useMemo(() => ({
    total: allPatterns.length,
    top_driver: topCounter(allPatterns, 'climate_driver'),
    top_origin: topCounter(allPatterns, 'origin_zone'),
    top_destination: topCounter(allPatterns, 'destination_zone'),
    zones_in_heatmap: Array.isArray(heatmap?.zones) ? heatmap.zones.length : 0,
  }), [allPatterns, heatmap]);

  return (
    <SuperadminLayout bare={embedded}>
      <div data-testid="superadmin-climate-migration-page" style={{ color: CREAM, fontFamily: 'DM Sans, sans-serif', padding: '24px 0' }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{
            margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', letterSpacing: '-0.02em', color: CREAM,
          }}>{t('climateMigration.superadmin_title', 'Climate Migration · Debug')}</h1>
          <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 13 }}>
            {t('climateMigration.superadmin_subtitle', 'Inspecciona todos los patrones detectados, filtros y estadisticas.')}
          </p>
        </header>

        {/* Stats */}
        <section data-testid="cm-superadmin-stats" style={{
          display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 18,
        }}>
          <StatCard label={t('climateMigration.stat_total_patterns', 'Total patterns')} value={stats.total} />
          <StatCard label={t('climateMigration.stat_top_driver', 'Top driver')} value={stats.top_driver} />
          <StatCard label={t('climateMigration.stat_top_origin', 'Top origen')} value={stats.top_origin} />
          <StatCard label={t('climateMigration.stat_top_destination', 'Top destino')} value={stats.top_destination} />
          <StatCard label={t('climateMigration.stat_zones_heatmap', 'Zonas en heatmap')} value={stats.zones_in_heatmap} />
        </section>

        {/* Filters */}
        <section data-testid="cm-superadmin-filters" style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED_2, marginBottom: 6 }}>
              {t('climateMigration.superadmin_filter_confidence', 'Confidence')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CONFIDENCE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  data-testid={`cm-superadmin-filter-conf-${f.value}`}
                  onClick={() => setConfFilter(f.value)}
                  style={chipStyle(confFilter === f.value)}
                >{t(f.key, f.value)}</button>
              ))}
            </div>
          </div>
          {uniqueDrivers.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED_2, marginBottom: 6 }}>
                {t('climateMigration.superadmin_filter_driver', 'Driver climatico')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  data-testid="cm-superadmin-filter-driver-all"
                  onClick={() => setDriverFilter(null)}
                  style={chipStyle(driverFilter === null)}
                >{t('climateMigration.tier_all', 'Todos')}</button>
                {uniqueDrivers.map((d) => (
                  <button
                    key={d}
                    type="button"
                    data-testid={`cm-superadmin-filter-driver-${d}`}
                    onClick={() => setDriverFilter(d)}
                    style={chipStyle(driverFilter === d)}
                  >{d}</button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Table */}
        <section
          data-testid="cm-superadmin-table"
          style={{ background: CARD_BG, border: BORDER, borderRadius: 18, overflow: 'hidden' }}
        >
          <div role="row" style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr 1fr 120px 140px 110px 140px',
            gap: 10, padding: '12px 18px',
            background: 'rgba(240,235,224,0.04)',
            borderBottom: BORDER,
            color: MUTED_2,
            fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
          }}>
            <span>{t('climateMigration.col_pattern_id', 'Pattern ID')}</span>
            <span>{t('climateMigration.col_origin', 'Origen')}</span>
            <span>{t('climateMigration.col_destination', 'Destino')}</span>
            <span>{t('climateMigration.col_magnitude', 'Magnitud')}</span>
            <span>{t('climateMigration.col_driver', 'Driver')}</span>
            <span>{t('climateMigration.col_confidence', 'Confianza')}</span>
            <span>{t('climateMigration.col_detected', 'Detectado')}</span>
          </div>

          {loading && (
            <div data-testid="cm-superadmin-loading" style={{ padding: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  height: 44, borderRadius: 10, margin: '6px 0',
                  background: 'linear-gradient(90deg, rgba(240,235,224,0.03), rgba(240,235,224,0.08), rgba(240,235,224,0.03))',
                  backgroundSize: '200% 100%', animation: 'cmAdminShimmer 1.4s linear infinite',
                }} />
              ))}
              <style>{`@keyframes cmAdminShimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }`}</style>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div data-testid="cm-superadmin-empty" style={{ padding: '36px 24px', textAlign: 'center', color: MUTED }}>
              {t('climateMigration.patterns_empty', 'Aun no hay patrones detectados.')}
            </div>
          )}

          {!loading && filtered.map((p) => {
            const conf = String(p.confidence || 'media').toLowerCase();
            const cChip = confColor(conf);
            const magnitude = Math.max(0, Math.min(100, Math.round(Number(p.magnitude) || 0)));
            return (
              <div
                key={p.pattern_id}
                role="row"
                data-testid={`cm-superadmin-row-${p.pattern_id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 1fr 120px 140px 110px 140px',
                  gap: 10, padding: '12px 18px',
                  alignItems: 'center',
                  borderBottom: BORDER,
                }}
              >
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: MUTED }}>{String(p.pattern_id || '—').slice(0, 12)}</span>
                <span style={{ fontSize: 13, color: CREAM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.origin_zone || '—'}</span>
                <span style={{ fontSize: 13, color: CREAM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.destination_zone || '—'}</span>
                <span>
                  <span style={{ display: 'inline-block', minWidth: 60, fontVariantNumeric: 'tabular-nums', color: CREAM, fontWeight: 700 }}>{magnitude}/100</span>
                </span>
                <span style={{ fontSize: 12, color: MUTED }}>{p.climate_driver || '—'}</span>
                <span>
                  <span style={{
                    padding: '3px 9px', borderRadius: 9999,
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    background: cChip.bg, color: cChip.color,
                  }}>{conf}</span>
                </span>
                <span style={{ fontSize: 11.5, color: MUTED_2 }}>{fmtDate(p.detected_at)}</span>
              </div>
            );
          })}
        </section>
      </div>
    </SuperadminLayout>
  );
}
