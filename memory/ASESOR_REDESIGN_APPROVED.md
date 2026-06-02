# Asesor Redesign · DECISIONES APROBADAS (founder)

> 2026-05-29 · aprobado en chat por founder. NO olvidar. Frontend-only (backend intacto, additive si una pantalla consolidada necesita un read nuevo). Tomar INSPIRACIÓN del superadmin design system, NO duplicar — solo elementos que ayuden al asesor a verse mejor. Asesor tiene su PROPIO sistema de diseño.

## 1 · Mapa de arquitectura APROBADO (10 grupos → 7 + Config)

| # | Grupo | Contiene |
|---|---|---|
| 1 | 🏠 Inicio | Command Center |
| 2 | 👥 Leads | Lista de leads · Búsquedas guardadas |
| 3 | 📅 Agenda | Citas · Tareas |
| 4 | 🏢 Inventario | Desarrollos · Captaciones · Mini Market · Leads de developers |
| 5 | 🤖 IA & Automatización | Agentes IA (+Auto-pilot) · Conversaciones (Playground+Bandeja) · Workflows · Plantillas — **CONSOLIDA** Conversaciones IA + Automatizaciones |
| 6 | 🎨 Marketing | **Crear:** Videos·Carruseles·Landings·Auto-Content·Director IA — **Recursos:** Brand Kit·Assets·Importar — **Difundir:** Anuncios Meta (conectar+campañas) — **CONSOLIDA** Studio + Anuncios Meta con 3 sub-secciones internas |
| 7 | 📊 Mi Negocio | **Resultados:** Comisiones·Ranking — **Análisis:** CMA·Métricas equipo — **Apoyo:** Briefings·Tráfico+Clima·Links |
| — | ⚙️ Configuración (pie) | Mi perfil · Conectar fuentes · ajustes |

- **SOC ELIMINADO** del nav asesor ("no sirve ahorita") — backend intacto, reversible (solo se quita de navByRoleV2).
- "Conectar fuentes" movido de Leads → Configuración (es setup, no día-a-día).
- 0 features eliminadas (excepto SOC del nav) — solo reacomodo. Studio (9) y Performance (8) ahora con sub-secciones internas.

## 2 · Módulo LEADS · diseño APROBADO (mezcla opciones 2 + 3 + 4)

Founder eligió **mezcla de Pipeline (2) + Feed IA (3) + Cards premium (4)**. Descartó split lado-a-lado (1).

### Pantalla principal
- **Toggle arriba:** `Pipeline ▾ | Lista` + `[+ Nuevo]`. Default = Pipeline. Lista clásica a 1 click (no se pierde nada).
- **Franja "🔥 Foco de hoy"** (de opción 3): 3 cards horizontales que la IA priorizó → conecta los **Agentes IA (P2) + Command Center que hoy están invisibles**. Cada card: temperatura + razón ("llamar hoy" / "reactivar" / "cita 4pm") + CTA ([📞]/[💬]/[Ver]). **CIERRA CICLO** (surfacing del workforce ya construido).
- **Cuerpo = Pipeline Kanban** (de opción 2): columnas `Nuevo → Contactado → Visita → Negociación → Cierre`. Arrastras cards entre columnas (actualiza stage). Ves el embudo completo + dónde está atorado cada quien.
- **Cards premium** (de opción 4): avatar redondo · pill de temperatura (🟢🟡🔴) · barra de score con gradiente + número (tooltip "qué tan listo 0-100") · zona+presupuesto (Roma·$4M) · quick actions [📞][💬] · pin VIP · glassmorphism/profundidad/sombra.

### Drawer 360° (click en lead) — premium
- Header: avatar grande + nombre + temperatura destacada + cerrar.
- Barra de acciones consistente: [📞 Llamar][💬 WhatsApp][📅 Agendar][✨ Plan].
- Bento grid: **% cierre** (close prob, explicado) · **Contacto** (tel/email/fuente) · **Inteligencia** (enrichment W7.AS.1, si hay) · **Conversaciones IA** (W7.AS.3, si hay) · **Actividad** (timeline, ex-"TIMELINE", con "+ Agregar nota").
- Bloques sin datos → **se ocultan** (no cajas vacías). Cero tecnicismos. es-MX.

### Anti-patrones a eliminar (quejas founder)
- Tabla fría tipo Excel con columnas vacías → cards cálidas.
- Drawer "doblemente horrible": cajas grises planas, "TIMELINE" en inglés, "Generar plan venta IA", media pantalla vacía, sin avatar → rediseño 360° premium arriba.
- Breadcrumb "CRM·CONTACTOS", jerga → nombres en español claro.

## 3 · Pendiente (tras reanudar)
1. **Sistema de Diseño asesor** (su propio · inspirado en `scripts/dmx_design_system.reference.css` / aurora superadmin, NO copiar): tokens color, tarjetas, tipografía, pills, barras score, glassmorphism. Base visual de TODO el módulo.
2. Construir **piloto Leads** (pantalla + drawer) sobre ese sistema.
3. Replicar el lenguaje visual al resto de los 7 grupos.

## Invariantes
- NO eliminar features (salvo SOC del nav). Consolidar visual OK, perder función NO.
- Backend NO se mueve (additive only si una pantalla consolidada necesita un read nuevo).
- Superadmin design system SOLO inspiración, NO duplicar.
- Protocolo quirúrgico + audit doble-pase + tags rollback por fase.
