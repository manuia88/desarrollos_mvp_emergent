/**
 * DemoInversionista v4 — VISUAL. Feedback founder: "lo llenaste de letras — gráficas, tablas,
 * números, barras". Misma historia (tu torre · 4 decisiones en pesos) pero cada paso es un
 * mini-tablero: la torre dibujada unidad por unidad, escala de precio con la brecha sombreada,
 * barras demanda/oferta, línea de vida del 402, embudo de leads y tabla de compradores calientes.
 * Todo CSS/SVG inline (sin imágenes externas): compartible, sin backend, sin PII.
 */
import React, { useState } from 'react';

const C = { azul: '#58a6ff', verde: '#4ADE80', rojo: '#f87171', oro: '#d29922', crema: '#F0EBE0', gris: 'rgba(240,235,224,0.6)' };
const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(160deg, #0b0f14 0%, #101720 55%, #0b1118 100%)', color: C.crema, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '0 0 60px' },
  wrap: { maxWidth: 900, margin: '0 auto', padding: '0 22px' },
  badge: { position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '8px 12px', background: 'rgba(210,153,34,0.15)', borderBottom: '1px solid rgba(210,153,34,0.4)', color: C.oro, fontWeight: 700, fontSize: 12, backdropFilter: 'blur(6px)' },
  h1: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 'clamp(25px, 4.4vw, 38px)', margin: '34px 0 8px', lineHeight: 1.15 },
  sub: { fontSize: 14.5, color: 'rgba(240,235,224,0.72)', maxWidth: 660 },
  card: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, background: 'rgba(255,255,255,0.035)', marginTop: 14 },
  panel: { border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.02)' },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: C.azul },
  h2: { fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize: 21, margin: '6px 0 10px' },
  p: { fontSize: 13, color: 'rgba(240,235,224,0.8)', lineHeight: 1.5, margin: 0 },
  btn: (a) => ({ padding: '9px 15px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, fontFamily: "'DM Sans', sans-serif", background: a ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.05)', border: a ? `1px solid ${C.azul}99` : '1px solid rgba(255,255,255,0.12)', color: a ? '#9ecbff' : 'rgba(240,235,224,0.8)' }),
  big: (color = C.crema, size = 26) => ({ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: size, color, lineHeight: 1.1 }),
  mini: { fontSize: 10.5, color: 'rgba(240,235,224,0.55)' },
  dinero: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(210,153,34,0.1)', border: `1px solid ${C.oro}66` },
  fuente: { fontSize: 10.5, color: 'rgba(240,235,224,0.45)', fontStyle: 'italic', marginTop: 8 },
  th: { textAlign: 'left', fontSize: 10.5, color: 'rgba(240,235,224,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, padding: '4px 8px' },
  td: { fontSize: 12.5, padding: '7px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' },
};

