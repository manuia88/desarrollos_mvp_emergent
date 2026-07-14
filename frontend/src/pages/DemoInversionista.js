/**
 * DemoInversionista v3 — recorrido PÚBLICO contado desde el CLIENTE, no desde la arquitectura.
 * Feedback del founder: "si yo fuera desarrollador no me convence, es confuso". Fix: una historia
 * (tu torre de 28 deptos) y 4 DECISIONES que valen millones — cada una con: cómo se decide hoy,
 * qué te dice la plataforma, cuánto vale en PESOS y de dónde sale el número. Cero jerga.
 * Datos de mercado SIMULADOS (badge fijo) · cero backend · cero PII. Compartible sin riesgo.
 */
import React, { useState } from 'react';

const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(160deg, #0b0f14 0%, #101720 55%, #0b1118 100%)', color: '#F0EBE0', fontFamily: "'DM Sans', system-ui, sans-serif", padding: '0 0 60px' },
  wrap: { maxWidth: 880, margin: '0 auto', padding: '0 22px' },
  badge: { position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '8px 12px', background: 'rgba(210,153,34,0.15)', borderBottom: '1px solid rgba(210,153,34,0.4)', color: '#d29922', fontWeight: 700, fontSize: 12, letterSpacing: 0.4, backdropFilter: 'blur(6px)' },
  h1: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 'clamp(25px, 4.4vw, 38px)', margin: '38px 0 8px', lineHeight: 1.15 },
  sub: { fontSize: 15, color: 'rgba(240,235,224,0.72)', maxWidth: 660 },
  card: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.035)', marginTop: 14 },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#58a6ff' },
  h2: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 21, margin: '6px 0 8px' },
  p: { fontSize: 13.5, color: 'rgba(240,235,224,0.8)', lineHeight: 1.55, margin: 0 },
  btn: (activo) => ({ padding: '9px 15px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, fontFamily: "'DM Sans', sans-serif", background: activo ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.05)', border: activo ? '1px solid rgba(88,166,255,0.6)' : '1px solid rgba(255,255,255,0.12)', color: activo ? '#9ecbff' : 'rgba(240,235,224,0.8)' }),
  big: { fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0EBE0' },
  mini: { fontSize: 11, color: 'rgba(240,235,224,0.55)' },
  // los 3 bloques de cada decisión
  hoy: { border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: 13, background: 'rgba(248,113,113,0.04)' },
  dmx: { border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, padding: 13, background: 'rgba(74,222,128,0.04)' },
  dinero: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.4)' },
  fuente: { fontSize: 11, color: 'rgba(240,235,224,0.5)', fontStyle: 'italic', marginTop: 8 },
};

function Decision({ kicker, titulo, hoy, dmxTitulo, dmxCuerpo, dinero, fuente, extra }) {
  return (
    <div style={S.card}>
      <div style={S.kicker}>{kicker}</div>
      <h2 style={S.h2}>{titulo}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginTop: 8 }}>
        <div style={S.hoy}>
          <div style={{ ...S.mini, fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 1 }}>Así se decide hoy</div>
          <p style={{ ...S.p, fontSize: 12.5, marginTop: 6 }}>{hoy}</p>
        </div>
        <div style={S.dmx}>
          <div style={{ ...S.mini, fontWeight: 800, color: '#86efac', textTransform: 'uppercase', letterSpacing: 1 }}>Lo que te dice la plataforma</div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 16, margin: '6px 0 4px' }}>{dmxTitulo}</div>
          <p style={{ ...S.p, fontSize: 12.5 }}>{dmxCuerpo}</p>
        </div>
      </div>
      {extra}
      <div style={S.dinero}>
        <span style={{ fontSize: 20 }}>💰</span>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 15, color: '#d29922' }}>{dinero}</span>
      </div>
      <div style={S.fuente}>¿De dónde sale este número? {fuente}</div>
    </div>
  );
}

function Paso0() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>El punto de partida</div>
      <h2 style={S.h2}>Imagina: acabas de terminar una torre de 28 deptos en Del Valle</h2>
      <p style={S.p}>
        Invertiste ~$120 millones. En los próximos meses vas a tomar <b style={{ color: '#F0EBE0' }}>4 decisiones</b> que
        deciden si ese proyecto te deja 18% o 11%: a qué precio sales, qué construyes después, qué haces con la
        unidad que no se mueve, y a quién le vendes.
      </p>
      <p style={{ ...S.p, marginTop: 10 }}>
        Hoy esas 4 decisiones se toman con la opinión del bróker, el precio del vecino y una encuesta de hace
        6 meses. Este recorrido te muestra, decisión por decisión, <b style={{ color: '#F0EBE0' }}>qué número te da la
        plataforma, cuánto vale en pesos y de dónde sale</b>. Dale a "Siguiente".
      </p>
    </div>
  );
}

