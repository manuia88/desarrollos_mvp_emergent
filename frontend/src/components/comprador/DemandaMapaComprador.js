// L55 · lente ESPACIAL del comprador — el MAPA de calor de la DEMANDA: dónde está buscando la gente (más intenso = más
// demanda) y RESALTA las zonas que a ti te laten. Espejo del heatmap del dev. Reusa DemandHeatmapMap (mapbox) +
// /api/buyer/demanda-mapa. Hide-if-empty. Complementa la lista de "¿dónde vivirías?" con la intuición espacial.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DemandHeatmapMap from '../developer/DemandHeatmapMap';
import { visitorId } from '../../lib/buyerSignal';
import { tc } from '../../lib/titleCase';

const API = process.env.REACT_APP_BACKEND_URL;
const HEAD = "'Outfit',sans-serif";

export default function DemandaMapaComprador() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/buyer/demanda-mapa?visitor_id=${encodeURIComponent(visitorId())}`)
      .then((r) => r.json()).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData({ features: [] }); });
    return () => { alive = false; };
  }, []);

  const feats = data ? (data.features || []) : null;
  if (feats && feats.length === 0) return null;   // hide-if-empty (consistente con el resto del comprador)

  const renderCta = (p) => `
    <div style="font-family:DM Sans;color:#06080F;padding:8px 6px;min-width:190px;">
      <div style="font-family:Outfit;font-weight:700;font-size:13px;">${p.colonia}</div>
      <div style="font-size:11px;opacity:0.7;text-transform:uppercase;margin-bottom:8px;">${p.alcaldia || ''}${p.mine ? ' · te late' : ''}</div>
      <a href="/zona/${encodeURIComponent(p.colonia_id)}"
         style="display:inline-block;padding:6px 11px;border-radius:9999px;background:transparent;border:1px solid #06080F;color:#06080F;font-family:DM Sans;font-size:11.5px;font-weight:600;text-decoration:none;">
        Ver esta zona →
      </a>
    </div>`;

  const mias = (data && data.top || []).filter((t) => t.mine).map((t) => tc(t.colonia));

  return (
    <section data-testid="demanda-mapa-comprador" style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>El mapa de la demanda</h2>
        <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>dónde está buscando la gente — más intenso = más demanda</span>
      </div>
      {!feats ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', padding: 10 }}>Cargando el mapa…</div>
      ) : (
        <>
          <DemandHeatmapMap geojson={data} height={420} renderCta={renderCta}
            onSelectColonia={(cid) => cid && navigate(`/zona/${cid}`)} />
          {mias.length > 0 && (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 10 }}>
              Resaltadas: las zonas que te laten — {mias.join(', ')}.
            </div>
          )}
        </>
      )}
    </section>
  );
}
