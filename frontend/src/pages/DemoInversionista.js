/**
 * DemoInversionista — el recorrido guiado PÚBLICO para YC / VCs / desarrolladores.
 * 5 pasos que muestran cómo funciona la plataforma con DATOS 100% SIMULADOS (badge siempre
 * visible). Cero llamadas al backend, cero login, cero datos reales de leads: aunque el link
 * se comparta, no hay nada que filtrar. Es una página estática a propósito — el demo de
 * verdad es la plataforma; esto es la puerta.
 */
import React, { useState } from 'react';

/* ── DATOS SIMULADOS (etiquetados; nada sale de la base real) ── */
const D = {
  colonia: 'Del Valle Centro',
  precioM2: 58400, equilibrioM2: 61200, gap: 4.8,
  atomos: [
    { t: 'Vio 3 deptos de 2 recámaras', peso: 'demanda: 2 rec ▲' },
    { t: 'Filtró por menos de $4.5M', peso: 'presupuesto: $4.5M' },
    { t: 'Comparó Del Valle vs Nápoles', peso: 'zona: 2 candidatas' },
    { t: 'Regresó al mismo depto 3 veces', peso: 'interés: alto 🔥' },
    { t: 'Preguntó por estacionamiento', peso: 'feature crítica' },
  ],
  transiciones: [
    { u: 'Torre Alba · 402', evento: 'VENDIDO en 47 días', delta: 'salió a precio de lista' },
    { u: 'Patio Coyoacán · 12B', evento: 'bajó de precio −6%', delta: 'llevaba 120 días parado' },
    { u: 'Nuevo: Insurgentes 890', evento: 'ALTA · 28 unidades', delta: 'preventa fase 1' },
  ],
  scores: [
    { n: 'Precio de equilibrio', v: '$61,200/m²', des: 'lo que el mercado aguanta hoy en esta colonia' },
    { n: 'Velocidad de absorción', v: '9.3 u/mes', des: 'a este ritmo el inventario dura 5.1 meses' },
    { n: 'Presión de demanda', v: '73/100', des: 'más gente buscando que unidades disponibles' },
    { n: 'Riesgo de la zona', v: 'B+', des: 'suelo firme, sin zona inundable, plusvalía estable' },
  ],
  productos: [
    { n: 'CARFAX de la propiedad', des: 'la historia completa de una unidad: precios, cambios, cuánto tardó en venderse lo similar' },
    { n: 'Índice DMX-30', des: 'el "IPC inmobiliario": 30 zonas de CDMX en un solo número, semana a semana' },
    { n: 'Estudio DMX', des: 'estudio de mercado institucional generado desde el dato vivo, no de encuestas viejas' },
  ],
};

