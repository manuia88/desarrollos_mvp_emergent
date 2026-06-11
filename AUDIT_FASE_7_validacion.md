# AUDIT FASE 7 — Validación de inputs e inyección
Fecha: 2026-06-10 · READ-ONLY

## RESUMEN EJECUTIVO
La validación de entrada es **fuerte en general**: ~140 archivos de ruta usan modelos Pydantic y los parámetros numéricos se acotan con `Field/Query` (gt/ge/le) en la capa de ruta (QA5 confirmó que la mayoría de inputs absurdos NO son alcanzables por HTTP). Inyección NoSQL: **bloqueada** (no hay `$where`/`eval`; los ids llegan como strings, no como dicts de usuario). XSS: React escapa por defecto y solo hay **2 usos de `dangerouslySetInnerHTML`** (bulletins). El riesgo real de esta fase es **prompt injection a la IA** (input crudo a prompts LLM) y **mass-assignment** no auditado exhaustivamente fuera de unit-fields.

**Conteo:** P0: 1 (prompt injection → cubierto a fondo en Fase 11) · P1: 1 · P2: 3

### [P1] Prompt injection — input de usuario crudo a prompts LLM
- **Ubicación:** `dev_batch11.py:762` (`unit_number`/`prototype`/`colonia` crudos → Claude), `studio_buyer_copy_engine.py:142/521` (`context_extra` + RAG crudos), argumentario (nombre de lead).
- **Evidencia:** sin sanitización por-campo ni cláusula "trata el bloque como datos, no instrucciones" en varios system prompts.
- **Impacto:** inyección directa/indirecta → manipular salida, fuga de prompt. Detalle, vectores OWASP-LLM y payloads → **Fase 11**.
- **Fix:** sanitizar (regex+cap) cada campo; system prompt defensivo; separar instrucción de contenido no confiable.

### [P2] `cus_manual=0` aceptado pero ignorado (validación permisiva)
- **Ubicación:** `routes/dev_valor_residual.py` campo `cus_manual` con `ge=0`; el motor (`valor_residual_engine.py:182`) hace `if cus_manual and cus_manual > 0` → trata 0 como "no enviado" y usa CUS default 3.0.
- **Impacto:** un dev que captura 0 (lote sin área construible) obtiene una oferta de ~$60M en vez de $0. Único caso route-reachable de valor absurdo.
- **Fix:** `gt=0` en el campo, o distinguir None (no enviado) de 0 (enviado).

### [P2] XSS potencial en bulletins (`dangerouslySetInnerHTML`)
- **Ubicación:** `frontend/src/pages/superadmin/SuperadminBulletins.js` y `frontend/src/pages/public/BulletinPage.js`.
- **Impacto:** si el contenido del bulletin se renderiza como HTML sin sanitizar y un usuario no-admin puede escribirlo → XSS almacenado en una página pública. Probablemente admin-only (riesgo acotado), pero NO verificado el sanitizado.
- **Fix:** sanitizar el HTML (DOMPurify) antes de renderizar; confirmar que solo superadmin escribe bulletins.

### [P2] File uploads — validación no exhaustivamente verificada
- **Ubicación:** uploads en `dev_assets.py`, `uploads_ie.py`, `routes/brochure.py`, `routes/documents.py`, `routes/dev_batch1.py/19.py`, `tour_3dgs_engine.py`, `studio_carrusel_engine.py`.
- **Estado:** varios validan tipo/extensión; NO se verificó uniformemente tamaño máximo, sanitización de nombre de archivo, ni si el almacenamiento queda público sin querer. Marcar para verificación dirigida.
- **Fix:** política única de upload (tipo allowlist + tamaño máximo + nombre saneado + storage privado por defecto).

### Mass assignment
- unit-fields: **bloqueado por allowlist** (`_build_unit_fields` solo arma campos conocidos; `role/owner_id/is_admin/tenant_id` no se pueden setear — verificado QA5). ✅
- Otros PATCH/POST (guardar/regenerar estudio, patch contacto, memo, snapshot): NO probados exhaustivamente para campos prohibidos → recomendado en Fase 11.

## LIMPIO (verificado)
- Inyección NoSQL por operadores ($ne/$gt/$where): bloqueada (params son strings; sin `$where`/`eval` en el repo). ✅
- Validación Pydantic amplia (140 route files con BaseModel; numéricos acotados con Field/Query). ✅
- React escapa por defecto; solo 2 `dangerouslySetInnerHTML` (acotados a bulletins).
- Path traversal en ids que arman rutas (PDF/storage): bloqueado (el id solo entra a queries/labels, no a `open()` — QA5).
