/**
 * SeccionConfianza — UI NUEVA (de cero) para "¿Puedes confiar?". Risk reversal honesto:
 *   · Desarrollador (track record real: dev.developer)
 *   · Calidad de obra / Legal (config.sello_*) — SOLO si están configurados (hideIfEmpty, nada de 'pendiente')
 *   · Riesgos honestos (/api/inversion-v4/zona-contexto: sísmico/inundación/PML + preventa)
 * Sistema visual único. Cero inventado.
 */
import React, { useState, useEffect } from 'react';
import { Card, SERIF, SANS, HEAD } from './ui';

const API = process.env.REACT_APP_BACKEND_URL;
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})/); return m ? `${MES[+m[2] - 1] || ''} ${m[1]}` : s; };

function nivelSismo(s) { return s >= 70 ? { l: 'Alto', c: '#DC2626' } : s >= 45 ? { l: 'Medio', c: '#B45309' } : { l: 'Bajo', c: '#059669' }; }
function nivelFlood(f) { return f >= 0.6 ? { l: 'Alto', c: '#DC2626' } : f >= 0.3 ? { l: 'Medio', c: '#B45309' } : { l: 'Bajo', c: '#059669' }; }

export default function SeccionConfianza({ dev }) {
  const cfg = dev.config || {};
  const col = dev.colonia_id || dev.colonia;
  const [zc, setZc] = useState(null);
  const developer = dev.developer || {};
  const cons = cfg.sello_constructivo;
  const legal = cfg.sello_legal;

  useEffect(() => {
    if (!col) return undefined;
    let alive = true;
    fetch(`${API}/api/inversion-v4/zona-contexto?colonia=${encodeURIComponent(col)}`).then((r) => r.json()).then((d) => { if (alive) setZc(d); }).catch(() => {});
    return () => { alive = false; };
  }, [col]);

  const r = (zc && zc.riesgo) || {};
  const riesgos = [];
  if (r.sismic_score != null) {
    const n = nivelSismo(r.sismic_score);
    const pml = r.pml || {};
    riesgos.push({ icon: '🌐', t: 'Riesgo sísmico', n, d: pml.sel_pct != null ? `Pérdida estimada en sismo severo ~${pml.sel_pct}% del valor (screening ASTM, no estudio de suelo).` : 'Screening genérico CDMX.' });
  }
  if (r.flood_risk != null) {
    const n = nivelFlood(r.flood_risk);
    riesgos.push({ icon: '💧', t: 'Inundación', n, d: 'Según Atlas de Riesgos CDMX para la zona.' });
  }
  if (dev.stage === 'preventa' || dev.stage === 'construccion') {
    riesgos.push({ icon: '🏗️', t: 'Compra en preventa', n: { l: 'A considerar', c: '#B45309' }, d: `Entrega estimada ${fechaCorta(dev.delivery_estimate)}. Pide avances de obra y revisa el contrato antes de firmar.` });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* desarrollador */}
      {developer.name && (
        <Card>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Quién construye</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: `hsl(${developer.logo_hue || 250} 60% 92%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: `hsl(${developer.logo_hue || 250} 55% 38%)`, flexShrink: 0 }}>{developer.name[0]}</div>
            <div>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>{developer.name}</div>
              <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>
                {[developer.founded_year && `Desarrollando desde ${developer.founded_year}`, developer.projects_delivered && `${developer.projects_delivered} proyectos entregados`, developer.units_sold && `${developer.units_sold.toLocaleString('es-MX')} unidades vendidas`].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          {/* Verificaciones reales del desarrollador (no performance inventado) */}
          {(developer.verified_constitution || developer.no_judicial_records || developer.no_profeco_complaints) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
              {developer.verified_constitution && <span style={{ padding: '5px 11px', borderRadius: 9, background: 'rgba(30,158,99,0.12)', border: '1px solid rgba(30,158,99,0.3)', fontFamily: SANS, fontSize: 12, color: '#4ADE80' }}>✓ Constitución verificada</span>}
              {developer.no_judicial_records && <span style={{ padding: '5px 11px', borderRadius: 9, background: 'rgba(30,158,99,0.12)', border: '1px solid rgba(30,158,99,0.3)', fontFamily: SANS, fontSize: 12, color: '#4ADE80' }}>✓ Sin antecedentes judiciales</span>}
              {developer.no_profeco_complaints && <span style={{ padding: '5px 11px', borderRadius: 9, background: 'rgba(30,158,99,0.12)', border: '1px solid rgba(30,158,99,0.3)', fontFamily: SANS, fontSize: 12, color: '#4ADE80' }}>✓ Sin quejas Profeco</span>}
            </div>
          )}
        </Card>
      )}

      {/* calidad de obra — solo si configurada */}
      {cons && cons.configured && (cons.titulo || (cons.badges || []).length) && (
        <Card>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Calidad de obra</div>
          {cons.titulo && <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{cons.titulo}</div>}
          {cons.descripcion && <p style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', margin: '6px 0 0', lineHeight: 1.6 }}>{cons.descripcion}</p>}
          {(cons.badges || []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>{cons.badges.map((b, i) => <span key={i} style={{ padding: '5px 11px', borderRadius: 9, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 12, color: 'var(--cream-2)' }}>{b}</span>)}</div>}
        </Card>
      )}

      {/* legal — solo si configurado y verificado (nada de 'pendiente') */}
      {legal && legal.configured && legal.tier !== 'gray' && (
        <Card>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Situación legal</div>
          {legal.titulo && <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{legal.titulo}</div>}
          {legal.descripcion && <p style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', margin: '6px 0 0', lineHeight: 1.6 }}>{legal.descripcion}</p>}
        </Card>
      )}

      {/* riesgos honestos */}
      {riesgos.length > 0 && (
        <Card>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 4 }}>Lo que debes saber antes de comprar</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginBottom: 16 }}>Te lo decimos sin adornos. Datos públicos de la zona.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
            {riesgos.map((x, i) => (
              <div key={i} style={{ padding: '14px 16px', borderRadius: 13, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 14.5, color: 'var(--cream)' }}>{x.icon} {x.t}</span>
                  <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 800, color: x.n.c, padding: '3px 9px', borderRadius: 9999, background: `${x.n.c}14` }}>{x.n.l}</span>
                </div>
                <p style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', margin: 0, lineHeight: 1.55 }}>{x.d}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
