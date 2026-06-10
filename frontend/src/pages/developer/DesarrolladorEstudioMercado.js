// F2.6 · Estudio de Mercado Vivo — el entregable auto-generado por colonia.
// Fusiona los motores F2 (Grafo + EPRAV + Generador + oferta + zona) en un documento listo
// para leer y exportar a PDF (impresión). Reusa el buscador de colonias de Valor de Terreno.
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import { Search } from '../../components/icons';
import * as api from '../../api/developer';
import { buscarColonias } from '../../api/valorResidual';

const money = (n) => (n ? `$${(n / 1e6).toFixed(1)}M` : '—');
const CATS = [{ id: 'economica', label: 'Económica' }, { id: 'media', label: 'Media' }, { id: 'premium', label: 'Premium' }];

export default function DesarrolladorEstudioMercado({ user, onLogout, embedded }) {
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState([]);
  const [open, setOpen] = useState(false);
  const [colonia, setColonia] = useState(null);
  const [categoria, setCategoria] = useState('media');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setOpts([]); return; }
    const t = setTimeout(() => buscarColonias(q).then(d => setOpts(d.items || [])).catch(() => setOpts([])), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!colonia) return;
    setLoading(true);
    api.getEstudioMercado(colonia.id, categoria).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [colonia, categoria]);

  const s = data?.secciones || {};
  const dr = s.demanda_real || {};
  const dp = s.demanda_potencial || {};
  const pr = s.producto_recomendado || {};
  const of = s.oferta || {};
  const zo = s.zona || {};

  const Sec = ({ title, children }) => (
    <Card style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </Card>
  );
  const KV = ({ k, v, tone }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 13 }}>
      <span style={{ color: 'var(--cream-3)' }}>{k}</span><b style={{ color: tone || 'var(--cream)' }}>{v}</b>
    </div>
  );

  return (
    <DeveloperLayout user={user} onLogout={onLogout} bare={embedded}>
      <PageHeader eyebrow="ENTREGABLE" title="Estudio de Mercado Vivo"
        sub="El estudio completo de una colonia, auto-generado en minutos: demanda, producto, oferta y zona. Exportable a PDF." />

      <Card style={{ marginBottom: 16 }} className="no-print">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--cream-3)' }} />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder="Busca una colonia…" data-testid="estudio-colonia-input"
              style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13 }} />
            {open && opts.length > 0 && (
              <div style={{ position: 'absolute', top: 42, left: 0, right: 0, zIndex: 20, background: 'var(--bg-card, #16181d)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                {opts.map(o => (
                  <button key={o.id} onClick={() => { setColonia(o); setQuery(o.name); setOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, cursor: 'pointer' }}>
                    {o.name} <span style={{ color: 'var(--cream-3)' }}>· {o.alcaldia}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {CATS.map(c => (
              <button key={c.id} onClick={() => setCategoria(c.id)} style={{
                padding: '8px 12px', borderRadius: 9999, border: '1px solid var(--border)',
                background: categoria === c.id ? 'linear-gradient(135deg, var(--gradient-from), var(--gradient-to))' : 'transparent',
                color: categoria === c.id ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{c.label}</button>
            ))}
          </div>
          {data && <button onClick={() => window.print()} data-testid="estudio-pdf" style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Exportar a PDF</button>}
        </div>
      </Card>

      {!colonia && <div style={{ padding: 50, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Busca una colonia para generar su estudio.</div>}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Generando estudio…</div>}

      {data && !loading && (
        <>
          <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(99,102,241,0.08), transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0 }}>{data.colonia}</h2>
              <Badge tone={data.es_estimado ? 'neutral' : 'ok'}>{data.es_estimado ? 'Preliminar' : 'Vivo'}</Badge>
              {zo.tier && <Badge tone="brand">{zo.tier}</Badge>}
            </div>
            {(data.veredicto || []).map((v, i) => (
              <div key={i} style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', padding: '3px 0' }}>· {v}</div>
            ))}
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 8 }}>◐ {data.lectura}</div>
          </Card>

          <Sec title="DEMANDA REAL (BÚSQUEDAS)">
            <KV k="Búsquedas activas" v={dr.demanda_total ?? 0} />
            <KV k="Nivel de demanda" v={dr.etiqueta || '—'} />
            <KV k="Segmento dominante" v={dr.segmento_dominante_label || '—'} />
          </Sec>

          <Sec title="DEMANDA POTENCIAL (DEMOGRAFÍA · EPRAV)">
            <KV k="Familias/año (NSE objetivo)" v={dp.demanda_anual_total ?? '—'} />
            <KV k="Buscarían vertical" v={dp.demanda_vertical ?? '—'} />
            <KV k="Hueco de mercado (GAP)" v={dp.gap_vertical ?? '—'} tone={dp.gap_vertical > 0 ? '#22C55E' : 'var(--cream)'} />
            <KV k="Captura objetivo (un proyecto)" v={dp.captura_objetivo ?? '—'} tone="#a5b4fc" />
          </Sec>

          <Sec title="PRODUCTO RECOMENDADO">
            {(pr.mezcla || []).map(m => (
              <KV key={m.recamaras} k={m.tipologia} v={`${m.pct}% · ${m.m2_promedio} m²`} />
            ))}
            {(!pr.mezcla || pr.mezcla.length === 0) && <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 12 }}>Sin dato suficiente.</div>}
          </Sec>

          <Sec title="OFERTA / COMPETENCIA">
            <KV k="Proyectos en la colonia" v={of.proyectos ?? 0} />
            <KV k="Unidades disponibles" v={of.unidades_disponibles ?? 0} />
            <KV k="Rango de precios" v={of.precio_desde ? `${money(of.precio_desde)} – ${money(of.precio_hasta)}` : '—'} />
          </Sec>

          <Sec title="ZONA">
            <KV k="Tier" v={zo.tier || '—'} />
            <KV k="Precio/m² referencia" v={zo.precio_m2 ? `$${Number(zo.precio_m2).toLocaleString('es-MX')}` : '—'} />
            <KV k="Momentum" v={zo.momentum || '—'} />
          </Sec>

          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{data.fuente}</div>
        </>
      )}
      <style>{`@media print { .no-print, nav, aside, header { display: none !important; } }`}</style>
    </DeveloperLayout>
  );
}
