/**
 * VentasIntel — Cockpit "Pulso de ventas" (pestaña Ventas de la ficha del proyecto).
 * Doctrina del dato práctico: cada métrica = NÚMERO + PLAZO + COMPARATIVO + PARA QUÉ SIRVE.
 * Cablea /sales-intel: agotamiento vs entrega, what-if de precio (elasticidad real),
 * proyección 12m, mix por prototipo, margen. Ritmo real se autollena al registrar ventas.
 */
import React, { useEffect, useState } from 'react';
import { getSalesIntel } from '../../api/developer';
import { fmtMXN, fmtFull, grid, Block, Stat, BigCard } from './cockpitUI';

const signedMXN = (v) => (v == null ? '—' : (v >= 0 ? '+' : '−') + fmtMXN(Math.abs(v)));
const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const MARGIN_TONE = { verde: 'green', amarillo: 'amber', rojo: 'red', gris: 'flat' };

export default function VentasIntel({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(false);
    getSalesIntel(slug).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  if (err) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>No se pudo cargar el pulso de ventas ahora.</div>;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando pulso de ventas…</div>;

  const s = d.summary || {};
  const so = d.sellout || {};
  const fc = d.forecast || {};
  const wf = d.whatif || {};
  const up = wf.up_3 || {};
  const down = wf.down_3 || {};
  const protos = d.prototypes || [];
  const m = d.margin || {};

  const colocPct = s.sold_pct ?? 0;
  const colocTone = colocPct >= 50 ? 'green' : colocPct >= 25 ? 'amber' : 'red';

  return (
    <div data-testid="ventas-intel" style={{ marginBottom: 22 }}>
      {/* 1 · La joya: ¿agotas a tiempo? */}
      <Block title="¿Vas a vender todo a tiempo?" hint="tu ritmo contra la fecha de entrega">
        <div style={grid(190)}>
          <Stat label="Colocado" value={colocPct} unit="%" tone={colocTone}
            framing={`${s.sold_units ?? 0} vendidas + ${s.reserved_units ?? 0} apartadas de ${s.units_total ?? 0}`} />
          <Stat label="Ritmo de venta" value={so.rate_per_month ?? '—'} unit=" uds/mes"
            tone={(so.rate_per_month ?? 0) >= 1.5 ? 'green' : 'amber'}
            framing={so.ritmo_real ? 'según tus ventas con fecha' : 'estimado por absorción de la zona'}
            stub={!so.ritmo_real} />
          <Stat label="Se agota en" value={so.months_to_sellout ?? '—'} unit=" meses"
            tone={so.before_delivery ? 'green' : 'red'}
            framing={so.months_to_delivery == null ? 'sin fecha de entrega'
              : so.before_delivery
                ? `agotas ${so.months_to_delivery - so.months_to_sellout} meses antes de entregar ✓`
                : `pero entregas en ${so.months_to_delivery} meses → llegas con ~${so.leftover_at_delivery} uds sin vender. Acelera marketing o ajusta precio.`} />
          <Stat label="Inventario por colocar" value={so.available ?? 0} unit=" uds"
            tone={(so.available ?? 0) > 0 ? 'amber' : 'green'} framing="unidades disponibles hoy" />
        </div>
      </Block>

      {/* 2 · La joya productiva: what-if de precio */}
      {wf.available && (
        <Block title="Mueve el precio: ¿cuánto ganas o pierdes?" hint="impacto real a 12 meses">
          <div style={grid(230)}>
            <BigCard icon="⬆️" name="Subir precio 3%" tone={up.revenue_delta_mxn >= 0 ? 'green' : 'red'}
              tag={up.revenue_delta_mxn >= 0 ? 'conviene' : null}
              big={signedMXN(up.revenue_delta_mxn)} sub={`de ingreso · ${pct(up.velocity_change_pct)} de velocidad`}
              framing={up.revenue_delta_mxn >= 0
                ? 'Ganas más aunque vendas un poco más lento. Conviene si no traes prisa.'
                : 'No conviene: el ingreso cae más de lo que ayuda.'}
              note={up.data_quality !== 'high' ? 'estimación · se afina con más ventas en la zona' : null} />
            <BigCard icon="⬇️" name="Bajar precio 3%" tone={down.revenue_delta_mxn >= 0 ? 'green' : 'red'}
              tag={down.revenue_delta_mxn >= 0 ? 'acelera' : 'cuesta caro'}
              big={signedMXN(down.revenue_delta_mxn)} sub={`de ingreso · ${pct(down.velocity_change_pct)} de velocidad`}
              framing={down.revenue_delta_mxn >= 0
                ? 'Aceleras ventas sin perder ingreso. Úsalo si necesitas liquidez.'
                : 'Pierdes más ingreso del que ganas en velocidad. Mejor no bajar.'}
              note={down.data_quality !== 'high' ? 'estimación · se afina con más ventas en la zona' : null} />
          </div>
        </Block>
      )}

      {/* 3 · Proyección a 12 meses */}
      <Block title="¿Hacia dónde vas?" hint="proyección a 12 meses al ritmo actual">
        <div style={grid(190)}>
          <Stat label="Venderías (12m)" value={fc.proj_12m ? `+${fc.proj_12m.base}` : '—'} unit=" uds"
            tone="green" framing={fc.proj_12m ? `entre ${fc.proj_12m.pesimista} y ${fc.proj_12m.optimista} según el mercado` : 'sin proyección'} />
          <Stat label="Llegarías a" value={fc.colocado_pct_12m ?? '—'} unit="% colocado"
            tone={(fc.colocado_pct_12m ?? 0) >= 70 ? 'green' : 'amber'} framing="en un año, sumando lo ya colocado" />
          <Stat label="Ingreso proyectado" value={fmtMXN(fc.revenue_12m_base)} tone="green"
            framing="ventas estimadas el próximo año a este ritmo" />
        </div>
      </Block>

      {/* 4 · ¿Qué prototipo se mueve? */}
      {protos.length > 0 && (
        <Block title="¿Qué prototipo se mueve?" hint="dónde está tu inventario lento">
          <div style={grid(170)}>
            {protos.map((p) => {
              const t = p.pct_colocado >= 50 ? 'green' : p.pct_colocado >= 25 ? 'amber' : 'red';
              return (
                <Stat key={p.prototype} label={`Prototipo ${p.prototype}`} value={p.pct_colocado} unit="% colocado"
                  tone={t}
                  framing={`${p.disponible} disponibles de ${p.total}${p.pct_colocado < 25 ? ' · el más lento, empújalo' : ''}`} />
              );
            })}
          </div>
        </Block>
      )}

      {/* 5 · Tu margen */}
      {m && (m.margin_pct != null) && (
        <Block title="Tu margen" hint="cuánto te queda por m²">
          <div style={grid(190)}>
            <Stat label="Margen estimado" value={m.margin_pct} unit="%" tone={MARGIN_TONE[m.color] || 'flat'}
              framing={m.verdict || 'margen sobre costo de construcción'} />
            <Stat label="Tu precio /m²" value={fmtFull(m.price_m2)} tone="flat"
              framing={m.cost_m2 ? `costo ~${fmtFull(m.cost_m2)}/m² (estimado)` : 'precio promedio de tus unidades'} />
          </div>
        </Block>
      )}
    </div>
  );
}
