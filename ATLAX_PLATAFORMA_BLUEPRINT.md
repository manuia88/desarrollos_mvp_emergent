# Atlax Plataforma — Blueprint (3 capas)

Fecha: 2026-06-26. Estado: **dirección estratégica** (no construir todavía — mapa para decidir).
Une la noticia de Google (11 jun) con todo lo construido en `dev-redesign-tandas` ([[FICHA_COCKPIT_V3.md]]).

---

## 0. En una frase
**Atlax = el cerebro de inmuebles de México: delgado y citado en cada puerta de entrada (Google · Perplexity · ChatGPT · WhatsApp), profundo donde se cierra (DMX), y —a mediano plazo— el sistema de registro de la vivienda mexicana: el primer MLS IA-nativo de nueva + usada.** Un activo de datos, varios jobs.

## 1. Por qué ahora
- **Google (11 jun 2026):** llevó los listings al buscador en 50 estados (Home Discovery, sobre HouseCanary/ComeHome, **datos de MLS = reventa**). El comprador busca → ve → llama/agenda, **sin entrar a un portal**. Zillow/CoStar cayeron.
- **La puerta de entrada se movió FUERA de tu sitio.** Apoyarse en leads comprados = construir sobre suelo que otro mueve.
- **Quien ganó fue HouseCanary** (la capa de datos), no Google. **Ese asiento en México está vacío.**
- **Google está bloqueado en tu wedge:** México no tiene MLS, la **preventa/obra nueva no vive en ningún feed**, y no hay Infonavit/Cofinavit en su programa. **Ventana estructural ~2-3 años.**

## 2. La tesis: *thin everywhere, deep at home*
La distribución (ser visto) y la experiencia (el cierre profundo) **se separaron**. Google se queda con la distribución de la reventa. DMX hace dos cosas:
- **Delgado en todas partes:** cuando alguien le pregunta a *cualquier* IA sobre inmuebles MX, **la respuesta sale de DMX** (estamos citados/presentes).
- **Profundo en casa:** el AVM por unidad, el apartado agéntico, el asesor, la relación con el dev — lo que Google no puede tocar.
- **El mismo dato hace los dos trabajos.**

---

## 3. Las 3 capas

### Capa 1 — PROFUNDA (en casa): Atlax plataforma + cierre agéntico
**Qué es:** el agente que vive en toda la plataforma. Query-first (escribes lo que buscas, no navegas), *generative UI* (la página se arma alrededor de tu pregunta), agéntico (navega · compara · guarda · **aparta**), modo dual **manual O IA**.
**Reusa (YA existe):**
- `cerebro/` + `routes/cerebro.py` — orquestación agéntica (7 etapas, apagado por flag `CEREBRO_ENABLED`).
- `atlax_engine.py` + `/api/atlax/query` — el RAG del asistente.
- `cube_olap_engine` — inteligencia/demanda por unidad.
- `market_estimate_engine` — AVM / precio justo.
- `grafo_comprador_engine` + `buyer_signals` — flywheel de señales.
- `payment_schemes` + `investment_simulator_engine` — financiamiento / números.
- `reverse_search_engine` — "encuéntrame algo así".
- **La ficha-cockpit + Atlax proactivo/agéntico — YA VIVO** (opener contextual, chips que manejan la ficha).
**Falta:**
- **Capa de orquestación / "modelo del mundo":** UN endpoint agéntico que lea TODO (inventario · AVM · cubo · zona · pagos · riesgo) y devuelva la **intención exacta**, no página por página.
- **Superficies generativas:** home query-first; respuestas que **arman UI** (tabla/mapa/simulador inline).
- **Apartado agéntico:** reservar + elegir esquema + precalificar Infonavit/Cofinavit + armar el lead, con checkpoints.
- **Streaming (SSE)** para que se sienta vivo (hoy `/api/atlax/query` devuelve JSON de golpe).
**Fases:** F1 ✅ (opener proactivo + agéntico) → F2 barra-héroe platform-wide + modo dual → F3 respuestas que arman canvas → F4 apartado agéntico + streaming + riel contextual.

### Capa 2 — DELGADA (en todas partes): GEO + datos estructurados  ← **ARRANCA YA**
**Qué es:** estar **citado** por Google AI Overviews, Perplexity y ChatGPT cuando alguien pregunta de inmuebles MX. (No es competir con Google por distribución — es **enchufarse** a ella.)
**Reusa:** el contenido y los datos reales que ya tienes (fichas, zonas, AVM, precios, plusvalía).
**Falta (barato):**
- `schema.org/RealEstateListing` + **`FAQPage` JSON-LD** en cada ficha y página de zona (el tipo de schema de mayor impacto para GEO).
- Contenido Q&A estructurado por colonia/desarrollo ("¿cuánto cuesta vivir en Polanco?", "¿da plusvalía?").
- Sitemap + feeds + render server-side de lo crítico (que el crawler/IA lo lea).
**Por qué urgente:** real estate tiene solo **4.48%** de penetración de respuestas IA (virgen) · resultados en **4-8 semanas** · solo **11%** de dominios los citan ambos motores → **el primero que llega se queda la cita.** No-regret, defensivo + ofensivo. Nadie en MX lo corre.

