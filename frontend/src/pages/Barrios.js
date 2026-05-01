// /barrios — stub page: "Los 16 barrios de CDMX leídos por IE Score"
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import CtaFooter from '../components/landing/CtaFooter';
import ZoneScoreStrip from '../components/landing/ZoneScoreStrip';
import ScoreExplainModal from '../components/landing/ScoreExplainModal';
import { MapPin, Leaf, Route, Shield, Store, ArrowRight } from '../components/icons';
import { useAuth } from '../App';

const FACTORS = [
  { Icon: Leaf,   k: 'vida',      t: 'Vida',      d: 'Áreas verdes, ruido, densidad de servicios y ritmo cotidiano.' },
  { Icon: Route,  k: 'movilidad', t: 'Movilidad', d: 'Tráfico observado, acceso a Metro/Metrobús, cobertura de ciclovía.' },
  { Icon: Shield, k: 'seguridad', t: 'Seguridad', d: 'Delito georreferenciado, iluminación pública, riesgo sísmico y encharcamientos.' },
  { Icon: Store,  k: 'comercio',  t: 'Comercio',  d: 'Densidad comercial, horarios, gastronomía y retail ancla.' },
];

const BARRIOS = [
  'Polanco', 'Condesa', 'Roma Norte', 'Roma Sur', 'Juárez', 'Del Valle',
  'Nápoles', 'Escandón', 'San Miguel Chapultepec', 'Coyoacán Centro',
  'San Ángel', 'Santa María la Ribera', 'Anzures', 'Lomas de Chapultepec',
  'Narvarte', 'Doctores',
];

export default function Barrios() {
  const navigate = useNavigate();
  const { user, logout, openAuth } = useAuth();
  const [explain, setExplain] = useState(null); // { zoneId, code } | null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar onLogin={openAuth} user={user} onLogout={logout} />
      <main style={{ padding: '110px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>CDMX · 16 barrios</div>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800,
          fontSize: 'clamp(36px, 6vw, 60px)',
          color: 'var(--cream)',
          letterSpacing: '-0.028em', lineHeight: 1.02,
          margin: '0 0 18px', maxWidth: 900,
        }}>
          Los 16 barrios de CDMX, <span style={{
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
          {BARRIOS.map(b => (
            <div key={b} data-testid={`barrio-chip-${b.replace(/\s+/g, '-').toLowerCase()}`} style={{
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
            }}>
              {b}
            </div>
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
    </div>
  );
}
