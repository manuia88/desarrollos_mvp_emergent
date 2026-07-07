/**
 * W4.10 Sub-Fix 1 — Superadmin WhatsApp
 * Configurar provider · CRUD templates · ver mensajes · stats
 */
import React, { useCallback, useEffect, useState } from "react";
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return r.json();
}

const STATUS_COLORS = {
  queued:    "var(--theme)",
  sent:      "#22c55e",
  delivered: "#4ade80",
  read:      "#86efac",
  failed:    "#f87171",
  received:  "#f59e0b",
};

export default function SuperadminWhatsApp({ embedded }) {
  const [stats, setStats]         = useState(null);
  const [messages, setMessages]   = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState("mensajes");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  // New template form
  const [tplName, setTplName]     = useState("");
  const [tplBody, setTplBody]     = useState("");
  const [tplCategory, setTplCat]  = useState("followup");
  const [tplSaving, setTplSaving] = useState(false);
  const [tplOk, setTplOk]         = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, m, t] = await Promise.all([
        apiFetch("/api/superadmin/whatsapp/stats"),
        apiFetch("/api/superadmin/whatsapp/messages?limit=50"),
        apiFetch("/api/superadmin/whatsapp/templates"),
      ]);
      setStats(s);
      setMessages(m.messages || []);
      setTemplates(t.templates || []);
    } catch (e) {
      setError("Error cargando datos de WhatsApp");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveTemplate = async (e) => {
    e.preventDefault();
    if (!tplName || !tplBody) return;
    setTplSaving(true);
    setTplOk("");
    try {
      const r = await apiFetch("/api/superadmin/whatsapp/templates", {
        method: "POST",
        body: JSON.stringify({ template_name: tplName, body_text: tplBody, category: tplCategory }),
      });
      if (r.ok) {
        setTplOk("Plantilla guardada");
        setTplName(""); setTplBody(""); setTplCat("followup");
        loadData();
      } else {
        setTplOk(r.detail || "Error al guardar plantilla");
      }
    } catch {
      setTplOk("Error de red");
    } finally {
      setTplSaving(false);
    }
  };

  const PROVIDER = process.env.REACT_APP_WA_PROVIDER || "twilio";

  const TAB_STYLE = (t) => ({
    padding: "8px 18px",
    borderRadius: "9999px",
    border: "none",
    background: activeTab === t ? "linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))" : "rgba(255,255,255,0.05)",
    color: activeTab === t ? "#fff" : "rgba(240,235,224,0.6)",
    fontFamily: "DM Sans",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  });

  return (
    <SuperadminLayout bare={embedded}><div data-testid="superadmin-whatsapp" style={{ padding: "28px 32px", color: "var(--cream)" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "9999px",
            background: "linear-gradient(135deg,var(--theme),var(--theme))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="#fff"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h1 style={{ fontFamily: "Outfit", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
            WhatsApp Business
          </h1>
          <span style={{
            marginLeft: 8, padding: "3px 10px", borderRadius: 9999,
            background: "rgba(var(--theme-rgb),0.15)", border: "1px solid rgba(var(--theme-rgb),0.35)",
            fontSize: 11, fontFamily: "DM Sans", color: "var(--theme)", fontWeight: 700, letterSpacing: "0.04em",
          }}>
            {PROVIDER.toUpperCase()}
          </span>
        </div>
        <p style={{ fontFamily: "DM Sans", fontSize: 13, color: "rgba(240,235,224,0.55)", margin: 0 }}>
          Mensajes enviados/recibidos, plantillas y estadisticas de entrega
        </p>
      </div>

      {error && (
        <div data-testid="wa-error" style={{
          padding: "10px 16px", borderRadius: 10, marginBottom: 18,
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)",
          color: "#fca5a5", fontSize: 13, fontFamily: "DM Sans",
        }}>{error}</div>
      )}

      {/* Stats cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total", val: stats.total || 0 },
            { label: "Enviados", val: stats.outbound || 0 },
            { label: "Recibidos", val: stats.inbound || 0 },
            ...Object.entries(stats.by_status || {}).map(([k, v]) => ({ label: k, val: v })),
          ].map((s) => (
            <div key={s.label} style={{
              padding: "16px 18px", borderRadius: 14,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
            }}>
              <div style={{ fontFamily: "DM Sans", fontSize: 11, color: "rgba(240,235,224,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.label}
              </div>
              <div style={{ fontFamily: "Outfit", fontWeight: 800, fontSize: 24, color: "#F0EBE0", marginTop: 4 }}>
                {s.val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["mensajes", "plantillas"].map(t => (
          <button key={t} style={TAB_STYLE(t)} onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "rgba(240,235,224,0.4)", fontFamily: "DM Sans", padding: 40 }}>Cargando…</div>
      ) : activeTab === "mensajes" ? (
        /* ── Mensajes ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(240,235,224,0.35)", fontFamily: "DM Sans", fontSize: 13, padding: 40 }}>
              Sin mensajes aun. Envía el primer mensaje desde el CRM.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} data-testid="wa-message-row" style={{
              display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
              borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: STATUS_COLORS[m.status] || "#666", flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "DM Sans", fontSize: 12, color: "#F0EBE0", fontWeight: 600, marginBottom: 3 }}>
                  {m.direction === "outbound" ? `A: ${m.to_number}` : `De: ${m.from_number}`}
                </div>
                <div style={{
                  fontFamily: "DM Sans", fontSize: 12.5, color: "rgba(240,235,224,0.7)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {m.body_text}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 9999,
                  background: `${STATUS_COLORS[m.status]}22`,
                  border: `1px solid ${STATUS_COLORS[m.status]}44`,
                  color: STATUS_COLORS[m.status], fontSize: 10.5, fontFamily: "DM Sans", fontWeight: 700,
                }}>
                  {m.status}
                </span>
                <span style={{ fontSize: 10.5, color: "rgba(240,235,224,0.35)", fontFamily: "DM Sans" }}>
                  {m.created_at ? new Date(m.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Plantillas ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Form nueva plantilla */}
          <form onSubmit={saveTemplate} style={{
            padding: "20px 22px", borderRadius: 14,
            background: "rgba(var(--theme-rgb),0.07)", border: "1px solid rgba(var(--theme-rgb),0.25)",
          }}>
            <h3 style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 15, margin: "0 0 14px", color: "#F0EBE0" }}>
              Nueva Plantilla
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <input
                data-testid="wa-tpl-name"
                value={tplName}
                onChange={e => setTplName(e.target.value)}
                placeholder="Nombre de plantilla"
                required
                style={{
                  padding: "9px 14px", borderRadius: 9999,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#F0EBE0", fontFamily: "DM Sans", fontSize: 13, outline: "none",
                }}
              />
              <select
                data-testid="wa-tpl-category"
                value={tplCategory}
                onChange={e => setTplCat(e.target.value)}
                style={{
                  padding: "9px 14px", borderRadius: 9999,
                  background: "#0E1120", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#F0EBE0", fontFamily: "DM Sans", fontSize: 13, outline: "none",
                }}
              >
                <option value="greeting">Saludo</option>
                <option value="followup">Seguimiento</option>
                <option value="appointment">Cita</option>
                <option value="nurture">Nurture</option>
              </select>
            </div>
            <textarea
              data-testid="wa-tpl-body"
              value={tplBody}
              onChange={e => setTplBody(e.target.value)}
              placeholder="Cuerpo del mensaje. Usa {{nombre}} para variables."
              required
              rows={3}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 12,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#F0EBE0", fontFamily: "DM Sans", fontSize: 13, outline: "none", resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <button
                type="submit"
                data-testid="wa-tpl-save-btn"
                disabled={tplSaving}
                style={{
                  padding: "9px 22px", borderRadius: "9999px",
                  background: "linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))",
                  border: "none", color: "#fff",
                  fontFamily: "DM Sans", fontSize: 13, fontWeight: 700,
                  cursor: tplSaving ? "not-allowed" : "pointer",
                }}
              >
                {tplSaving ? "Guardando…" : "Guardar Plantilla"}
              </button>
              {tplOk && (
                <span style={{ fontFamily: "DM Sans", fontSize: 12, color: tplOk.startsWith("Error") || tplOk.startsWith("Ya") ? "#f87171" : "#4ade80" }}>
                  {tplOk}
                </span>
              )}
            </div>
          </form>

          {/* Lista templates */}
          {templates.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(240,235,224,0.35)", fontFamily: "DM Sans", fontSize: 13, padding: 24 }}>
              Sin plantillas. Crea la primera arriba.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {templates.map((t, i) => (
                <div key={i} data-testid="wa-template-row" style={{
                  padding: "14px 18px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 13, color: "#F0EBE0" }}>
                      {t.template_name}
                    </span>
                    <span style={{
                      padding: "2px 8px", borderRadius: 9999,
                      background: "rgba(var(--theme-rgb),0.12)", border: "1px solid rgba(var(--theme-rgb),0.3)",
                      fontSize: 10.5, fontFamily: "DM Sans", color: "var(--theme)",
                    }}>
                      {t.category}
                    </span>
                  </div>
                  <div style={{ fontFamily: "DM Sans", fontSize: 12.5, color: "rgba(240,235,224,0.65)" }}>
                    {t.body_text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div></SuperadminLayout>
  );
}
