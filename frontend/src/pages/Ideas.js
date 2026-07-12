/*
 *  FEED DE IDEAS — muro de oportunidades vivas de CDMX (founder checklist). Zonas emergentes + zonas bajo
 *  el mercado, cada una con su tesis y qué la disparó. Reusa /api/ideas (screener/gentrificación). Lead-gen.
 */
import React, { useEffect, useState } from 'react';
import ToolNav from '../components/ui/ToolNav';

const API = process.env.REACT_APP_BACKEND_URL || '';
const C = { bg: '#FBFAFC', ink: '#15121C', ink2: '#5B5568', faint: '#9A93A6', line: '#EFEBF4', card: '#FFF', accent: '#6D4AFF', green: '#1E9E63', amber: '#D98A00' };
const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";
const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');
const TIPO = {
  emergente: { emoji: '🌱', label: 'Zona emergente', color: C.green, bg: '#EAF7F0' },
  oportunidad: { emoji: '🏷️', label: 'Bajo el mercado', color: C.accent, bg: '#F3F0FF' },
};

export default function Ideas({ user, onLogin }) {
  const [ideas, setIdeas] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/ideas?limit=20`).then((r) => r.json())
      .then((d) => { if (alive) { setIdeas(d.ideas || []); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const vis = ideas.filter((i) => filtro === 'todas' || i.tipo === filtro);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      <ToolNav />
      <div style={{ background: GRAD, color: '#fff', padding: '48px 20px 36px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, opacity: 0.85, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Ideas DMX</div>
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 38, lineHeight: 1.06, margin: '8px 0 8px', letterSpacing: '-0.02em', maxWidth: 720 }}>
            Las zonas para entrar antes de que suban
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 16, opacity: 0.92, maxWidth: 600 }}>
            Colonias emergentes y por debajo del mercado — con la tesis y el dato que las disparó. Se actualiza con el mercado.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 60px' }}>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          {[['todas', 'Todas'], ['emergente', '🌱 Emergentes'], ['oportunidad', '🏷️ Bajo mercado']].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13, border: `1.5px solid ${filtro === k ? C.accent : C.line}`, background: filtro === k ? '#F3F0FF' : '#fff', color: filtro === k ? C.accent : C.ink2 }}>{l}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, color: C.faint }}>Cargando ideas…</div>
        ) : vis.length === 0 ? (
          <div style={{ padding: 40, color: C.faint }}>Aún no hay ideas con esos criterios.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {vis.map((i, idx) => {
              const t = TIPO[i.tipo] || TIPO.emergente;
              return (
                <a key={i.colonia_id || idx} href={`/fundamentales/${i.colonia_id}`} className="dmx-card" style={{ display: 'block', textDecoration: 'none', background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, color: t.color, background: t.bg, borderRadius: 999, padding: '3px 10px' }}>{t.emoji} {t.label}</span>
                    <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, color: C.ink2, background: '#F6F4FB', borderRadius: 999, padding: '3px 10px' }}>{i.disparo}</span>
                  </div>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, color: C.ink, marginTop: 9 }}>{i.name}{i.alcaldia ? <span style={{ fontWeight: 600, fontSize: 14, color: C.faint }}> · {i.alcaldia}</span> : null}</div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>{i.tesis}</div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginTop: 10 }}>
                    {i.precio_m2 && <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>{money(i.precio_m2)}<span style={{ fontSize: 12, color: C.faint }}>/m²</span></span>}
                    {i.plusvalia_yoy != null && <span style={{ fontFamily: FONT, fontSize: 13, color: i.plusvalia_yoy >= 0 ? C.green : C.ink2, fontWeight: 700 }}>{i.plusvalia_yoy > 0 ? '+' : ''}{i.plusvalia_yoy}%/año</span>}
                    <span style={{ fontFamily: FONT, fontSize: 13, color: C.accent, marginLeft: 'auto', fontWeight: 700 }}>Ver fundamentales →</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {!user && (
          <div style={{ background: GRAD, color: '#fff', borderRadius: 18, padding: '24px', marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 21 }}>Recibe las nuevas ideas antes que nadie</div>
            <div style={{ fontFamily: FONT, fontSize: 15, opacity: 0.92, marginTop: 6 }}>Regístrate y te avisamos cuando una zona nueva entre al radar.</div>
            <button onClick={onLogin} style={{ marginTop: 14, background: '#fff', color: C.accent, border: 'none', borderRadius: 10, padding: '11px 22px', fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Crear cuenta gratis</button>
          </div>
        )}
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 16, textAlign: 'center' }}>
          Ideas basadas en datos (gentrificación, precio vs mercado). Análisis, no asesoría de inversión.
        </div>
      </div>
    </div>
  );
}
