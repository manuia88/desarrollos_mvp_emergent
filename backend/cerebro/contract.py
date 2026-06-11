"""
Cerebro DMX · Etapa 0 — CONTRATO (el lenguaje común del Cerebro)
================================================================
El Cerebro es UNO solo, central y multi-tenant. Sirve a los 4 perfiles
(superadmin · asesor · developer · comprador) con el MISMO motor, pero cada
perfil es un "lente": ve y puede hacer SOLO lo que su rol permite, dentro de
SU org. Este archivo define ese lenguaje común:
  - estados de una tarea de agente
  - catálogo de ACCIONES (lo que un agente puede proponer/ejecutar)
  - acciones DELICADAS (siempre piden OK humano)
  - allow-list de acciones POR ROL (chokepoint de seguridad)
  - METAS/playbooks por rol (lo que el Cerebro puede perseguir para cada perfil)

NO ejecuta nada: es el contrato sobre el que se cablea todo lo demás (Etapa 1+).
"""

# ─── Estados de una tarea de agente (el ciclo de vida) ────────────────────────
class TaskStatus:
    PROPOSED          = "proposed"            # el agente propuso una acción
    AWAITING_APPROVAL = "awaiting_approval"   # delicada → espera OK humano
    APPROVED          = "approved"            # humano aprobó
    EXECUTING         = "executing"           # corriendo
    DONE              = "done"                # terminó OK
    REJECTED          = "rejected"            # humano rechazó
    FAILED            = "failed"              # falló (reintentar/rollback)
    ROLLED_BACK       = "rolled_back"         # se deshizo

    ALL = {PROPOSED, AWAITING_APPROVAL, APPROVED, EXECUTING, DONE, REJECTED, FAILED, ROLLED_BACK}
    # estados "abiertos" (siguen en juego)
    OPEN = {PROPOSED, AWAITING_APPROVAL, APPROVED, EXECUTING}


