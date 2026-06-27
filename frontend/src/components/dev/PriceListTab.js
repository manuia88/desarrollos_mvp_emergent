// Tab 2 — Lista de precios: table + paywall for public + Vista de planta sub-tab
import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import FloorPlan from './FloorPlan';
import { ArrowRight, MessageSquare, Sparkle } from '../icons';
import { unitMatchesCriteria, criteriaSummary } from '../../lib/unitMatch';
import { sendBuyerSignal } from '../../lib/buyerSignal';
import { tc } from '../../lib/titleCase';

const PUBLIC_VISIBLE_COUNT = 3;

export default function PriceListTab({ dev, user, onGateOpen, selectedUnit, onSelectUnit, matchCriteria }) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState('inventario');
  const [statusF, setStatusF] = useState('todos');
  const [bedsF, setBedsF] = useState(0);
  const [bathsF, setBathsF] = useState(0);
  const [parkingF, setParkingF] = useState(0);
  const [hover, setHover] = useState(null);
  const [onlyMatch, setOnlyMatch] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  // Ficha consciente: qué unidades cumplen la búsqueda del comprador (resaltar en la lista).
  const matchIds = useMemo(() => {
    if (!matchCriteria) return new Set();
    return new Set((dev.units || []).filter((u) => unitMatchesCriteria(u, matchCriteria)).map((u) => u.id));
  }, [dev.units, matchCriteria]);
  const [verdicts, setVerdicts] = useState({});   // {unit_id: {etiqueta,color}} · nuestro AVM por unidad

  // Posición de precio por unidad vs mercado real (AVM hedónico propio) — 1 sola llamada batch.
  useEffect(() => {
    const colid = dev.colonia_id || dev.colonia;
    const units = dev.units || [];
    if (!colid || !units.length) return;
    let alive = true;
    const body = {
      colonia: colid, nueva: true,
      unidades: units.filter(u => u.price && (u.m2_privative || u.m2_total)).map(u => ({
        id: u.id, precio: u.price, m2: u.m2_privative || u.m2_total, rec: u.bedrooms, ban: u.bathrooms,
      })),
    };
    if (!body.unidades.length) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/precio-posicion-batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json()).then(d => {
      if (!alive) return;
      const map = {};
      (d.unidades || []).forEach(v => { if (v.id && v.etiqueta) map[v.id] = v; });
      setVerdicts(map);
    }).catch(() => {});
    return () => { alive = false; };
  }, [dev.id, dev.colonia_id, dev.colonia, dev.units]);

  const isRegistered = !!user;

  const filtered = useMemo(() => {
    let u = dev.units || [];
    if (onlyMatch && matchIds.size) u = u.filter(x => matchIds.has(x.id));
    if (statusF !== 'todos') u = u.filter(x => x.status === statusF);
    if (bedsF) u = u.filter(x => x.bedrooms >= bedsF);
    if (bathsF) u = u.filter(x => x.bathrooms >= bathsF);
    if (parkingF) u = u.filter(x => x.parking_spots >= parkingF);
    // Las que cumplen la búsqueda, primero.
    if (matchIds.size) u = [...u].sort((a, b) => (matchIds.has(b.id) ? 1 : 0) - (matchIds.has(a.id) ? 1 : 0));
    return u;
  }, [dev.units, statusF, bedsF, bathsF, parkingF, onlyMatch, matchIds]);

  const visibleCount = isRegistered ? filtered.length : Math.min(PUBLIC_VISIBLE_COUNT, filtered.length);

  const [savedUnits, setSavedUnits] = useState(() => new Set());
  const onRowClick = (u, locked) => {
    if (locked) { onGateOpen(t('dev.gate_context_unit')); return; }
    // D · embudo por unidad: la unidad fue VISTA.
    try { sendBuyerSignal('unit_view', { entity_id: dev.id, unit_number: u.unit_number, colonia: dev.colonia_id || dev.colonia }); } catch { /* noop */ }
    onSelectUnit(u);
  };
  // Unidad como ÁTOMO: guardar/quitar la UNIDAD específica (no solo el desarrollo).
  const toggleSaveUnit = (u) => {
    const on = !savedUnits.has(u.unit_number);
    setSavedUnits((s) => { const n = new Set(s); if (on) n.add(u.unit_number); else n.delete(u.unit_number); return n; });
    try { sendBuyerSignal(on ? 'unit_save' : 'unit_unsave', { entity_id: dev.id, unit_number: u.unit_number, colonia: dev.colonia_id || dev.colonia }); } catch { /* noop */ }
  };
  // Agendar visita de la UNIDAD específica → el asesor ve "quiere visitar el #02A".
  const [citaUnits, setCitaUnits] = useState(() => new Set());
  const agendarUnit = (u) => {
    if (citaUnits.has(u.unit_number)) return;
    let leadId = null; try { leadId = localStorage.getItem('dmx_lead_id'); } catch { /* noop */ }
    let vid = ''; try { vid = localStorage.getItem('dmx_visitor_id') || ''; } catch { /* noop */ }
    setCitaUnits((s) => new Set(s).add(u.unit_number));
    try {
      fetch(`${process.env.REACT_APP_BACKEND_URL}/api/buyer/favoritos/cita`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: vid, dev_id: dev.id, unit_number: u.unit_number, when: 'Por confirmar', lead_id: leadId }),
      });
    } catch { /* noop */ }
    // Si aún no es lead, abre el registro (al registrarse, la cita de la unidad fluye al asesor).
    if (!leadId) onGateOpen(`Agenda tu visita del #${u.unit_number} — déjanos tus datos y tu asesor te contacta.`);
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
    { k: 'inventario', label: tc(t('dev.subtab_inv')) },
    { k: 'prototipo', label: tc(t('dev.subtab_proto')) },
    { k: 'planta', label: tc(t('dev.subtab_plan')), badge: 'NEW' },
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
                <span style={{ padding: '1px 6px', background: '#fff', color: 'var(--theme)', borderRadius: 9999, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em' }}>
                  {t0.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ficha consciente: banner "Tu búsqueda" + toggle "solo las que cumplen" */}
      {matchCriteria && matchIds.size > 0 && (
        <div data-testid="pricelist-tu-busqueda" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14, padding: '11px 15px', borderRadius: 12, background: 'rgba(31,160,106,0.08)', border: '1px solid rgba(31,160,106,0.30)' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
            <span style={{ fontWeight: 700, color: '#1FA06A' }}>✓ {matchIds.size} {matchIds.size === 1 ? 'unidad cumple' : 'unidades cumplen'} tu búsqueda</span>
            {criteriaSummary(matchCriteria) ? <span style={{ color: 'var(--cream-3)' }}> · {criteriaSummary(matchCriteria)}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {matchIds.size >= 2 && (
              <button onClick={() => setCompareOpen(true)} data-testid="pricelist-compare"
                style={{ padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--border)', background: '#fff', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                ⊞ Comparar las {matchIds.size}
              </button>
            )}
            <button onClick={() => setOnlyMatch((v) => !v)} data-testid="pricelist-only-match"
              style={{ padding: '6px 12px', borderRadius: 9999, border: '1px solid ' + (onlyMatch ? 'var(--theme)' : 'var(--border)'), background: onlyMatch ? 'var(--theme)' : '#fff', color: onlyMatch ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              {onlyMatch ? '✓ Solo las que cumplen' : 'Solo las que cumplen'}
            </button>
          </div>
        </div>
      )}

      {/* Comparador de las unidades que CUMPLEN (lado a lado · elige dentro del desarrollo) */}
      {compareOpen && matchIds.size >= 2 && (
        <div onClick={() => setCompareOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,18,24,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="compare-modal" style={{ background: 'var(--surface-card, #fff)', borderRadius: 18, border: '1px solid var(--border)', maxWidth: 'min(940px, 96vw)', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 24px 70px rgba(0,0,0,0.25)' }}>
            {/* Header con el DESARROLLO (para saber a qué pertenecen las unidades) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '18px 22px', background: 'linear-gradient(120deg, rgba(var(--theme-rgb),0.12), rgba(var(--theme-rgb),0.03))', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{tc('Comparar unidades')}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 2 }}>
                  <b style={{ color: 'var(--theme)' }}>{dev.name}</b>{dev.colonia ? ` · ${dev.colonia}` : ''} — las que cumplen tu búsqueda
                </div>
              </div>
              <button onClick={() => setCompareOpen(false)} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 9999, width: 30, height: 30, cursor: 'pointer', color: 'var(--cream-2)', flexShrink: 0 }}>✕</button>
            </div>
            {(() => {
              const us = (dev.units || []).filter((u) => matchIds.has(u.id)).slice(0, 5);
              const num = (v) => (typeof v === 'number' ? v : null);
              const minPrice = Math.min(...us.map((u) => u.price || Infinity));
              const maxM2 = Math.max(...us.map((u) => u.m2_total || u.m2_privative || 0));
              const maxBal = Math.max(...us.map((u) => u.m2_balcony || 0));
              const rows = [
                { label: 'Precio', get: (u) => u.price_display || (u.price ? `$${u.price.toLocaleString('es-MX')}` : '—'), best: (u) => u.price && u.price === minPrice, tag: 'mejor precio', strong: true },
                { label: 'Recámaras', get: (u) => u.bedrooms ?? '—' },
                { label: 'Baños', get: (u) => u.bathrooms ?? '—' },
                { label: 'Cajones', get: (u) => u.parking_spots ?? '—' },
                { label: 'm² totales', get: (u) => u.m2_total || u.m2_privative || '—', best: (u) => maxM2 && (u.m2_total || u.m2_privative) === maxM2, tag: 'más grande' },
                { label: 'Balcón m²', get: (u) => u.m2_balcony || '—', best: (u) => maxBal && u.m2_balcony === maxBal },
                { label: 'Nivel', get: (u) => u.level ?? '—' },
                { label: 'Orientación', get: (u) => u.orientation || '—' },
                { label: 'Vista', get: (u) => (u.vista ? (String(u.vista).toLowerCase() === 'interior' ? 'Interior' : 'Exterior') : '—') },
                { label: 'Bodega', get: (u) => (u.bodega ? '✓ Sí' : '—'), best: (u) => !!u.bodega },
              ];
              void num;
              return (
                <div style={{ padding: 18, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'DM Sans', fontSize: 12.5 }}>
                    <thead><tr>
                      <th style={{ textAlign: 'left', padding: '6px 10px' }} />
                      {us.map((u) => (
                        <th key={u.id} style={{ padding: 8, minWidth: 110 }}>
                          <div style={{ background: 'var(--theme)', color: '#fff', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15 }}>#{u.unit_number}</div>
                            <div style={{ fontSize: 10, opacity: 0.85 }}>{dev.name}</div>
                          </div>
                        </th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {rows.map((r, ri) => (
                        <tr key={r.label} style={{ background: ri % 2 ? 'rgba(var(--cream-rgb),0.03)' : 'transparent' }}>
                          <td style={{ padding: '10px 10px', color: 'var(--cream-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.label}</td>
                          {us.map((u) => {
                            const isBest = r.best && r.best(u);
                            return (
                              <td key={u.id} style={{ padding: '10px 8px', textAlign: 'center', color: isBest ? '#1FA06A' : 'var(--cream)', fontWeight: (r.strong || isBest) ? 700 : 400, fontSize: r.strong ? 13.5 : 12.5 }}>
                                {r.get(u)}
                                {isBest && r.tag && <div style={{ fontSize: 9.5, color: '#1FA06A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.tag}</div>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18, padding: '10px 12px', background: 'rgba(var(--cream-rgb),0.02)', border: '1px solid var(--border)', borderRadius: 12 }}>
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
          background: 'rgba(var(--theme-rgb),0.10)',
          border: '1px solid rgba(var(--theme-rgb),0.28)',
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
              background: 'rgba(var(--cream-rgb),0.03)',
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
            units={isRegistered ? filtered : filtered.slice(0, visibleCount)}
            visibleCount={visibleCount}
            isRegistered={isRegistered}
            onRowClick={onRowClick}
            selectedUnit={selectedUnit}
            t={t}
            verdicts={verdicts}
            matchIds={matchIds}
            onSaveUnit={toggleSaveUnit}
            savedUnits={savedUnits}
            onAgendarUnit={agendarUnit}
            citaUnits={citaUnits}
          />
          {!isRegistered && filtered.length > visibleCount && (
            <div
              data-testid="paywall-overlay"
              onClick={() => onGateOpen()}
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 0',
                cursor: 'pointer',
              }}>
              <div
                onClick={(e) => { e.stopPropagation(); onGateOpen(); }}
                style={{
                  textAlign: 'center',
                  maxWidth: 380,
                  padding: 22,
                  background: 'rgba(var(--bg-rgb),0.92)',
                  border: '1px solid rgba(var(--theme-rgb),0.36)',
                  borderRadius: 16,
                  backdropFilter: 'blur(10px)',
                }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px',
                  background: 'rgba(var(--theme-rgb),0.16)',
                  border: '1px solid rgba(var(--theme-rgb),0.32)',
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

function PriceTable({ units, visibleCount, isRegistered, onRowClick, selectedUnit, t, verdicts = {}, matchIds = new Set(), onSaveUnit, savedUnits = new Set(), onAgendarUnit, citaUnits = new Set() }) {
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
    { k: 'id', label: 'vs mercado', w: 96, render: (id) => {
      const vd = verdicts[id];
      if (!vd || !vd.etiqueta) return <span style={{ color: 'var(--cream-3)' }}>—</span>;
      const c = vd.color === 'verde' ? '#86efac' : vd.color === 'rojo' ? '#fca5a5' : '#fcd34d';
      const bg = vd.color === 'verde' ? 'rgba(34,197,94,0.16)' : vd.color === 'rojo' ? 'rgba(239,68,68,0.16)' : 'rgba(245,158,11,0.16)';
      const lbl = vd.etiqueta === 'bajo' ? 'Buen precio' : vd.etiqueta === 'alto' ? 'Sobre mercado' : 'En línea';
      return (
        <span title={`${vd.diff_pct > 0 ? '+' : ''}${vd.diff_pct}% vs mercado de la zona (AVM DMX)`}
          style={{ padding: '2px 8px', borderRadius: 9999, background: bg, color: c,
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          {lbl}
        </span>
      );
    }},
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
    <div style={{ overflowX: 'auto', background: 'rgba(var(--cream-rgb),0.02)', border: '1px solid var(--border)', borderRadius: 14 }}>
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
            const isMatch = matchIds.has(u.id);
            return (
              <tr key={u.id}
                data-testid={`price-row-${u.id}`}
                onClick={() => onRowClick(u, locked)}
                style={{
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(var(--theme-rgb),0.10)' : isMatch ? 'rgba(31,160,106,0.07)' : 'transparent',
                  boxShadow: isMatch ? 'inset 3px 0 0 #1FA06A' : 'none',
                  filter: locked ? 'blur(4px)' : 'none',
                  transition: 'background 0.2s',
                  position: 'relative',
                }}>
                {cols.map((c, ci) => (
                  <td key={c.k} style={{ padding: '10px 12px', color: 'var(--cream-2)' }}>
                    {ci === 0 && isMatch ? <span title="Cumple tu búsqueda" style={{ color: '#1FA06A', fontWeight: 800, marginRight: 4 }}>✓</span> : null}
                    {c.render ? c.render(u[c.k]) : u[c.k]}
                  </td>
                ))}
                <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {onSaveUnit && (
                    <button data-testid={`row-save-${u.id}`} title="Guardar esta unidad"
                      onClick={e => { e.stopPropagation(); onSaveUnit(u); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, marginRight: 6, color: savedUnits.has(u.unit_number) ? 'var(--theme)' : 'var(--cream-3)' }}>
                      {savedUnits.has(u.unit_number) ? '♥' : '♡'}
                    </button>
                  )}
                  {onAgendarUnit && (
                    <button data-testid={`row-cita-${u.id}`} title="Agendar visita de esta unidad"
                      onClick={e => { e.stopPropagation(); onAgendarUnit(u); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, marginRight: 6, color: citaUnits.has(u.unit_number) ? '#1FA06A' : 'var(--cream-3)' }}>
                      {citaUnits.has(u.unit_number) ? '✓📅' : '📅'}
                    </button>
                  )}
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