### Capa 3 — INFRAESTRUCTURA (el techo): el MLS IA-nativo de México (nueva + usada)
**Qué es:** dejar de *repackagear* el dato de otros → **ownearlo siendo el sistema de registro** de la vivienda MX. No el "HouseCanary de México": **algo más grande** — el **primer MLS IA-nativo**, nacional, para comprador *y* agente, donde **no llenas formularios: le hablas a Atlax** y él lista, **deduplica**, pone **precio justo (AVM)** y **matchea**. De ahí caen, gratis, los dos sub-jobs: la **inteligencia que agentes externos (Google · ChatGPT · bancos · devs) pueden *llamar*** (API/MCP citada) y la **autoridad citada** (Capa 2).
**Reusa:** el cubo, el AVM, el grafo de demanda, el knowledge graph property-centric, los motores — el dato y el dedup YA son piezas que tenemos.
**Falta:** el **registro canónico** (una propiedad = un registro, con dedup IA), el onboarding de agentes, exponer la API/MCP, el modelo de cooperación.
**Por qué importa:** los MLS de EE.UU. son software de los 90s, cerrados, regionales. **Nadie ha hecho uno IA-nativo.** Y en MX el asiento está **vacío** (no hay MLS nacional). Es el **negocio de infraestructura** — el más durable y grande.

> **El norte de mediano plazo** (founder, 2026-06-26): incorporar propiedades de **corretaje** y ser el **MLS de vivienda nueva y usada**. Ver §10 — cómo se bootstrappea sin morir de liquidez.

---

## 4. El moat (por qué es defendible)
1. **Datos propietarios de primary-market MX** (no hay MLS; nadie los tiene).
2. **La relación con el dev** (la oferta de preventa).
3. **El cierre agéntico** (apartado + Infonavit) que Google estructuralmente no alcanza.
4. **Flywheel de doble vía:** interno (cada interacción → cubo → Atlax más listo + inteligencia de demanda al dev) · externo (esa misma inteligencia, estructurada, te vuelve la autoridad citada → más compradores).
5. **Disciplina cero-dato-inventado + citado** = confianza en una compra de millones. **El Perplexity de inmuebles.**
6. **El registro canónico** (una propiedad = un registro): quien crea el grafo limpio de la vivienda MX **owna la infraestructura**. Es el activo más difícil de copiar (no es data, es *dedup + verdad de precio* a escala).
7. **Red de 3 lados** (devs · agentes · compradores): efecto de red. Más oferta → mejor AVM/dedup → más compradores → la oferta DEBE estar ahí. Compuesto.

## 5. Monetización (el cambio)
De **vender leads** (modelo muriendo) → a ingresos que el lead-resale no tiene:
- **SaaS al dev** — su infraestructura de ventas IA (su propia puerta IA, que el dev tampoco dependa de Google).
- **Membresía MLS al agente** — herramientas IA (listar por WhatsApp, AVM, dedup, matching) que ningún MLS de los 90s da. *El agente paga por la herramienta, no por el lead.*
- **Datos / inteligencia B2B** — la capa "HouseCanary de MX" (ahora con el dato propio, porque somos el MLS).
- **Transacción** — apartado agéntico + (a futuro) escrow/escrituración.
El **Atlax del consumidor = el embudo** de adquisición + captura de dato que alimenta todo.

## 6. Qué se arranca YA vs la apuesta grande
- **YA (no-regret):** **Capa 2 (GEO + datos estructurados).** Barato, rápido, virgen. Te vuelve la fuente citada antes de que se cierre la ventana.
- **Apuesta grande (decisión + fases):** **Capa 1** (orquestación + superficies generativas + apartado) y **Capa 3** (API consultable).

## 7. Riesgos + disciplina
- **Sobre-IA-ificar** (hay quien solo quiere ver) → **modo dual manual/IA**.
- **Alucinar en una compra de millones** → RAG-grounded + **citar la fuente** + "no sé, te paso al asesor".
- **Big-bang** → NO. **Reuse-first** (≈80% del backend existe), por fases, detrás de flag, prender al final.
- **Scope creep** → cada fase entera, con checkpoint, nada parcial.

## 8. Mapa de reuso (motor → job) — verificado en repo
| Motor (existe) | Job en el blueprint |
|---|---|
| `cerebro/` + `routes/cerebro.py` | Orquestación agéntica (apagada por flag) |
| `atlax_engine.py` · `/api/atlax/query` | El RAG del asistente |
| `cube_olap_engine` | Inteligencia / demanda por unidad |
| `market_estimate_engine` | AVM / precio justo |
| `grafo_comprador_engine` · `buyer_signals` | Flywheel de señales del comprador |
| `payment_schemes` · `investment_simulator_engine` | Financiamiento / números |
| `reverse_search_engine` | "Encuéntrame algo así" |
| `lead_capture_marketplace_engine` | Captura → asesor |
| `connectors_ie` | Datos externos (Banxico/INEGI/AirROI/NOAA) |

