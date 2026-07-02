/**
 * FichaCockpit — PROTOTIPO V3 del rediseño UX (preview con /desarrollo/:id?v3=1). NO toca la ficha actual.
 *
 * Idea madre (lo que pidió el founder): dejar de ser un scroll infinito que apila TODO → enfocar UNA cosa a la vez.
 * Shell tipo app: header compacto pegajoso + tabs (El proyecto · Tu unidad · Tu dinero · Confianza) + sidebar fijo
 * (precio + acciones + asesor). El corazón es la pestaña "Tu unidad": al elegir, un COCKPIT enfocado (no se apila).
 * Reusa TODA la data (mismos fetches) y TODAS las secciones existentes (cero motor nuevo, cero dato inventado).
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { LightScope, PublicNav } from '../components/ui';
import { fetchDevelopment, fetchDevelopments } from '../api/marketplace';
import { sendBuyerSignal, visitorId } from '../lib/buyerSignal';
import PhotoGallery from '../components/dev/PhotoGallery';
import { Card, SERIF, SANS, HEAD } from '../components/ficha/ui';
import { amenInfo } from '../components/ficha/amenIcons';
import SeccionUnidades from '../components/ficha/SeccionUnidades';
import SeccionCalcInversion from '../components/ficha/SeccionCalcInversion';
import SeccionDinero from '../components/ficha/SeccionDinero';   // módulo unificado: ¿rento o compro? · crédito · inversión
import PlanDePago from '../components/ficha/PlanDePago';         // simulador del esquema de pago al dev (apartado/enganche/mensualidades/escritura + gastos)
import SeccionConfianza from '../components/ficha/SeccionConfianza';
import SeccionUbicacion from '../components/ficha/SeccionUbicacion';
import SeccionPanorama from '../components/ficha/SeccionPanorama';   // WIZARD de asequibilidad "¿cuánto puedo pagar?" — filtra/recomienda unidad por presupuesto (scoped a la unidad)
import SeccionLente from '../components/ficha/SeccionLente';         // hechos reales del proyecto vistos por el lente (vivir | invertir)
import LeadCaptureModal from '../components/ficha/LeadCaptureModal';
import AtlaxBubble from '../components/landing/AtlaxBubble';   // asistente IA flotante — consciente de la unidad/lente/sección que ve el cliente
import DevStructuredData from '../components/seo/DevStructuredData';   // GEO: schema RealEstateListing + FAQPage (reconecta el structured data que ya existía)
import { tc } from '../lib/titleCase';   // title case inteligente canónico (respeta CDMX/IE, m², baja de/la/en…)

const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX')}` : '—');
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})/); return m ? `${MES[+m[2] - 1] || ''} ${m[1]}` : s; };
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };
const TABS = [['proyecto', 'El proyecto'], ['unidad', 'Tu unidad'], ['dinero', 'Tu dinero'], ['confianza', 'Confianza']];

function Loading({ msg }) {
  return <LightScope><PublicNav /><div style={{ paddingTop: 170, textAlign: 'center', fontFamily: SANS, color: 'var(--cream-3)' }}>{msg}</div></LightScope>;
}

// V3-SENSOR-01: emite module_open (via signalModule del padre) cuando el contenido del módulo se MONTA. Cero UI, fail-soft.
function ModuleOpen({ name, fire }) {
  useEffect(() => { if (fire && name) fire(name); }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
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
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', letterSpacing: '0.07em' }}>✓ Tu Unidad Elegida</div>
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
              {lens === 'invertir' ? 'Ver tu dinero a detalle →' : 'Ver tu plan de pago →'}
            </button>
            <button onClick={onToggleSave} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--card-border, var(--border))', background: 'transparent', color: saved ? '#e0463d' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{saved ? '♥ Guardada' : 'Guardar'}</button>
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
// Title case inteligente: se unifica al caser canónico tc() (lib/titleCase) — respeta acrónimos (CDMX/IE), m²/números y baja palabras menores.
const titleCase = tc;
// Globitos: explicación sencilla para alguien que no sabe nada de comprar inmuebles.
const TEC_TIP = { Niveles: 'Cuántos pisos tiene la torre.', Elevadores: 'Cuántos elevadores hay. Más elevadores = menos espera.', Cisterna: 'Depósito de agua del edificio. Te da reserva si el suministro de la ciudad falla.', Estructura: 'Cómo está construido. “Antisísmico (NTC-2020)” = cumple la norma sísmica vigente de CDMX.', Estacionamiento: 'Dónde están los cajones. Subterráneo = no ocupan fachada ni vista.', Gas: 'Tipo de gas. Natural = por tubería, más barato y seguro que el de tanque.', Agua: 'De dónde viene el agua. Con cisterna hay reserva propia del edificio.', Energía: 'Suministro de luz. Planta de emergencia = no te quedas a oscuras en apagones.', Internet: 'Conexión. Fibra óptica = internet rápido y estable.' };
const FACT_TIP = { 'Depas por piso': 'Cuántos departamentos comparten cada piso. Menos = más privacidad.', Prototipos: 'Cuántos modelos distintos de departamento hay (por tamaño y distribución).', Niveles: 'Cuántos pisos tiene la torre.' };
const PAGO_TIP = { Apartado: 'Pago pequeño para reservar tu unidad. Luego se descuenta del enganche.', Enganche: 'El primer pago grande, al firmar el contrato. Suele ser 10-30% del precio.', Mensualidades: 'Pagos mensuales durante la construcción.', Escrituración: 'El pago final, al recibir tu depa. Aquí puedes usar crédito hipotecario.' };
function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ cursor: 'help', fontSize: 9.5, fontWeight: 800, color: 'var(--cream-3)', border: '1px solid var(--card-border, var(--border))', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, flexShrink: 0 }}>i</span>
      {open && <span style={{ position: 'absolute', bottom: '165%', left: '50%', transform: 'translateX(-50%)', zIndex: 40, width: 188, padding: '9px 12px', borderRadius: 10, background: '#10121C', color: '#fff', fontFamily: SANS, fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, boxShadow: '0 8px 24px rgba(16,18,28,0.32)', textTransform: 'none', letterSpacing: 0 }}>{text}</span>}
    </span>
  );
}
function TabProyecto({ dev, amen, tipo, beds, m2r, park, nUnits, rng, lens, onVerUnidades, onVerDinero, onVerConfianza }) {
  const cfg = dev.config || {};
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
  const lvls = new Set((dev.units || []).map((u) => u.level).filter((v) => v != null));
  const depasPorPiso = lvls.size ? Math.round(nUnits / lvls.size) : null;
  const ph = Array.isArray(dev.price_history) ? dev.price_history.filter((x) => x && x.price) : [];
  const phUp = ph.length >= 2 ? Math.round((ph[ph.length - 1].price / ph[0].price - 1) * 100) : null;
  const pMin = ph.length ? Math.min(...ph.map((x) => x.price)) : 0;
  const pMax = ph.length ? Math.max(...ph.map((x) => x.price)) : 1;
  const developer = dev.developer || {};
  // OVERLAY-FIRST (#cableado portal→ficha): si el dev publicó servicios en su portal (dev.config), eso manda sobre el seed.
  const serviciosObj = (cfg.servicios && typeof cfg.servicios === 'object' && Object.keys(cfg.servicios).length) ? cfg.servicios : dev.servicios;
  const servicios = serviciosObj && typeof serviciosObj === 'object' ? Object.entries(serviciosObj) : [];
  const tecnica = dev.tecnica && typeof dev.tecnica === 'object' ? Object.entries(dev.tecnica) : [];
  const acabados = Array.isArray(dev.memoria_acabados) ? dev.memoria_acabados : [];
  const creditos = Array.isArray(dev.creditos_aceptados) ? dev.creditos_aceptados : [];
  const [schemes, setSchemes] = useState([]);
  useEffect(() => { let alive = true; fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/payment-schemes/${dev.id}`).then((r) => r.json()).then((d) => { if (alive) setSchemes((d && d.schemes) || []); }).catch(() => {}); return () => { alive = false; }; }, [dev.id]);
  // El dev define el plan de LISTA (el de menor descuento). Mostramos ESE valor exacto, no un rango. (founder)
  const listScheme = schemes.length ? schemes.reduce((a, b) => ((a.descuento_pct || 0) <= (b.descuento_pct || 0) ? a : b), schemes[0]) : null;
  const pctStr = (v) => (v || v === 0 ? `${v}%` : null);
  const STAGE_PCT = listScheme
    ? { Apartado: money(listScheme.apartado_mxn || 0), Enganche: pctStr(listScheme.firma_pct), Mensualidades: pctStr(listScheme.mensualidades_pct), Escrituración: pctStr(listScheme.escritura_pct) }
    : { Apartado: null, Enganche: null, Mensualidades: null, Escrituración: null };
  // (sin emojis · diseño limpio)
  const h2 = (t, tip) => <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}><span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>{titleCase(t)}</span><InfoTip text={tip} /></div>;
  const factCard = (rows) => (
    <Card style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(112px,1fr))' }}>
        {rows.filter(([, v]) => v != null && v !== '').map(([l, v, tip], i) => (
          <div key={l} style={{ padding: '14px 16px', borderLeft: i ? '1px solid var(--card-border, var(--border))' : 'none' }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{v}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}><span style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{l}</span><InfoTip text={tip} /></div>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="dmx-proj" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <PhotoGallery dev={dev} />

      {/* El proyecto visto por TU lente (vivir | invertir): hechos reales del dev a la medida de para qué la quieres */}
      {lens && <SeccionLente dev={dev} lens={lens} />}

      {/* ① LO PRIMERO QUE QUIERE VER — características del depa */}
      <div>
        {h2('Características')}
        {factCard([['Recámaras', rng(beds)], ['Baños', rng(dev.bathrooms_range)], ['Estacionamientos', rng(park)], ['Superficie', rng(m2r) ? `${rng(m2r)} m²` : null], ['Niveles', dev.max_level, FACT_TIP.Niveles], ['Depas por piso', depasPorPiso ? `≈ ${depasPorPiso}` : null, FACT_TIP['Depas por piso']], ['Prototipos', protos.length || null, FACT_TIP.Prototipos], ['Unidades', nUnits]])}
      </div>

      {/* amenidades */}
      {amen.length > 0 && (
        <div>
          {h2('Amenidades')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {amen.map((a, i) => { const { label } = amenInfo(a); return (
              <span key={i} className="dmx-proj-card" style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 14px', borderRadius: 10, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{label}</span>
            ); })}
          </div>
        </div>
      )}

      {/* ubicación */}
      <div>
        {h2('Ubicación')}
        <Card className="dmx-proj-card" onClick={onVerConfianza}
          role={onVerConfianza ? 'button' : undefined} tabIndex={onVerConfianza ? 0 : undefined}
          aria-label={onVerConfianza ? 'Ver mapa, lugares y la zona' : undefined}
          onKeyDown={onVerConfianza ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onVerConfianza(); } } : undefined}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 12, cursor: onVerConfianza ? 'pointer' : 'default' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)' }}>{dev.address_full || dev.street || dev.name}</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginTop: 3 }}>{[dev.colonia, dev.alcaldia, 'CDMX'].filter(Boolean).join(' · ')}</div>
          </div>
          {onVerConfianza && <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, color: 'var(--theme)', whiteSpace: 'nowrap' }}>Mapa, lugares y la zona →</span>}
        </Card>
      </div>

      {/* lo que puedes comprar */}
      {protos.length > 0 && (
        <div>
          {h2('Lo que puedes comprar')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 12 }}>
            {protos.map((p) => (
              <Card key={p.proto} className="dmx-proj-card" onClick={onVerUnidades} style={{ padding: '16px 18px', cursor: onVerUnidades ? 'pointer' : 'default' }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>{protoName(p.proto)}</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginTop: 4 }}>{p.beds} rec · {p.m2} m² · {p.n} {p.n === 1 ? 'unidad' : 'unidades'}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--theme)', marginTop: 8 }}>desde {money(p.min)}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* memoria de acabados (el interior del depa) */}
      {acabados.length > 0 && (
        <div>
          {h2('Memoria de acabados', 'Los materiales y marcas que trae tu departamento por dentro.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(255px,1fr))', gap: 10, marginTop: 12 }}>
            {acabados.map((a, i) => (
              <Card key={i} className="dmx-proj-card" style={{ padding: '13px 16px' }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 12.5, color: 'var(--theme)', letterSpacing: '0.04em' }}>{titleCase(a.area)}</div>
                <div style={{ fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-2)', marginTop: 3, lineHeight: 1.45 }}>{a.detalle}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ficha técnica — CON GLOBITOS para el que no sabe de inmuebles */}
      {(tecnica.length > 0 || servicios.length > 0) && (
        <div>
          {h2('Construcción y servicios', 'Cómo está hecho el edificio y qué servicios trae. Toca la ⓘ de cada punto para una explicación simple.')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 12 }}>
            {[...tecnica, ...servicios].map(([k, v]) => (
              <Card key={k} className="dmx-proj-card" style={{ padding: '13px 15px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>{v}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{k}</span><InfoTip text={TEC_TIP[k]} /></div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* avance de obra */}
      {(phases.length > 0 || pct > 0) && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {h2('Avance de obra', 'En qué etapa va la construcción. La barra y las fases muestran el progreso reportado por el dev.')}
            {cp.status && <span style={{ padding: '4px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.28)', color: '#059669', fontFamily: SANS, fontSize: 11.5, fontWeight: 700 }}>● {cp.status}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 16px' }}>
            <div style={{ flex: 1, height: 9, borderRadius: 9999, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', overflow: 'hidden' }}><div className="dmx-proj-prog" style={{ width: `${pct}%`, height: '100%', background: 'var(--grad)' }} /></div>
            <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--theme)' }}>{pct}%</span>
            {dev.fecha_lanzamiento && <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)' }}>lanzó {fechaCorta(dev.fecha_lanzamiento)}</span>}
            {dev.delivery_estimate && <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-3)' }}>· entrega {fechaCorta(dev.delivery_estimate)}</span>}
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
          {h2('Disponibilidad', 'Cuántas unidades quedan. Verde = libres · morado = apartadas · gris = ya vendidas.')}
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

      {/* formas de pago — conceptos con globitos + créditos */}
      {(schemes.length > 0 || creditos.length > 0) && (
        <div>
          {h2('Formas de pago')}
          <Card style={{ marginTop: 12 }}>
            {schemes.length > 0 && (
              <div style={{ marginBottom: creditos.length ? 16 : 4 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.06em', marginBottom: 9 }}>El Plan Incluye</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['Apartado', 'Enganche', 'Mensualidades', 'Escrituración'].map((name) => (
                    <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{name}{STAGE_PCT[name] ? <b style={{ color: 'var(--theme)', marginLeft: 2 }}>· {STAGE_PCT[name]}</b> : null} <InfoTip text={PAGO_TIP[name]} /></span>
                  ))}
                </div>
              </div>
            )}
            {creditos.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.06em', marginBottom: 9 }}>Créditos que Aceptan</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {creditos.map((c) => (
                    <span key={c} style={{ padding: '9px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', fontFamily: SANS, fontSize: 13, color: '#059669', fontWeight: 700 }}>✓ {c}</span>
                  ))}
                </div>
              </div>
            )}
            {onVerDinero && <button onClick={onVerDinero} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--theme)', fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', padding: 0 }}>Ver tu plan a detalle en Tu dinero →</button>}
          </Card>
        </div>
      )}

      {/* el precio desde el lanzamiento — mini gráfica de barras animada */}
      {phUp != null && phUp > 0 && (
        <Card>
          {h2('El precio desde el lanzamiento', 'En preventa el precio sube conforme avanza la obra. Entrar antes suele salir más barato.')}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(10px,4vw,40px)', height: 132, marginTop: 14, padding: '0 4px' }}>
            {ph.map((x, i) => { const hb = 34 + 74 * ((x.price - pMin) / Math.max(1, pMax - pMin)); const last = i === ph.length - 1; return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 12.5, color: last ? 'var(--theme)' : 'var(--cream-2)', whiteSpace: 'nowrap' }}>{money(x.price)}</div>
                <div className="dmx-proj-bar" style={{ width: '100%', maxWidth: 54, height: hb, borderRadius: '8px 8px 0 0', background: last ? 'var(--grad)' : 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))' }} />
                <div style={{ fontFamily: SANS, fontSize: 11, color: 'var(--cream-3)', textAlign: 'center' }}>{x.date}</div>
              </div>
            ); })}
          </div>
          <div style={{ marginTop: 12 }}><span style={{ padding: '5px 12px', borderRadius: 9999, background: 'rgba(16,185,129,0.10)', color: '#059669', fontFamily: HEAD, fontWeight: 800, fontSize: 13 }}>+{phUp}% desde el lanzamiento</span></div>
        </Card>
      )}

      {/* ② QUIÉN LO CONSTRUYE — al final, como cierre de confianza */}
      {developer.name && (
        <Card className="dmx-proj-card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: `hsl(${developer.logo_hue || 250} 60% 92%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: `hsl(${developer.logo_hue || 250} 55% 38%)`, flexShrink: 0 }}>{developer.name[0]}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.06em' }}>Desarrollado por</div>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, color: 'var(--cream)' }}>{developer.name}</div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>{[developer.founded_year && `Desde ${developer.founded_year}`, developer.projects_delivered && `${developer.projects_delivered} proyectos entregados`].filter(Boolean).join(' · ') || 'Ve su track record en Confianza'}</div>
          </div>
          {onVerConfianza && <button type="button" onClick={onVerConfianza} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13, color: 'var(--theme)', cursor: 'pointer', whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0 }}>Su track record →</button>}
        </Card>
      )}

      {/* la historia */}
      {dev.description && (<div>{h2('La historia')}<p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.65, color: 'var(--cream-2)', margin: '4px 0 0', maxWidth: 760 }}>{dev.description}</p></div>)}
    </div>
  );
}

