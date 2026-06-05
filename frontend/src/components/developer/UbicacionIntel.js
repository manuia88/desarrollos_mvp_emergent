/**
 * UbicacionIntel — Cockpit de inteligencia de zona (pestaña Ubicación de la ficha del proyecto).
 * Doctrina del dato práctico: cada métrica = NÚMERO + PLAZO + COMPARATIVO + PARA QUÉ SIRVE.
 * Cablea /location-intel (simulador de inversión, DRPI, censo de negocios, demanda, perfil INEGI).
 * Conectores sin dato aún (negocios/forecast) = stub honesto que se autollena (estado final).
 */
import React, { useEffect, useState } from 'react';
import { getLocationIntel } from '../../api/developer';
import { fmtMXN, fmtFull, grid, Block, Stat, BigCard } from './cockpitUI';

const CDMX_APREC = 6; // referencia de apreciación residencial promedio (industria)

// Banda del perfil del comprador (score 0-100 → palabra + acción práctica).
function buyerLine(score, kind) {
  if (score == null) return null;
  const hi = score >= 67, mid = score >= 40;
  if (kind === 'ingreso') return hi
    ? { word: 'Ingreso alto', tone: 'green', use: 'pueden pagar de contado o engancha fuerte → vende exclusividad, no mensualidades' }
    : mid ? { word: 'Ingreso medio-alto', tone: 'amber', use: 'mezcla de contado y crédito → ofrece planes de pago flexibles' }
      : { word: 'Ingreso medio', tone: 'amber', use: 'sensible a la mensualidad → destaca enganche bajo y financiamiento' };
  if (kind === 'familia') return hi
    ? { word: 'Zona familiar', tone: 'green', use: 'destaca seguridad, escuelas cercanas y espacios para niños' }
    : mid ? { word: 'Perfil mixto', tone: 'amber', use: 'habla a parejas jóvenes y profesionistas, no solo a familias' }
      : { word: 'Joven / soltera', tone: 'amber', use: 'vende estilo de vida, vida nocturna y cercanía al trabajo' };
  if (kind === 'conectividad') return hi
    ? { word: 'Bien conectada', tone: 'green', use: 'presume cercanía a metro/vialidades en tu marketing' }
    : mid ? { word: 'Conectividad media', tone: 'amber', use: 'menciona accesos y minutos a los puntos clave' }
      : { word: 'Conectividad limitada', tone: 'red', use: 'compensa con amenidades; el comprador valora estacionamiento' };
  return null;
}

const NEG_CATS = [
  { k: 'restaurants', label: 'Restaurantes', icon: '🍽️' },
  { k: 'schools', label: 'Escuelas', icon: '🎓' },
  { k: 'hospitals', label: 'Hospitales', icon: '🏥' },
  { k: 'markets', label: 'Súper', icon: '🛒' },
  { k: 'pharmacies', label: 'Farmacias', icon: '💊' },
  { k: 'banks', label: 'Bancos', icon: '🏦' },
  { k: 'gyms', label: 'Gimnasios', icon: '🏋️' },
];