---

## 9. Siguiente paso sugerido
1. **Arrancar Capa 2 (GEO):** schema `RealEstateListing` + `FAQPage` JSON-LD en ficha/zona + Q&A por colonia. ~1-2 semanas, mide cita en 4-8. *(También es el imán de oferta del MLS — §11.4.)*
2. **Diseñar Capa 1 F2:** barra-héroe Atlax como primitivo de plataforma (home → ficha) + modo dual.
3. **Prototipo Capa 3:** exponer 2-3 consultas del cubo como API citada (prueba de "otros agentes nos llaman").

Todo esto **construye el wedge** (obra nueva → demanda + infra IA) que después bootstrappea el **MLS de nueva + usada** (§10). Orden sagrado: **demanda primero, oferta usada después.**

> Regla de oro: **reusar motores, reescribir presentación, cero dato inventado.** El backend ya casi está; falta la capa que lo une y la cara que se arma sola.

---

## 10. El norte de mediano plazo: el MLS IA-nativo (nueva + usada)
**Meta (founder):** incorporar propiedades de **corretaje** y ser el **MLS de vivienda nueva y usada**. Esto vuelve **literal** la Capa 3: no repackageas dato — eres el sistema de registro.

**Por qué la IA hace que un MLS mexicano POR FIN funcione.** Todo intento de MLS en MX murió por dos cosas, y la IA + el modelo de Google resuelven ambas:
- **Calidad de dato** (la misma casa listada 5 veces a 3 precios) → la IA da **dedup + registro canónico + AVM** (verdad de precio).
- **Cooperación** (los agentes no comparten) → el modelo que ya íbamos a copiar de Google: **sin cobro por lead + atribución de marca + contacto directo**. El agente lista **porque no le robas el cliente**. *La noticia de Google fue el playbook de cómo bootstrappear.*

**La secuencia (o mueres de liquidez — huevo y gallina):**
1. **Wedge:** obra nueva (oferta que YA tenemos vía devs) → construir **demanda de comprador + la infra de IA** (AVM, dedup, Atlax, GEO).
2. **Imán:** la demanda + las mejores herramientas IA (listar por WhatsApp, precio justo, matching) hacen que **el agente QUIERA estar**.
3. **Apertura:** invitas a los agentes (usada) a un lugar **que ya tiene compradores** y donde **no les cobras el lead**. La oferta sigue a la demanda — nunca al revés.

**Atlax gana una tercera cara profesional:** comprador · **agente** (listar/gestionar por voz/WhatsApp) · dev. Un cerebro, varias caras.

**El killer que nadie más tiene:** comparar **nueva vs usada con verdad de precio (AVM en ambas)** — "esta usada en Polanco a $X vs esta preventa a $Y, este es el valor real de cada una". Hoy es imposible (no hay dato común). Con el MLS IA-nativo, es el default.

**Lo honesto (el riesgo):** ser MLS es una **empresa más grande y distinta** a "herramientas IA para devs". Lo difícil **no es la tech** — es **liquidez + cooperación + reclutar agentes** (fuerza de ventas), **derechos del dato** y lo gremial (AMPI). Framing: la plataforma IA de **obra nueva es el caballo de Troya; el MLS es el destino.** No hervir el océano — **secuenciar**.

## 11. Upgrades adicionales que suman
1. **Onboarding por WhatsApp (el bootstrap real para MX).** El agente **manda fotos + audio** a Atlax y este **crea el listing estructurado, deduplica y le pone AVM**. Cero formularios, cero portal nuevo que aprender. México es WhatsApp-first; ahí se gana la oferta usada.
2. **Capa de transacción (el moat más profundo).** Del apartado agéntico → **escrow + coordinación de escrituración/notario**. En MX el cierre es un dolor; quien lo suaviza captura la parte más alta y pegajosa. Atlax como **agente del comprador** de punta a punta (busca → evalúa → negocia → cierra), monetizado por la transacción, no por el lead.
3. **Capa de confianza / anti-fraude.** MX es un mercado de baja confianza (listings falsos, agentes truchos, títulos sucios). Un MLS con **verificación IA** (¿el listing es real? ¿el agente es legítimo? ¿el título está limpio?) = **la razón por la que comprador y agente te eligen** sobre Marketplace/Facebook. La confianza es moat.
4. **GEO ⟷ MLS se refuerzan.** GEO trae compradores desde las IAs → los compradores hacen que **el agente DEBA listar contigo** para ser encontrado → liquidez del MLS → más dato → mejor GEO. **Bucle que se alimenta solo.**
5. **Financiamiento como attach.** Atlax precalifica (Infonavit/Cofinavit/banco) y matchea al mejor crédito dentro del flujo. Monetización + permanencia, sin sacar al usuario.

> Estos upgrades NO cambian la regla de oro ni la secuencia: se construyen **encima** del wedge de obra nueva, por fases, reusando lo que ya hay. Nada se arranca antes de tener demanda.
