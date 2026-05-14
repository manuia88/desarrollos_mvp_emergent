/**
 * W4.10 Sub-Fix 2 — Superadmin Newsletter Pulse
 * 4 segmentos · preview · envío manual · historial · stats opt-in/opt-out
 */
import React, { useCallback, useEffect, useState } from "react";
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';

const API = process.env.REACT_APP_BACKEND_URL;

const SEGMENTS = [
  { key: "dev", label: "Desarrolladores", color: "var(--theme)" },
  { key: "asesor", label: "Asesores", color: "var(--theme)" },
  { key: "buyer", label: "Compradores", color: "#f59e0b" },
  { key: "inversionista", label: "Inversionistas", color: "#22c55e" },
];

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return r.json();
}

function StatusBadge({ status }) {
  const MAP = {
    generated: { bg: "rgba(var(--theme-rgb),0.15)", border: "rgba(var(--theme-rgb),0.3)", color: "var(--theme)" },
    sending:   { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", color: "#fcd34d" },
    sent:      { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)",  color: "#86efac" },
    failed:    { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",  color: "#fca5a5" },
    preview:   { bg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.15)", color: "rgba(240,235,224,0.7)" },
  };
  const s = MAP[status] || MAP.preview;
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 9999,
      background: s.bg, border: `1px solid ${s.border}`,
      fontSize: 10.5, fontFamily: "DM Sans", fontWeight: 700, color: s.color,
    }}>
      {status}
    </span>
  );
}