const Paso1 = () => (
  <Decision
    kicker="Decisión 1 de 4"
    titulo="¿A qué precio saco la torre?"
    hoy={'Le preguntas al bróker y copias el precio del edificio de junto: "$58,400/m², como todos". Si te pasas, no vendes; si te quedas corto, regalas dinero — y nunca sabes cuál de las dos pasó.'}
    dmxTitulo="El mercado de TU cuadra aguanta $61,200/m²"
    dmxCuerpo={'No es el promedio de la colonia: es el cruce de lo que la gente está buscando AHORA en esa zona (con qué presupuesto) contra lo que de verdad hay disponible. Y por unidad: el 402 vale más que el 102 por piso, vista y cajón — precios distintos, no "precio de torre".'}
    dinero="+$6.7 millones en tu torre de 28 (los ibas a dejar en la mesa)"
    fuente="De las búsquedas reales de compradores en la zona (presupuesto, recámaras) cruzadas contra el inventario disponible unidad por unidad. (En este demo: simulado.)"
  />
);

const Paso2 = () => {
  const filas = [
    ['2 recámaras', 340, 97, '3.5 compradores por unidad', '#4ADE80'],
    ['3 recámaras', 88, 110, '0.8 compradores por unidad', '#f87171'],
  ];
  return (
    <Decision
      kicker="Decisión 2 de 4"
      titulo="¿Qué construyo en el siguiente terreno?"
      hoy="Repites lo que se vendió la vez pasada, o lo que el arquitecto propone. Te enteras de que el mercado quería otra cosa 2 años después, con el edificio terminado."
      dmxTitulo="En esta zona sobran compradores de 2 rec y sobra inventario de 3 rec"
      dmxCuerpo="Antes de comprar el terreno ya sabes qué producto tiene fila de espera y cuál va a tardar años en absorberse:"
      extra={
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {filas.map(([n, dem, of, veredicto, color]) => (
            <div key={n} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <b style={{ fontSize: 13 }}>{n}</b>
                <span style={{ fontSize: 12, fontWeight: 800, color }}>{veredicto}</span>
              </div>
              <div style={{ ...S.mini, margin: '6px 0 2px' }}>buscándolo: {dem} compradores</div>
              <div style={{ height: 10, borderRadius: 5, background: 'rgba(88,166,255,0.7)', width: `${Math.min(100, dem / 3.4)}%` }} />
              <div style={{ ...S.mini, margin: '6px 0 2px' }}>disponible: {of} unidades</div>
              <div style={{ height: 10, borderRadius: 5, background: 'rgba(210,153,34,0.8)', width: `${Math.min(100, of / 3.4)}%` }} />
            </div>
          ))}
        </div>
      }
      dinero="Meses de absorción, no años: el 2-rec se vende ~4× más rápido aquí"
      fuente="Del registro continuo de lo que los compradores buscan (recámaras, presupuesto, zona) contra el inventario vivo. (En este demo: simulado.)"
    />
  );
};

const Paso3 = () => (
  <Decision
    kicker="Decisión 3 de 4"
    titulo="El depto 402 lleva 44 días sin moverse. ¿Espero o bajo el precio?"
    hoy={'"Aguanta, ya llegará el comprador." Tres meses después bajas el precio de golpe, ya pagaste 3 meses de crédito puente y el depto quedó "quemado" en los portales.'}
    dmxTitulo="Está 6% arriba de su punto de venta — y esperar te cuesta más que ajustar"
    dmxCuerpo={'Unidades como el 402 (mismos m², piso, zona) se están vendiendo en ~30 días; el tuyo lleva 44. Su historial completo — precio inicial, visitas, comparables que SÍ cerraron — dice que a $4.84M sale este mes. Cada mes de espera te cuesta ~1.2% solo en costo del dinero.'}
    dinero="Ajustar hoy −6% cuesta menos que esperar 3 meses (−3.6% de financiero + precio quemado)"
    fuente="Del historial de cada unidad (cuándo entró, cambios de precio, cuánto tardaron en venderse las similares). Como el historial de un coche, pero de un depto. (En este demo: simulado.)"
  />
);

const Paso4 = () => (
  <Decision
    kicker="Decisión 4 de 4"
    titulo="¿Quién me compra? (no 'tráfico' — compradores con nombre y presupuesto)"
    hoy="Pagas pauta en portales y redes, te llegan 200 'leads' y 190 son curiosos sin presupuesto. Tu equipo de ventas quema horas filtrando."
    dmxTitulo="12 compradores activos encajan con tu torre AHORA"
    dmxCuerpo={'Personas que en los últimos días buscaron 2 recámaras, en tu zona, con presupuesto que alcanza tu precio — y 3 de ellas regresaron varias veces a unidades como las tuyas (eso es un comprador caliente, no un curioso). Tu equipo llama primero a esos 3.'}
    dinero="Menos pauta desperdiciada, cierres más rápidos: llamas a quien ya te está buscando"
    fuente="De la actividad real de compradores dentro del marketplace (búsquedas, regresos, favoritos), con su consentimiento. (En este demo: simulado.)"
  />
);

