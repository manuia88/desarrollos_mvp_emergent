/**
 * DemoInversionista — recorrido guiado PÚBLICO para YC / VCs / desarrolladores.
 * DOS tipos de dato, separados a propósito y etiquetados:
 *   · MERCADO SIMULADO (badge fijo): colonias, precios, átomos — inventados para ilustrar.
 *   · PLATAFORMA REAL: los números de la infraestructura (predios en catastro, pruebas,
 *     capacidades auditadas) son verificables en el repo — eso es lo que impresiona a un VC.
 * Interactivo sin backend: drill-down al átomo, genoma acumulándose en vivo, CARFAX de una
 * unidad, espejo demanda↔oferta. Cero llamadas, cero PII: compartible sin riesgo.
 */
import React, { useEffect, useRef, useState } from 'react';

/* ═══ DATOS DE MERCADO SIMULADOS ═══ */
const DRILL = [
  { nivel: 'Ciudad', nombre: 'CDMX', unidades: '48,214', ppm2: '$52,900', dato: '16 alcaldías · 1,089,684 predios con dato catastral real', hint: 'Nadie decide "en CDMX". Baja un nivel.' },
  { nivel: 'Alcaldía', nombre: 'Benito Juárez', unidades: '6,930', ppm2: '$58,100', dato: 'riesgo sísmico bajo · 41 colonias · metro a 9 min promedio', hint: 'Mejor. Pero una alcaldía son 41 realidades distintas.' },
  { nivel: 'Colonia', nombre: 'Del Valle Centro', unidades: '597', ppm2: '$58,400', dato: 'absorción 9.3 u/mes · inventario para 5.1 meses · demanda 73/100', hint: 'Aquí ya se puede fijar precio. Pero el moat está un nivel más abajo…' },
  { nivel: 'Edificio', nombre: 'Torre Alba (Gabriel Mancera 1401)', unidades: '28', ppm2: '$61,000', dato: '2019 · 8 pisos · amenidades: roof, gym · 4 disponibles', hint: 'El edificio exacto. Un nivel más.' },
  { nivel: 'Unidad', nombre: 'Depto 402 · Torre Alba', unidades: '1', ppm2: '$59,200', dato: '2 rec · 2 baños · 84 m² · piso 4 · vista poniente · 1 cajón', hint: 'El ÁTOMO. Cada dato de la plataforma llega hasta aquí. Esto no lo tiene nadie más en México.' },
];

const ATOMOS_POOL = [
  ['Visitante #4,821 vio Depto 402 por 3ª vez', 'interés: alto 🔥'],
  ['Filtró: 2 recámaras < $4.5M en Del Valle', 'presupuesto: $4.5M'],
  ['Comparó Del Valle vs Nápoles', 'zona: 2 candidatas'],
  ['Preguntó a la IA: "¿acepta mascotas?"', 'feature: pet-friendly'],
  ['Guardó Torre Alba en favoritos', 'señal: consideración'],
  ['Visitante #4,902 abrió la calculadora de crédito', 'etapa: financiamiento'],
  ['Buscó "roof garden" en la zona', 'amenidad: roof'],
  ['Pidió cita para visitar el 402', 'señal: visita 🔥🔥'],
  ['Compartió la ficha por WhatsApp', 'señal: decisión en pareja'],
  ['Visitante #5,011 llegó desde Google: "depas del valle"', 'canal: orgánico'],
];

const CARFAX = [
  ['12 feb', 'ALTA en el mercado', '$5,150,000 · $61,300/m²'],
  ['28 mar', 'Bajó de precio −6%', '$4,840,000 · llevaba 44 días sin moverse'],
  ['15 abr', 'Pico de interés', '9 visitantes distintos en una semana'],
  ['30 abr', 'VENDIDO en 77 días', 'cerró ~3% abajo del último precio'],
];
const DMX30 = [100, 100.4, 100.9, 100.7, 101.3, 101.8, 102.1, 101.9, 102.6, 103.1, 103.4, 103.9];

/* ═══ NÚMEROS REALES DE LA PLATAFORMA (verificables en el repo) ═══ */
const REALES = [
  ['1,089,684', 'predios de CDMX con dato catastral cargado'],
  ['152', 'capacidades auditadas y hallables (motores, scores, reportes)'],
  ['1,557', 'pruebas automáticas en verde'],
  ['470', 'endpoints vivos medidos en el último barrido QA'],
  ['42', 'funciones con precio de lista declarado en el código'],
  ['4', 'portales conectados: comprador · desarrollador · asesor · superadmin'],
];

