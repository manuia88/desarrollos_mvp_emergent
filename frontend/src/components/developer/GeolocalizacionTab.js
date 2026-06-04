// GeolocalizacionTab — Phase 4.5 · Mapbox picker con dirección estructurada
import React, { useEffect, useState, useRef } from 'react';
import { Card } from '../advisor/primitives';
import MapboxPicker from './MapboxPicker';
import * as api from '../../api/developer';
import { MapPin, CheckCircle } from '../icons';
import { Z } from '../../styles/zIndex';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const partLbl = { fontSize: 10.5, color: 'var(--cream-3)', fontWeight: 600, display: 'block', marginBottom: 4 };
const partInp = {
  width: '100%', padding: '9px 12px', background: 'rgba(var(--bg-rgb),0.6)',
  border: '1px solid var(--border)', borderRadius: 9, color: 'var(--cream)',
  fontFamily: 'DM Sans', fontSize: 13, boxSizing: 'border-box',
};

export default function GeolocalizacionTab({ devId, user, readOnly: readOnlyProp = false }) {
  const [loc, setLoc] = useState(null);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [addr, setAddr] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [pinCoords, setPinCoords] = useState(null);   // coords actuales del pin (del mapa)
  const [parts, setParts] = useState({ calle: '', colonia: '', alcaldia: '', cp: '' });
  const skipNextSearch = useRef(false);               // evita re-buscar al elegir opción
  // Batch 2.1 role guard — only developer_admin or superadmin can move the marker.
  const canEdit = !readOnlyProp && (user?.role === 'developer_admin' || user?.role === 'superadmin');
  const readOnly = !canEdit;

  useEffect(() => {
    if (!devId) return;
    api.getProjectLocation(devId)
      .then(d => {
        setLoc(d); setAddr(d?.address || '');
        setParts({ calle: d?.calle || '', colonia: d?.colonia || '', alcaldia: d?.alcaldia || '', cp: d?.cp || '' });
      })
      .catch(e => setErr(e.body?.detail || 'Error al cargar ubicación'));
  }, [devId]);

  // Extrae calle, colonia, alcaldía y CP de un resultado de Mapbox.
  const parseAddress = (feat) => {
    const ctx = feat.context || [];
    const get = (pfx) => { const c = ctx.find(x => (x.id || '').startsWith(pfx)); return c ? c.text : ''; };
    const calle = `${feat.text || ''}${feat.address ? ' ' + feat.address : ''}`.trim();
    return {
      calle: calle || (feat.place_name || '').split(',')[0] || '',
      colonia: get('neighborhood') || '',
      alcaldia: get('locality') || '',     // editable si Mapbox no la da exacta
      cp: get('postcode') || '',
    };
  };

  const handleSave = async (lat, lng, zoom) => {
    try {
      const address = (addr || '').trim() || loc?.address || null;
      await api.saveProjectLocation(devId, { lat, lng, zoom, address, ...parts });
      setToast({ type: 'ok', msg: 'Ubicación guardada' });
      setLoc(prev => ({ ...prev, lat, lng, zoom, address, ...parts, source: 'manual' }));
      setTimeout(() => setToast(null), 3200);
    } catch (e) {
      setToast({ type: 'error', msg: e.body?.detail || 'Error al guardar' });
    }
  };

  // Geocoding: trae opciones (sesgadas a CDMX) para elegir con un click.
  const runGeocode = async (raw) => {
    if (!MAPBOX_TOKEN || !raw.trim()) return;
    setGeocoding(true);
    try {
      // Si no menciona ciudad/estado, lo anclamos a CDMX.
      const q = /m[eé]xico|cdmx|\bdf\b|ciudad de mexico/i.test(raw) ? raw : `${raw}, Ciudad de México`;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q.trim())}.json`
        + `?access_token=${MAPBOX_TOKEN}&country=mx&limit=6&language=es&autocomplete=true`
        + `&proximity=-99.1654,19.4096`                 // centro CDMX (sesgo fuerte)
        + `&types=address,poi,place,neighborhood`;
      const r = await fetch(url);
      const data = await r.json();
      const feats = (data.features || []).filter(f => Array.isArray(f.center));
      setSuggestions(feats);
    } catch (e) {
      setSuggestions([]);
    } finally {
      setGeocoding(false);
    }
  };

  // Autocompletar al escribir (debounce), como Google Maps.
  useEffect(() => {
    if (skipNextSearch.current) { skipNextSearch.current = false; return; }
    if (readOnly || !addr || addr.trim().length < 4) { setSuggestions([]); return; }
    const t = setTimeout(() => runGeocode(addr), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  const handleFindAddress = () => { if (addr.trim()) runGeocode(addr); };

  // El dev elige una de las opciones → mueve el pin y fija la dirección.
  const pickSuggestion = (feat) => {
    const [lng, lat] = feat.center;
    const placeName = feat.place_name || addr.trim();
    skipNextSearch.current = true;          // no re-buscar por el cambio de texto
    setAddr(placeName);
    setSuggestions([]);
    setPinCoords({ lat, lng });
    setParts(parseAddress(feat));
    setLoc(prev => ({ ...prev, lat, lng, address: placeName, source: 'manual' }));
    setToast({ type: 'ok', msg: 'Listo. Revisa el pin y pulsa "Guardar ubicación".' });
    setTimeout(() => setToast(null), 4000);
  };

  // Guardar desde el botón externo (usa el pin actual del mapa).
  const handleSaveExternal = () => {
    const c = pinCoords || (loc ? { lat: loc.lat, lng: loc.lng } : null);
    if (!c) return;
    handleSave(c.lat, c.lng, loc?.zoom || 14);
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

        {/* Sugerencias — elige la dirección correcta (estilo Google Maps, tema claro) */}
        {!readOnly && suggestions.length > 0 && (
          <div data-testid="geoloc-suggestions" style={{
            marginBottom: 14, border: '1px solid rgba(var(--cream-rgb),0.16)', borderRadius: 12, overflow: 'hidden',
            background: '#fff', boxShadow: '0 14px 40px rgba(0,0,0,0.14)',
          }}>
            {suggestions.map((f, i) => (
              <button
                key={f.id || i}
                onClick={() => pickSuggestion(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                  padding: '10px 13px', background: '#fff', border: 'none',
                  borderBottom: i < suggestions.length - 1 ? '1px solid rgba(var(--cream-rgb),0.1)' : 'none',
                  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.07)'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <MapPin size={13} style={{ flexShrink: 0, color: 'var(--theme)' }} />
                <span>{f.place_name}</span>
              </button>
            ))}
          </div>
        )}

        {loc.source && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
            padding: '5px 10px', borderRadius: 9999,
            background: loc.source === 'manual' ? 'rgba(21,128,61,0.97)' : 'rgba(251,191,36,0.14)',
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
          hideSaveButton
          onCoordsChange={setPinCoords}
        />

        {/* Dirección estructurada — auto-llenada al elegir, editable */}
        {!readOnly ? (
          <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>DIRECCIÓN</div>
            <div style={{ marginBottom: 10 }}>
              <label style={partLbl}>Calle y número</label>
              <input data-testid="addr-calle" value={parts.calle}
                onChange={e => setParts(p => ({ ...p, calle: e.target.value }))}
                placeholder="Ej: Calle Campeche 322" style={partInp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <div>
                <label style={partLbl}>Colonia</label>
                <input data-testid="addr-colonia" value={parts.colonia}
                  onChange={e => setParts(p => ({ ...p, colonia: e.target.value }))} placeholder="Ej: Hipódromo" style={partInp} />
              </div>
              <div>
                <label style={partLbl}>Alcaldía</label>
                <input data-testid="addr-alcaldia" value={parts.alcaldia}
                  onChange={e => setParts(p => ({ ...p, alcaldia: e.target.value }))} placeholder="Ej: Cuauhtémoc" style={partInp} />
              </div>
              <div>
                <label style={partLbl}>CP</label>
                <input data-testid="addr-cp" value={parts.cp}
                  onChange={e => setParts(p => ({ ...p, cp: e.target.value }))} placeholder="Ej: 06100" style={partInp} />
              </div>
            </div>

            {/* Guardar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                data-testid="geoloc-save-external"
                onClick={handleSaveExternal}
                style={{
                  padding: '11px 22px', borderRadius: 10, background: 'var(--grad)', border: 'none',
                  color: '#fff', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}>
                <CheckCircle size={15} /> Guardar ubicación
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>
                Revisa los datos y guarda.
              </span>
            </div>
          </div>
        ) : (loc.address && (
          <div style={{ marginTop: 12, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }} data-testid="geoloc-address">
            <strong>Dirección:</strong> {[parts.calle, parts.colonia, parts.alcaldia, parts.cp].filter(Boolean).join(', ') || loc.address}
          </div>
        ))}
      </Card>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY,
          padding: '12px 18px', borderRadius: 14,
          background: toast.type === 'ok' ? 'rgba(21,128,61,0.97)' : 'rgba(185,28,28,0.97)',
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
