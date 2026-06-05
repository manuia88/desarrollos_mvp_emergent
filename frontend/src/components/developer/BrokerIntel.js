/**
 * BrokerIntel — Cockpit "Pagos y brokers" (pestaña Comercialización de la ficha).
 * Formas de pago (lo más real) + canal/comisión + conversión + confianza. Doctrina práctica.
 * El ranking de brokers se autollena al asignar leads a brokers (stub honesto).
 */
import React, { useEffect, useState } from 'react';
import { getBrokerIntel } from '../../api/developer';
import { grid, Block, Stat, BigCard } from './cockpitUI';

function trustWord(v, tier, words) {
  if (v == null) return { word: '—', tone: 'flat' };
  if (tier === 'green' || v >= 80) return { word: words[2], tone: 'green' };
  if (tier === 'amber' || v >= 50) return { word: words[1], tone: 'amber' };
  return { word: words[0], tone: 'red' };
}

export default function BrokerIntel({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(false);
    getBrokerIntel(slug).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  if (err) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>No se pudo cargar pagos y brokers ahora.</div>;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando pagos y brokers…</div>;

  const p = d.pagos || {};
  const c = d.canal || {};
  const v = d.ventas || {};
  const conf = d.confianza || {};
  const planes = p.planes || [];
  const marca = trustWord(conf.IE_PROY_MARCA_TRUST?.value, conf.IE_PROY_MARCA_TRUST?.tier, ['Por construir', 'Buena', 'Alta']);
  const entregas = trustWord(conf.IE_PROY_DEVELOPER_DELIVERY_HIST?.value, conf.IE_PROY_DEVELOPER_DELIVERY_HIST?.tier, ['Irregular', 'Bueno', 'Impecable']);

  return (
    <div data-testid="broker-intel" style={{ marginBottom: 22 }}>
      {/* 1 · Formas de pago */}
      <Block title="Tus formas de pago" hint={`${p.n_planes || 0} planes · hasta ${p.financiamiento_meses ?? '—'} meses sin banco`}>
        {planes.length > 0 ? (
          <div style={grid(210)}>
            {planes.map((pl, i) => (
              <BigCard key={i} icon={i === 0 ? '🏷️' : i === planes.length - 1 ? '💎' : '⭐'} name={pl.nombre}
                tone={i === 0 ? 'flat' : 'green'} tag={pl.descuento_pct > 0 ? `-${pl.descuento_pct}%` : null}
                big={`${pl.firma_pct}%`} sub="de enganche"
                framing={pl.descuento_pct > 0 ? `da ${pl.descuento_pct}% de descuento · premia al que entra fuerte` : 'tu puerta de entrada · el enganche más accesible'} />
            ))}
          </div>
        ) : <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Sin formas de pago configuradas.</div>}
      </Block>

      {/* 2 · Cómo comercializas (canal) */}
      <Block title="Cómo comercializas" hint="tu canal y política de comisión">
        <div style={grid(190)}>
          <Stat label="Canal de venta" value={c.in_house_only ? 'In-house' : (c.works_with_brokers ? 'Con brokers' : 'Mixto')}
            tone={c.in_house_only ? 'amber' : 'green'}
            framing={c.in_house_only ? `${c.brokers_count || 0} brokers externos · vendes con tu equipo` : `${c.brokers_count || 0} brokers asignados`} />
          <Stat label="Comisión a broker" value={c.comision_pct != null ? c.comision_pct : '—'} unit="%"
            tone="flat" framing={c.bono ? c.bono.replace(/\.$/, '') : 'comisión estándar'} />
          <Stat label="Descuento máx" value={c.descuento_max_pct != null ? c.descuento_max_pct : '—'} unit="%"
            tone="flat" framing="lo que un asesor puede ofrecer sin tu OK" />
        </div>
      </Block>

      {/* 3 · Conversión y cierres */}
      <Block title="Conversión y cierres" hint="qué tan bien cierras los leads">
        <div style={grid(180)}>
          <Stat label="Tasa de cierre" value={v.win_rate != null ? v.win_rate : '—'} unit="%"
            tone={(v.win_rate ?? 0) >= 60 ? 'green' : 'amber'}
            framing={`de las decididas ganas ${v.ganados ?? 0} y pierdes ${v.perdidos ?? 0}`} />
          <Stat label="Conversión total" value={v.conversion_pct != null ? v.conversion_pct : '—'} unit="%"
            tone={(v.conversion_pct ?? 0) >= 12 ? 'green' : 'amber'} framing={`${v.ganados ?? 0} cierres de ${v.leads_total ?? 0} leads`} />
          <Stat label="En proceso" value={v.en_proceso ?? 0} unit=" leads" tone={(v.en_proceso ?? 0) > 0 ? 'green' : 'flat'}
            framing="leads vivos por cerrar" />
        </div>
      </Block>

      {/* 4 · Confianza */}
      <Block title="Confianza con brokers y clientes" hint="lo que perciben de ti">
        <div style={grid(190)}>
          <Stat label="Confianza de tu marca" value={marca.word} tone={marca.tone} framing="lo que perciben brokers y compradores · publícala" />
          <Stat label="Cumples entregas" value={entregas.word} tone={entregas.tone} framing="tu historial de entregas a tiempo · argumento de venta" />
          {!d.broker_ranking_available && (
            <Stat label="Ranking de brokers" value="—" tone="flat" stub
              framing="se conecta al asignar leads a tus brokers" />
          )}
        </div>
      </Block>
    </div>
  );
}