# ─── Catálogo de ACCIONES (qué puede hacer un agente) ─────────────────────────
# key → { label, reversible } · agrupadas por dominio. Etapa 1+ las irá cableando
# a los motores que YA existen (enrichment, DISC, nurturer, pricing, etc.).
ACTION_REGISTRY = {
    # — Comprador (su agente de compra) —
    "buyer.search":           {"label": "Buscar propiedades", "reversible": True},
    "buyer.vet_property":     {"label": "Vetar propiedad (precio/legal/riesgo)", "reversible": True},
    "buyer.simulate_finance": {"label": "Simular hipoteca/impuestos/ROI", "reversible": True},
    "buyer.shortlist":        {"label": "Armar shortlist", "reversible": True},
    "buyer.watch_market":     {"label": "Vigilar el mercado y alertar", "reversible": True},
    "buyer.request_visit":    {"label": "Solicitar visita (a un humano)", "reversible": True},

    # — Asesor (el ciclo del lead) —
    "advisor.enrich_lead":    {"label": "Investigar/enriquecer lead", "reversible": True},
    "advisor.classify_lead":  {"label": "Clasificar (DISC + score)", "reversible": True},
    "advisor.propose_angle":  {"label": "Proponer ángulo de venta", "reversible": True},
    "advisor.draft_message":  {"label": "Redactar primer contacto (borrador)", "reversible": True},
    "advisor.route_lead":     {"label": "Asignar al mejor asesor", "reversible": True},
    "advisor.schedule_task":  {"label": "Crear tarea/recordatorio", "reversible": True},
    "advisor.move_pipeline":  {"label": "Mover etapa del pipeline", "reversible": True},

    # — Developer · Mercado —
    "dev.competitor_scan":    {"label": "Escanear competidores", "reversible": True},
    "dev.forecast":           {"label": "Pronosticar demanda/absorción", "reversible": True},
    "dev.zone_price":         {"label": "Precio de zona (DRPI)", "reversible": True},
    "dev.market_pulse":       {"label": "Pulso de zona en vivo", "reversible": True},
    "dev.where_to_build":     {"label": "Dónde construir (site selection)", "reversible": True},
    "dev.zone_risk":          {"label": "Riesgo de zona", "reversible": True},
    # — Developer · Precios —
    "dev.price_suggest":      {"label": "Sugerir precio por unidad", "reversible": True},
    "dev.ab_price":           {"label": "Crear experimento A/B de precio", "reversible": True},
    "dev.promo":              {"label": "Proponer promo/descuento", "reversible": True},
    # — Developer · Marketing —
    "dev.generate_marketing": {"label": "Generar material (Studio)", "reversible": True},
    "dev.update_landing":     {"label": "Actualizar landing del proyecto", "reversible": True},
    "dev.meta_ads":           {"label": "Preparar campaña Meta Ads", "reversible": True},
    "dev.auto_content":       {"label": "Auto-content para redes", "reversible": True},
    "dev.social_cards":       {"label": "Social cards virales", "reversible": True},
    "dev.newsletter":         {"label": "Boletín / reporte a inversionistas", "reversible": True},
    # — Developer · Operación —
    "dev.health_alert":       {"label": "Salud del proyecto + alertas", "reversible": True},
    "dev.inventory_check":    {"label": "Revisar inventario/disponibilidad", "reversible": True},
    "dev.cashflow":           {"label": "Cash flow / absorción", "reversible": True},
    # — Developer · Equipo & Reportes —
    "dev.assign_advisors":    {"label": "Asignar asesores al proyecto", "reversible": True},
    "dev.team_metrics":       {"label": "Métricas del equipo", "reversible": True},
    "dev.weekly_report":      {"label": "Reporte semanal", "reversible": True},
    # — Developer · Inteligencia EXCLUSIVA (lo que solo DMX sabe · data propia) —
    "dev.closing_prices":     {"label": "Precios reales de cierre (no de publicación)", "reversible": True},
    "dev.days_on_market":     {"label": "Días reales en venta de algo como lo tuyo", "reversible": True},
    "dev.avm_value":          {"label": "Cuánto vale de verdad tu unidad (con margen)", "reversible": True},
    "dev.what_if":            {"label": "Simular un cambio y ver el efecto en ventas", "reversible": True},
    "dev.who_buys":           {"label": "Quién está comprando en tu zona", "reversible": True},
    "dev.best_amenity":       {"label": "Qué amenidad hace que se venda más rápido", "reversible": True},
    "dev.value_index":        {"label": "Si estás caro o barato para lo que ofreces", "reversible": True},
    "dev.price_timing":       {"label": "El mejor momento para subir el precio", "reversible": True},
    "dev.hot_leads":          {"label": "Qué clientes están a punto de comprar", "reversible": True},
    "dev.zone_trend":         {"label": "Qué zona va a subir de valor", "reversible": True},
    "dev.profit_projection":  {"label": "Cuánto vas a ganar al final", "reversible": True},
    "dev.lookalike":          {"label": "Cómo le hacen los devs que SÍ venden", "reversible": True},
    "dev.compare_projects":   {"label": "Comparar tus proyectos lado a lado", "reversible": True},

    # — Superadmin (red + modelo) —
    "admin.network_pulse":    {"label": "Pulso de la red", "reversible": True},
    "admin.model_health":     {"label": "Salud del modelo/ML", "reversible": True},
    "admin.retrain_trigger":  {"label": "Disparar reentrenamiento", "reversible": True},

    # — DELICADAS (efecto en el mundo real · ver DELICATE_ACTIONS) —
    "comm.send_external":     {"label": "Enviar mensaje al cliente (WhatsApp/email)", "reversible": False},
    "comm.send_bulk":         {"label": "Envío masivo", "reversible": False},
    "deal.make_offer":        {"label": "Hacer/registrar oferta", "reversible": False},
    "deal.change_price":      {"label": "Cambiar precio publicado", "reversible": False},
    "deal.sign_document":     {"label": "Firmar/comprometer documento", "reversible": False},
    "data.share_contact":     {"label": "Revelar/compartir contacto", "reversible": False},
    "content.publish_public": {"label": "Publicar contenido público", "reversible": False},
    "ops.spend_budget":       {"label": "Gastar presupuesto (ads/IA)", "reversible": False},
}

