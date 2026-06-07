# DMX · PLAN MAESTRO DETALLADO (estado + pendientes · fuente única)

**Actualizado**: 2026-06-07 · Absorbe MASTER_BUILD_ORDER + Tandas de fundamentación + status de waves/F/B/tiers/Cerebro.

**📍 DÓNDE ESTAMOS:** terminando el **AVM** (fundamentación de datos) → en **Tanda B**. Al cerrar el AVM, retomamos por el **BLOQUE 1** (portal del Dev, Paso C).

**Leyenda:** ✅ hecho · 🟡 en curso / siguiente · ⏳ pendiente · 📦 diferido (espera dato/escala) · ❌ cancelado

---

## 1. TIERS (acceso por usuario/feature) — todos VIVOS ✅
| Tier | Quién | Estado |
|---|---|---|
| T0 | Público (comprador, asistente, widgets embed) | ✅ |
| T1 | Asesor básico | ✅ |
| T2 | Asesor premium (plantillas, workflows, Live Pulse) | ✅ |
| T3 | Desarrollador | ✅ |
| T4 | Superadmin | ✅ |

**Feature Visibility (W5.FF1-FF6)** ✅ — cada función tiene tier mínimo; quien no califica, no la ve. Flag `REACT_APP_FEATURE_VISIBILITY_ENABLED`.

---

## 2. 📍 EL AVM / FUNDAMENTACIÓN DE DATOS (Tandas) — donde estamos parados

### Tanda A — Honestidad ✅ CERRADA
| Chunk | Qué | Estado |
|---|---|---|
| A.1 | Tasas oficiales vivas (`banxico_rates.py`: TIIE 6.6554%, hipoteca CF303 11.46%) | ✅ |
| A.2 | `investment_simulator` lee de fuente única (no hardcode) | ✅ |
| A.3 | Live Pulse: el score solo cuenta señal real (fin del trend sintético) | ✅ |
| A.4 | `dmx_demand` / `state_of_cdmx`: fallbacks marcados "estimado", sin ROI inventado | ✅ |
| A.5 | AVM homologación conservadora (NMX-459/Ross-Heidecke, no salta 20%) | ✅ |
| A.6 | Precio en Contexto: obra nueva vs comparable, bandas neutras | ✅ |
| A.7 | Flywheel asesor→AVM (captaciones → referencia de reventa) | ✅ |
| A.8 | Tokens reales + 3 resource_ids CDMX verificados + bug `.env.local` arreglado | ✅ |
| A.9 | Doc canónico `DATA_SOURCES.md` + push | ✅ |

### Tanda B — Señales Honestas 🟡 SIGUIENTE
**Meta:** ningún número inventado se ve como medición exacta → todo índice se muestra como **banda** (Bajo/Medio/Alto) + "señal DMX, no medición" + confianza. Deja la base lista para BLOQUE 2.
| Chunk | Qué | Front/Back | Tamaño | Estado |
|---|---|---|---|---|
| B.1 | Regla central `metric_normalizer` (percentiles reales → bandas) + 5 índices DMX honestos + sello `SenalDMX` en dev V2 + DENUE unificado (3000/500→500) + 12 tests | Back+Front | S | ✅ **hecho 2026-06-07** |
| B.1 nota | Las bandas son RELATIVAS a la población comparada (hoy 16 colonias premium del seed → zonas premium pueden salir "Media/Baja" entre sí). Honesto + leyenda lo explica. Mejora: ampliar el set de colonias (dato) para una distribución más representativa. | — | — | ⚠️ a afinar en B.2 |
| B.2 | Pasar por la regla los índices inventados: demanda, plusvalía/gentrificación (D05), calidad de zona, ciclo de mercado (B05), 5 índices DMX (IPV/IAB/IDS/IRE/ICO), score inversión, fit/match. Cada uno expone banda + "señal DMX" + confianza. | Back | M | ⏳ |
| B.3 | Un solo sello visual honesto en lenguaje normal ("Demanda: Alta", no "69/100"), aplicado en los 4 portales. | Front | M | ⏳ |
| B.4 | Verificar: test del normalizador + barrido de números crudos + revisión logueado en la app real. | Ambos | S | ⏳ |

### Tanda C — Valuación afinada ⏳ (parte depende de ingesta)
| Chunk | Qué | Estado |
|---|---|---|
| C.1 | AVM anclado a **cierres reales** (`on_deal_closed` ya cableado), no solo captaciones — lección Monopolio/DD360 | ⏳ |
| C.2 | **Guard de atípicos** en captación: precio fuera de rango vs colonia → etiqueta "fuera de rango" (no borra) + sello de confianza | ⏳ |
| C.3 | Mezcla de comparables estilo 4-fuentes (obra nueva + usada + cierres + base propia) con confianza | ⏳ |
| C.4 | Afinar avm fallback / price_context / margin contra comparables reales (percentiles, no topes) | ⏳ |