function Paso5() {
  const COMO = [
    ['El inventario, unidad por unidad', 'No "la zona": cada depto con su precio, piso, vista y su historial de cambios. Por eso el precio es por unidad y el diagnóstico del 402 existe.'],
    ['Lo que los compradores buscan, en vivo', 'Cada búsqueda real (zona, recámaras, presupuesto) se registra como señal. Por eso sabemos qué producto tiene fila y quién está caliente.'],
    ['Una base pública que no miente', 'Catastro y fuentes de gobierno verifican m² reales, uso de suelo y antigüedad — para que los comparables no se basen en anuncios inflados.'],
  ];
  const REALES = [
    ['1,557', 'pruebas automáticas en verde'],
    ['152', 'herramientas de análisis auditadas'],
    ['4', 'portales conectados (comprador · desarrollador · asesor · admin)'],
  ];
  return (
    <div style={S.card}>
      <div style={S.kicker}>¿Y de dónde sale todo esto?</div>
      <h2 style={S.h2}>Tres capas de dato, un solo sistema</h2>
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {COMO.map(([t, d]) => (
          <div key={t} style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14 }}>{t}</div>
            <p style={{ ...S.p, fontSize: 12.5, marginTop: 4 }}>{d}</p>
          </div>
        ))}
      </div>
      <p style={{ ...S.p, marginTop: 14, fontSize: 12.5 }}>
        Y cada venta que se cierra alimenta el dato de vuelta — <b style={{ color: '#F0EBE0' }}>el sistema es más listo
        cada mes que pasa</b>, y eso no lo puede copiar un competidor comprando software.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 4px' }}>
        {REALES.map(([n, d]) => (
          <div key={d} style={{ border: '1px solid rgba(74,222,128,0.25)', borderRadius: 12, padding: '10px 14px', background: 'rgba(74,222,128,0.03)' }}>
            <span style={{ ...S.big, fontSize: 18, color: '#4ADE80' }}>{n}</span>
            <span style={{ ...S.p, fontSize: 11.5, marginLeft: 6 }}>{d}</span>
          </div>
        ))}
      </div>
      <div style={S.fuente}>Estos tres números sí son reales y verificables — todo lo demás del recorrido es simulación para ilustrar.</div>
      <a href="mailto:macosta.ia88@gmail.com?subject=Demo%20DesarrollosMX" style={{ display: 'inline-block', marginTop: 14, padding: '10px 18px', borderRadius: 10, background: 'rgba(88,166,255,0.2)', border: '1px solid rgba(88,166,255,0.6)', color: '#9ecbff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
        Ver esto con MIS proyectos →
      </a>
    </div>
  );
}

const PASOS = ['Tu torre', '1 · ¿A qué precio?', '2 · ¿Qué construyo?', '3 · ¿Espero o bajo?', '4 · ¿Quién compra?', 'Cómo funciona'];

export default function DemoInversionista() {
  const [paso, setPaso] = useState(0);
  const CUERPOS = [Paso0, Paso1, Paso2, Paso3, Paso4, Paso5];
  const Cuerpo = CUERPOS[paso];
  return (
    <div style={S.page} data-testid="demo-inversionista">
      <div style={S.badge}>DEMO · los datos de mercado de este recorrido son simulados</div>
      <div style={S.wrap}>
        <h1 style={S.h1}>4 decisiones que valen millones.<br />Con datos, no con corazonadas.</h1>
        <p style={S.sub}>Un recorrido de 3 minutos en los zapatos de un desarrollador: qué te dice DesarrollosMX en cada decisión, cuánto vale en pesos y de dónde sale el número.</p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '20px 0 4px' }}>
          {PASOS.map((p, i) => (
            <button key={p} data-testid={`paso-${i}`} style={S.btn(paso === i)} onClick={() => setPaso(i)}>{p}</button>
          ))}
        </div>
        <Cuerpo />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <button style={S.btn(false)} disabled={paso === 0} onClick={() => setPaso(paso - 1)}>← Anterior</button>
          {paso < PASOS.length - 1
            ? <button data-testid="siguiente" style={S.btn(true)} onClick={() => setPaso(paso + 1)}>Siguiente →</button>
            : <span style={{ ...S.p, alignSelf: 'center', fontSize: 11.5 }}>Fin · los datos reales viven en la plataforma</span>}
        </div>
      </div>
    </div>
  );
}
