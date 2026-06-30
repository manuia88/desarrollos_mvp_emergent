// Lente ESPACIAL del asesor — el MAPA de calor de la DEMANDA del mercado: dónde está buscando la gente (más intenso =
// más demanda), para saber DÓNDE colocar tus propiedades / atender leads. Reusa DemandHeatmapMap (mapbox) +
// /api/buyer/demanda-mapa (demanda de mercado, sin visitante). Hide-if-empty. Convierte el lente espacial del asesor
// de tabla → mapa navegable (cierra el gap de la auditoría: "tablas, no mapa").
import React, { useEffect, useState } from 'react';
import DemandHeatmapMap from '../developer/DemandHeatmapMap';

const API = process.env.REACT_APP_BACKEND_URL;
const HEAD = "'Outfit',sans-serif";

export default function AsesorDemandaMapa() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/buyer/demanda-mapa`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData({ features: [] }); });
    return () => { alive = false; };
  }, []);

  const feats = data ? (data.features || []) : null;
  if (feats && feats.length === 0) return null; // hide-if-empty

  const renderCta = (p) => `
    <div style="font-family:DM Sans;color:#06080F;padding:8px 6px;min-width:190px;">
      <div style="font-family:Outfit;font-weight:700;font-size:13px;">${p.colonia}</div>
      <div style="font-size:11px;opacity:0.7;text-transform:uppercase;margin-bottom:8px;">${p.alcaldia || ''}</div>
      <a href="/zona/${encodeURIComponent(p.colonia_id)}"
         style="display:inline-block;padding:6px 11px;border-radius:9999px;background:transparent;border:1px solid #06080F;color:#06080F;font-family:DM Sans;font-size:11.5px;font-weight:600;text-decoration:none;">
        Ver esta zona →
      </a>
    </div>`;

  return (
    <section data-testid="asesor-demanda-mapa" style={{ marginTop: 18, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>El mapa de la demanda</h3>
        <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)' }}>dónde busca la gente — más intenso = más demanda (dónde colocar)</span>
      </div>
      {!feats ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', padding: 10 }}>Cargando el mapa…</div>
      ) : (
        <DemandHeatmapMap geojson={data} height={380} renderCta={renderCta}
          onSelectColonia={(cid) => { if (cid) window.location.assign(`/zona/${cid}`); }} />
      )}
    </section>
  );
}
