# Verificación de Staging — Runbook Go/No-Go (DMX)

Antes de prender en producción, corre estos 4 pasos **contra STAGING** (nunca prod con tráfico real).
Núcleo de seguridad/correctitud = Tandas 1-18 (ver `memory/QA_FIX_CHECKLIST.md`).

---

## 1 · Pre-flight automático (1 comando) — empieza aquí

Verifica DESDE AFUERA que los fixes de seguridad se sostienen en el deploy (headers, rate-limit,
freno a fuerza bruta, auth obligatoria, webhook firmado). No necesita tokens ni 2 tenants.

```bash
python3 scripts/preflight_staging.py https://staging.desarrollosmx.io
# (local, para probar antes:  python3 scripts/preflight_staging.py http://localhost:8000)
```

Salida = tabla ✅/❌ + exit code (0 = GO, 1 = NO-GO). ⚠️ Deja una IP/email bloqueados ~5 min
(dispara logins fallidos a propósito). Verificado en localhost 2026-06-10: **8/8 GO**.

---

## 2 · Aislamiento multi-tenant (manual · necesita 2 tenants)

Lo que el pre-flight NO puede probar solo: que el Tenant A no lea/escriba datos del Tenant B.
Sigue `payloads_staging.md` con 2 usuarios reales (A y B) en tenants distintos + sus IDs de
proyecto/unidad. Esperado SEGURO en todos: **403/404** (nunca 200 con datos del otro).

Cubre: BOLA escritura inventario · CAS doble-venta (10 en paralelo → 1 éxito) · IDOR lectura
insights/battle-card/funnel · cadena Stripe→tier.

---

## 3 · Carga / escala (k6)

```bash
BASE_URL=https://staging.desarrollosmx.io STAGE_MAX=200 k6 run load-tests/dmx_load.js
```

Empieza CHICO (STAGE_MAX=200) y sube gradualmente. 10k VUs requiere k6 Cloud o máquina potente.
Caza fugas de memoria/recursos en el tramo sostenido. Revisa los TOS del hosting antes.

---

## 4 · Acciones de infraestructura del founder (no son código)

- [ ] **Mongo backups / point-in-time recovery** activados en Atlas (panel del proveedor).
- [ ] **SENTRY_DSN** real (URL) en el deploy — ✅ ya puesto.
- [ ] **JWT_SECRET / ADMIN_PASSWORD / STRIPE_WEBHOOK_SECRET** seteados en prod (el arranque
      ABORTA si faltan o usan el default — `_prod_env_guard`).
- [ ] **P2.16** · usuario Mongo de **solo-lectura** para superficies públicas (avm-public, api/v1,
      marketplace); read-write solo para portales autenticados. Código puede leer `MONGO_URL_READONLY`.
- [ ] **P3.5** · dedup del `.env` (claves DB_NAME/MONGO_URL/JWT_SECRET/ADMIN_* repetidas → dotenv
      usa la última; confirma que las copias tengan el MISMO valor).
- [ ] `DMX_ENV=prod` (o `production`) seteado para que el gate de prod-readiness aplique.

---

**Veredicto:** si pasos 1-3 dan verde y las casillas del 4 están marcadas → **GO**.
