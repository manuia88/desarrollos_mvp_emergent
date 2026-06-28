# FINDINGS LEDGER — Testing E2E Cross-Portal v2 (doble-loop)

Append-only. Cada hallazgo: id · severidad · estado · evidencia ANTES/DESPUÉS · quién verificó.
Estados: `open` → `in-fix` → `fixed` → `verified` (Audit B independiente) · `false-alarm` · `wontfix(razón)` · `deferred(plan)`.
Severidad: 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🔵 Oportunidad · 🟢 Upgrade.

Baseline de datos: `scratchpad/baseline_20260628.json` (439 colecciones) · backup: `git tag backup-pretest-20260628`.

---

## F0 — Risk Register (descubrimiento, verificado con queries)

| id | sev | hallazgo | evidencia inicial | estado |
|----|-----|----------|-------------------|--------|
| F0-1 | 🔴→🟡 | "Flywheel asesor→copiloto roto / no aprende" | `copiloto_closings`=2, asesor cerrado=0 | **false-alarm parcial** (ver B1) |
| F0-2 | 🔴 | Dos universos de leads + fantasmas (`leads` 51 vs `asesor_contactos` 4, `mirror_pending`=2) | query F0 | open → **B2** |
| F0-3 | 🟠 | Agentes IA audit-dark (sin `by_ai`; `director_messages`=4 en silo; `audit_log` actor `{}`) | query F0 | open → **B3** |
| F0-4 | 🟡 | Índices compuestos faltantes (leads, buyer_signals, asesor_contactos) | barrido D | open → **B4** |
| F0-5 | 🔵 | Huérfanos de alto valor sin UI (forecast/FSD, battle_card, churn, asesor_digest, conversation cost/kb) | barrido D | open → **FASE R** |
| F0-6 | 🟡 | Reconciliación no-ACID (etapa↔status cron 04:20, temperatura cron 6h, cross-device email-O-tel) | lead_bridge.py | open → **B2** |

---

## B1 — Flywheel del aprendizaje (cierre → re-ranking)

### Definition-of-Done (congelado ANTES de tocar código)
1. **DoD-1** (refutación honesta): demostrar con código si el cierre del asesor alimenta el loop. Aserción: la ruta canónica (operaciones→"cerrada") llama `record_closing(price_closed=...)`. → si SÍ, F0-1 baja de 🔴.
2. **DoD-2** (triangulación-dato): un cierre re-materializa `closing_lifts` y `score_devs` lo consume EN VIVO (no cacheado). Reproducir con cierre sintético tagueado `TEST-b1` → assert `closing_lifts.computed_at` cambia + el lift entra al ranking. Teardown → cero-residuo.
3. **DoD-3** (upgrade): el moat aprende >1 factor. Hoy solo `recamaras`. Materializar también `precio` (motor `lifts_por_factor` ya es genérico) y que `score_devs` lo consuma con nudge acotado. Aserción: `closing_lifts.precio` se puebla y el ranking lo lee.
4. **DoD-4** (lateral): harness e2e 13/13 verde post-cambio; sin huérfano/flag/seguridad nuevo; `score_devs` sigue devolviendo dict y el gusto sigue mandando (nudge ≤ peso del gusto).

### Audit A (pre) — hallazgos
| id | sev | hallazgo | evidencia | estado |
|----|-----|----------|-----------|--------|
| B1-A1 | 🔴→🟡 | "asesor→copiloto no cableado" | **REFUTADO por código**: `advisor.py:3185` (operaciones→cerrada) llama `record_closing(... price_closed=...)`, independiente del flag Cerebro. También `advisor.py:1357` (contacto→cerrado). | false-alarm |
| B1-A2 | 🔵→ok | "cache staleness 0-24h en el loop" | **REFUTADO**: `visitor_taste.py:216` lee `closing_lifts` EN VIVO por ranking (no del taste cacheado); `record_closing:109` re-materializa al instante. | false-alarm |
| B1-A3 | 🟢 | El moat aprende **un solo factor** (recámaras). `materialize_closing_lifts` ignora `precio`/amenidades aunque el motor `lifts_por_factor` ya los soporta (`_FACTOR_EXTRACTORS`). | cerebro_mercado_engine.py:123-132 | **in-fix** (upgrade B1) |
| B1-A4 | 🟡 | Contacto→cerrado exige `_lid AND _did` (advisor.py:1356); un cierre sin dev linkeado se salta el loop. | advisor.py:1356 | evaluado · **wontfix** (defendible: un cierre sin propiedad no debe registrar "qué se compró"; documentado) |

### 🔴 Hallazgo REAL (destapado en la reproducción de Audit A)
| id | sev | hallazgo | evidencia ANTES | evidencia DESPUÉS | estado |
|----|-----|----------|-----------------|-------------------|--------|
| **B1-A5** | 🔴 | **El flywheel recomputaba pero NO aprendía.** `materialize_closing_lifts`→`lifts_por_factor` leía el catálogo ESTÁTICO (`DEVELOPMENTS` sold flags), ignorando el log real `copiloto_closings`. Un cierre real no cambiaba los lifts. | Reproducción tagueada: cierre sintético → `closing_lifts.recamaras` **idéntico** ({1:1,2:-1,3:1,4:1,5:6}) antes y después; cero-residuo. | Fix: `materialize_closing_lifts` ahora agrega `real`={n,recamaras,precio} desde `copiloto_closings`; `score_devs` lo consume EN VIVO (umbral n≥3, nudge acotado). Reproducción: dev 5-rec/Premium **59.8→64.3 (Δ+4.5)** con 3 cierres reales de ese perfil; cero-residuo; harness 13/13. | **verified** ✅ |

### Audit B (independiente / adversarial) — convergencia
| id | sev | hallazgo del verificador | acción | re-verificado |
|----|-----|--------------------------|--------|---------------|
| B1-B1 | ✅ | acoplamiento de bandas idéntico · malformados manejados · sin div/0 · 1 sola I/O · sin huérfanos (6 checks) | — | confirmado correcto |
| B1-B2 | 🟠 | doble conteo: catálogo + real SUMAN | catálogo **se desvanece a la mitad** cuando `real_n≥3` (la verdad de campo manda) | Δ pasó +5.4→+4.5, sigue aprendiendo ✅ |
| B1-B3 | 🟡 | perf: `materialize` escanea TODO `copiloto_closings` por cierre+cron (blocker a 10k+) | **ventana de recencia 18m** (mejora señal + acota scan) · índice `closed_at_dt` → **B4** | scan acotado ✅ · índice deferred(B4) |

**B1 CERRADO.** F0-1 resuelto: el flywheel ahora aprende de cierres reales (recámaras+precio), acotado para que el gusto siga mandando. Archivos: `copiloto_flywheel.py` (materialize), `visitor_taste.py` (score_devs). Verificación triangulada: código + reproducción-dato + harness. Pendiente a B4: índice `copiloto_closings.closed_at_dt`.
