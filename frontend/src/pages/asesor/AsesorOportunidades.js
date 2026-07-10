/**
 * AsesorOportunidades — /asesor/oportunidades
 *
 * Conecta la SEÑAL DE DEMANDA (dónde hay compradores y poca oferta) con TUS clientes y un mensaje listo.
 * No es una "campaña" nueva: ordena lo que ya existe en un solo lugar → "zona caliente → tus clientes que
 * calzan → el mensaje". Cada cliente se convierte en un briefing IE (pitch + WhatsApp) reusando BriefingIEModal.
 * Backend: GET /api/asesor/market/oportunidades (owner-scoped por assigned_to/asesor_id/owner_id · nunca leads ajenos).
 */
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import BriefingIEModal from '../../components/advisor/BriefingIEModal';
import { fetchAsesorOportunidades } from '../../api/asesor';
import PicksMunicion from '../../components/asesor/PicksMunicion';
import { Target, Flame, Building2, Users, MessageSquare, ArrowRight, AlertCircle, Info } from 'lucide-react';

const TIPO_LABEL = {
  estudio: 'Estudio', '1_recamara': '1 rec', '2_recamaras': '2 rec',
  '3_recamaras': '3 rec', '4_mas_recamaras': '4+ rec', sin_dato: '—',
};
// La demanda es "oportunidad" cuando el veredicto empuja a actuar (se agota / ventana / construir).
const isHot = (verdict) => /agota|ventana|construir|subir/i.test(verdict || '');

// El motor redacta para un DESARROLLADOR ("construir"); el asesor VENDE → traducimos a su acción.
const VERDICT_ASESOR = {
  'Demanda sin inventario → construir': 'Mucha demanda y casi nada disponible — consigue inventario aquí',
  'Se agota rápido → ventana para construir/subir': 'Se agota rápido — buen momento para ofrecer ya',
  'Sobreoferta de esta tipología': 'Mucha oferta — hay de dónde escoger para tu cliente',
  'Sostener': 'Mercado estable',
};

// En modo estimado (proxy, sin búsquedas reales) NUNCA pintamos "caliente" en verde: sería vender como
// medido algo que no lo es. El color fuerte solo aparece con demanda real (es_estimado=false).
function VerdictBadge({ verdict, estimado }) {
  if (!verdict) return null;
  const hot = !estimado && isHot(verdict);
  return (
    <span style={{
      fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
      color: hot ? '#4ADE80' : 'rgba(240,235,224,0.62)',
      background: hot ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${hot ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 9999, padding: '3px 10px',
    }}>{VERDICT_ASESOR[verdict] || verdict}</span>
  );
}

const estimadoChipStyle = {
  fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#FCD34D', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.28)',
  borderRadius: 9999, padding: '2px 8px', whiteSpace: 'nowrap',
};

export default function AsesorOportunidades({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState(null);   // {development:{id,name}, leadId}

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAsesorOportunidades(20)
      .then((d) => { if (alive) { setData(d); setErr(null); } })
      .catch((e) => { if (alive) setErr(e?.message || 'Error.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const ops = data?.oportunidades || [];

  return (
    <AdvisorLayout user={user} onLogout={onLogout} active="oportunidades">
      <div data-testid="asesor-oportunidades" style={{ maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Target size={20} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>Oportunidades</h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.72)', margin: '0 0 16px', maxWidth: 640 }}>
          Dónde hay demanda de compradores y poca oferta — y cuáles de <b>tus clientes</b> encajan.
          Genera el mensaje en un clic.
        </p>

        <PicksMunicion />

        {data?.es_estimado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', marginBottom: 16, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.75)' }}>
            <Info size={14} color="#FCD34D" /> {data.lectura_datos}
          </div>
        )}

        {err && <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><AlertCircle size={15} /> {err}</div>}

        {loading && <div style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Buscando oportunidades…</div>}

        {!loading && !err && ops.length === 0 && (
          <div style={{ padding: 26, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>
            Aún no hay señal de demanda por zona. Se llena conforme entran búsquedas y visitas reales.
          </div>
        )}

        {!loading && !err && ops.length > 0 && (
          <>
            {data.con_leads > 0 && (
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', marginBottom: 12 }}>
                Tienes clientes en <b style={{ color: 'var(--cream)' }}>{data.con_leads}</b> {data.con_leads === 1 ? 'zona con demanda' : 'zonas con demanda'}. Empieza por ahí.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ops.map((o) => {
                const hasLeads = o.n_leads > 0;
                return (
                  <div key={o.colonia} className="dmx-card" data-testid={`op-${o.colonia}`}
                    style={{ padding: '16px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: `1px solid ${hasLeads ? 'rgba(var(--theme-rgb),0.28)' : 'rgba(255,255,255,0.08)'}` }}>
                    {/* Cabecera: colonia + veredicto + tipologías. La flama verde solo con demanda REAL. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {(!data.es_estimado && isHot(o.verdict)) ? <Flame size={16} color="#4ADE80" /> : <Building2 size={15} color="rgba(240,235,224,0.55)" />}
                      <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)' }}>{o.colonia_label}</span>
                      <VerdictBadge verdict={o.verdict} estimado={data.es_estimado} />
                      {data.es_estimado && <span style={estimadoChipStyle} title="Aún sin búsquedas reales en esta zona — es un estimado, no una medición.">estimado</span>}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 'auto' }}>
                        {(o.tipologias || []).slice(0, 4).map((t) => (
                          <span key={t.tipologia} title={t.available != null ? `${t.available} disponibles` : undefined} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.6)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '2px 7px' }}>
                            {TIPO_LABEL[t.tipologia] || t.tipologia}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Tus clientes en esta zona → generar mensaje */}
                    {hasLeads ? (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--theme)', marginBottom: 8 }}>
                          <Users size={11} /> Tus clientes aquí ({o.n_leads})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
                          {o.mis_leads.map((l) => (
                            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name || 'Cliente'}</div>
                                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.development_name || l.development_id}</div>
                              </div>
                              <button data-testid={`op-msg-${l.id}`}
                                onClick={() => setOpenLead({ development: { id: l.development_id, name: l.development_name }, leadId: l.id })}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 9, border: '1px solid rgba(var(--theme-rgb),0.4)', background: 'rgba(var(--theme-rgb),0.14)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <MessageSquare size={12} /> Mensaje
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.5)' }}>Sin clientes tuyos aquí todavía.</span>
                        {(o.desarrollos || []).length > 0 && (
                          <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.62)' }}>
                            Puedes ofrecer: {o.desarrollos.slice(0, 3).map((d) => d.name).join(' · ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.4)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowRight size={11} /> El mensaje se genera con IA desde los datos del desarrollo y tu cliente. Solo tuyos: nunca ves leads de otros asesores.
            </div>
          </>
        )}
      </div>

      {openLead && (
        <BriefingIEModal
          open
          development={openLead.development}
          leadId={openLead.leadId}
          onClose={() => setOpenLead(null)}
        />
      )}
    </AdvisorLayout>
  );
}
