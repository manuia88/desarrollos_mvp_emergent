// L68 · Generative — "¿Y si un competidor construye en TU zona?" El what-if DEFENSIVO (whatif=tus palancas; site-selection
// =tu expansión; ESTO=cómo te pega la oferta de un rival). Aterrizado: inventario real de la zona + demanda real +
// absorción/elasticidad benchmark MX. Interactivo: pones unidades/precio del competidor → ves tu impacto + la respuesta.
import React, { useState } from 'react';
import { postCompetidorWhatIf } from '../../api/developer';
import { Activity, Sparkle } from '../icons';

const SEGMENTOS = [['NSE_AB', 'A/B (alto)'], ['NSE_C+', 'C+ (medio-alto)'], ['NSE_C', 'C (medio)'], ['NSE_D', 'D (popular)']];
const vColor = (v) => (v === 'alto' ? 'var(--hot, #F2635B)' : v === 'medio' ? 'var(--warm, #E2982E)' : 'var(--ok, #1FA06A)');

const inputStyle = {
  padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border, rgba(var(--cream-rgb),0.14))',
  background: 'var(--surface, #fff)', color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif', fontSize: 13, width: '100%',
};
const lbl = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 5, display: 'block' };

export default function CompetidorWhatIf({ colonias = [], zonaSel }) {
  const [colonia, setColonia] = useState(zonaSel || (colonias[0] && colonias[0].slug) || '');
  const [unidades, setUnidades] = useState(40);
  const [precio, setPrecio] = useState('');
  const [segmento, setSegmento] = useState('NSE_C+');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const simular = async () => {
    setLoading(true); setErr(''); setRes(null);
    try {
      const body = { unidades_nuevas: Number(unidades) || 40, segmento };
      if (colonia) body.colonia = colonia;
      if (precio) body.precio_m2 = Number(precio);
      const r = await postCompetidorWhatIf(body);
      setRes(r);
    } catch (e) { setErr(e.message || 'No se pudo simular.'); }
    setLoading(false);
  };

  const imp = res && res.impacto;
  const z = res && res.zona;

  return (
    <div data-testid="competidor-whatif" style={{
      marginBottom: 18, borderRadius: 16, overflow: 'hidden',
      background: 'var(--surface, #fff)', border: '1px solid var(--border-2, var(--border))', boxShadow: 'var(--asr-shadow, none)',
    }}>
      <div style={{ padding: '15px 18px 14px', borderBottom: '1px solid var(--border, rgba(var(--cream-rgb),0.08))' }}>
        <div className="eyebrow" style={{ marginBottom: 7, color: 'var(--theme)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkle size={11} /> ¿Y SI UN COMPETIDOR CONSTRUYE EN TU ZONA?
        </div>
        <p style={{ margin: 0, fontFamily: 'DM Sans,sans-serif', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.45 }}>
          Simula el impacto de una nueva oferta rival en tu tiempo de venta y tu poder de precio — con el inventario y la demanda real de tu zona.
        </p>
      </div>

      {/* controles */}
      <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={lbl}>Zona</label>
          {colonias.length ? (
            <select style={inputStyle} value={colonia} onChange={(e) => setColonia(e.target.value)} data-testid="cwi-colonia">
              {colonias.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          ) : <input style={inputStyle} value={colonia} onChange={(e) => setColonia(e.target.value)} placeholder="tu colonia" />}
        </div>
        <div>
          <label style={lbl}>Unidades del competidor</label>
          <input style={inputStyle} type="number" min="1" value={unidades} onChange={(e) => setUnidades(e.target.value)} data-testid="cwi-unidades" />
        </div>
        <div>
          <label style={lbl}>Su precio $/m² (opcional)</label>
          <input style={inputStyle} type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="precio de zona" data-testid="cwi-precio" />
        </div>
        <div>
          <label style={lbl}>Segmento</label>
          <select style={inputStyle} value={segmento} onChange={(e) => setSegmento(e.target.value)}>
            {SEGMENTOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        <button onClick={simular} disabled={loading} data-testid="cwi-simular" style={{
          padding: '9px 16px', borderRadius: 9999, border: 'none', cursor: loading ? 'default' : 'pointer',
          background: 'var(--theme, #6D4AFF)', color: '#fff', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 700, height: 38,
        }}>{loading ? 'Simulando…' : 'Simular'}</button>
      </div>

      {err && <div style={{ padding: '0 18px 14px', fontSize: 12.5, color: 'var(--hot, #F2635B)' }}>{err}</div>}

      {/* resultado */}
      {res && res.vacio && (
        <div style={{ padding: '0 18px 16px', fontSize: 13, color: 'var(--cream-2)' }}>{res.lectura}</div>
      )}
      {res && !res.vacio && imp && (
        <div data-testid="cwi-resultado">
          <div style={{ padding: '0 18px 12px' }}>
            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 9999, fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#fff', background: vColor(res.veredicto), marginBottom: 8 }}>
              impacto {res.veredicto}
            </span>
            <p style={{ margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 15.5, color: 'var(--cream)', lineHeight: 1.45 }}>{res.lectura}</p>
          </div>
          {/* métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 1, background: 'var(--border, rgba(var(--cream-rgb),0.08))' }}>
            {[
              ['Inventario sube', imp.inventario_sube_pct != null ? `+${imp.inventario_sube_pct}%` : '—'],
              ['Tiempo de venta', `${imp.meses_venta_antes}→${imp.meses_venta_despues} meses`],
              ['Competencia directa', `${imp.competencia_directa_antes}→${imp.competencia_directa_despues} u.`],
              ['Demanda en riesgo', imp.demanda_en_riesgo_pct != null ? `${imp.demanda_en_riesgo_pct}%` : '—'],
            ].map(([k, v], i) => (
              <div key={i} style={{ background: 'var(--surface, #fff)', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{v}</div>
              </div>
            ))}
          </div>
          {/* recomendaciones */}
          <div style={{ padding: '13px 18px 6px' }}>
            <div className="eyebrow" style={{ color: 'var(--theme)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <Activity size={11} /> TU RESPUESTA
            </div>
            {(res.recomendaciones || []).map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.45 }}>
                <span style={{ color: 'var(--theme)', fontWeight: 800 }}>·</span>{r}
              </div>
            ))}
          </div>
          {z && (
            <div style={{ padding: '4px 18px 14px', fontSize: 11, color: 'var(--cream-3)' }}>
              Base real de tu zona: {z.inventario_disponible} u. disponibles{z.tus_unidades ? ` (${z.tus_unidades} tuyas)` : ''}{z.precio_m2_zona ? ` · ~$${z.precio_m2_zona.toLocaleString()}/m²` : ''}{z.demanda_mensual ? ` · ~${z.demanda_mensual} búsquedas/mes` : ''}. {res.disclaimer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
