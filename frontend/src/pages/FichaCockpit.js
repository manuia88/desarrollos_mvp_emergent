/**
 * FichaCockpit — PROTOTIPO V3 del rediseño UX (preview con /desarrollo/:id?v3=1). NO toca la ficha actual.
 *
 * Idea madre (lo que pidió el founder): dejar de ser un scroll infinito que apila TODO → enfocar UNA cosa a la vez.
 * Shell tipo app: header compacto pegajoso + tabs (El proyecto · Tu unidad · Tu dinero · Confianza) + sidebar fijo
 * (precio + acciones + asesor). El corazón es la pestaña "Tu unidad": al elegir, un COCKPIT enfocado (no se apila).
 * Reusa TODA la data (mismos fetches) y TODAS las secciones existentes (cero motor nuevo, cero dato inventado).
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LightScope, PublicNav } from '../components/ui';
import { fetchDevelopment } from '../api/marketplace';
import { sendBuyerSignal, visitorId } from '../lib/buyerSignal';
import PhotoGallery from '../components/dev/PhotoGallery';
import { Card, Stat, SERIF, SANS, HEAD } from '../components/ficha/ui';
import { amenInfo } from '../components/ficha/amenIcons';
import SeccionUnidades from '../components/ficha/SeccionUnidades';
import SeccionCalcInversion from '../components/ficha/SeccionCalcInversion';
import SeccionDinero from '../components/ficha/SeccionDinero';   // módulo unificado: ¿rento o compro? · crédito · inversión
import PlanDePago from '../components/ficha/PlanDePago';         // simulador del esquema de pago al dev (apartado/enganche/mensualidades/escritura + gastos)
import SeccionConfianza from '../components/ficha/SeccionConfianza';
import SeccionUbicacion from '../components/ficha/SeccionUbicacion';
import LeadCaptureModal from '../components/ficha/LeadCaptureModal';

const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})/); return m ? `${MES[+m[2] - 1] || ''} ${m[1]}` : s; };
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };
const TABS = [['proyecto', 'El proyecto'], ['unidad', 'Tu unidad'], ['dinero', 'Tu dinero'], ['confianza', 'Confianza']];

function Loading({ msg }) {
  return <LightScope><PublicNav /><div style={{ paddingTop: 170, textAlign: 'center', fontFamily: SANS, color: 'var(--cream-3)' }}>{msg}</div></LightScope>;
}

// Toggle de lente: para qué la quieres. Cambia los números (mensualidad vs TIR) sin reorganizar la página.
function LensToggle({ lens, setLens, invMode, setInvMode }) {
  const pill = (active) => ({ padding: '8px 16px', borderRadius: 9999, border: active ? '1.5px solid var(--theme)' : '1px solid var(--card-border, var(--border))', background: active ? 'rgba(99,102,241,0.08)' : 'transparent', color: active ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, cursor: 'pointer' });
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', fontWeight: 700 }}>¿Para qué la quieres?</span>
      <button onClick={() => setLens('vivir')} style={pill(lens === 'vivir')}>Para vivir</button>
      <button onClick={() => setLens('invertir')} style={pill(lens === 'invertir')}>Para invertir</button>
      {lens === 'invertir' && (
        <span style={{ display: 'inline-flex', gap: 6, marginLeft: 4 }}>
          <button onClick={() => setInvMode('individual')} style={pill(invMode === 'individual')}>Para ti</button>
          <button onClick={() => setInvMode('institucional')} style={pill(invMode === 'institucional')}>Inversión Institucional</button>
        </span>
      )}
    </div>
  );
}

// COCKPIT: la unidad elegida, enfocada. Plano + specs + el número que importa + un solo siguiente paso.
function CockpitCard({ dev, unit, lens, keyNum, hk, kM2, onVerDinero, onAgendar, saved, onToggleSave }) {
  const plano = unit.plano_url || unit.render_url || ((dev.config || {}).planos || {})[unit.prototype] || (dev.photos || [])[0];
  const pm2 = unit.m2_total || unit.m2_privative ? Math.round(unit.price / (unit.m2_total || unit.m2_privative)) : null;
  return (
    <Card style={{ padding: 0, overflow: 'hidden', borderColor: 'var(--theme)', boxShadow: '0 0 0 3px rgba(99,102,241,0.10), 0 16px 40px rgba(16,18,28,0.07)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,150px) minmax(0,1fr)', gap: 0 }}>
        {plano && <div style={{ background: 'var(--surface-card)' }}><img src={plano} alt={`Unidad ${unit.unit_number}`} style={{ width: '100%', height: '100%', minHeight: 150, objectFit: 'cover', display: 'block' }} /></div>}
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>✓ Tu unidad elegida</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>{unit.prototype ? `Tipo ${unit.prototype}` : 'Unidad'} · {unit.unit_number}</span>
            <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{money(unit.price)}</span>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginTop: 4 }}>
            {(unit.m2_total || unit.m2_privative)} m² · {unit.bedrooms} rec · {unit.bathrooms} baños{pm2 ? ` · ${kM2(pm2)}` : ''}{hk.verdict ? ` · ${hk.verdict}` : ''}
          </div>
          {keyNum && (
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: 'var(--theme)' }}>{keyNum.v}</span>
              <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>{keyNum.l}{keyNum.sub ? ` · ${keyNum.sub}` : ''}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14 }}>
            <button onClick={onVerDinero} style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 10px 24px rgba(109,74,255,0.26)' }}>
              {lens === 'invertir' ? '📈 Ver tu dinero a detalle →' : '🏠 Ver tu plan de pago →'}
            </button>
            <button onClick={onToggleSave} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'transparent', color: saved ? '#e0463d' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{saved ? '❤️ Guardada' : '🤍 Guardar'}</button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyHint({ text, onGo }) {
  return (
    <Card style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>{text}</span>
      <button onClick={onGo} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--theme)', background: 'transparent', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Ir a Tu unidad →</button>
    </Card>
  );
}

// Pestaña "El proyecto": contexto que SUMA valor — historia, avance de obra (fases+bitácora), disponibilidad, prototipos,
// el precio desde el lanzamiento, amenidades y el desarrollador. Todo dato real del dev (hide-if-empty).
function TabProyecto({ dev, amen, tipo, beds, m2r, park, nUnits, rng, onVerUnidades }) {
  const cp = dev.construction_progress || {};
  const pct = Math.max(0, Math.min(100, cp.percentage || 0));
  const phases = Array.isArray(cp.phases) ? cp.phases : [];
  const lastLog = (Array.isArray(cp.log) && cp.log[0]) || null;
  const tot = dev.units_total || nUnits || 0;
  const sold = dev.units_sold || 0, resv = dev.units_reserved || 0;
  const avail = dev.units_available != null ? dev.units_available : Math.max(0, tot - sold - resv);
  const protoMap = {};
  (dev.units || []).forEach((u) => { const k = u.prototype || '—'; if (!protoMap[k]) protoMap[k] = { proto: k, n: 0, beds: u.bedrooms, m2: u.m2_total || u.m2_privative, min: Infinity }; protoMap[k].n++; if (u.price) protoMap[k].min = Math.min(protoMap[k].min, u.price); });
  const protos = Object.values(protoMap).sort((a, b) => a.min - b.min);
  const protoName = (p) => (p === 'PH' ? 'Penthouse' : `Tipo ${p}`);
  const ph = Array.isArray(dev.price_history) ? dev.price_history.filter((x) => x && x.price) : [];
  const phUp = ph.length >= 2 ? Math.round((ph[ph.length - 1].price / ph[0].price - 1) * 100) : null;
  const developer = dev.developer || {};
  const h2 = (t) => <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 4 }}>{t}</div>;
  const eyebrow = (t) => <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>{t}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PhotoGallery dev={dev} />

      {/* facts rápidos */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(108px,1fr))' }}>
          {[['Tipo', tipo], ['Recámaras', rng(beds)], ['Superficie', rng(m2r) ? `${rng(m2r)} m²` : null], ['Niveles', dev.max_level], ['Estac.', rng(park)], ['Entrega', fechaCorta(dev.delivery_estimate)], ['Unidades', nUnits]].filter(([, v]) => v != null && v !== '').map(([l, v], i) => (
            <div key={l} style={{ padding: '15px 18px', borderLeft: i ? '1px solid var(--card-border, var(--border))' : 'none' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{v}</div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* la historia */}
      {dev.description && (<div>{h2('La historia')}<p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.65, color: 'var(--cream-2)', margin: '4px 0 0', maxWidth: 760 }}>{dev.description}</p></div>)}

      {/* avance de obra */}
      {(phases.length > 0 || pct > 0) && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {h2('Avance de obra')}
            {cp.status && <span style={{ padding: '4px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.28)', color: '#059669', fontFamily: SANS, fontSize: 11.5, fontWeight: 700 }}>● {cp.status}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 16px' }}>
            <div style={{ flex: 1, height: 9, borderRadius: 9999, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--grad)' }} /></div>
            <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--theme)' }}>{pct}%</span>
            {dev.delivery_estimate && <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)' }}>entrega {fechaCorta(dev.delivery_estimate)}</span>}
          </div>
          {phases.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {phases.map((p) => { const done = pct >= (p.threshold || 0); const active = p.status === 'active'; return (
                <span key={p.key} style={{ flex: '1 1 88px', textAlign: 'center', padding: '8px 6px', borderRadius: 9, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, background: active ? 'rgba(99,102,241,0.10)' : done ? 'rgba(16,185,129,0.08)' : 'var(--surface-card)', border: `1px solid ${active ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, color: active ? 'var(--theme)' : done ? '#059669' : 'var(--cream-3)' }}>{done && !active ? '✓ ' : ''}{p.label}</span>
              ); })}
            </div>
          )}
          {lastLog && <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', marginTop: 14, lineHeight: 1.5 }}><b style={{ color: 'var(--cream)' }}>{lastLog.date}:</b> {lastLog.description}</div>}
        </Card>
      )}

      {/* disponibilidad */}
      {tot > 0 && (
        <Card>
          {h2('Disponibilidad')}
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', margin: '4px 0 14px' }}>{avail} de {tot} disponibles hoy</div>
          <div style={{ display: 'flex', height: 14, borderRadius: 9999, overflow: 'hidden', border: '1px solid var(--card-border, var(--border))' }}>
            {avail > 0 && <div style={{ width: `${100 * avail / tot}%`, background: '#16a34a' }} />}
            {resv > 0 && <div style={{ width: `${100 * resv / tot}%`, background: 'var(--theme)' }} />}
            {sold > 0 && <div style={{ width: `${100 * sold / tot}%`, background: '#c2c6d6' }} />}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)', fontWeight: 600 }}>
            <span style={{ color: '#16a34a' }}>● {avail} disponibles</span><span style={{ color: 'var(--theme)' }}>● {resv} apartadas</span><span style={{ color: 'var(--cream-3)' }}>● {sold} vendidas</span>
          </div>
        </Card>
      )}

      {/* prototipos */}
      {protos.length > 0 && (
        <div>
          {h2('Lo que puedes comprar')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 12 }}>
            {protos.map((p) => (
              <Card key={p.proto} onClick={onVerUnidades} style={{ padding: '16px 18px', cursor: onVerUnidades ? 'pointer' : 'default' }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>{protoName(p.proto)}</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginTop: 4 }}>{p.beds} rec · {p.m2} m² · {p.n} {p.n === 1 ? 'unidad' : 'unidades'}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--theme)', marginTop: 8 }}>desde {money(p.min)}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* el precio desde el lanzamiento */}
      {phUp != null && phUp > 0 && (
        <Card>
          {h2('El precio desde el lanzamiento')}
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', margin: '4px 0 16px' }}>En preventa el precio sube conforme avanza la obra. Entrar antes = mejor precio.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {ph.map((x, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: 'var(--cream-3)', fontSize: 15 }}>→</span>}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: i === ph.length - 1 ? 'var(--theme)' : 'var(--cream-2)' }}>{money(x.price)}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{x.date}</div>
                </div>
              </React.Fragment>
            ))}
            <span style={{ marginLeft: 6, padding: '5px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.10)', color: '#059669', fontFamily: HEAD, fontWeight: 800, fontSize: 13 }}>+{phUp}% desde el lanzamiento</span>
          </div>
        </Card>
      )}

      {/* amenidades */}
      {amen.length > 0 && (
        <div>
          {eyebrow('Amenidades')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {amen.map((a, i) => { const { icon, label } = amenInfo(a); return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{icon} {label}</span>
            ); })}
          </div>
        </div>
      )}

      {/* desarrollador (compacto · el detalle de confianza vive en su tab) */}
      {developer.name && (
        <Card style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `hsl(${developer.logo_hue || 250} 60% 92%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: 21, color: `hsl(${developer.logo_hue || 250} 55% 38%)`, flexShrink: 0 }}>{developer.name[0]}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Desarrollado por</div>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, color: 'var(--cream)' }}>{developer.name}</div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>{[developer.founded_year && `Desde ${developer.founded_year}`, developer.projects_delivered && `${developer.projects_delivered} proyectos entregados`].filter(Boolean).join(' · ') || 'Ve su track record en Confianza'}</div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function FichaCockpit({ user, onLogin }) {
  const { id } = useParams();
  const [dev, setDev] = useState(undefined);
  const [unit, setUnit] = useState(null);
  const [lens, setLens] = useState('invertir');
  const [invMode, setInvMode] = useState('individual');
  const [fundIds, setFundIds] = useState([]);
  const [tab, setTab] = useState('unidad');
  const [hk, setHk] = useState({});
  const [savedUnits, setSavedUnits] = useState(() => new Set());
  const [leadModal, setLeadModal] = useState(null);
  const HK_API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => { document.body.classList.add('public-light'); return () => document.body.classList.remove('public-light'); }, []);
  useEffect(() => { const onLead = (e) => setLeadModal({ reason: (e && e.detail && e.detail.source) || 'asesor' }); window.addEventListener('dmx:lead', onLead); return () => window.removeEventListener('dmx:lead', onLead); }, []);
  useEffect(() => { let alive = true; fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setDev(null); }); return () => { alive = false; }; }, [id]);

  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true; const col = dev.colonia_id || dev.colonia;
    fetch(`${HK_API}/api/public/buy-signal/${dev.id}`).then((r) => r.json()).then((d) => { if (alive && d) setHk((h) => ({ ...h, verdict: d.veredicto && d.veredicto.titulo, pm2: d.precio_contexto && d.precio_contexto.este_pm2 })); }).catch(() => {});
    if (col) fetch(`${HK_API}/api/zona/${encodeURIComponent(col)}/lugares`).then((r) => r.json()).then((d) => { if (alive && d && d.metro) setHk((h) => ({ ...h, metroMin: d.metro.min_caminando, metroNom: d.metro.nombre })); }).catch(() => {});
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!unit || !dev) return undefined;
    let alive = true; const col = dev.colonia_id || dev.colonia, m2 = unit.m2_total || unit.m2_privative || 80;
    fetch(`${HK_API}/api/public/ownership/${dev.id}?price=${unit.price}&m2=${m2}&enganche_pct=0.20&years=20`).then((r) => r.json()).then((d) => { if (alive && d && d.supuestos) setHk((h) => ({ ...h, mensual: d.supuestos.pago_mensual })); }).catch(() => {});
    fetch(`${HK_API}/api/inversion-v4/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor_propiedad: unit.price, enganche_pct: 0.20, plazo_anios: 20, horizonte_anios: 10, renta_mensual: Math.round(unit.price * 0.0045), colonia: col }) }).then((r) => r.json()).then((d) => { if (alive && d && d.ok) setHk((h) => ({ ...h, tir: d.tir_pct, cetes: d.cetes_1a_pct, plusvalia: d.apreciacion_return_pct })); }).catch(() => {});
    return () => { alive = false; };
  }, [unit && unit.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true;
    fetch(`${HK_API}/api/buyer/favoritos?visitor_id=${encodeURIComponent(visitorId())}`).then((r) => r.json()).then((d) => { if (!alive || !d || !Array.isArray(d.favoritos)) return; const card = d.favoritos.find((f) => f.id === dev.id || f.dev_id === dev.id); if (card && Array.isArray(card.unidades_guardadas)) setSavedUnits(new Set(card.unidades_guardadas)); }).catch(() => {});
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (dev === undefined) return <Loading msg="Cargando…" />;
  if (!dev) return <Loading msg="No encontramos este desarrollo." />;

  const cfg = dev.config || {};
  const beds = dev.bedrooms_range || [], m2r = dev.m2_range || [], park = dev.parking_range || [];
  const rng = (a) => (a.length ? (a[0] === a[1] ? `${a[0]}` : `${a[0]}–${a[1]}`) : null);
  const nUnits = dev.total_units || (dev.units ? dev.units.length : null);
  const amen = Array.isArray(cfg.amenidades) && cfg.amenidades.length ? cfg.amenidades : (Array.isArray(dev.amenities) ? dev.amenities : []);
  const tipoMap = { departamento: 'Departamento', casa: 'Casa', loft: 'Loft', ph: 'Penthouse', estudio: 'Estudio' };
  const tipo = tipoMap[dev.property_type] || (dev.property_type ? dev.property_type[0].toUpperCase() + dev.property_type.slice(1) : null);
  const multi = lens === 'invertir' && invMode === 'institucional';
  const fundUnits = (dev.units || []).filter((u) => u.status === 'disponible' && fundIds.includes(u.id));
  const toggleFund = (id) => setFundIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const kM2 = (n) => (n != null ? `$${Math.round(n / 1000).toLocaleString('es-MX')}k/m²` : null);
  const lensLabel = lens === 'invertir' ? `Invertir · ${invMode === 'institucional' ? 'Institucional' : 'Para ti'}` : lens === 'vivir' ? 'Para vivir' : null;

  const pickUnit = (u) => { setUnit(u); if (u && u.unit_number) { try { sendBuyerSignal('unit_view', { entity_id: dev.id, unit_number: u.unit_number, colonia: dev.colonia }); } catch (e) { /* noop */ } } };
  const goTab = (t) => { setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const goTo = (anchor) => { if (anchor === 'panorama' || anchor === 'inversion') goTab('dinero'); };
  const askAtlax = () => { try { sendBuyerSignal('lead', { entity_id: dev.id, unit_number: unit && unit.unit_number, colonia: dev.colonia, value: 'atlax' }); } catch (e) { /* noop */ } window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, devName: dev.name, colonia: dev.colonia, unit: unit && unit.unit_number } })); };
  const agendar = () => { try { sendBuyerSignal('intent', { entity_id: dev.id, unit_number: unit && unit.unit_number, colonia: dev.colonia, value: 'agendar' }); } catch (e) { /* noop */ } setLeadModal({ reason: 'agendar' }); };
  const toggleSaveUnit = () => { if (!unit || !unit.unit_number) return; const u = unit.unit_number; const on = !savedUnits.has(u); try { sendBuyerSignal(on ? 'unit_save' : 'unit_unsave', { entity_id: dev.id, unit_number: u, colonia: dev.colonia_id || dev.colonia }); } catch (e) { /* noop */ } setSavedUnits((s) => { const n = new Set(s); if (on) n.add(u); else n.delete(u); return n; }); };

  const keyNum = lens === 'invertir'
    ? (hk.tir != null ? { v: `${hk.tir.toFixed(1)}%`, l: 'Rendimiento (TIR)', sub: hk.cetes != null ? (hk.tir > hk.cetes ? 'le gana a CETES' : 'debajo de CETES') : null } : null)
    : (hk.mensual ? { v: `~${money(hk.mensual)}`, l: 'Tu mensualidad', sub: '20% enganche · 20 años' } : null);

  const badgeV = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: '#059669', fontFamily: SANS, fontSize: 11, fontWeight: 700 };
  const badgeS = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', color: 'var(--theme)', fontFamily: SANS, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const sideBtn = (grad) => ({ width: '100%', padding: '12px 14px', borderRadius: 12, border: grad ? 'none' : '1px solid var(--card-border, var(--border))', background: grad ? 'var(--grad)' : 'transparent', color: grad ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', marginTop: 9, boxShadow: grad ? '0 10px 24px rgba(109,74,255,0.24)' : 'none' });

  return (
    <LightScope>
      <PublicNav />
      <a href={`/desarrollo/${id}`} title="Volver al diseño actual" style={{ position: 'fixed', left: 14, bottom: 14, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9999, background: 'var(--cream)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 12.5, textDecoration: 'none', boxShadow: '0 8px 22px rgba(16,18,28,0.28)' }}>← Diseño actual</a>
      <main style={{ paddingTop: 64 }}>
        {/* ── HEADER COMPACTO + TABS (pegajoso) ── */}
        <div style={{ position: 'sticky', top: 56, zIndex: 30, background: 'var(--surface, #faf9f7)', borderBottom: '1px solid var(--card-border, var(--border))', backdropFilter: 'saturate(1.2) blur(6px)' }}>
          <div style={{ maxWidth: 1320, width: '94%', margin: '0 auto', padding: '11px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>{dev.colonia} · {dev.alcaldia} · CDMX</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.8vw,30px)', color: 'var(--cream)', margin: '1px 0 0', lineHeight: 1.05 }}>{dev.name}</h1>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--theme)' }}>{unit ? money(unit.price) : (dev.price_from_display || money(dev.price_from))}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                {dev.verified && <span style={badgeV}>✓ Verificado</span>}
                <span style={badgeS}>{STAGE[dev.stage] || dev.stage}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 11, overflowX: 'auto' }}>
              {TABS.map(([k, label]) => (
                <button key={k} data-testid={`tab-${k}`} onClick={() => goTab(k)} style={{ padding: '10px 18px', borderRadius: '10px 10px 0 0', border: 'none', borderBottom: tab === k ? '2.5px solid var(--theme)' : '2.5px solid transparent', background: 'transparent', color: tab === k ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── BODY: contenido enfocado + sidebar fijo ── */}
        <div className="dmx-cockpit-grid" style={{ maxWidth: 1320, width: '94%', margin: '0 auto', padding: '24px 0 90px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 28, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            {tab === 'proyecto' && <TabProyecto dev={dev} amen={amen} tipo={tipo} beds={beds} m2r={m2r} park={park} nUnits={nUnits} rng={rng} onVerUnidades={() => goTab('unidad')} />}

            {tab === 'unidad' && (
              <>
                <LensToggle lens={lens} setLens={setLens} invMode={invMode} setInvMode={setInvMode} />
                {unit && <div style={{ marginBottom: 20 }}><CockpitCard dev={dev} unit={unit} lens={lens} keyNum={keyNum} hk={hk} kM2={kM2} onVerDinero={() => goTab('dinero')} onAgendar={agendar} saved={savedUnits.has(unit.unit_number)} onToggleSave={toggleSaveUnit} /></div>}
                <SeccionUnidades dev={dev} selectedUnit={unit} onSelectUnit={pickUnit} onGoTo={goTo} multi={multi} selectedIds={fundIds} onToggleUnit={toggleFund} plusvalia={hk.plusvalia} />
              </>
            )}

            {tab === 'dinero' && (
              <>
                <LensToggle lens={lens} setLens={setLens} invMode={invMode} setInvMode={setInvMode} />
                {!unit && !multi && <EmptyHint text="Elige una unidad en “Tu unidad” para ver tus números exactos." onGo={() => goTab('unidad')} />}
                {/* ① CÓMO PAGAS: el esquema de pago al desarrollador (apartado/enganche/mensualidades/escritura + gastos) */}
                <PlanDePago dev={dev} unit={multi ? null : unit} />
                {/* ② TU CRÉDITO + RENDIMIENTO a fondo — la calc ya trae el simulador de crédito (no se duplica) */}
                {lens === 'invertir' && (unit || multi) && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>📊 Tu crédito y rendimiento a fondo</div>
                    <SeccionCalcInversion dev={dev} unit={unit} mode={invMode} units={fundUnits} onGoTo={goTo} />
                  </div>
                )}
                {lens === 'vivir' && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>🏦 Tu crédito y rentar-vs-comprar</div>
                    <SeccionDinero dev={dev} unit={unit} intent="vivir" defaultTab="credito" />
                  </div>
                )}
              </>
            )}

            {tab === 'confianza' && (<><SeccionConfianza dev={dev} /><div style={{ marginTop: 22 }}><SeccionUbicacion dev={dev} /></div></>)}
          </div>

          {/* SIDEBAR fijo: precio + número clave + acciones + asesor */}
          <aside className="dmx-cockpit-side" style={{ position: 'sticky', top: 130 }}>
            <Card style={{ padding: '18px 18px' }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{unit ? `Unidad ${unit.unit_number}` : 'Desde'}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '2px 0 2px' }}>{money(unit ? unit.price : dev.price_from)}</div>
              {unit && keyNum && <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginBottom: 4 }}>{keyNum.l}: <b style={{ color: 'var(--theme)' }}>{keyNum.v}</b></div>}
              <button onClick={agendar} style={sideBtn(true)}>📅 Agendar visita</button>
              <button onClick={askAtlax} style={sideBtn(false)}>✨ Pregúntale a Atlax</button>
              {unit && <button onClick={toggleSaveUnit} style={sideBtn(false)}>{savedUnits.has(unit.unit_number) ? '❤️ Guardada' : `🤍 Guardar la ${unit.unit_number}`}</button>}
              <div style={{ fontFamily: SANS, fontSize: 11, color: 'var(--cream-3)', marginTop: 11, textAlign: 'center' }}>Datos reales, sin presión. Tu asesor recibe esto tal cual.</div>
            </Card>
          </aside>
        </div>
      </main>
      <style>{`@media (max-width: 920px){ .dmx-cockpit-grid{ grid-template-columns: minmax(0,1fr) !important; } .dmx-cockpit-side{ position: static !important; } }`}</style>
      {leadModal && <LeadCaptureModal dev={dev} unit={unit} lensLabel={lensLabel} keyAns={keyNum && keyNum.v} reason={leadModal.reason} onClose={() => setLeadModal(null)} />}
    </LightScope>
  );
}
