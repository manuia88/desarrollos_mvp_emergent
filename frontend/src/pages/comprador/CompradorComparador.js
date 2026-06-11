// CompradorComparador — "Comparar" premium dentro del portal del comprador.
// CABLE que faltaba: los endpoints /api/comprador/compare(+pdf) + el cliente compareEntitiesBuyer
// YA existían, pero solo se usaban en el marketplace público. Aquí el comprador autenticado
// compara 2-3 de SUS favoritos (lado a lado, con ganador por métrica + datos premium + PDF).
// Reusa todo lo existente · cero motor nuevo.
import React, { useEffect, useState, useCallback } from 'react';
import CompradorLayout from '../../components/comprador/CompradorLayout';
import { Brain, Check, Heart } from '../../components/icons';
import { listFavorites } from '../../api/comprador';
import { compareEntitiesBuyer, downloadComparePdfBuyer } from '../../api/marketplace';

// item_type del favorito → entity_type del comparador
const TO_ENTITY = (t) => (t === 'colonia' ? 'colonia' : 'property');
const BUCKET_LABEL = { colonia: 'Colonias', property: 'Propiedades' };

const card = {
  padding: 18, borderRadius: 14, background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16,
};
const eyebrow = {
  fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'rgba(240,235,224,0.55)',
};

export default function CompradorComparador() {
  const [favs, setFavs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState('property');
  const [picked, setPicked] = useState([]);          // item_ids elegidos
  const [matrix, setMatrix] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listFavorites();
      setFavs(Array.isArray(list) ? list : []);
    } catch { setFavs([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  // agrupa favoritos por bucket comparable
  const buckets = { colonia: [], property: [] };
  favs.forEach((f) => {
    const b = TO_ENTITY(f.item_type);
    buckets[b].push({ id: f.item_id, label: (f.thumb && f.thumb.name) || f.item_id, colonia: f.thumb && f.thumb.colonia });
  });
  const items = buckets[bucket] || [];

  const togglePick = (id) => {
    setMatrix(null);
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : (p.length >= 3 ? p : [...p, id]));
  };
  const switchBucket = (b) => { setBucket(b); setPicked([]); setMatrix(null); };

  const compare = async () => {
    if (picked.length < 2) { flash('Elige al menos 2 para comparar.'); return; }
    setComparing(true);
    try { setMatrix(await compareEntitiesBuyer(bucket, picked)); }
    catch (e) { flash(e.message || 'No se pudo comparar.'); }
    finally { setComparing(false); }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const blob = await downloadComparePdfBuyer(bucket, picked);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'comparacion_premium_dmx.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch { flash('No se pudo generar el PDF.'); } finally { setPdfBusy(false); }
  };

  return (
    <CompradorLayout>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Brain size={22} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--cream)' }}>Comparar</h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'rgba(240,235,224,0.7)', margin: '0 0 18px' }}>
          Elige 2 o 3 de tus favoritos y míralos lado a lado — con el ganador de cada cosa y un PDF para llevarte.
        </p>

        {toast && (
          <div style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 10, background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', color: '#FACC15', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600 }}>{toast}</div>
        )}

        {loading ? (
          <div style={{ ...card, textAlign: 'center', color: 'rgba(240,235,224,0.6)', fontSize: 13 }}>Cargando tus favoritos…</div>
        ) : (buckets.colonia.length + buckets.property.length) === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '28px 18px' }}>
            <Heart size={20} color="rgba(240,235,224,0.4)" />
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--cream)', margin: '8px 0 4px' }}>Aún no tienes favoritos</div>
            <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Marca con ♥ las propiedades o colonias que te gusten y aquí las comparas.</div>
          </div>
        ) : (
          <>
            {/* selector de tipo (solo si hay de ambos) */}
            {buckets.colonia.length > 0 && buckets.property.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {['property', 'colonia'].map((b) => (
                  <button key={b} onClick={() => switchBucket(b)} style={{
                    padding: '7px 14px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
                    background: bucket === b ? 'rgba(var(--theme-rgb),0.14)' : 'transparent',
                    border: bucket === b ? '1px solid rgba(var(--theme-rgb),0.35)' : '1px solid rgba(240,235,224,0.15)',
                    color: bucket === b ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
                  }}>{BUCKET_LABEL[b]} ({buckets[b].length})</button>
                ))}
              </div>
            )}

            {/* picker */}
            <div style={card}>
              <div style={{ ...eyebrow, marginBottom: 10 }}>Elige 2 o 3 ({picked.length}/3)</div>
              {items.length < 2 ? (
                <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>
                  Necesitas al menos 2 {BUCKET_LABEL[bucket].toLowerCase()} en favoritos para comparar.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {items.map((it) => {
                    const on = picked.includes(it.id);
                    const dim = !on && picked.length >= 3;
                    return (
                      <button key={it.id} onClick={() => togglePick(it.id)} disabled={dim} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 10, cursor: dim ? 'default' : 'pointer',
                        background: on ? 'rgba(var(--theme-rgb),0.14)' : 'rgba(255,255,255,0.03)',
                        border: on ? '1.5px solid rgba(var(--theme-rgb),0.4)' : '1px solid rgba(240,235,224,0.12)',
                        color: on ? 'var(--cream)' : 'rgba(240,235,224,0.75)', opacity: dim ? 0.4 : 1, fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
                      }}>
                        {on && <Check size={13} color="var(--theme)" />}
                        <span>{it.label}{it.colonia ? ` · ${it.colonia}` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {items.length >= 2 && (
                <button onClick={compare} disabled={comparing || picked.length < 2} style={{
                  marginTop: 14, background: 'linear-gradient(90deg, var(--theme), var(--theme-3, #ec4899))', color: '#fff', border: 'none',
                  borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: picked.length < 2 ? 'default' : 'pointer', opacity: (comparing || picked.length < 2) ? 0.6 : 1,
                }}>{comparing ? 'Comparando…' : 'Comparar'}</button>
              )}
            </div>

            {/* matriz de resultados */}
            {matrix && !matrix.error && (
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={eyebrow}>Lado a lado</div>
                  <button onClick={downloadPdf} disabled={pdfBusy} style={{
                    padding: '6px 13px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(240,235,224,0.15)',
                    color: 'rgba(240,235,224,0.8)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>{pdfBusy ? 'Generando…' : '⬇ PDF'}</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                    <thead><tr>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.5)', fontWeight: 700 }} />
                      {(matrix.entities || []).map((e) => (
                        <th key={e.id} style={{ padding: '8px 10px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', fontWeight: 700, textAlign: 'center' }}>{e.nombre}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(matrix.metrics || []).map((m, ri) => (
                        <tr key={ri}>
                          <td style={{ padding: '9px 10px', fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.65)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>{m.label}</td>
                          {(m.values || []).map((v, ci) => {
                            const win = m.winner_idx === ci;
                            return (
                              <td key={ci} style={{
                                padding: '9px 10px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)',
                                fontFamily: 'DM Sans', fontSize: 13, fontWeight: win ? 800 : 500,
                                color: win ? '#4ADE80' : 'var(--cream)',
                                background: win ? 'rgba(74,222,128,0.08)' : 'transparent',
                              }}>{win && '★ '}{v}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)', marginTop: 8 }}>★ = mejor en esa fila.</div>
              </div>
            )}
            {matrix && matrix.error && (
              <div style={{ ...card, color: '#F87171', fontSize: 13 }}>{matrix.error}</div>
            )}
          </>
        )}
      </div>
    </CompradorLayout>
  );
}
