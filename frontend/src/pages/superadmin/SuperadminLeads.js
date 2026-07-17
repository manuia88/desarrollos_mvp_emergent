/**
 * SuperadminLeads — la vista TOTAL de leads del founder (auditoría 07-17).
 * Antes la bandeja ligaba a /superadmin/leads y la ruta no existía. Aquí están TODOS:
 * los 53 que apuntan a proyectos seed borrados el 07-14 se muestran con su etiqueta
 * "proyecto ya no existe (demo borrada)" — no se esconden ni se borran.
 * Filtros: status · proyecto · texto. Totales por status arriba (clic = filtrar).
 */
import React, { useEffect, useMemo, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Flame, RefreshCw } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export const ST = {
  nuevo: { label: 'Nuevo', color: '#58a6ff' },
  contactado: { label: 'Contactado', color: '#9ecbff' },
  cita: { label: 'Cita agendada', color: '#a78bfa' },
  calificado: { label: 'Calificado', color: '#d29922' },
  propuesta: { label: 'Propuesta', color: '#f0abfc' },
  cerrado_ganado: { label: 'Ganado', color: '#4ADE80' },
  cerrado_perdido: { label: 'Perdido', color: '#f87171' },
};

const FUENTE = {
  inhouse: 'Equipo propio', broker: 'Broker externo', asesor_manual: 'Asesor (a mano)',
  caya_bubble: 'Chat de Caya', atlax_bubble: 'Chat de Atlax',
  copiloto_marketplace_save: 'Copiloto · guardó búsqueda', copiloto_ficha_agendar: 'Copiloto · pidió cita',
  copiloto_cotizador: 'Copiloto · cotizó', copiloto_ficha_v3: 'Copiloto · ficha',
};
export const fuenteHumana = (f) => FUENTE[f] || (f || '—').replace(/_/g, ' ');

/** Filtro puro (testeable): status + proyecto + texto libre sobre nombre/email/proyecto/asesor. */
export function filtrarLeads(leads, { status = '', proyecto = '', texto = '' } = {}) {
  const t = texto.trim().toLowerCase();
  return leads.filter((l) =>
    (!status || l.status === status) &&
    (!proyecto || (l.proyecto || '') === proyecto) &&
    (!t || [l.nombre, l.email, l.proyecto, l.asesor, l.fuente].some((v) => (v || '').toLowerCase().includes(t))));
}

