# EasyBroker · Teardown de UX/UI (simplicidad) → Reglas para el rediseño asesor

> 2026-05-29 · Foco del founder: NO features (DMX ya tiene más), sino **por qué EB se SIENTE fácil** y DMX se siente difícil. Método: módulo por módulo viendo frames reales (~/Desktop/EasyBroker-Teardown/frames/). Esto alimenta el Sistema de Diseño del rediseño (ASESOR_REDESIGN_APPROVED.md). Nota: la idea del "link Tinder" viene de **Pulppo** (competidor que sí lo tiene), validada.
> Tesis: EB no es mejor por tener menos — es fácil porque **repite el MISMO esqueleto en cada pantalla**. DMX tiene más features pero cada pantalla se ve/funciona distinto → carga cognitiva. Rediseño = vestir las features de DMX con el esqueleto de simplicidad de EB.
>
> **PRINCIPIO CLAVE (founder 2026-05-29):** se toma la **FACILIDAD/comportamiento** de EB, **NO su LOOK**. Al founder NO le gusta la estética de EB (azul corporativo plano). El vestido visual es **100% DMX**: aurora #6366F1→#EC4899, cards premium con profundidad/glassmorphism, tipografía DMX, microcopy es-MX (= el diseño de Leads aprobado en ASESOR_REDESIGN_APPROVED.md). **Fórmula: facilidad de EB + estética DMX = brutalmente funcional + hermoso.** En las tablas de abajo, la columna "patrón EB" describe el *comportamiento* a replicar; el *look* siempre se renderiza en estilo DMX, nunca copiando los colores/estética de EB.

## MÓDULO 1 · CONTACTOS (frames analizados)
Frames: ficha `zlw06tCunZ0/0012`, kanban `-9aIyB3S60o/0004`, tabla `axUYIkG6r4Y/0004`.

### 10 patrones de simplicidad (transversales — aplican a TODO el módulo)
| # | Patrón EB | Regla rediseño DMX | Anti-patrón DMX actual |
|---|---|---|---|
| 1 | Barra de acción IDÉNTICA por pantalla: `+Agregar · Buscar · Filtros(dropdowns) · Toggle vista · Ordenar` | Componente único `<ActionBar>` reutilizado en cada pantalla del asesor | Cada pantalla con layout propio → reaprendizaje |
| 2 | Toggle `Lista \| Pipeline` mismo lugar, misma data | Toggle de vista estándar arriba-derecha (Leads usa Pipeline/Lista; ya en plan) | Pantallas separadas / inconsistencia |
| 3 | Acciones = fila de íconos + label visibles (Estatus/Probabilidad/Asignar/Email/Editar/Eliminar) | Barra de acciones horizontal ícono+label, nada en menús ocultos | Botones perdidos, "⋮" escondido |
| 4 | Ficha = 1 pantalla, 2 columnas (izq: datos+tabs Historial/Interés/Relacionados; der: "＋Agregar descripción/tarea/alerta/fecha") | Drawer/ficha 360° en 2 columnas, todo a la vista, sin scroll de profundidad | Cajas grises planas + media pantalla vacía |
| 5 | Color semántico MÍNIMO: dot de estatus (gris=Nuevo, morado=Contactado, verde=Activo, ámbar=Futuro, azul=Cerrado) + estrellas probabilidad | Paleta semántica fija de estatus (dots) + barra/estrellas score con significado consistente | Slider de score, colores sin sistema |
| 6 | Densidad baja + mucho aire · fondo claro · 1 primario | Espaciado generoso, fondo claro, gradiente aurora SOLO en acentos | Tablas apretadas, columnas vacías frías |
| 7 | Lenguaje humano: "Agregar nota", "Última actividad", "Probabilidad" | Copy es-MX humano, cero tecnicismos, microcopy que explica | "TIMELINE", "CRM·CONTACTOS", jerga |
| 8 | Contadores en todo (224,535 contactos; columnas kanban con número) | Contador en cada lista + cada columna kanban + cada filtro | Sin contexto de volumen |
| 9 | Quick actions universales (📞 + 💬) en CADA card, siempre los mismos | 2 quick actions fijas en toda card de lead/propiedad (Llamar/WhatsApp) | Acciones inconsistentes por pantalla |
| 10 | 1 sola acción primaria azul (`+Agregar`); resto secundarias gris/outline | Jerarquía: 1 CTA primario aurora por pantalla, resto neutro | Todo compite por atención |

### Estructura de la ficha de contacto EB (referencia visual para el drawer 360° del rediseño)
- Header: avatar círculo con iniciales (color) · nombre grande · datos con ícono (email, teléfonos con etiqueta Celular/Trabajo, "Asignada a X el [fecha]", "Vía [fuente]", "Creado [fecha]") · "agregar etiquetas" link sutil.
- Barra de acciones horizontal (ícono + label): Estatus · Probabilidad(★★☆) · Asignar a · Email · Editar · Eliminar.
- Columna derecha: 4 cards "＋ Agregar" (descripción privada / tarea / alerta de nuevas propiedades / fecha).
- Tabs: Historial · Propiedades de interés · Relacionados. CTA "Agregar nota" (azul claro).
- DMX mejora: misma estructura limpia + bloques de inteligencia (lead score explicado, % cierre, conversaciones IA) que se OCULTAN si no hay datos.

### Kanban EB (referencia para Pipeline de Leads)
- Header nav simple + ActionBar (#1). Columnas con **dot de color + nombre + contador**. Card: nombre · inmobiliaria · chips (fuente/país/plan) · 📞 + 💬 redondos. Drag entre columnas. Escaneable.

### Tabla EB (referencia para vista Lista)
- ActionBar + "1–18 de 46 contactos" + **Personalizar(columnas)** + Ordenar. Columnas: Nombre(avatar) · Estatus(dot+texto) · Probabilidad(★) · Asignado a(avatar) · Última actividad(fecha). Filas con aire. Chat de ayuda flotante abajo-derecha.

## PENDIENTE · seguir módulo por módulo (frames reales)
2. Propiedades (ficha-hub, badges estatus, barra de acción, archivar)
3. Búsquedas (filtros chips, mapa split, alertas)
4. Tableros (kanban cliente, shortlist) ← clave para link Tinder
5. Estadísticas/CMA (reporte limpio)
6. Operaciones, 7. Tareas, 8. Dashboard/Inicio, 9. Marketing/portales

Cada módulo: frames → patrones de simplicidad → regla de rediseño DMX → anti-patrón actual.

## CÓMO ALIMENTA EL REDISEÑO
Los 10 patrones = la **base del Sistema de Diseño asesor** (componentes: `<ActionBar>`, `<ViewToggle>`, `<StatusDot>`, `<ScoreBar>`, `<QuickActions>`, `<Ficha360 2-col>`, paleta semántica, jerarquía de CTA, microcopy es-MX). Se construyen una vez y se replican a las 7 secciones → consistencia = facilidad. Conserva el 100% de features de DMX; cambia cómo se SIENTEN.
