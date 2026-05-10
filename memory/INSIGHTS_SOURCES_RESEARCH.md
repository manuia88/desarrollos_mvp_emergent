# DMX Insights Layer — Research de Fuentes Real Estate Globales

**Última actualización**: 2026-05-10
**Objetivo**: identificar TODAS las fuentes confiables de información real estate (compra/venta/inversión/proptech/fintech/innovación/lifestyle/macro) que podemos cruzar con data DMX para ser **el referente de noticias real estate en México** (W5.20-21 Wave 5 H2).

**Filosofía de filtrado**: cada fuente debe pasar 4 criterios:
1. **Credibilidad**: institución reconocida, reportes citables (no blogs de opinión)
2. **Actualización**: data refrescable ≥1x/año (idealmente trimestre o mes)
3. **Cruzabilidad con DMX**: data permite contraste con CDMX/MX (m²/yields/cap rates/absorción/preventa)
4. **Acceso técnico viable**: API · scraping legal · download manual reasonable · NO competidores directos MX

**Status convenciones**:
- ⏳ Research pending — falta verificar API/scraping/cost
- 🟢 Verified — accesible · ingest pipeline plan claro
- 🟡 Partial — accesible con limitaciones (paywall · throttle · manual)
- 🔴 Blocked — paywall total · ToS prohibe · no relevante MX
- ⛔ Rejected — competidor directo MX (NO scrape per founder rule)

---

## TIER 1 — Brokerages & Consultoras Globales (reportes premium · referentes prensa)

| # | Fuente | URL | Frecuencia data | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 1.1 | **JLL Research** | jll.com/en/trends-and-insights/research | Quarterly + Annual | Free reports + paid premium | Alto (México Ciudad Office, Industrial, Hotel reports) | ⏳ |
| 1.2 | **Knight Frank Wealth Report** | knightfrank.com/wealthreport | Annual (March) | Free PDF download | **Muy alto** (Prime Index incluye CDMX desde 2018) | ⏳ |
| 1.3 | **Savills Spotlight** | savills.com/research | Monthly + Annual | Free + email gate | Alto (Global Living Index · Impacts Report) | ⏳ |
| 1.4 | **CBRE Research** | cbre.com/insights | Quarterly | Free + paid | Alto (México MarketView Office, Industrial) | ⏳ |
| 1.5 | **Cushman & Wakefield MarketBeat** | cushmanwakefield.com/insights | Quarterly | Free download | Alto (CDMX Office, Industrial trimestrales) | ⏳ |
| 1.6 | **Colliers International Research** | colliers.com/insights | Quarterly | Free + paid | Alto (México Q-reports) | ⏳ |
| 1.7 | **Newmark Research** | nmrk.com/insights | Quarterly | Free | Medio (poco MX-specific) | ⏳ |
| 1.8 | **Marcus & Millichap** | marcusmillichap.com/research | Quarterly + Annual | Free | Bajo (US-only mostly) | 🟡 |
| 1.9 | **BNP Paribas Real Estate** | realestate.bnpparibas | Quarterly | Free | Bajo (Europa-focus) | 🟡 |

---

## TIER 2 — Consultoras Big 4 (anchor authority · prensa cita siempre)

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 2.1 | **PwC Emerging Trends in Real Estate** | pwc.com/realestate | **Annual** flagship | Free PDF download | **Muy alto** (rankings ciudades · México siempre incluido) | ⏳ |
| 2.2 | **Deloitte Commercial Real Estate Outlook** | deloitte.com/realestate | Annual | Free | Alto | ⏳ |
| 2.3 | **KPMG Real Estate Insights** | kpmg.com/realestate | Quarterly | Free | Medio | ⏳ |
| 2.4 | **EY Real Estate** | ey.com/realestate | Quarterly | Free | Medio | ⏳ |
| 2.5 | **McKinsey Real Estate Practice** | mckinsey.com/industries/real-estate | Monthly research | Free + paid | Alto (artículos macro vivienda emergentes) | ⏳ |
| 2.6 | **Goldman Sachs Real Estate Research** | goldmansachs.com/insights | Monthly | Paid + free press | Bajo (institutional-focus) | 🟡 |

