# W5.12 · Knowledge Graph property-centric MX (Cherre-style) · Spec canónico

**Última actualización**: 2026-05-17 (rescatado de sesiones 2026-05-10/12 por Agent forense)

**Doc canónico** que define qué construimos en W5.12. Origen, scope, decisiones founder y conexiones cross-modules.

---

## 0 · Origen (trazable)

| Fecha | Sesión | Evento |
|---|---|---|
| 2026-05-07 | `6222b9fb` | "Tenant Knowledge Graph viz" mencionado y **DESCARTADO** ("pretty viz · limited utility operacional") — concepto distinto del actual |
| 2026-05-10 00:06 UTC | `c5e6246e` + `760b7418` | **NACIMIENTO REAL** — análisis competitivo LocalLogic vs Cherre vs HouseCanary vs CoStar · gap "DMX hoy ❌ FALTA" identificado |
| 2026-05-10 00:29 UTC | `c5e6246e` | Claude propuso bajar a 12h "versión mínima" argumentando over-engineering H1 |
| 2026-05-10 00:36 UTC | `c5e6246e` | **Founder PUSH BACK**: "el músculo se construye temprano" · subido a 30h completo · **regla nueva**: "si da valor superadmin aunque sea poca data hoy, vale construirlo" |
| 2026-05-12 | `b5ec2643` | Scope formalizado canónico (ver §2) |
| 2026-05-16 | `b5ec2643` | Round-up cosmético 30h → ~35h (buffer 16%, NO re-scoping) |

---

## 1 · Por qué KG (el caso competitivo)

```
LocalLogic     ❌ NO tiene KG
Cherre         ✅ KG core (su diferenciador)
HouseCanary    ⚠️ relacional (no graph)
CoStar         ⚠️ relacional
DMX hoy        ❌ FALTA
```

**Query ejemplo founder** (caso de uso real superadmin):

> *"Muéstrame todos los proyectos de la desarrolladora VINTE en zonas score A con compradores que vieron Polanco One últimos 30 días + intent agendar cita"*

- **Hoy con relacional**: 5+ JOINs pesados, query lenta (>2s · puede explotar a >10s)
- **Con KG**: 1 query semántica multi-hop Cypher · <500ms target

---

## 2 · Scope canónico (acordado 2026-05-12)

| Dimensión | Decisión |
|---|---|
| **Stack** | Neo4j O Memgraph (TBD founder · ver §6 decisión pendiente) |
| **Surface** | **Backend-only** · superadmin Cypher queries · UI consumer = H2 (NO H1) |
| **Datos** | **NO duplica** · crea índices grafo sobre collections core existentes |
| **Entidades core** | `projects · units · dev_orgs · zones · comparables · leads · behavioral · IE_scores` |
| **Permission gate** | superadmin only · audit log inmutable cada query (reuse W5.11 P1) |
| **Métrica éxito** | 100% entidades core indexadas · latency p95 <500ms |
| **Fallback** | Neo4j/Memgraph cae → queries SQL relacional (slow OK · NO es source of truth) |
| **Sync mode** | Cron rebuild nightly + event-driven incremental para nodos críticos (leads/transactions) |

---

## 3 · Schema KG (nodos + edges propuestos)

### 3.1 Nodos (8 tipos)

| Node type | Source collection | Key properties |
|---|---|---|
| `Project` | `developments` | id, name, dev_org_id, zone_slug, type, status |
| `Unit` | `units` | id, project_id, m2, price, status |
| `DevOrg` | `inmobiliarias` / `dev_organizations` | id, name, role (dev/inmobiliaria), founded_year |
| `Zone` | `zones` (sub-scores) | slug, alcaldia, scores (6 dimensions), tier |
| `Comparable` | `transactions_history` | id, price_per_m2, year, source |
| `Lead` | `leads` | id, status, score, client_global_id |
| `BehavioralSession` | `behavioral_tracking_*` | session_id, user_id, intent, source |
| `IEScore` | `intelligent_explorer_scores` | id, score, dimensions |

### 3.2 Edges (10 tipos)

