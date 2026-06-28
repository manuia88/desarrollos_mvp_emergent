# Atlax · Espinazo de Aprendizaje (Learning Spine) — SPEC

**Fecha:** 2026-06-27 · **Rama:** `dev-redesign-tandas` (v2 oficial, NO tocar el merge) · **Estado:** EN CONSTRUCCIÓN

## Tesis
Atlax deja de ser un **buscador** y se vuelve un **copiloto que aprende**: guarda, rechaza, no repite, mejora solo,
junta la lista para seguimiento y la entrega caliente al asesor. El activo no es el buscador — es **el grafo de
gusto-y-rechazo por persona y por unidad**. Nadie en MX lo tiene porque nadie captura **el porqué del NO**.

**Regla maestra:** capturar el grano más fino (por foto, por segundo, por swipe, por motivo) **a nivel UNIDAD** (no
desarrollo) y que **cada señal cierre un ciclo y aterrice en superadmin**. CERO motores nuevos — todo reusa lo que ya
existe: `taste_profile.py`, `buyer_signals`, `swipe_public.py`, `favoritos.py`, `lead_match.py`, `casamentera.py`,
cubo OLAP, `superadmin_copiloto.py`, Studio/`virtual_staging`.

## A. Captura hipergranular (materia prima → buyer_signals)
| Señal | Grano fino | Revela |
|---|---|---|
| Impresión | unidad, posición(rank), sección, query | "se mostró #1 y NO se clickeó" = rechazo |
| Foto | qué foto, dwell por foto, zoom, regresos | qué le importa + si la imagen vende o mata |
| Tarjeta | abrió vista rápida, tiempo-a-click, comparó, compartió, re-entró | temperatura real (no declarada) |
| Veredicto | 👍/👎/guardar + **motivo** (fotos·precio·zona·tamaño·amenidad·entrega) | preferencia revelada + porqué del NO |
| Búsqueda | palabras crudas, cada filtro, qué se mostró, intención | demanda granular (ya existe) |
| Abandono | buscó, vio, se fue sin clickear | falló TODO el set |

## B. Qué aprende (el modelo de gusto + rechazo)
- Por característica: recámaras, m², banda de precio, **colonia gustada vs descartada**, amenidad, piso, vista, luz.
- Por tipo de foto: dwell en cocinas → le importa la cocina (`taste_profile` Capa-1, hoy solo asesor).
- Estilo visual: `photo_tagger` etiqueta renders → "le gusta moderno/minimal".
- Precio real: lo que CLICKEA vs lo que DICE → willingness-to-pay verdadero.
- **Perfil NEGATIVO:** qué rechaza y por qué (vale más que el like).

## C. Ciclos que cierra (6 loops)
1. Comprador→Gusto: cada interacción actualiza `taste_profile` → próxima búsqueda **rankea por gusto + excluye rechazado** (se automejora, no repite).
2. Gusto→Asesor: la lista + el perfil se entregan al asesor (sabe qué quiere sin re-preguntar — `lead_match` + Ficha360).
3. Motivo-rechazo→Dev: "fotos" en una unidad que SÍ encaja → "tu producto encaja, tus renders no venden — Studio".
4. Demanda→Superadmin/Dev: huecos (match perfecto rechazado por presentación + búsqueda sin oferta) → producto/precio.
5. Comprador→Casamentera: entra unidad que matchea un gusto guardado → "apareció algo para ti".
6. Cierre→Reentrena: cita/venta refuerza el modelo.

## D. Data privilegiada para superadmin (el moat)
- **Grafo del RECHAZO** por unidad/colonia (40% fotos · 30% precio · 20% zona). Los portales tienen vistas/leads; tú tienes el **porqué**.
- **Gap de presentación:** unidades que matchean demanda pero mueren en la imagen → fixeable + monetizable (Studio).
- **Sell/kill por FOTO:** "la foto #3 hace que se vayan; la #5 hace que guarden".
- **Willingness-to-pay real** por segmento/colonia.
- **Embudo por unidad** (impresión→foto→vista rápida→👍→guardar→cita) al cubo OLAP.

## E. Plan por fases (reuso · la más visible primero)
1. **👍/👎 + motivo + engagement por foto** → tarjeta + vista rápida → `buyer_signals` (like/dismiss+reason, photo_dwell, zoom). [Fase 1]
2. **No-repetir + rankear por gusto** → `searchAtlax` lee `taste_profile` + excluye descartados. [Fase 2]
3. **"Mi Lista"** (favoritos en Atlax) → `favoritos` + Ficha360 + handoff al asesor. [Fase 3]
4. **Cubo gusto/rechazo en superadmin** → extender `superadmin_copiloto` (como `atlax_*`). [Fase 4]
5. **Loop dev:** "tu producto encaja, tus fotos no" + botón Studio. [Fase 5]

## Reuso (verificado / por verificar)
- `buyer_signals` (espinazo público · types: view/ficha_view/like/save/dwell/photo_dwell/compare/share + atlax_query/atlax_profile).
- `taste_profile.py` (Capa-1 asesor_swipe_events: foto-dwell, regresos, detail-open, velocidad + explícito 👍/👎+motivo).
- `lead_match.py` (asesor_swipe_profiles.answers + swipes le_gusto/descartada+pass_reason → preferencia revelada).
- `swipe_public.py` (swipe público), `favoritos.py`, `casamentera.py`, `perfil_recomendar.py`.
- `superadmin_copiloto.buyer_cycle_intel` (ya lee atlax_query/atlax_profile/clicks).
- `create_buyer_lead`/`lead_bridge`/`mirror_lead_to_asesor_contacto` (handoff a asesor — ya cierra db.leads→asesor_contactos).

## Disciplina
Reuse-first, por fases, verificar en navegador, cero dato inventado, captura PII-safe (visitor_id + ip_hash + TTL).
v2 oficial; merge NO tocado. Backend surte efecto al desplegar.