---

## TIER 3 — Multilaterales / Bancos Centrales / Oficiales (data macro confiable)

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 3.1 | **BIS Property Price Statistics** | bis.org/statistics/pp.htm | Quarterly | **Free API** | **Muy alto** (México índice precios incluido) | 🟢 |
| 3.2 | **OECD Housing Prices Database** | oecd.org/housing | Quarterly | **Free API** | **Muy alto** (México país OECD desde 1994) | 🟢 |
| 3.3 | **IMF Global Housing Watch** | imf.org/housing | Quarterly | Free | Alto | 🟢 |
| 3.4 | **World Bank Doing Business RE** | worldbank.org/doing-business | Annual | **Free API** | Alto (registering property MX index) | 🟢 |
| 3.5 | **UN-Habitat World Cities Report** | unhabitat.org | Annual | Free PDF | Medio (urbanismo macro) | 🟡 |
| 3.6 | **ECB Housing Statistics** | ecb.europa.eu/stats/macroeconomic_and_sectoral/housing | Quarterly | Free | Bajo (Eurozona-only para comparativa) | 🟡 |
| 3.7 | **FRED St. Louis Fed (US Housing)** | fred.stlouisfed.org | Daily/Monthly | **Free API** | Medio (US comparable, useful narrativa "vs USA") | 🟢 |

---

## TIER 4 — México / LATAM Específicos (anchor MX para credibilidad local)

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 4.1 | **BANXICO SIE** | banxico.org.mx/SieAPIRest | Daily/Monthly | **Free API** | ✅ Ya integrado W4.18 | 🟢 |
| 4.2 | **INEGI** (Censo + Vivienda) | inegi.org.mx/datosabiertos | Annual + decenal | **Free API** | **Muy alto** (vivienda · ENVI · ENH) | ⏳ |
| 4.3 | **SHF Sociedad Hipotecaria Federal** | shf.gob.mx | Quarterly | Free download | **Muy alto** (índice precios SHF Tradicional · Tasa hipotecaria) | ⏳ |
| 4.4 | **CONAVI** (Comisión Nacional Vivienda) | gob.mx/conavi | Annual + monthly | Free | Alto (Vivienda nueva · CUV Cédula Única Vivienda) | ⏳ |
| 4.5 | **AMPI** (Asoc. Mex Profesionales Inmobiliarios) | ampi.org | Quarterly | Member-gated · público news | Alto (índice nacional MLS) | ⏳ |
| 4.6 | **AMDI** (Asoc. Mex Devs Inmobiliarios) | amdi.com.mx | Annual + monthly | Free news + paid reports | Alto (vivienda nueva · vertical specifics) | ⏳ |
| 4.7 | **ADI** (Asoc. Desarrolladores Inmobiliarios) | adi.org.mx | Quarterly | Free | Alto (CDMX-focus · uso suelo · normativa) | ⏳ |
| 4.8 | **Softec MX** | softec.com.mx | Quarterly + Annual | **Paid premium** (~$$$) | **Muy alto** (referente vivienda nueva MX desde 1989) | 🔴 |
| 4.9 | **Tinsa MX** | tinsa.com.mx | Monthly | Paid + free press | Alto (avalúos índice nacional) | 🟡 |
| 4.10 | **PROIIN** (Comité Inmobiliario PRIVI) | proiin.com.mx | Annual | Member-only | Medio | 🔴 |
| 4.11 | **BMV / BIVA FIBRAs** | bmv.com.mx · biva.mx | Daily | **Free API** (cotizaciones) | **Muy alto** (FIBRA Macquarie · FIBRA UNO · FIBRA Inn · cap rates · NAV) | 🟢 |
| 4.12 | **Fitch Ratings RE MX** | fitchratings.com/mexico | Monthly | Free press + paid full | Alto (calificación FIBRAs · risk vivienda) | 🟡 |
| 4.13 | **HR Ratings (MX)** | hrratings.com | Monthly | Free | Alto | 🟢 |
| 4.14 | **CIDE / ITAM Estudios Vivienda** | cide.edu · itam.mx | Variable | Free academic | Alto (papers vivienda CDMX) | ⏳ |