# Acciones DELICADAS: SIEMPRE piden OK humano, sin importar el rol. Es el corazón
# del "human-in-the-loop": el agente hace todo lo de bajo riesgo solo; lo que toca
# al mundo real (dinero, envíos, firmas, datos personales) lo aprueba un humano.
DELICATE_ACTIONS = frozenset({
    "comm.send_external", "comm.send_bulk", "deal.make_offer", "deal.change_price",
    "deal.sign_document", "data.share_contact", "content.publish_public", "ops.spend_budget",
    # comprador: pedir visita conecta con un humano y comparte tu interés → siempre tu OK
    "buyer.request_visit",
})

# Piso de seguridad: estas NUNCA se pueden graduar a automáticas (ni con confianza
# ganada ni en Piloto total). Tocan dinero/firmas/envíos masivos → siempre tu OK.
HARD_DELICATE = frozenset({
    "ops.spend_budget", "deal.sign_document", "comm.send_bulk", "deal.make_offer",
})

# ─── Allow-list de acciones POR ROL (chokepoint de seguridad) ─────────────────
# Un perfil SOLO puede disparar las acciones de su lista. Defense-in-depth: aunque
# un LLM "invente" otra acción, aquí se rechaza.
_BUYER = {"buyer.search", "buyer.vet_property", "buyer.simulate_finance", "buyer.shortlist",
          "buyer.watch_market", "buyer.request_visit"}
_ADVISOR = {"advisor.enrich_lead", "advisor.classify_lead", "advisor.propose_angle",
            "advisor.draft_message", "advisor.route_lead", "advisor.schedule_task",
            "advisor.move_pipeline", "comm.send_external", "comm.send_bulk",
            "deal.make_offer", "data.share_contact"}
_DEV = {
    # mercado
    "dev.competitor_scan", "dev.forecast", "dev.zone_price", "dev.market_pulse",
    "dev.where_to_build", "dev.zone_risk",
    # precios
    "dev.price_suggest", "dev.ab_price", "dev.promo",
    # marketing
    "dev.generate_marketing", "dev.update_landing", "dev.meta_ads", "dev.auto_content",
    "dev.social_cards", "dev.newsletter",
    # operación
    "dev.health_alert", "dev.inventory_check", "dev.cashflow",
    # equipo & reportes
    "dev.assign_advisors", "dev.team_metrics", "dev.weekly_report",
    # inteligencia exclusiva
    "dev.closing_prices", "dev.days_on_market", "dev.avm_value", "dev.what_if", "dev.who_buys",
    "dev.best_amenity", "dev.value_index", "dev.price_timing", "dev.hot_leads", "dev.zone_trend",
    "dev.profit_projection", "dev.lookalike", "dev.compare_projects",
    "advisor.route_lead",
    # delicadas que el dev puede disparar (con tu OK)
    "deal.change_price", "content.publish_public", "ops.spend_budget", "deal.make_offer",
}
_ADMIN = {"admin.network_pulse", "admin.model_health", "admin.retrain_trigger"}

ROLE_ALLOWED_ACTIONS = {
    "buyer": _BUYER, "comprador": _BUYER,
    "advisor": _ADVISOR, "asesor_admin": _ADVISOR, "asesor_freelance": _ADVISOR,
    "developer": _DEV, "developer_admin": _DEV, "developer_member": _DEV,
    "inmobiliaria_admin": _DEV, "inmobiliaria_member": _DEV, "inmobiliaria_director": _DEV,
    "superadmin": _ADMIN | _BUYER | _ADVISOR | _DEV,  # superadmin ve/puede todo (gobernado + auditado)
}

