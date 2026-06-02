# DEV · Visión UX (EasyBroker-simple, estética DMX) — pre Paso C
**2026-06-02.** Responde 3 preguntas del founder antes de rediseñar tabs por dentro:
qué se fusiona · cómo mejorar UX/UI atómicamente · si ya despertamos TODAS las features.
Filosofía rescatada (`EASYBROKER_UX_PATTERNS.md` + `REDESIGN_ASESOR_BLUEPRINT.md`):
**"facilidad de EasyBroker + estética DMX"** = repetir el MISMO esqueleto en cada pantalla
(no copiar el look azul de EB). Mismo gold-standard que Mis Leads.

═══════════════════════════════════════════════════════════════════
## 1 · FUSIÓN DE TABS (9 hoy → 7 · más EasyBroker-simple)
═══════════════════════════════════════════════════════════════════
| Hoy (sidebar V2) | Propuesta | Cambio |
|---|---|---|
| Inicio | **Inicio** | igual |
| Mis Proyectos | **Mis Proyectos** (centro) | igual · ancla |
| CRM & Leads + Mensajes | **CRM & Leads** | FUSIÓN · Mensajes = pestaña dentro (inbox vive con leads, como EB) |
| Inteligencia | **Inteligencia** | igual (hub) |
| Red comercial + Operación(Solicitudes/Disputas) | **Red comercial** | FUSIÓN · Solicitudes y Disputas entran aquí (son gestión de equipo/leads) |
| Studio + Mini Market | **Marketing** (Studio + Mini Market) | FUSIÓN · todo lo de difusión junto |
| Ajustes | **Ajustes** | igual |
**Resultado: 9 → 7 entradas.** Mensajes y Operación dejan de ser top-level (se absorben). Sin features perdidas (todo queda como pestaña del hub que le toca).

═══════════════════════════════════════════════════════════════════
## 2 · ¿YA DESPERTAMOS TODAS LAS FEATURES? — NO (solo el menú)
═══════════════════════════════════════════════════════════════════
| Capa | Estado |
|---|---|
| 9 pantallas que estaban fuera del menú | ✅ Despiertas (Paso B las puso en el sidebar) |
| Suite IA agéntica (DISC, ruteo, dossier, bandeja) | ⬜ DORMIDA (flag `agentic_enabled=off` + paneles no montados en portal dev) |
| 10 motores sin UI (what-if, comparador, inversión, pulso, forecast real, AVM…) | ⬜ DORMIDOS (no tienen pantalla dev) |
| 27 endpoints huérfanos (atribución, mitad A/B, run-history…) | ⬜ DORMIDOS (sin botón) |
| 2 pantallas con datos falsos (Demanda random, AVM por unidad = adivinanza LLM) | ⬜ por cablear motor real |
**Conclusión:** Paso B despertó la NAVEGACIÓN. Lo profundo (IA + motores + endpoints) se despierta en **Paso C**, enganchado dentro del tab que le toca (NUNCA como feature huérfana).

═══════════════════════════════════════════════════════════════════
## 3 · MEJORA UX/UI ATÓMICA = Sistema de Diseño compartido (reusar Mis Leads)
═══════════════════════════════════════════════════════════════════
Ya existen en `components/asesor/design/`: ActionBar · ViewToggle · StatusDot · ScoreBar · Ficha360.
**Atómico = aplicar los MISMOS componentes a cada pantalla Dev** (no inventar layout por pantalla).
| Patrón EB (comportamiento) | Componente a reusar | En Dev se ve en |
|---|---|---|
| Barra de acción idéntica (+Agregar·Buscar·Filtros·Vista·Ordenar) | `<ActionBar>` | toda lista (proyectos, leads, unidades, competidores) |
| Toggle Lista \| Kanban \| Mapa mismo lugar | `<ViewToggle>` | proyectos, leads, inventario |
| Dot de color semántico de estatus | `<StatusDot>` | estatus proyecto/unidad/lead |
| Barra/estrellas de score con significado | `<ScoreBar>` | health score, IE score, lead score |
| Ficha 2 columnas, todo a la vista | `<Ficha360>` | proyecto, unidad, lead |
| 2 quick actions fijas en cada card | (quickActions) | cada card de proyecto/lead |
| Contadores en todo · 1 CTA primario · copy humano es-MX | regla transversal | todas |
**Vestido visual: 100% DMX** (aurora #6366F1→#EC4899, glassmorphism, NO el azul de EB).

═══════════════════════════════════════════════════════════════════
## 4 · NECESIDADES/COMENTARIOS RESCATADOS (lo que pediste poco a poco)
═══════════════════════════════════════════════════════════════════
- Fácil como EasyBroker (mismo esqueleto repetido) PERO con estética DMX, no su look.
- Un componente por elemento (lección Mis Leads · el diseño NO depende del demo).
- Cero ruido: eliminar widgets vacíos · solo lo que aporta a la jornada.
- Cada dato accionable en 1 tap · pipeline que se actualiza solo (no clicks manuales).
- IA invisible (aparece cuando aporta, el usuario no escribe prompts).
- Construir para el estado final HOY (todos los campos/vistas, conectores stub).
- NO features huérfanas (cada función nueva con su pantalla/route real).
- Arreglar datos falsos (Demanda random → motor real) y links rotos (Cash Flow 404).
- Nombres claros / copy humano (sin jerga).

Relacionado: `DEV_REDESIGN_TRACKER.md`, `EASYBROKER_UX_PATTERNS.md`, `REDESIGN_ASESOR_BLUEPRINT.md`, `DEV_HIDDEN_FEATURES_MAP.md`.
