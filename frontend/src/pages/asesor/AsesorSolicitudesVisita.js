// AsesorSolicitudesVisita — "Visitas de Marketplace": la bandeja de la inmobiliaria DMX.
// Los compradores piden visita desde su Asistente de Compra → caen al pool de MI inmobiliaria
// (regla inviolable: NO van al dev) → el asesor de la casa toma del pool, acepta (y contacta
// al comprador) o devuelve. Reusa /api/asesor/inmobiliaria/* · sin motor nuevo.
import React, { useState, useEffect, useCallback } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { Card } from '../../components/advisor/primitives';
import {
  listHouseSolicitudes, claimHouseSolicitud, acceptHouseSolicitud, declineHouseSolicitud,
} from '../../api/advisor';

function Row({ s, actions, busy }) {
  return (
    <div style={{ marginBottom: 12, padding: 15, borderRadius: 13, border: '1px solid rgba(0,0,0,0.10)', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{s.property_name || s.property_id}</div>
          <div style={{ fontSize: 12.5, color: 'var(--cream-3,#807e78)' }}>
            {s.buyer?.name || 'Comprador'}
            {s.buyer?.email ? ` · ${s.buyer.email}` : ''}
            {s.buyer?.phone ? ` · ${s.buyer.phone}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
      </div>
    </div>
  );
}

export default function AsesorSolicitudesVisita({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await listHouseSolicitudes()); }
    catch { setData({ es_de_la_casa: false, mias: [], pool: [] }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const act = async (id, fn, okMsg) => {
    setBusy(id);
    try { const r = await fn(id); flash(r?.mensaje || okMsg); await load(); }
    catch (e) { flash(e.message || 'No se pudo.'); } finally { setBusy(null); }
  };

  const mias = data?.mias || [];
  const pool = data?.pool || [];
  const btn = (bg, color, border) => ({
    background: bg, color, border: border || 'none', borderRadius: 8,
    padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  });

  return (
    <AdvisorLayout user={user} onLogout={onLogout} active="solicitudes-visita">
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontFamily: 'Outfit', fontSize: 24, fontWeight: 800, margin: 0 }}>🗓️ Visitas de Marketplace</h1>
          <p style={{ fontSize: 13.5, color: 'var(--cream-3,#807e78)', marginTop: 4 }}>
            Compradores que pidieron visita desde la app. Son leads de la inmobiliaria DMX: toma uno, acéptalo y contáctalo.
          </p>
        </div>

        {toast && <div style={{ marginBottom: 14, padding: '9px 14px', borderRadius: 9, background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontSize: 13 }}>{toast}</div>}

        {loading ? (
          <Card><div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3,#807e78)' }}>Cargando…</div></Card>
        ) : !data?.es_de_la_casa ? (
          <Card><div style={{ padding: '26px 18px', textAlign: 'center', color: 'var(--cream-3,#807e78)', fontSize: 13 }}>
            Las visitas de marketplace son de la inmobiliaria DMX y las trabajan sus asesores.
          </div></Card>
        ) : (
          <>
            {/* MÍAS · lo que me tocó */}
            <div className="eyebrow" style={{ marginBottom: 10 }}>📌 Asignadas A Ti ({mias.length})</div>
            {mias.length === 0 && (
              <Card style={{ marginBottom: 18 }}><div style={{ padding: 18, color: 'var(--cream-3,#807e78)', fontSize: 13 }}>
                Nada asignado por ahora. Toma una del pool de abajo.
              </div></Card>
            )}
            {mias.map((s) => (
              <Row key={s.id} s={s} busy={busy} actions={
                s.status === 'accepted'
                  ? <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✓ Confirmada</span>
                  : <>
                      <button disabled={busy === s.id} onClick={() => act(s.id, acceptHouseSolicitud, '¡Confirmada! Contacta al comprador.')} style={btn('#16a34a', '#fff')}>✓ Aceptar</button>
                      <button disabled={busy === s.id} onClick={() => act(s.id, declineHouseSolicitud, 'Devuelta al pool.')} style={btn('transparent', 'var(--cream-2,#555)', '1px solid rgba(0,0,0,0.12)')}>↩ Devolver</button>
                    </>
              } />
            ))}

            {/* POOL · sin dueño, las puedes tomar */}
            {pool.length > 0 && (
              <>
                <div className="eyebrow" style={{ margin: '20px 0 10px' }}>🆓 En El Pool · Tómalas ({pool.length})</div>
                {pool.map((s) => (
                  <Row key={s.id} s={s} busy={busy} actions={
                    <button disabled={busy === s.id} onClick={() => act(s.id, claimHouseSolicitud, 'La tomaste. Ya es tuya.')} style={btn('#6366f1', '#fff')}>+ Tomar</button>
                  } />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </AdvisorLayout>
  );
}
