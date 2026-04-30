# DesarrollosMX (DMX) — Product Brief

> Plataforma AI-native de Spatial Decision Intelligence para real estate residencial nuevo. Único LATAM. Stack libre — tú eliges el más adecuado.

## 1. Identidad

| | |
|---|---|
| **Nombre** | DesarrollosMX (DMX) |
| **Categoría** | Spatial Decision Intelligence Platform |
| **Mercado** | Real estate residencial nuevo (preventa + secundaria) |
| **Diferencial principal** | AI-native: copilot persistente, búsqueda lenguaje natural, scoring AI por colonia, video AI inmobiliario, document intelligence, voice-first donde aplique |
| **Moonshot** | $1-5B valuation 3-5 años vía datos temporales acumulados (moat irrepetible) |
| **Inspiración** | CoStar (analytics CRE) + Vivanuncios/Inmuebles24 (marketplace) + Salesforce (CRM) + Plaid/Stripe (APIs platform play) |

## 2. Países e idiomas

| País | Foco | Idioma |
|---|---|---|
| México | CDMX | es-MX |
| Emiratos Árabes Unidos | Dubai | en-US |

Cada usuario ve UI en su idioma. Datos pueden ser bilingües (ej. amenidades en es-MX y en-US).

## 3. Stack

**Stack libre — emergent.sh decide la mejor opción**. Único requerimiento técnico: type-safe APIs + autenticación robusta + multi-tenant data isolation + server-side rendering.

## 4. Portales (4)

| Portal | Audiencia | Acceso |
|---|---|---|
| **Público** | Cualquiera (sin login) | URL raíz, marketing, listings, blog, reportes gratis colonia, lead magnets |
| **Privado Comprador** | Cliente final que busca propiedad | Login limitado: saved searches, alertas, comparador, tours, chat con asesor |
| **Privado Asesor** | Brokers individuales + Master Brokers (agencias) | Login completo: CRM Pulppo+, marketplace, IE Score, reportes, comisiones, DMX Studio |
| **Privado Desarrollador** | Empresas constructoras/desarrolladoras | Login completo: inventario tiempo real, demand heatmap, dynamic pricing, M21 reportes IA, site selection AI |

Adicional H1: **APIs B2B + Public Widgets embebibles** (banco/FIBRA/fintech embebe `<DMXSearch />` en su sitio — Stripe-style platform play).

## 5. Roles (6)

| Rol | Permisos resumen |
|---|---|
| **Público (no auth)** | Ver listings públicos + reporte gratis colonia + quiz colonia |
| **Comprador** | Saved searches + alertas + comparador + chat con asesor + wrapped anual |
| **Asesor** | CRM personal + leads asignados + marketplace + DMX Studio (su plan) + comisiones propias |
| **Asesor Admin (Master Broker)** | Gestiona equipo asesores + leads agencia + reportes equipo + override comisiones split |
| **Desarrolladora Admin** | Gestiona inventario propio + asesores aliados (project_brokers) + analytics + dynamic pricing + reportes |
| **Superadmin** | Todo + admin platform-wide + impersonate + override RLS |

## 6. Seguridad inviolable

| Regla | Detalle |
|---|---|
| **Multi-tenant data isolation** | Cada desarrolladora ve SOLO sus proyectos/unidades/leads. Cada asesor ve SOLO sus contactos. Aislamiento a nivel base de datos (no app-level filters). |
| **RBAC granular** | Permisos por rol y por recurso. Ningún rol puede escalar privilegios. |
| **Single-session enforcement** | Si la cuenta inicia sesión nueva y ya hay sesión activa, **la sesión vieja se cierra automáticamente**. Detecta vía device fingerprint + websocket presence. |
| **Anti-scraping** | Rate limiting per IP + bot detection (Cloudflare/Turnstile o similar) + honeypots + watermarks dinámicos en fichas/PDFs con nombre cliente. |
| **Audit log** | Toda mutación crítica (operaciones, comisiones, cambios precio, exports CSV) queda registrada con user + timestamp + diff. |
| **MFA opcional** | El usuario puede activarlo en /profile/seguridad. NO se fuerza al login. |
| **PII protection** | Cifrado at-rest. Datos sensibles (RFC, CFDI, escrituras) con visibility default `dev_only` — acceso a otros roles requiere opt-in explícito. |
| **GDPR/LFPDPPP-lite** | Export user data + right to be forgotten endpoints. Compliance MX (LFPDPPP) + UAE (PDPL). |

## 7. Diseño

**Spec exhaustiva en `05_DESIGN_SYSTEM.md`** — design tokens + tipografía + buttons + cards + componentes detallados + copy completo.

Resumen visual core: navy oscuro `#06080F` + cream cálido `#F0EBE0` + gradient único `#6366F1 → #EC4899` + tipografía editorial Outfit/DM Sans + cards hover translateY + animaciones blur+fade+stagger ≤850ms + cero emoji + cero ruido visual.

Construir DMX significa transmitir con la UI que **esto es decisión basada en datos, no marketing inmobiliario tradicional**.