⛔ **Inmuebles24, Lamudi MX, Vivanuncios, Propiedades.com**: rechazados per founder rule `feedback_no_scraping_competitors.md` (competidores directos · NO scrape).

---

## TIER 5 — Data Aggregators US / Comparables (narrativa "MX vs USA")

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 5.1 | **Zillow Research** | zillow.com/research/data | Monthly | **Free download CSV** | Medio (Zillow Home Value Index · narrativa "Beverly Hills vs Polanco") | 🟢 |
| 5.2 | **Realtor.com Research** | realtor.com/research | Monthly | Free + paid | Medio | 🟢 |
| 5.3 | **Redfin Data Center** | redfin.com/news/data-center | Weekly | **Free download CSV** | Medio | 🟢 |
| 5.4 | **Numbeo Property Prices Index** | numbeo.com/property-investment | Monthly crowd-sourced | **Free API** + paid premium | **Muy alto** (m²/cost-of-living por **500+ ciudades mundo**) | 🟢 |
| 5.5 | **Global Property Guide** | globalpropertyguide.com | Quarterly | Free + paid premium | **Muy alto** (yields rentas + impuestos por país) | 🟢 |
| 5.6 | **Compass Markets** | compass.com/markets | Monthly | Free | Bajo (US luxury only) | 🟡 |
| 5.7 | **HouseCanary** | housecanary.com | API premium | **Paid only** | Alto (US AVM B2B) | 🔴 |
| 5.8 | **CoStar** | costar.com | Daily | **Paid premium** $$$$ | Alto (CRE benchmarks) | 🔴 |
| 5.9 | **Reonomy** | reonomy.com | Monthly | Paid | Alto (CRE US) | 🔴 |

---

## TIER 6 — Prensa Económica & Real Estate Specialty (narrativa + viral SEO)

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 6.1 | **Bloomberg Real Estate** | bloomberg.com/realestate | Daily | Paid sub + free press | **Muy alto** (cita en NYT · referente global) | 🟡 |
| 6.2 | **Reuters Real Estate** | reuters.com/business/real-estate | Daily | Free + paid | Alto | 🟢 |
| 6.3 | **Financial Times Property** | ft.com/property | Daily | Paid sub | Alto | 🟡 |
| 6.4 | **WSJ Real Estate** | wsj.com/real-estate | Daily | Paid sub | Alto (Mansion Global incluida) | 🟡 |
| 6.5 | **The Economist Cities** | economist.com/cities | Weekly | Paid sub | Alto (rankings ciudades habitabilidad) | 🟡 |
| 6.6 | **Forbes Real Estate** | forbes.com/real-estate | Daily | Free + paid | Medio | 🟢 |
| 6.7 | **The Real Deal** | therealdeal.com | Daily | Free | Medio (NY/SF/Miami-focus) | 🟢 |
| 6.8 | **Bisnow** | bisnow.com | Daily | Free | Medio (US CRE) | 🟢 |
| 6.9 | **Mansion Global (WSJ)** | mansionglobal.com | Daily | Free + paid | Alto (luxury MX cubierto) | 🟢 |
| 6.10 | **El Financiero MX (sección RE)** | elfinanciero.com.mx/empresas | Daily | Free + paid | **Muy alto** (referente prensa MX) | 🟢 |
| 6.11 | **Expansión MX (Inmobiliaria)** | expansion.mx/inmobiliario | Daily | Free + paid | **Muy alto** (CDMX-focus) | 🟢 |
| 6.12 | **Forbes México (RE)** | forbes.com.mx | Daily | Free | **Muy alto** | 🟢 |
| 6.13 | **Reforma (Inmobiliario)** | reforma.com | Daily | Paid sub | Alto | 🟡 |

