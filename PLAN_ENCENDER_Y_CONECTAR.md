# Plan "Encender & Conectar" — Emergent_MVP con la vara de Fable5

> **Qué es esto.** El mapa maestro de ejecución para **prender, conectar y darle frontend** a todo
> lo que YA existe en emergent pero está apagado, desconectado o sin pantalla — aplicando las buenas
> prácticas de Fable5 (no reconstruir, no parche-sobre-parche: refactor + reordenar + cerrar círculos).
> Fuente: auditoría de 8 agentes sobre el código real (2026-06-15), medida contra el catálogo y la
> doctrina de Fable5 (`/Users/manuelacosta/desarrollosmx_fable5`).

Fecha: 2026-06-15

## Principio rector (la vara de Fable5 aplicada a emergent)

1. **Cero dato falso.** Nada de RNG/inventado en pantalla. Si falta fuente → "esperando-fuente" visible, nunca un número simulado.
2. **Círculo cerrado.** Cada feature: dato → cálculo real → API → **UI visible** → acción. Cero huérfanas.
3. **Un nombre canónico por concepto.** Reconciliar nombres contra el catálogo Fable5 (90/92).
4. **Refactor, no reescritura.** Emergent es el repo que se queda (Mongo). Fable5 = los aprendizajes y la disciplina.
5. **Verificar en el navegador** con datos reales antes de declarar "hecho".

## Resumen ejecutivo (qué encontramos)

Emergent tiene los **5 portales en producción** y supera con creces lo construido en Fable5 (que solo
llegó a E0-E2). Incluso tiene la **"joya" AVM** (valuador hedónico real) que el plan Fable5 cree pendiente.
El trabajo NO es construir: es **encender lo apagado y conectar lo huérfano**, limpio.

