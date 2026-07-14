# AUDITORÍA DEL ANÁLISIS (auditar al auditor) — 2026-07-13

El founder pidió auditar mi propio mapa full-stack para ganar seguridad, granularidad y CERTEZA.
Hallazgo honesto: el mapa v1/v2 era estático (regex), sin verdad-del-servidor, con granularidad
de archivo y con falsos positivos de seguridad. Corregido con 5 mejoras y puntajes de certeza.

## MEJORA 1 · Verdad del servidor vivo (no regex)
Fuente de verdad = OpenAPI del backend corriendo: **1,753 rutas / 1,880 operaciones**.
Mi mapa estático parseaba 1,443 → **cobertura 82%**. Las 315 que faltaban se registran de forma
dinámica (routers incluidos en bucle, prefijos calculados) — NO son huecos, son límite del regex.
Certeza del inventario de endpoints: **ALTA** (ahora anclado a la verdad viva, no a mi parser).

## MEJORA 2 · Seguridad — mi "67 sin guardia" era 100% FALSO POSITIVO
Mi primer barrido no reconocía `_sa()`, `_get_user()+rol`, auth por token (`x-cron-token`),
ni delegación a función guardada. Al completar la lista de guardias: de 387 endpoints admin,
**373 con guardia (96.4%)**; los 14 restantes se leyeron A MANO uno por uno → **los 14 están
protegidos** (todos usan `_get_user`+check de rol, `_get_user_optional`, o delegan a una función
con guardia como `sync_apply`). **Cobertura real de auth admin: ~100%.**
→ GATE PERMANENTE creado: `tests/test_seguridad_rutas_admin.py` — truena si alguien agrega un
endpoint admin sin auth. Certeza de seguridad admin: **ALTA + protegida contra regresión**.

## MEJORA 3 · Cross-validación front↔back
709 referencias `/api/` en el front. **68 de 69 "llamadas fantasma" eran artefactos de
template-string** (mi regex cortaba en `${`); la única "real" (`/api/...`) es un placeholder.
Llamadas front a endpoints inexistentes: **efectivamente 0.** Certeza de cableado front→back: ALTA.

## MEJORA 4 · Granularidad POR ENDPOINT (no por archivo)
El mapa v3 baja de archivo-de-ruta a endpoint individual: cada uno con {método, guardia,
colecciones lee/escribe, motores}. 1,443 endpoints con esta ficha (mapa-v3-endpoints.json).

## MEJORA 5 · Zonas de incertidumbre declaradas (lo que el estático NO puede ver)
- **297 accesos dinámicos a colecciones** (`db[var]`, `getattr(db, ...)`) — invisibles al regex.
- **315 endpoints registrados dinámicamente** — viven (OpenAPI los ve) pero mi parser no.
- **1,108 endpoints "sin consumidor front"** — NO es código muerto: incluye APIs públicas (v1),
  webhooks, crons y endpoints que consume el front por rutas construidas dinámicamente.
Estas zonas quedan MARCADAS, no barridas — honestidad sobre lo que el análisis estático no prueba.

## MÉTRICAS DE CERTEZA (resumen)
| Dimensión | Antes (v1/v2) | Ahora (v3 auditado) |
|---|---|---|
| Inventario de endpoints | regex, sin verificar | anclado a OpenAPI vivo (1,753) · cobertura 82% + 18% marcado |
| Seguridad admin | "67 sin guardia" (falso) | ~100% guardado, verificado a mano + GATE anti-regresión |
| Cableado front→back | no medido | 0 llamadas rotas reales |
| Granularidad | por archivo | por endpoint (método/guardia/colecciones/motores) |
| Incertidumbre | oculta | 297 accesos dinámicos + 315 rutas dinámicas DECLARADOS |

## IMPACTO EN EL REBUILD UX
El Catálogo Vivo (Fase A) debe generarse de la VERDAD VIVA (OpenAPI + introspección del app),
no del regex — así cada card refleja el endpoint real, su guardia y sus datos. El gate de
seguridad se vuelve parte del CI del rebuild.
