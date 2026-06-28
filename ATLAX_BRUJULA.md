# Atlax · Brújula Maestra — Visión + Roadmap

> **El moat:** el **Modelo del Mundo de la Demanda Habitacional**. La única IA del mundo que entiende no *qué compra*
> la gente, sino **POR QUÉ NO** — para la decisión espacial más cara de su vida — y **actúa para ambos lados** del mercado.
> Principio: **un cerebro, muchos lentes.** Reuse-first · cero dato inventado · cero callejones.
>
> **Documento VIVO** — marcar `[x]` al completar cada pieza. Última actualización: 2026-06-27 · rama `dev-redesign-tandas`.

---

## 0 · Por qué es irreplicable
Cada gigante tiene UNA pieza, nadie las junta:
- **World models** (Fei-Fei Li, LeCun, Google Genie, Nvidia Cosmos) modelan la **física** del mundo — no el **deseo** de habitarlo.
- **TikTok** modela gusto de contenido **efímero** — no la decisión espacial de una vida.
- **Agentic commerce** (OpenAI/Anthropic/Google/Visa) cierra **commodities** — no productos bespoke con un *porqué*.
- **Proptech** (CoStar/JLL/HouseCanary) tiene la **oferta** — no **el porqué del NO** de la demanda.
- **Apple** tiene contexto personal — no el ciclo de la transacción inmobiliaria.

Nadie modela **por qué la gente RECHAZA un hogar**. Eso exige tener los 4 lados a la vez (comprador·asesor·dev·superadmin)
en ciclo cerrado, en un mercado real (MX primary-market). **Eso ya lo tenemos.**

---

## 1 · La matriz — cada pieza frontera × cada portal (su propia visión)

| Pieza frontera | 🛒 Comprador | 🤝 Asesor | 🏗️ Dev | 👁️ Superadmin |
|---|---|---|---|---|
| **Spatial / World model** | Mi mapa de dónde viviría feliz | Mapa de calor de MI demanda | Qué quiere cada terreno/zona · brecha | Gemelo de demanda de MX (SimCity vendible) |
| **Taste graph** (el porqué) | Atlax me conoce (aprende·no repite·mi porqué) | Gusto+rechazo de cada lead sin re-preguntar | Por qué rechazan MI producto | El grafo del SÍ y del NO (el dato/moat) |
| **Generative world** | Espacio staged a TU gusto · ficha-experiencia | Pitch/landing autogenerados por cliente | Diseño generativo del terreno + renders que venden | Simulador what-if del mercado |
| **Agentic commerce** | Agente que busca·vetea·negocia·agenda·aparta | Copiloto que califica·sigue·cierra | Agente de ventas (pricing·ruteo·jugada/unidad) | El orquestador del marketplace |
| **Personal context** | Mi gusto me sigue toda la vida (proactivo) | Memoria total de cada relación | Conciencia ambiental del portafolio | La memoria institucional que compone el moat |

**Norte por portal:**
- 🛒 *Un copiloto que me conoce de por vida y me lleva de la mano hasta mi hogar.*
- 🤝 *Un agente que conoce a cada cliente mejor que yo y cierra por mí.*
- 🏗️ *Saber qué construir, para quién, y venderlo antes de levantarlo.*
- 👁️ *El gemelo vivo de la demanda de México — el cerebro y el moat.*

---

## 2 · Checklist por portal  *(marcar [x] al completar)*

### 🛒 Comprador
- [x] **Taste** — swipe 👍/👎 + motivo (porqué del NO) · no-repetir · rank por gusto · "Atlax ya te conoce" · cross-device (F1-F5, U1-U6)
- [ ] **Spatial** — "mapa de dónde vivirías feliz" (cubo × tu gusto → zonas que te quedan) 🆕
- [~] **Generative** — ficha-experiencia cinemática 🚧 **P1 ✅** (`/experiencia/:id`: image-reveal + scroll-scrub + sensor) · falta video de zona + staged a tu gusto (ver §4)
- [ ] **Agentic** — agente que busca→vetea→negocia→aparta (Cerebro find_home + buy-signal + apartado) 🟡
- [ ] **Personal** — gusto por etapas de vida (rentar→comprar→invertir) + alertas proactivas 🟡 (casamentera ✅)

