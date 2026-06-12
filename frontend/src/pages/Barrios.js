// /barrios — "Las colonias de CDMX leídas por IE Score". Lista DINÁMICA del catálogo real.
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import CtaFooter from '../components/landing/CtaFooter';
import ZoneScoreStrip from '../components/landing/ZoneScoreStrip';
import NarrativeBlock from '../components/landing/NarrativeBlock';
import ScoreExplainModal from '../components/landing/ScoreExplainModal';
import { MapPin, Leaf, Route, Shield, Store, ArrowRight } from '../components/icons';
import AtlaxBubble from '../components/landing/AtlaxBubble';
import { useAuth } from '../App';

const FACTORS = [
  { Icon: Leaf,   k: 'vida',      t: 'Vida',      d: 'Áreas verdes, ruido, densidad de servicios y ritmo cotidiano.' },
  { Icon: Route,  k: 'movilidad', t: 'Movilidad', d: 'Tráfico observado, acceso a Metro/Metrobús, cobertura de ciclovía.' },
  { Icon: Shield, k: 'seguridad', t: 'Seguridad', d: 'Delito georreferenciado, iluminación pública, riesgo sísmico y encharcamientos.' },
  { Icon: Store,  k: 'comercio',  t: 'Comercio',  d: 'Densidad comercial, horarios, gastronomía y retail ancla.' },
];

// B4 · cada colonia enlaza a su /zona/:slug. La lista REAL se lee en vivo del catálogo
// (db.colonias → GET /api/colonias/catalog), que crece con el sync SIG/zonificación del
// módulo dev/superadmin → la página AUTO-CRECE. SEED_BARRIOS (las 16 del seed) es solo el
// FALLBACK para no quedar vacíos hoy (DB de negocio vacía). slug canónico = colonia_slug
// (hyphenado, sin acentos: 'San Ángel'→'san-angel', 'Lomas de Chapultepec'→'lomas-chapultepec').
const SEED_BARRIOS = [
  { name: 'Polanco', slug: 'polanco' },
  { name: 'Condesa', slug: 'condesa' },
  { name: 'Roma Norte', slug: 'roma-norte' },
  { name: 'Roma Sur', slug: 'roma-sur' },
  { name: 'Juárez', slug: 'juarez' },
  { name: 'Del Valle', slug: 'del-valle-centro' },
  { name: 'Nápoles', slug: 'napoles' },
  { name: 'Escandón', slug: 'escandon' },
  { name: 'San Miguel Chapultepec', slug: 'san-miguel-chapultepec' },
  { name: 'Coyoacán Centro', slug: 'coyoacan-centro' },
  { name: 'San Ángel', slug: 'san-angel' },
  { name: 'Santa María la Ribera', slug: 'santa-maria-la-ribera' },
  { name: 'Anzures', slug: 'anzures' },
  { name: 'Lomas de Chapultepec', slug: 'lomas-chapultepec' },
  { name: 'Narvarte', slug: 'narvarte' },
  { name: 'Doctores', slug: 'doctores' },
];

const API = process.env.REACT_APP_BACKEND_URL;

export default function Barrios() {
  const navigate = useNavigate();
  const { user, logout, openAuth } = useAuth();
  const [explain, setExplain] = useState(null); // { zoneId, code } | null
  // Lista en vivo del catálogo real (auto-crece con el sync de dev/superadmin); seed = fallback.
  const [barrios, setBarrios] = useState(SEED_BARRIOS);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/colonias/catalog`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d?.colonias || [])
          .filter((c) => c?.id && c?.name)
          .map((c) => ({ name: c.name, slug: c.id }));
        if (alive && list.length) setBarrios(list); // vacío → conserva el seed (DB vacía hoy)
      })
      .catch(() => {}); // fallback al seed
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar onLogin={openAuth} user={user} onLogout={logout} />
      <main style={{ padding: '110px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>CDMX · {barrios.length} colonias</div>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800,
          fontSize: 'clamp(36px, 6vw, 60px)',
          color: 'var(--cream)',
          letterSpacing: '-0.028em', lineHeight: 1.02,
          margin: '0 0 18px', maxWidth: 900,
        }}>
          Las colonias de CDMX, <span style={{
            background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>leídos por IE Score.</span>
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 17, color: 'var(--cream-2)',
          lineHeight: 1.65, maxWidth: 760, margin: '0 0 36px',
        }}>
          Cada barrio se lee a través de cuatro ejes verificables — Vida, Movilidad,
          Seguridad y Comercio — que alimentan el puntaje IE que verás en cada ficha.
          Abre el mapa para explorar todos los barrios geolocalizados con su lectura completa.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 48 }}>
          <button
            data-testid="barrios-cta-mapa"
            onClick={() => navigate('/mapa')}
            className="btn btn-primary"
          >
            <MapPin size={14} />
            Abrir el mapa
          </button>
          <button
            data-testid="barrios-cta-marketplace"
            onClick={() => navigate('/marketplace')}
            className="btn btn-glass"
          >
            Ver desarrollos por barrio <ArrowRight size={12} />
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 14, marginBottom: 56,
        }}>
          {FACTORS.map(({ Icon, k, t, d }) => (
            <div key={k} data-testid={`barrios-factor-${k}`} style={{
              padding: 20,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 16,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 12,
              }}>
                <Icon size={18} color="var(--indigo-3)" />
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 6 }}>
                {t}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.55 }}>
                {d}
              </div>
            </div>
          ))}
        </div>

        <div className="eyebrow" style={{ marginBottom: 14 }}>COBERTURA ACTUAL</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 8,
        }}>
          {barrios.map(b => (
            <Link
              key={b.slug}
              to={`/zona/${b.slug}`}
              data-testid={`barrio-chip-${b.slug}`}
              className="dmx-card"
              aria-label={`Ver el barrio ${b.name} y su lectura IE Score`}
              style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 10,
                fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
                textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              {b.name}
              <ArrowRight size={12} color="var(--cream-3)" />
            </Link>
          ))}
        </div>

        {/* LIVE scores para las 3 colonias con cobertura inicial */}
        <div style={{ marginTop: 48 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>LIVE · SCORES REALES</div>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 24,
            color: 'var(--cream)', letterSpacing: '-0.02em',
            margin: '0 0 8px',
          }}>
            Tres colonias con lectura IE activa.
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.55, marginBottom: 20, maxWidth: 640 }}>
            El motor está midiendo estas colonias en vivo. Haz click en cualquier score para ver el breakdown de la fórmula.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {['roma_norte', 'polanco', 'condesa'].map(z => (
              <div key={z} data-testid={`barrio-live-${z}`} style={{
                padding: 18,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 16,
              }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 2, textTransform: 'capitalize' }}>
                  {z.replace('_', ' ')}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <NarrativeBlock scope="colonia" entityId={z} compact showFooter={false} />
                </div>
                <ZoneScoreStrip
                  zoneId={z}
                  limit={6}
                  onScoreClick={s => setExplain({ zoneId: z, code: s.code })}
                  title=""
                />
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaFooter />

      <ScoreExplainModal
        open={!!explain}
        zoneId={explain?.zoneId}
        code={explain?.code}
        onClose={() => setExplain(null)}
      />
      <AtlaxBubble />
    </div>
  );
}
