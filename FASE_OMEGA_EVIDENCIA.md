# FASE Ω — EVIDENCIA (Observabilidad + Financiero)

> Producida para cerrar el GATE que el manual exige y que quedó sin probar.
> Solo se EJECUTARON tests y se VERIFICÓ código existente — **no se editó código fuente**.

- **Repo:** `/Users/manuelacosta/Developer/desarrollos_mvp_emergent`
- **Commit:** `b475f5a9`
- **Fecha:** 2026-06-30 16:18
- **venv:** `scripts/.venv/bin/python3` (Python 3.11.15, pytest 9.0.3)
- **Backend:** FastAPI vivo en `:8000` (verificado con curl)

---

## 1) FINANCIERO — golden tests + reconciliación Decimal

### 1a. Golden tests financieros (output REAL)

```
$ cd backend && ../scripts/.venv/bin/python3 -m pytest tests/test_inversion_v4_finance.py -q
.....                                                                    [100%]
5 passed in 0.02s
```

```
$ cd backend && ../scripts/.venv/bin/python3 -m pytest tests/test_inversion_v4_tax.py -q
......                                                                   [100%]
6 passed in 0.01s
```

Verbose (11 casos, todos PASSED):

```
tests/test_inversion_v4_finance.py::test_irr_casos_cerrados PASSED
tests/test_inversion_v4_finance.py::test_irr_vs_numpy_financial_si_existe PASSED
tests/test_inversion_v4_finance.py::test_amortizacion_cierra_en_cero PASSED
tests/test_inversion_v4_finance.py::test_escenario_contado PASSED
tests/test_inversion_v4_finance.py::test_apalancamiento_negativo_y_equity_multiple PASSED
tests/test_inversion_v4_tax.py::test_tarifa_art152_punto_conocido PASSED
tests/test_inversion_v4_tax.py::test_resico_escalonado PASSED
tests/test_inversion_v4_tax.py::test_isr_renta_auto_elige_menor PASSED
tests/test_inversion_v4_tax.py::test_exencion_casa_habitacion PASSED
tests/test_inversion_v4_tax.py::test_pm_sin_exencion PASSED
tests/test_inversion_v4_tax.py::test_integracion_motor_mas_fiscal PASSED
============================== 11 passed in 0.02s ==============================
```

**Veredicto financiero (motor de inversión v4): VERDE.** IRR, amortización que cierra
en cero, escenario contado, apalancamiento negativo / equity multiple, tarifa Art.152,
RESICO escalonado, ISR renta (elige el menor), exención casa habitación, PM sin
exención, e integración motor+fiscal — todo PASSED.

### 1b. Reconciliación Decimal de comisión / IVA (create_operacion)

**No existe golden test dedicado de comisión/IVA** (los golden son del motor de
inversión, no de la liquidación de operaciones). Por eso se verificó manualmente la
reconciliación de `create_operacion` (`backend/routes/advisor.py:3148-3165`).

Lógica auditada (residual → suma exacta, sin descuadre de centavos):

```python
_cent = Decimal("0.01")
_q = lambda d: d.quantize(_cent, rounding=ROUND_HALF_UP)
comision_base   = _q(valor_cierre * comision_pct / Decimal("100"))
iva             = _q(comision_base * Decimal("0.16"))
platform_split  = _q(comision_base * Decimal("0.20"))
asesor_split    = _q(comision_base - platform_split)   # residual → suma EXACTA
comision_total  = _q(comision_base + iva)
```

Cálculo de muestra ejecutado (verifica `platform_split + asesor_split == comision_base`):

```
valor_cierre   pct   base       iva        platform   asesor     plat+ases  ==base?
   6500000.50     5  325000.03   52000.00   65000.01  260000.02  325000.03  True
  12345678.90   3.7  456790.12   73086.42   91358.02  365432.10  456790.12  True
 999999999.99  4.25 42500000.00 6800000.00 8500000.00 34000000.00 42500000.00  True
            1     1       0.01       0.00       0.00       0.01       0.01  True
   6450125.00   2.5  161253.13   25800.50   32250.63  129002.50  161253.13  True

Descuadres de centavos: 0
RECONCILIACION EXACTA: True
```

**Veredicto reconciliación: VERDE.** El split del asesor es **residual**
(`comision_base − platform_split`), por lo que `platform + asesor` suma EXACTO la
base en los 5 casos de muestra (incluyendo decimales feos y mínimos), 0 descuadres.
La misma liquidación Decimal se reutiliza en el endpoint de re-cálculo
(`advisor.py:3961-3971`), consistente.

---

## 2) OBSERVABILIDAD

### 2a. Exception handler global → `{detail, ref}`

`backend/server.py:1433-1444`:

```python
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    ref = uuid.uuid4().hex[:8]
    logging.getLogger("dmx.error").exception(
        f"[unhandled] ref={ref} {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500,
                        content={"detail": "Error interno", "ref": ref})
```

Verificación estática:
```
exception_handler(Exception) present: True
returns {detail, ref}:            True
```

