/**
 * AsesorDesarrollos · Consolida Mis Aliados + Inventario en 1 tab con sub-tabs.
 *
 * Bug-fix 2026-05-15: founder reportó redundancia de 2 tabs separados con
 * empty states casi idénticos. Solución: 1 página "Desarrollos" con 2 sub-tabs:
 *   - Aliados    · vista de partners (KPIs + comisión negociada)
 *   - Inventario · catálogo de propiedades disponibles para vender
 *
 * Query string ?tab=aliados|inventario · routes viejos (/asesor/mis-aliados,
 * /asesor/inventario) redirigen aquí preservando deep-links.
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { Building2 } from 'lucide-react';
import AsesorMisAliados from './AsesorMisAliados';
import AsesorInventario from './AsesorInventario';

export default function AsesorDesarrollos({ user, onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'inventario' ? 'inventario' : 'aliados';
  const [tab, setTab] = useState(initialTab);

  // Sync URL when tab changes (preserves deep-links)
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== tab) {
      setSearchParams({ tab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      data-testid={`desarrollos-tab-${key}`}
      style={{
        padding: '9px 22px',
        borderRadius: 9999,
        background: tab === key ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'transparent',
        border: `1px solid ${tab === key ? 'rgba(var(--theme-rgb), 0.45)' : 'var(--border)'}`,
        color: tab === key ? '#fff' : 'var(--cream-2)',
        fontFamily: 'DM Sans',
        fontWeight: 700,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 0.18s ease',
      }}
    >
      {label}
    </button>
  );

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div data-testid="asesor-desarrollos" style={{ maxWidth: 1200 }}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Building2 size={20} color="var(--theme)" />
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
              Desarrollos
            </h1>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', margin: 0 }}>
            Tus desarrolladoras aliadas y el inventario que puedes vender.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {tabBtn('aliados', 'Aliados')}
          {tabBtn('inventario', 'Inventario')}
        </div>

        {/* Content (sin doble layout) */}
        {tab === 'aliados' && <AsesorMisAliados user={user} onLogout={onLogout} withoutLayout />}
        {tab === 'inventario' && <AsesorInventario user={user} onLogout={onLogout} withoutLayout />}
      </div>
    </AdvisorLayout>
  );
}
