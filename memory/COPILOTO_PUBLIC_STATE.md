# Copiloto de Compra (Portal Público del Comprador) — Estado Canónico

**Última actualización:** 2026-06-18 · branch `dev-redesign-tandas`
**Qué es:** el portal público donde el comprador busca, guarda, agenda y se vuelve lead — el "departamento muestra del
ciclo del lead" del lado comprador. Construido end-to-end, auditado y verificado en esta sesión. **Cero deuda.**

---

## 1. Buscador unificado (UNA sola entrada)
- La **barra de búsqueda + los filtros de arriba** son la ÚNICA vía (el viejo modal "Perfilador" de 4 pasos se RETIRÓ
  y se fundió aquí · `frontend/src/components/marketplace/Perfilador.js` borrado).
- 4 datos obligatorios: **zona · precio · recámaras · m²**. El gate son 4 PREGUNTAS; tocar una **abre el control
  correcto arriba** (`openToken`/`openNonce` en `TopFilters.js` → Popover). La barra IA pre-llena lo que entiende.
- Escribes libre (ej. "depa 2 rec roma máx 12M 80m2") → IA parsea → resultados. "Nueva búsqueda" reversible.
- Safe-limit del LLM: rate por IP + tope global diario + cache 24h (en `routes/public.py` search-ai).