---

## TIER 7 — Lifestyle / Urbanismo / Arquitectura (cross-pollination con audiencia premium)

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 7.1 | **Architectural Digest** | architecturaldigest.com | Daily | Free + paid | Medio (lifestyle premium) | 🟢 |
| 7.2 | **Dezeen** | dezeen.com | Daily | Free | Medio (arquitectura global) | 🟢 |
| 7.3 | **ArchDaily** | archdaily.com | Daily | Free | Alto (proyectos MX cubiertos) | 🟢 |
| 7.4 | **Curbed (NY Mag)** | curbed.com | Daily | Free | Bajo (NYC/SF only) | 🟢 |
| 7.5 | **Dwell Magazine** | dwell.com | Weekly | Free + paid | Bajo | 🟢 |
| 7.6 | **Wallpaper*** | wallpaper.com | Weekly | Paid | Bajo | 🟡 |
| 7.7 | **Espacio Urbano** (founder mencionó) | espaciourbano.com | Weekly | Free | **Muy alto** (CDMX urbanismo) | ⏳ |
| 7.8 | **Real Estate Lifestyle** (founder mencionó) | URL TBD | TBD | TBD | TBD | ⏳ |
| 7.9 | **Obras Web (Grupo Expansión)** | obrasweb.mx | Daily | Free | **Muy alto** (construcción MX) | 🟢 |
| 7.10 | **Inmobiliare** | inmobiliare.com | Daily | Free | **Muy alto** (referente prensa inmobiliaria MX) | 🟢 |

---

## TIER 8 — Proptech & Innovación (narrativa "DMX es proptech leader LATAM")

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 8.1 | **CB Insights Real Estate Tech** | cbinsights.com/real-estate-tech | Quarterly | **Paid premium** + free reports | **Muy alto** (proptech rankings · funding LATAM) | 🟡 |
| 8.2 | **Crunchbase RE/Proptech** | crunchbase.com | Daily | Free + paid API | Alto (startups proptech) | 🟢 |
| 8.3 | **PitchBook Real Estate Tech** | pitchbook.com | Daily | **Paid premium** | Alto | 🔴 |
| 8.4 | **TechCrunch Real Estate** | techcrunch.com/category/real-estate | Daily | Free | Alto | 🟢 |
| 8.5 | **The Information** | theinformation.com | Daily | Paid sub | Alto | 🟡 |
| 8.6 | **Built In Tech** | builtin.com | Daily | Free | Medio | 🟢 |
| 8.7 | **GeekWire** | geekwire.com | Daily | Free | Medio (Seattle proptech) | 🟢 |
| 8.8 | **Proptech Connect** | proptechconnect.com | Weekly | Free + events | Medio | 🟢 |
| 8.9 | **Center for Real Estate Technology Innovation (CRETI)** | creti.io | Quarterly | Free | Medio | 🟢 |
| 8.10 | **MIT Center for Real Estate** | mitcre.mit.edu | Quarterly | Free papers | Alto (academic · innovation) | 🟢 |

---

## TIER 9 — Sustentabilidad / ESG / Smart Cities (diferenciador premium)

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 9.1 | **ULI Urban Land Institute** | uli.org | Quarterly | Free + member | **Muy alto** (Emerging Trends US-LATAM-Asia) | 🟢 |
| 9.2 | **LEED USGBC** | usgbc.org/leed | Monthly | Free + paid certification | Alto (certifs LEED MX trackeable) | 🟢 |
| 9.3 | **BREEAM** | breeam.com | Monthly | Free + paid | Bajo (Europa-focus) | 🟡 |
| 9.4 | **WELL Building Standard** | wellcertified.com | Monthly | Free + paid | Medio | 🟢 |
| 9.5 | **GRESB Real Estate ESG** | gresb.com | Annual | Paid premium | Alto (FIBRAs MX evaluadas) | 🔴 |
| 9.6 | **Smart Cities Council** | smartcitiescouncil.com | Monthly | Free + paid | Medio | 🟢 |
| 9.7 | **C40 Cities Climate** | c40.org | Annual | Free | Alto (CDMX miembro · clima vivienda) | 🟢 |

