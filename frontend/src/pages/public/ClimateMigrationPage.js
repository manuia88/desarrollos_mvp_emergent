// W5.9 · ClimateMigrationPage · /portal/climate-migration · T0 publico
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getMigrationHeatmap,
  getZoneMigrationDetail,
  getMigrationPatterns,
} from '../../api/climate_migration';
import MigrationHeatmap from '../../components/climate/MigrationHeatmap';
import MigrationPatternCard from '../../components/climate/MigrationPatternCard';
import ZoneMigrationSummary from '../../components/climate/ZoneMigrationSummary';
import Navbar from '../../components/landing/Navbar';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';

export default function ClimateMigrationPage() {
  const { t } = useTranslation('common');
  const [heatmap, setHeatmap] = useState(null);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [zoneDetail, setZoneDetail] = useState(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [patterns, setPatterns] = useState({ patterns: [], total: 0 });
  const [patternsLoading, setPatternsLoading] = useState(true);

  // Heatmap inicial + patterns
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [h, p] = await Promise.all([
        getMigrationHeatmap(),
        getMigrationPatterns(90, 20),
      ]);
      if (!mounted) return;
      setHeatmap(h);
      setHeatmapLoading(false);
      setPatterns(p || { patterns: [], total: 0 });
      setPatternsLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Zone detail al cambiar selectedSlug
  useEffect(() => {
    let mounted = true;
    if (!selectedSlug) {
      setZoneDetail(null);
      return undefined;
    }
    setZoneLoading(true);
    (async () => {
      const r = await getZoneMigrationDetail(selectedSlug);
      if (!mounted) return;
      setZoneDetail(r);
      setZoneLoading(false);
    })();
    return () => { mounted = false; };
  }, [selectedSlug]);

  const zones = Array.isArray(heatmap?.zones) ? heatmap.zones : [];
  const patternList = Array.isArray(patterns?.patterns) ? patterns.patterns.slice(0, 6) : [];

  return (
    <div data-testid="climate-migration-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <Navbar />
      <div style={{ height: 60 }} />
      <header style={{ padding: '64px 24px 16px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
          DesarrollosMX · Inteligencia Climatica
        </div>
        <h1 style={{
          margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.05, color: CREAM, letterSpacing: '-0.02em',
        }}>{t('climateMigration.page_title', 'Migracion por clima en CDMX')}</h1>
        <p style={{ margin: '10px auto 0', color: MUTED, fontSize: 15, maxWidth: 640, lineHeight: 1.55 }}>
          {t('climateMigration.page_subtitle', 'Detectamos a donde se mueve la gente y por que · cruce de riesgo climatico + behavioral + INEGI.')}
        </p>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 28 }}>
        {/* Heatmap */}
        <section data-testid="cm-heatmap-section">
          {heatmapLoading ? (
            <div style={{
              height: 480, borderRadius: 20, border: BORDER, background: CARD_BG,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED,
            }}>{t('climateMigration.heatmap_loading', 'Cargando mapa...')}</div>
          ) : zones.length === 0 ? (
            <div data-testid="cm-heatmap-empty" style={{
              padding: '48px 24px', borderRadius: 20, border: BORDER, background: CARD_BG,
              textAlign: 'center',
            }}>
              <div style={{ letterSpacing: '0.24em', fontSize: 11, color: INDIGO, textTransform: 'uppercase', marginBottom: 10 }}>
                {t('climateMigration.heatmap_empty_eyebrow', 'Sin datos')}
              </div>
              <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>
                {t('climateMigration.heatmap_empty', 'Datos acumulandose · vuelve en unos dias.')}
              </p>
            </div>
          ) : (
            <MigrationHeatmap
              zones={zones}
              height={480}
              onZoneClick={(slug) => setSelectedSlug((prev) => (prev === slug ? null : slug))}
            />
          )}
        </section>

        {/* Zone summary */}
        {selectedSlug && (
          <section data-testid="cm-zone-section">
            {zoneLoading ? (
              <div style={{
                padding: 26, borderRadius: 24, border: BORDER, background: CARD_BG, color: MUTED,
              }}>{t('climateMigration.heatmap_loading', 'Cargando...')}</div>
            ) : zoneDetail ? (
              <ZoneMigrationSummary zone={zoneDetail} />
            ) : (
              <div data-testid="cm-zone-empty" style={{
                padding: 26, borderRadius: 24, border: BORDER, background: CARD_BG, color: MUTED, textAlign: 'center',
              }}>{t('climateMigration.error_generic', 'No fue posible cargar el detalle.')}</div>
            )}
          </section>
        )}

        {/* Patterns grid */}
        <section data-testid="cm-patterns-section">
          <div style={{ marginBottom: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: CREAM }}>
            {t('climateMigration.patterns_title', 'Patrones detectados ultimos 90 dias')}
          </div>
          {patternsLoading ? (
            <div data-testid="cm-patterns-loading" style={{
              display: 'grid', gap: 16,
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{
                  height: 240, borderRadius: 24, border: BORDER,
                  background: 'linear-gradient(90deg, rgba(240,235,224,0.03), rgba(240,235,224,0.08), rgba(240,235,224,0.03))',
                  backgroundSize: '200% 100%', animation: 'cmShimmer 1.4s linear infinite',
                }} />
              ))}
              <style>{`@keyframes cmShimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }`}</style>
            </div>
          ) : patternList.length === 0 ? (
            <div data-testid="cm-patterns-empty" style={{
              padding: '36px 24px', borderRadius: 20, border: BORDER, background: CARD_BG,
              textAlign: 'center', color: MUTED,
            }}>{t('climateMigration.patterns_empty', 'Aun no hay patrones detectados.')}</div>
          ) : (
            <div data-testid="cm-patterns-grid" style={{
              display: 'grid', gap: 16,
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            }}>
              {patternList.map((p) => (
                <MigrationPatternCard key={p.pattern_id} pattern={p} />
              ))}
            </div>
          )}
        </section>

        <aside
          data-testid="cm-disclaimer"
          style={{
            padding: '14px 18px',
            borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)', borderRadius: 12,
            color: MUTED_2, fontSize: 12,
          }}
        >{t('climateMigration.disclaimer', 'Los patrones se basan en senales publicas y behavioral · no constituye recomendacion de inversion.')}</aside>
      </main>
    </div>
  );
}