const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(160deg, #0b0f14 0%, #101720 55%, #0b1118 100%)', color: '#F0EBE0', fontFamily: "'DM Sans', system-ui, sans-serif", padding: '0 0 60px' },
  wrap: { maxWidth: 920, margin: '0 auto', padding: '0 22px' },
  badge: { position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '8px 12px', background: 'rgba(210,153,34,0.15)', borderBottom: '1px solid rgba(210,153,34,0.4)', color: '#d29922', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, backdropFilter: 'blur(6px)' },
  h1: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 'clamp(26px, 4.5vw, 40px)', margin: '38px 0 8px', lineHeight: 1.15 },
  sub: { fontSize: 15, color: 'rgba(240,235,224,0.72)', maxWidth: 680 },
  card: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.035)', marginTop: 14 },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#58a6ff' },
  h2: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 22, margin: '6px 0 8px' },
  p: { fontSize: 13.5, color: 'rgba(240,235,224,0.8)', lineHeight: 1.55, margin: 0 },
  chip: { display: 'inline-block', fontSize: 11.5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.35)', color: '#9ecbff', margin: '3px 4px 0 0' },
  btn: (activo) => ({ padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: activo ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.05)', border: activo ? '1px solid rgba(88,166,255,0.6)' : '1px solid rgba(255,255,255,0.12)', color: activo ? '#9ecbff' : 'rgba(240,235,224,0.8)' }),
  big: { fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0EBE0' },
  mini: { fontSize: 11, color: 'rgba(240,235,224,0.55)' },
};

const PASOS = ['1 · El problema', '2 · El drill al átomo', '3 · El genoma en vivo', '4 · Los motores', '5 · La escala real'];

function Paso0() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>El problema</div>
      <h2 style={S.h2}>El mercado inmobiliario de CDMX decide a ciegas</h2>
      <p style={S.p}>
        Un desarrollador fija precios con encuestas de hace 6 meses. Un asesor no sabe qué se vendió en la
        cuadra ni por qué. Un comprador no puede saber si el precio es justo. Las decisiones de millones de
        pesos se toman con promedios de zona — y <b style={{ color: '#F0EBE0' }}>un promedio de zona es una mentira estadística</b>:
        dentro de la misma colonia conviven deptos de $38,000 y de $74,000 el m².
      </p>
      <p style={{ ...S.p, marginTop: 10 }}>
        DesarrollosMX construye la capa de datos que falta: <b style={{ color: '#F0EBE0' }}>granular hasta la unidad individual y
        viva</b> — se actualiza con cada interacción del mercado, no con la encuesta del trimestre pasado. En los
        siguientes 3 pasos lo ves funcionar.
      </p>
    </div>
  );
}

/* ── Paso 2: EL DRILL — de la ciudad al átomo en 5 clics ── */
function Paso1() {
  const [nivel, setNivel] = useState(0);
  const d = DRILL[nivel];
  return (
    <div style={S.card}>
      <div style={S.kicker}>El moat #1 · hipergranularidad — datos simulados</div>
      <h2 style={S.h2}>De la ciudad al átomo en 5 clics</h2>
      <p style={S.p}>La mayoría de las plataformas se quedan en "la zona". Aquí cada número existe en 5 niveles. Haz el drill:</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {DRILL.map((x, i) => (
          <button key={x.nivel} data-testid={`drill-${i}`} style={S.btn(i === nivel)} onClick={() => setNivel(i)}>
            {i > 0 ? '↓ ' : ''}{x.nivel}
          </button>
        ))}
      </div>
      <div style={{ border: '1px solid rgba(88,166,255,0.3)', borderRadius: 12, padding: 16, background: 'rgba(88,166,255,0.05)' }}>
        <div style={{ ...S.mini, textTransform: 'uppercase', letterSpacing: 1 }}>{d.nivel}</div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 20 }}>{d.nombre}</div>
        <div style={{ display: 'flex', gap: 24, margin: '10px 0', flexWrap: 'wrap' }}>
          <div><div style={S.mini}>unidades en venta</div><div style={S.big}>{d.unidades}</div></div>
          <div><div style={S.mini}>precio medio</div><div style={S.big}>{d.ppm2}/m²</div></div>
        </div>
        <p style={{ ...S.p, fontSize: 12.5 }}>{d.dato}</p>
        <p style={{ ...S.p, fontSize: 12, color: '#d29922', marginTop: 8 }}>→ {d.hint}</p>
      </div>
      {nivel === DRILL.length - 1 && (
        <p style={{ ...S.p, marginTop: 12, fontSize: 12.5 }}>
          Nota el precio: el promedio de colonia decía $58,400 — <b style={{ color: '#F0EBE0' }}>este depto vale $59,200 por su piso,
          vista y cajón</b>. Esa diferencia, multiplicada por 28 unidades de un edificio, es el error de millones que
          comete quien fija precios con promedios.
        </p>
      )}
    </div>
  );
}

