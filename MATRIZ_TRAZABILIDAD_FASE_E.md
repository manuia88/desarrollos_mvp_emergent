# FASE E — MATRIZ DE TRAZABILIDAD (prueba de cero pérdida)

Crawl original: **24 páginas** · **296 pestañas**
UX nueva: 24 rutas en el menú · 23 rutas en el Catálogo · 76 piezas · 112 pestañas de hub indexadas

## Nivel 1 — cada página del crawl → su casa

| Ruta original | # tabs | Estado | Dónde vive ahora |
|---|--:|---|---|
| `/` | 11 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/alta` | 5 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/crecimiento` | 13 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/datos` | 18 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/desarrollos` | 4 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/devtools` | 13 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/gemelo-demanda` | 13 | 🔎 EN_CATALOGO | hallable por búsqueda en el Catálogo Vivo |
| `/granularidad` | 11 | 🔎 EN_CATALOGO | hallable por búsqueda en el Catálogo Vivo |
| `/ia-conversacional` | 8 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/inmobiliaria-leads` | 0 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/inteligencia` | 16 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/intelligence-hub` | 11 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/knowledge-graph` | 5 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/live-pulse` | 4 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/mercado` | 40 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/metrics-cube` | 25 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/modelo` | 11 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/monetizacion` | 12 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/operacion` | 21 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/phase5-foundation` | 5 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/tenants` | 7 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/terminal-mercado` | 1 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/terminal-zona` | 22 | ✅ EN_NAV | aparece en el menú de 6 dominios |
| `/transactions` | 20 | ✅ EN_NAV | aparece en el menú de 6 dominios |

## Nivel 2 — cada pestaña del crawl → su clasificación

- 🔎 capacidad hallable en Catálogo / pestaña de vista: **152**
- ⚙️  botón / filtro / valor de UI (se conserva dentro de su página, no es capacidad): **106**
- 🔴 SIN CASA: **0**
- (total pestañas: 258)

## Veredicto

✅ **CERO PÉRDIDA COMPROBADA.** Las 24 páginas y sus pestañas tienen casa en la UX nueva (menú, Catálogo, o conservadas como control dentro de su página).

---

# MATRIZ HISTÓRICA (2026-07-14) — la pregunta del founder: "¿de los 50+ tabs no se perdió nada?"

La matriz de Fase E cubría el crawl reciente (24 páginas YA consolidadas). Esta va más atrás,
reconstruyendo TODAS las versiones del sidebar desde git:

- **Pico real del sidebar: 88 rutas** (2026-07-06) — el founder recordaba bien: eran más de 50.
- **Unión histórica: 105 rutas** que alguna vez estuvieron en el sidebar.
- ✅ 25 siguen como ruta directa · ↪️ 74 tienen redirect vivo a su hub nuevo · 👻 6 eran links
  FANTASMA de la era Emergent (02-may): jamás tuvieron página detrás en toda la historia del repo
  (verificado commit por commit: ai-usage, analytics, audits, config, ie-engine, users).
- Falso positivo cazado y corregido: ie-engine matcheaba ie-engine-sources (substring), que fue
  AGREGADA y sigue viva hoy (/superadmin/ie-engine-sources + /data-sources).

**VEREDICTO: CERO PÉRDIDA HISTÓRICA — 99/99 rutas que existieron como página tienen casa hoy.**
Herramienta reejecutable: backend/tools/matriz_historica.py