| Edge type | From → To | Cardinality |
|---|---|---|
| `OWNED_BY` | Project → DevOrg | many-to-one |
| `LOCATED_IN` | Project → Zone | many-to-one |
| `HAS_UNIT` | Project → Unit | one-to-many |
| `INTERESTED_IN` | Lead → Project | many-to-many |
| `REPRESENTS` | Lead → BehavioralSession | one-to-many |
| `VIEWED` | BehavioralSession → Project | many-to-many |
| `SCORED_BY` | Project → IEScore | one-to-many |
| `COMPARABLE_TO` | Project → Comparable | many-to-many |
| `IN_SAME_ZONE_AS` | Project → Project (via Zone) | derived |
| `DUPLICATE_OF` | DevOrg → DevOrg (W5.11 entity resolution) | many-to-many |

---

## 4 · Stack: Neo4j vs Memgraph (decisión pendiente §6)

| Criterio | Neo4j | Memgraph |
|---|---|---|
| Madurez | ⭐⭐⭐⭐⭐ (since 2010) | ⭐⭐⭐ (since 2016) |
| Cypher compatibility | Native | 100% compatible |
| Latency | ms-range | sub-ms (in-memory) |
| Persistence | disk + memory | in-memory + WAL |
| Operability MX | docs en español OK | menos comunidad |
| Self-host Hostinger KVM | OK (Docker) | OK (Docker · más RAM) |
| Free tier | Community 5.x OK | Open Source OK |
| **Recomendación** | si priorizas estabilidad + comunidad | si priorizas latency raw |

---

## 5 · Cierre ciclos cross-modules (NO aislado)

**Alimentan al KG**:
- ✅ W5.11 entity_resolution → edges `DUPLICATE_OF` entre dev_orgs/contactos
- ✅ W5.11 client_global_id hash → unifica Lead nodes cross-project
- ✅ W5.2 zone subscores → properties de Zone nodes
- ✅ W5.3 forecast → property `forecast_12m_pct` en Zone nodes
- ✅ W5.1 AVM → property `avm_value` en Project nodes
- ✅ Behavioral tracking (Phase Y) → BehavioralSession nodes
- ✅ DATA_SOURCES.md transacciones notariales → Comparable nodes

**Consumen el KG** (H1 superadmin only · H2 expansion):
- 🔜 Atlax IA (multi-hop reasoning)
- 🔜 Asistente comprador (recomendaciones contextuales · "similar a lo que viste")
- 🔜 BuyerCoach (escenarios cross-zone)
- 🔜 Investment Simulator (compara proyectos vía similar_to)
- 🔜 Smart Notifications (alertas relacionales · "VINTE lanzó proyecto en tu zona favorita")
- 🔜 Site Selection (zonas similares)
- 🔜 Buyer Score W5.4 (similar buyers via graph)
- 🟢 H1 superadmin only: `/superadmin/kg-query` console Cypher

---

## 6 · Decisiones pendientes (founder)

1. **Neo4j vs Memgraph** (ver tabla §4) · recomendación master = **Neo4j Community 5.x** (más maduro · comunidad en español · DevOps simpler)
2. **30h o 35h con buffer** · realista = 30h scope canónico · 35h = buffer 16% que da margen para edge cases
3. **¿1 batch o partir en 2?** · 30-35h en 1 batch viola "≤120 líneas prompt emergent" · recomendación = partir en 2:
   - **W5.12 P1** Backend KG (schema + ETL + sync + Cypher engine) ~20h
   - **W5.12 P2** UI superadmin query console + monitoring + audit ~10-15h

---

## 7 · Hosting + ops

- **Local dev**: Docker compose con Neo4j Community 5.x (puerto 7687)
- **Producción**: self-host Hostinger VPS Hostinger KVM 2 (mismo VPS que Baileys WhatsApp si compatible · sino dedicado)
- **Backups**: dump.cypher nightly cron → S3-compatible (Hostinger object storage)
- **Auth**: superadmin only · bearer token via permissions.py guard

---

## 8 · Reglas inviolables (NO cambiar sin founder)

1. **NO source of truth**: Mongo es source of truth · KG es índice
2. **Fallback obligatorio**: si KG cae → SQL relacional sigue funcionando (degraded mode)
3. **NO UI consumer H1**: solo superadmin Cypher queries
4. **Permission gate**: superadmin only · audit log cada query
5. **Sync nightly OBLIGATORIO** + event-driven para leads/transactions
6. **NO duplicar data**: solo índices grafo sobre collections existentes
