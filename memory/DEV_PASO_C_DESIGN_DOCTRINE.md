# Paso C · Doctrina de Diseño "Simple pero Hermoso" (Dev → luego todos los roles)
**2026-06-02.** Upgrade de la instrucción del founder. Norte: *alguien que nunca vio el módulo lo
entiende solo Y se enamora de usarlo.* Backend intacto (mismo contrato); reconstruimos SOLO el front.
Aplica a CADA tab del sidebar en Paso C. Doc hermano: `DEV_REDESIGN_TRACKER.md`, `feedback_ui_human_language`.

## Los 10 principios (no negociables por pantalla)
1. **Una pantalla = una pregunta.** Cada tab responde UNA pregunta obvia del dev ("¿cómo va mi proyecto?", "¿cómo es mi producto?", "¿cómo van mis ventas?", "¿cómo está el mercado?"). Si no la puedes nombrar en 4 palabras, la pantalla hace de más.
2. **Menos pestañas, profundidad suave.** Absorber subtabs en SECCIONES dentro de una sola pantalla, reveladas progresivamente (no 8 tabs; pocas con secciones que respiran). Lo raro/avanzado vive colapsado, no en otra pestaña.
3. **Lo importante primero, arriba, grande.** Los signos vitales se ven sin scroll. Lo técnico/ajustes: chico, abajo, colapsado.
4. **Lenguaje de persona normal, cero jerga.** (ver `feedback_ui_human_language`). Títulos = frases humanas. Estados vacíos que enseñan, no que culpan.
5. **Un solo CTA primario por pantalla.** El resto, secundario y callado. El ojo sabe qué hacer.
6. **Mismo esqueleto en cada pantalla** → consistencia que se siente premium: eyebrow + título + 1 acción · fila de contadores · cuerpo · estado vacío con sentido. (patrón `MisLeadsPage` del asesor).
7. **Tema CLARO (`frame-light`) + estética aurora DMX** (#6366F1→#EC4899, glassmorphism suave). NUNCA el azul de EasyBroker. Reusar el Sistema de Diseño del asesor (`components/asesor/design/`).
8. **Flujos eficientes:** la acción más común a 1 clic; nada enterrado a 3 niveles. Menos pasos para el mismo resultado.
9. **Build-for-end-state:** estructura COMPLETA hoy (todos los campos/vistas) con datos de ejemplo marcados "ejemplo · se llena con tus datos". Mismo endpoint (contrato intacto). Strangler-fig detrás de `REACT_APP_DEV_V2`.
10. **Calidad de cierre:** cero warnings en código nuevo · verificado LOGUEADO en la app real (localhost:3000) con el flujo entero · cambios contundentes, no sutiles.

## EL EJE (founder 2026-06-02) · diseña desde los ojos del dev que se ENAMORA del valor
Antes de diseñar CUALQUIER pantalla, ponte en los zapatos del desarrollador que **nunca tuvo
acceso a esta info**, conoció DMX y se enamoró del diseño, de lo simple que se mueve, de la
info que encuentra y del **valor para DECIDIR**. En cada pantalla pregúntate, como ese dev:
*¿qué quiero ver? ¿qué me interesa? ¿qué nivel de detalle? ¿qué MUEVE LA AGUJA? ¿qué métricas
me ayudan a decidir?* Muéstrale lo que nunca tuvo: su negocio claro de un vistazo. Nivel de
detalle = el de **Mis Leads del asesor** (que quedó espectacular) — NO copiar, sí igualar la
densidad útil y el cuidado. Este eje aplica a TODAS las pantallas de Paso C.

### Lo que mueve la aguja de un DEV (catálogo de métricas → por pregunta)
- **¿Voy a vender todo y cuándo?** → ritmo de venta / absorción · unidades/semana (sparkline `weekly_sales`) · **meses para agotar inventario** (disponible ÷ ritmo) · % colocado.
- **¿Cuánto dinero?** → **revenue cobrado vs por cobrar** (booked/pipeline) · ingresos del mes · valor del inventario restante.
- **¿Estoy bien de precio?** → precio vs mercado/AVM · alertas de precio.
- **¿De dónde salen mis ventas?** → leads activos · leads 30d · **conversión** · leads calientes.
- **¿Qué está atorado?** → salud del proyecto · días en venta · **proyectos que necesitan atención**.
- **¿Cuál es mi estrella / mi rezagado?** → ranking por ritmo / % vendido.
(Datos REALES disponibles hoy en `/api/dev/projects/list-with-stats` + `/api/desarrollador/dashboard`:
units_by_status, construction_pct, health_score, leads_active/30d, conversion_pct, days_listed,
revenue_mtd_est, **weekly_sales[]**, absorption_pct, revenue_booked, revenue_pipeline, pricing_alerts.)
Forma de cada pantalla = **centro de mando**: KPIs que mueven la aguja arriba (dinero + ritmo +
alertas), luego "tu asistente sugiere", luego el detalle navegable. Rico, con sparklines/anillos,
NUNCA una tabla plana.

## El UPGRADE obligatorio por rediseño (no solo cosmético)
Cada módulo de Paso C, además de verse hermoso, gana **UNA mejora que cierra ciclo** (flujo o IA), no maquillaje:
- normalmente = surfacear una acción sugerida del **Cerebro** contextual a esa pantalla (ya existe el motor), o
- un insight que ahorra clics (lo que el dev iba a calcular, ya calculado arriba), o
- fusionar un flujo de N pasos en 1.
Regla: si el rediseño solo "se ve bonito" pero no hizo el trabajo del dev más fácil, falta el upgrade.

## La receta por tab (proceso repetible)
1. **Mapear** lo actual (qué tabs/subtabs/páginas sueltas hay, qué endpoint usa cada uno, qué se solapa).
2. **Consolidar** (agrupar por la pregunta que responde · absorber subtabs · matar lo muerto).
3. **Diseñar V2** detrás del flag, tema claro, reusando el SD del asesor + el esqueleto común.
4. **Sumar el upgrade** que cierra ciclo (IA/flujo).
5. **Verificar** en la app real logueado (screenshots del flujo) · consola 0 · ESLint 0 en lo nuevo.
6. **Retirar V1** SOLO tras gate (build verde + QA del módulo). No antes.

## Orden de Paso C (centro primero)
**Mis Proyectos** (ancla) → CRM & Leads → Inteligencia → Red comercial → Marketing/Studio → Ajustes.
(Ver `DEV_REDESIGN_TRACKER.md` para el detalle vivo de cada uno.)
