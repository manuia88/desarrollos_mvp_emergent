/**
 * CubeActuarView — el tab ACTUAR del Hub de Mercado (N5 Slice 1): la demanda insatisfecha deja de ser
 * lectura y se vuelve acción. Card deck con los huecos demanda-vs-oferta (colonia × tipología, del motor
 * demand-gap que YA alimenta el IntelPanel) y el primer verbo: "Generar brief" → crea y PERSISTE el brief
 * de producto ("qué construir aquí") reusando el generador del founder-console. F3 lo despacha al dev.
 * Lenguaje humano, tema oscuro del cubo, estados vacíos honestos.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, AlertCircle, FileText, CheckCircle } from 'lucide-react';
import { getCubeDemandGap, createCubeProductBrief } from '../../api/superadminMetricsCube';

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function CubeActuarView({ onToast }) {
  const [cells, setCells] = useState(null);
  const [err, setErr] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [done, setDone] = useState({});   // key → brief_id (feedback de "ya generado" en esta sesión)

  useEffect(() => {
    let alive = true;
    getCubeDemandGap(25)
      .then((d) => { if (alive) setCells((d && d.cells) || []); })
      .catch((e) => { if (alive) setErr(e?.message || 'No se pudo cargar la demanda.'); });
    return () => { alive = false; };
  }, []);

  const generar = async (cell) => {
    const key = `${cell.colonia}|${cell.tipologia}`;
    setBusyKey(key);
    try {
      const r = await createCubeProductBrief(cell.colonia, { tipologia: cell.tipologia });
      setDone((d) => ({ ...d, [key]: r.brief_id }));
      if (onToast) onToast(`Brief de ${tc(cell.colonia)} generado y guardado ✓`);
    } catch (e) {
      if (onToast) onToast(e?.message || 'No se pudo generar el brief.');
    } finally {
      setBusyKey(null);
    }
  };

  if (err) {
    return (
      <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={15} /> {err}
      </div>
    );
  }
  if (cells === null) {
    return <div data-testid="actuar-loading" style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Buscando huecos de demanda…</div>;
  }
  if (!cells.length) {
    return (
      <div style={{ padding: 26, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>
        Aún no hay huecos de demanda registrados. Se llena conforme entra actividad de compradores al marketplace.
      </div>
    );
  }

  return (
    <div data-testid="cube-actuar-view">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Sparkles size={14} style={{ color: 'var(--theme)' }} />
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Dónde hay demanda y falta oferta</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.6)', marginBottom: 14 }}>
        Colonias × tipo de unidad donde la gente busca y casi no hay inventario. Genera el brief («qué construir aquí») y queda guardado para mandárselo a un desarrollador.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
        {cells.map((c) => {
          const key = `${c.colonia}|${c.tipologia}`;
          const generado = done[key];
          return (
            <div key={key} className="dmx-card" data-testid={`actuar-card-${key}`}
              style={{ padding: '15px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14.5, color: 'var(--cream)' }}>{tc(c.colonia)}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.65)', marginTop: 2 }}>{tc(c.tipologia)}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.8)' }}>
                <span><b style={{ color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{nf.format(c.available ?? 0)}</b> disponibles</span>
                <span><b style={{ color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{nf.format(c.sold ?? 0)}</b> vendidas</span>
                {c.absorcion_pct != null && <span><b style={{ color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{c.absorcion_pct}%</b> absorción</span>}
              </div>
              {c.verdict && (
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)', marginTop: 6, lineHeight: 1.4 }}>{c.verdict}</div>
              )}
              <button
                onClick={() => generar(c)}
                disabled={busyKey === key || !!generado}
                data-testid={`actuar-brief-${key}`}
                style={{
                  marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 9999, border: 'none',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: generado ? 'rgba(74,222,128,0.14)' : 'rgba(var(--theme-rgb),0.16)',
                  color: generado ? '#4ADE80' : 'var(--theme)',
                  outline: generado ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(var(--theme-rgb),0.45)',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                  cursor: busyKey === key || generado ? 'default' : 'pointer',
                  opacity: busyKey === key ? 0.6 : 1,
                }}>
                {generado ? (<><CheckCircle size={13} /> Brief guardado</>)
                  : busyKey === key ? 'Generando…'
                    : (<><FileText size={13} /> Generar brief</>)}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', marginTop: 12 }}>
        El brief se calcula con la demanda real de la zona (mezcla de unidades, amenidades y precio que la gente pide) y queda guardado con auditoría. El envío directo al desarrollador llega en la siguiente fase.
      </div>
    </div>
  );
}
