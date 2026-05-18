# W5.15 · FSD per-property + Accuracy dashboard (Fitch-style) · Spec canónico

**Última actualización**: 2026-05-17 (rescatado de sesiones 2026-05-09/10/16 por Agent forense · founder approved Plan C · 26h)

**Doc canónico** que define qué construimos en W5.15. Spec recuperado + 7 upgrades validados.

---

## 0 · Origen + corrección gloss erróneo

| Fecha | Sesión | Evento |
|---|---|---|
| 2026-05-09 | `760b7418` | **NACIMIENTO** · subagent HouseCanary research vs DMX · identificado gap "FSD per-property + accuracy dashboard institucional" |
| 2026-05-10 | `c5e6246e` | Spec técnico: `prediction_accuracy_log` collection + AVM W5.1 + cierres leads + fallback "insufficient_sample" si <20 cierres |
| 2026-05-16 | `b5ec2643` | Founder verbatim: `W5.15 FSD per-property + Accuracy dashboard · 10h · superadmin · tardía 3-6m` |
| 2026-05-16 | `b5ec2643` | Claude gloseó MAL como "Full-self-deploy" · gloss erróneo se propagó a WAVE5_PLAN.md |
| 2026-05-17 | actual | Founder approved Plan C · 26h con 7 upgrades · ML loop completo |

### ⚠️ Corrección: FSD = Forecast Standard Deviation
**NO es** "Full-self-deploy" · es métrica estándar HouseCanary/CoreLogic/Black Knight · intervalo de confianza per-property en valuaciones AVM (sigma del modelo).

---

## 1 · Por qué W5.15 (caso competitivo)

```
HouseCanary     ✅ FSD + hit rate + percentile errors públicos
CoreLogic       ✅ FSD per-property
Black Knight    ✅ Similar
Cherre          ⚠️ Datos no públicos accuracy
LocalLogic      ❌ Sin AVM
CoStar          ⚠️ AVM sin confidence intervals públicos
DMX hoy         ❌ AVM puntual sin range · sin dashboard público accuracy
```

**Gap**: DMX dice "Polanco depa = $8.5M" puntual. W5.15 lo vuelve **"$7.8M ─ $8.5M ─ $9.2M" + dashboard público Fitch-style accuracy** para credibilidad institucional.

---

## 2 · Scope canónico Plan C · 26h en 2 partes

### Core (15h)
- FSD per-property (sigma OLS hedonic) + range low/value/high
- `prediction_accuracy_log` collection + ground truth via lead-close
- Cron daily compute MAPE rolling 30d/90d/365d + hit rate
- Dashboard público `/confianza` aurora Fitch-style
- Widget shared `<AvmConfidenceRange />` embebible

### 7 Upgrades (11h)
| # | Upgrade | h | Score |
|---|---|---|---|
| 1 | Per-zone accuracy breakdown (MAPE por colonia) | 1h | 9/10 |
| 2 | Notif asesor lead-close MAPE (feedback loop broker) | 1h | 9/10 |
| 3 | Confidence calibration curve (Reliability Diagram) | 1h | 8/10 |
| 4 | Historical accuracy report export PDF/CSV | 1.5h | 8/10 |
| 5 | FSD per-feature breakdown (explainability) | 1.5h | 8/10 |
| 6 | **Drift detector + auto-retrain trigger zone-specific** | 2h | 9/10 ML |
| 7 | **Self-tuning weights per-zone** (Bayesian/GD) | 3h | 8/10 ML |

---

## 3 · ML loop completo (no solo dashboard)

```
predict per-property (W5.1 hedonic + FSD layer W5.15)
       ↓
property listing → lead → close (precio real)
       ↓
prediction_accuracy_log registra prediction vs actual
       ↓
cron daily compute MAPE rolling per-zone
       ↓
drift detector W5.15 #6 → si MAPE_30d > baseline + 10pp
       ↓
auto-trigger retrain ZONE-SPECIFIC (no global)
       ↓
self-tuning weights W5.15 #7 → si ≥50 cierres zone → optimiza pesos
       ↓
new model promote if ΔR² > 5pp (W5.1 retrain existente)
       ↓
cycle repeats (closed loop ML learning)
```

**Diferencia vs hoy**: W5.1 retrain global cada noche · W5.15 #6 hace retrain **focal** solo donde duele. W5.15 #7 hace weights **zone-specific learned** vs globales.

---

## 4 · Estructura batches · 2 partes

### W5.15 P1 · Backend FSD + Accuracy + ML loop (~16h)

**Sub-A · FSD per-property + accuracy log (4h)**
- `avm_engine.py` extender con `compute_fsd(property)` retorna `{low, value, high, fsd_pct, confidence_lvl}`
- Persist `avm_predictions` con `fsd_value`, `confidence_interval`, `feature_breakdown`
- Collection `prediction_accuracy_log` TTL 5 años · audit ground truth

**Sub-B · Ground truth + MAPE rolling (3h)**
- Helper `match_prediction_to_close(lead_id)` cuando `status="cerrado_ganado"`
- Cron daily 04:30 UTC compute MAPE 30d/90d/365d global + per-zone
- Hit rate · percentile errors · sample_size por zone

