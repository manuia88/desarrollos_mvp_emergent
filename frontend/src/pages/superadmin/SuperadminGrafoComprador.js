/**
 * F2.1.4 — SuperadminGrafoComprador (page).
 * Ruta: /superadmin/grafo-comprador · Layout: SuperadminLayout (sección INTELIGENCIA).
 * La demanda de TODA la ciudad, anónima: por colonia × etapa de vida, qué producto busca la gente.
 * Junta las búsquedas de todos los asesores/devs (k-anonimato oculta celdas con poca señal).
 * Lee /api/superadmin/grafo-comprador (motor grafo_comprador_engine). Build-for-endstate: hoy con
 * poca data muestra "sin búsquedas aún" honesto; se llena solo. Cero deuda.
 */
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getGrafoComprador } from '../../api/superadmin';

const fmtMoney = (n) => (n ? `$${(n / 1e6).toFixed(1)}M` : '—');

function Chip({ children, muted }) {
  return (
    <span style={{
      fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
      background: muted ? 'rgba(124,47,255,0.06)' : 'rgba(124,47,255,0.14)',
      border: '1px solid var(--border)', color: muted ? 'var(--cream-3)' : 'var(--cream)',
    }}>{children}</span>
  );
}

export default function SuperadminGrafoComprador({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => { getGrafoComprador().then(setData).catch(() => setErr(true)); }, []);

  const note = (t) => (
    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-3)', padding: '30px 0', textAlign: 'center' }}>{t}</div>
  );

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div style={{ padding: '8px 0 12px' }}>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cream-3)' }}>Inteligencia · Demanda</div>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: '4px 0 2px' }}>Grafo del Comprador</h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-3)', margin: 0, maxWidth: 760 }}>
          La demanda de toda la ciudad, anónima: por colonia y etapa de vida, qué producto busca la gente. Junta las búsquedas de todos los asesores y desarrolladores.
        </p>
      </div>

      {err && note('No se pudo cargar el Grafo del Comprador.')}
      {!err && !data && note('Cargando…')}

      {data && (
        <>
          <div data-testid="grafo-honesty" style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 12,
            background: data.es_estimado ? 'rgba(226,152,46,0.08)' : 'rgba(31,160,106,0.07)',
            border: `1px solid ${data.es_estimado ? 'rgba(226,152,46,0.30)' : 'rgba(31,160,106,0.28)'}`,
            fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 600,
            color: data.es_estimado ? 'var(--warm, #E2982E)' : 'var(--ok, #1FA06A)',
          }}>
            {data.es_estimado ? '◐ ' : '● '}{data.lectura} · k-anonimato {data.k_anonimato} · muestra {data.muestra} búsquedas
          </div>

          {(data.colonias || []).length === 0 && note('Aún sin búsquedas suficientes en la ciudad — el grafo se llena solo conforme entra demanda real.')}

          {(data.colonias || []).map(col => (
            <div key={col.colonia_id} data-testid={`grafo-col-${col.colonia_id}`} style={{
              marginBottom: 12, padding: 14, borderRadius: 14,
              background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--cream)' }}>{col.colonia}</div>
                {col.alcaldia && <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)' }}>{col.alcaldia}</span>}
                <span style={{ flex: 1 }} />
                <Chip>{col.demanda_total} búsquedas</Chip>
                <Chip muted>Demanda {col.etiqueta}</Chip>
                {col.segmento_dominante_label && <Chip>Domina: {col.segmento_dominante_label}</Chip>}
              </div>
              {(col.segmentos || []).map(s => (
                <div key={s.segmento} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 190, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>
                    {s.label} <span style={{ color: 'var(--cream-3)', fontWeight: 500 }}>· {s.demanda}</span>
                  </div>
                  {s.producto ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {s.producto.recamaras != null && <Chip>{s.producto.recamaras} rec</Chip>}
                      {s.producto.banos != null && <Chip>{s.producto.banos} baños</Chip>}
                      {s.producto.precio_tipico ? <Chip>{fmtMoney(s.producto.precio_tipico)}</Chip> : null}
                      {s.producto.terraza_pct > 0 && <Chip>{s.producto.terraza_pct}% terraza</Chip>}
                      {(s.producto.top_amenidades || []).slice(0, 3).map(a => <Chip key={a} muted>{a}</Chip>)}
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, color: 'var(--cream-3)' }}>{s.nota || 'Sin dato suficiente.'}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </SuperadminLayout>
  );
}
