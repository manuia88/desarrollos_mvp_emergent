// W4.14 — Simulador.js · página pública /simulador
import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import InvestmentSimulator from '../../components/investment/InvestmentSimulator';
import AtlaxBubble from '../../components/landing/AtlaxBubble';  // asistente única (unifica · reemplaza BuyerCoach)

export default function Simulador({ user, onLogout }) {
  const [sp] = useSearchParams();

  const prefilled = {
    precio: sp.get('precio') ? parseFloat(sp.get('precio')) : undefined,
    colonia: sp.get('colonia') || undefined,
    m2: sp.get('m2') ? parseFloat(sp.get('m2')) : undefined,
    plazo: sp.get('plazo') ? parseInt(sp.get('plazo')) : undefined,
  };

  useEffect(() => {
    document.title = 'Simulador de Inversión Inmobiliaria CDMX · DesarrollosMX';
    try { window.posthog?.capture('investment_simulator_page_viewed'); } catch {}
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar user={user} onLogout={onLogout} />

      <div style={{ paddingTop: 80, paddingBottom: 60, maxWidth: 960, margin: '0 auto', padding: '80px 20px 60px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Inteligencia Financiera Inmobiliaria
          </div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 42px)',
            color: 'var(--cream)', margin: '0 0 14px',
            lineHeight: 1.15,
          }}>
            Simula tu inversión inmobiliaria en CDMX
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-3)', maxWidth: 520, margin: 0, lineHeight: 1.6 }}>
            Calcula ROI, TIR y flujo de caja en 3 escenarios para cualquier colonia de la Ciudad de México.
            Powered by datos hedónicos y Zone Score DMX.
          </p>
        </div>

        {/* Simulator card */}
        <div style={{
          background: 'rgba(13,16,23,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          backdropFilter: 'blur(24px)',
          padding: '28px 24px',
        }}>
          <InvestmentSimulator prefilled={prefilled} />
        </div>

        {/* SEO footer */}
        <div style={{ marginTop: 48, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 24 }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--cream)' }}>Metodología:</strong> Los cálculos utilizan datos de modelos hedónicos de regresión
            (precios m² por colonia), Zone Score DMX (índice de plusvalía 0-100) y tasas de interés hipotecaria
            de referencia TIIE-28d + spread bancario. Los resultados son estimaciones con fines informativos
            y no constituyen asesoría financiera. LFPDPPP: los datos de sesión se eliminan a las 24h.
          </div>
        </div>
      </div>

      <AtlaxBubble />
    </div>
  );
}
