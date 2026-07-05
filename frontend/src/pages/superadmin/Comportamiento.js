/**
 * Comportamiento (Dev-Master · Fase 3) — Objeciones + comportamiento del comprador.
 * Agrega a nivel mercado qué frena la compra (objeciones, con contra-argumento) y cómo decide el
 * comprador (DISC, maduración, velocidad de respuesta vs cierre). Señal real: outcomes de leads;
 * objeciones literales/DISC/sentimiento se afinan con la minería de conversaciones. Consume
 * /devmaster/comportamiento. Integra asesor (leads/chats) + dev (objeciones sobre su proyecto) + marketplace.
 */
import React, { useEffect, useState } from 'react';
import { MessageSquare, Lightbulb, Gauge, Users, Filter, Clock, Flame } from 'lucide-react';
import { fetchComportamiento } from '../../api/superadminDevmaster';
import { getBuyerScoreSummary, getBuyerScorePerUser, triggerBuyerScoreRecompute } from '../../api/buyer_score';

const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const SEV = { alta: '#F2635B', media: '#F5C451', baja: 'var(--sa-text-mute)' };

function Panel({ icon: Icon, title, sub, children, accent }) {
  return (
    <div style={{ ...card, ...(accent ? { borderColor: 'rgba(var(--theme-rgb),0.4)' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sub ? 2 : 12 }}>
        {Icon && <Icon size={15} style={{ color: 'var(--theme)' }} />}
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--sa-text)', margin: 0 }}>{title}</h3>
      </div>
      {sub && <div style={{ fontSize: 11, ...mute, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}


// ── Temperatura de compradores (buyer score) — censo 2026-07-05: backend+api sin UI → visible aquí.
// Hipergranular: resumen (hot/warm/cold) → tabla POR PERSONA (el átomo del scoring).
function BuyerScoreSection() {
  const [sum, setSum] = React.useState(null);
  const [tier, setTier] = React.useState('');
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => {
    getBuyerScoreSummary().then(setSum).catch(() => setSum({ error: true }));
    getBuyerScorePerUser({ tier: tier || undefined, limit: 25 }).then((d) => setRows(d.users || d.items || (Array.isArray(d) ? d : []))).catch(() => setRows([]));
  }, [tier]);
  React.useEffect(() => { load(); }, [load]);
  const recompute = async () => {
    setBusy(true);
    try { await triggerBuyerScoreRecompute(); load(); } catch { /* fail-open */ }
    finally { setBusy(false); }
  };
  const tiers = (sum && (sum.by_tier || sum.tiers || sum.distribution)) || {};
  const TIER_META = { hot: ['Caliente', '#F87171'], warm: ['Tibio', '#F5C451'], cold: ['Frío', '#60A5FA'] };
  return (
    <div data-testid="buyer-score-section" style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <Flame size={15} style={{ color: 'var(--theme, #6D4AFF)' }} />
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Temperatura de compradores</span>
        <button onClick={recompute} disabled={busy} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: 'rgba(240,235,224,0.75)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Recalculando…' : 'Recalcular ahora'}
        </button>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, ...mute, marginBottom: 10 }}>Qué tan listos están los compradores para comprar, según su conducta real — del resumen a cada persona.</div>
      {sum && !sum.error && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {['hot', 'warm', 'cold'].map((t) => {
            const [label, color] = TIER_META[t];
            const n = (tiers[t] && (tiers[t].count ?? tiers[t])) ?? 0;
            const on = tier === t;
            return (
              <button key={t} onClick={() => setTier(on ? '' : t)} data-testid={`buyer-tier-${t}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 11, cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
                  background: on ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? color : 'rgba(255,255,255,0.08)'}`, color: 'var(--cream)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: color }} />
                {label}: {typeof n === 'number' ? n : 0}
              </button>
            );
          })}
          {sum.avg_score != null && <span style={{ alignSelf: 'center', fontFamily: 'DM Sans', fontSize: 12, ...mute }}>score promedio: <b style={{ color: 'var(--cream)' }}>{Number(sum.avg_score).toFixed(0)}</b></span>}
        </div>
      )}
      {rows === null && <div style={{ fontFamily: 'DM Sans', fontSize: 12, ...mute }}>Cargando…</div>}
      {rows !== null && rows.length === 0 && <div style={{ fontFamily: 'DM Sans', fontSize: 12, ...mute }}>Aún sin compradores puntuados — se llena con conducta real.</div>}
      {rows !== null && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead><tr>
              {['Comprador', 'Score', 'Temperatura', 'Cambio'].map((hh, i) => (
                <th key={hh} style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '6px 10px', textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{hh}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.slice(0, 20).map((u, i) => {
                const [tl, tcolor] = TIER_META[u.tier] || ['—', 'rgba(240,235,224,0.4)'];
                return (
                  <tr key={u.user_id || u.visitor_id || i} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <td style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', padding: '6px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{u.name || u.email || String(u.user_id || '—').slice(0, 22)}</td>
                    <td style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{u.score != null ? Math.round(u.score) : '—'}</td>
                    <td style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: tcolor, padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{tl}</td>
                    <td style={{ fontFamily: 'DM Sans', fontSize: 11.5, padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: (u.delta_pct || 0) > 0 ? '#34D399' : (u.delta_pct || 0) < 0 ? '#F87171' : 'rgba(240,235,224,0.5)' }}>{u.delta_pct ? `${u.delta_pct > 0 ? '+' : ''}${Number(u.delta_pct).toFixed(0)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Comportamiento({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    fetchComportamiento(filters || {})
      .then(r => { if (alive) setD(r); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [filters]);

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar el comportamiento.</div>;
  if (!d) return <div style={mute}>Analizando objeciones y comportamiento…</div>;

  const m = d.maduracion || {};
  const maxFunnel = Math.max(...(m.embudo || []).map(e => e.n), 1);
  const maxWin = Math.max(...(m.respuesta_vs_cierre || []).map(b => b.win_rate), 1);

  return (
    <div data-testid="comportamiento" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Titular */}
      <div style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)', background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <MessageSquare size={16} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>Objeciones y comportamiento</h3>
          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)', letterSpacing: '.04em' }}>QUÉ FRENA LA COMPRA</span>
        </div>
        <p data-testid="cmp-resumen" style={{ fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 8 }}>Basado en {d.fuente?.leads || 0} leads. {d.fuente?.nota}</div>
      </div>

      {/* Acciones agentic */}
      {(d.acciones || []).length > 0 && (
        <Panel icon={Lightbulb} title="Qué hacer con esto" accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.acciones || []).map((a, i) => (
              <div key={i} data-testid="cmp-accion" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Objeciones */}
      <Panel icon={MessageSquare} title="Objeciones que más frenan" sub="Lo que detiene la compra — con el contra-argumento para cada una.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(d.objeciones || []).map((o, i) => (
            <div key={i} data-testid="cmp-objecion" style={{ ...card, padding: 13, background: 'var(--bg-card-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: SEV[o.severidad] || SEV.baja }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)' }}>{o.label}</span>
                  {o.fuente === 'conversaciones' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 999, background: 'rgba(0,229,255,0.12)', color: '#00E5FF' }}>de chats</span>}
                </div>
                <div style={{ fontSize: 12, ...dim }}>{o.n} leads · <b style={{ color: SEV[o.severidad] }}>{o.pct}%</b>{o.perdidos ? ` · ${o.perdidos} perdidos` : ''}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sa-text-dim)', lineHeight: 1.5, marginTop: 8, paddingLeft: 17 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 700 }}>Contra: </span>{o.rebuttal}
              </div>
            </div>
          ))}
        </div>
        {(d.objeciones_pendientes || []).length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sa-border)' }}>
            <div style={{ fontSize: 11, ...mute, marginBottom: 6 }}>Se detectan automáticamente cuando entren conversaciones del comprador:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {(d.objeciones_pendientes || []).map((p, i) => (
                <span key={i} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--sa-border)', color: 'var(--sa-text-mute)' }}>{p.label}</span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Grid: velocidad + embudo + DISC + sentimiento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        {/* Velocidad de respuesta vs cierre (la joya) */}
        <Panel icon={Clock} title="Qué tan rápido contestas vs si cierras" sub="El cierre cambia muchísimo con la velocidad de respuesta.">
          {(m.respuesta_vs_cierre || []).map((b, i) => (
            <div key={i} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--sa-text)' }}>{b.rango}</span>
                <span style={dim}>{b.cierres}/{b.leads} · <b style={{ color: b.win_rate >= maxWin ? '#34D399' : 'var(--sa-text)' }}>{b.win_rate}% cierre</b></span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(b.win_rate / maxWin * 100)}%`, background: b.win_rate >= maxWin ? '#34D399' : 'var(--theme)', borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </Panel>

        {/* Embudo */}
        <Panel icon={Filter} title="Embudo del comprador" sub={`Cierre típico en ${m.dias_cierre ?? '—'} días · ${m.interacciones_promedio ?? '—'} toques en promedio.`}>
          {(m.embudo || []).map((e, i) => (
            <div key={i} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--sa-text)' }}>{e.etapa}</span><span style={dim}>{e.n}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(e.n / maxFunnel * 100)}%`, background: e.key === 'perdido' ? '#F2635B' : (e.key === 'vendido' ? '#34D399' : 'var(--theme)'), borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </Panel>

        {/* DISC */}
        <Panel icon={Users} title="Cómo es y cómo decide" sub="Perfil de personalidad del comprador (DISC).">
          {(d.disc?.distribucion || []).length > 0 ? (
            (d.disc.distribucion).map((p, i) => (
              <div key={i} style={{ padding: '7px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{p.label}</span><span style={dim}>{p.pct}%</span>
                </div>
                <div style={{ fontSize: 11, ...mute, marginTop: 2 }}>{p.como_venderle}</div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, ...mute, lineHeight: 1.5 }}>
              Aún no hay perfil. El DISC (cómo decide cada comprador) se infiere de sus conversaciones —
              conecta WhatsApp/chat para activarlo. <Gauge size={12} style={{ verticalAlign: 'middle', opacity: 0.6 }} />
            </div>
          )}
        </Panel>

        {/* Temperatura de compradores (buyer score · antes invisible) */}
        <BuyerScoreSection />

        {/* Sentimiento (stub honesto) */}
        <Panel icon={Gauge} title="Ánimo del comprador">
          <div style={{ fontSize: 12.5, ...mute, lineHeight: 1.5 }}>
            El ánimo (positivo / negativo) de las conversaciones se mide cuando entren los mensajes del comprador. Hoy en espera.
          </div>
        </Panel>
      </div>
    </div>
  );
}