### Ingesta de datos oficiales ⏳ (ancla/piso del AVM)
| Chunk | Qué | Estado | Nota |
|---|---|---|---|
| ING.1 | SIG WFS predios (`vsuelo` $/m²) → poblar `catastro_cdmx` (hoy 0) | ⏳ | upgrade de "manual" a API |
| ING.2 | Valores unitarios 2026 (Gaceta/Código Fiscal: $/m² suelo + construcción por zona) | ⏳ | tabla oficial, carga 1 vez/año |
| ING.3 | SHF índice plusvalía (INEGI BIE serie 736183 / Banxico SIE — token ya puesto) | ⏳ | quick-win |

---

## 3. DESPUÉS DEL AVM — Orden Maestro (Bloques 1-5)

### BLOQUE 1 — Terminar portal del Dev (Paso C) · va primero
| # | Qué | Tamaño | Estado |
|---|---|---|---|
| 1.0 | C.1.0 Lista = centro de mando | — | ✅ hecho |
| 1.1 | Inicio del dev — cerrar los 4 upgrades a medias | S | ⏳ |
| 1.2 | CRM & Leads — Embudo · Leads · Ficha (reusar board Mis Leads del asesor) | M | ⏳ |
| 1.3 | Inteligencia del dev — bajar inteligencias Dev-Master filtradas a SUS proyectos | M | ⏳ |
| 1.4-1.7 | Pricing (Tabla·Lab) · Red Comercial · Marketing · Reportes/Finanzas | M c/u | ⏳ |

### BLOQUE 2 — Quick-wins de dato real (Tier 1 catálogo) · *reusa Tanda B*
| # | Qué | Tamaño | Estado |
|---|---|---|---|
| 2.1 | B08 Absorción real (hoy random sintético → reusar motor Stock/Sold-Out) | S | ⏳ |
| 2.2 | B05 Market Cycle · D05 Gentrificación · D07 renta corta/larga (campos ya en schema) | S–M | ⏳ |
| 2.3 | I04 los 5 índices DMX (componer IPV/IAB/IDS/IRE/ICO sobre scores que ya hay) | M | ⏳ |
| 2.4 | Conectar recipes "DataPending" (escuela/salud/agua/Locatel: setear resource_id) | S | ⏳ |