---

## TIER 10 — Indicadores Macro Cruzados (no RE puro pero clave para narrativa)

| # | Fuente | URL | Frecuencia | Acceso | Cruzabilidad MX | Status |
|---|---|---|---|---|---|---|
| 10.1 | **Banxico Inflación + Tasas** | banxico.org.mx | Daily | Free API | ✅ W4.18 | 🟢 |
| 10.2 | **INEGI Inflación + PIB** | inegi.org.mx | Monthly | Free API | Alto (cruce con vivienda) | ⏳ |
| 10.3 | **AMPI Encuesta Confianza** | ampi.org | Quarterly | Member | Alto | ⏳ |
| 10.4 | **CNBV Crédito Hipotecario** | cnbv.gob.mx | Monthly | Free | **Muy alto** (volumen + tasa hipotecaria) | ⏳ |
| 10.5 | **STPS Empleo + Salarios** | stps.gob.mx | Monthly | Free | Alto (poder adquisitivo vivienda) | ⏳ |
| 10.6 | **SCT Infraestructura (Línea 12 Metro · L1 nueva · etc.)** | sct.gob.mx | Variable | Free | **Muy alto** (impacto plusvalía zonas) | ⏳ |

---

## TIER 11 — Twitter/X & Newsletters Especialistas (curación señal-ruido)

| # | Fuente | Handle/URL | Tipo | Cruzabilidad MX | Status |
|---|---|---|---|---|---|
| 11.1 | **@CBRE @JLL @Cushman_Wake @Colliers** | Twitter corporate | Press releases inmediato | Alto | 🟢 |
| 11.2 | **@Zillow_Research** | Twitter | Data drops mensuales | Medio | 🟢 |
| 11.3 | **The Carta (RE Newsletter)** | thecarta.com | Weekly newsletter | Medio | 🟢 |
| 11.4 | **Compound (Drew Pelton)** | compoundwriting.com | Weekly | Medio (US CRE) | 🟢 |
| 11.5 | **Trepp CMBS Updates** | trepp.com | Weekly | Bajo (US CMBS) | 🟢 |
| 11.6 | **The Roundtable USRE** | usrealtytable.com | Weekly | Medio | 🟢 |
| 11.7 | **PropTech Today (Substack)** | proptechtoday.substack.com | Weekly | Alto (proptech founders interviews) | 🟢 |
| 11.8 | **Inmobiliare Newsletter MX** | inmobiliare.com/newsletter | Weekly | **Muy alto** | 🟢 |

---

## TIER 12 — FIBRAs & REITs Comparables (data financiera pública)

| # | Instrumento | Ticker | Acceso data | Cruzabilidad MX | Status |
|---|---|---|---|---|---|
| 12.1 | **FIBRA UNO** | FUNO.MX | BMV API + 10-K-equivalent | **Muy alto** (cap rates oficinas/retail/industrial CDMX) | 🟢 |
| 12.2 | **FIBRA Macquarie** | FIBRAMQ.MX | BMV API | **Muy alto** (industrial MX) | 🟢 |
| 12.3 | **FIBRA Inn** | FINN13.MX | BMV API | Alto (hospitalidad) | 🟢 |
| 12.4 | **FIBRA Monterrey** | FIBRAMTY.MX | BMV API | Medio | 🟢 |
| 12.5 | **FIBRA Hipotecaria CIBanco** | FHIPO14.MX | BMV API | Alto (mortgage-backed MX) | 🟢 |
| 12.6 | **REIT US comparables** (AVB, EQR, MAA, INVH) | NYSE | SEC EDGAR API | Medio (narrativa "MX vs USA cap rates") | 🟢 |