const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(160deg, #0b0f14 0%, #101720 55%, #0b1118 100%)', color: '#F0EBE0', fontFamily: "'DM Sans', system-ui, sans-serif", padding: '0 0 60px' },
  wrap: { maxWidth: 880, margin: '0 auto', padding: '0 22px' },
  badge: { position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '8px 12px', background: 'rgba(210,153,34,0.15)', borderBottom: '1px solid rgba(210,153,34,0.4)', color: '#d29922', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, backdropFilter: 'blur(6px)' },
  h1: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 'clamp(26px, 4.5vw, 40px)', margin: '38px 0 8px', lineHeight: 1.15 },
  sub: { fontSize: 15, color: 'rgba(240,235,224,0.72)', maxWidth: 640 },
  card: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.035)', marginTop: 14 },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#58a6ff' },
  h2: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 22, margin: '6px 0 8px' },
  p: { fontSize: 13.5, color: 'rgba(240,235,224,0.8)', lineHeight: 1.55, margin: 0 },
  chip: { display: 'inline-block', fontSize: 11.5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.35)', color: '#9ecbff', margin: '3px 4px 0 0' },
  btn: (activo) => ({ padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: activo ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.05)', border: activo ? '1px solid rgba(88,166,255,0.6)' : '1px solid rgba(255,255,255,0.12)', color: activo ? '#9ecbff' : 'rgba(240,235,224,0.8)' }),
  big: { fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0EBE0' },
};

const PASOS = [
  { id: 0, nombre: '1 · El problema' },
  { id: 1, nombre: '2 · El dato' },
  { id: 2, nombre: '3 · El genoma' },
  { id: 3, nombre: '4 · Los motores' },
  { id: 4, nombre: '5 · El ciclo completo' },
];

function Paso0() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>El problema</div>
      <h2 style={S.h2}>El mercado inmobiliario de CDMX decide a ciegas</h2>
      <p style={S.p}>
        Un desarrollador fija precios con encuestas de hace 6 meses. Un asesor no sabe qué depto se acaba de
        vender en la cuadra ni por qué. Un comprador no tiene forma de saber si el precio es justo.
        <b style={{ color: '#F0EBE0' }}> El dato existe — pero nadie lo tiene junto, granular y vivo.</b>
      </p>
      <p style={{ ...S.p, marginTop: 10 }}>
        DesarrollosMX construye la capa de datos que falta: del <b style={{ color: '#F0EBE0' }}>predio individual</b> (1.08 millones en catastro)
        a la <b style={{ color: '#F0EBE0' }}>unidad individual</b> (el depto 402, no "la zona"), actualizada con cada interacción del mercado.
      </p>
    </div>
  );
}

function Paso1() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>El dato · simulación</div>
      <h2 style={S.h2}>Radiografía de una colonia: {D.colonia}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '10px 0' }}>
        <div><div style={{ ...S.p, fontSize: 11.5 }}>Precio publicado</div><div style={S.big}>${D.precioM2.toLocaleString('es-MX')}/m²</div></div>
        <div><div style={{ ...S.p, fontSize: 11.5 }}>Precio de equilibrio (motor)</div><div style={{ ...S.big, color: '#4ADE80' }}>${D.equilibrioM2.toLocaleString('es-MX')}/m²</div></div>
        <div><div style={{ ...S.p, fontSize: 11.5 }}>Oportunidad</div><div style={{ ...S.big, color: '#d29922' }}>+{D.gap}%</div></div>
      </div>
      <p style={S.p}>
        Debajo de estos tres números hay <b style={{ color: '#F0EBE0' }}>capas verificables</b>: catastro oficial, uso de suelo, riesgo sísmico e
        inundación, transporte, comercio, y el inventario unidad por unidad. Todo drill-down: de la ciudad → alcaldía → colonia → edificio → depto.
      </p>
    </div>
  );
}

function Paso2() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>El genoma de demanda · simulación</div>
      <h2 style={S.h2}>Cada clic se vuelve dato de mercado</h2>
      <p style={S.p}>Un comprador navega el marketplace. Mira lo que el sistema aprende — sin encuestas, en tiempo real:</p>
      <div style={{ marginTop: 10 }}>
        {D.atomos.map((a, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: i < D.atomos.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none', flexWrap: 'wrap' }}>
            <span style={{ ...S.p, color: '#F0EBE0' }}>{a.t}</span>
            <span style={S.chip}>{a.peso}</span>
          </div>
        ))}
      </div>
      <p style={{ ...S.p, marginTop: 12 }}>
        Multiplica esto por miles de visitantes: es un <b style={{ color: '#F0EBE0' }}>censo vivo de la demanda</b> — qué quiere la gente,
        a qué precio, en qué colonia — que nadie más en México tiene.
      </p>
    </div>
  );
}

