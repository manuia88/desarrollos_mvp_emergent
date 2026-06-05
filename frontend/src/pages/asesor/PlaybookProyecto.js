/**
 * PlaybookProyecto (B3.1) — el asesor ve, por proyecto del dev: si puede venderlo, su comisión,
 * la política comercial, las formas de pago, los sellos (construcción + legal) y QUÉ OFRECERLE
 * al cliente. Cierra el ciclo dev→asesor (consume /api/asesor/proyecto/{id}/playbook).
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { ArrowLeft, ShieldCheck, ScrollText, Wallet, Megaphone, CheckCircle2, Lock } from 'lucide-react';
import { fetchAsesorPlaybook } from '../../api/asesor';

const fmtMXN = (v) => v == null ? '—' : `$${Number(v).toLocaleString('es-MX')}`;

const ACCESO = {
  interno:        { label: 'Eres del equipo', color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.30)' },
  preasignado:    { label: 'Asignado a ti', color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.30)' },
  autorizado:     { label: 'Puedes venderlo', color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.30)' },
  puede_solicitar:{ label: 'Solicita acceso', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.30)' },
  no_disponible:  { label: 'No disponible', color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)', border: 'rgba(156,163,175,0.25)' },
};

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 18 };
const h = { margin: 0, fontFamily: 'Outfit,sans-serif', fontWeight: 800, color: '#F0EBE0' };
const muted = { color: 'rgba(240,235,224,0.55)' };

function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Icon size={16} style={{ color: '#818CF8' }} />
      <h3 style={{ ...h, fontSize: 14.5 }}>{children}</h3>
    </div>
  );
}

export default function PlaybookProyecto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchAsesorPlaybook(id).then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [id]);

  return (
    <AdvisorLayout>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '22px 18px' }}>
        <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'rgba(240,235,224,0.6)', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
          <ArrowLeft size={15} /> Volver
        </button>

        {err && <div style={{ ...card, color: '#FCA5A5' }}>No se pudo cargar: {err}</div>}
        {!d && !err && <div style={muted}>Cargando ficha para vender…</div>}

        {d && (() => {
          const a = ACCESO[d.acceso?.estado] || ACCESO.no_disponible;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header + acceso + comisión */}
              <div style={{ ...card, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', ...muted }}>Ficha para vender</div>
                    <h1 style={{ ...h, fontSize: 24, margin: '4px 0 2px' }}>{d.nombre}</h1>
                    <div style={{ fontSize: 13, ...muted }}>{d.colonia} · desde {fmtMXN(d.precio_desde)}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: a.color, background: a.bg, border: `1px solid ${a.border}`, padding: '6px 12px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                    {d.acceso?.puede_vender ? <CheckCircle2 size={13} /> : <Lock size={13} />}{a.label}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, ...muted, marginTop: 8 }}>{d.acceso?.motivo}</div>
                {/* Comisión — lo que más le importa al asesor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, ...muted, fontWeight: 600 }}>TU COMISIÓN</div>
                    <div style={{ fontFamily: 'Outfit', fontSize: 30, fontWeight: 800, background: 'linear-gradient(90deg,#818CF8,#EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{d.comision?.pct}%</div>
                    <div style={{ fontSize: 10.5, ...muted }}>{d.comision?.fuente}</div>
                  </div>
                  {d.comision?.esquema_pago && (
                    <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'rgba(240,235,224,0.7)' }}>
                      <b style={{ color: '#F0EBE0' }}>Pago:</b> {d.comision.esquema_pago}
                      {d.comision.escalonada && <div style={{ marginTop: 3, color: '#34D399' }}>+ {d.comision.escalonada}</div>}
                    </div>
                  )}
                  {d.acceso?.estado === 'puede_solicitar' && (
                    <button onClick={() => navigate(d.acceso.solicitar_url || '/asesor/mini-market')}
                      style={{ background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Solicitar acceso para venderlo
                    </button>
                  )}
                </div>
              </div>

              {/* Qué ofrecerle al cliente — el corazón del playbook */}
              <div style={{ ...card, borderColor: 'rgba(129,140,248,0.25)', background: 'linear-gradient(160deg, rgba(99,102,241,0.07), rgba(236,72,153,0.04))' }}>
                <SectionTitle icon={Megaphone}>Qué ofrecerle al cliente</SectionTitle>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {(d.que_ofrecer || []).map((p, i) => (
                    <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: 'rgba(240,235,224,0.85)', lineHeight: 1.45 }}>
                      <span style={{ color: '#818CF8', fontWeight: 800 }}>›</span>{p}
                    </li>
                  ))}
                  {(!d.que_ofrecer || !d.que_ofrecer.length) && <li style={muted}>El desarrollador aún no configura datos de venta.</li>}
                </ul>
              </div>

              {/* Sellos de confianza */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
                {d.sello_constructivo?.configured && (
                  <div style={card}>
                    <SectionTitle icon={ShieldCheck}>{d.sello_constructivo.titulo}</SectionTitle>
                    <div style={{ fontSize: 12.5, color: 'rgba(240,235,224,0.75)', lineHeight: 1.5 }}>{d.sello_constructivo.descripcion}</div>
                  </div>
                )}
                {d.sello_legal?.configured && (
                  <div style={card}>
                    <SectionTitle icon={ScrollText}>{d.sello_legal.titulo}</SectionTitle>
                    <div style={{ fontSize: 12.5, color: 'rgba(240,235,224,0.75)', lineHeight: 1.5 }}>{d.sello_legal.descripcion}</div>
                  </div>
                )}
              </div>

              {/* Formas de pago */}
              {(d.formas_pago || []).length > 0 && (
                <div style={card}>
                  <SectionTitle icon={Wallet}>Formas de pago para cotizar</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
                    {d.formas_pago.map((s, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#F0EBE0' }}>{s.nombre}</div>
                        <div style={{ fontSize: 11.5, ...muted, marginTop: 4 }}>
                          {s.firma_pct}% firma · {s.mensualidades_pct}% mensualidades · {s.escritura_pct}% escritura
                        </div>
                        {(s.descuento_pct || 0) > 0 && <div style={{ fontSize: 11.5, color: '#34D399', fontWeight: 700, marginTop: 3 }}>{s.descuento_pct}% de descuento</div>}
                      </div>
                    ))}
                  </div>
                  {d.apartado?.monto && <div style={{ fontSize: 12, ...muted, marginTop: 12 }}>Apartado: <b style={{ color: '#F0EBE0' }}>{fmtMXN(d.apartado.monto)}</b>{d.apartado.condiciones ? ` · ${d.apartado.condiciones}` : ''}</div>}
                </div>
              )}

              {/* Política comercial (reglas para el asesor) */}
              {d.politica?.configured && (
                <div style={card}>
                  <SectionTitle icon={ScrollText}>Reglas del desarrollador</SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'rgba(240,235,224,0.75)' }}>
                    {d.politica.registro_leads && <div><b style={{ color: '#F0EBE0' }}>Registro de leads:</b> {d.politica.registro_leads}</div>}
                    {d.politica.descuento_max_pct != null && <div><b style={{ color: '#F0EBE0' }}>Descuento máx:</b> {d.politica.descuento_max_pct}%</div>}
                    {d.politica.cobrokering && <div><b style={{ color: '#F0EBE0' }}>Co-brokering:</b> {d.politica.cobrokering}</div>}
                    {d.politica.exclusividad && <div><b style={{ color: '#F0EBE0' }}>Exclusividad:</b> {d.politica.exclusividad}</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </AdvisorLayout>
  );
}