export default function UbicacionIntel({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(false);
    getLocationIntel(slug).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  if (err) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>No se pudo cargar la inteligencia de zona ahora.</div>;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando inteligencia de tu zona…</div>;

  const roi = d.roi || {};
  const rt = roi.renta_tradicional || {};
  const ab = roi.airbnb || {};
  const rv = roi.reventa || {};
  const aprec = roi.aprec_anual_pct;
  const scen = roi.escenarios || {};
  const dem = d.demanda || {};
  const drpi = (d.plusvalia || {}).drpi || {};
  const neg = d.negocios || {};
  const buyer = d.comprador || {};

  const myM2 = d.price_m2_project;
  const zoneM2 = drpi.median_price_per_m2;
  const vsZone = (myM2 && zoneM2) ? Math.round((myM2 / zoneM2 - 1) * 100) : null;
  const abVsRt = (ab.renta_neta_mensual && rt.renta_neta_mensual)
    ? Math.round((ab.renta_neta_mensual / rt.renta_neta_mensual - 1) * 100) : null;

  const ingreso = buyerLine(buyer.ingreso, 'ingreso');
  const familia = buyerLine(buyer.familia, 'familia');
  const conect = buyerLine(buyer.conectividad, 'conectividad');

  return (
    <div data-testid="ubicacion-intel" style={{ marginBottom: 22 }}>
      {/* 1 · La joya: ROI por estrategia */}
      <Block title="¿Cuánto rinde invertir aquí?" hint={`${d.colonia} · sobre ${fmtMXN(d.precio_entrada)} de entrada`}>
        <div style={grid(210)}>
          <BigCard icon="🏠" name="Renta tradicional" tone="green"
            big={`${fmtFull(rt.renta_neta_mensual)}`} sub={`/mes neto · yield ${rt.yield_bruto_anual_pct ?? '—'}%/año`}
            framing="Flujo estable y sin operación. Para quien busca renta de largo plazo." />
          <BigCard icon="🌙" name="Airbnb" tone="amber" tag="estimado" note="estimado · se afina con datos reales de Airbnb"
            big={`${fmtFull(ab.renta_neta_mensual)}`} sub={abVsRt != null ? `/mes neto · +${abVsRt}% vs renta fija` : '/mes neto'}
            framing="Más flujo, pero operas tú (huéspedes, limpieza). Para maximizar ingreso mensual." />
          <BigCard icon="📈" name="Reventa a 10 años" tone="green" tag={`ROI ${rv.roi_pct != null ? Math.round(rv.roi_pct) : '—'}%`}
            big={`+${fmtMXN(rv.plusvalia_abs)}`} sub={rv.precio_final ? `vale ~${fmtMXN(rv.precio_final)} a 10 años` : ''}
            framing="Apreciación pura: casi triplicas tu inversión si vendes en una década." />
        </div>
      </Block>

      {/* 2 · Plusvalía / apreciación */}
      <Block title="¿Cuánto se aprecia la zona?" hint="qué tan rápido sube de valor">
        <div style={grid(190)}>
          <Stat label="Apreciación al año" value={aprec != null ? `+${aprec}` : '—'} unit="%"
            tone={aprec != null ? (aprec >= CDMX_APREC ? 'green' : 'amber') : 'flat'}
            framing={aprec != null ? `vs ~${CDMX_APREC}% promedio CDMX → ${aprec >= CDMX_APREC ? 'crece por encima del promedio, buen activo de apreciación' : 'crece por debajo del promedio, véndela como zona consolidada y segura'}` : 'sin dato'} />
          <Stat label="Escenario conservador" value={scen.conservador?.aprec_anual_pct != null ? `+${scen.conservador.aprec_anual_pct}` : '—'} unit="%/año"
            tone="amber" framing={scen.conservador?.roi_pct != null ? `ROI ${Math.round(scen.conservador.roi_pct)}% a 10 años · el piso realista` : 'el piso realista'} />
          <Stat label="Escenario optimista" value={scen.optimista?.aprec_anual_pct != null ? `+${scen.optimista.aprec_anual_pct}` : '—'} unit="%/año"
            tone="green" framing={scen.optimista?.roi_pct != null ? `ROI ${Math.round(scen.optimista.roi_pct)}% a 10 años · si el mercado acompaña` : 'si el mercado acompaña'} />
          <Stat label="Plusvalía a 10 años" value={fmtMXN(rv.plusvalia_abs)}
            tone="green" framing={roi.tir_anual_pct != null ? `rendimiento anualizado ${roi.tir_anual_pct}% (TIR)` : 'ganancia de capital proyectada'} />
        </div>
      </Block>

      {/* 3 · Tu precio vs la zona */}
      <Block title="Tu precio vs la zona" hint="¿estás caro, barato o en línea?">
        <div style={grid(190)}>
          <Stat label="Tu precio /m²" value={fmtFull(myM2)} tone={vsZone == null ? 'flat' : vsZone > 15 ? 'amber' : 'green'}
            framing={vsZone != null ? `${vsZone > 0 ? '+' : ''}${vsZone}% vs la referencia de zona (${fmtFull(zoneM2)}/m²) → ${vsZone > 15 ? 'premium; justifícalo con marca/amenidades o el ritmo se frena' : vsZone < -8 ? 'por debajo de la zona, tienes espacio para subir' : 'alineado con la zona'}` : 'sin referencia de zona aún'}
            stub={!drpi.available} />
          <Stat label="Referencia de zona /m²" value={fmtFull(zoneM2)} tone="flat"
            framing={drpi.available ? `mediana real · ${drpi.sample_size} ventas` : 'estimado de zona · se afina con transacciones reales'} stub={!drpi.available} />
        </div>
      </Block>

      {/* 4 · Demanda viva */}
      <Block title="Demanda viva de tu zona" hint="interés real ahora mismo">
        <div style={grid(170)}>
          <Stat label="Leads activos" value={dem.leads_activos ?? 0} tone={(dem.leads_activos ?? 0) > 0 ? 'green' : 'amber'}
            framing={`de ${dem.leads_total ?? 0} leads totales en este proyecto`} />
          <Stat label="Leads ganados" value={dem.leads_ganados ?? 0} tone={(dem.leads_ganados ?? 0) > 0 ? 'green' : 'flat'}
            framing="cierres confirmados en la zona" />
          <Stat label="Citas agendadas" value={dem.citas ?? 0} tone={(dem.citas ?? 0) > 0 ? 'green' : 'flat'}
            framing="visitas al proyecto" />
        </div>
      </Block>

      {/* 5 · ¿Quién compra aquí? */}
      <Block title="¿Quién compra aquí?" hint="a quién le hablas en tu marketing">
        <div style={grid(230)}>
          {ingreso && <Stat label="Poder de compra" value={ingreso.word} tone={ingreso.tone} framing={ingreso.use} />}
          {familia && <Stat label="Perfil de la zona" value={familia.word} tone={familia.tone} framing={familia.use} />}
          {conect && <Stat label="Conectividad" value={conect.word} tone={conect.tone} framing={conect.use} />}
        </div>
      </Block>

      {/* 6 · ¿Qué hay alrededor? (negocios) */}
      <Block title="¿Qué hay alrededor?" hint={neg.available ? `${neg.total} negocios en ${(neg.radius_m / 1000).toFixed(0)} km` : 'todo a la mano = argumento de venta'}>
        <div className="dmx-card" style={{ background: '#fff', padding: '14px 16px' }}>
          <div style={grid(120)}>
            {NEG_CATS.map(c => {
              const n = (neg.by_category || {})[c.k] ?? 0;
              return (
                <div key={c.k} style={{ textAlign: 'center', padding: '6px 4px' }}>
                  <div style={{ fontSize: 20 }}>{c.icon}</div>
                  <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 21, fontWeight: 800, color: neg.available ? 'var(--cream)' : 'var(--cream-3)', lineHeight: 1.2 }}>{neg.available ? n : '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 600 }}>{c.label}</div>
                </div>
              );
            })}
          </div>
          {!neg.available && <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 10, fontStyle: 'italic', textAlign: 'center' }}>○ censo de negocios INEGI · se conecta al sincronizar la zona</div>}
        </div>
      </Block>
    </div>
  );
}
