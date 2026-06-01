/**
 * Hub Studio Marketing · /asesor/studio(/:area)
 * B7 Fase 4 · de 8 ítems dispersos en el menú → 1 entrada con 2 áreas claras:
 *   · Crear            — Director IA · Video · Carruseles · Auto-Content · Landings
 *   · Marca y Biblioteca — Brand Kit · Assets · Importar Listing
 *
 * Cada herramienta es un tool completo y pesado → el hub es un launcher (tarjetas),
 * no pestañas embebidas (mejor UX que amontonar 8 tools). Las rutas de cada tool no
 * cambian (no orphans). Director IA (StudioDashboard) vive ahora en /asesor/studio/director.
 */
import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { Sparkles, Video, Image, Megaphone, Layout, Package, FolderOpen, FolderUp } from 'lucide-react';

const AREAS = [
  {
    key: 'crear', label: 'Crear',
    cards: [
      { to: '/asesor/studio/director',         Icon: Sparkles,  title: 'Director IA',   desc: 'La IA arma tu contenido por ti — punto de partida inteligente.' },
      { to: '/portal/asesor/video-standalone', Icon: Video,     title: 'Video',         desc: 'Videos profesionales con IA · cualquier proyecto, cualquier momento.' },
      { to: '/portal/studio/carruseles',       Icon: Image,     title: 'Carruseles',    desc: 'Carruseles multi-página por persona compradora · A/B testing.' },
      { to: '/portal/studio/auto-content',     Icon: Megaphone, title: 'Auto-Content',  desc: 'Sugerencias diarias automáticas · aprueba y se genera el carrusel.' },
      { to: '/portal/studio/landings',         Icon: Layout,    title: 'Landing Pages', desc: 'Landings con 10 templates premium · A/B testing · export PDF.' },
    ],
  },
  {
    key: 'marca', label: 'Marca y Biblioteca',
    cards: [
      { to: '/portal/studio/brand-kit', Icon: Package,    title: 'Brand Kit',            desc: 'Colores, logo, tipografías, disclaimer y CTAs · una variante activa.' },
      { to: '/portal/studio/assets',    Icon: FolderOpen, title: 'Biblioteca de Assets', desc: 'Fotos, videos, PDFs y scans 3DGS · drag-and-drop hasta 200MB.' },
      { to: '/portal/studio/import',    Icon: FolderUp,   title: 'Importar Listing',     desc: 'Importa propiedades desde EasyBroker, Propiedades.com o Casas y Terrenos.' },
    ],
  },
];

export default function StudioHubPage({ user, onLogout }) {
  const { area: areaParam } = useParams();
  const nav = useNavigate();
  const [area, setArea] = useState(AREAS.some(a => a.key === areaParam) ? areaParam : 'crear');
  const go = (k) => { setArea(k); nav(`/asesor/studio/${k}`, { replace: true }); };
  const cur = AREAS.find(a => a.key === area) || AREAS[0];

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 6 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>DMX STUDIO · MARKETING</div>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--cream)', letterSpacing: '-0.02em', margin: '2px 0 4px' }}>
          Studio Marketing
        </h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, color: 'var(--cream-2)', margin: '0 0 18px' }}>
          Todo tu contenido con IA en un solo lugar. Elige qué quieres hacer.
        </p>
      </div>

      <div role="tablist" aria-label="Studio"
        style={{ display: 'inline-flex', gap: 6, padding: 5, marginBottom: 22, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 1px 2px rgba(20,25,45,0.05), 0 6px 16px rgba(20,25,45,0.06)' }}>
        {AREAS.map(a => {
          const on = a.key === area;
          return (
            <button key={a.key} role="tab" aria-selected={on} data-testid={`studio-area-${a.key}`} onClick={() => go(a.key)}
              style={{
                padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 700,
                background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'transparent',
                color: on ? '#fff' : 'var(--cream-2)', transition: 'all 150ms ease',
              }}>
              {a.label}
            </button>
          );
        })}
      </div>

      <div data-testid={`studio-cards-${area}`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {cur.cards.map(c => (
          <Link key={c.to} to={c.to} data-testid={`studio-card-${c.title}`}
            style={{
              display: 'block', textDecoration: 'none', padding: 20, borderRadius: 16,
              background: 'var(--surface)', border: '1px solid var(--border)',
              boxShadow: '0 1px 2px rgba(20,25,45,0.05), 0 6px 16px rgba(20,25,45,0.06)',
              transition: 'transform 150ms ease, border-color 150ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--theme)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--theme-rgb),0.12)', marginBottom: 12 }}>
              <c.Icon size={20} color="var(--theme-2)" />
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 5 }}>{c.title}</div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>{c.desc}</div>
          </Link>
        ))}
      </div>
    </AdvisorLayout>
  );
}
