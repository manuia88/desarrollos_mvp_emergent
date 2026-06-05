# Spec — Inteligencia de Canales y Vendedores (Pagos y brokers) · 2026-06-05

Origen: founder pidió "qué distinción y data poderosa por cada línea (broker/asesor) y por canal
(brokers vs in-house): tiempos de conversión, leads generados, unidades en que se enfocan, presupuesto
de sus clientes…". Upgrade abajo. Hoy el demo NO tiene la capa de datos lead↔vendedor → construir para
el estado final (campos listos, stub que se autollena).

## A. POR CADA VENDEDOR (broker o asesor) — su "ficha de desempeño"
Una tarjeta por persona, con su métrica estrella + acción:
- **Velocidad de conversión**: días promedio lead→cierre. (quién cierra más rápido)
- **Volumen**: # leads que trae/atiende · # cierres · $ vendido.
- **Tasa de cierre**: % de sus leads que cierran.
- **Calidad del lead**: % que llega a CITA (no solo volumen) → distingue "trae basura" vs "pocos pero buenos".
- **Especialidad / enfoque**: qué prototipo/tamaño cierra (PHs vs 1-rec, premium vs entrada).
- **Presupuesto de sus clientes**: ticket promedio de sus leads ($ rango).
- **Tiempo de respuesta**: qué tan rápido contesta un lead nuevo (1ª respuesta).
- **Costo por cierre**: comisión $ pagada / cierres.
- **SOC tier**: bronze→platinum (ya existe el motor).

## B. POR CANAL (brokers vs in-house) — comparador lado a lado
- **Mix de ventas**: % de cierres por canal.
- **Costo de adquisición por cierre**: comisión broker vs costo in-house.
- **Velocidad de cierre** por canal.
- **Ticket promedio** por canal (qué canal trae clientes de mayor presupuesto).
- **Calidad** (conversión lead→cierre) por canal.
- **Qué inventario mueve cada canal** (brokers PHs, in-house 1-rec, etc.).

## C. EL UPGRADE (lo que lo hace poderoso, no solo una tabla)
1. **"Huella" de cada vendedor (IA)**: etiqueta automática — "cierra premium rápido" · "volumen pero lento" ·
   "leads de bajo presupuesto" — + acción ("dale más inventario premium" / "audita: no convierten").
2. **Match óptimo lead→vendedor**: el sistema aprende quién cierra mejor CADA tipo de lead
   (presupuesto×zona×prototipo) → al entrar un lead, sugiere a quién asignarlo. Lo ejecuta el Cerebro.
3. **Comparador broker vs in-house** (decisión estratégica): "¿me conviene abrir a brokers?" →
   "el broker cuesta $X/cierre pero trae tickets 30% más altos y cierra 1.4× más rápido".
4. **Costo real por cierre + ROI del canal** (dinero accionable, no solo % configurado).
5. **Flywheel**: cada cierre entrena "quién-cierra-qué" → mejores asignaciones + a quién darle inventario.
   Mientras más operas, más fino el match = moat.

## DATOS QUE NECESITA (capa lead↔vendedor — no existe en el demo)
Cada lead debe traer: `assignee_user_id` (vendedor), `origin_type` (broker_external / dev_inhouse),
`broker_id`, `budget_mxn` (presupuesto del cliente), `prototype_interes`/`unit_interes`,
timestamps (created_at, first_response_at, closed_at). Más una tabla de comisiones liquidadas para
el "costo por cierre". El motor `leads/analytics.per_assignee` + SOC ya existen; falta poblar estos campos.

## CÓMO SE CONSTRUYE
- Hoy: el cockpit "Pagos y brokers" ya deja el ranking de brokers stubbeado ("se conecta al asignar leads").
- Fase 1: capa de captura — al crear/asignar un lead, registrar assignee + origin + budget + prototipo.
  (se cablea en el módulo asesor / Mis Leads que ya existe).
- Fase 2: agregador por-vendedor + por-canal (reusa `leads/analytics` + SOC + comisiones).
- Fase 3: cockpit de 2 columnas (Brokers | In-house) con las fichas + el comparador.
- Fase 4: huella IA + match óptimo (Cerebro) + flywheel.
Ata con el tema de captura/historial (mismo principio que PRICE_HISTORY_APPRECIATION_SPEC).
