// W4.14 — Simulador.js · página pública /simulador
// Rediseño CLARO (Apple-tier): monta la calculadora de grado institucional (InversionV4Calculator),
// misma que vive en ZonePageV2. Flow individual/institucional sin precio bloqueado (pantalla libre).
// Contenedor claro (#fff/#FAFAFB) con hero serif + aire, header claro estilo Mapa.js.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import InversionV4Calculator from '../../components/investment/InversionV4Calculator';
import AtlaxBubble from '../../components/landing/AtlaxBubble';  // asistente única (flota · funciona sobre cualquier fondo)
import ToolNav from '../../components/ui/ToolNav';

const INK = '#1E2230';       // texto principal
const INK_2 = '#5A5F6E';     // texto secundario
const INK_3 = '#9AA0AE';     // texto tenue

export default function Simulador({ user, onLogout }) {  // eslint-disable-line no-unused-vars
  const [sp] = useSearchParams();
  // Paso 1 del flow (igual que ZonePageV2): para ti (1 unidad) vs institucional (un fondo, 2+).
  const [mode, setMode] = useState('individual');

  // FIX auditoría: rehidratar un escenario guardado por ?escenario={token} ('Guardar y compartir').
  const [savedParams, setSavedParams] = useState(null);
  useEffect(() => {
    const tok = sp.get('escenario');
    if (!tok) return;
    const API = process.env.REACT_APP_BACKEND_URL || '';
    let alive = true;
    fetch(`${API}/api/investment-simulator/scenario/${tok}`).then((r) => r.json())
      .then((d) => { if (alive && d.ok && d.escenario) setSavedParams(d.escenario.params || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sp]);

  // Prefill por query (?precio&renta) o por escenario guardado — el precio NO se bloquea (pantalla libre).
  const prefilled = savedParams ? {
    precio: savedParams.precio, renta: savedParams.renta,
  } : {
    precio: sp.get('precio') ? parseFloat(sp.get('precio')) : undefined,
    renta: sp.get('renta') ? parseFloat(sp.get('renta')) : undefined,
  };

  useEffect(() => {
    document.title = 'Simulador de Inversión Inmobiliaria CDMX · DesarrollosMX';
    try { window.posthog?.capture('investment_simulator_page_viewed'); } catch { /* noop */ }
  }, []);

  return (
    <div className="tool-surface" style={{ color: INK, fontFamily: 'DM Sans' }}>

      {/* ===================== NAV SUPERIOR unificado (menú Herramientas real) ===================== */}
      <ToolNav />

      <style>{`
        .sim-mode{transition:transform .15s cubic-bezier(.2,.8,.2,1),box-shadow .15s,border-color .15s}
        .sim-mode:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(var(--theme-rgb),.16)}
      `}</style>

      {/* ===================== HERO (serif · aire generoso) ===================== */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(44px,6vw,72px) 20px 0' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--grad)', color: '#fff', padding: '7px 16px', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 12, letterSpacing: '0.04em', boxShadow: '0 10px 24px rgba(var(--theme-rgb),0.28)' }}>
          🧮 Inteligencia financiera inmobiliaria
        </div>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800,
          fontSize: 'clamp(30px, 4.6vw, 52px)', color: INK, letterSpacing: '-0.02em',
          margin: '18px 0 0', lineHeight: 1.08, maxWidth: 780,
        }}>
          Antes de invertir,<br />ve exactamente cuánto te deja.
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 'clamp(15px,1.9vw,18px)', color: INK_2, maxWidth: 620, margin: '18px 0 0', lineHeight: 1.6 }}>
          Cap rate, TIR, flujo mensual, impuestos de México y escenarios (optimista · base · pesimista) para
          cualquier propiedad. Con datos vivos de mercado — nada inventado, cada número con su fuente.
        </p>

        {/* PASO 1 · tipo de inversión (mismo flow que la ficha de zona) */}
        <div style={{ marginTop: 34 }}>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 11.5, color: INK_3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>1 · ¿Para ti o institucional?</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            {[['individual', '👤 Para ti', 'Compras 1 propiedad'], ['institucional', '🏛️ Institucional', 'Métricas duras · fondo']].map(([v, l, d]) => { const on = mode === v; return (
              <button key={v} className="sim-mode" type="button" onClick={() => setMode(v)} style={{ padding: '11px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans', textAlign: 'left', border: on ? '1.5px solid transparent' : '1px solid rgba(var(--theme-rgb),0.22)', background: on ? 'var(--grad)' : '#fff', color: on ? '#fff' : INK_2, boxShadow: on ? '0 8px 20px rgba(var(--theme-rgb),.28)' : '0 2px 8px rgba(16,18,28,.04)' }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{l}</div>
                <div style={{ fontSize: 10.5, fontWeight: 600, opacity: on ? 0.9 : 0.65, marginTop: 1 }}>{d}</div>
              </button>
            ); })}
          </div>
        </div>
      </div>

      {/* ===================== CALCULADORA (motor institucional · claro) ===================== */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '26px 20px 0' }}>
        <InversionV4Calculator
          key={mode}
          mode={mode}
          prefilled={prefilled}
        />
      </div>

      {/* ===================== METODOLOGÍA (footer · describe el motor v4) ===================== */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 20px 64px' }}>
        <div className="dmx-card" style={{ background: '#fff', border: '1px solid #ECECEC', borderRadius: 16, boxShadow: '0 6px 20px rgba(16,18,28,0.05)', padding: '22px 24px' }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em', marginBottom: 10 }}>
            Cómo calculamos
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: INK_2, lineHeight: 1.75 }}>
            El motor de grado institucional proyecta el flujo de caja año a año y descuenta a valor presente:
            <b style={{ color: INK }}> cap rate, TIR, VPN, equity multiple, DSCR</b> y flujo mensual neto. Los impuestos usan
            el régimen fiscal de México (RESICO, arrendamiento ciega/real, asalariado, actividad empresarial — elige el que
            pagas menos) y el ISR de la venta. El escenario de salida usa un <b style={{ color: INK }}>exit cap rate</b> y una prima de
            riesgo inmobiliario editables; los tres escenarios (optimista · base · pesimista) y la simulación
            <b style={{ color: INK }}> Monte Carlo</b> muestran el rango de resultados, no una sola cifra. El tipo de cambio (USD) viene del
            FIX vivo de Banxico y la renta corta puede traerse de datos reales de Airbnb por zona (AirROI).
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: INK_3, lineHeight: 1.7, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0F0F3' }}>
            Los campos marcados <b style={{ color: 'var(--theme)' }}>AUTO</b> son estimados editables — nunca inventamos un número sin decírtelo.
            Los resultados son estimaciones con fines informativos y no constituyen asesoría financiera. LFPDPPP: los datos
            de sesión se eliminan a las 24h.
          </div>
        </div>
      </div>

      <AtlaxBubble theme="light" />
    </div>
  );
}