---

## Plan de ejecución (W5.20-21 Wave 5 H2)

### Fase 1 — Verificación (Sub-A · 4h founder + Claude Code)
- Founder + yo: revisamos los 80+ fuentes de este doc en sesión 4h
- Por cada fuente: confirmar acceso · documentar API endpoint o método scraping · costo · ToS legal
- Output: tabla actualizada con status 🟢/🟡/🔴 final · prioridad ingest pipeline

### Fase 2 — Tier prioridad (resultado esperado de Fase 1)
- **Tier prioritario inicial (~25 fuentes 🟢)**: APIs gratis · scraping legal · alto cruce MX
  - BIS · OECD · IMF · World Bank · FRED (macro globales)
  - BANXICO ✅ · INEGI · SHF · CONAVI · BMV FIBRAs · CNBV (México)
  - JLL · Knight Frank · Savills · CBRE · Cushman · Colliers · PwC · Deloitte (consultoras free reports)
  - Numbeo · Global Property Guide · Zillow · Redfin (aggregators US/global free)
  - Inmobiliare · Obras Web · Expansión · El Financiero · Forbes MX (prensa MX)
  - ULI · ArchDaily (lifestyle/sustentabilidad selectivos)

- **Tier secundario (~30 fuentes 🟡 · diferido a Wave 6)**: paywalls parciales · scraping con throttle · curación manual

- **Tier rechazado (~25 fuentes 🔴/⛔)**: paid premium $$$$ · competidores directos MX · ToS prohíbe

### Fase 3 — Implementación pipeline (Sub-B · 8h)
- `/insights-wiki/raw/{tier}_{fuente}/` — 25 carpetas crudo por fuente prioritaria
- Cron weekly Claude Code skill `bulk_ingest_insights` itera fuentes activas
- Lint pass: detecta archivos huérfanos · sintetiza a `wiki/insights/{slug}.md` con cross-refs

### Fase 4 — Sync Backend público (Sub-C · 12h)
- Wiki publicado → MongoDB `knowledge_articles` collection
- `/insights` blog SEO público con sitemap dinámico
- Atlax 17vo tool dual-mode (wiki paths + DB semantic)

### Fase 5 — Upgrades Tier 1 (Sub-D · 9h)
- AI-assisted authoring (Haiku) · PDF lead magnet · citation widget asesor · Atlax cited badge · newsletter wire-up

**Total W5.20-21: 33h** (sin Sub-A 4h founder ops · 8h scrapers + 12h backend + 9h upgrades + 4h Atlax tool)

---

## Reglas operativas (NO violar)

1. **NO scrapear competidores MX** (`feedback_no_scraping_competitors.md`): Inmuebles24 · Lamudi · Vivanuncios · Propiedades.com · Casas y Terrenos · Trovit · Mitula · Vivareal · Lifull
2. **NO publicar data raw paywall** (Bloomberg/FT/WSJ press → solo cita + link, no copy/paste artículo completo)
3. **Respetar robots.txt** + ToS de cada sitio · throttle conservative (1 req/30s mínimo)
4. **Archive.org snapshot** cada fuente citada (auditabilidad investor-grade)
5. **LFPDPPP**: NO ingestar PII · solo data agregada/anonimizada
6. **Source attribution obligatoria**: cada artículo `wiki/insights/*.md` debe citar fuente original con URL + fecha consulta + archive.org link

---

## Próximos pasos

1. Founder revisa este doc · marca fuentes que conoce/usa hoy y aporta missing
2. Sesión Fase 1 (4h) Verification con founder + Claude Code
3. Output: tabla final 🟢 25-30 fuentes prioritarias para Sub-B implementation
4. W5.20-21 emit prompts cuando llegue Wave 5 H2 (post-launch público)