const Dinero = ({ t }) => (
  <div style={S.dinero}><span style={{ fontSize: 18 }}>💰</span>
    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 15, color: C.oro }}>{t}</span></div>
);
const Fuente = ({ t }) => <div style={S.fuente}>¿De dónde sale? {t} (En este demo: simulado.)</div>;
const Stat = ({ n, l, color = C.crema }) => (
  <div style={{ ...S.panel, minWidth: 120, flex: 1 }}>
    <div style={S.big(color, 22)}>{n}</div>
    <div style={{ ...S.mini, marginTop: 2 }}>{l}</div>
  </div>
);
const Barra = ({ pct, color, label, valor }) => (
  <div style={{ margin: '5px 0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={S.mini}>{label}</span><span style={{ ...S.mini, fontWeight: 800, color: C.crema }}>{valor}</span>
    </div>
    <div style={{ height: 13, borderRadius: 7, background: 'rgba(255,255,255,0.06)', marginTop: 3 }}>
      <div style={{ height: 13, borderRadius: 7, background: color, width: `${pct}%`, transition: 'width .4s' }} />
    </div>
  </div>
);

/* ── LA TORRE: 28 unidades dibujadas (7 pisos × 4) ── */
const UNIDADES = [];
for (let piso = 7; piso >= 1; piso--) for (let u = 1; u <= 4; u++) {
  const id = `${piso}0${u}`;
  UNIDADES.push({ id, piso, estado: piso <= 2 ? 'vendida' : (id === '402' ? 'parada' : (piso >= 6 ? 'apartada' : 'disponible')) });
}
const COLOR_ESTADO = { vendida: C.verde, disponible: C.azul, apartada: C.oro, parada: C.rojo };
function Torre({ chica }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, maxWidth: chica ? 180 : 240 }}>
        {UNIDADES.map((u) => (
          <div key={u.id} title={`Depto ${u.id} · ${u.estado}`}
            style={{ aspectRatio: '1.5', borderRadius: 4, background: `${COLOR_ESTADO[u.estado]}${u.estado === 'parada' ? 'ee' : '55'}`, border: `1px solid ${COLOR_ESTADO[u.estado]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, color: u.estado === 'parada' ? '#000' : C.crema }}>
            {u.id}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        {Object.entries({ vendida: '8 vendidas', apartada: '8 apartadas', disponible: '11 disponibles', parada: '1 parada (402)' }).map(([k, v]) => (
          <span key={k} style={{ ...S.mini, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: COLOR_ESTADO[k], display: 'inline-block' }} />{v}
          </span>
        ))}
      </div>
    </div>
  );
}

function Paso0() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>El punto de partida</div>
      <h2 style={S.h2}>Tu torre: 28 deptos en Del Valle</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Torre />
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat n="$120M" l="invertidos" />
            <Stat n="18% vs 11%" l="tu retorno, según estas 4 decisiones" color={C.oro} />
          </div>
          <div style={S.panel}>
            {['1 · ¿A qué precio salgo?', '2 · ¿Qué construyo después?', '3 · ¿Qué hago con el 402 parado?', '4 · ¿A quién le vendo?'].map((d) => (
              <div key={d} style={{ ...S.p, fontSize: 12.5, padding: '4px 0', fontWeight: 700 }}>{d}</div>
            ))}
            <p style={{ ...S.mini, marginTop: 4 }}>Hoy se deciden con el bróker, el precio del vecino y una encuesta vieja. Mira la diferencia →</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── D1: escala de precio con la brecha sombreada + tabla por unidad ── */
function Paso1() {
  const min = 55000, max = 64000;
  const x = (v) => ((v - min) / (max - min)) * 100;
  const filas = [
    ['102', '1', 'interior', '$56,900'], ['205', '2', 'calle', '$58,800'],
    ['402', '4', 'poniente + cajón', '$59,200'], ['PH-701', '7', 'roof privado', '$66,400'],
  ];
  return (
    <div style={S.card}>
      <div style={S.kicker}>Decisión 1 de 4 · precio de salida</div>
      <h2 style={S.h2}>El vecino te ancla en $58,400. Tu cuadra aguanta $61,200.</h2>
      <div style={S.panel}>
        <div style={{ position: 'relative', height: 74, margin: '6px 4px 0' }}>
          <div style={{ position: 'absolute', top: 34, left: 0, right: 0, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ position: 'absolute', top: 34, left: `${x(58400)}%`, width: `${x(61200) - x(58400)}%`, height: 10, background: `${C.verde}44`, border: `1px solid ${C.verde}88` }} />
          <div style={{ position: 'absolute', top: 8, left: `${x(58400)}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ ...S.mini, color: C.rojo, fontWeight: 800 }}>el vecino</div>
            <div style={{ ...S.big(C.rojo, 15) }}>$58,400</div>
          </div>
          <div style={{ position: 'absolute', top: 34, left: `${x(58400)}%`, width: 2, height: 16, background: C.rojo }} />
          <div style={{ position: 'absolute', top: 50, left: `${x(61200)}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ ...S.big(C.verde, 15) }}>$61,200</div>
            <div style={{ ...S.mini, color: C.verde, fontWeight: 800 }}>lo que aguanta TU cuadra</div>
          </div>
          <div style={{ position: 'absolute', top: 28, left: `${x(61200)}%`, width: 2, height: 22, background: C.verde }} />
        </div>
        <div style={{ ...S.mini, textAlign: 'center', marginTop: 4 }}>precio por m² · la zona verde es dinero tuyo</div>
      </div>
      <div style={{ ...S.panel, marginTop: 10, overflowX: 'auto' }}>
        <div style={{ ...S.mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Y no un precio de torre: un precio POR UNIDAD</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={S.th}>Depto</th><th style={S.th}>Piso</th><th style={S.th}>Vista</th><th style={S.th}>Su precio/m²</th></tr></thead>
          <tbody>{filas.map((f) => (
            <tr key={f[0]}><td style={{ ...S.td, fontWeight: 800 }}>{f[0]}</td><td style={S.td}>{f[1]}</td><td style={S.td}>{f[2]}</td><td style={{ ...S.td, fontWeight: 800, color: C.verde }}>{f[3]}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <Dinero t="+$6.7 millones en tu torre de 28 (los ibas a dejar en la mesa)" />
      <Fuente t="búsquedas reales de compradores (presupuesto, recámaras) × inventario disponible, unidad por unidad." />
    </div>
  );
}

/* ── D2: demanda vs oferta por producto + meses para agotarse ── */
function Paso2() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>Decisión 2 de 4 · el siguiente terreno</div>
      <h2 style={S.h2}>Aquí sobran compradores de 2 rec — y sobra inventario de 3 rec</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        <div style={{ ...S.panel, border: `1px solid ${C.verde}55` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b style={{ fontSize: 14 }}>2 recámaras</b><span style={{ ...S.big(C.verde, 20) }}>3.5×</span>
          </div>
          <div style={S.mini}>compradores por unidad disponible</div>
          <Barra pct={100} color={C.azul} label="buscándolo" valor="340 compradores" />
          <Barra pct={29} color={C.oro} label="disponible" valor="97 unidades" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Stat n="7 meses" l="para agotarse" color={C.verde} />
          </div>
        </div>
        <div style={{ ...S.panel, border: `1px solid ${C.rojo}44` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b style={{ fontSize: 14 }}>3 recámaras</b><span style={{ ...S.big(C.rojo, 20) }}>0.8×</span>
          </div>
          <div style={S.mini}>compradores por unidad disponible</div>
          <Barra pct={26} color={C.azul} label="buscándolo" valor="88 compradores" />
          <Barra pct={32} color={C.oro} label="disponible" valor="110 unidades" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Stat n="29 meses" l="para agotarse" color={C.rojo} />
          </div>
        </div>
      </div>
      <Dinero t="Sabes el mix ANTES de comprar el terreno: 7 meses de venta, no 29" />
      <Fuente t="registro continuo de qué busca la gente (recámaras, presupuesto, zona) vs el inventario vivo." />
    </div>
  );
}

/* ── D3: línea de vida del 402 + costo de esperar ── */
function Paso3() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>Decisión 3 de 4 · la unidad que no se mueve</div>
      <h2 style={S.h2}>El 402 lleva 44 días parado. Los similares se venden en 30.</h2>
      <div style={S.panel}>
        <Barra pct={68} color={C.verde} label="deptos similares (mismos m², zona) · tiempo típico de venta" valor="30 días" />
        <Barra pct={100} color={C.rojo} label="tu 402 · hoy" valor="44 días y contando" />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <Stat n="+6%" l="arriba de su punto de venta" color={C.rojo} />
          <Stat n="9" l="visitas en 44 días (similares: 22)" />
          <Stat n="$4.84M" l="el precio al que SÍ sale este mes" color={C.verde} />
        </div>
      </div>
      <div style={{ ...S.panel, marginTop: 10, overflowX: 'auto' }}>
        <div style={{ ...S.mini, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Los dos caminos, en dinero</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={S.th}>Camino</th><th style={S.th}>Precio</th><th style={S.th}>Costo del dinero</th><th style={S.th}>Total</th></tr></thead>
          <tbody>
            <tr><td style={{ ...S.td, fontWeight: 800, color: C.verde }}>Ajustar HOY −6%</td><td style={S.td}>−$310K</td><td style={S.td}>$0</td><td style={{ ...S.td, fontWeight: 800 }}>−$310K</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 800, color: C.rojo }}>"Aguantar" 3 meses</td><td style={S.td}>−$310K igual*</td><td style={S.td}>−$186K (1.2%/mes)</td><td style={{ ...S.td, fontWeight: 800, color: C.rojo }}>−$496K</td></tr>
          </tbody>
        </table>
        <div style={{ ...S.mini, marginTop: 4 }}>*al final bajas el precio de todos modos — pero ya pagaste 3 meses de crédito puente y el depto quedó "quemado" en portales.</div>
      </div>
      <Dinero t="Decidir con el historial ahorra $186K en ESTA unidad — multiplícalo por tu inventario" />
      <Fuente t="el historial de cada unidad (entrada, cambios, visitas) + cuánto tardaron los similares que SÍ cerraron." />
    </div>
  );
}

/* ── D4: embudo pauta vs compradores calientes con tabla ── */
function Paso4() {
  const calientes = [
    ['Comprador A', '2 rec · $4.6M', 'visitó el 402 tres veces', '🔥🔥🔥'],
    ['Comprador B', '2 rec · $4.9M', 'guardó Torre Alba en favoritos', '🔥🔥'],
    ['Comprador C', '2 rec · $4.5M', 'pidió cita en un similar a 2 cuadras', '🔥🔥'],
  ];
  return (
    <div style={S.card}>
      <div style={S.kicker}>Decisión 4 de 4 · a quién le vendes</div>
      <h2 style={S.h2}>No "tráfico": compradores con presupuesto y nombre</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        <div style={{ ...S.panel, border: `1px solid ${C.rojo}44` }}>
          <div style={{ ...S.mini, fontWeight: 800, color: C.rojo, textTransform: 'uppercase' }}>Hoy: pauta en portales</div>
          <Barra pct={100} color={C.rojo} label="leads que llegan" valor="200" />
          <Barra pct={95} color="rgba(248,113,113,0.4)" label="curiosos sin presupuesto" valor="190" />
          <Barra pct={5} color={C.verde} label="compradores reales" valor="10" />
          <div style={{ ...S.mini, marginTop: 6 }}>tu equipo quema horas filtrando</div>
        </div>
        <div style={{ ...S.panel, border: `1px solid ${C.verde}55` }}>
          <div style={{ ...S.mini, fontWeight: 800, color: C.verde, textTransform: 'uppercase' }}>Con la plataforma</div>
          <Barra pct={40} color={C.azul} label="encajan con tu torre (zona+presupuesto+producto)" valor="12" />
          <Barra pct={12} color={C.verde} label="CALIENTES: regresaron varias veces" valor="3" />
          <div style={{ ...S.mini, marginTop: 6 }}>tu equipo llama primero a estos 3 ↓</div>
        </div>
      </div>
      <div style={{ ...S.panel, marginTop: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={S.th}>Quién</th><th style={S.th}>Busca</th><th style={S.th}>Señal</th><th style={S.th}>Temperatura</th></tr></thead>
          <tbody>{calientes.map((f) => (
            <tr key={f[0]}><td style={{ ...S.td, fontWeight: 800 }}>{f[0]}</td><td style={S.td}>{f[1]}</td><td style={S.td}>{f[2]}</td><td style={S.td}>{f[3]}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <Dinero t="Cierras antes y gastas menos pauta: llamas a quien ya te está buscando" />
      <Fuente t="actividad real de compradores en el marketplace (búsquedas, regresos, favoritos), con su consentimiento." />
    </div>
  );
}

/* ── Cómo funciona: 3 capas + números reales, casi sin prosa ── */
function Paso5() {
  return (
    <div style={S.card}>
      <div style={S.kicker}>¿De dónde sale todo esto?</div>
      <h2 style={S.h2}>Tres capas de dato, un sistema que aprende solo</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {[['🏢', 'Inventario unidad por unidad', 'cada depto con su precio, piso, vista e historial'],
          ['👀', 'Lo que buscan los compradores, en vivo', 'cada búsqueda real se vuelve señal de demanda'],
          ['🏛️', 'Base pública que verifica', 'catastro y gobierno: m² reales, uso de suelo, antigüedad']].map(([e, t, d]) => (
          <div key={t} style={S.panel}>
            <div style={{ fontSize: 22 }}>{e}</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 13.5, margin: '4px 0 2px' }}>{t}</div>
            <div style={{ ...S.mini }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <Stat n="1,557" l="pruebas automáticas en verde (real)" color={C.verde} />
        <Stat n="152" l="herramientas de análisis auditadas (real)" color={C.verde} />
        <Stat n="4" l="portales conectados (real)" color={C.verde} />
      </div>
      <p style={{ ...S.p, marginTop: 12, fontSize: 12.5 }}>
        Cada venta cerrada alimenta el dato de vuelta: <b style={{ color: C.crema }}>el sistema es más listo cada mes</b> — y esa historia acumulada no se puede copiar comprando software.
      </p>
      <a href="mailto:macosta.ia88@gmail.com?subject=Demo%20DesarrollosMX" style={{ display: 'inline-block', marginTop: 12, padding: '10px 18px', borderRadius: 10, background: 'rgba(88,166,255,0.2)', border: `1px solid ${C.azul}99`, color: '#9ecbff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
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
        <p style={S.sub}>3 minutos en los zapatos de un desarrollador: el número que te da la plataforma en cada decisión, cuánto vale en pesos y de dónde sale.</p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '18px 0 4px' }}>
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