- Loguea server-side con stack (`.exception`) + `ref` corto para correlacionar en
  logs/Sentry. Devuelve mensaje genérico (no filtra `str(e)`/paths/SQL → cierra
  ERR-DETAIL-LEAK). NO intercepta HTTPException ni validación (manejadas por
  Starlette/FastAPI; verificado: `GET /api/<ruta-inexistente>` → `HTTP 404
  {"detail":"Not Found"}` por el handler nativo).

### 2b. `services/safe_audit.py`

Existe (`backend/services/safe_audit.py`, 60 líneas) e **importa limpio**:
```
services/safe_audit.py importable: True
```
- En fallo de escritura de auditoría: `log.warning("[audit] perdido ...")` (NUNCA
  `except: pass` mudo) y continúa fail-soft.
- **No es huérfano:** wired en **81 callsites** (`grep -rn safe_audit` excluyendo su
  propia definición) — adopción real, no stub.

### 2c. Logging de rechazos de seguridad (CSRF / 403 / audit)

- **CSRF:** middleware `csrf_cookie_origin_guard` (`server.py:1360-1424`) loguea
  cada rechazo con `logging.warning("[csrf] bloqueado ...")` incluyendo método, path
  y origin; fail-closed en prod, fail-soft en dev. Helper `_csrf_reject` → 403 con
  `{code, message}`.
- **Rechazos de seguridad en general:** 108 líneas de `log.warning/error` con
  patrón 403 / denied / bloqueado / cross-tenant / unauthorized / csrf / audit
  (ej. anti-SSRF en renderers, tool no-pública bloqueada en asistente público, KG
  audit failed, ai_budget bloqueo por seguridad).

**Veredicto observabilidad: VERDE.** Existen y funcionan: handler global con `ref`,
safe_audit adoptado, y logging de rechazos de seguridad.

---

## 3) DEPLOY-READY

### 3a. `.gitignore` evita re-trackear venv y secretos

```
$ grep -nE "venv" .gitignore
1601:scripts/.venv/
1602:.venv/

$ git ls-files scripts/.venv        → (vacío)  venv NO trackeado
$ git ls-files backend/.env .env    → (vacío)  .env NO trackeado
$ git check-ignore scripts/.venv/lib/python3.11/site-packages/anthropic/  cv2/
  scripts/.venv/lib/python3.11/site-packages/anthropic/   ← IGNORADO
  scripts/.venv/lib/python3.11/site-packages/cv2/         ← IGNORADO
$ git status --porcelain scripts/.venv → (vacío)  limpio
```

Los paths `??` que aparecen en `git status` (anthropic/, cv2/, etc. dentro de
`scripts/.venv/lib/site-packages/`) **están cubiertos** por `scripts/.venv/` y
`git check-ignore` los confirma ignorados. `.env` / `.env.*` / `*.env` /
`credentials.json` / `*.key` / `.credentials` están en `.gitignore` (reglas
repetidas por cada subdir). Secretos fuera del código.

### 3b. Sentry/PostHog gateados por env (no rompen sin DSN)

`backend/observability.py` — `init_sentry()` (llamado antes de crear la app,
`server.py:20-22`):
- `SENTRY_DSN` vacío → log info + no-op stub (no rompe en dev).
- `SENTRY_DSN` con token en vez de URL → `log.error` y no-op (caso real detectado en
  auditoría, ya defendido).
- PostHog idéntico patrón (`POSTHOG_KEY` vacío → stub).

### 3c. Qué es DEPLOY-READY vs INFRA-ONLY

| Área | Estado | Nota |
|---|---|---|
| Motor financiero v4 (IRR/amortización/fiscal) | **DEPLOY-READY** | 11 golden PASSED |
| Reconciliación Decimal comisión/IVA | **DEPLOY-READY** | residual, 0 descuadres |
| Exception handler global `{detail,ref}` | **DEPLOY-READY** | registrado + no filtra detalle |
| `safe_audit` (no-swallow de auditoría) | **DEPLOY-READY** | 81 callsites |
| Logging rechazos seguridad (CSRF/403/audit) | **DEPLOY-READY** | 108 sitios + middleware CSRF |
| `.gitignore` venv/secretos | **DEPLOY-READY** | venv y .env no trackeados |
| Sentry/PostHog | **DEPLOY-READY (código)** · requiere `SENTRY_DSN`/`POSTHOG_KEY` en prod = **INFRA-ONLY** | el código stub-ea sin DSN; setear env en prod es paso de infra |
| **Backups de DB (Mongo)** | **INFRA-ONLY** | fuera del código; configurar snapshots/retención en el proveedor |
| Rotación de logs / retención centralizada | **INFRA-ONLY** | depende del runtime de deploy |

---

## VEREDICTO GLOBAL

**Financiero: VERDE** (11 golden PASSED + reconciliación Decimal exacta, 0 descuadres).
**Observabilidad: VERDE** (handler global con `ref`, safe_audit adoptado, logging de
rechazos de seguridad). **Deploy-ready: VERDE en código**; lo único pendiente es
**infra-only** — setear `SENTRY_DSN`/`POSTHOG_KEY` en prod y configurar **backups de
Mongo** (snapshots + retención en el proveedor). El venv y los secretos ya están
fuera del control de versiones.