### BLOQUE 3 — Endurecer el Dev (antes de uso multi-dev real)
| # | Qué | Tamaño | Estado |
|---|---|---|---|
| 3.1 | Aislamiento entre desarrolladoras (cada endpoint filtra por dev_org — riesgo #1) | L | ⏳ |
| 3.2 | Atomicidad (reserva de unidad sin doble-reserva) + índices | M | ⏳ |
| 3.3 | QA "día del desarrollador" + red-team de aislamiento | M | ⏳ |

### BLOQUE 4 — Completar catálogo + pulido
| # | Qué | Tamaño | Estado |
|---|---|---|---|
| 4.1 | Tier 2 (calculadoras comprador: renta-vs-compra, arbitraje, TCO, precio justo; Portfolio Optimizer) | M–L | ⏳ |
| 4.2 | B13 Amenity ROI real · B04 PMF · B10 Unit Revenue · B14 Buyer Persona · B15 Launch Timing | M–L | ⏳ ← *íbamos aquí cuando salió el AVM* |
| 4.3 | Asesor P6 (pulido fino: tokens, mobile, onboarding, accesibilidad) | M | ⏳ |
| 4.4 | Tier 3 (necesitan fuente nueva: tráfico real, crédito, patrimonio, due diligence) | L | ⏳ |

### BLOQUE 5 — Prender (deploy/ops, no código) · al final
- ⏳ Llaves: OpenAI (visión fotos) · WhatsApp (conversaciones) · gov (GTFS/DENUE/Atlas) · link Tinder al comprador
- ⏳ Subir flags DEV_V2 / COMMAND_CENTER a usuarios reales

---

## 3.5 EXPANSIÓN · Colonias y Ciudades (nuevo track · 2026-06-07)
**Por qué importa:** hoy hay solo **16 colonias CDMX curadas a mano** (scores a mano). El motor ya es por-zona y data-driven; expandir = **alimentar**, no reprogramar. Más colonias también arregla las bandas relativas de B.1 (distribución representativa).
| # | Qué | Estado |
|---|---|---|
| EX.1 | Cargar catálogo oficial de colonias CDMX (INEGI/SEDUVI: nombre+polígono+centro) → de 16 a ~1,800 | ⏳ |
| EX.2 | Correr recetas por colonia con fuentes ya conectadas (FGJ/DENUE/SACMEX) → scores REALES (no a mano) | ⏳ |
| EX.3 | Agregar dimensión **`city`** al modelo (colonias·proyectos·scores·distribuciones·percentiles por ciudad) — build for endstate | ⏳ |
| EX.4 | Percentiles/bandas **por ciudad** (Querétaro vs Querétaro) — cierra el caveat de B.1 | ⏳ |
| EX.5 | Conector de dato local por ciudad (Jalisco IIEG · NL · Querétaro · Yucatán · QRoo); lo NACIONAL (INEGI/DENUE/SESNSP/Banxico/SHF/CENAPRED) ya cubre todo MX | ⏳ |
| EX.6 | Rollout por mercado: CDMX completo → Guadalajara → Monterrey → Querétaro → Mérida → Playa del Carmen | ⏳ |

## 4. LO YA CONSTRUIDO (contexto · no reconstruir)

### Waves
| Wave | Qué | Estado |
|---|---|---|
| W1 Foundation + Authority | base + seeds | ✅ cerrada |
| W2 Commercial + Intelligence Hub | comercial + cubo Z | ✅ cerrada |
| W3 Authority + Verticals + Risk + IE Engine | verticales + riesgo + motor IE | ✅ cerrada |
| W4 Agentic + Brand + Studio (Phase Y) | agentes + Studio + WhatsApp + Atlax + Buyer Coach | ✅ mayormente · ⏳ ~35h polish (W4.15.2-3 + buffer) |
| W5 Analytics + Asesor Redesign | AVM ML, Zone Score, Forecast, Live Pulse, KG, FSD, Battle Card, Studio Landing Z.1-8, Asesor Redesign | ✅ shipped (~1000h+) |
| W5.9 Climate Migration | — | 📦 diferido (Apify upgrade) |
| W6 Compliance/Multi-moneda/Legal | — | 📦/⏳ sketch (ver §5) |

### Cerebro DMX (Agentic IA) — E0-E6 ✅ 7/7 VERIFICADAS
E0 cimientos · E1 orquestador · E2 ejecutores reales · E2.5 catálogo+personalización · E3 Sala de Control · E4 loop aprendizaje · E5 equipo rojo · E6 loop developer. **Apagado por flag** `CEREBRO_ENABLED` (prender = decisión founder). Backlog menor: debounce retrain · close_prob por-lead · network/lookalike (esperan escala).

### Los "F" (lotes de limpieza de Wave 4)
| F | Qué | Estado |
|---|---|---|
| F0.1 | Limpieza + bugfixes | ✅ |
| F0.2 | Mejoras (digest semanal, leaderboard, brochure, funnel auditoría, cron pre-cómputo) | ✅ |
| F0.3 / F0.4 | Resto tech-debt (~50h) | ⏳ |
| F6 | Era impuestos IVA/ISR | ❌ cancelado (duplicaba otro batch) |

> Nota: el proyecto NO usa F1-F11 como orden de batches. Usa W5.X / W6.X / Z.Y. "F4" no existe como batch nombrado.

### Los "B" por área
**Asesor (rediseño B1-B8):**
| Batch | Qué | Estado |
|---|---|---|
| B1 (B1.1-1.3) | 3 motores de navegación | ✅ |
| B2.1 | Nueva cita | ✅ |
| B2.2 | Bandeja IA (fix 403) | ✅ |
| B3 | Reordenar menú | ✅ |
| B2.3 | dispatch_event (fuga cross-tenant) | ⏳ va con B5 |
| B4-B8 | Ficha360 Hub + cableado completo | ⏳ |

**Dev (rediseño Paso C):** = BLOQUE 1 de arriba (C.1.0 ✅, resto ⏳).

**Phase 4 (W4) batches:** diagnóstico, comparables, MCP, GEO/SEO, agentes (Director + sub-agentes), Studio, WhatsApp, Atlax, Buyer Coach, notificaciones, data sources — ✅ shipped; ⏳ ~35h polish.

---

## 5. PENDIENTES DE OPS (founder, no código)
| Item | Qué | Tiempo |
|---|---|---|
| W5.18 Dubai | cargar 50+ propiedades | datos |
| W5.ASR.1 | WhatsApp QR (VPS Hostinger) | ops |
| W5.ASR.4 | DNS wildcard Cloudflare | ~5 min |
| W6.6 / W6.9 / W6.10 | Compliance CFDI · Multi-moneda · Legal post-venta (47h) | 📦 esperan ventas reales |

---

## 6. RESUMEN EN UNA LÍNEA
**Hecho:** Waves 1-5 + Cerebro E0-E6 + Tiers + Tanda A. **Ahora:** Tanda B (señales honestas) para cerrar el AVM. **Sigue:** Tanda C + ingesta → BLOQUE 1 (Dev) → 2 (dato real) → 3 (endurecer) → 4 (catálogo) → 5 (prender).