**Sub-C · Drift detector zone-specific (#6) (2h)**
- `drift_detector.py` NEW · si MAPE_30d_zone > baseline_180d + 10pp → trigger `retrain_zone(zone_slug)`
- audit_immutable_engine.log cada drift detected + retrain triggered
- Idempotency 7d (NO trigger 2x en mismo zone)

**Sub-D · Self-tuning weights (#7) (3h)**
- `weight_optimizer.py` NEW · si zone tiene ≥50 cierres → Gradient Descent (sklearn) optimiza pesos hedonic zone-specific
- Persist `zone_weights` collection con timestamp + version
- Cron weekly recompute weights por zone con ≥50 cierres
- Fallback global weights si <50 cierres

**Sub-E · Endpoints (4h)**
- `GET /api/avm/fsd/:property_id` → range + feature_breakdown (#5) · público T0
- `GET /api/accuracy/meta-dashboard` → Fitch-style público (MAPE · hit rate · sample · confidence label · calibration curve #3)
- `GET /api/accuracy/per-zone` → MAPE breakdown colonia (#1) · superadmin
- `GET /api/accuracy/calibration-curve` → reliability diagram bins (#3)
- `GET /api/superadmin/accuracy/debug` → drill-down per-property errors
- `GET /api/superadmin/accuracy/zone-weights` → ver weights aprendidos (#7)
- `POST /api/superadmin/accuracy/trigger-drift-check` → manual trigger (#6)
- `GET /api/accuracy/export.csv?period=30d|90d|365d` → CSV download (#4 base · PDF en P2)
- Fallback honest si sample_size < 20 → "data acumulándose"

### W5.15 P2 · UI dashboards + cross-modules + reports (~10h)

**Sub-A · Page público `/confianza` aurora landing (3h)**
- Fitch-style branding (badges institucional)
- KPIs strip (MAPE 30d/90d/365d · hit rate · sample size · confidence label "ALTA/MEDIA/BAJA")
- Chart 30d MAPE rolling recharts
- Calibration curve (#3) visualization
- Per-zone MAPE breakdown table (#1)
- Fallback honest "data acumulándose · próx update en N días"

**Sub-B · Widget `<AvmConfidenceRange />` + integraciones (2h)**
- Component shared con range slider visual ($low ─ $value ─ $high)
- Embebido en `/valor/:slug` + `/detalle-proyecto/:slug`
- Tooltip explicativo FSD%

**Sub-C · Tab "FSD Distribution" en `/superadmin/avm-accuracy` (1h)**
- Histogram FSD distribución 50 zonas
- Tabla zone_weights aprendidos (#7)
- Drift alerts last 30d (#6)

**Sub-D · Notif asesor lead-close MAPE (#2) (1h)**
- Hook en lead.status="cerrado_ganado"
- emit_notification type="lead_close_accuracy" payload `{lead_id, prediction, actual, mape_pct, accuracy_label}`
- Body: "Vendiste $X · AVM predijo $Y · error Z% (precisión 92.5%)"

**Sub-E · PDF export Fitch-style report (#4) (1.5h)**
- Endpoint `GET /api/accuracy/export.pdf?period=30d|90d|365d` superadmin
- Reportlab template · institucional · logo DMX + Fitch-style design
- Botón en `/confianza` y superadmin

**Sub-F · Cross-modules integration (1.5h)**
- BuyerCoach W4.14 · mensajes prepend "Valor estimado: $X (±Y% confianza)"
- Asistente W4.4E · system prompt menciona accuracy actual ("MAPE 30d = X%")
- Live Pulse W5.5 · nuevo signal `accuracy_drift` (peso 0 inicial · activar cuando data suficiente)

---

## 5 · Cierre ciclos (NO aislado)

**Alimenta** (módulos shipped):
- ✅ avm_engine W5.1 → OLS sigma + retrain cron
- ✅ forecast_engine W5.3 → confidence intervals horizonte
- ✅ leads collection → ground truth cierres
- ✅ audit_immutable W5.11 → audit chain SHA-256
- ✅ notifications_engine → notif lead_close_accuracy
- ✅ Hedonic OLS → sigma base FSD

**Alimenta a** (módulos shipped + futuros):
- ✅ Property landing `/valor/:slug` → range visual
- ✅ buyer_coach W4.14 → confidence en recomendaciones
- ✅ asistente Atlax → accuracy stats en respuestas
- ✅ live_pulse W5.5 → signal accuracy_drift
- ✅ kg_template W5.12 → futura template "zonas_mejor_accuracy"
- 🔜 Page `/confianza` NEW · Fitch-style público (institutional)
- 🔜 Page `/methodology` NEW · documentación FSD H2

---

## 6 · Reglas inviolables

1. **Fallback bootstrap honest**: si <20 cierres reales → mensaje "data acumulándose" · NUNCA fake numbers
2. **FSD per-property usa OLS sigma real** del modelo · no inventar valores
3. **Drift detector idempotent 7d** · NO retrain mismo zone 2x en semana
4. **Self-tuning weights requiere ≥50 cierres** · zone con menos → weights globales W5.1
5. **Audit chain inmutable cada drift trigger + retrain + weight update**
6. **Fitch-style branding NO copy literal** · "institucional confidence" sin trademark
7. **Permission gate**: `/confianza` público · superadmin debug · APIs FSD T0 públicos

---

## 7 · Próximo paso

1. Persistir este spec ✅
2. Update MEMORY.md index + WAVE5_PLAN
3. Commit docs
4. Escribir prompt W5.15 P1 emergent (16h backend · 5 sub-chunks)
5. Founder pega
6. Emergent ships
7. Yo merge + audit aurora + escribir P2