/* ── Paso 3: EL GENOMA — átomos acumulándose en vivo + espejo ── */
function Paso2() {
  const [vivos, setVivos] = useState(1);
  const timer = useRef(null);
  useEffect(() => {
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reducido) { setVivos(ATOMOS_POOL.length); return; }
    timer.current = setInterval(() => {
      setVivos((v) => (v >= ATOMOS_POOL.length ? v : v + 1));
    }, 1200);
    return () => clearInterval(timer.current);
  }, []);
  const demanda2rec = 340, oferta2rec = 97;
  return (
    <div style={S.card}>
      <div style={S.kicker}>El moat #2 · el genoma de demanda — datos simulados</div>
      <h2 style={S.h2}>Cada clic del mercado se vuelve un átomo de dato</h2>
      <p style={S.p}>Esto es lo que el sistema aprende AHORA MISMO mientras compradores reales navegan (aquí simulado):</p>
      <div style={{ margin: '10px 0', minHeight: 200 }}>
        {ATOMOS_POOL.slice(0, vivos).map((a, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', opacity: i === vivos - 1 ? 1 : 0.75 }}>
            <span style={{ ...S.p, color: '#F0EBE0', fontSize: 12.5 }}>{a[0]}</span>
            <span style={S.chip}>{a[1]}</span>
          </div>
        ))}
        {vivos < ATOMOS_POOL.length && <div style={{ ...S.mini, padding: '8px 0' }}>▌ escuchando el mercado…</div>}
      </div>
      <div style={{ border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, padding: 14, background: 'rgba(74,222,128,0.04)' }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14, marginBottom: 8 }}>El espejo: ¿qué quiere la gente vs qué hay? (2 recámaras · Del Valle)</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <div>
            <div style={S.mini}>buscándolo: {demanda2rec} compradores activos</div>
            <div style={{ height: 14, borderRadius: 7, background: 'rgba(88,166,255,0.7)', width: '100%' }} />
          </div>
          <div>
            <div style={S.mini}>disponible: {oferta2rec} unidades</div>
            <div style={{ height: 14, borderRadius: 7, background: 'rgba(210,153,34,0.8)', width: `${Math.round(oferta2rec / demanda2rec * 100)}%` }} />
          </div>
        </div>
        <p style={{ ...S.p, fontSize: 12.5, marginTop: 8 }}>
          <b style={{ color: '#4ADE80' }}>3.5 compradores por unidad.</b> Un desarrollador que ve esto ANTES de comprar el terreno
          ya ganó. Eso es un censo vivo de demanda — sin encuestas, sin esperar al trimestre.
        </p>
      </div>
    </div>
  );
}

