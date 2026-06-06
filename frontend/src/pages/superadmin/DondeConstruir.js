/**
 * DondeConstruir (Dev-Master · Fase 3 #2) — Demanda latente: dónde construir.
 * Cruza la demanda real (leads: presupuesto + tipo + zona) contra la oferta (unidades disponibles)
 * a micro-detalle (zona × banda de precio × recámaras) y dice, en lenguaje normal, qué construir y dónde.
 * Consume /devmaster/donde-construir. Integra señales de marketplace (cotizador), asesor (leads) y dev (oferta).
 */
import React, { useEffect, useState } from 'react';
import { Compass, ArrowRight, TrendingUp, Home, Sparkles, AlertTriangle, MapPin } from 'lucide-react';
import { fetchDondeConstruir } from '../../api/superadminDevmaster';

const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const COLOR = { verde: '#34D399', ambar: '#F5C451', rojo: '#F2635B', neutro: 'var(--sa-text-mute)' };

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

function OportunidadRow({ o, onPickZona }) {
  const tope = Math.max(o.demanda, o.oferta, 1);
  return (
    <div data-testid="oportunidad-row" style={{
      ...card, padding: 14, borderColor: o.color === 'verde' ? 'rgba(52,211,153,0.35)' : 'var(--sa-border)',
      background: o.color === 'verde' ? 'linear-gradient(150deg, rgba(52,211,153,0.07), transparent)' : 'var(--bg-card)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--sa-text)' }}>{o.zona}</span>
            <span style={{ fontSize: 11.5, ...dim }}>· {o.banda}{o.recamaras ? ` · ${o.recamaras} rec` : ''}</span>
          </div>
          <span style={{
            display: 'inline-block', marginTop: 7, fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
            color: COLOR[o.color], background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLOR[o.color]}55`,
          }}>{o.veredicto}</span>
        </div>
        <div style={{ flex: 1, minWidth: 180, maxWidth: 320 }}>
          {/* Demanda vs oferta — barras comparadas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={dim}>Buscando</span><span style={{ color: COLOR.verde, fontWeight: 700 }}>{o.demanda}</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${Math.round(o.demanda / tope * 100)}%`, background: COLOR.verde, borderRadius: 999 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={dim}>Disponibles</span><span style={{ color: 'var(--sa-text)', fontWeight: 700 }}>{o.oferta}</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(o.oferta / tope * 100)}%`, background: 'var(--sa-text-mute)', borderRadius: 999 }} />
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5, marginTop: 11 }}>{o.mensaje}</div>
      {onPickZona && (
        <button onClick={() => onPickZona(o.zona)} data-testid="oportunidad-cta" style={{
          marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          background: 'transparent', border: 'none', color: 'var(--theme)', fontSize: 12, fontWeight: 700, padding: 0,
        }}>Ver desarrollos en {o.zona} <ArrowRight size={13} /></button>
      )}
    </div>
  );
}

export default function DondeConstruir({ filters, onPickZona }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    fetchDondeConstruir(filters || {})
      .then(r => { if (alive) setD(r); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [filters]);

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar dónde construir.</div>;
  if (!d) return <div style={mute}>Calculando dónde hay demanda sin inventario…</div>;

  const fuenteTxt = d.fuente?.leads_usados
    ? `Basado en ${d.fuente.leads_usados} compradores reales${d.fuente.cotizador_usados ? ` + ${d.fuente.cotizador_usados} del cotizador` : ''}.`
    : 'Aún sin demanda registrada — se llena cuando entren leads y cotizaciones.';

  return (
    <div data-testid="donde-construir" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Resumen / titular */}
      <div style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)', background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Compass size={16} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>Dónde construir</h3>
          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)', letterSpacing: '.04em' }}>DEMANDA LATENTE</span>
        </div>
        <p data-testid="dc-resumen" style={{ fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 8 }}>{fuenteTxt} Cruzamos lo que la gente busca (presupuesto + tipo + zona) contra las unidades que de verdad hay.</div>
      </div>

      {/* Oportunidades */}
      <Panel icon={TrendingUp} title="Oportunidades de construcción" sub="Donde hay más gente buscando que inventario. Ordenadas por hueco de mercado." accent>
        {(d.oportunidades || []).length === 0 && <div style={{ fontSize: 12.5, ...mute }}>No hay huecos de demanda en el set actual.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(d.oportunidades || []).map((o, i) => <OportunidadRow key={i} o={o} onPickZona={onPickZona} />)}
        </div>
      </Panel>

      {/* Grid inferior: prototipo + amenidades + por zona + sobreoferta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        {/* Lo que más piden */}
        <Panel icon={Home} title="Lo que más piden" sub="Tipo de producto con más demanda.">
          {d.prototipo_pedido?.global ? (
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--sa-text)' }}>{d.prototipo_pedido.global.label}</span>
              <span style={{ fontSize: 12, ...dim }}> · {d.prototipo_pedido.global.veces} interesados</span>
            </div>
          ) : <div style={{ fontSize: 12, ...mute }}>Sin datos de tipo todavía.</div>}
          {(d.prototipo_pedido?.por_zona || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid var(--sa-border)' }}>
              <span style={{ color: 'var(--sa-text)' }}>{p.zona}</span>
              <span style={dim}>{p.label} ({p.veces})</span>
            </div>
          ))}
        </Panel>

        {/* Amenidades que pide el mercado (stub modelo de gusto) */}
        <Panel icon={Sparkles} title="Qué incluir en obra nueva" sub="Lo que ofrecen los proyectos con más demanda hoy.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {(d.amenidades_sugeridas || []).map((a, i) => (
              <span key={i} style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--sa-border)', color: 'var(--sa-text)' }}>{a.amenidad}</span>
            ))}
            {(d.amenidades_sugeridas || []).length === 0 && <span style={{ fontSize: 12, ...mute }}>Sin datos de amenidades.</span>}
          </div>
          <div style={{ fontSize: 10.5, ...mute, marginTop: 10, fontStyle: 'italic' }}>El modelo de gusto del mercado afinará esto con fotos y comportamiento real.</div>
        </Panel>

        {/* Índice por zona */}
        <Panel icon={MapPin} title="Índice de oportunidad por zona" sub="Más de 1 = más gente buscando que unidades.">
          {(d.por_zona || []).slice(0, 8).map((z, i) => {
            const c = z.indice_oportunidad >= 1 ? COLOR.verde : (z.indice_oportunidad >= 0.5 ? COLOR.ambar : 'var(--sa-text-mute)');
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                <span style={{ color: 'var(--sa-text)' }}>{z.zona}</span>
                <span style={{ ...dim }}>{z.demanda} buscan · {z.oferta} hay <b style={{ color: c, marginLeft: 6 }}>{z.indice_oportunidad}</b></span>
              </div>
            );
          })}
        </Panel>

        {/* Sobreoferta — cuidado */}
        {(d.sobreoferta || []).length > 0 && (
          <Panel icon={AlertTriangle} title="Cuidado: inventario sin demanda">
            {(d.sobreoferta || []).map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                <span style={{ color: 'var(--sa-text)' }}>{s.zona} · {s.banda}</span>
                <span style={{ color: COLOR.rojo, fontWeight: 700 }}>{s.oferta} sin demanda</span>
              </div>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