function Paso3() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>Los motores · simulación</div>
      <h2 style={S.h2}>El dato crudo se convierte en respuestas</h2>
      <p style={{ ...S.p, marginBottom: 10 }}>La bitácora detecta cada cambio del inventario (el «depa vendido», generalizado a todo):</p>
      {D.transiciones.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13, color: '#F0EBE0' }}>{t.u}</b>
          <span style={{ ...S.chip, background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.35)', color: '#86efac' }}>{t.evento}</span>
          <span style={{ ...S.p, fontSize: 11.5 }}>{t.delta}</span>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 14 }}>
        {D.scores.map((s) => (
          <div key={s.n} style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: 12 }}>
            <div style={{ ...S.p, fontSize: 11.5 }}>{s.n}</div>
            <div style={{ ...S.big, fontSize: 20 }}>{s.v}</div>
            <div style={{ ...S.p, fontSize: 11 }}>{s.des}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Paso4() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>El ciclo completo — el moat</div>
      <h2 style={S.h2}>4 portales que se alimentan entre sí</h2>
      <p style={S.p}>
        <b style={{ color: '#F0EBE0' }}>Compradores</b> generan demanda al navegar → <b style={{ color: '#F0EBE0' }}>desarrolladores</b> ven esa demanda y ajustan
        producto y precio → <b style={{ color: '#F0EBE0' }}>asesores</b> cierran con inteligencia de zona → cada cierre alimenta de vuelta el dato.
        Cada usuario nuevo hace el dato mejor, y el dato mejor atrae al siguiente usuario. <b style={{ color: '#F0EBE0' }}>Ese ciclo es el moat.</b>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>
        {D.productos.map((p) => (
          <div key={p.n} style={{ border: '1px solid rgba(210,153,34,0.3)', borderRadius: 12, padding: 12, background: 'rgba(210,153,34,0.05)' }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14, color: '#d29922' }}>{p.n}</div>
            <div style={{ ...S.p, fontSize: 11.5 }}>{p.des}</div>
          </div>
        ))}
      </div>
      <p style={{ ...S.p, marginTop: 14, fontSize: 12.5 }}>
        Construido AI-native por 1 founder: 42 funciones con precio de lista, ~1,500 pruebas automáticas,
        auditoría de cero-pérdida sobre cada rediseño. <b style={{ color: '#F0EBE0' }}>La plataforma real es el demo</b> — esto es solo la puerta.
      </p>
      <a href="mailto:macosta.ia88@gmail.com?subject=Demo%20DesarrollosMX" style={{ display: 'inline-block', marginTop: 12, padding: '10px 18px', borderRadius: 10, background: 'rgba(88,166,255,0.2)', border: '1px solid rgba(88,166,255,0.6)', color: '#9ecbff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
        Agendar demo en vivo →
      </a>
    </div>
  );
}

export default function DemoInversionista() {
  const [paso, setPaso] = useState(0);
  const CUERPOS = [Paso0, Paso1, Paso2, Paso3, Paso4];
  const Cuerpo = CUERPOS[paso];
  return (
    <div style={S.page} data-testid="demo-inversionista">
      <div style={S.badge}>DEMO · todos los datos de esta página son simulados</div>
      <div style={S.wrap}>
        <h1 style={S.h1}>DesarrollosMX — la capa de datos<br />del mercado inmobiliario de CDMX</h1>
        <p style={S.sub}>Recorrido de 2 minutos: cómo el dato granular (predio → unidad) + la demanda viva se convierten en decisiones de precio, producto e inversión.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '20px 0 4px' }}>
          {PASOS.map((p) => (
            <button key={p.id} data-testid={`paso-${p.id}`} style={S.btn(paso === p.id)} onClick={() => setPaso(p.id)}>{p.nombre}</button>
          ))}
        </div>
        <Cuerpo />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button style={S.btn(false)} disabled={paso === 0} onClick={() => setPaso(paso - 1)}>← Anterior</button>
          {paso < 4 ? <button data-testid="siguiente" style={S.btn(true)} onClick={() => setPaso(paso + 1)}>Siguiente →</button>
            : <span style={{ ...S.p, alignSelf: 'center', fontSize: 11.5 }}>Fin del recorrido · los datos reales viven en la plataforma</span>}
        </div>
      </div>
    </div>
  );
}
