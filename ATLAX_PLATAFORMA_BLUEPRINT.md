# Atlax Plataforma — Blueprint (3 capas)

Fecha: 2026-06-26. Estado: **dirección estratégica** (no construir todavía — mapa para decidir).
Une la noticia de Google (11 jun) con todo lo construido en `dev-redesign-tandas` ([[FICHA_COCKPIT_V3.md]]).

---

## 0. En una frase
**Atlax = el cerebro de inmuebles de México: delgado y citado en cada puerta de entrada (Google · Perplexity · ChatGPT · WhatsApp), profundo donde se cierra (DMX).** Un activo de datos, dos jobs.

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

### Capa 3 — INFRAESTRUCTURA (el techo): Atlax como API que otros agentes llaman
**Qué es:** el **"HouseCanary de México, pero IA-nativo"** — no un feed pasivo, sino una **inteligencia que agentes externos (Google · ChatGPT · bancos · devs) pueden *llamar*** para la verdad del mercado mexicano.
**Reusa:** el cubo, el AVM, el grafo de demanda, los motores — el dato YA existe.
**Falta:** exponerlo como **API/MCP** limpia, citada, con licenciamiento.
**Por qué importa:** HouseCanary cobra por alimentar a Google. Este es el **negocio de infraestructura B2B** — el más durable y grande, en un asiento vacío.

---

## 4. El moat (por qué es defendible)
1. **Datos propietarios de primary-market MX** (no hay MLS; nadie los tiene).
2. **La relación con el dev** (la oferta de preventa).
3. **El cierre agéntico** (apartado + Infonavit) que Google estructuralmente no alcanza.
4. **Flywheel de doble vía:** interno (cada interacción → cubo → Atlax más listo + inteligencia de demanda al dev) · externo (esa misma inteligencia, estructurada, te vuelve la autoridad citada → más compradores).
5. **Disciplina cero-dato-inventado + citado** = confianza en una compra de millones. **El Perplexity de inmuebles.**

## 5. Monetización (el cambio)
De **vender leads** (modelo muriendo) → a tres ingresos que el lead-resale no tiene:
- **SaaS al dev** — su infraestructura de ventas IA (su propia puerta IA, que el dev tampoco dependa de Google).
- **Datos / inteligencia B2B** — la capa "HouseCanary de MX".
- **Transacción** — el apartado agéntico.
El **Atlax del consumidor = el embudo** de adquisición + captura de dato que alimenta los tres.

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
1. **Arrancar Capa 2 (GEO):** schema `RealEstateListing` + `FAQPage` JSON-LD en ficha/zona + Q&A por colonia. ~1-2 semanas, mide cita en 4-8.
2. **Diseñar Capa 1 F2:** barra-héroe Atlax como primitivo de plataforma (home → ficha) + modo dual.
3. **Prototipo Capa 3:** exponer 2-3 consultas del cubo como API citada (prueba de "otros agentes nos llaman").

> Regla de oro: **reusar motores, reescribir presentación, cero dato inventado.** El backend ya casi está; falta la capa que lo une y la cara que se arma sola.
