// GeolocalizacionTab — Phase 4.5 · Mapbox picker integrated into legajo (+4.18 GeoJSON export)
import React, { useEffect, useState } from 'react';
import { Card } from '../advisor/primitives';
import MapboxPicker from './MapboxPicker';
import * as api from '../../api/developer';
import { MapPin, CheckCircle, Layers } from '../icons';
import { Z } from '../../styles/zIndex';

const GEOJSON_ALLOWED = new Set(['developer_admin', 'superadmin']);
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

export default function GeolocalizacionTab({ devId, user, readOnly: readOnlyProp = false }) {
  const [loc, setLoc] = useState(null);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [addr, setAddr] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  // Batch 2.1 role guard — only developer_admin or superadmin can move the marker.
  const canEdit = !readOnlyProp && (user?.role === 'developer_admin' || user?.role === 'superadmin');
  const readOnly = !canEdit;
  // Batch 3 · 4.18 role guard for GeoJSON export
  const canExport = GEOJSON_ALLOWED.has(user?.role) || user?.internal_role === 'commercial_director';
  const hasLocation = loc && loc.source === 'manual';

  useEffect(() => {
    if (!devId) return;
    api.getProjectLocation(devId)
      .then(d => { setLoc(d); setAddr(d?.address || ''); })
      .catch(e => setErr(e.body?.detail || 'Error al cargar ubicación'));
  }, [devId]);

  const handleSave = async (lat, lng, zoom) => {
    try {
      const address = (addr || '').trim() || loc?.address || null;
      await api.saveProjectLocation(devId, { lat, lng, zoom, address });
      setToast({ type: 'ok', msg: 'Ubicación guardada' });
      setLoc(prev => ({ ...prev, lat, lng, zoom, address, source: 'manual' }));
      setTimeout(() => setToast(null), 3200);
    } catch (e) {
      setToast({ type: 'error', msg: e.body?.detail || 'Error al guardar' });
    }
  };

  // Buscar la dirección escrita y mover el pin a ese punto (geocoding Mapbox).
  const handleFindAddress = async () => {
    if (!addr.trim() || geocoding) return;
    if (!MAPBOX_TOKEN) { setToast({ type: 'error', msg: 'Mapa no configurado' }); return; }
    setGeocoding(true);
    try {
      const q = encodeURIComponent(addr.trim());
      const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&country=mx&limit=1&language=es`);
      const data = await r.json();
      const feat = data.features && data.features[0];
      if (!feat) { setToast({ type: 'error', msg: 'No encontré esa dirección. Revisa o ajusta el pin a mano.' }); return; }
      const [lng, lat] = feat.center;
      setLoc(prev => ({ ...prev, lat, lng, address: addr.trim(), source: 'manual' }));
      setToast({ type: 'ok', msg: 'Dirección encontrada. Revisa el pin y pulsa "Guardar ubicación".' });
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setToast({ type: 'error', msg: 'Error al buscar la dirección' });
    } finally {
      setGeocoding(false);
    }
  };

  const handleExportGeoJSON = async () => {
    if (exporting || !canExport) return;
    if (!hasLocation) {
      setToast({ type: 'error', msg: 'Configura y guarda la ubicación antes de exportar' });
      return;
    }
    setExporting(true);
    try {
      const r = await fetch(api.getProjectGeoJsonUrl(devId), { credentials: 'include' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${devId}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ type: 'ok', msg: 'Archivo descargado correctamente' });
    } catch (e) {
      setToast({ type: 'error', msg: e.message || 'Error al exportar GeoJSON' });
    } finally {
      setExporting(false);
    }
  };

  if (err) return <Card style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{err}</Card>;
  if (!loc) return <Card style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando mapa…</Card>;

  return (
    <div data-testid="geoloc-tab">
      <Card style={{ marginBottom: 14 }}>
        <div className="eyebrow">GEOLOCALIZACIÓN</div>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 6px', letterSpacing: '-0.018em' }}>
          Ubicación precisa del proyecto
        </h3>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55, maxWidth: 620, marginBottom: 14 }}>
          Escribe la dirección y pulsa “Buscar”, o haz clic en el mapa para mover el pin a mano.
          La ubicación se usa para el pin del proyecto y el análisis de la zona.
        </p>

        {/* Dirección manual */}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              data-testid="geoloc-address-input"
              value={addr}
              onChange={e => setAddr(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleFindAddress(); }}
              placeholder="Ej: Av. Insurgentes Sur 1234, Del Valle, CDMX"
              style={{
                flex: 1, minWidth: 260, padding: '10px 14px',
                background: 'rgba(var(--bg-rgb),0.6)', border: '1px solid var(--border)',
                borderRadius: 10, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
              }}
            />
            <button
              data-testid="geoloc-find-btn"
              onClick={handleFindAddress}
              disabled={!addr.trim() || geocoding}
              style={{
                padding: '10px 18px', borderRadius: 10,
                background: (!addr.trim() || geocoding) ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
                border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                cursor: (!addr.trim() || geocoding) ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}>
              <MapPin size={13} /> {geocoding ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
        )}

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

        {/* Batch 3 · 4.18 GeoJSON export */}
        {canExport && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>DESCARGAR · OPCIONAL</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5, maxWidth: 480 }}>
                  Baja un archivo con la ubicación del proyecto y sus unidades, por si lo necesitas
                  en otro programa de mapas. Si no, puedes ignorarlo.
                </div>
              </div>
              <button
                data-testid="geojson-export-btn"
                onClick={handleExportGeoJSON}
                disabled={!hasLocation || exporting}
                title={!hasLocation ? 'Guarda la ubicación antes de descargar' : 'Descargar archivo de ubicación'}
                style={{
                  padding: '10px 16px', borderRadius: 9999,
                  background: (!hasLocation || exporting) ? 'rgba(148,163,184,0.2)' : 'rgba(var(--theme-rgb),0.14)',
                  border: `1px solid ${(!hasLocation || exporting) ? 'var(--border)' : 'rgba(var(--theme-rgb),0.32)'}`,
                  color: (!hasLocation || exporting) ? 'var(--cream-3)' : '#f9a8d4',
                  fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                  cursor: (!hasLocation || exporting) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                }}>
                <Layers size={13} />
                {exporting ? 'Descargando…' : 'Descargar archivo de ubicación'}
              </button>
            </div>
            {!hasLocation && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 9999, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)', color: 'var(--amber)', fontFamily: 'DM Sans', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }} data-testid="geojson-no-loc-hint">
                <MapPin size={11} /> Guarda la ubicación primero
              </div>
            )}
          </div>
        )}
      </Card>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY,
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