export default function SuperadminLeads({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [texto, setTexto] = useState('');

  const load = () => fetch(`${API}/api/superadmin/leads`, { credentials: 'include' })
    .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(setData).catch((e) => setErr(String(e.message)));
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const leads = useMemo(() => filtrarLeads(data?.leads || [], { status, proyecto, texto }),
    [data, status, proyecto, texto]);
  const proyectos = useMemo(() => Object.entries(data?.totales?.por_proyecto || {}), [data]);

  const cell = { padding: '9px 12px', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' };
  const th = { ...cell, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.5)', textAlign: 'left' };
  const mini = { fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.5)' };
  const inp = { padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5 };

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-leads" style={{ padding: '26px 30px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <Flame size={20} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', margin: 0 }}>Leads</h1>
          {data && <span style={mini}>{data.n} en total{data.n_proyecto_borrado ? ` · ${data.n_proyecto_borrado} apuntan a proyectos que ya no existen (demo borrada)` : ''}</span>}
          <button onClick={load} title="Actualizar" style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', cursor: 'pointer' }}>
            <RefreshCw size={12} />
          </button>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)', margin: '0 0 14px' }}>
          Todos los interesados que ha captado la plataforma, vengan de donde vengan. Nada se esconde: si su proyecto era de la demo y ya se borró, aquí sigue con su etiqueta.
        </p>

        {/* totales por status — clic = filtrar */}
        {data && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }} data-testid="totales-status">
            {Object.entries(data.totales?.por_status || {}).map(([s, n]) => {
              const st = ST[s] || { label: s, color: '#8b949e' };
              const on = status === s;
              return (
                <button key={s} onClick={() => setStatus(on ? '' : s)}
                  style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: on ? 800 : 600, padding: '5px 12px', borderRadius: 9999, cursor: 'pointer',
                    background: on ? `${st.color}26` : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? st.color : 'rgba(255,255,255,0.12)'}`, color: st.color }}>
                  {st.label}: {n}
                </button>
              );
            })}
          </div>
        )}

        {/* filtros */}
        <div className="dmx-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 14 }}>
          <input data-testid="filtro-texto" style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Buscar por nombre, correo, proyecto o asesor…"
            value={texto} onChange={(e) => setTexto(e.target.value)} />
          <select data-testid="filtro-status" style={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos los status</option>
            {Object.entries(ST).map(([s, v]) => <option key={s} value={s}>{v.label}</option>)}
          </select>
          <select data-testid="filtro-proyecto" style={{ ...inp, maxWidth: 260 }} value={proyecto} onChange={(e) => setProyecto(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {proyectos.map(([p, n]) => <option key={p} value={p}>{p} ({n})</option>)}
          </select>
          {(status || proyecto || texto) && (
            <button onClick={() => { setStatus(''); setProyecto(''); setTexto(''); }}
              style={{ ...inp, cursor: 'pointer', fontWeight: 700 }}>Limpiar</button>
          )}
        </div>

        {err && <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#fca5a5' }}>⚠ {err}</p>}
        {!data && !err && <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando los leads…</p>}

        {data && leads.length === 0 && (
          <div style={{ padding: 30, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center', color: 'rgba(240,235,224,0.6)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Ningún lead cumple esos filtros.
          </div>
        )}

        {data && leads.length > 0 && (
          <div className="dmx-card" style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead><tr>
                <th style={th}>Interesado</th><th style={th}>Proyecto</th><th style={th}>Status</th>
                <th style={th}>Asesor / inmobiliaria</th><th style={th}>Fuente</th><th style={th}>Presupuesto</th><th style={th}>Fecha</th>
              </tr></thead>
              <tbody>
                {leads.map((l) => {
                  const st = ST[l.status] || { label: l.status, color: '#8b949e' };
                  return (
                    <tr key={l.id} data-testid={`lead-${l.id}`}>
                      <td style={cell}>
                        <div style={{ fontWeight: 700 }}>{l.nombre}{l.demo ? <span style={{ ...mini, marginLeft: 6 }}>(demo)</span> : null}</div>
                        <div style={mini}>{[l.email, l.telefono].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={cell}>
                        {l.proyecto_borrado ? (
                          <>
                            <span title={`El id ${l.development_id} apuntaba a un proyecto de prueba que se borró.`}
                              style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700, background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.45)', color: '#d29922' }}>
                              ⚠ proyecto ya no existe (demo borrada)
                            </span>
                            <div style={mini}>{l.development_id}</div>
                          </>
                        ) : (l.proyecto || <span style={{ color: 'rgba(240,235,224,0.4)' }}>—</span>)}
                      </td>
                      <td style={cell}><span style={{ color: st.color, fontWeight: 700, fontSize: 12 }}>{st.label}</span></td>
                      <td style={cell}>
                        {l.asesor || <span style={{ color: 'rgba(240,235,224,0.4)' }}>sin asignar</span>}
                        {l.inmobiliaria && <div style={mini}>{l.inmobiliaria}</div>}
                      </td>
                      <td style={cell}>{fuenteHumana(l.fuente)}</td>
                      <td style={{ ...cell, fontVariantNumeric: 'tabular-nums' }}>{l.presupuesto_mxn ? `$${Number(l.presupuesto_mxn).toLocaleString('en-US')}` : '—'}</td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{l.fecha || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && leads.length > 0 && (
          <p style={{ ...mini, marginTop: 8 }}>Mostrando {leads.length} de {data.n} leads.</p>
        )}
      </div>
    </SuperadminLayout>
  );
}
