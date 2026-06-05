/**
 * AmenidadesIntel — Cockpit "Valor de tus amenidades" (pestaña Amenidades).
 * Cierra el círculo: qué amenidad SUBE tu precio/m² ($ defendible en tu inventario),
 * qué te FALTA vs tus competidores de la zona, y tu cobertura. Doctrina del dato práctico.
 */
import React, { useEffect, useState } from 'react';
import { getAmenityIntel } from '../../api/developer';
import { fmtMXN, grid, Block, Stat, BigCard } from './cockpitUI';

export default function AmenidadesIntel({ slug }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(false);
    getAmenityIntel(slug).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [slug]);

  if (err) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>No se pudo cargar el valor de amenidades ahora.</div>;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando valor de tus amenidades…</div>;

  const drivers = d.value_drivers || [];
  const positives = drivers.filter(x => x.significativo && x.impacto_pct > 0).sort((a, b) => b.impacto_pct - a.impacto_pct);
  const negatives = drivers.filter(x => x.significativo && x.impacto_pct < 0);
  const gap = d.gap || [];
  const cov = d.coverage || {};

  return (
    <div data-testid="amenidades-intel" style={{ marginBottom: 22 }}>
      {/* 1 · Lo que sube tu precio */}
      <Block title="Lo que sube tu precio /m²" hint="amenidades que el mercado sí paga (modelo de la zona)">
        {positives.length > 0 ? (
          <div style={grid(230)}>
            {positives.map((p, i) => (
              <BigCard key={i} icon="💎" name={p.label} tone="green" tag={`+${p.impacto_pct}%`}
                big={p.dollar_in_inventory ? `+${fmtMXN(p.dollar_in_inventory)}` : `+${p.impacto_pct}%`}
                sub={p.dollar_in_inventory ? 'de premium en tu inventario' : 'sobre el precio/m²'}
                framing={p.units_with ? `tus ${p.units_with} unidad${p.units_with !== 1 ? 'es' : ''} con esto cargan el premio · destácalo en el pitch y el precio` : 'inclúyelo para capturar este valor'} />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Aún sin amenidad con impacto significativo en tu muestra de zona.</div>
        )}
        {negatives.length > 0 && (
          <div style={{ ...grid(230), marginTop: 12 }}>
            {negatives.map((n, i) => (
              <Stat key={i} label={`⚠ ${n.label}`} value={`${n.impacto_pct}%`} tone="amber"
                framing="en tu zona NO sube el precio/m² → no lo uses como argumento de precio" />
            ))}
          </div>
        )}
      </Block>

      {/* 2 · Lo que te falta vs tu zona (la brecha) */}
      <Block title="Lo que te falta vs tu zona" hint="amenidades que tus competidores tienen y tú no">
        {gap.length > 0 ? (
          <div style={grid(210)}>
            {gap.map((g, i) => {
              const strong = g.competitors_with >= Math.ceil((g.competitors_total || 1) / 2);
              return (
                <Stat key={i} label={g.label} value={`${g.competitors_with} de ${g.competitors_total}`} unit=" rivales"
                  tone={i === 0 ? 'amber' : 'flat'}
                  framing={g.value_pct != null && g.value_pct > 0
                    ? `lo tienen · suma +${g.value_pct}% al precio → considéralo`
                    : strong ? 'la mayoría lo tiene · evalúa agregarlo' : 'algún rival lo tiene'} />
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>No te falta nada que tus competidores tengan · vas completo.</div>
        )}
      </Block>

      {/* 3 · Tu cobertura */}
      <Block title="Tu cobertura" hint="tu paquete vs el promedio de la zona">
        <div style={grid(190)}>
          <Stat label="Tus amenidades" value={cov.you_count ?? 0}
            tone={(cov.zone_avg != null && cov.you_count >= cov.zone_avg) ? 'green' : 'amber'}
            framing={cov.zone_avg != null ? `vs ${cov.zone_avg} promedio de la zona → ${cov.you_count >= cov.zone_avg ? 'vas arriba' : 'por debajo, súbele'}` : 'amenidades activas'} />
          <Stat label="Tu ranking en la zona" value={cov.rank_pos != null ? `#${cov.rank_pos}` : '—'}
            unit={cov.competitors_total != null ? ` de ${cov.competitors_total + 1}` : ''}
            tone={cov.rank_pos === 1 ? 'green' : 'amber'}
            framing={cov.rank_pos === 1 ? 'lideras en amenidades · úsalo como argumento' : 'por amenidades vs competidores'} />
        </div>
      </Block>
    </div>
  );
}