export default function SuperadminNewsletter() {
  const [stats, setStats]         = useState(null);
  const [runs, setRuns]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [activeTab, setActiveTab] = useState("resumen");
  const [sending, setSending]     = useState({});
  const [previewing, setPreviewing] = useState({});
  const [previewData, setPreviewData] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, r] = await Promise.all([
        apiFetch("/api/superadmin/newsletter/stats"),
        apiFetch("/api/superadmin/newsletter/runs?days=30"),
      ]);
      setStats(s.by_segment || {});
      setRuns(r.runs || []);
    } catch {
      setError("Error cargando datos de newsletter");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const previewSegment = async (seg) => {
    setPreviewing(p => ({ ...p, [seg]: true }));
    try {
      const r = await apiFetch(`/api/superadmin/newsletter/preview?segment=${seg}`, { method: "POST" });
      setPreviewData(p => ({ ...p, [seg]: r.preview }));
    } catch {
      setPreviewData(p => ({ ...p, [seg]: { error: "Error generando preview" } }));
    } finally {
      setPreviewing(p => ({ ...p, [seg]: false }));
    }
  };

  const sendManual = async (seg) => {
    setSending(s => ({ ...s, [seg]: true }));
    try {
      const r = await apiFetch(`/api/superadmin/newsletter/send-manual?segment=${seg}`, { method: "POST" });
      if (r.ok) loadData();
    } catch {
      /* no-op */
    } finally {
      setSending(s => ({ ...s, [seg]: false }));
    }
  };

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
    <SuperadminLayout><div data-testid="superadmin-newsletter" style={{ padding: "28px 32px", color: "var(--cream)" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "9999px",
            background: "linear-gradient(135deg,var(--theme),var(--theme))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h1 style={{ fontFamily: "Outfit", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
            Newsletter Pulse
          </h1>
          <span style={{
            marginLeft: 8, padding: "3px 10px", borderRadius: 9999,
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
            fontSize: 11, fontFamily: "DM Sans", color: "#22c55e", fontWeight: 700, letterSpacing: "0.04em",
          }}>
            4 SEGMENTOS
          </span>
        </div>
        <p style={{ fontFamily: "DM Sans", fontSize: 13, color: "rgba(240,235,224,0.55)", margin: 0 }}>
          Cron: domingo 18:00 MX genera · lunes 07:00 MX envia via Resend
        </p>
      </div>

      {error && (
        <div style={{
          padding: "10px 16px", borderRadius: 10, marginBottom: 18,
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)",
          color: "#fca5a5", fontSize: 13, fontFamily: "DM Sans",
        }}>{error}</div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["resumen", "historial"].map(t => (
          <button key={t} style={TAB_STYLE(t)} onClick={() => setActiveTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "rgba(240,235,224,0.4)", fontFamily: "DM Sans", padding: 40 }}>Cargando…</div>
      ) : activeTab === "resumen" ? (
        /* ── Resumen por segmento ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          {SEGMENTS.map(seg => {
            const s = stats?.[seg.key] || {};
            const pData = previewData[seg.key];
            return (
              <div key={seg.key} data-testid={`newsletter-segment-${seg.key}`} style={{
                padding: "20px 22px", borderRadius: 16,
                background: "rgba(255,255,255,0.03)", border: `1px solid ${seg.color}33`,
                backdropFilter: "blur(24px)",
              }}>
                {/* Segment header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{
                    padding: "4px 12px", borderRadius: 9999,
                    background: `${seg.color}18`, border: `1px solid ${seg.color}44`,
                    fontSize: 12, fontFamily: "DM Sans", fontWeight: 700, color: seg.color,
                  }}>
                    {seg.label}
                  </span>
                  <span style={{ fontFamily: "DM Sans", fontSize: 11, color: "rgba(240,235,224,0.4)" }}>
                    {s.opt_ins || 0} suscriptores
                  </span>
                </div>

                {/* Metric */}
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: "Outfit", fontWeight: 800, fontSize: 26, color: "#F0EBE0" }}>
                      {s.sent_runs || 0}
                    </div>
                    <div style={{ fontFamily: "DM Sans", fontSize: 10.5, color: "rgba(240, 235, 224, 0.70)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Runs enviados
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "Outfit", fontWeight: 800, fontSize: 26, color: "#F0EBE0" }}>
                      {s.opt_ins || 0}
                    </div>
                    <div style={{ fontFamily: "DM Sans", fontSize: 10.5, color: "rgba(240, 235, 224, 0.70)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Opt-ins activos
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginBottom: pData ? 14 : 0 }}>
                  <button
                    data-testid={`newsletter-preview-btn-${seg.key}`}
                    onClick={() => previewSegment(seg.key)}
                    disabled={previewing[seg.key]}
                    style={{
                      padding: "7px 14px", borderRadius: 9999,
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                      color: "#F0EBE0", fontFamily: "DM Sans", fontSize: 12, fontWeight: 600,
                      cursor: previewing[seg.key] ? "not-allowed" : "pointer",
                      flex: 1,
                    }}
                  >
                    {previewing[seg.key] ? "Generando…" : "Vista previa"}
                  </button>
                  <button
                    data-testid={`newsletter-send-btn-${seg.key}`}
                    onClick={() => sendManual(seg.key)}
                    disabled={sending[seg.key]}
                    style={{
                      padding: "7px 14px", borderRadius: 9999,
                      background: sending[seg.key] ? "rgba(var(--theme-rgb),0.3)" : "linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))",
                      border: "none", color: "#fff", fontFamily: "DM Sans", fontSize: 12, fontWeight: 700,
                      cursor: sending[seg.key] ? "not-allowed" : "pointer",
                      flex: 1,
                    }}
                  >
                    {sending[seg.key] ? "Enviando…" : "Enviar ahora"}
                  </button>
                </div>

                {/* Preview card */}
                {pData && !pData.error && (
                  <div data-testid={`newsletter-preview-content-${seg.key}`} style={{
                    padding: "12px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    fontSize: 12, fontFamily: "DM Sans",
                  }}>
                    <div style={{ fontWeight: 700, color: "#F0EBE0", marginBottom: 6, lineHeight: 1.4 }}>
                      {pData.content?.hero_title || "—"}
                    </div>
                    <div style={{ color: "rgba(240,235,224,0.65)", lineHeight: 1.55, fontSize: 11.5 }}>
                      {pData.content?.market_summary?.slice(0, 200)}…
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10.5, color: "rgba(240,235,224,0.35)" }}>
                      Generado via: {pData.content?.layer || "stub"} · Costo: ${pData.content?.cost_usd?.toFixed(4) || "0.0000"}
                    </div>
                  </div>
                )}
                {pData?.error && (
                  <div style={{ color: "#f87171", fontSize: 12, fontFamily: "DM Sans" }}>{pData.error}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Historial ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {runs.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(240,235,224,0.35)", fontFamily: "DM Sans", fontSize: 13, padding: 40 }}>
              Sin runs en los ultimos 30 dias.
            </div>
          ) : (
            runs.map((r, i) => (
              <div key={i} data-testid="newsletter-run-row" style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 13, color: "#F0EBE0" }}>
                      {SEGMENTS.find(s => s.key === r.segment)?.label || r.segment}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div style={{ fontFamily: "DM Sans", fontSize: 11.5, color: "rgba(240,235,224,0.5)" }}>
                    {r.content_template?.hero_title?.slice(0, 60) || "—"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                  <span style={{ fontSize: 11.5, fontFamily: "DM Sans", color: "rgba(240, 235, 224, 0.70)" }}>
                    {r.generated_at ? new Date(r.generated_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(240,235,224,0.35)", fontFamily: "DM Sans" }}>
                    {r.recipients_count || 0} dest. · ${r.cost_usd?.toFixed(4) || "0"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div></SuperadminLayout>
  );
}
