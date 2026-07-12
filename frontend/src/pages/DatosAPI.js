/*
 *  DATOS DMX POR API — la landing pública del negocio B2B de datos (founder: el producto de mayor margen,
 *  el backend de cobro con Stripe + tiers ya existe; faltaba la superficie de venta). Bancos/aseguradoras/
 *  notarías/fondos consumen índices, scores y snapshots de mercado CDMX por API.
 */
import React from 'react';
import ToolNav from '../components/ui/ToolNav';

const C = { bg: '#FBFAFC', ink: '#1E2230', ink2: '#5A5F6E', faint: '#9AA0AE', line: '#ECECEC', card: '#FFFFFF', accent: '#6D4AFF', green: '#1FA06A' };
const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";

const PRODUCTOS = [
  { emoji: '📸', t: 'Snapshot de zona', d: 'KPIs agregados de cualquier colonia: precio, absorción, inventario, demanda.' },
  { emoji: '📈', t: 'Índices DMX', d: 'Índice de mercado + subíndices (obra, absorción, gestión) con su serie histórica.' },
  { emoji: '🏅', t: 'Zone Score', d: 'Calificación A–F de la zona con sus componentes (liquidez, demanda, riesgo, yield).' },
  { emoji: '🛡️', t: 'Risk Score', d: 'Score de riesgo por zona para underwriting y due diligence.' },
  { emoji: '🔁', t: 'Comparables', d: 'Cierres comparables anonimizados por zona y tipología.' },
  { emoji: '⏱️', t: 'Series históricas', d: 'Evolución temporal de precio e índices para modelado y backtesting.' },
];

const TIERS = [
  { name: 'Free', precio: '$0', sub: 'Para evaluar', color: C.line,
    items: ['Snapshot básico de zona', 'Zone Score (nivel)', 'Rate limit básico', '1 API key'] },
  { name: 'Pro', precio: 'Cotizar', sub: 'Analistas y fondos', color: C.accent, destacado: true,
    items: ['Todo lo de Free', 'Índices + series históricas', 'Comparables + DRPI', 'Risk Score detallado', 'Rate limit alto'] },
  { name: 'Enterprise', precio: 'Cotizar', sub: 'Bancos · aseguradoras · notarías', color: '#C63FAE',
    items: ['Todo lo de Pro', 'Modelo hedónico (id + coeficientes)', 'Control de PII por contrato', 'SLA + soporte dedicado', 'Múltiples keys'] },
];

const MAILTO = 'mailto:hola@desarrollosmx.io?subject=Acceso%20a%20la%20API%20de%20datos%20DMX&body=Hola%2C%20me%20interesa%20el%20acceso%20a%20la%20API%20de%20datos%20DMX.%20Tier%3A%20';

export default function DatosAPI() {
  return (
    <div className="theme-light-scope" style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      <ToolNav />
      <div style={{ background: GRAD, padding: '56px 20px 44px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, opacity: 0.9, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff' }}>DMX Data · API</div>
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 42, lineHeight: 1.04, margin: '10px 0', letterSpacing: '-0.025em', maxWidth: 780, color: '#fff' }}>
            El mercado inmobiliario de la CDMX, como datos que puedes consultar por API
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 17, opacity: 0.95, maxWidth: 620, color: '#fff' }}>
            Índices, scores y comparables de mercado — la misma inteligencia que mueve DMX, lista para tu banco, aseguradora, notaría o fondo.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
            <a href={MAILTO} style={{ background: '#fff', color: C.accent, borderRadius: 11, padding: '13px 26px', fontFamily: HEAD, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>Solicita tu acceso →</a>
            <a href="#tiers" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', borderRadius: 11, padding: '13px 26px', fontFamily: HEAD, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>Ver planes</a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 20px 64px' }}>
        {/* Productos */}
        <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, marginTop: 40, letterSpacing: '-0.02em' }}>Qué puedes consumir</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 18 }}>
          {PRODUCTOS.map((p) => (
            <div key={p.t} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 24 }}>{p.emoji}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, marginTop: 8 }}>{p.t}</div>
              <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 4, lineHeight: 1.5 }}>{p.d}</div>
            </div>
          ))}
        </div>

        {/* Ejemplo de request */}
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, marginTop: 24 }}>
          <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ejemplo</div>
          <pre style={{ fontFamily: MONO, fontSize: 13, color: C.ink, overflowX: 'auto', margin: '8px 0 0' }}>{`curl -H "x-api-key: dmx_live_..." \\
  https://api.desarrollosmx.io/api/v1/zones/condesa/snapshot`}</pre>
        </div>

        {/* Tiers */}
        <h2 id="tiers" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, marginTop: 44, letterSpacing: '-0.02em' }}>Planes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 18 }}>
          {TIERS.map((t) => (
            <div key={t.name} style={{ background: C.card, border: `1.5px solid ${t.destacado ? t.color : C.line}`, borderRadius: 18, padding: 24, position: 'relative', boxShadow: t.destacado ? `0 0 0 3px ${t.color}22` : 'none' }}>
              {t.destacado && <div style={{ position: 'absolute', top: -11, left: 22, background: t.color, color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 11, padding: '3px 10px', borderRadius: 999 }}>MÁS PEDIDO</div>}
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20 }}>{t.name}</div>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint }}>{t.sub}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, margin: '10px 0', color: t.destacado ? t.color : C.ink }}>{t.precio}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {t.items.map((it, i) => (
                  <div key={i} style={{ fontFamily: FONT, fontSize: 13.5, color: C.ink2, display: 'flex', gap: 8 }}><span style={{ color: C.green }}>✓</span> {it}</div>
                ))}
              </div>
              <a href={`${MAILTO}${t.name}`} style={{ display: 'block', textAlign: 'center', marginTop: 18, background: t.destacado ? GRAD : 'transparent', border: t.destacado ? 'none' : `1.5px solid ${C.line}`, color: t.destacado ? '#fff' : C.ink, borderRadius: 11, padding: '11px', fontFamily: HEAD, fontWeight: 800, fontSize: 14.5, textDecoration: 'none' }}>{t.name === 'Free' ? 'Empezar gratis' : 'Cotizar'}</a>
            </div>
          ))}
        </div>

        <div style={{ background: GRAD, borderRadius: 18, padding: '28px', marginTop: 32, textAlign: 'center' }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: '#fff' }}>¿Listo para integrar los datos de DMX?</div>
          <div style={{ fontFamily: FONT, fontSize: 15, opacity: 0.95, marginTop: 6, color: '#fff' }}>Te damos una API key de prueba y la documentación en el día.</div>
          <a href={MAILTO} style={{ display: 'inline-block', marginTop: 16, background: '#fff', color: C.accent, borderRadius: 11, padding: '13px 26px', fontFamily: HEAD, fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>Solicita tu acceso →</a>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 18, textAlign: 'center' }}>
          Datos agregados y anonimizados. El nivel de detalle y PII depende del contrato y tier.
        </div>
      </div>
    </div>
  );
}