### 🤝 Asesor
- [ ] **Taste** — gusto+rechazo de cada lead sin re-preguntar (lead_match ✅, exponerlo) 🟡
- [ ] **Generative** — pitch/comparativa/landing por cliente (Studio ✅, cablear por-lead) 🟡
- [ ] **Agentic** — copiloto que cierra el pipeline (39 tools ✅, cablear) 🟡
- [ ] **Spatial** — mapa de calor de SU demanda (del cubo) 🆕
- [x] **Personal** — memoria de cada relación (Ficha360)

### 🏗️ Dev
- [x] **Taste/rechazo** — por qué rechazan mi producto (percepción F5) + gap de presentación
- [ ] **Generative** — diseño generativo del terreno (mezcla óptima) + renders que venden 🆕 *(la cuña que monetiza)*
- [ ] **Spatial** — qué quiere cada zona + brecha demanda-oferta (demanda-zona ✅, profundizar) 🟡
- [ ] **Agentic** — agente de ventas (pricing-lab ✅ + ruteo/jugada por unidad) 🟡
- [ ] **Personal** — conciencia ambiental del portafolio ("tu zona cambió") 🆕

### 👁️ Superadmin
- [x] **Taste/rechazo** — el grafo del SÍ y del NO (F4: rechazo_por_motivo + gap_presentacion)
- [ ] **Spatial** — gemelo de demanda / SimCity (cubo → world model) 🆕
- [ ] **Generative** — simulador what-if ("¿qué pasa si X construye Y en Z?") 🆕
- [ ] **Agentic** — el orquestador del marketplace (Cerebro E0-E6 ✅, prender) 🟡
- [x] **Personal** — la memoria institucional (el dato que compone el moat)

---

## 3 · Arquitectura de conexión — el sistema nervioso (un cerebro, 4 lentes)

**El átomo de máxima granularidad:** `[persona × unidad × atributo × acción × motivo × tiempo × zona]`.
No "dev" → **unidad**. No "sesión" → **persona** (identidad U1 cose dispositivos). No "amenidad" → **atributo de foto**.
No solo "click" → **el porqué del SÍ y del NO**.

**El espinazo único que TODOS escriben y leen:** `buyer_signals` → `cubo OLAP` → grafo gusto/rechazo + AVM + forecast.

```
        ┌──────────── EL CEREBRO (cubo + taste/reject graph + modelos) ────────────┐
        │  escribe ▲           escribe ▲          escribe ▲         ▲ escribe       │
   🛒 COMPRADOR ───────► 🤝 ASESOR ───────► 🏗️ DEV ───────► 👁️ SUPERADMIN          │
        │ busca/swipe/     │ califica/cierra/ │ ajusta producto/  │ agrega/reentrena │
        │ guarda/rechaza   │ da seguimiento   │ precio/renders    │ los modelos      │
        ▼ lee rank/gusto   ▼ lee gusto-lead   ▼ lee demanda/rechazo▼ sirve a todos   │
        └─────────────────── lee modelos entrenados ◄──────────────────────────────────┘
```

**Los 6 ciclos (cero callejones):**
1. **Comprador → Cerebro → todos:** cada señal alimenta dev (percepción), asesor (temperatura+gusto), superadmin (cubo).
2. **Comprador → Asesor:** `create_buyer_lead → lead_bridge` entrega el lead CALIENTE con gusto+lista (Ficha360).
3. **Asesor → Comprador:** swipe del asesor + el **cierre** reentrenan el gusto (la venta es la verdad).
4. **Comprador → Dev:** `demanda_insatisfecha` + `percepción` → "qué construir / arregla fotos" → dev actúa → re-entra.
5. **Dev → Comprador:** nuevo inventario/precio → catálogo → `casamentera` dispara "avísame".
6. **Cerebro → todos:** modelos entrenados (`taste_scores`/`score_devs`/AVM/forecast) sirven a los 4 lentes. **El flywheel.**

