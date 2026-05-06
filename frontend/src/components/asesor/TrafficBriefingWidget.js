/**
 * Phase 3 Batch 31 · Components — TrafficBriefingWidget.
 *
 * Widget compacto para Asesor: input origen/destino, muestra minutos con tráfico
 * (badge gradient), clima del destino y banner is_stale si la fuente es estimada.
 *
 * Diseño: cream/navy, rounded-full, sin shadow-2xl, sin emojis.
 */
import React, { useState, useCallback } from 'react';
import { fetchTrafficBriefing } from '../../api/asesor';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

function CoordInput({ label, latVal, lngVal, onLat, onLng, testIdPrefix }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--cream-3)',
      }}>{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          data-testid={`${testIdPrefix}-lat`}
          type="number" step="0.0001" placeholder="Lat"
          value={latVal} onChange={(e) => onLat(e.target.value)}
          style={inputStyle}
        />
        <input
          data-testid={`${testIdPrefix}-lng`}
          type="number" step="0.0001" placeholder="Lng"
          value={lngVal} onChange={(e) => onLng(e.target.value)}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

const inputStyle = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(240,235,224,0.18)',
  background: 'rgba(240,235,224,0.04)',
  color: 'var(--cream)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
};

const QUICK_PRESETS = [
  {
    label: 'Roma Norte → Polanco',
    o: [19.4187, -99.1626], oL: 'Roma Norte',
    d: [19.4326, -99.1965], dL: 'Polanco',
  },
  {
    label: 'Coyoacán → Santa Fe',
    o: [19.3493, -99.1620], oL: 'Coyoacán',
    d: [19.3597, -99.2581], dL: 'Santa Fe',
  },
  {
    label: 'GDL Centro → Providencia',
    o: [20.6736, -103.3445], oL: 'Centro Histórico GDL',
    d: [20.6960, -103.3895], dL: 'Providencia',
  },
];

export default function TrafficBriefingWidget({
  initialOrigin = null,
  initialDestination = null,
  projectId = null,
  compact = false,
}) {
  const [originLat, setOriginLat] = useState(initialOrigin?.[0] ?? '');
  const [originLng, setOriginLng] = useState(initialOrigin?.[1] ?? '');
  const [destLat, setDestLat] = useState(initialDestination?.[0] ?? '');
  const [destLng, setDestLng] = useState(initialDestination?.[1] ?? '');
  const [originLabel, setOriginLabel] = useState('');
  const [destLabel, setDestLabel] = useState('');

  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = useCallback((p) => {
    setOriginLat(p.o[0]); setOriginLng(p.o[1]); setOriginLabel(p.oL);
    setDestLat(p.d[0]); setDestLng(p.d[1]); setDestLabel(p.dL);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError('');
    const oLa = parseFloat(originLat), oLn = parseFloat(originLng);
    const dLa = parseFloat(destLat), dLn = parseFloat(destLng);
    if (Number.isNaN(oLa) || Number.isNaN(oLn) || Number.isNaN(dLa) || Number.isNaN(dLn)) {
      setError('Coordenadas inválidas. Verifica origen y destino.');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchTrafficBriefing({
        originLat: oLa, originLng: oLn,
        destinationLat: dLa, destinationLng: dLn,
        originLabel, destinationLabel: destLabel,
        projectId,
      });
      setBriefing(data);
    } catch (e) {
      setError(e.message || 'Error al obtener briefing');
    } finally {
      setLoading(false);
    }
  }, [originLat, originLng, destLat, destLng, originLabel, destLabel, projectId]);

  return (
    <div
      data-testid="traffic-briefing-widget"
      style={{
        padding: compact ? 14 : 20,
        borderRadius: 16,
        background: 'rgba(240,235,224,0.04)',
        border: '1px solid rgba(240,235,224,0.1)',
        backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--cream-3)',
          }}>Briefing pre-visita</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--cream)', marginTop: 2 }}>
            Tráfico y clima al destino
          </div>
        </div>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {QUICK_PRESETS.map((p) => (
          <button
            key={p.label}
            data-testid={`preset-${p.label.replace(/\s+/g, '-').toLowerCase()}`}
            type="button"
            onClick={() => applyPreset(p)}
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              border: '1px solid rgba(240,235,224,0.2)',
              background: 'transparent',
              color: 'var(--cream)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >{p.label}</button>
        ))}
      </div>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CoordInput
          label="Origen"
          latVal={originLat} lngVal={originLng}
          onLat={setOriginLat} onLng={setOriginLng}
          testIdPrefix="briefing-origin"
        />
        <CoordInput
          label="Destino"
          latVal={destLat} lngVal={destLng}
          onLat={setDestLat} onLng={setDestLng}
          testIdPrefix="briefing-dest"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          data-testid="briefing-origin-label"
          placeholder="Etiqueta origen (opcional)"
          value={originLabel} onChange={(e) => setOriginLabel(e.target.value)}
          style={inputStyle}
        />
        <input
          data-testid="briefing-dest-label"
          placeholder="Etiqueta destino (opcional)"
          value={destLabel} onChange={(e) => setDestLabel(e.target.value)}
          style={inputStyle}
        />
      </div>

      <button
        data-testid="briefing-submit-btn"
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        style={{
          padding: '12px 24px',
          borderRadius: 9999,
          border: 'none',
          background: GRADIENT,
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          letterSpacing: '0.02em',
        }}
      >{loading ? 'Calculando…' : 'Generar briefing'}</button>

      {error && (
        <div data-testid="briefing-error" style={{
          padding: 10, borderRadius: 10,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: 12,
        }}>{error}</div>
      )}

      {briefing && <BriefingResult data={briefing} />}
    </div>
  );
}

function BriefingResult({ data }) {
  const stale = data.is_stale;
  const w = data.weather || {};
  return (
    <div data-testid="briefing-result" style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: 14, borderRadius: 14,
      background: 'rgba(99,102,241,0.06)',
      border: '1px solid rgba(99,102,241,0.18)',
    }}>
      {stale && (
        <div data-testid="briefing-stale-banner" style={{
          padding: '6px 12px', borderRadius: 9999, alignSelf: 'flex-start',
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)',
          color: '#fbbf24', fontSize: 10, letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {data.source === 'last_known'
            ? 'Datos de última caché disponible'
            : 'Estimado · sin datos en vivo'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--cream-3)',
          }}>Tiempo con tráfico</div>
          <div style={{
            fontSize: 32, fontWeight: 700, color: 'var(--cream)', marginTop: 4,
            background: GRADIENT,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>{data.traffic_minutes} min</div>
          <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
            {data.distance_km} km de distancia
          </div>
        </div>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--cream-3)',
          }}>Clima en destino</div>
          <div style={{ fontSize: 18, color: 'var(--cream)', marginTop: 4, fontWeight: 600 }}>
            {w.temperature_c != null ? `${w.temperature_c}°C` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
            {w.weather_label || 'Sin datos'}
            {w.precipitation_mm > 0 && ` · ${w.precipitation_mm} mm`}
            {w.wind_speed_kmh > 0 && ` · viento ${w.wind_speed_kmh} km/h`}
          </div>
        </div>
      </div>

      {(data.origin_label || data.destination_label) && (
        <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>
          {data.origin_label || 'Origen'} → {data.destination_label || 'Destino'}
        </div>
      )}
    </div>
  );
}
