/**
 * MemoriaAcabadosTab — editor de la MEMORIA DE ACABADOS del proyecto (portal dev).
 * El dev agrega/edita/borra filas {área, detalle}; se guarda en project_memoria y aparece en la ficha pública
 * (public.py la lee en el overlay → dev.memoria_acabados). Antes solo existía el seed, sin forma de editarla.
 * Reusa el cliente developer.js (getProjectMemoria/saveProjectMemoria). Solo developer_admin/superadmin edita.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getProjectMemoria, saveProjectMemoria } from '../../api/developer';

const AREAS_SUGERIDAS = ['Pisos', 'Cocina', 'Baños', 'Ventanería', 'Clima', 'Domótica', 'Muros', 'Puertas', 'Iluminación', 'Herrería', 'Clósets', 'Azotea'];

export default function MemoriaAcabadosTab({ devId, user }) {
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState('seed');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getProjectMemoria(devId);
      setRows((d?.memoria || []).map((r) => ({ area: r.area || '', detalle: r.detalle || '' })));
      setSource(d?.source || 'seed');
    } catch (e) { console.error('MemoriaAcabadosTab:', e); }
    setLoading(false);
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  const setRow = (i, k, v) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = (area = '') => setRows((rs) => [...rs, { area, detalle: '' }]);
  const delRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const clean = rows.map((r) => ({ area: (r.area || '').trim(), detalle: (r.detalle || '').trim() })).filter((r) => r.area && r.detalle);
      const d = await saveProjectMemoria(devId, clean);
      setRows((d?.memoria || clean).map((r) => ({ area: r.area, detalle: r.detalle })));
      setSource('dev');
      setMsg('✓ Guardado — ya aparece en la ficha pública');
      setTimeout(() => setMsg(''), 3500);
    } catch (e) {
      setMsg(e?.message || 'No se pudo guardar. Intenta de nuevo.');
    }
    setSaving(false);
  };

  const areasUsadas = new Set(rows.map((r) => (r.area || '').trim().toLowerCase()));
  const sugerencias = AREAS_SUGERIDAS.filter((a) => !areasUsadas.has(a.toLowerCase()));

  const card = { background: '#fff', border: '1px solid rgba(16,18,28,0.1)', borderRadius: 14, padding: 18 };
  const inp = { fontFamily: 'DM Sans', fontSize: 14, color: '#1E2230', border: '1px solid rgba(16,18,28,0.15)', borderRadius: 10, padding: '10px 12px', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff' };
  const lbl = { fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: '#6B6F86', marginBottom: 5, display: 'block' };

  if (loading) return <div style={{ fontFamily: 'DM Sans', color: '#8A8FA6', padding: 24 }}>Cargando memoria de acabados…</div>;

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: '#1E2230', letterSpacing: '-0.01em' }}>Memoria de acabados</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: '#6B6F86', marginTop: 4, lineHeight: 1.5, maxWidth: 560 }}>
            Los materiales y acabados por área (pisos, cocina, baños…). Aparecen en la sección «El proyecto» de la ficha pública.
            {source === 'seed' && <span style={{ color: '#B4791F' }}> Ahora mismo se muestra el texto base; al guardar, manda el tuyo.</span>}
          </div>
        </div>
        {isAdmin && (
          <button type="button" onClick={save} disabled={saving} style={{ padding: '11px 20px', borderRadius: 11, border: 'none', cursor: saving ? 'wait' : 'pointer', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13.5, background: 'linear-gradient(120deg,#6D4AFF,#C63FAE)', color: '#fff', boxShadow: '0 6px 16px rgba(109,74,255,0.26)', whiteSpace: 'nowrap' }}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        )}
      </div>

      {msg && <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: msg.startsWith('✓') ? '#0E7A53' : '#DC2626', background: msg.startsWith('✓') ? 'rgba(14,122,83,0.08)' : 'rgba(220,38,38,0.07)', borderRadius: 10, padding: '10px 13px', marginBottom: 14 }}>{msg}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ ...card, display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 12, alignItems: 'end' }}>
            <div><span style={lbl}>Área</span><input value={r.area} onChange={(e) => setRow(i, 'area', e.target.value)} disabled={!isAdmin} placeholder="Ej. Cocina" style={inp} maxLength={60} /></div>
            <div><span style={lbl}>Detalle</span><input value={r.detalle} onChange={(e) => setRow(i, 'detalle', e.target.value)} disabled={!isAdmin} placeholder="Ej. Integral Poliform, cubierta de cuarzo, electrodomésticos Gaggenau" style={inp} maxLength={280} /></div>
            {isAdmin && <button type="button" onClick={() => delRow(i)} aria-label="Quitar" style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(220,38,38,0.25)', background: '#fff', color: '#DC2626', cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, lineHeight: 1 }}>×</button>}
          </div>
        ))}
        {!rows.length && <div style={{ ...card, fontFamily: 'DM Sans', fontSize: 13.5, color: '#8A8FA6', textAlign: 'center' }}>Aún no hay acabados. Agrega el primero abajo.</div>}
      </div>

      {isAdmin && (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => addRow()} style={{ padding: '10px 16px', borderRadius: 10, border: '1px dashed rgba(109,74,255,0.4)', background: 'rgba(109,74,255,0.05)', color: '#6D4AFF', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5 }}>+ Agregar área</button>
          {sugerencias.length > 0 && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#9499AE' }}>Rápido:</span>
              {sugerencias.map((a) => <button key={a} type="button" onClick={() => addRow(a)} style={{ padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(16,18,28,0.12)', background: '#fff', color: '#4B4F66', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5 }}>+ {a}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
