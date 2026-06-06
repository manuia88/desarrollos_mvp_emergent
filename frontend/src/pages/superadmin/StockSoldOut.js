/**
 * StockSoldOut (Dev-Master · Fase 3 · Mercado Predictivo) — Stock Score + Predicción de Sold-Out +
 * Elasticidad de Precio. Cierra el ciclo "¿cuándo se agota y cuánto puedo cobrar?": absorción real
 * → meses para agotar + semáforo · espacio de precio por proyecto · receta de los que se agotan.
 * Consume /devmaster/stock-soldout. Integra dev (inventario/precio) + marketplace (demanda) + superadmin.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Clock, AlertTriangle, DollarSign, Lightbulb, Award, ArrowRight } from 'lucide-react';
import { fetchStockSoldout } from '../../api/superadminDevmaster';

const dim = { color: 'var(--sa-text-dim)' };
const mute = { color: 'var(--sa-text-mute)' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 };
const COLOR = { verde: '#34D399', neutro: 'var(--sa-text-mute)', rojo: '#F2635B' };
const mm = (n) => (Number(n) ? `$${(Number(n) / 1e6).toFixed(1)}M` : '—');

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

function ProyectoRow({ p, onOpen }) {
  return (
    <div data-testid="stock-row" style={{ ...card, padding: 13, background: 'var(--bg-card-2)', borderColor: p.color === 'verde' ? 'rgba(52,211,153,0.3)' : (p.color === 'rojo' ? 'rgba(242,99,91,0.25)' : 'var(--sa-border)') }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 190 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: COLOR[p.color] }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)' }}>{p.nombre}</div>
            <div style={{ fontSize: 11, ...mute }}>{p.zona} · {mm(p.precio)}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 92 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 19, color: COLOR[p.color] }}>{p.meses_para_agotar != null ? `${p.meses_para_agotar}m` : '—'}</div>
          <div style={{ fontSize: 10, ...mute }}>para agotar</div>
        </div>
        <div style={{ minWidth: 110 }}>
          <div style={{ fontSize: 11, ...dim, marginBottom: 3 }}>{p.sellthrough}% colocado · {p.disponibles} libres</div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${p.sellthrough}%`, background: COLOR[p.color], borderRadius: 999 }} />
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLOR[p.color], minWidth: 110, textAlign: 'right' }}>{p.estado}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9, paddingLeft: 17, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: p.espacio_precio_color === 'verde' ? COLOR.verde : (p.espacio_precio_color === 'rojo' ? COLOR.rojo : 'var(--sa-text-dim)') }}>
          💰 {p.espacio_precio}{p.vs_mediana_zona != null ? ` (${p.vs_mediana_zona > 0 ? '+' : ''}${p.vs_mediana_zona}% vs zona)` : ''}
        </span>
        <button onClick={() => onOpen(p.project_id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--theme)', fontSize: 11.5, fontWeight: 700, padding: 0 }}>Abrir ficha <ArrowRight size={12} /></button>
      </div>
    </div>
  );
}

export default function StockSoldOut({ filters }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    fetchStockSoldout(filters || {})
      .then(r => { if (alive) setD(r); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [filters]);

  if (err) return <div style={{ color: '#FCA5A5' }}>No se pudo cargar stock y sold-out.</div>;
  if (!d) return <div style={mute}>Calculando ritmo de venta y sold-out…</div>;

  const el = d.elasticidad || {};
  const elColor = el.signo === 'elastico' ? COLOR.rojo : (el.signo === 'inelastico' ? COLOR.verde : 'var(--sa-text-mute)');

  return (
    <div data-testid="stock-soldout" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Titular */}
      <div style={{ ...card, borderColor: 'rgba(var(--theme-rgb),0.45)', background: 'linear-gradient(150deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <TrendingUp size={16} style={{ color: 'var(--theme)' }} />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--sa-text)', margin: 0 }}>Stock y Sold-Out</h3>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(var(--theme-rgb),0.18)', color: 'var(--theme)' }}>Mercado Predictivo</span>
        </div>
        <p data-testid="ss-resumen" style={{ fontSize: 14, color: 'var(--sa-text)', lineHeight: 1.55, margin: 0, fontWeight: 600 }}>{d.resumen}</p>
        <div style={{ fontSize: 11.5, ...mute, marginTop: 8 }}>{d.fuente?.nota}</div>
      </div>

      {/* Acciones agentic */}
      {(d.acciones || []).length > 0 && (
        <Panel icon={Lightbulb} title="Qué Hacer con Esto" accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(d.acciones || []).map((a, i) => (
              <button key={i} data-testid="ss-accion" onClick={() => a.link && navigate(a.link)} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5, background: 'transparent', border: 'none', textAlign: 'left', cursor: a.link ? 'pointer' : 'default', padding: 0 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>{i + 1}.</span>{a.texto}{a.link && <ArrowRight size={12} style={{ marginTop: 3, color: 'var(--theme)' }} />}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Predicción de sold-out por proyecto */}
      <Panel icon={Clock} title="Predicción de Sold-Out por Proyecto" sub="Meses para agotar el inventario restante al ritmo actual. Verde = se vende bien, rojo = se está estancando.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {(d.proyectos || []).map((p, i) => <ProyectoRow key={i} p={p} onOpen={(id) => navigate(`/superadmin/desarrollos/${id}`)} />)}
        </div>
      </Panel>

      {/* Grid: elasticidad + receta + estancados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 16 }}>
        {/* Elasticidad de precio */}
        <Panel icon={DollarSign} title="Elasticidad de Precio" sub="¿Cuánto frena el precio a la venta en este mercado?">
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: elColor, marginBottom: 6 }}>
            {el.signo === 'elastico' ? 'Sensible al precio' : el.signo === 'inelastico' ? 'Poco sensible al precio' : 'Sensibilidad mixta'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--sa-text-dim)', lineHeight: 1.5 }}>{el.texto}</div>
          {el.corr != null && <div style={{ fontSize: 10.5, ...mute, marginTop: 8 }}>Correlación precio↔venta: {el.corr}</div>}
        </Panel>

        {/* Receta de los que se agotan */}
        <Panel icon={Award} title="La Receta de los que se Agotan" sub="Qué tienen en común los que se venden bien.">
          {d.receta_exito ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Zonas</span><span style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{(d.receta_exito.zonas || []).join(', ') || '—'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={mute}>Precio típico</span><span style={{ color: 'var(--sa-text)', fontWeight: 600 }}>{mm(d.receta_exito.precio_tipico)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span style={mute}>Amenidades</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                  {(d.receta_exito.amenidades || []).map((a, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--sa-border)', color: 'var(--sa-text)' }}>{a}</span>
                  ))}
                </span>
              </div>
              <div style={{ fontSize: 10.5, ...mute, marginTop: 4 }}>Basado en {d.receta_exito.n} proyectos que se venden bien.</div>
            </div>
          ) : <div style={{ fontSize: 12, ...mute }}>Aún no hay suficientes proyectos de venta rápida para sacar la receta.</div>}
        </Panel>

        {/* Estancados */}
        <Panel icon={AlertTriangle} title="Se Están Estancando" sub="Inventario que conviene mover (precio o marketing).">
          {(d.estancados || []).length === 0 && <div style={{ fontSize: 12, ...mute }}>Ningún proyecto estancado.</div>}
          {(d.estancados || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '7px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
              <span style={{ color: 'var(--sa-text)' }}>{p.nombre}</span>
              <span style={{ color: COLOR.rojo, fontWeight: 700 }}>{p.disponibles} libres · {p.meses_para_agotar ? `${p.meses_para_agotar}m` : '—'}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
