// /inteligencia — stub educativo: "Los 97 indicadores detrás de cada precio"
import React, { useState } from 'react';
import Navbar from '../components/landing/Navbar';
import CtaFooter from '../components/landing/CtaFooter';
import ZoneScoreStrip from '../components/landing/ZoneScoreStrip';
import ScoreExplainModal from '../components/landing/ScoreExplainModal';
import { Sparkle, Database, BarChart, Route, Shield, Leaf, Store, ArrowRight } from '../components/icons';
import { useAuth } from '../App';

const CATEGORIES = [
  { Icon: Leaf,    n: 14, t: 'Vida cotidiana',     d: 'Densidad de servicios, áreas verdes, ruido, ritmo del barrio, calidad del aire.' },
  { Icon: Route,   n: 12, t: 'Movilidad',          d: 'Tráfico observado por franja horaria, estaciones de Metro/Metrobús, ciclovía, tiempos puerta-a-puerta.' },
  { Icon: Shield,  n: 18, t: 'Seguridad y riesgo', d: 'Delito georreferenciado por tipo, riesgo sísmico, encharcamientos, grietas, iluminación.' },
  { Icon: Store,   n: 11, t: 'Comercio',           d: 'Densidad comercial, horarios, gastronomía, retail ancla, vida nocturna medida.' },
  { Icon: BarChart, n: 16, t: 'Mercado',           d: 'Absorción de preventa, rotación de venta, inventario visible, velocidad por ticket.' },
  { Icon: Database, n: 15, t: 'Construcción',      d: 'Permisos activos, tipologías, alturas permitidas, año, amenidades, nivel de acabados.' },
  { Icon: Sparkle,  n: 11, t: 'Plusvalía',         d: 'Tendencia 5 años por colonia, comparables, premium vs submercado, outliers.' },
];

const TOTAL = CATEGORIES.reduce((a, c) => a + c.n, 0); // 97

export default function Inteligencia() {
  const { user, logout, openAuth } = useAuth();
  const [explainCode, setExplainCode] = useState(null);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar onLogin={openAuth} user={user} onLogout={logout} />
      <main style={{ padding: '110px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>MOTOR IE · ¿CÓMO FUNCIONA?</div>
        <h1 style={{
          fontFamily: 'Outfit', fontWeight: 800,
          fontSize: 'clamp(36px, 6vw, 60px)',
          color: 'var(--cream)',
          letterSpacing: '-0.028em', lineHeight: 1.02,
          margin: '0 0 18px', maxWidth: 960,
        }}>
          Los <span style={{
            background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>{TOTAL} indicadores</span> detrás de cada precio.
        </h1>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 17, color: 'var(--cream-2)',
          lineHeight: 1.65, maxWidth: 800, margin: '0 0 36px',
        }}>
          DesarrollosMX no opina. DMX mide. Para cada colonia cruzamos fuentes públicas
          oficiales, sensores propios y comparables del mercado en vivo. El resultado
          es una lectura verificable del territorio — el mismo motor que alimenta los
          dashboards del portal del desarrollador y el argumentario del asesor.
        </p>

        {/* LIVE: scores reales calculados por el IE Engine */}
        <div style={{
          padding: 22, marginBottom: 40,
          background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.03))',
          border: '1px solid var(--border)',
          borderRadius: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>LIVE · IE ENGINE</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                Roma Norte · lectura actual
              </div>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
              Haz click en un score para ver "cómo lo sabemos" →
            </div>
          </div>
          <ZoneScoreStrip
            zoneId="roma_norte"
            limit={12}
            onScoreClick={s => setExplainCode(s.code)}
            title=""
          />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 48,
        }}>
          {CATEGORIES.map(({ Icon, n, t, d }) => (
            <div key={t} data-testid={`intel-cat-${t.split(' ')[0].toLowerCase()}`} style={{
              padding: 22,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color="var(--indigo-3)" />
                </div>
                <div style={{
                  fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
                  background: 'var(--grad)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}>
                  {n}
                </div>
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

        <div style={{
          padding: 26,
          background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.04))',
          border: '1px solid var(--border)',
          borderRadius: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ maxWidth: 640 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>QUIÉN USA EL MOTOR</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 6, letterSpacing: '-0.02em' }}>
              Compradores, asesores y desarrolladoras — la misma capa de verdad.
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6 }}>
              El comprador lo ve resumido en el IE Score. El asesor lo usa para su
              argumentario Pulppo+. La desarrolladora lo usa para pricing dinámico y
              radar competidores. Mismo dato, tres lecturas distintas.
            </div>
          </div>
          <a
            href="/marketplace"
            data-testid="intel-cta-marketplace"
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            Ver el motor en acción <ArrowRight size={12} />
          </a>
        </div>
      </main>
      <CtaFooter />

      <ScoreExplainModal
        open={!!explainCode}
        zoneId="roma_norte"
        code={explainCode}
        onClose={() => setExplainCode(null)}
      />
    </div>
  );
}
