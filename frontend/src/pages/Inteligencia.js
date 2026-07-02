// /inteligencia — stub educativo: "Los 97 indicadores detrás de cada precio"
import React, { useState } from 'react';
import Navbar from '../components/landing/Navbar';
import CtaFooter from '../components/landing/CtaFooter';
import ZoneScoreStrip from '../components/landing/ZoneScoreStrip';
import ScoreExplainModal from '../components/landing/ScoreExplainModal';
import NarrativeBlock from '../components/landing/NarrativeBlock';
import { Sparkle, Database, BarChart, Route, Shield, Leaf, Store, ArrowRight } from '../components/icons';
import AtlaxBubble from '../components/landing/AtlaxBubble';
import ScoreBadge from '../components/investment/ScoreBadge';
import DMXMarketIndex from '../components/marketplace/DMXMarketIndex';
import { useAuth } from '../App';
import { tc } from '../lib/titleCase';

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

// Demo interactivo: colonias con scores REALES (el visitante elige y la lectura LIVE se actualiza)
const DEMO_ZONES = [
  { id: 'roma_norte', name: 'Roma Norte' }, { id: 'polanco', name: 'Polanco' },
  { id: 'condesa', name: 'Condesa' }, { id: 'juarez', name: 'Juárez' },
  { id: 'del_valle_centro', name: 'Del Valle' }, { id: 'narvarte', name: 'Narvarte' },
  { id: 'napoles', name: 'Nápoles' }, { id: 'escandon', name: 'Escandón' },
  { id: 'coyoacan_centro', name: 'Coyoacán' },
];

export default function Inteligencia() {
  const { user, logout, openAuth } = useAuth();
  const [explainCode, setExplainCode] = useState(null);
  const [zone, setZone] = useState(DEMO_ZONES[0]);   // colonia del demo LIVE

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar onLogin={openAuth} user={user} onLogout={logout} />
      <main style={{ padding: '110px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{tc('Cómo medimos cada zona')}</div>
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

        {/* Fase 4 · Índice DMX de Mercado (público · cubo anónimo · data marketplace) */}
        <DMXMarketIndex />

        {/* LIVE: scores reales calculados por el IE Engine */}
        <div style={{
          padding: 22, marginBottom: 40,
          background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.03))',
          border: '1px solid var(--border)',
          borderRadius: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>{tc('En vivo · análisis de la colonia')}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {zone.name} · lectura actual
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <select
                data-testid="ie-demo-zone-select"
                value={zone.id}
                onChange={(e) => setZone(DEMO_ZONES.find(z => z.id === e.target.value) || DEMO_ZONES[0])}
                style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: 'var(--cream)', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', cursor: 'pointer' }}
              >
                {DEMO_ZONES.map(z => <option key={z.id} value={z.id} style={{ color: '#111' }}>📍 {z.name}</option>)}
              </select>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                Cambia de colonia · click en un score para ver "cómo lo sabemos" →
              </div>
            </div>
          </div>
          <ZoneScoreStrip
            zoneId={zone.id}
            limit={12}
            onScoreClick={s => setExplainCode(s.code)}
            title=""
          />
          <div style={{ marginTop: 16 }}>
            <NarrativeBlock scope="colonia" entityId={zone.id} />
          </div>
          {/* Conecta el demo con los motores completos (ciclo · riesgo · habitabilidad · mapa) en la página de zona */}
          <a
            href={`/zona/${zone.id.replace(/_/g, '-')}`}
            data-testid="ie-demo-zona-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, color: 'var(--theme, #818CF8)', textDecoration: 'none' }}
          >
            Ver {zone.name} a fondo — momento de la zona, riesgo, habitabilidad y mapa
            <ArrowRight size={15} />
          </a>
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
            <div className="eyebrow" style={{ marginBottom: 8 }}>{tc('Quién usa estos datos')}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 6, letterSpacing: '-0.02em' }}>
              Compradores, asesores y desarrolladoras — la misma capa de verdad.
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.6 }}>
              El comprador lo ve resumido en el IE Score. El asesor lo usa para su
              argumentario. La desarrolladora lo usa para pricing dinámico y
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

        <TopColoniasByScore />
      </main>
      <CtaFooter />

      <ScoreExplainModal
        open={!!explainCode}
        zoneId="roma_norte"
        code={explainCode}
        onClose={() => setExplainCode(null)}
      />
      <AtlaxBubble />
    </div>
  );
}

// F0.1 · Top 10 colonias DMX Score (bento section)
function TopColoniasByScore() {
  const API = process.env.REACT_APP_BACKEND_URL;
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`${API}/api/investment-simulator/score/top-colonias?limit=10`)
      .then((r) => r.json())
      .then((d) => setItems(d?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [API]);

  return (
    <section
      data-testid="top-colonias-score-section"
      style={{
        maxWidth: 1280, margin: '40px auto 60px',
        padding: '0 24px',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em',
          color: 'var(--cream-3, #a0a4b0)',
        }}>
          DMX SCORE INVERSIÓN
        </span>
        <h2 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 28,
          margin: '6px 0 8px', letterSpacing: '-0.01em', color: 'var(--cream)',
        }}>
          Top 10 colonias DMX Score
        </h2>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-3, #a0a4b0)',
          margin: 0, lineHeight: 1.55,
        }}>
          Ranking compuesto: TIR + Zone Score + Demand-Supply + resiliencia stress.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 18, fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
          Calculando…
        </div>
      ) : items.length === 0 ? (
        <div data-testid="top-colonias-empty" style={{
          padding: '28px 24px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', borderRadius: 16,
        }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 6 }}>
            Aún no podemos publicar el ranking
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.55, maxWidth: 440, margin: '0 auto' }}>
            Estamos terminando de calcular el score de inversión por colonia. Vuelve en un momento.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}>
          {items.map((it, i) => (
            <a
              key={it.colonia_slug}
              href={`/simulador?colonia=${encodeURIComponent(it.colonia_slug)}`}
              data-testid={`top-colonia-card-${it.colonia_slug}`}
              style={{
                background: 'rgba(13,16,23,0.92)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 16, padding: 16,
                backdropFilter: 'blur(24px)',
                textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'transform 220ms ease, border-color 220ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; }}
            >
              <div style={{
                minWidth: 28, fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
                color: 'var(--cream-3, #a0a4b0)',
              }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.colonia_name}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3, #a0a4b0)', marginTop: 2 }}>
                  {it.recommendation}
                </div>
              </div>
              <ScoreBadge
                size="small"
                score={it.score}
                tier={it.tier}
                label={it.label}
                showTooltip={false}
              />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