/* ── Paso 4: LOS MOTORES — CARFAX + equilibrio + índice ── */
function Paso3() {
  const w = 260, h = 46;
  const min = Math.min(...DMX30), max = Math.max(...DMX30);
  const pts = DMX30.map((v, i) => `${(i / (DMX30.length - 1)) * w},${h - ((v - min) / (max - min)) * (h - 6) - 3}`).join(' ');
  return (
    <div style={S.card}>
      <div style={S.kicker}>Los motores — datos simulados</div>
      <h2 style={S.h2}>El dato crudo se convierte en respuestas que valen dinero</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 10 }}>
        <div style={{ border: '1px solid rgba(210,153,34,0.35)', borderRadius: 12, padding: 14, background: 'rgba(210,153,34,0.04)' }}>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14, color: '#d29922' }}>CARFAX del Depto 402</div>
          <div style={S.mini}>la vida completa de UNA unidad — como el historial de un coche</div>
          <div style={{ marginTop: 8 }}>
            {CARFAX.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 8, padding: '6px 0', borderLeft: '2px solid rgba(210,153,34,0.35)', paddingLeft: 10, marginLeft: 4 }}>
                <span style={{ ...S.mini, fontWeight: 700 }}>{e[0]}</span>
                <span style={{ ...S.p, fontSize: 12 }}><b style={{ color: '#F0EBE0' }}>{e[1]}</b> · {e[2]}</span>
              </div>
            ))}
          </div>
          <p style={{ ...S.p, fontSize: 11.5, marginTop: 6 }}>El comprador negocia informado. El vendedor fija el precio correcto desde el día 1 (y no pierde 44 días).</p>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14 }}>Precio de equilibrio</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <div><div style={S.mini}>publicado</div><div style={{ ...S.big, fontSize: 19 }}>$58,400/m²</div></div>
              <div><div style={S.mini}>lo que el mercado aguanta</div><div style={{ ...S.big, fontSize: 19, color: '#4ADE80' }}>$61,200/m²</div></div>
              <span style={{ ...S.chip, background: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.4)', color: '#86efac' }}>+4.8% en la mesa</span>
            </div>
            <p style={{ ...S.p, fontSize: 11.5, marginTop: 6 }}>En un edificio de 28 unidades son ~$6.7M MXN que el desarrollador estaba regalando.</p>
          </div>
          <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14 }}>Índice DMX-30 <span style={S.mini}>· el "IPC inmobiliario" de CDMX</span></div>
            <svg width={w} height={h} style={{ display: 'block', marginTop: 6, maxWidth: '100%' }} aria-label="curva del índice DMX-30, 12 semanas simuladas">
              <polyline points={pts} fill="none" stroke="#58a6ff" strokeWidth="2" />
            </svg>
            <p style={{ ...S.p, fontSize: 11.5, marginTop: 4 }}>+3.9% en 12 semanas (simulado). Un número, semana a semana, licenciable a bancos y fondos.</p>
          </div>
        </div>
      </div>
      <p style={{ ...S.p, marginTop: 12, fontSize: 12.5 }}>
        Y la bitácora universal detecta <b style={{ color: '#F0EBE0' }}>cualquier</b> cambio del inventario: el "depa vendido", el que bajó de
        precio, el proyecto nuevo que entró — todo queda en el historial, para siempre.
      </p>
    </div>
  );
}

/* ── Paso 5: LA ESCALA REAL (verificable) + el flywheel ── */
function Paso4() {
  return (
    <div style={S.card}>
      <div style={{ ...S.kicker, color: '#4ADE80' }}>La escala — NÚMEROS REALES, verificables en el repo</div>
      <h2 style={S.h2}>Todo esto ya existe. Construido por 1 founder + IA.</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, margin: '12px 0' }}>
        {REALES.map(([n, des]) => (
          <div key={des} style={{ border: '1px solid rgba(74,222,128,0.25)', borderRadius: 12, padding: 12, background: 'rgba(74,222,128,0.03)' }}>
            <div style={{ ...S.big, color: '#4ADE80' }}>{n}</div>
            <div style={{ ...S.p, fontSize: 11.5 }}>{des}</div>
          </div>
        ))}
      </div>
      <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, marginTop: 4 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14, marginBottom: 6 }}>El ciclo que se defiende solo (el moat compuesto)</div>
        <p style={{ ...S.p, fontSize: 12.5 }}>
          <b style={{ color: '#9ecbff' }}>Compradores</b> navegan y generan demanda → <b style={{ color: '#9ecbff' }}>desarrolladores</b> ven esa demanda y ajustan
          producto y precio → <b style={{ color: '#9ecbff' }}>asesores</b> cierran con inteligencia de zona → cada cierre alimenta el dato → el dato
          mejor atrae al siguiente usuario. Cada vuelta hace la copia más cara: <b style={{ color: '#F0EBE0' }}>un competidor tendría que replicar
          el software Y la historia acumulada del dato — y la historia no se puede comprar.</b>
        </p>
      </div>
      <p style={{ ...S.p, marginTop: 12, fontSize: 12.5 }}>
        Los datos de mercado de este recorrido son simulados. La plataforma, los motores y los números de arriba son reales —
        <b style={{ color: '#F0EBE0' }}> la plataforma completa es el verdadero demo.</b>
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
      <div style={S.badge}>DEMO · los datos de mercado son simulados · los números de plataforma del paso 5 son reales</div>
      <div style={S.wrap}>
        <h1 style={S.h1}>DesarrollosMX — la capa de datos<br />del mercado inmobiliario de CDMX</h1>
        <p style={S.sub}>Recorrido de 3 minutos: cómo el dato granular (predio → unidad) + la demanda viva se convierten en decisiones de precio, producto e inversión.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '20px 0 4px' }}>
          {PASOS.map((p, i) => (
            <button key={p} data-testid={`paso-${i}`} style={S.btn(paso === i)} onClick={() => setPaso(i)}>{p}</button>
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