## 2. Unit-aware + financiero real
- Separa lo INTERNO del depto (recámaras/baños/m²/precio/feature) — matcheado contra las UNIDADES reales disponibles —
  de lo del EDIFICIO (amenidades). Muestra el proyecto pero NOMBRA las unidades que cumplen (#02A).
- enganche/mensualidad calculados del **esquema de pago REAL del dev** (`payment_schemes.compute_breakdown` ·
  `dev_payment_schemes`). `_unit_finance/_unit_ok/_unit_card` en `public.py`.

## 3. Etapas (solo 2) + plazo
- `_norm_stage(stage, delivery)`: de cara al comprador solo **PREVENTA** o **ENTREGA INMEDIATA**, clasificado por la
  FECHA de entrega (entrega ya/pasada = inmediata · futura = preventa). Nunca "preventa · entrega ya".
- La tarjeta muestra la temporalidad de preventa (<3 / 3-6 / 6-12 / +12 meses).
- Filtro de **plazo** ya filtra en el backend (`_plazo_ok`) — antes se mandaba y se ignoraba (cable muerto).

## 4. Favoritos + Casamentera (las dos caras)
- **Favoritos** (`routes/favoritos.py`): por `visitor_id` anónimo. Like/guardar/cita/nota + unidad guardada (#02A).
- **Las dos caras:** al volverse lead, todo (favoritos + citas + notas + **unidades**) se espeja al tablero Ficha360
  del asesor (`mirror_favoritos_to_board`). **Auto-reparable:** si el asesor se activa después, se reproduce solo
  (`_replay_favoritos` en `retry_pending_mirrors` + `backfill_owner`).
- **Casamentera** (`routes/casamentera.py`): "te avisamos cuando entre inventario". RECONECTADA — guardar búsqueda
  escribe en `marketplace_searches {alert:True}` (la colección que escanea), antes iba a otra colección (cable muerto).
  **Cron horario** (`scheduler_casamentera.py`) escanea búsquedas × inventario → `buyer_alerts` + WhatsApp (si dejó
  teléfono) + rastro en el CRM.

## 5. Demanda insatisfecha (cierra ciclo comprador → dev/superadmin)
- Búsqueda COMPLETA en zona cubierta SIN nada que cumpla = HUECO de producto exacto. Capturado en `/casi`
  (`demanda_insatisfecha`, dedup visitor+criterios+día).
- **Superadmin:** cubo `buyer_cycle_intel.demanda_granular.demanda_insatisfecha` (GustoMercado › Demanda fina).
- **Dev:** `GET /api/desarrollo/{id}/demanda-zona` → panel `ZoneDemandGapPanel` en Insights › Engagement
  ("X personas buscaron esto en tu zona y no hay nada → qué construir/precio").

## 6. Alto intento → lead (definición founder)
**Crean lead con perfil completo** (idempotente por visitor_id · `create_buyer_lead`):
- Agendar · contactar/WhatsApp · cotizar · desbloquear lista → vía login en gate → `/api/buyer/promote`.
- **Guardar búsqueda + email** → el endpoint saved-search llama `create_buyer_lead`.
- **Mucha actividad (conducta)** → no crea lead sin contacto, pero marca el lead **CALIENTE** (≥3 likes o ≥8 vistas)
  en cuanto deja contacto.
**NO crean lead:** login casual del header · dar ❤️/favorito (solo alimenta recomendaciones).
El lead lleva el perfil (zona/precio/rec/m²/amenidades/lo que likeó-vio) + temperatura por conducta.

## 7. Asignación inteligente de leads públicos (founder: "inteligente + admin supervisa")
`resolve_public_lead_owner` (en `lead_bridge.py`):
1. **Afinidad** — si un asesor de la casa cubre la zona o el proyecto que al comprador le interesó → a ese asesor.
2. **Round-robin** — si no, al asesor con menos leads activos (reparto justo, sin cuello de botella). Instantáneo.
3. El **admin de la casa siempre recibe aviso** (`notify_house_admin_new_lead`, prioridad alta si caliente) y puede
   reasignar. Si aún no hay asesores activados → lead reclamable + aviso al admin.

## 8. Title Case inteligente + Seguridad + Auditoría
- **Title Case** (`lib/titleCase.js` `tc()`): mayúscula en palabras significativas, minúscula en de/la/los/y/te/se…
  Aplicado a los TÍTULOS de TODO el portal público (~27 archivos). No toca datos/frases/botones.
- **Seguridad:** /cita y /nota solo aceptan lead_id del propio visitante · `/casamentera/correr` con token (fail-closed)
  · rate-limit por IP en escrituras públicas (`services/ratelimit.py`) para no envenenar el cubo de demanda.
- **Auditoría (4 agentes + verificación propia):** todos los 🔴/🟡 arreglados. Sin inyección NoSQL · PII no se filtra
  (colecciones anónimas guardan hash).

---

## ⚙️ PASOS DE CONFIG/DEPLOY PARA PRENDERLO (NO es código — los hace el founder)
1. **Activar los asesores REALES de la casa** (ligar `inmobiliaria_internal_users` de la inmobiliaria system-default
   a cuentas reales con `user_id`, `role:asesor`, `status:active`). Sin esto, los leads se crean con perfil pero
   quedan **reclamables** (no caen a un tablero). Opcional: ponerle `zonas`/`projects` a cada asesor → se activa la
   afinidad (el de Roma recibe los de Roma); sin eso, round-robin parejo.
2. **`CASAMENTERA_CRON_TOKEN`** (env) — solo si además quieres disparar `/api/casamentera/correr` desde fuera; el cron
   interno horario ya corre sin token.
3. **Limpiar cuentas demo `casa1@desarrollosmx.io` / `casa2@desarrollosmx.io`** ("Asesor Casa Uno/Dos", role advisor,
   creadas 2026-06-11 en pruebas · NO son asesores reales). Se usaron solo como maniquíes de verificación.
4. Cerebro sigue detrás de flag (`CEREBRO_ENABLED` solo en `.env.local`).

## Archivos clave
- Backend: `routes/public.py` (búsqueda/casi/stage/plazo/demanda) · `routes/favoritos.py` · `routes/buyer_signals.py`
  (signals/elasticidad/embudo/demanda-zona/registrar/promote/`create_buyer_lead`) · `routes/casamentera.py` ·
  `routes/external_search.py` (saved-search→casamentera+lead) · `routes/superadmin_copiloto.py` (cubo) ·
  `services/lead_bridge.py` (asignación inteligente + espejo + auto-reparable) · `services/ratelimit.py` ·
  `scheduler_casamentera.py` · `payment_schemes.py`.
- Frontend: `pages/Marketplace.js` · `components/marketplace/TopFilters.js` · `DevelopmentCard.js` ·
  `SaveSearchModal.js` · `pages/DevelopmentDetail.js` · `components/dev/PriceListTab.js` · `pages/Favoritos.js` ·
  `lib/{unitMatch,titleCase,buyerSignal}.js` · `pages/superadmin/GustoMercado.js` ·
  `components/developer/insights/{UnitFunnelPanel,ZoneDemandGapPanel}.js`.

## Verificado E2E (2026-06-18)
Anónimo (likes) → buscar + "Guardar búsqueda" en la app real → **lead caliente con perfil** → asignado al receptor →
**contacto + favoritos en el tablero del asesor** → búsqueda lista para la casamentera. Login en gate → promote → lead.
Idempotente (un comprador = un lead). Asignación: Roma→afinidad · sin afinidad→round-robin. Todo el dato de prueba
borrado.