---

## 4 · Ficha-experiencia cinemática (ATOMS) — la ficha NO es una tabla

**Módulos ATOMS → momentos del desarrollo/zona:**
| Módulo | Uso | Asset |
|---|---|---|
| 1 · Image reveal | Fachada→interior · día→noche · vacío→**amueblado a tu gusto** · terreno→render (preventa) | 2 fotos / staging |
| 2 · Scroll-trigger video | Hero de zona: "Vive la Condesa en 30s" → congela → arranca la ficha | Video zona (Studio/Seedance) |
| 3 · Mouse scrub | Orbita el edificio / recorre el roof con el mouse (se siente 3D) | 3DGS / footage real |
| 4 · Scroll scrub | "Recorre tu futuro hogar con el scroll": cocina→sala→recámara→terraza, datos al lado | Walkthrough real |

**Flujo (combined):** Hero (img-reveal) → Zona (scroll-trigger) → Tu hogar (scroll-scrub) → Amenidades (mouse-scrub) → **los datos** (tarjeta persuasiva + ¿buena compra? + ¿cuánto al mes? + swipe 👍/👎).

**Capa MOAT (taste × generative world):** el MISMO dev renderiza una experiencia DISTINTA por persona — el amueblado usa
tu estilo, el scroll-scrub empieza por el cuarto que te importa, el video resalta lo tuyo. Sale de `visitor_taste`.

**Upgrade capstone — la experiencia ES el sensor:** dónde revela el cursor, hasta dónde/en qué cuarto hace scroll-scrub,
si orbita, si ve el video completo → señales de intención HIPERGRANULARES (más finas que un click) → alimentan `visitor_taste`.
**La experiencia que enamora también te aprende, a una resolución que nadie tiene.**

⚠️ **Reglas:** (a) **Real vs generado** — Seedance solo para ambiente de zona (mood genérico); la unidad/edificio específico =
footage/render/3DGS **REAL**, nunca generado (tergiversar = romper la regla anti-alucinación). (b) Port a React (GSAP
ScrollTrigger / rAF). (c) Móvil: video corto + keyframes densos + precarga + fallback tap-through + lazy-load (LCP).

---

## 5 · Orden de construcción (cuñas)
1. **Cuña Dev/Superadmin** (monetiza primero): diseño generativo del terreno + el grafo causal del porqué del NO. *Data lista (F4/F5).*
2. **Ficha-experiencia** — piloto Módulo 4 (scroll-scrub walkthrough) en 1 dev real → luego hero de zona (Módulo 2) → personalización por gusto.
3. **Embeddings de gusto** con online-learning (estilo TikTok) → matching predictivo.
4. **Moonshot:** gemelo de demanda consultable (Bloomberg+SimCity de MX) + agente que cierra punta a punta.

---

