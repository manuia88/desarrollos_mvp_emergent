# Checklist de deploy — Mapa de Valores + AVM + Cerebro (2026-06-17)

Acciones del founder al desplegar (lo que NO puede hacer Claude Code, son decisiones/infra de nube).

## 1. Variables de entorno (CRÍTICO)
| Var | Valor | Por qué |
|---|---|---|
| `DB_NAME` | `desarrollosmx` | **La BD unificada con TODO** (catastro 1.09M + leads + colonias). Si apunta a otra → mapa/leads vacíos SIN error (endpoints fail-open). Ya está en `.env` y `.env.local`; confirmar en la nube. |
| `CEREBRO_ENABLED` | `true` (cuando decidas prenderlo) | Loop agéntico (asesor E0-E6 + comprador find_home). Hoy OFF en deploy por decisión tuya. El veteo de Atlax en la ficha NO depende de este flag (usa buy-signal público). |
| `NEO4J_URI` / `NEO4J_PASSWORD` | bolt://<host>:7687 / <pass> | KG Terminal. Sin Neo4j provisionado → endpoints 503 fallback (no rompe). |

## 2. Pipeline de datos (reproducible · correr una vez post-deploy)
Todo idempotente. Orden:
1. **Catastro** (`catastro_sig_engine`): `ingest_alcaldia` + `ingest_shapefile_coords` + `ingest_shapefile_polygons` + `spatial_join_predios` + `build_index_by_iecm` + `ingest_units` por las 16 alcaldías. → 1.09M predios + colonia_catastro_byid.
2. **Scores de zona** (`zone_data_cron.run_zone_data_chunk` en bucle hasta `faltan_sin_tocar=0`): llena OSM+FGJ → scores_reales (~84%).
3. **Fallback de scores** (el 16% sin señal): por cada colonia con geometry sin scores_reales → heredar mediana de su alcaldía, `scores_es_estimado=true`, `scores_source='alcaldia_fallback'`. → 100% cobertura (marcado estimado).
4. **Acentos**: aplicar el diccionario de tokens a `db.colonias.name` (Hipódromo, Cuauhtémoc, Álvaro Obregón…). 786 nombres.
5. **Comps de mercado** (`market_comps_seed.seed(db)`): carga `data_market_comps.json` → 205 colonias con $/m² real + avm_base + premium_zona.

## 3. Pendientes que necesitan ESCALA de datos (no son deuda, esperan volumen)
- **KG edges + lookalike**: el grafo está poblado (nodos) pero los edges/embeddings brillan con volumen de cierres/swipes. Crecen solos al usar la app.
- **Precio de CIERRE real → AVM**: el moat. `on_deal_closed` ya ingesta cada operación cerrada → DRPI → AVM. El AVM pasa de "oferta" a "mercado real" conforme entran cierres. Hoy estima oferta (como Monopolio).

## 4. Optimizaciones diferidas (medidas · no mueven la aguja hoy)
- **Vector tiles** (tippecanoe): el viewport sirve 2,500 predios en 0.34s / 1.5MB — suficiente. Tiles = escala futura, necesita instalar tippecanoe + infra de tiles.
- **Features por-propiedad en el AVM** (amenidades/visión): medido +0.5% de mejora — bajo el piso de ruido (~14% ceiling, ni Monopolio baja). No vale el re-scrape.
