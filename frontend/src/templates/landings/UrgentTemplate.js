// W5.22 Z.8.7 Sub-B2 · Urgent Template · rojo + naranja · countdown XL · scarcity
import React, { useEffect, useState } from 'react';

const COL = { primary: '#DC2626', secondary: '#F97316', dark: '#1F2937', bg: '#FFF7ED' };

function useTime(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const t = target ? new Date(target).getTime() : (Date.now() + 1000 * 60 * 60 * 72);
  const diff = Math.max(0, t - now);
  return { d: Math.floor(diff / 86400000), h: Math.floor((diff / 3600000) % 24), m: Math.floor((diff / 60000) % 60), s: Math.floor((diff / 1000) % 60), expired: diff === 0 };
}

export default function UrgentTemplate({ intake = {}, copy = null }) {
  const t = useTime(intake.urgent_expires_at);
  const advisor = intake.assigned_advisor || {};
  const phaseNow = intake.typologies?.[0]?.price_mxn ?? 4800000;
  const phaseNext = Math.round(phaseNow * 1.12);
  const usps = intake.unique_selling_points || [];

  return (
    <div data-testid="tpl-z87-urgent" style={{ background: COL.bg, color: COL.dark, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: COL.primary, color: '#fff', padding: '10px 16px', textAlign: 'center', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        ULTIMAS UNIDADES · cierra fase en {t.expired ? 'CERRADO' : `${t.d}d ${t.h}h ${t.m}m ${t.s}s`}
      </div>
      <section style={{ padding: '4rem 2rem 2rem', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', margin: 0, fontWeight: 900, color: COL.primary, lineHeight: 1 }}>{copy?.hero?.headline || intake.project_name}</h1>
        <p style={{ marginTop: 18, fontSize: 'clamp(1.1rem, 1.8vw, 1.35rem)', color: '#7C2D12', maxWidth: 600, margin: '18px auto 0' }}>{copy?.hero?.subhead || 'Quedan unidades · fase actual cierra esta semana.'}</p>
        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          {[{ l: 'Dias', v: t.d }, { l: 'Hrs', v: t.h }, { l: 'Min', v: t.m }, { l: 'Seg', v: t.s }].map((u, i) => (
            <div key={i} style={{ minWidth: 100, padding: 18, background: '#fff', border: `2px solid ${COL.primary}`, borderRadius: 12 }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, color: COL.primary, lineHeight: 1 }}>{String(u.v).padStart(2, '0')}</div>
              <div style={{ fontSize: 11, color: '#7C2D12', textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 4 }}>{u.l}</div>
            </div>
          ))}
        </div>
        <a href="#lead-form-anchor" style={{ display: 'inline-block', marginTop: 36, padding: '16px 40px', background: COL.primary, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontWeight: 900, fontSize: 16, letterSpacing: '0.05em', animation: t.expired ? 'none' : 'pulse 1.6s infinite' }}>{t.expired ? 'Periodo cerrado' : 'APARTAR HOY · 50K MXN'}</a>
      </section>
      <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', color: COL.primary }}>Fase actual vs siguiente</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 20 }}>
          <div style={{ padding: 22, background: '#DCFCE7', borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>FASE ACTUAL · disponible</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, color: '#166534', marginTop: 6 }}>${phaseNow.toLocaleString('es-MX')}</div>
          </div>
          <div style={{ padding: 22, background: '#FEE2E2', borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#991B1B', fontWeight: 700 }}>FASE SIGUIENTE · proximo lunes</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, color: '#991B1B', marginTop: 6, textDecoration: 'line-through', opacity: 0.6 }}>${phaseNext.toLocaleString('es-MX')}</div>
          </div>
        </div>
      </section>
      <section style={{ padding: '3rem 2rem', maxWidth: 760, margin: '0 auto' }}>
        <h3 style={{ fontFamily: 'Outfit, sans-serif', textAlign: 'center', color: COL.primary }}>Lo que recibes HOY (stack completo)</h3>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 20, display: 'grid', gap: 10 }}>
          {(usps.length ? usps : ['Bono mudanza $25K', 'Decoracion inicial $40K', 'Plan financiero 5a personalizado $15K', 'Acompaniamiento notario $20K', 'Asesoria legal $10K']).slice(0, 6).map((u, i) => (
            <li key={i} style={{ padding: 12, background: '#fff', borderLeft: `4px solid ${COL.primary}`, display: 'flex', justifyContent: 'space-between' }}>
              <span>{u}</span>
              <span style={{ color: COL.primary, fontWeight: 700 }}>incluido</span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 18, padding: 18, background: COL.primary, color: '#fff', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Valor total stack</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 900 }}>$110,000 MXN</div>
        </div>
      </section>
      <section style={{ padding: '3rem 2rem', textAlign: 'center', background: '#fff' }}>
        <p style={{ fontSize: 13, color: '#7C2D12' }}>Ultimos apartados · ultimos 7 dias:</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {['Maria L.', 'Carlos R.', 'Sofia P.', 'Diego A.', 'Ana M.'].map((n, i) => (
            <div key={i} style={{ padding: '6px 14px', background: '#FEE2E2', borderRadius: 9999, fontSize: 12, color: '#991B1B', fontWeight: 600 }}>{n}</div>
          ))}
        </div>
      </section>
      <section id="lead-form-anchor" style={{ padding: '4rem 2rem 6rem', textAlign: 'center', background: COL.primary, color: '#fff' }}>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 900 }}>Aparta hoy o pierde la fase</h2>
        <a href={`https://wa.me/${(advisor.phone || '').replace(/\D/g, '')}`} style={{ display: 'inline-block', marginTop: 16, padding: '18px 40px', background: '#fff', color: COL.primary, borderRadius: 9999, textDecoration: 'none', fontWeight: 900, fontSize: 16 }}>WhatsApp · 50K hoy</a>
      </section>
      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }`}</style>
    </div>
  );
}