## 6 · Bitácora de avance
- **2026-06-27** — ✅ Espinazo de Aprendizaje **F1-F5** (swipe+motivo · no-repetir · Mi Lista+handoff · grafo rechazo superadmin · loop dev fotos→Studio). Ver `ATLAX_LEARNING_SPINE_SPEC.md`.
- **2026-06-27** — ✅ **U1-U6** (restart+verify · gusto hipergranular `visitor_taste` + "Atlax ya te conoce" · impresión cubierta · image-health · alertas casamentera · identidad cross-device por registro Y login).
- **2026-06-27** — ✅ **Ranking hipergranular** (`/casi` ordena por `score_devs`: zona·amenidades·precio·features de foto + perfil negativo).
- **2026-06-27** — 🚧 **Ficha-experiencia P1** (cuña #2): `pages/public/AtlaxExperiencia.js` + ruta `/experiencia/:id`. Hero **image-reveal** (Módulo 1) + **walkthrough Módulo 4 REAL** (el scroll mueve `video.currentTime` cuadro por cuadro, rAF con easing, video pausado = recorrido continuo, NO fotos que saltan; fallback foto-secuencia si no hay video) + **sensor** (`photo_dwell` con profundidad máxima recorrida → `visitor_taste`) + CTA. Verificado en vivo (tamaulipas-89): compila · `currentTime` sube continuo 0→3.3→10→16.8s mientras el video sigue `paused` · barra de progreso. **Asset gap:** 0/18 devs tienen `video_url` → demo generado con ffmpeg (Ken Burns continuo) desde las FOTOS REALES del dev (`frontend/public/demo/`, mapeado en `DEMO_VIDEOS`, a borrar cuando haya video real). **Producción:** el dev sube su recorrido (Studio/3DGS) → `dev.video_url`. **Falta:** P2 (personalización por gusto) · P3 (hero video de zona Módulo 2 + disparadores "Vívelo" + móvil/perf).
- **2026-06-27** — 🚧 **Router de experiencia** (auto plan de acción): `resolveExperienceMode(dev)` detecta los assets y elige el mejor recorrido — escalera **video real (`video_url`) > 3DGS/360 (futuro) > parallax 3D generado (`parallax_url`) > foto-secuencia > ficha**, con badge automático ('Recorrido de muestra' / 'Render animado'). "Detecta quién/qué sube" = el dev fija `video_url` (→video) o sube solo fotos (→se genera parallax) o 3DGS (→flythrough). Verificado: tamaulipas-89 resuelve a video demo con badge. **Pendiente:** (a) generador de **parallax 3D LOCAL gratis** (onnxruntime + Depth-Anything ~100MB + ffmpeg displace/remap, **sin API, sin costo por clip**); (b) flujo de subida del **video real del dev** → `video_url`. Opción premium opcional: Higgsfield (agrupa Seedance/Kling/Veo, ~$0.35–$2.90/clip) por dev que lo pague.
- **2026-06-27** — ✅ **Generador Parallax 3D LOCAL (gratis, SIN API)** — incógnita despejada: `opencv + MiDaS-small.onnx (66MB)` estima profundidad de cada foto + `cv2.remap` mueve la cámara con parallax por profundidad (dolly-in + sway) → sensación de "entrar" a cada cuarto, encadenado con xfade. Demo desde 4 fotos reales de interior → `frontend/public/demo/walkthrough-parallax-tamaulipas-89.mp4`. El router lo sirve con `?modo=parallax` + badge 'Render animado'. Verificado: scrubea (ct 3.8→10.4), video paused, compila. **Cero costo por clip.** Honesto: es un parallax 3D sutil (premium), NO un walk-through real tipo Seedance; ideal como fallback gratis para devs solo-fotos. **Producción:** correr el pipeline al subir fotos → guardar en `parallax_url`. Comparar: `/experiencia/:id` (footage real) vs `/experiencia/:id?modo=parallax` (parallax local).
- **2026-06-27** — ✅ **Fase 0: Auditoría de integridad** (workflow multi-agente, 20 agentes, verificación adversarial). Integridad sólida; verificador mató 6/8 falsos positivos; **8 issues reales de cierre-de-ciclo, 0 de seguridad**. Reporte en `AUDIT_PHASE0_FINDINGS.md`. Patrón: el dato del comprador no se materializa/viaja completo. Bloqueador #1 = cubo ciego a la demanda.
- **2026-06-28** — ✅ **Fix #1 (FUNDAMENTO): buyer_signals → cubo OLAP** — `materialize_buyer_signals_to_cube` en `cube_olap_engine.py` (agrega por dev+colonia, **K-anon ≥3**, interest_score ponderado) + cron `cube_buyer_signals_refresh` 04:00 MX en `scheduler_ie.py`. Verificado contra BD real: materializó 5 facts, suprimió 12 por K-anon, ej. altavista-polanco 7 visitantes/score 71.1. Desbloquea recomendaciones/superadmin/taste. _(consumidores: opp. demand-insights superadmin + taste persistido)_
- **2026-06-28** — ✅ **Fix #3 (HIGH): el gusto viaja a Ficha360** — `lead_bridge.mirror_lead_to_asesor_contacto` adjunta `taste_compact` (resumen·amenidades·zonas·evita·precio_techo·espacios·motivos_no·confianza) leído de `visitor_taste` en las 3 ramas; `Ficha360.js` muestra "Le gusta: …". Verificado: compact rico de visitante real ("Jardines del Pedregal · gym, seguridad · hasta $22.4M"). Commit `25379ffa`.
- **2026-06-28** — ✅ **Fix #2 (HIGH): favoritos anónimos se vinculan al loguear** — `/api/buyer/claim` ahora, tras `link()`, refresca el tablero del asesor (`mirror_favoritos_to_board` vía resolve_visitors) si el usuario tiene lead; `claimVisitor()` corregido (marca hecho SOLO al vincular → re-dispara tras login) + cableado en AuthModal (login+registro) y CompradorDashboard (montaje). Verificado: backend arranca limpio, claim anónimo=no-op, frontend compila. El asesor ya ve la actividad, no un lead "vacío".
- _3 HIGH del ciclo comprador→asesor CERRADOS (#1 cubo · #2 favoritos · #3 taste)._
- **2026-06-28** — ✅ **Fix #4 (HIGH): consistencia de leads** — (1) bridge inverso etapa→status ya NO es silencioso (loguea el fallo); (2) `create_contacto` sintetiza un lead `asesor_manual` en db.leads + lo enlaza (`source_lead_id`) → el alta manual cuenta en KPIs dev/superadmin (sin doble conteo: el dedup por teléfono bloquea marketplace); (3) job `reconcile_etapa_to_leads` 04:20 MX (recupera syncs perdidos). Verificado: reconcile escaneó 4, 0 drift. + **Fix #8 (MED): `$in` en el dedup** de lead_bridge (blinda el match email/teléfono).
- **2026-06-28** — ✅ **Fix #5 (MED): fuente única de leads** — `services/lead_capture.capture_lead` ahora llama `create_buyer_lead` (si hay visitor_id → idempotente, sin duplicar) → los captures (reporte colonia/quiz/hipoteca/tour) son leads de primera clase visibles a dev/superadmin/asesor, no sólo en `lead_captures`. FAIL-OPEN.
- **2026-06-28** — ✅ **Fix #6 (MED): score real en cockpit** — el backend YA sobrescribía score+temp con `buyer_score` real (era casi-falso-positivo); agregué per-row `score_real` + indicador en `DesarrolladorCRMShell` (color tema + "•" + tooltip) → el dev distingue score por conducta real vs heurística.
- **2026-06-28** — ✅ **Fix #7 (MED): ya estaba cableado** (falso positivo) — `photo_zoom` (AtlaxQuickView), `module_open` (FichaDesarrollo), `zone_intent` (ZonePageV2) SÍ se emiten. Verificado en código.
- _**AUDITORÍA FASE 0 COMPLETA: 8/8 issues cerrados** (4 HIGH + 4 MED) · 2 falsos positivos · cero deuda._
- **2026-06-28** — ✅ **Oportunidad #3**: `GET /founder-console/demand-insights` + tarjeta "Demanda · ¿dónde construir?" (cruza facts_buyer_signals + demanda_insatisfecha). Hace VISIBLE el cubo de demanda (cierra ciclo Fix #1).
- **2026-06-28** — ✅ **Oportunidad #2**: `record_closing` se dispara al cerrar ganado (era cable muerto) → `copiloto_closings` se puebla → "compradores como tú ya cerraron aquí" + AVM con precio real. _(endpoint+componente ya existían = falso positivo de orphan)_
- **2026-06-28** — ✅ **Oportunidad #5**: `GET /founder-console/studio-opportunities` (reusa buyer_cycle_intel) + tarjeta "Studio Opportunity" (devs con ≥40% rechazo por fotos → pipeline de venta de Studio).
- _Oportunidades 3/7 ✅. Pendiente: #1 materializar taste · #4 consumir buyer_elasticidad · #6 re-entrenar temperatura · #7 discoverability. Luego: brújula._
