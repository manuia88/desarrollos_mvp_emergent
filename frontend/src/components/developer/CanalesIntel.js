/**
 * CanalesIntel — Cockpit de la tab "Canales": compara In-house vs Brokers y rankea asesores
 * por interacción. Toggle GENERAL (todos tus proyectos) ↔ por proyecto.
 * Lee /channel-intel (campos lead↔asesor↔canal). Doctrina del dato práctico.
 */
import React, { useEffect, useState } from 'react';
import { getChannelIntel } from '../../api/developer';
import { fmtMXN, Block } from './cockpitUI';

const CH_ICON = { inhouse: '🏠', broker: '🤝' };

function Mini({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--cream)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ChannelCard({ ch, best }) {
  if (!ch || !ch.leads) {
    return (
      <div className="dmx-card" style={{ background: '#fff', padding: '15px 16px', opacity: 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{CH_ICON[ch?.key] || '·'}</span>
          <b style={{ fontSize: 14, color: 'var(--cream)' }}>{ch?.channel}</b>
        </div>
        <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Sin leads por este canal todavía.</div>
      </div>
    );
  }
  return (
    <div className="dmx-card" style={{ background: '#fff', padding: '15px 16px', border: best ? '1.5px solid var(--theme)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
        <span style={{ fontSize: 20 }}>{CH_ICON[ch.key]}</span>
        <b style={{ fontSize: 14, color: 'var(--cream)' }}>{ch.channel}</b>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.09)', padding: '3px 10px', borderRadius: 999 }}>{ch.leads} leads</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Mini label="Conversión" value={`${ch.conversion ?? '—'}%`} sub={`${ch.cierres ?? 0} cierres`} />
        <Mini label="Tasa de cierre" value={`${ch.win_rate ?? '—'}%`} sub="de las decididas" />
        <Mini label="Ticket promedio" value={fmtMXN(ch.avg_ticket)} sub="presupuesto del cliente" />
        <Mini label="Interacción / lead" value={ch.avg_interactions ?? '—'} sub="toques por lead" />
        <Mini label="1ª respuesta" value={ch.avg_response_hrs != null ? `${ch.avg_response_hrs}h` : '—'} sub="qué tan rápido contesta" />
      </div>
    </div>
  );
}

export default function CanalesIntel({ slug }) {
  const [scope, setScope] = useState(slug);   // slug = este proyecto; '' = portafolio
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(false);
    getChannelIntel(scope || undefined).then(r => { if (alive) setD(r); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [scope]);

  if (err) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>No se pudo cargar la inteligencia de canales ahora.</div>;
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando canales…</div>;

  const inhouse = (d.channels || []).find(c => c.key === 'inhouse');
  const broker = (d.channels || []).find(c => c.key === 'broker');
  const winner = (inhouse?.conversion ?? 0) >= (broker?.conversion ?? 0) ? 'inhouse' : 'broker';
  const asr = d.asesores || [];
  const maxIx = Math.max(...asr.map(a => a.interactions || 0), 1);
  const projects = d.projects || [];

  const tabBtn = (on) => ({
    fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--theme)' : 'var(--border)'}`,
    background: on ? 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' : '#fff',
    color: on ? '#fff' : 'var(--cream-2)',
  });

  return (
    <div data-testid="canales-intel" style={{ marginBottom: 22 }}>
      {/* Scope toggle: general ↔ por proyecto */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={() => setScope('')} style={tabBtn(!scope)}>Todos tus proyectos</button>
        {projects.map(p => (
          <button key={p.id} type="button" onClick={() => setScope(p.id)} style={tabBtn(scope === p.id)}>{p.name}</button>
        ))}
      </div>

      {/* In-house vs Brokers */}
      <Block title="In-house vs Brokers" hint={`${d.scope_label} · ${d.leads_total} leads`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
          <ChannelCard ch={inhouse} best={winner === 'inhouse'} />
          <ChannelCard ch={broker} best={winner === 'broker'} />
        </div>
      </Block>

      {/* Ranking de asesores por interacción */}
      <Block title="Asesores · quién interactúa más" hint="actividad, cierres y presupuesto de cada uno">
        {asr.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Sin asesores con actividad en este alcance.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {asr.map((a, i) => (
              <div key={a.id} className="dmx-card" style={{ background: '#fff', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: i === 0 ? 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))' : 'rgba(var(--cream-rgb),0.06)', color: i === 0 ? '#fff' : 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, fontFamily: 'Outfit' }}>{i + 1}</span>
                <div style={{ minWidth: 130, flex: '0 0 auto' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{a.name}</div>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: a.channel === 'broker' ? '#B7791F' : '#15803d', background: a.channel === 'broker' ? 'rgba(226,152,46,0.13)' : 'rgba(31,160,106,0.12)', padding: '1px 7px', borderRadius: 999 }}>{a.channel === 'broker' ? 'Broker' : 'In-house'}</span>
                </div>
                <div style={{ flex: 1, minWidth: 80 }}>
                  <div style={{ height: 7, borderRadius: 999, background: 'rgba(var(--cream-rgb),0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((a.interactions / maxIx) * 100)}%`, background: 'var(--grad, linear-gradient(120deg,#6D4AFF,#C63FAE))', borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 3 }}>{a.interactions} interacciones</div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit' }}>{a.cierres}</div><div style={{ fontSize: 9.5, color: 'var(--cream-3)' }}>cierres · {a.win_rate ?? '—'}%</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit' }}>{fmtMXN(a.avg_ticket)}</div><div style={{ fontSize: 9.5, color: 'var(--cream-3)' }}>ticket prom.</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Block>
    </div>
  );
}
