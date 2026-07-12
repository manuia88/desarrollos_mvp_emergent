/**
 * W5.12 Parte 3 Sub-C — SimilarProjectsSection
 *
 * Render 3-5 cards "Tambien te puede interesar" tras una respuesta del
 * Asistente. Solo se muestra si hay un seed_project_id O seed_zone_slug.
 * Si KG no devuelve resultados (count=0) o KG fallback_required → no renderiza.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

function SkeletonCard() {
  return (
    <div style={{
      width: 220, flexShrink: 0, height: 220, borderRadius: 16,
      background: '#F6F7FA', border: '1px solid #ECECEC',
      animation: 'kgPulse 1.4s ease-in-out infinite',
    }} />
  );
}

function ProjectCard({ row }) {
  const slug = row.slug || row.project_id;
  const href = `/detalle-proyecto/${encodeURIComponent(slug)}`;
  const img = row.cover_image_url || row.main_image_url || '';
  const priceMin = row.precio_min || row.price_min;
  const priceLabel = priceMin
    ? `Desde $${Math.round(priceMin / 1000).toLocaleString('es-MX')}k MXN`
    : '—';
  return (
    <a
      data-testid={`similar-card-${slug}`}
      href={href}
      style={{
        display: 'flex', flexDirection: 'column', width: 220, flexShrink: 0,
        borderRadius: 16, overflow: 'hidden', textDecoration: 'none',
        background: '#FFFFFF',
        border: '1px solid #ECECEC',
        transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.borderColor = 'rgba(109,74,255,0.42)';
        e.currentTarget.style.boxShadow = '0 10px 30px rgba(16,24,40,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = '#ECECEC';
        e.currentTarget.style.boxShadow = 'none';
      }}>
      <div style={{
        width: '100%', height: 120,
        background: img
          ? `linear-gradient(rgba(0,0,0,0.10), rgba(0,0,0,0.10)), url(${img}) center/cover`
          : 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.18))',
      }} />
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: '#1E2230',
          lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{row.name || slug}</div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#9AA0AE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {row.zone_slug || '—'}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: '#6D4AFF' }}>{priceLabel}</div>
        {row.score != null && (
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#1FA06A' }}>
            score {Number(row.score).toFixed(1)}
          </div>
        )}
      </div>
    </a>
  );
}

export default function SimilarProjectsSection({ seedProjectId, seedZoneSlug }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!seedProjectId && !seedZoneSlug) { setRows([]); setHidden(true); return undefined; }
    let cancel = false;
    (async () => {
      setLoading(true); setHidden(false);
      try {
        // Endpoint: buyer-coach similar-projects (reuse Sub-D backend).
        const seed = seedProjectId || seedZoneSlug;
        const r = await fetch(`${API}/api/buyer-coach/similar-projects?project_id=${encodeURIComponent(seed)}&limit=5`,
          { credentials: 'include' });
        const body = await r.json().catch(() => ({}));
        if (cancel) return;
        const items = body?.rows || [];
        // Hide if cero resultados o KG unavailable AND legacy tambien vacio
        if (!items.length) { setRows([]); setHidden(true); }
        else { setRows(items.slice(0, 5)); setHidden(false); }
      } catch {
        if (!cancel) { setRows([]); setHidden(true); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [seedProjectId, seedZoneSlug]);

  if (hidden) return null;

  return (
    <div data-testid="similar-projects-section" style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #ECECEC' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Sparkles size={14} color="#6D4AFF" />
        <span style={{
          fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em',
          color: '#9AA0AE', textTransform: 'uppercase',
        }}>
          {t('knowledge_graph.consumers.also_might_interest', 'Tambien te puede interesar')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {loading
          ? [0, 1, 2, 3].map(i => <SkeletonCard key={i} />)
          : rows.map(r => <ProjectCard key={r.project_id || r.slug} row={r} />)}
        {!loading && rows.length > 0 && (
          <a href="/marketplace" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 18px', flexShrink: 0,
            fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: '#6D4AFF',
            textDecoration: 'none',
          }}>
            {t('knowledge_graph.consumers.view_all', 'Ver mas')} <ArrowRight size={12} />
          </a>
        )}
      </div>
      <style>{`@keyframes kgPulse { 0%, 100% { opacity: 0.6 } 50% { opacity: 1 } }`}</style>
    </div>
  );
}