| Estado | Aprox. | Qué significa |
|---|---|---|
| 🟢 WIRED (completo) | ~70 | Ya cierra el círculo. No tocar. |
| 🔌 FLAG-OFF (prende con deploy, ~0h código) | ~10 | **El mayor valor por el menor esfuerzo.** |
| 📺 PÁGINA-SIN-MENÚ | ~20 | Existe y funciona, solo falta entrada de menú/footer. |
| 🔧 API-SIN-UI / host huérfano | ~21 | Endpoint real, falta la pantalla. |
| ⚙️ MOTOR-SIN-API | ~17 | Motor real, falta endpoint + UI. |
| 🟥 DATO-FALSO / RNG | ~6 | **De-falsear primero** (viola la regla #1). |
| 🕳️ ENDPOINT-HUÉRFANO | ~20 | Sin consumidor; conectar o borrar. |
| ⚰️ MUERTO (borrar) | ~6 | Legacy superseded. |
| 🏗️ POR CONSTRUIR (moat) | LIV + N01-N11 + marca de índices | Lo único realmente nuevo. |

### Correcciones honestas (el plan Fable5 estaba desactualizado en esto)
- **El AVM SÍ existe y está conectado** en emergent (`avm_public_engine` + `hedonic_regression_engine`, `/api/avm-public/*`). El Mapa Maestro de Fable5 lo da por pendiente — es trabajo de emergent que no se había contabilizado.
- `simulador_palancas`, `bancabilidad`, `norma3`, `shf` **NO son blockers** — están WIRED (endpoints embebidos en otros routers).
- Los ~10 `conversation_*` que parecían huérfanos **no lo son** — los compone `conversation_engine.py` en cada chat.
- Faltan de verdad: el índice **LIV** (no existe), reconciliar **MOM vs IDM**, y los **N01-N11** completos.

---

## Las tandas (orden de ejecución)

### TANDA 0 — Honestizar + blindar (prerequisito, ~1-2 días)
*Por qué primero: Fable5 exige "nada falso en pantalla" y "fail-closed". No se prende nada en prod con datos falsos o puertas abiertas.*

| Item | Archivo | Acción | Esf. |
|---|---|---|---|
| Borrado ARCO/LFPDPPP a colección fantasma | `compliance_engine.py:180,206` | `asesor_contacts`→`asesor_contactos` + test cero-PII | 15min |
| 2 fail-open de tenant | `tenant_scope.py:77,125` | `[:2]`→denegar; lead-sin-owner→403; quitar developer_admin del auto-registro | 1h |
| `llm_guard` fail-OPEN | `services/llm_guard.py:35` | propagar fail-closed | 30min |
| Kill-switch global de IA | (no existe) | flag `AI_DISABLED` que corta todo gasto LLM | 1h |
| **De-falsear 5 RNG** | `buyer_score_engine.py:57,62` · `social_ads_engine` · `TeamAggregatedTable.js:263` · `AccuracyTopZonesTicker.js:91` · `ConfianzaPage.js:263` | quitar jitter/RNG → esperando-fuente honesto o quitar | ~2h |
| **Gobernanza IA obligatoria** | ~45 callsites LLM | forzar UN guard único (budget+quota+kill-switch) antes de gastar; cerrar primero el chat público Atlax | medio |

**DoD:** cero RNG en pantalla; el borrado purga el CRM real; toda llamada LLM pasa por gobernanza fail-closed.

### TANDA 1 — Prender lo FLAG-OFF (deploy, ~0h código + verificar)
*El mayor valor por el menor esfuerzo. Requisito: Tanda 0 (gobernanza IA) lista, porque esto prende IA en prod.*

| Item | Flag | Cómo |
|---|---|---|
| **Cerebro DMX completo (E0-E6)** — Sala de Control dev/asesor/comprador + aprendizaje | `CEREBRO_ENABLED` | var de entorno en prod |
| **Suite agéntica CRM** (routing/reply/nurture/DISC/argumentario) + 5 agentes | `agentic_enabled` por org | toggle superadmin ya existe (`PhaseYControlsPanel.js`) |
| Director agent (dev) | `REACT_APP_DEVELOPER_DIRECTOR` | flag deploy |
| WhatIf + FichaHome (corona "jugada de hoy") | `REACT_APP_DEV_V2` | flag deploy |
| Rediseño Developer V2 | `REACT_APP_DEV_V2` | flag deploy (ya validado en local) |

**DoD:** cada uno verificado en el navegador logueado, con datos reales, sin errores de consola.

### TANDA 2 — Exponer lo escondido (menú/footer, ~1-2 días)
| Item | Acción | Esf. |
|---|---|---|
| Footer público "Herramientas" (11 piezas: Simulador, Tax Projector, Comparador, Probability, Vibe Quiz, Climate, Confianza, Barrios, MCP…) | 1 footer + links | ~5h |
| 9 páginas superadmin sin menú (RAG Inspector, FSD Accuracy, Conversation Cost, Climate, Virtual Staging, User Diagnostics, System Map, Invites, Entity Resolution) | agregar a `navByRole.js` | ~2h |
| Pantallas Dev huérfanas al menú (Probability, Demanda Demográfica, Generador Producto, Reverse Search, Gov Data MX) | agregar al menú | ~2h |
| Borrar rutas muertas (`dashboard-legacy`, `audit-log-legacy`, `ie-engine-sources`, 2 conversation orphans) | limpieza | ~2h |

### TANDA 3 — Darle frontend a lo API-SIN-UI (por valor, ~1-2 sem)
| Item | Acción | Esf. |
|---|---|---|
| **Tax Projector → calculadora de impuestos** (ISR/ISAI/predial 2026, ORO) | pantalla en cierre/ficha | M |
| Índices DMX (los 6) en la ficha pública/Dev (hoy solo en superadmin) | card "IPV 7.4%" | M |
| Score Inversión / IRE → ranking de colonias | widget en marketplace/ficha | S |
| Entity Resolution → panel dedup en Leads (ORO, 8 capas) | panel | M |
| Modo Piloto (auto_pilot) → toggle "auto" | en AsesorAgentsPage | 3-4h |
| Smart routing → host page asesor | route + host | 2-3h |
| Sub-agents (lead/marketing/pricing) → hub visible | sacar del drawer superadmin | 4-6h |
| Investment Simulator en portal comprador | página `/comprador/inversion` | 3-4h |
| Studio buyer-copy (7 personas × DISC, ORO huérfano) | cablear desde CopyGenerator | 4-6h |
| Pricing A/B (`dev_batch5`, 7 endpoints) → Dynamic Pricing real | wire a Pricing Lab con "Aplicar" | M |
| KG Anomalies (componente existe) + Transaction price-index heatmap | cablear | 4-6h |

### TANDA 4 — Conectar los MOTOR-SIN-API (~1-2 sem)
avm_explain/avm_feature ("por qué este valor") · absorción/days-to-sellout (KPI #1 del dev) · comparator Dev · comercial_value · valores_unitarios · price_context · comparable_anomaly · construction_cost · predio_due_diligence · lote_veredicto · captacion_value · ownership_economics · model_validation · golden_calibration. *(Endpoint + UI, círculo cerrado, el ciclo RS/4S del developer.)*

### TANDA 5 — Activos B2B monetizables (el moat vendible, ~1-2 sem)
- **API pública v1 self-service** (14 endpoints `/api/v1/*` ya corren; control-plane de keys ya existe) → portal de developer + pricing público. "El Stripe del real estate". ~8-12h.
- **4 productos verticales** (Bank-AVM / Insurance-Risk / Notaría-Title / Investor-Yield) — endpoints + widgets ya funcionan → página comercial + panel. ~4h.
- **MCP Server público** (runtime headless completo) → linkear `/connect/mcp` en footer/prensa. Canal de distribución a LLMs. ~1-2h.

### TANDA 6 — De-stub: conectar fuentes/llaves (cuando lleguen)
Apify (trends MOM, buyer_score) · ELEVENLABS (voz Atlax) · ENVIPE (perception risk) · DRPI (liquidez de zone_score) · Neo4j (Knowledge Graph) · llaves de external_insights (10/12 fuentes). *Build-for-end-state ya hecho; solo conectar.*

### TANDA 7 — Crear el moat que falta (E6 de Fable5)
**LIV** (livability personalizado por perfil) · **N01-N11** (gentrification velocity, walkability MX, school premium, water security, employment accessibility, senior livability…) · reconciliar nomenclatura **MOM vs IDM** · capa de marca de los 7 índices (cards estilo FICO/Walk Score).

---

## Recomendación de arranque

**Tanda 0 → Tanda 1.** En ~3-4 días dejamos emergent honesto y blindado, y prendemos el mayor valor
(Cerebro + suite agéntica + rediseños) que hoy está a un flag de distancia. Todo lo demás (Tandas 2-7)
es cableado incremental, una pieza a la vez, verificada en el navegador.

---

## Estado de ejecución

### ✅ TANDA 0 — CERRADA (2026-06-15, verificada por QA adversarial)
- De-falseados los 5 puntos de RNG (3 sparklines + `buyer_score` dim Apify + `social_ads` etiquetado "demo").
- Borrado ARCO/LFPDPPP corregido (`asesor_contacts`→`asesor_contactos`): ahora purga el CRM real del asesor.
- 2 fail-open de aislamiento cerrados (`tenant_scope`: fallback `[]` y lead-sin-dueño → 403 en prod; demo intacto vía `DMX_DEV_MODE`).
- Kill-switch global de IA (`AI_DISABLED` env + `platform_config.ai_kill_switch`) + `llm_guard` y chat público Atlax a **fail-closed**.
- QA adversarial: 29 pruebas de hardening IA ✅ + redteam ✅, cero regresiones, cero RNG escapado.
- **Backlog (menor):** toggle del kill-switch por-DB desde la UI de superadmin (hoy el corte duro `AI_DISABLED` por entorno ya funciona) → se cablea al prender la gobernanza de IA en Tanda 1.

### Nota de secuencia para TANDA 1
Antes de prender la IA **pública** en prod conviene un mini-chunk de **gobernanza obligatoria** (rutear las
llamadas LLM dispersas por el guard único) para que el apagador y los topes cubran TODO. Los flags **internos**
de bajo riesgo (Cerebro, Director, rediseño Dev V2) pueden prenderse antes.
