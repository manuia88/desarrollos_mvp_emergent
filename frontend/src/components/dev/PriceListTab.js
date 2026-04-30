// Tab 2 — Lista de precios: table + paywall for public + Vista de planta sub-tab
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import FloorPlan from './FloorPlan';
import { ArrowRight, MessageSquare, Sparkle } from '../icons';

const PUBLIC_VISIBLE_COUNT = 3;

export default function PriceListTab({ dev, user, onGateOpen, selectedUnit, onSelectUnit }) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState('inventario');
  const [statusF, setStatusF] = useState('todos');
  const [bedsF, setBedsF] = useState(0);
  const [bathsF, setBathsF] = useState(0);
  const [parkingF, setParkingF] = useState(0);
  const [hover, setHover] = useState(null);

  const isRegistered = !!user;

  const filtered = useMemo(() => {
    let u = dev.units || [];
    if (statusF !== 'todos') u = u.filter(x => x.status === statusF);
    if (bedsF) u = u.filter(x => x.bedrooms >= bedsF);
    if (bathsF) u = u.filter(x => x.bathrooms >= bathsF);
    if (parkingF) u = u.filter(x => x.parking_spots >= parkingF);
    return u;
  }, [dev.units, statusF, bedsF, bathsF, parkingF]);

  const visibleCount = isRegistered ? filtered.length : Math.min(PUBLIC_VISIBLE_COUNT, filtered.length);

  const onRowClick = (u, locked) => {
    if (locked) { onGateOpen(t('dev.gate_context_unit')); return; }
    onSelectUnit(u);
  };

  const onFloorUnitClick = (u) => {
    if (!isRegistered) { onGateOpen(t('dev.gate_context_plan')); return; }
    onSelectUnit(u);
  };

  const onFloorShare = () => {
    const phone = (dev.contact_phone || '+525512345678').replace(/\D/g, '');
    const url = `${window.location.origin}/desarrollo/${dev.id}`;
    const msg = `Mira cómo van las unidades de ${dev.name}: ${url}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const tabs = [
    { k: 'inventario', label: t('dev.subtab_inv') },
    { k: 'prototipo', label: t('dev.subtab_proto') },
    { k: 'planta', label: t('dev.subtab_plan'), badge: 'NEW' },
  ];

  return (
    <div id="tab-precios" data-testid="pricelist-tab">
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t0 => {
          const active = subTab === t0.k;
          return (
            <button key={t0.k}
              data-testid={`subtab-${t0.k}`}
              onClick={() => setSubTab(t0.k)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 9999,
                background: active ? 'var(--grad)' : 'var(--bg-3)',
                border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                color: active ? '#fff' : 'var(--cream-2)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                cursor: 'pointer',
              }}>
              {t0.label}
              {t0.badge && (
                <span style={{ padding: '1px 6px', background: '#fff', color: '#6366F1', borderRadius: 9999, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em' }}>
                  {t0.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t('dev.f_status')}</span>
          {['todos', 'disponible', 'reservado', 'vendido'].map(s => {
            const active = statusF === s;
            return (
              <button key={s} data-testid={`pf-status-${s}`}
                onClick={() => setStatusF(s)}
                className={`filter-chip${active ? ' active' : ''}`} style={{ fontSize: 11 }}>
                {s === 'todos' ? 'Todos' : t(`dev.status.${s}`)}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t('dev.f_beds')}</span>
          {[0, 1, 2, 3].map(n => {
            const active = bedsF === n;
            const label = n === 0 ? 'Todos' : `${n}+`;
            return (
              <button key={n} data-testid={`pf-beds-${n}`}
                onClick={() => setBedsF(n)}
                className={`filter-chip${active ? ' active' : ''}`} style={{ fontSize: 11, minWidth: 38 }}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t('dev.f_baths')}</span>
          {[0, 1, 2, 3].map(n => {
            const active = bathsF === n;
            const label = n === 0 ? 'Todos' : `${n}+`;
            return (
              <button key={n} data-testid={`pf-baths-${n}`}
                onClick={() => setBathsF(n)}
                className={`filter-chip${active ? ' active' : ''}`} style={{ fontSize: 11, minWidth: 38 }}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{t('dev.f_parking')}</span>
          {[0, 1, 2].map(n => {
            const active = parkingF === n;
            const label = n === 0 ? 'Todos' : `${n}+`;
            return (
              <button key={n} data-testid={`pf-parking-${n}`}
                onClick={() => setParkingF(n)}
                className={`filter-chip${active ? ' active' : ''}`} style={{ fontSize: 11, minWidth: 38 }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visibility counter */}
      {!isRegistered && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.28)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkle size={14} color="var(--indigo-3)" />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
              {t('dev.visibility_count', { total: filtered.length, visible: Math.min(PUBLIC_VISIBLE_COUNT, filtered.length) })}
            </span>
          </div>
          <button onClick={() => onGateOpen()} data-testid="gate-open-from-banner"
            className="btn btn-primary btn-sm">
            {t('dev.see_all')} <ArrowRight size={11} />
          </button>
        </div>
      )}

      {/* Content */}
      {subTab === 'planta' ? (
        <>
          <FloorPlan
            units={filtered}
            selectedUnitId={selectedUnit?.id}
            onUnitClick={onFloorUnitClick}
            onUnitHover={setHover}
            canSeeDetails={isRegistered}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
            <button onClick={onFloorShare} data-testid="floor-share-wa" className="btn btn-glass btn-sm">
              <MessageSquare size={12} />
              {t('dev.floor_share')}
            </button>
          </div>
          {hover && isRegistered && (
            <div style={{
              marginTop: 12, padding: '8px 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)', borderRadius: 10,
              display: 'inline-flex', alignItems: 'center', gap: 10,
              fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)',
            }}>
              <strong style={{ color: 'var(--cream)' }}>{hover.unit_number}</strong>
              <span>· Proto {hover.prototype}</span>
              <span>· {hover.m2_privative} m²</span>
              <span>· ${hover.price.toLocaleString('es-MX')}</span>
            </div>
          )}
        </>
      ) : (
        <div style={{ position: 'relative' }}>
          <PriceTable
            units={filtered}
            visibleCount={visibleCount}
            isRegistered={isRegistered}
            onRowClick={onRowClick}
            selectedUnit={selectedUnit}
            t={t}
          />
          {!isRegistered && filtered.length > visibleCount && (
            <div
              data-testid="paywall-overlay"
              onClick={() => onGateOpen()}
              style={{
                position: 'absolute',
                left: 0, right: 0,
                top: `${56 + visibleCount * 42 + 10}px`,
                bottom: 0,
                background: 'linear-gradient(180deg, rgba(6,8,15,0.35) 0%, rgba(6,8,15,0.82) 45%, rgba(6,8,15,0.92) 100%)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '32px 20px',
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 14,
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}>
              <div
                onClick={(e) => { e.stopPropagation(); onGateOpen(); }}
                style={{
                  textAlign: 'center',
                  maxWidth: 380,
                  padding: 22,
                  background: 'rgba(14,18,32,0.92)',
                  border: '1px solid rgba(99,102,241,0.36)',
                  borderRadius: 16,
                  backdropFilter: 'blur(10px)',
                }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px',
                  background: 'rgba(99,102,241,0.16)',
                  border: '1px solid rgba(99,102,241,0.32)',
                  borderRadius: 9999,
                  marginBottom: 10,
                }}>
                  <Sparkle size={11} color="var(--indigo-3)" />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-2)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                    {filtered.length - visibleCount} unidades más
                  </span>
                </div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Regístrate para ver toda la lista de precios
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', lineHeight: 1.55, marginBottom: 14 }}>
                  Precio por m², disponibilidad en vivo, reserva de unidad y contacto directo con el desarrollador.
                </div>
                <button
                  data-testid="paywall-cta"
                  className="btn btn-primary btn-sm"
                  style={{ justifyContent: 'center' }}
                  onClick={(e) => { e.stopPropagation(); onGateOpen(); }}
                >
                  Desbloquear lista completa <ArrowRight size={11} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PriceTable({ units, visibleCount, isRegistered, onRowClick, selectedUnit, t }) {
  const cols = [
    { k: 'unit_number', label: 'ID', w: 60 },
    { k: 'prototype', label: 'Proto', w: 50 },
    { k: 'level', label: 'Nvl', w: 40 },
    { k: 'm2_privative', label: 'm² priv', w: 70 },
    { k: 'm2_balcony', label: 'Balcón', w: 60 },
    { k: 'm2_total', label: 'm² tot', w: 70 },
    { k: 'bedrooms', label: 'Rec', w: 40 },
    { k: 'bathrooms', label: 'Bñ', w: 40 },
    { k: 'parking_spots', label: 'Caj', w: 40 },
    { k: 'bodega', label: 'Bodega', w: 60, render: v => v ? 'Sí' : 'No' },
    { k: 'price', label: 'Precio', w: 130, render: v => `$${v.toLocaleString('es-MX')}` },
    { k: 'status', label: 'Estado', w: 100, render: (v) => (
      <span style={{
        padding: '2px 8px', borderRadius: 9999,
        background: v === 'disponible' ? 'rgba(34,197,94,0.18)' : v === 'reservado' ? 'rgba(245,158,11,0.18)' : 'rgba(239,68,68,0.18)',
        color: v === 'disponible' ? '#86efac' : v === 'reservado' ? '#fcd34d' : '#fca5a5',
        fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {t(`dev.status.${v}`)}
      </span>
    )},
  ];

  return (
    <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
      <table data-testid="price-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {cols.map(c => (
              <th key={c.k} style={{
                textAlign: 'left', padding: '10px 12px',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
                color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
                minWidth: c.w,
              }}>{c.label}</th>
            ))}
            <th style={{ width: 80, padding: '10px 12px', textAlign: 'right' }}></th>
          </tr>
        </thead>
        <tbody>
          {units.map((u, idx) => {
            const locked = !isRegistered && idx >= visibleCount;
            const isSelected = selectedUnit?.id === u.id;
            return (
              <tr key={u.id}
                data-testid={`price-row-${u.id}`}
                onClick={() => onRowClick(u, locked)}
                style={{
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(99,102,241,0.10)' : 'transparent',
                  filter: locked ? 'blur(4px)' : 'none',
                  transition: 'background 0.2s',
                  position: 'relative',
                }}>
                {cols.map(c => (
                  <td key={c.k} style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>
                    {c.render ? c.render(u[c.k]) : u[c.k]}
                  </td>
                ))}
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <button data-testid={`row-info-${u.id}`}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={e => { e.stopPropagation(); onRowClick(u, locked); }}>
                    + Info
                  </button>
                </td>
              </tr>
            );
          })}
          {units.length === 0 && (
            <tr><td colSpan={cols.length + 1} style={{ padding: 30, textAlign: 'center', color: 'var(--cream-3)' }}>—</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
