# CHECKLIST CANÓNICO DE COMPLETITUD — proyecto por proyecto, dev por dev

> Sintetizado de 3 agentes que mapearon línea por línea qué datos consume cada portal
> (2026-07-14). El motor que manda: `project_readiness()` — 10 checks × 10%, **publicable ≥80%**.
> Un proyecto no aprobado/incompleto = 404 para el comprador. Caso real: Almina = 20% (2/10).

## LOS 10 CHECKS DE PUBLICACIÓN (el gate del marketplace)

| # | Check | Pasa si | De dónde sale |
|---|---|---|---|
| 1 | Datos básicos | nombre + precio desde | lista de precios ✅ |
| 2 | Ubicación en mapa | lat/lng + colonia | Excel/geocoding ✅ (Almina lo pasó) |
| 3 | Amenidades | ≥3 | Excel maestro ✅ (Almina lo pasó) |
| 4 | Servicios | ≥1 (gas/agua/luz…) | ⚠️ pedir al dev (no viene en listas) |
| 5 | Sistema constructivo | cimentación declarada | ⚠️ pedir al dev |
| 6 | Formas de pago | ≥1 esquema | **PDF de precios ✅** (ya extraído: enganche/reservación/contrato) |
| 7 | Política comercial | configurada (brokers/comisión) | ⚠️ pedir al dev — LA CAPA DEL ASESOR |
| 8 | Fotos | ≥3 (fotos+assets) | Drive ✅ cosechadas (37, falta clasificar render/obra) |
| 9 | Docs legales | ≥1 doc o estatus aprobado | ⚠️ pedir al dev |
| 10 | Avance de obra | % > 0 | derivable (entrega inmediata = 100%) |

## LO QUE CADA PORTAL NECESITA (más allá del gate)

**MARKETPLACE (ficha vendedora)** — top 5 de impacto visual:
fotos/renders (el hero entero) · unidades ricas con plano por prototipo/unidad (`plano_url`) ·
esquemas de pago (el tab "me alcanza") · lat/lng+colonia (mapa, POIs, plusvalía, $/m² zona) ·
amenidades+servicios+sistema constructivo (30% del score). Patrón: hide-if-empty — lo que falta
desaparece en silencio; la ficha pobre = solo nombre y precio.

**PORTAL DEV (su cockpit funciona si…)**: proyectos PUBLICADOS (sin publicar → demanda en
blanco) · unidades con precio y estatus (pricing IA, margen, meses-para-agotar) · colonia_id
(battle card, AVM, estudio — y battle card pide ≥3 devs en la colonia + tier T3) · fotos con
portada (`role:cover`) · su onboarding propio: políticas de citas, equipo/brokers, docs.

**CAPA ASESOR (lo que vende)** — NADA de esto viene en listas de precios; lo llena el dev:
**comisión % + esquema de cobro** (el dato estrella) · contacto/WhatsApp del dev · políticas
(registro de leads, descuento máx, cobrokering, apartado y cancelación) · argumentos (qué
ofrecer, sellos constructivo/legal) · acceso whitelist por asesor. Sin esto el asesor ve
tarjetas sin nada accionable.

## CHECKLIST POR DESARROLLADOR (una vez por dev, no por proyecto)

☐ Mapeo en manifiesto (carpeta→dev) · ☐ Contacto comercial + WhatsApp · ☐ Comisión default % +
esquema/plazo/escalonada · ☐ ¿Trabaja con brokers? / in-house only · ☐ Políticas de citas ·
☐ Logo/branding · ☐ Datos de confianza (año fundación, entregados, sin PROFECO/judicial) ·
☐ Equipo/asesores propios · ☐ Link de reclamo de su cuenta (shell → claim).

## SCORECARD ALMINA (medido HOY) → PLAN DE LLENADO

**20% (2/10)** — pasó ubicación y amenidades. El plan, por quién puede llenarlo:

**YO (código/sesión, $0 — sin pedir nada):**
- #6 Formas de pago → materializar los esquemas YA extraídos del PDF a `dev_payment_schemes`
- #8 Fotos → clasificar las 37 imágenes cosechadas (render/obra/muestra) en sesión → públicas
- #10 Avance → ENTREGA INMEDIATA = obra 100%
- #1 Datos básicos → BUG de mapeo detectado: nombre+precio SÍ existen pero el readiness no los
  ve (la ingesta escribe en developments y el readiness lee el payload del wizard) — corregir
- Planos por unidad/prototipo → conectar los 158 planos cosechados a `plano_url` de sus unidades

**CLASS (pedirle una vez — checklist para mandarle):**
- #4 Servicios (gas/agua/luz) · #5 Sistema constructivo (cimentación/estructura) ·
- #9 Docs legales (RPP, licencias, régimen) · #7 Política comercial: comisión %, esquema de
  cobro, registro de leads, apartado/cancelación, WhatsApp comercial

**REGLA DE ESCALA**: este scorecard se corre AUTOMÁTICO al aprobar cada proyecto; el faltante
se convierte en checklist por proyecto + por dev (y en tareas del vigía/Telegram).
