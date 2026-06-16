// Tanda 4 — ZoneMarketValuePanel: valor de mercado de la zona del proyecto.
// Surfacea 2 motores que antes solo vivían en superadmin:
//   · valores_unitarios_engine → valor del SUELO oficial (catastral)
//   · comercial_value_model     → valor COMERCIAL estimado del m² construido
// Círculo cerrado: UI → /api/dev/valor-mercado-zona → motores reales. CERO dato falso:
// si un motor no tiene dato, muestra estado honesto "esperando" (no vacío feo).
import React, { useEffect, useState } from 'react';
import { RefreshCw, Landmark, TrendingUp, Hourglass } from 'lucide-react';
import { Card } from '../advisor/primitives';
import { getDevValorMercadoZona } from '../../api/developer';

function fmtMXN(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);
}

// Tarjeta de un valor disponible (catastral o comercial)
function ValueCard({ icon: Icon, titulo, valor, sub, fuente }) {
  return (
    <div style={{ flex: '1 1 200px', padding: '14px 16px', borderRadius: 12, background: 'rgba(var(--theme-rgb),0.08)', border: '1px solid rgba(var(--theme-rgb),0.22)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} color="var(--theme)" />
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{titulo}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
        {fmtMXN(valor)}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-3)' }}> /m²</span>
      </div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 3 }}>{sub}</div>}
      {fuente && <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'rgba(var(--cream-rgb),0.35)', marginTop: 6 }}>Fuente: {fuente}</div>}
    </div>
  );
}

// Tarjeta de estado honesto "esperando dato" (cuando un motor aún no tiene insumos)
function WaitingCard({ icon: Icon, titulo, reason }) {
  return (
    <div style={{ flex: '1 1 200px', padding: '14px 16px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px dashed rgba(245,158,11,0.28)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} color="var(--amber)" />
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{titulo}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Hourglass size={12} color="var(--amber)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--amber)' }}>Esperando dato</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', lineHeight: 1.4 }}>{reason}</div>
    </div>
  );
}

export default function ZoneMarketValuePanel({ projectId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await getDevValorMercadoZona(projectId);
      setData(res);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line

  const cat = data?.catastral;
  const com = data?.comercial;

  return (
    <Card data-testid="zone-market-value-panel" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Landmark size={14} color="var(--theme)" />
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
            Valor de mercado de tu zona
          </span>
          {data?.colonia && (
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>· {data.colonia}</span>
          )}
        </div>
        <button
          onClick={load}
          data-testid="zone-value-refresh"
          style={{ background: 'none', border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 9999, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <RefreshCw size={11} color="var(--cream-3)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Actualizar</span>
        </button>
      </div>

      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 14, lineHeight: 1.5 }}>
        Compara el valor oficial del suelo de tu colonia contra el valor comercial estimado del m² construido.
      </div>

      {err && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>
          Error: {err}
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>Cargando…</div>
      ) : data && data.available === false ? (
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', padding: '10px 0' }}>
          {data.reason || 'Esta zona aún no tiene valor de mercado disponible.'}
        </div>
      ) : data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* Valor del suelo oficial (catastral) */}
          {cat?.available ? (
            <ValueCard
              icon={Landmark}
              titulo="Valor del suelo (oficial)"
              valor={cat.valor_m2}
              sub={cat.nota || (cat.periodo ? `Vigencia ${cat.periodo}` : null)}
              fuente={cat.fuente}
            />
          ) : (
            <WaitingCard icon={Landmark} titulo="Valor del suelo (oficial)" reason={cat?.reason} />
          )}

          {/* Valor comercial estimado del m² construido */}
          {com?.available ? (
            <ValueCard
              icon={TrendingUp}
              titulo="Valor comercial estimado"
              valor={com.valor_m2}
              sub={com.confianza ? `Confianza ${com.confianza}${com.n != null ? ` · ${com.n} zonas` : ''}` : null}
              fuente={com.fuente}
            />
          ) : (
            <WaitingCard icon={TrendingUp} titulo="Valor comercial estimado" reason={com?.reason} />
          )}
        </div>
      )}

      {/* Leyenda del comercial cuando sí estima (honesta) */}
      {com?.available && com.leyenda && (
        <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(var(--cream-rgb),0.3)', marginTop: 12 }}>
          {com.leyenda}
        </div>
      )}
    </Card>
  );
}
