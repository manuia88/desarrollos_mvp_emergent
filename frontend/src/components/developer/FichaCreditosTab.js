/**
 * FichaCreditosTab — editor de los CRÉDITOS ACEPTADOS del proyecto (portal dev).
 * Checklist de opciones (Contado / bancario / Infonavit / Cofinavit / Fovissste / Cofinanciamiento) + agregar libre.
 * Se guarda en project_creditos y aparece en la ficha pública (dev.creditos_aceptados). Antes solo seed, sin editor.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getProjectCreditos, saveProjectCreditos } from '../../api/developer';

export default function FichaCreditosTab({ devId, user }) {
  const [sel, setSel] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [source, setSource] = useState('seed');
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getProjectCreditos(devId);
      setSel(d?.creditos || []);
      setOpciones(d?.opciones || []);
      setSource(d?.source || 'seed');
    } catch (e) { console.error('FichaCreditosTab:', e); }
    setLoading(false);
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (c) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const addCustom = () => { const c = custom.trim(); if (c && !sel.includes(c)) { setSel((s) => [...s, c]); } setCustom(''); };

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const d = await saveProjectCreditos(devId, sel);
      setSel(d?.creditos || sel); setSource('dev');
      setMsg('✓ Guardado — ya aparece en la ficha pública');
      setTimeout(() => setMsg(''), 3500);
    } catch (e) { setMsg(e?.message || 'No se pudo guardar. Intenta de nuevo.'); }
    setSaving(false);
  };

  // opciones = catálogo + los custom ya seleccionados que no estén en el catálogo
  const todas = [...opciones, ...sel.filter((c) => !opciones.includes(c))];

  if (loading) return <div style={{ fontFamily: 'DM Sans', color: '#8A8FA6', padding: 24 }}>Cargando créditos…</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: '#1E2230', letterSpacing: '-0.01em' }}>Créditos aceptados</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: '#6B6F86', marginTop: 4, lineHeight: 1.5, maxWidth: 520 }}>
            Cómo pueden pagar los compradores. Aparece en «Formas de pago» de la ficha pública.
            {source === 'seed' && <span style={{ color: '#B4791F' }}> Ahora se muestra el texto base; al guardar, manda el tuyo.</span>}
          </div>
        </div>
        {isAdmin && (
          <button type="button" onClick={save} disabled={saving} style={{ padding: '11px 20px', borderRadius: 11, border: 'none', cursor: saving ? 'wait' : 'pointer', fontFamily: 'Outfit', fontWeight: 800, fontSize: 13.5, background: 'linear-gradient(120deg,#6D4AFF,#C63FAE)', color: '#fff', boxShadow: '0 6px 16px rgba(109,74,255,0.26)', whiteSpace: 'nowrap' }}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        )}
      </div>

      {msg && <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: msg.startsWith('✓') ? '#0E7A53' : '#DC2626', background: msg.startsWith('✓') ? 'rgba(14,122,83,0.08)' : 'rgba(220,38,38,0.07)', borderRadius: 10, padding: '10px 13px', marginBottom: 14 }}>{msg}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {todas.map((c) => {
          const on = sel.includes(c);
          return (
            <button key={c} type="button" onClick={() => isAdmin && toggle(c)} disabled={!isAdmin}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 11, cursor: isAdmin ? 'pointer' : 'default', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14, border: on ? '1.5px solid #6D4AFF' : '1px solid rgba(16,18,28,0.14)', background: on ? 'rgba(109,74,255,0.08)' : '#fff', color: on ? '#4F46E5' : '#4B4F66' }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: on ? 'none' : '1.5px solid rgba(16,18,28,0.25)', background: on ? '#6D4AFF' : '#fff', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{on ? '✓' : ''}</span>
              {c}
            </button>
          );
        })}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="Otro crédito…" maxLength={60}
            style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#1E2230', border: '1px solid rgba(16,18,28,0.15)', borderRadius: 10, padding: '10px 12px', outline: 'none', width: 240 }} />
          <button type="button" onClick={addCustom} style={{ padding: '10px 16px', borderRadius: 10, border: '1px dashed rgba(109,74,255,0.4)', background: 'rgba(109,74,255,0.05)', color: '#6D4AFF', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5 }}>+ Agregar</button>
        </div>
      )}
    </div>
  );
}
