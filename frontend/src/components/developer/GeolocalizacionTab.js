// GeolocalizacionTab — Phase 4.5 · Mapbox picker integrated into legajo
import React, { useEffect, useState } from 'react';
import { Card } from '../advisor/primitives';
import MapboxPicker from './MapboxPicker';
import * as api from '../../api/developer';
import { MapPin, CheckCircle } from '../icons';

export default function GeolocalizacionTab({ devId, user, readOnly: readOnlyProp = false }) {
  const [loc, setLoc] = useState(null);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  // Batch 2.1 role guard — only developer_admin or superadmin can move the marker.
  const canEdit = !readOnlyProp && (user?.role === 'developer_admin' || user?.role === 'superadmin');
  const readOnly = !canEdit;

  useEffect(() => {
    if (!devId) return;
    api.getProjectLocation(devId)
      .then(setLoc)
      .catch(e => setErr(e.body?.detail || 'Error al cargar ubicación'));
  }, [devId]);

  const handleSave = async (lat, lng, zoom) => {
    try {
      await api.saveProjectLocation(devId, { lat, lng, zoom, address: loc?.address });
      setToast({ type: 'ok', msg: 'Ubicación guardada y auditada' });
      setLoc(prev => ({ ...prev, lat, lng, zoom, source: 'manual' }));
      setTimeout(() => setToast(null), 3200);
    } catch (e) {
      setToast({ type: 'error', msg: e.body?.detail || 'Error al guardar' });
    }
  };

  if (err) return <Card style={{ padding: 40, textAlign: 'center', color: '#fca5a5' }}>{err}</Card>;
  if (!loc) return <Card style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando mapa…</Card>;

  return (
    <div data-testid="geoloc-tab">
      <Card style={{ marginBottom: 14 }}>
        <div className="eyebrow">GEOLOCALIZACIÓN</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 6px', letterSpacing: '-0.018em' }}>
          Ubicación precisa del proyecto
        </h3>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55, maxWidth: 620, marginBottom: 14 }}>
          Haz clic en el mapa o arrastra el marcador para ajustar la ubicación exacta. La posición se guarda con audit log
          y se usa para el pin del marketplace y análisis de demanda por radio.
        </p>

        {loc.source && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
            padding: '5px 10px', borderRadius: 9999,
            background: loc.source === 'manual' ? 'rgba(34,197,94,0.14)' : 'rgba(251,191,36,0.14)',
            border: `1px solid ${loc.source === 'manual' ? 'rgba(34,197,94,0.35)' : 'rgba(251,191,36,0.35)'}`,
            color: loc.source === 'manual' ? '#86efac' : '#fcd34d',
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
          }} data-testid="geoloc-source">
            {loc.source === 'manual'
              ? <><CheckCircle size={11} /> Ubicación confirmada</>
              : <><MapPin size={11} /> Usando centro de colonia (confirma la posición)</>}
          </div>
        )}

        <MapboxPicker
          lat={loc.lat}
          lng={loc.lng}
          zoom={loc.zoom || 14}
          onSave={handleSave}
          readOnly={readOnly}
          height={400}
        />

        {loc.address && (
          <div style={{ marginTop: 10, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }} data-testid="geoloc-address">
            <strong style={{ color: 'var(--cream-2)' }}>Dirección:</strong> {loc.address}
          </div>
        )}
      </Card>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 620,
          padding: '12px 18px', borderRadius: 14,
          background: toast.type === 'ok' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.16)',
          border: `1px solid ${toast.type === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.type === 'ok' ? '#86efac' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500,
        }} data-testid="geoloc-toast">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
