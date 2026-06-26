/**
 * FichaDesarrollo — REBUILD limpio desde cero (preview con /desarrollo/:id?v2=1). No toca la ficha actual.
 * Sistema visual ÚNICO (components/ficha/ui). Estructura del blueprint maestro. Esqueleto: hero + nav de anclas + 2 columnas
 * + riel de decisión. Las secciones se van llenando una por una (reusando motores existentes).
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LightScope, PublicNav } from '../components/ui';
import { fetchDevelopment } from '../api/marketplace';
import PhotoGallery from '../components/dev/PhotoGallery';
import { MapPin } from '../components/icons';
import { Section, Card, Stat, Modulo, BtnPrimary, BtnGhost, SERIF, SANS, HEAD } from '../components/ficha/ui';
import { amenInfo } from '../components/ficha/amenIcons';
import SeccionValor from '../components/ficha/SeccionValor';     // UI NUEVA (de cero) — reusa el motor buy-signal, NO el componente viejo
import SeccionUnidades from '../components/ficha/SeccionUnidades'; // UI NUEVA (de cero) — solo dato real de dev.units
import SeccionDinero from '../components/ficha/SeccionDinero';     // UI NUEVA (de cero) — módulo unificado, reusa ownership+mortgage
import SeccionLente from '../components/ficha/SeccionLente';       // UI NUEVA (de cero) — el lente, hechos reales del dev
import SeccionUbicacion from '../components/ficha/SeccionUbicacion'; // UI NUEVA (de cero) — lugares Google + vida OSM
import SeccionConfianza from '../components/ficha/SeccionConfianza'; // UI NUEVA (de cero) — dev + sellos + riesgos honestos
import SeccionPanorama from '../components/ficha/SeccionPanorama';   // WIZARD vivir (de zona) re-skineado + scoped a la unidad
import SeccionCalcInversion from '../components/ficha/SeccionCalcInversion'; // calculadora REAL de zona (InversionV4) traída a la ficha

const ANCLAS = [
  ['proyecto', 'El proyecto'], ['lente', '¿Para qué?'], ['unidades', 'Unidades'], ['panorama', 'Tu panorama'], ['confianza', 'Confianza'],
];
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})/); return m ? `${MES[+m[2] - 1] || ''} ${m[1]}` : s; };
const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX')}` : '—');

function Loading({ msg }) {
  return <LightScope><PublicNav /><div style={{ paddingTop: 170, textAlign: 'center', fontFamily: SANS, color: 'var(--cream-3)' }}>{msg}</div></LightScope>;
}


export default function FichaDesarrollo({ user, onLogin }) {
  const { id } = useParams();
  const [dev, setDev] = useState(undefined);
  const [unit, setUnit] = useState(null);   // unidad elegida → alimenta riel + el análisis del lente (granularidad por unidad)
  const [lens, setLens] = useState(null);   // EL LENTE: organiza la página (vivir | invertir) · null = aún no elige (paso 1)
  const [invMode, setInvMode] = useState('individual'); // invertir: 'individual' (para ti) | 'institucional' (fondo)
  const [fundIds, setFundIds] = useState([]); // institucional: unidades elegidas (multi)
  const [hk, setHk] = useState({});         // ganchos VIVOS de cada módulo (la respuesta con tu unidad, sin abrir)

  useEffect(() => { document.body.classList.add('public-light'); return () => document.body.classList.remove('public-light'); }, []);
  useEffect(() => {
    let alive = true;
    fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setDev(null); });
    return () => { alive = false; };
  }, [id]);

  // ── GANCHOS VIVOS (upgrade #1): la respuesta real ya visible aunque el módulo esté cerrado ──
  const HK_API = process.env.REACT_APP_BACKEND_URL;
  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    let alive = true;
    const col = dev.colonia_id || dev.colonia;
    fetch(`${HK_API}/api/public/buy-signal/${dev.id}`).then((r) => r.json()).then((d) => { if (alive && d) setHk((h) => ({ ...h, verdict: d.veredicto && d.veredicto.titulo, pm2: d.precio_contexto && d.precio_contexto.este_pm2 })); }).catch(() => {});
    if (col) fetch(`${HK_API}/api/zona/${encodeURIComponent(col)}/lugares`).then((r) => r.json()).then((d) => { if (alive && d && d.metro) setHk((h) => ({ ...h, metroMin: d.metro.min_caminando, metroNom: d.metro.nombre })); }).catch(() => {});
    return () => { alive = false; };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!unit) return undefined;
    let alive = true;
    const col = dev.colonia_id || dev.colonia, m2 = unit.m2_total || unit.m2_privative || 80;
    fetch(`${HK_API}/api/public/ownership/${dev.id}?price=${unit.price}&m2=${m2}&enganche_pct=0.20&years=20`).then((r) => r.json()).then((d) => { if (alive && d && d.supuestos) setHk((h) => ({ ...h, mensual: d.supuestos.pago_mensual })); }).catch(() => {});
    fetch(`${HK_API}/api/inversion-v4/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor_propiedad: unit.price, enganche_pct: 0.20, plazo_anios: 20, horizonte_anios: 10, renta_mensual: Math.round(unit.price * 0.0045), colonia: col }) }).then((r) => r.json()).then((d) => { if (alive && d && d.ok) setHk((h) => ({ ...h, tir: d.tir_pct, cetes: d.cetes_1a_pct })); }).catch(() => {});
    return () => { alive = false; };
  }, [unit && unit.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (dev === undefined) return <Loading msg="Cargando…" />;
  if (!dev) return <Loading msg="No encontramos este desarrollo." />;

  const cfg = dev.config || {};
  const beds = dev.bedrooms_range || [], m2 = dev.m2_range || [], park = dev.parking_range || [];
  const rng = (a) => (a.length ? (a[0] === a[1] ? `${a[0]}` : `${a[0]}–${a[1]}`) : null);
  const nUnits = dev.total_units || (dev.units ? dev.units.length : null);
  const amen = Array.isArray(cfg.amenidades) && cfg.amenidades.length ? cfg.amenidades : (Array.isArray(dev.amenities) ? dev.amenities : []);
  const servicios = cfg.servicios && typeof cfg.servicios === 'object' ? Object.entries(cfg.servicios).filter(([, v]) => v) : [];
  const tipoMap = { departamento: 'Departamento', casa: 'Casa', loft: 'Loft', ph: 'Penthouse', estudio: 'Estudio' };
  const tipo = tipoMap[dev.property_type] || (dev.property_type ? dev.property_type[0].toUpperCase() + dev.property_type.slice(1) : null);
  const pagos = [...(cfg.formas_pago ? ['Preventa con mensualidades', 'Contado con descuento'] : []), 'Crédito hipotecario'];

  const goTo = (anchor) => { const el = document.querySelector(`[data-testid="${anchor}"]`); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' }); };
  // Riel → abre Atlax con contexto (dev + unidad elegida). El cierre-de-ciclo completo (lead al asesor) viene después.
  const askAtlax = () => window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, devName: dev.name, colonia: dev.colonia, unit: unit && unit.unit_number } }));
  const agendar = () => window.dispatchEvent(new CustomEvent('atlax:open', { detail: { query: `Quiero agendar una visita a ${dev.name}${unit ? ` (unidad ${unit.unit_number})` : ''}.` } }));

  // flujo invertir·institucional: eliges varias unidades en el Paso 2
  const multi = lens === 'invertir' && invMode === 'institucional';
  const fundUnits = (dev.units || []).filter((u) => u.status === 'disponible' && fundIds.includes(u.id));
  const toggleFund = (id) => setFundIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const needUnit = multi ? fundUnits.length === 0 : !unit;
  // ganchos vivos (texto)
  const kM2 = (n) => (n != null ? `$${Math.round(n / 1000).toLocaleString('es-MX')}k/m²` : null);
  const hookValor = hk.verdict ? `${hk.verdict}${hk.pm2 ? ` · ${kM2(hk.pm2)}` : ''}` : 'Precio justo, plusvalía y demanda real';
  const hookInv = hk.tir != null ? `Rinde ${hk.tir.toFixed(1)}%${hk.cetes != null ? (hk.tir > hk.cetes ? ' · le gana a CETES' : ' · por debajo de CETES') : ''}` : 'TIR, cap rate, escenarios y Monte Carlo';
  const hookPago = hk.mensual ? `Tu mensualidad ~${money(hk.mensual)} · crédito, plan y rentar-vs-comprar` : 'Crédito multi-banco, plan del dev y rentar-vs-comprar';
  const hookZona = hk.metroMin ? `Metro ${hk.metroNom} a ${hk.metroMin} min · mapa, lugares y qué tan caminable` : 'Mapa, mejores lugares y qué tan caminable';

  return (
    <LightScope>
      <PublicNav />
      <main style={{ paddingTop: 78 }}>
        <div style={{ maxWidth: 1600, width: '94%', margin: '0 auto', padding: '22px 0 90px' }}>

          {/* ══════ HERO ══════ */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 8 }}>
              {dev.colonia} · {dev.alcaldia} · CDMX
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
              <h1 data-testid="ficha-h1" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(36px,5.4vw,64px)', letterSpacing: '-0.01em', color: 'var(--cream)', margin: 0, lineHeight: 1.02 }}>{dev.name}</h1>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                {dev.verified && <span style={{ padding: '4px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: '#059669', fontFamily: SANS, fontSize: 11, fontWeight: 700 }}>✓ Verificado</span>}
                <span style={{ padding: '4px 12px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', color: 'var(--theme)', fontFamily: SANS, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{STAGE[dev.stage] || dev.stage}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--cream-3)', marginTop: 10, fontFamily: SANS, fontSize: 14 }}>
              <MapPin size={14} /> {dev.address_full}
            </div>
          </div>

          <PhotoGallery dev={dev} />

          {/* precio editorial bajo la galería (nolab-style) */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginTop: 20 }}>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Precio desde</div>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 'clamp(30px,4vw,48px)', letterSpacing: '-0.03em', color: 'var(--cream)', lineHeight: 1 }}>
              {dev.price_from_display || money(dev.price_from)}
            </div>
            {dev.price_to && dev.price_to !== dev.price_from && <div style={{ fontFamily: SANS, fontSize: 15, color: 'var(--cream-2)' }}>hasta {dev.price_to_display || money(dev.price_to)}</div>}
          </div>

          {/* ══════ NAV DE ANCLAS (sticky) ══════ */}
          <nav data-testid="anchor-nav" style={{ position: 'sticky', top: 58, zIndex: 20, marginTop: 20, background: 'var(--bg, #FAFAFB)', borderBottom: '1px solid var(--card-border, var(--border))' }}>
            <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
              {ANCLAS.map(([a, l]) => (
                <button key={a} onClick={() => goTo(a)} style={{ padding: '14px 15px', background: 'transparent', border: 'none', color: 'var(--cream-2)', fontFamily: HEAD, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cream)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cream-2)')}>{l}</button>
              ))}
            </div>
          </nav>

          {/* ══════ 2 COLUMNAS ══════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 44, alignItems: 'start' }}>
            {/* ——— Columna izquierda: contenido ——— */}
            <div style={{ minWidth: 0 }}>

              {/* 1 · LO ESENCIAL (real) */}
              <Section id="proyecto" eyebrow="Lo esencial" title="Lo que tienes que saber">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
                  <Card style={{ padding: '16px 18px' }}><Stat sm value={tipo} label="Tipo" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat sm value={rng(beds)} label="Recámaras" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat sm value={rng(m2) ? `${rng(m2)} m²` : null} label="Superficie" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat sm value={rng(park)} label="Estac." /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat sm value={fechaCorta(dev.delivery_estimate)} label="Entrega" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat sm value={nUnits} label="Unidades" /></Card>
                </div>
                {amen.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Amenidades del desarrollo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 10 }}>
                      {amen.map((a, i) => { const { icon, label } = amenInfo(a); return (
                        <div key={i} className="dmx-card" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
                          <span style={{ fontSize: 21, lineHeight: 1 }}>{icon}</span>
                          <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: 'var(--cream)' }}>{label}</span>
                        </div>
                      ); })}
                    </div>
                    {servicios.length > 0 && (
                      <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 12 }}>
                        Servicios: {servicios.map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Cómo lo puedes pagar</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{pagos.map((p, i) => <span key={i} style={{ padding: '9px 14px', borderRadius: 11, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: '#059669' }}>✓ {p}</span>)}</div>
                </div>
              </Section>

              {/* El proyecto (descripción editorial · real) */}
              {dev.description && (
                <Section eyebrow="El proyecto" title="La historia">
                  <p style={{ fontFamily: SERIF, fontWeight: 500, fontStyle: 'italic', fontSize: 'clamp(17px,1.9vw,21px)', lineHeight: 1.7, color: 'var(--cream-2)', margin: 0, maxWidth: 720, whiteSpace: 'pre-line' }}>{dev.description}</p>
                </Section>
              )}

              {/* ══ PASO 1 · EL LENTE: ¿para qué lo quieres? ══ */}
              <Section id="lente" eyebrow="Paso 1 · ¿Para qué lo quieres?" title="Empieza por aquí">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[['vivir', '🏠', 'Para vivir', 'Estilo de vida, zona y tu pago a la medida'], ['invertir', '📈', 'Para invertir', 'Rendimiento, plusvalía y análisis de fondo']].map(([k, ic, t, d]) => {
                    const a = lens === k;
                    return (
                      <button key={k} onClick={() => setLens(k)} style={{ flex: '1 1 250px', textAlign: 'left', display: 'flex', gap: 13, alignItems: 'center', padding: '16px 18px', borderRadius: 15, border: `2px solid ${a ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: a ? 'rgba(99,102,241,0.06)' : 'var(--surface-card)', cursor: 'pointer', boxShadow: a ? '0 0 0 3px rgba(99,102,241,0.10)' : 'none' }}>
                        <span style={{ fontSize: 28, lineHeight: 1 }}>{ic}</span>
                        <div>
                          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: a ? 'var(--theme)' : 'var(--cream)' }}>{t}</div>
                          <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginTop: 2 }}>{d}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* si elige invertir → aquí mismo Para ti / Institucional */}
                {lens === 'invertir' && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>¿Para ti o institucional?</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {[['individual', '👤 Para ti', 'Compras 1 departamento'], ['institucional', '🏛️ Institucional', 'Un fondo compra 2 o más']].map(([v, l, d]) => {
                        const on = invMode === v;
                        return (
                          <button key={v} onClick={() => { setInvMode(v); }} style={{ textAlign: 'left', padding: '12px 18px', borderRadius: 13, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--theme)' : 'var(--card-border, var(--border))'}`, background: on ? 'rgba(99,102,241,0.07)' : 'var(--surface-card)', color: on ? 'var(--theme)' : 'var(--cream)' }}>
                            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14 }}>{l}</div>
                            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: 'var(--cream-3)', marginTop: 1 }}>{d}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {lens && <div style={{ marginTop: 18 }}><SeccionLente dev={dev} lens={lens} /></div>}
                {!lens && <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 13, color: 'var(--cream-3)' }}>Elige arriba y la ficha se arma para ti, paso a paso.</div>}
              </Section>

              {/* Los pasos 2 y 3 aparecen una vez que eligió el lente (se va descubriendo por pasos) */}
              {lens && (
                <>
                  {/* ══ PASO 2 · ELIGE UNIDAD(ES) ══ */}
                  <Section id="unidades" eyebrow="Paso 2 · Disponibilidad" title={multi ? 'Elige las unidades del fondo' : 'Elige tu unidad'}>
                    <SeccionUnidades dev={dev} selectedUnit={unit} onSelectUnit={setUnit} onGoTo={goTo} multi={multi} selectedIds={fundIds} onToggleUnit={toggleFund} />
                  </Section>

                  {/* ══ PASO 3 · TU PANORAMA · módulos que se descubren al dar click ══ */}
                  <Section id="panorama" eyebrow="Paso 3 · Tu panorama a la medida" title={lens === 'vivir' ? '¿Te queda esta unidad?' : 'Tu inversión, al detalle'}>
                    {needUnit ? (
                      <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)' }}>{multi ? 'Elige una o más unidades arriba para armar el análisis del fondo.' : 'Elige tu unidad arriba para ver tus números exactos.'}</span>
                        <button onClick={() => goTo('unidades')} style={{ padding: '10px 16px', borderRadius: 11, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Elegir ↑</button>
                      </Card>
                    ) : lens === 'vivir' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Modulo forceOpen eyebrow="A tu medida" title="¿Te queda esta unidad?" hook="Responde 5 preguntas y te digo si te alcanza, tu enganche y tu mensualidad">
                          <SeccionPanorama dev={dev} unit={unit} onSelectUnit={setUnit} />
                        </Modulo>
                        <Modulo eyebrow="Tu dinero" title="Cómo lo pagas" hook={hookPago}>
                          <SeccionDinero dev={dev} unit={unit} intent="vivir" />
                        </Modulo>
                        <Modulo eyebrow="El entorno" title="La zona y el estilo de vida" hook={hookZona}>
                          <SeccionUbicacion dev={dev} />
                        </Modulo>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Modulo eyebrow="La inteligencia" title="¿Es buen precio?" hook={hookValor}>
                          <SeccionValor dev={dev} />
                        </Modulo>
                        <Modulo forceOpen eyebrow="Tu inversión" title="Los números de tu inversión" hook={hookInv}>
                          <SeccionCalcInversion dev={dev} unit={unit} mode={invMode} units={fundUnits} onGoTo={goTo} />
                        </Modulo>
                      </div>
                    )}
                  </Section>

                  {/* CONFIANZA — colapsable, común a ambos lentes */}
                  <div data-testid="confianza" id="confianza" style={{ marginTop: 'clamp(44px,5.5vw,68px)', scrollMarginTop: 112 }}>
                    <Modulo eyebrow="Sin letras chiquitas" title="¿Puedes confiar?" hook="Desarrollador y track record · situación legal · riesgos honestos (sísmico, inundación, preventa)">
                      <SeccionConfianza dev={dev} />
                    </Modulo>
                  </div>
                </>
              )}
            </div>

            {/* ——— Riel de decisión (sticky) — refleja la unidad elegida ——— */}
            <div style={{ position: 'sticky', top: 110, alignSelf: 'start' }}>
              <Card>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: unit ? 'var(--theme)' : 'var(--cream-3)' }}>
                  {unit ? `Unidad ${unit.unit_number}` : 'Desde'}
                </div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 32, letterSpacing: '-0.03em', color: 'var(--cream)', margin: '4px 0 2px', lineHeight: 1 }}>{unit ? money(unit.price) : (dev.price_from_display || money(dev.price_from))}</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 16 }}>
                  {unit ? `Piso ${unit.level} · ${unit.m2_total || unit.m2_privative} m²${unit.vista ? ` · ${unit.vista}` : ''}` : `MXN · ${STAGE[dev.stage] || dev.stage} · Entrega ${dev.delivery_estimate}`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <BtnPrimary onClick={agendar}>📅 Agendar visita</BtnPrimary>
                  <BtnGhost onClick={askAtlax}>✨ Hablar con Atlax</BtnGhost>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)', marginTop: 16, lineHeight: 1.5 }}>Te acompañamos con datos reales, sin presión.</div>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </LightScope>
  );
}