// Comparar hasta 5 proyectos lado a lado, incluyendo la parte FINANCIERA (precio/m², renta, TIR, cap rate, plusvalía).
function ComparaProyectos({ dev, onClose }) {
  const [list, setList] = useState([]);
  const [picked, setPicked] = useState([]);          // IDs agregados (máx 4 → 5 columnas con el actual)
  const [data, setData] = useState({ [dev.id]: dev });
  const [fin, setFin] = useState({});                // id → {tir, cap, plus} del motor de inversión
  const HK = process.env.REACT_APP_BACKEND_URL;
  useEffect(() => { let alive = true; fetchDevelopments({}).then((d) => { if (!alive) return; const arr = Array.isArray(d) ? d : (d.developments || d.items || d.results || []); setList(arr); }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => {
    let alive = true;
    [dev.id, ...picked].forEach((id) => {
      const d = data[id]; if (!d || fin[id]) return;
      const col = d.colonia_id || d.colonia;
      fetch(`${HK}/api/inversion-v4/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor_propiedad: d.price_from, enganche_pct: 0.20, plazo_anios: 20, horizonte_anios: 10, renta_mensual: Math.round((d.price_from || 0) * 0.0045), colonia: col }) })
        .then((r) => r.json()).then((a) => { if (alive && a && a.ok) setFin((f) => ({ ...f, [id]: { tir: a.tir_pct, cap: a.cap_rate_pct, plus: a.apreciacion_return_pct } })); }).catch(() => {});
    });
    return () => { alive = false; };
  }, [picked.join(','), Object.keys(data).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const addProject = (id) => { if (!id || picked.includes(id) || picked.length >= 4) return; fetchDevelopment(id).then((d) => { const full = (d && d.development) || d; setData((p) => ({ ...p, [id]: full })); setPicked((p) => [...p, id]); }).catch(() => {}); };
  const removeProject = (id) => setPicked((p) => p.filter((x) => x !== id));
  const rng2 = (a) => (Array.isArray(a) && a.length ? (a[0] === a[1] ? `${a[0]}` : `${a[0]}–${a[1]}`) : null);
  const m2avg = (d) => { const m = d.m2_range || []; return m.length ? Math.round((m[0] + (m[1] || m[0])) / 2) : null; };
  const ROWS = [
    ['Precio desde', (d) => d.price_from, (v) => money(v), 'min'],
    ['Precio / m²', (d) => (d.price_from && m2avg(d) ? Math.round(d.price_from / m2avg(d)) : null), (v) => money(v), 'min'],
    ['Superficie', (d) => (d.m2_range || [])[1] || (d.m2_range || [])[0], (v) => `${v} m²`, 'max'],
    ['Recámaras', (d) => rng2(d.bedrooms_range), (v) => v, null],
    ['Baños', (d) => rng2(d.bathrooms_range), (v) => v, null],
    ['Estacionamientos', (d) => rng2(d.parking_range), (v) => v, null],
    ['Niveles', (d) => d.max_level, (v) => v, 'max'],
    ['Unidades', (d) => d.units_total, (v) => v, null],
    ['Amenidades', (d) => (d.amenities || []).length, (v) => v, 'max'],
    ['Avance de obra', (d) => (d.construction_progress || {}).percentage, (v) => (v != null ? `${v}%` : '—'), null],
    ['Entrega', (d) => fechaCorta(d.delivery_estimate), (v) => v, null],
    ['Zona', (d) => d.colonia, (v) => v, null],
    { fin: true, label: 'Renta estimada', get: (d) => Math.round((d.price_from || 0) * 0.0045), fmt: (v) => `${money(v)}/mes`, dir: 'max' },
    { fin: true, label: 'Rendimiento (TIR)', get: (d, f) => (f ? f.tir : null), fmt: (v) => `${v}%`, dir: 'max' },
    { fin: true, label: 'Cap rate', get: (d, f) => (f ? f.cap : null), fmt: (v) => `${v}%`, dir: 'max' },
    { fin: true, label: 'Plusvalía/año', get: (d, f) => (f ? f.plus : null), fmt: (v) => `${v}%`, dir: 'max' },
  ].map((r) => (Array.isArray(r) ? { label: r[0], get: r[1], fmt: r[2], dir: r[3] } : r));
  const cols = [dev.id, ...picked];
  const cell = (id, get, fmt) => { const d = data[id]; if (!d) return '—'; const v = get(d, fin[id]); return (v == null || v === '') ? '—' : (fmt ? fmt(v) : v); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(16,18,28,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface, #faf9f7)', borderRadius: 18, maxWidth: 1000, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '22px 24px', boxShadow: '0 24px 60px rgba(16,18,28,0.32)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)' }}>Comparar proyectos</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--cream-3)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: 'var(--cream-3)', marginBottom: 14 }}>Hasta 5 proyectos lado a lado, con su parte financiera. {picked.length < 4 && 'Agrega otro abajo.'}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13, minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 130 }} />
                {cols.map((id, ci) => (
                  <th key={id} style={{ textAlign: 'left', padding: '6px 12px', minWidth: 130, verticalAlign: 'top' }}>
                    <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, color: ci === 0 ? 'var(--theme)' : 'var(--cream)' }}>{(data[id] || {}).name || '—'}</div>
                    {ci > 0 && <button onClick={() => removeProject(id)} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontSize: 11, cursor: 'pointer', padding: 0, marginTop: 2 }}>quitar ✕</button>}
                  </th>
                ))}
                {picked.length < 4 && (
                  <th style={{ padding: '6px 12px', minWidth: 150, verticalAlign: 'top' }}>
                    <select value="" onChange={(e) => addProject(e.target.value)} style={{ width: '100%', padding: '7px 9px', borderRadius: 9, border: '1px dashed var(--theme)', fontFamily: HEAD, fontWeight: 700, fontSize: 12.5, color: 'var(--theme)', background: 'transparent', cursor: 'pointer' }}>
                      <option value="">+ Agregar proyecto…</option>
                      {list.filter((x) => x.id !== dev.id && !picked.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const nums = cols.map((id) => { const d = data[id]; const v = d ? r.get(d, fin[id]) : null; return typeof v === 'number' ? v : null; });
                const valid = nums.filter((v) => v != null);
                const best = r.dir && valid.length > 1 ? (r.dir === 'min' ? Math.min(...valid) : Math.max(...valid)) : null;
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--card-border, var(--border))', background: r.fin ? 'rgba(99,102,241,0.03)' : 'transparent' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--cream-3)', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.label}</td>
                    {cols.map((id, ci) => { const win = best != null && nums[ci] === best; return (
                      <td key={id} style={{ padding: '9px 12px', color: win ? '#059669' : 'var(--cream)', fontWeight: win ? 800 : 500, whiteSpace: 'nowrap' }}>{cell(id, r.get, r.fmt)}{win ? ' ✓' : ''}</td>
                    ); })}
                    {picked.length < 4 && <td />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>✓ = mejor en esa fila. Financiero (TIR/cap/plusvalía) estimado por el motor con el precio “desde” de cada proyecto; referencia, no una recomendación.</div>
      </div>
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
  const [tab, setTab] = useState('proyecto');   // la ficha abre en "El proyecto" (1er tab)
  const [hk, setHk] = useState({});
  const [savedUnits, setSavedUnits] = useState(() => new Set());
  const [leadModal, setLeadModal] = useState(null);
  const HK_API = process.env.REACT_APP_BACKEND_URL;
  const secTimeRef = useRef({ tab: 'proyecto', t: Date.now() });   // tiempo en cada sección (granularidad de interés)
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => { document.body.classList.add('public-light'); return () => document.body.classList.remove('public-light'); }, []);
  // Ancla legacy #ie-scores (click del badge de ranking en el marketplace): en la v3 no hay sección con ese id → aterriza en Confianza (donde vive la lectura de confianza/scores). Sin scroll a un id que no existe.
  useEffect(() => { if (window.location.hash === '#ie-scores') setTab('confianza'); }, []);
  // V3-LEAD-04: el wizard (dmx:lead) trae su unidad recomendada y el perfil del comprador → los llevamos al modal (y al asesor).
  useEffect(() => { const onLead = (e) => setLeadModal({ reason: (e && e.detail && e.detail.source) || 'asesor', unit: e && e.detail && e.detail.unit, perfil: e && e.detail && e.detail.perfil }); window.addEventListener('dmx:lead', onLead); return () => window.removeEventListener('dmx:lead', onLead); }, []);
  // V3-FICHA-VIEW-LOST: la v3 dejó de emitir la vista de ficha. Reponemos el patrón de la ficha legacy — ficha_view al montar,
  // dwell (tiempo total) al salir y scroll_depth (máx alcanzado). Alimenta el copiloto/lead score + la demanda por colonia.
  useEffect(() => {
    if (!dev || !dev.id) return undefined;
    const col = dev.colonia_id || dev.colonia;
    const t0 = Date.now();
    let maxScroll = 0;
    const onScroll = () => { const h = document.documentElement.scrollHeight - window.innerHeight; if (h > 0) maxScroll = Math.max(maxScroll, Math.round((window.scrollY / h) * 100)); };
    window.addEventListener('scroll', onScroll, { passive: true });
    try { sendBuyerSignal('ficha_view', { entity_id: dev.id, colonia: col, unit_number: unit && unit.unit_number, value: 'v3' }); } catch (e) { /* noop */ }
    return () => {
      window.removeEventListener('scroll', onScroll);
      const ms = Date.now() - t0;
      if (ms > 1500) { try { sendBuyerSignal('dwell', { entity_id: dev.id, colonia: col, dwell_ms: Math.min(ms, 600000) }); } catch (e) { /* noop */ } }
      if (maxScroll > 5) { try { sendBuyerSignal('scroll_depth', { entity_id: dev.id, colonia: col, value: String(Math.min(100, maxScroll)) }); } catch (e) { /* noop */ } }
    };
  }, [dev && dev.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Atlax AGÉNTICO: sus botones manejan la ficha (navegar tabs · agendar · guardar). navRef trae los últimos handlers (sin stale).
  const navRef = useRef(null);
  useEffect(() => {
    const onAction = (e) => {
      const nav = e && e.detail && e.detail.nav; const h = navRef.current; if (!nav || !h) return;
      if (nav === 'dinero') h.goTab('dinero');
      else if (nav === 'unidad' || nav === 'comparar') h.goTab('unidad');
      else if (nav === 'confianza') h.goTab('confianza');
      else if (nav === 'proyecto') h.goTab('proyecto');
      else if (nav === 'agendar') h.agendar();
      else if (nav === 'guardar') h.toggleSaveUnit();
    };
    window.addEventListener('dmx:atlax-action', onAction);
    return () => window.removeEventListener('dmx:atlax-action', onAction);
  }, []);
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
  const tipo = tipoMap[dev.property_type] || (dev.property_type ? tc(dev.property_type) : null);
  const multi = lens === 'invertir' && invMode === 'institucional';
  const fundUnits = (dev.units || []).filter((u) => u.status === 'disponible' && fundIds.includes(u.id));
  const toggleFund = (id) => setFundIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const kM2 = (n) => (n != null ? `$${Math.round(n / 1000).toLocaleString('es-MX')}k/m²` : null);
  const lensLabel = lens === 'invertir' ? `Invertir · ${invMode === 'institucional' ? 'Institucional' : 'Para ti'}` : lens === 'vivir' ? 'Para vivir' : null;

  const pickUnit = (u) => { setUnit(u); if (u && u.unit_number) { try { sendBuyerSignal('unit_view', { entity_id: dev.id, unit_number: u.unit_number, colonia: dev.colonia }); } catch (e) { /* noop */ } } };
  // SENSOR (granularidad end-to-end): qué sección analiza el comprador Y CUÁNTO tiempo → buyer_signals → lead score + embudo dev + cubo superadmin.
  const goTab = (t) => {
    const prev = secTimeRef.current;
    const secs = Math.round((Date.now() - prev.t) / 1000);
    if (prev.tab && secs >= 2 && secs < 1800) { try { sendBuyerSignal('section_time', { entity_id: dev.id, colonia: dev.colonia_id || dev.colonia, unit_number: unit && unit.unit_number, value: prev.tab, seconds: secs }); } catch (e) { /* noop */ } }
    secTimeRef.current = { tab: t, t: Date.now() };
    setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' });
    try { sendBuyerSignal('section_view', { entity_id: dev.id, colonia: dev.colonia_id || dev.colonia, unit_number: unit && unit.unit_number, value: t }); } catch (e) { /* noop */ }
  };
  // V3-01: "panorama" es el WIZARD de asequibilidad, que vive en la pestaña "Tu unidad" (no en "Tu dinero"). Vamos a esa pestaña y bajamos al wizard.
  const goTo = (anchor) => {
    if (anchor === 'panorama') { goTab('unidad'); setTimeout(() => { const el = document.querySelector('[data-panorama]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 160); }
    else if (anchor === 'unidades') goTab('unidad');
    else if (anchor === 'inversion') goTab('dinero');
  };
  // FLYWHEEL: el LENTE (vivir/invertir · individual/institucional) es una señal fuerte de intención → alimenta el perfil
  // del comprador, el cubo por-intención y la demanda que ven dev/superadmin. (La v2 la emitía; la v3 no — se cablea aquí.)
  const chooseLens = (k) => { setLens(k); try { sendBuyerSignal('lens', { entity_id: dev.id, colonia: dev.colonia_id || dev.colonia, value: k }); } catch (e) { /* noop */ } };
  const chooseInvMode = (m) => { setInvMode(m); try { sendBuyerSignal('lens', { entity_id: dev.id, colonia: dev.colonia_id || dev.colonia, value: `invertir_${m}` }); } catch (e) { /* noop */ } };
  const askAtlax = () => { try { sendBuyerSignal('lead', { entity_id: dev.id, unit_number: unit && unit.unit_number, colonia: dev.colonia, value: 'atlax' }); } catch (e) { /* noop */ } window.dispatchEvent(new CustomEvent('dmx:ask-atlax', { detail: { devId: dev.id, devName: dev.name, colonia: dev.colonia, unit: unit && unit.unit_number } })); };
  const agendar = () => { try { sendBuyerSignal('intent', { entity_id: dev.id, unit_number: unit && unit.unit_number, colonia: dev.colonia, value: 'agendar' }); } catch (e) { /* noop */ } setLeadModal({ reason: 'agendar' }); };
  const toggleSaveUnit = () => { if (!unit || !unit.unit_number) return; const u = unit.unit_number; const on = !savedUnits.has(u); try { sendBuyerSignal(on ? 'unit_save' : 'unit_unsave', { entity_id: dev.id, unit_number: u, colonia: dev.colonia_id || dev.colonia }); } catch (e) { /* noop */ } setSavedUnits((s) => { const n = new Set(s); if (on) n.add(u); else n.delete(u); return n; }); };
  // V3-SENSOR-01: cada módulo del moat que se abre → module_open (mismos value que la v2:172) → lead score + demanda dev/superadmin.
  const signalModule = (m) => { try { sendBuyerSignal('module_open', { entity_id: dev.id, unit_number: unit && unit.unit_number, colonia: dev.colonia, value: m }); } catch (e) { /* noop */ } };

  const keyNum = lens === 'invertir'
    ? (hk.tir != null ? { v: `${hk.tir.toFixed(1)}%`, l: 'Rendimiento (TIR)', sub: hk.cetes != null ? (hk.tir > hk.cetes ? 'le gana a CETES' : 'debajo de CETES') : null } : null)
    : (hk.mensual ? { v: `~${money(hk.mensual)}`, l: 'Tu mensualidad', sub: '20% enganche · 20 años' } : null);

  // CONTEXTO VIVO para Atlax: la burbuja sabe la unidad/lente/sección que ve el cliente → responde en contexto + el lead al asesor lo lleva.
  const TAB_CTX = { proyecto: 'el proyecto', unidad: 'las unidades', dinero: 'sus números / Tu dinero', confianza: 'confianza y la zona' };
  const atlaxContext = `Ficha de ${dev.name} (${dev.colonia}${dev.alcaldia ? ', ' + dev.alcaldia : ''}). El cliente está en la sección "${TAB_CTX[tab] || tab}". ${unit ? `Tiene elegida la unidad ${unit.unit_number} — ${unit.bedrooms} rec, ${unit.m2_total || unit.m2_privative} m², ${money(unit.price)}. ` : 'Aún no elige una unidad. '}Intención: ${lens === 'invertir' ? `invertir (${invMode === 'institucional' ? 'institucional' : 'para sí mismo'})` : lens === 'vivir' ? 'para vivir' : 'sin definir'}.${unit && keyNum ? ` ${keyNum.l}: ${keyNum.v}${keyNum.sub ? ' (' + keyNum.sub + ')' : ''}.` : ''}`;

  // Atlax PROACTIVO: saluda según lo que ves y ofrece botones que MUESTRAN (→ manual) o RESPONDEN con IA.
  navRef.current = { goTab, agendar, toggleSaveUnit };
  const atlaxWelcome = unit
    ? `Estás viendo la ${unit.unit_number} de ${titleCase(dev.name)}, en ${titleCase(dev.colonia)}. ¿Por dónde quieres empezar?`
    : `Estás viendo ${titleCase(dev.name)}, en ${titleCase(dev.colonia)}. ¿Te muestro las unidades, sus números o cómo es la zona?`;
  const atlaxQuickActions = [
    unit ? { label: 'Ver sus números', nav: 'dinero' } : { label: 'Ver las unidades', nav: 'unidad' },
    { label: '¿Es buen precio?', ask: `¿Es buen precio ${unit ? `la unidad ${unit.unit_number} de ${dev.name}` : dev.name} comparado con el mercado de ${dev.colonia}? Sé concreto.` },
    { label: 'Comparar unidades', nav: 'unidad' },
    { label: '¿Cómo es vivir aquí?', nav: 'confianza' },
    { label: 'Agendar una visita', nav: 'agendar', primary: true },
  ];

  const badgeV = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: '#059669', fontFamily: SANS, fontSize: 11, fontWeight: 700 };
  const badgeS = { padding: '4px 11px', borderRadius: 9999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', color: 'var(--theme)', fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' };
  const sideBtn = (grad) => ({ width: '100%', padding: '12px 14px', borderRadius: 12, border: grad ? 'none' : '1px solid var(--card-border, var(--border))', background: grad ? 'var(--grad)' : 'transparent', color: grad ? '#fff' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', marginTop: 9, boxShadow: grad ? '0 10px 24px rgba(109,74,255,0.24)' : 'none' });

  return (
    <LightScope>
      <DevStructuredData dev={dev} />
      <PublicNav />
      {process.env.REACT_APP_DEV_PREVIEW === "true" && (
        <a href={`/desarrollo/${id}?v2=1`} title="Ver el diseño anterior (v2)" style={{ position: 'fixed', left: 14, bottom: 14, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 9999, background: 'var(--cream)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 12.5, textDecoration: 'none', boxShadow: '0 8px 22px rgba(16,18,28,0.28)' }}>← Diseño anterior</a>
      )}
      <main style={{ paddingTop: 64 }}>
        {/* ── HEADER COMPACTO + TABS (pegajoso) ── */}
        <div style={{ position: 'sticky', top: 56, zIndex: 30, background: 'var(--surface, #faf9f7)', borderBottom: '1px solid var(--card-border, var(--border))', backdropFilter: 'saturate(1.2) blur(6px)' }}>
          <div style={{ maxWidth: 1320, width: '94%', margin: '0 auto', padding: '11px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--cream-3)' }}>{titleCase(dev.colonia)} · {titleCase(dev.alcaldia)} · CDMX</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 'clamp(20px,2.8vw,30px)', color: 'var(--cream)', margin: '1px 0 0', lineHeight: 1.05 }}>{dev.name}</h1>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--theme)' }}>{unit ? money(unit.price) : (dev.price_from_display || money(dev.price_from))}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <button onClick={() => { setCompareOpen(true); try { sendBuyerSignal('compare', { entity_id: dev.id, colonia: dev.colonia_id || dev.colonia }); } catch (e) { /* noop */ } }} style={{ padding: '5px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--card-border, var(--border))', color: 'var(--cream-2)', fontFamily: HEAD, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Comparar</button>
                {dev.verified && <span style={badgeV}>✓ Verificado</span>}
                <span style={badgeS}>{STAGE[dev.stage] || dev.stage}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 11, overflowX: 'auto' }}>
              {TABS.map(([k, label]) => (
                <button key={k} data-testid={`tab-${k}`} onClick={() => goTab(k)} style={{ padding: '10px 18px', borderRadius: '10px 10px 0 0', border: 'none', borderBottom: tab === k ? '2.5px solid var(--theme)' : '2.5px solid transparent', background: 'transparent', color: tab === k ? 'var(--theme)' : 'var(--cream-2)', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>{titleCase(label)}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── BODY: contenido enfocado + sidebar fijo ── */}
        <div className="dmx-cockpit-grid" style={{ maxWidth: 1320, width: '94%', margin: '0 auto', padding: '24px 0 90px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 28, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            {/* Lens UNO solo (founder: evitar el toggle duplicado entre Tu unidad y Tu dinero) — persistente en ambas. */}
            {(tab === 'unidad' || tab === 'dinero') && <LensToggle lens={lens} setLens={chooseLens} invMode={invMode} setInvMode={chooseInvMode} />}

            {tab === 'proyecto' && <TabProyecto dev={dev} amen={amen} tipo={tipo} beds={beds} m2r={m2r} park={park} nUnits={nUnits} rng={rng} lens={lens} onVerUnidades={() => goTab('unidad')} onVerDinero={() => goTab('dinero')} onVerConfianza={() => goTab('confianza')} />}

            {tab === 'unidad' && (
              <>
                {unit && <div style={{ marginBottom: 20 }}><CockpitCard dev={dev} unit={unit} lens={lens} keyNum={keyNum} hk={hk} kM2={kM2} onVerDinero={() => goTab('dinero')} onAgendar={agendar} saved={savedUnits.has(unit.unit_number)} onToggleSave={toggleSaveUnit} /></div>}
                {/* WIZARD de asequibilidad "¿cuánto puedo pagar?" — te recomienda la unidad que te queda por presupuesto (scoped a la elegida) */}
                <div data-panorama style={{ marginBottom: 20 }}><ModuleOpen name="vivir_panorama" fire={signalModule} /><SeccionPanorama dev={dev} unit={unit} onSelectUnit={pickUnit} /></div>
                <SeccionUnidades dev={dev} selectedUnit={unit} onSelectUnit={pickUnit} onGoTo={goTo} multi={multi} selectedIds={fundIds} onToggleUnit={toggleFund} plusvalia={hk.plusvalia} />
              </>
            )}

            {tab === 'dinero' && (
              <>
                {!unit && !multi && <EmptyHint text="Elige una unidad en “Tu unidad” para ver tus números exactos." onGo={() => goTab('unidad')} />}
                {/* ① CÓMO PAGAS: el esquema de pago al desarrollador (apartado/enganche/mensualidades/escritura + gastos) */}
                <ModuleOpen name="vivir_pago" fire={signalModule} />
                <PlanDePago dev={dev} unit={multi ? null : unit} />
                {/* ② TU CRÉDITO + RENDIMIENTO a fondo — la calc ya trae el simulador de crédito (no se duplica) */}
                {lens === 'invertir' && (unit || multi) && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', letterSpacing: '0.07em', marginBottom: 10 }}>Análisis de Inversión a Fondo</div>
                    <ModuleOpen name="inv_calc" fire={signalModule} />
                    <SeccionCalcInversion dev={dev} unit={unit} mode={invMode} units={fundUnits} onGoTo={goTo} />
                  </div>
                )}
                {lens === 'vivir' && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--theme)', letterSpacing: '0.07em', marginBottom: 10 }}>¿Rentar o Comprar?</div>
                    <SeccionDinero dev={dev} unit={unit} intent="vivir" defaultTab="rentobuy" />
                  </div>
                )}
              </>
            )}

            {tab === 'confianza' && (<><ModuleOpen name="confianza" fire={signalModule} /><SeccionConfianza dev={dev} /><div style={{ marginTop: 22 }}><ModuleOpen name="vivir_zona" fire={signalModule} /><SeccionUbicacion dev={dev} /></div></>)}
          </div>

          {/* SIDEBAR fijo: precio + número clave + acciones + asesor */}
          <aside className="dmx-cockpit-side" style={{ position: 'sticky', top: 130 }}>
            <Card style={{ padding: '18px 18px' }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', letterSpacing: '0.06em' }}>{unit ? `Unidad ${unit.unit_number}` : 'Desde'}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '2px 0 2px' }}>{money(unit ? unit.price : dev.price_from)}</div>
              {unit && keyNum && <div style={{ fontFamily: SANS, fontSize: 13, color: 'var(--cream-2)', marginBottom: 4 }}>{keyNum.l}: <b style={{ color: 'var(--theme)' }}>{keyNum.v}</b></div>}
              <button onClick={agendar} style={sideBtn(true)}>Agendar visita</button>
              <button onClick={askAtlax} style={sideBtn(false)}>Pregúntale a Atlax</button>
              {unit && <button onClick={toggleSaveUnit} style={sideBtn(false)}>{savedUnits.has(unit.unit_number) ? '♥ Guardada' : `Guardar la ${unit.unit_number}`}</button>}
              <div style={{ fontFamily: SANS, fontSize: 11, color: 'var(--cream-3)', marginTop: 11, textAlign: 'center' }}>Datos reales, sin presión. Tu asesor recibe esto tal cual.</div>
            </Card>
          </aside>
        </div>
      </main>
      {/* barra de acción fija SOLO en móvil — cuando el sidebar se va abajo, el precio + Agendar siguen a la mano */}
      <div className="dmx-cockpit-mobilebar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55, display: 'none', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--surface, #fff)', borderTop: '1px solid var(--card-border, var(--border))', boxShadow: '0 -6px 20px rgba(16,18,28,0.10)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{money(unit ? unit.price : dev.price_from)}</div>
          {unit && keyNum && <div style={{ fontFamily: SANS, fontSize: 11.5, color: 'var(--cream-3)' }}>{keyNum.l}: {keyNum.v}</div>}
        </div>
        <button onClick={agendar} style={{ padding: '11px 20px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff', fontFamily: HEAD, fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Agendar visita</button>
      </div>
      <style>{`
        @media (max-width: 920px){ .dmx-cockpit-grid{ grid-template-columns: minmax(0,1fr) !important; } .dmx-cockpit-side{ position: static !important; } .dmx-cockpit-mobilebar{ display: flex !important; } }
        .dmx-proj-card{ transition: transform .16s ease, box-shadow .16s ease; }
        .dmx-proj-card:hover{ transform: translateY(-2px); box-shadow: 0 12px 26px rgba(16,18,28,0.10); }
        .dmx-proj > *{ animation: dmxFade .45s ease both; }
        .dmx-proj > *:nth-child(2){ animation-delay:.04s; } .dmx-proj > *:nth-child(3){ animation-delay:.08s; } .dmx-proj > *:nth-child(4){ animation-delay:.12s; } .dmx-proj > *:nth-child(5){ animation-delay:.16s; } .dmx-proj > *:nth-child(6){ animation-delay:.2s; } .dmx-proj > *:nth-child(7){ animation-delay:.24s; } .dmx-proj > *:nth-child(n+8){ animation-delay:.28s; }
        .dmx-proj-bar{ transform-origin: bottom; animation: dmxBar .55s cubic-bezier(.3,.7,.3,1) both; }
        .dmx-proj-prog{ animation: dmxProg .7s ease both; }
        @keyframes dmxFade{ from{ opacity:0; transform:translateY(8px);} to{ opacity:1; transform:none;} }
        @keyframes dmxBar{ from{ transform:scaleY(0);} to{ transform:scaleY(1);} }
        @keyframes dmxProg{ from{ width:0;} }
      `}</style>
      {/* Atlax flotante — consciente de la unidad/lente/sección que ve el cliente (context vivo) */}
      <AtlaxBubble theme="light" context={atlaxContext} welcome={atlaxWelcome} quickActions={atlaxQuickActions} dev={dev} unit={unit} lens={lens} />
      {compareOpen && <ComparaProyectos dev={dev} onClose={() => setCompareOpen(false)} />}
      {leadModal && (() => {
        // V3-LEAD-04: si el lead vino del wizard, usa SU unidad recomendada (resolviéndola al objeto real para precio/specs) y su perfil; si no, la elegida en la ficha.
        const wu = leadModal.unit;
        const leadUnit = wu ? ((dev.units || []).find((u) => u.unit_number === wu) || { unit_number: wu }) : unit;
        return <LeadCaptureModal dev={dev} unit={leadUnit} perfil={leadModal.perfil} lensLabel={lensLabel} keyAns={keyNum && keyNum.v} reason={leadModal.reason} onClose={() => setLeadModal(null)} />;
      })()}
    </LightScope>
  );
}