# ─── METAS / playbooks por rol (lo que el Cerebro persigue por perfil) ────────
GOALS = {
    "buyer":     {"find_home":      "Encontrarte la casa correcta y guiarte al cierre",
                  "watch_market":   "Vigilar el mercado y avisarte la oportunidad"},
    "advisor":   {"work_lead":      "Trabajar un lead de punta a punta hasta el cierre",
                  "work_pipeline":  "Priorizar y avanzar todo tu pipeline"},
    "developer": {
        "sell_project":     "Conseguir compradores",
        "price_project":    "Revisar mis precios",
        "check_competition":"Espiar a mi competencia",
        "forecast_sales":   "Saber cuánto voy a vender",
        "zone_intel":       "Inteligencia de mi zona",
        "make_marketing":   "Prepararme el material",
        "attract_buyers":   "Atraer más gente",
        "project_health":   "Cómo va mi proyecto",
        "where_next":       "Dónde construir lo siguiente",
        "money_review":     "Revisar mi dinero",
        "investor_report":  "Reporte para inversionistas",
        "team_review":      "Cómo va mi equipo",
        # — Solo en DMX (game-changers) —
        "real_prices":      "¿A qué precio SÍ se vende?",
        "time_to_sell":     "¿En cuántos días se vende?",
        "true_value":       "¿Cuánto vale de verdad?",
        "what_if":          "¿Y si cambio el precio?",
        "who_buys":         "¿Quién compra en mi zona?",
        "winning_amenity":  "¿Qué amenidad vende más?",
        "value_check":      "¿Estoy caro o barato?",
        "price_timing":     "¿Cuándo subo el precio?",
        "hot_leads":        "¿Quién está por comprar?",
        "rising_zone":      "¿Qué zona va a subir?",
        "my_profit":        "¿Cuánto voy a ganar?",
        "beat_competition": "¿Cómo le hacen los que venden?",
        "compare_projects": "Comparar mis proyectos",
    },
    "superadmin":{"monitor_network":"Vigilar la salud de la red y el modelo",
                  "improve_model":  "Cerrar el loop de aprendizaje (reentrenar)"},
}

# Alias de rol → rol base (para resolver metas/planes de las variantes admin/member)
ROLE_ALIASES = {
    "asesor_admin": "advisor", "asesor_freelance": "advisor",
    "comprador": "buyer",
    "developer_admin": "developer", "developer_member": "developer",
    "inmobiliaria_admin": "developer", "inmobiliaria_member": "developer", "inmobiliaria_director": "developer",
}


def goals_for(role):
    """Metas disponibles para un rol (resuelve variantes admin/member al rol base)."""
    return GOALS.get(ROLE_ALIASES.get(role, role), {})


# Área de cada acción (para agrupar el catálogo en la UI "Configurar mi Cerebro").
ACTION_AREAS = {
    "Mercado": ["dev.competitor_scan", "dev.forecast", "dev.zone_price", "dev.market_pulse", "dev.where_to_build", "dev.zone_risk"],
    "Precios": ["dev.price_suggest", "dev.ab_price", "dev.promo", "deal.change_price"],
    "Marketing": ["dev.generate_marketing", "dev.update_landing", "dev.meta_ads", "dev.auto_content", "dev.social_cards", "dev.newsletter", "content.publish_public"],
    "Operación": ["dev.health_alert", "dev.inventory_check", "dev.cashflow"],
    "Equipo & Reportes": ["dev.assign_advisors", "dev.team_metrics", "dev.weekly_report"],
    "Solo en DMX": ["dev.closing_prices", "dev.days_on_market", "dev.avm_value", "dev.what_if", "dev.who_buys", "dev.best_amenity", "dev.value_index", "dev.price_timing", "dev.hot_leads", "dev.zone_trend", "dev.profit_projection", "dev.lookalike", "dev.compare_projects"],
    "Leads": ["advisor.enrich_lead", "advisor.classify_lead", "advisor.propose_angle", "advisor.draft_message", "advisor.route_lead", "comm.send_external"],
    "Comprador": ["buyer.search", "buyer.vet_property", "buyer.simulate_finance", "buyer.shortlist", "buyer.watch_market", "buyer.request_visit"],
}


def catalog_for_role(role):
    """Catálogo de acciones que un rol puede usar, agrupado por área (para la UI)."""
    allowed = ROLE_ALLOWED_ACTIONS.get(role, set())
    out = {}
    for area, actions in ACTION_AREAS.items():
        items = [{"action": a, "label": ACTION_REGISTRY.get(a, {}).get("label", a),
                  "delicate": a in DELICATE_ACTIONS, "hard": a in HARD_DELICATE}
                 for a in actions if a in allowed]
        if items:
            out[area] = items
    return out


CEREBRO_TASKS = "cerebro_tasks"   # colección de tareas de agente
CEREBRO_MEMORY = "cerebro_memory" # memoria gobernada compartida
