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
import { Section, Card, Stat, BtnPrimary, BtnGhost, SERIF, SANS, HEAD } from '../components/ficha/ui';
import SeccionValor from '../components/ficha/SeccionValor';     // UI NUEVA (de cero) — reusa el motor buy-signal, NO el componente viejo
import SeccionUnidades from '../components/ficha/SeccionUnidades'; // UI NUEVA (de cero) — solo dato real de dev.units
import SeccionDinero from '../components/ficha/SeccionDinero';     // UI NUEVA (de cero) — módulo unificado, reusa ownership+mortgage

const ANCLAS = [
  ['proyecto', 'El proyecto'], ['unidades', 'Unidades'], ['para-ti', '¿Es para ti?'],
  ['valor', 'El valor'], ['dinero', 'Tu dinero'], ['ubicacion', 'Ubicación'], ['confianza', 'Confianza'],
];
const STAGE = { preventa: 'Preventa', construccion: 'En construcción', entrega_inmediata: 'Entrega inmediata', terminado: 'Terminado' };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})/); return m ? `${MES[+m[2] - 1] || ''} ${m[1]}` : s; };
const money = (n) => (n ? `$${Number(n).toLocaleString('es-MX')}` : '—');

function Loading({ msg }) {
  return <LightScope><PublicNav /><div style={{ paddingTop: 170, textAlign: 'center', fontFamily: SANS, color: 'var(--cream-3)' }}>{msg}</div></LightScope>;
}

// Molde de sección aún por reconstruir (de cero, no copy-paste). Se reemplaza una por una.
function Placeholder({ hint }) {
  return (
    <Card style={{ padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, fontFamily: SANS, fontSize: 13.5, color: 'var(--cream-3)', textAlign: 'center', borderStyle: 'dashed' }}>
      🧱 {hint}
    </Card>
  );
}

export default function FichaDesarrollo({ user, onLogin }) {
  const { id } = useParams();
  const [dev, setDev] = useState(undefined);
  const [unit, setUnit] = useState(null);   // unidad elegida → alimenta riel + Tu dinero (granularidad por unidad)

  useEffect(() => { document.body.classList.add('public-light'); return () => document.body.classList.remove('public-light'); }, []);
  useEffect(() => {
    let alive = true;
    fetchDevelopment(id).then((d) => { if (alive) setDev(d); }).catch(() => { if (alive) setDev(null); });
    return () => { alive = false; };
  }, [id]);

  if (dev === undefined) return <Loading msg="Cargando…" />;
  if (!dev) return <Loading msg="No encontramos este desarrollo." />;

  const cfg = dev.config || {};
  const beds = dev.bedrooms_range || [], m2 = dev.m2_range || [], park = dev.parking_range || [];
  const rng = (a) => (a.length ? (a[0] === a[1] ? `${a[0]}` : `${a[0]}–${a[1]}`) : null);
  const nUnits = dev.total_units || (dev.units ? dev.units.length : null);
  const amen = (Array.isArray(cfg.amenidades) ? cfg.amenidades : (Array.isArray(dev.amenities) ? dev.amenities : [])).slice(0, 12);
  const tipoMap = { departamento: 'Departamento', casa: 'Casa', loft: 'Loft', ph: 'Penthouse', estudio: 'Estudio' };
  const tipo = tipoMap[dev.property_type] || (dev.property_type ? dev.property_type[0].toUpperCase() + dev.property_type.slice(1) : null);
  const pagos = [...(cfg.formas_pago ? ['Preventa con mensualidades', 'Contado con descuento'] : []), 'Crédito hipotecario'];

  const goTo = (anchor) => { const el = document.querySelector(`[data-testid="${anchor}"]`); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' }); };

  const Pill = ({ children }) => (
    <span style={{ padding: '9px 14px', borderRadius: 11, background: 'var(--surface-card)', border: '1px solid var(--card-border, var(--border))', fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: 'var(--cream)' }}>{children}</span>
  );

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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12 }}>
                  <Card style={{ padding: '16px 18px' }}><Stat value={tipo} label="Tipo" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat value={rng(beds)} label="Recámaras" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat value={rng(m2) ? `${rng(m2)} m²` : null} label="Superficie" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat value={rng(park)} label="Estac." /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat value={fechaCorta(dev.delivery_estimate)} label="Entrega" /></Card>
                  <Card style={{ padding: '16px 18px' }}><Stat value={nUnits} label="Unidades" /></Card>
                </div>
                {amen.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Amenidades</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{amen.map((a, i) => <Pill key={i}>{String(a).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Pill>)}</div>
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

              {/* 2 · LAS UNIDADES — UI NUEVA (de cero) · por tipo + escasez honesta + elegir + comparador */}
              <Section id="unidades" eyebrow="Disponibilidad" title="Las unidades">
                <SeccionUnidades dev={dev} selectedUnit={unit} onSelectUnit={setUnit} />
              </Section>

              {/* 3 · ¿ES PARA TI? — pendiente: reconstruir el lente de cero */}
              <Section id="para-ti" eyebrow="Hecho a tu medida" title="¿Es para ti?">
                <Placeholder hint="El lente (invertir / vivir / familia / primera) — UI nueva" />
              </Section>

              {/* 4 · EL VALOR — UI NUEVA (de cero), reusa el motor buy-signal */}
              <Section id="valor" eyebrow="La inteligencia" title="¿Es buen precio y buena inversión?">
                <SeccionValor dev={dev} />
              </Section>

              {/* 5 · TU DINERO — MÓDULO UNIFICADO (de cero) · granularidad por unidad */}
              <Section id="dinero" eyebrow="Tu dinero" title="¿Cómo te conviene comprarlo?">
                <SeccionDinero dev={dev} unit={unit} />
              </Section>

              {/* 6 · UBICACIÓN — pendiente: reconstruir de cero (mapa + lugares) */}
              <Section id="ubicacion" eyebrow="El entorno" title="¿Cómo es vivir aquí?">
                <Placeholder hint="Mapa + lo mejor cerca + conectividad — UI nueva" />
              </Section>

              {/* 7 · CONFIANZA — pendiente: reconstruir de cero (riesgos + reseñas) */}
              <Section id="confianza" eyebrow="Sin letras chiquitas" title="¿Puedes confiar?">
                <Placeholder hint="Desarrollador + calidad de obra + legal + riesgos honestos — UI nueva" />
              </Section>
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
                  <BtnPrimary>📅 Agendar visita</BtnPrimary>
                  <BtnGhost>✨ Hablar con Atlax</BtnGhost>
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
