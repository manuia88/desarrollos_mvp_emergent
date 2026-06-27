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
import SeccionPanorama from '../components/ficha/SeccionPanorama';
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
          <button onClick={() => setInvMode('institucional')} style={pill(invMode === 'institucional')}>Fondo</button>
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

// Pestaña "El proyecto": el brochure (galería + datos + amenidades + historia) — ya NO front-loaded, vive aquí.
function TabProyecto({ dev, amen, tipo, beds, m2r, park, nUnits, rng }) {
  return (
    <div>
      <PhotoGallery dev={dev} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginTop: 18 }}>
        <Card style={{ padding: '16px 18px' }}><Stat sm value={tipo} label="Tipo" /></Card>
        <Card style={{ padding: '16px 18px' }}><Stat sm value={rng(beds)} label="Recámaras" /></Card>
        <Card style={{ padding: '16px 18px' }}><Stat sm value={rng(m2r) ? `${rng(m2r)} m²` : null} label="Superficie" /></Card>
        <Card style={{ padding: '16px 18px' }}><Stat sm value={rng(park)} label="Estac." /></Card>
        <Card style={{ padding: '16px 18px' }}><Stat sm value={fechaCorta(dev.delivery_estimate)} label="Entrega" /></Card>
        <Card style={{ padding: '16px 18px' }}><Stat sm value={nUnits} label="Unidades" /></Card>
      </div>
      {amen.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Amenidades</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {amen.map((a, i) => { const { icon, label } = amenInfo(a); return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{icon} {label}</span>
            ); })}
          </div>
        </div>
      )}
      {dev.description && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>La historia</div>
          <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.65, color: 'var(--cream-2)', margin: 0, maxWidth: 720 }}>{dev.description}</p>
        </div>
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
            {tab === 'proyecto' && <TabProyecto dev={dev} amen={amen} tipo={tipo} beds={beds} m2r={m2r} park={park} nUnits={nUnits} rng={rng} />}

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
                {lens === 'invertir'
                  ? <SeccionCalcInversion dev={dev} unit={unit} mode={invMode} units={fundUnits} onGoTo={goTo} />
                  : <SeccionPanorama dev={dev} unit={unit} onSelectUnit={pickUnit} />}
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
