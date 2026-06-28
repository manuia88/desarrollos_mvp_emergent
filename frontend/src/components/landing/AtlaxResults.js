// AtlaxResults — render COMPARTIDO de los resultados fuertes de Atlax (la superficie /atlax Y la burbuja usan ESTE
// mismo componente → un solo Atlax en todas las ventanas). Pinta: exactos ("Para Ti") + "casi cumple" en tiers
// humanos (Cumple X/Y · le falta Z) + fallback a otras colonias + zona-no-cubierta + SIEMPRE una salida accionable
// (cero callejones). Tarjeta persuasiva + match-first; CTA = Vista Rápida / Ver Ficha (NUNCA Apartar — discovery).
import React from 'react';
import { Link } from 'react-router-dom';
import { tc } from '../../lib/titleCase';
import { sendBuyerSignal } from '../../lib/buyerSignal';  // captura granular: cada click de tarjeta → superadmin

const colSlug = (d) => String(d.colonia_id || d.colonia || '').toLowerCase() || undefined;

const HEAD = "'Outfit',sans-serif";
const GRAD = 'linear-gradient(90deg,#6366F1,#EC4899)';
const fmtM = (n) => (n == null ? '' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n).toLocaleString('es-MX')}`));
const range = (r, suf = '') => (Array.isArray(r) && r.length ? (r[0] === r[1] ? `${r[0]}${suf}` : `${r[0]}–${r[1]}${suf}`) : null);
const AMEN = { roof: 'Roof Garden', gym: 'Gym', alberca: 'Alberca', pet: 'Pet Friendly', cowork: 'Coworking', bicicletas: 'Bici', seguridad: 'Seguridad', jardines: 'Áreas Verdes' };

// Señal de PERSUASIÓN desde el dato que ya trae el item (sin llamada extra).
export function signal(d) {
  if (typeof d.precio_vs_zona_pct === 'number' && d.precio_vs_zona_pct <= -3) return `${Math.abs(Math.round(d.precio_vs_zona_pct))}% bajo el precio de la zona`;
  if (d.stage === 'preventa') return 'Preventa · precio de hoy';
  if (typeof d.plusvalia_zona === 'number' && d.plusvalia_zona >= 1) return `Plusvalía de zona +${d.plusvalia_zona.toFixed(1)}%`;
  if (d.units_available != null && d.units_available > 0 && d.units_available <= 5) return `Solo quedan ${d.units_available} unidades`;
  if (d.verified) return 'Desarrollo verificado';
  return null;
}

const chip = { background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ctaPrimary = { background: GRAD, border: 'none', color: '#fff', borderRadius: 999, padding: '8px 15px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, cursor: 'pointer' };

function ResultCard({ dev, onQuick, compact }) {
  const quick = () => { try { sendBuyerSignal('view', { entity_id: dev.id, colonia: colSlug(dev), value: 'atlax_quickview' }); } catch (_) { /* noop */ } if (onQuick) onQuick(dev); };
  const ficha = () => { try { sendBuyerSignal('ficha_view', { entity_id: dev.id, colonia: colSlug(dev), value: 'atlax' }); } catch (_) { /* noop */ } };
  const img = (dev.photos || [])[0];
  const specs = [range(dev.bedrooms_range, ' rec'), range(dev.bathrooms_range, ' baños'), range(dev.m2_range, ' m²')].filter(Boolean).join(' · ');
  const sig = signal(dev);
  const falta = dev.match_falta || [];
  const isExact = falta.length === 0 && dev.match_total > 0;
  const amen = (dev.amenities || []).map((a) => AMEN[a] || tc(String(a))).slice(0, 3);
  return (
    <div style={{ border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <button onClick={quick} style={{ position: 'relative', border: 'none', padding: 0, cursor: 'pointer', background: 'var(--surface-card)', display: 'block' }}>
        <div style={{ height: compact ? 120 : 150, background: 'var(--surface-card)' }}>
          {img && <img src={img} alt={dev.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
        {dev.stage === 'preventa' && <span style={{ position: 'absolute', top: 9, left: 9, background: GRAD, color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 10.5, padding: '4px 9px', borderRadius: 999 }}>Preventa</span>}
        {dev.match_total > 0 && <span style={{ position: 'absolute', top: 9, right: 9, fontFamily: HEAD, fontWeight: 800, fontSize: 10.5, padding: '4px 9px', borderRadius: 999, background: isExact ? 'rgba(16,185,129,0.92)' : 'rgba(224,163,62,0.94)', color: '#fff' }}>{isExact ? 'Cumple Todo' : `Cumple ${dev.match_met}/${dev.match_total}`}</span>}
      </button>
      <div style={{ padding: '11px 13px 4px' }}>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: compact ? 14 : 15, color: 'var(--cream)', lineHeight: 1.2 }}>{dev.name}</div>
        <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{tc(dev.colonia || '')}{dev.alcaldia ? ` · ${tc(dev.alcaldia)}` : ''}</div>
        <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: compact ? 15 : 16, color: 'var(--theme)', marginTop: 6 }}>{dev.price_from_display || fmtM(dev.price_from)}</div>
        {specs && <div style={{ fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>{specs}</div>}
        {!compact && amen.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>{amen.join(' · ')}</div>}
        {sig && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 9px', borderRadius: 8, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.26)', fontSize: 11.5, fontWeight: 700, color: '#0F9D6E' }}>◆ {sig}</div>}
        {falta.length > 0 && <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--cream-2)' }}>Le falta: <b style={{ color: '#B9822E' }}>{falta.map((x) => tc(x)).join(', ')}</b></div>}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', gap: 7, padding: '10px 13px 13px' }}>
        <button onClick={quick} style={{ flex: 1, cursor: 'pointer', background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--theme)', borderRadius: 9, padding: '8px', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700 }}>Vista Rápida</button>
        <Link to={`/desarrollo/${dev.id}?from=atlax`} onClick={ficha} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', background: 'var(--bg-2)', border: '1px solid var(--card-border)', color: 'var(--cream)', borderRadius: 9, padding: '8px', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700 }}>Ver Ficha →</Link>
      </div>
    </div>
  );
}

// En la burbuja (compact) las tarjetas van a 1 COLUMNA full-width — así no se corta la info (feedback founder).
const Grid = ({ children, compact }) => <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(216px, 1fr))', gap: compact ? 10 : 12 }}>{children}</div>;
const SectionLabel = ({ children, hint }) => (
  <div style={{ marginTop: 18, marginBottom: 10 }}>
    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{children}</span>
    {hint && <span style={{ fontSize: 12, color: 'var(--cream-3)', marginLeft: 8 }}>{hint}</span>}
  </div>
);

const TIERS = [
  { lo: 1, hi: 1, title: 'Casi Perfectas', sub: 'solo les falta un detalle' },
  { lo: 2, hi: 2, title: 'Muy Buenas', sub: 'les faltan dos cosas' },
  { lo: 3, hi: 99, title: 'Cercanas', sub: 'les faltan algunas' },
];

export default function AtlaxResults({ r, onQuick, onRefine, onAdvisor, compact }) {
  if (!r) return null;
  const exact = r.exact || [], casi = r.casi || [], cross = r.crossZone || [];
  const flat = [...exact, ...casi, ...cross];  // set completo → la vista rápida navega entre TODOS sin cerrar
  const quickWith = (d) => onQuick && onQuick(d, flat);
  const nada = exact.length === 0 && casi.length === 0 && cross.length === 0 && !r.pending;
  return (
    <div>
      {r.zonaNoDisp && (
        <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.18)', fontSize: 13, color: 'var(--cream-2)', marginBottom: 14 }}>
          Todavía no cubrimos <b style={{ color: 'var(--cream)' }}>{tc(r.zonaNoDisp)}</b> (estamos en CDMX), pero mira lo más cercano.
          {r.zonaNoDispSlug && <> <Link to={`/zona/${r.zonaNoDispSlug}`} style={{ color: 'var(--theme)', fontWeight: 700, textDecoration: 'none' }}>Conoce {tc(r.zonaNoDisp)} →</Link></>}
        </div>
      )}

      {exact.length > 0 && (<><SectionLabel hint={exact.length === 1 ? '1 encaja con lo que buscas' : `${exact.length} encajan con lo que buscas`}>Para Ti</SectionLabel><Grid compact={compact}>{exact.map((d) => <ResultCard key={d.id} dev={d} onQuick={quickWith} compact={compact} />)}</Grid></>)}

      {casi.length > 0 && TIERS.map((t) => {
        const grp = casi.filter((d) => { const n = (d.match_falta || []).length; return n >= t.lo && n <= t.hi; });
        if (!grp.length) return null;
        return (
          <div key={t.title}>
            <SectionLabel hint={`${t.sub} (${grp.length})`}>{exact.length ? t.title : `Se Acercan Mucho · ${t.title}`}</SectionLabel>
            <Grid compact={compact}>{grp.map((d) => <ResultCard key={d.id} dev={d} onQuick={quickWith} compact={compact} />)}</Grid>
          </div>
        );
      })}

      {cross.length > 0 && (
        <><SectionLabel hint={r.crossRelax === 'amplio' ? 'más opciones que se acercan a lo que pides' : 'tu presupuesto rinde más aquí'}>{r.crossRelax === 'esquema' ? 'Con Otro Esquema, en Otras Colonias' : r.crossRelax === 'amplio' ? 'También Te Pueden Servir · Otras Colonias' : 'Tu Presupuesto Rinde Más en Otras Colonias'}</SectionLabel>
          <Grid compact={compact}>{cross.map((d) => <ResultCard key={d.id} dev={d} onQuick={quickWith} compact={compact} />)}</Grid></>
      )}

      {nada && (
        <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--card-border)' }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginBottom: 4 }}>No vi algo con TODOS esos requisitos — pero no te vayas.</div>
          <div style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.5, marginBottom: 13 }}>Ajustemos un poco y seguro te encuentro algo. ¿Por dónde le movemos?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => onRefine && onRefine('con un poco más de presupuesto')} style={chip}>Subir el Presupuesto</button>
            <button onClick={() => onRefine && onRefine('ábreme a otras colonias cercanas')} style={chip}>Abrir a Otras Colonias</button>
            <button onClick={() => onRefine && onRefine('sin tantas amenidades')} style={chip}>Quitar Amenidades</button>
            <button onClick={() => onAdvisor && onAdvisor()} style={ctaPrimary}>Que un Asesor Me Ayude</button>
          </div>
        </div>
      )}
    </div>
  );
}