**Adicional — efecto "breath"**: cards principales pueden tener gradient pulsante respiratorio sutil (3-5s) sobre el gradient base. Respeta `prefers-reduced-motion`.

## 8. Roadmap

### H1 — Launch (mercado real, 6-12 meses)

| Bloque | Contenido |
|---|---|
| Foundation | Auth + multi-tenant + i18n + diseño "breath" |
| 4 portales | Público + Comprador + Asesor + Desarrollador funcionales |
| 762 features | Ver `02_FEATURES.md` (catálogo completo) |
| IE Engine N0-N4 | Scoring colonia + proyecto + lead + asesor (ver `03_INTELLIGENCE.md`) |
| DMX Studio v1 | Director IA video inmobiliario (texto → script → voz → avatar → video con music) |
| Document Intelligence | Pipeline AI extracción docs legales/permisos/listas precios + validations + dedupe + Cross-Check |
| Public widgets B2B | 5+ partners H1: BBVA + Santander + Banorte + Citibanamex + FIBRA UNO |
| Marketplace público | Inspiración propiedades.com (mapa heatmap precios m² + sidebar info colonia + IE Score visible) |
| Compliance MX nativa | CFDI 4.0 + Mifiel NOM-151 + RFC + retención ISR + multi-currency MXN/USD/AED |

### H2 — Platform play (12-24 meses post-launch)

- APIs B2B avanzadas (no solo widgets)
- Multi-país expansion (Colombia + Argentina + Brasil + Miami Latinx)
- Wan 2.1 + XTTS + Whisper self-hosted (reduce costos AI 70%)
- Banking integration profunda (SHF + Banxico + bancos directos)
- DocVault público inversionistas
- Inspecciones PWA offline + work orders + portal subcontratistas (post-venta extendido)

### H3 — Moonshot (24-60 meses)

- Digital twin 4D ciudades (3D + tiempo)
- Agentic AI (compras autónomas + negociaciones AI-mediated)
- Fractional investing real estate
- Custom fine-tune dataset propio LATAM (modelos AI propios)
- Multi-país masivo

## 9. Glosario

| Término | Significado |
|---|---|
| **DMX** | DesarrollosMX (la plataforma) |
| **M01-M21** | 21 módulos UI funcionales que el usuario ve. Ver `02_FEATURES.md` |
| **IE** | Intelligence Engine — algoritmos AI scoring 0-100 |
| **IE Score** | Score compuesto colonia/proyecto 0-100 |
| **scoreC01..C20** | Scores específicos (C01 lead score, C02 argumentario, C03 semantic match, etc.) Ver `03_INTELLIGENCE.md` |
| **N0-N5** | Niveles IE (N0 raw → N1 derived → N2 composite → N3 cohort → N4 predictive → N5 AI-narrative) |
| **CRM Pulppo+** | CRM avanzado inspirado en Pulppo con mejoras canon DMX (~80 features extra) |
| **DMX Studio** | Director IA video inmobiliario único LATAM |
| **ACM** | Análisis Comparativo de Mercado — valuación auto de captación |
| **DISC** | Test personalidad comprador (DISC + Big Five híbrido) |
| **CFDI** | Comprobante Fiscal Digital por Internet (factura electrónica MX) |
| **NOM-151** | Norma firma electrónica avanzada MX (Mifiel) |
| **RAG** | Retrieval Augmented Generation (AI con context retrieval) |
| **FX** | Foreign Exchange (conversión MXN/USD/AED) |
| **Captación** | Propietario que quiere vender/rentar (registro asesor) |
| **Búsqueda** | Comprador/inquilino buscando (registro asesor) |
| **Operación** | Venta o renta cerrada (con partes + comisión) |
| **Master Broker** | Agencia con múltiples asesores (admin de equipo) |
| **STR** | Short Term Rental (Airbnb tipo) |
| **C11** | Asistente conversacional comprador (Caya-style) |
| **A11** | Ficha Cualquier-Link branded asesor |
| **G1** | Public widgets B2B platform play |

## 10. Metas H1 (cuantitativas)

| Métrica | H1 target |
|---|---|
| Usuarios activos asesores | 1,000 |
| Usuarios activos compradores | 50,000 |
| Desarrolladoras activas | 50 |
| Proyectos en inventario | 500 |
| Unidades indexadas | 50,000 |
| Operaciones cerradas (proxy GMV) | 1,000 |
| Partners B2B widgets | 5 |
| Países activos | 2 (MX + UAE) |
| Idiomas activos | 2 (es-MX + en-US) |

## 11. Documentos restantes

- `02_FEATURES.md` — catálogo completo 762 features (D Developer + A Asesor + C Cliente + S Studio + extras)
- `03_INTELLIGENCE.md` — IE Engine: 118-125 scores + 18 fuentes datos + game-changers + moats
- `04_UI_DATA_REF.md` — UI ref propiedades.com (mapa heatmap) + 3 flows usuario
- `05_DESIGN_SYSTEM.md` — design system canon: tokens + tipografía + buttons + cards + componentes detallados + copy completo

**Orden de lectura recomendado**: 01 → 05 (design system, leer ANTES de construir UI) → 02 (features) → 03 (intelligence) → 04 (UI flows).
