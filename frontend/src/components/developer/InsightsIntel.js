/**
 * InsightsIntel — Cockpit "Veredicto de mercado" (pestaña Insights de la ficha del proyecto).
 * Doctrina del dato práctico: cada métrica = NÚMERO + PLAZO + COMPARATIVO + PARA QUÉ SIRVE.
 * Cablea /insights-intel: valor justo (AVM) vs tu precio, comparables reales, embudo con su fuga,
 * salud del activo + qué arrastra, apreciación. Lo sin dato = honesto (se autollena).
 */
import React, { useEffect, useState } from 'react';
import { getInsightsIntel } from '../../api/developer';
import { fmtMXN, fmtFull, grid, Block, Stat, BigCard } from './cockpitUI';

export default function InsightsIntel({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(false);
    getInsightsIntel(slug).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  if (err) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>No se pudo cargar el veredicto de mercado ahora.</div>;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando veredicto de mercado…</div>;

  const a = d.avm || {};
  const comps = d.comparables || [];
  const e = d.embudo || {};
  const sc = d.score || {};
  const fcst = d.forecast || {};
  const vs = a.list_vs_avm_pct;
  const fortaleza = (sc.breakdown || []).reduce((b, x) => (!b || x.value > b.value ? x : b), null);

  return (
    <div data-testid="insights-intel" style={{ marginBottom: 22 }}>
      {/* 1 · La joya: ¿tu precio es justo? */}
      <Block title="¿Tu precio es justo?" hint="tu lista contra el valor de mercado de la zona">
        <div style={grid(210)}>
          <BigCard icon="⚖️" name="Tu posición de precio" tone={vs == null ? 'flat' : vs > 15 ? 'amber' : 'green'}
            tag={vs == null ? null : vs > 15 ? 'premium' : 'en línea'}
            big={vs == null ? '—' : `${vs > 0 ? '+' : ''}${vs}%`} sub="sobre el valor justo de la zona"
            framing={vs == null ? 'sin referencia de zona aún'
              : vs > 15 ? 'Posicionamiento premium. Normal en proyectos de lujo, pero con ritmo lento evalúa si frena la colocación.'
                : 'Tu precio está alineado con el valor de mercado de la zona.'}
            note={a.modelo === 'heuristic' ? 'valor de zona estimado · se afina con avalúos reales' : null} />
          <Stat label="Valor justo /m²" value={fmtFull(a.pm2)} tone="flat"
            framing={a.m2_ref ? `referencia de zona para ~${a.m2_ref} m²` : 'referencia de zona'} />
          <Stat label="Tu lista /m²" value={fmtFull(a.list_pm2)} tone={vs == null ? 'flat' : vs > 15 ? 'amber' : 'green'}
            framing={a.valor_estimado ? `una unidad tipo vale ~${fmtMXN(a.valor_estimado)} a valor de zona` : 'precio promedio de tus unidades'} />
        </div>
      </Block>

      {/* 2 · Comparables reales */}
      {comps.length > 0 && (
        <Block title="¿Cómo te comparas?" hint="proyectos parecidos en la zona">
          <div style={grid(200)}>
            {comps.map((c, i) => {
              const v = c.vs_you_pct;
              return (
                <Stat key={i} label={c.name || `Comparable ${i + 1}`} value={fmtFull(c.price_m2)} unit="/m²"
                  tone={v == null ? 'flat' : v > 25 ? 'amber' : 'green'}
                  framing={`${c.sold_pct != null ? `${c.sold_pct}% colocado · ` : ''}${v == null ? '' : v > 0 ? `tú +${v}% más caro` : `tú ${v}% más barato`}`} />
              );
            })}
          </div>
        </Block>
      )}

      {/* 3 · Embudo: ¿dónde se caen? */}
      <Block title="Tu embudo: ¿dónde se te caen?" hint="del interés al cierre">
        <div style={grid(160)}>
          <Stat label="Vistas" value={e.vistas ?? 0} tone={(e.vistas ?? 0) > 0 ? 'green' : 'flat'} framing="clientes viendo tu ficha" />
          <Stat label="Leads" value={e.leads ?? 0} tone={(e.leads ?? 0) > 0 ? 'green' : 'amber'}
            framing={e.conv_vista_lead != null ? `${e.conv_vista_lead}% de las vistas` : 'interesados'} />
          <Stat label="Citas" value={e.citas ?? 0} tone={e.fuga === 'lead→cita' ? 'red' : (e.citas ?? 0) > 0 ? 'green' : 'amber'}
            framing={e.conv_lead_cita != null ? `${e.conv_lead_cita}% de los leads${e.fuga === 'lead→cita' ? ' · aquí se te caen, empuja agendado' : ''}` : 'visitas agendadas'} />
          <Stat label="Ganados" value={e.ganados ?? 0} tone={(e.ganados ?? 0) > 0 ? 'green' : 'flat'}
            framing={e.conv_total != null ? `${e.conv_total}% de los leads cierra` : 'cierres'} />
        </div>
      </Block>

      {/* 4 · Salud del activo */}
      {sc.score != null && (
        <Block title="Salud del activo" hint="el número que funde todo">
          <div style={grid(190)}>
            <Stat label="Salud" value={sc.score} unit={`/100 · ${sc.grade || ''}`}
              tone={sc.score >= 70 ? 'green' : sc.score >= 45 ? 'amber' : 'red'}
              framing="funde ventas, margen, obra y demanda" />
            <Stat label="Lo que más resta" value={sc.arrastra || '—'} tone="amber"
              framing="súbele aquí y la salud sube más rápido" />
            {fortaleza && <Stat label="Tu fortaleza" value={fortaleza.dim} tone="green"
              framing="lo que ya juega a tu favor · explótalo en el pitch" />}
          </div>
        </Block>
      )}

      {/* 5 · Apreciación proyectada */}
      <Block title="Apreciación proyectada" hint="cuánto subiría de valor la zona">
        <div style={grid(190)}>
          {fcst.available && fcst.horizons?.['12m'] ? (
            <>
              <Stat label="A 12 meses" value={`+${(fcst.horizons['12m'].delta_pct ?? 0).toFixed(1)}`} unit="%" tone="green"
                framing="proyección del modelo de la zona" />
              <Stat label="A 24 meses" value={fcst.horizons['24m'] ? `+${(fcst.horizons['24m'].delta_pct ?? 0).toFixed(1)}` : '—'} unit="%" tone="green"
                framing="horizonte de mediano plazo" />
            </>
          ) : (
            <Stat label="Apreciación 12m" value="—" tone="flat" stub
              framing="se conecta al acumular histórico de precios de la zona" />
          )}
        </div>
      </Block>
    </div>
  );
}
