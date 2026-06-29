"""USO universal de las métricas — el '¿para qué sirve?' en lenguaje humano de cada una de las 58 medidas del registro.
Lo consume grid_engine.compute → y por herencia Atlas, Grid y toda vista que lea el registro. Donde no hay texto
específico, se genera uno honesto desde lado + medida + cohorte. Así NINGÚN número queda sin uso."""

USO = {
    # OFERTA
    "of.precio_m2": "El precio de referencia por m². Base para premium/descuento y para valuar suelo.",
    "of.precio_absoluto": "El ticket típico de la zona. Define a qué bolsillo le hablas.",
    "of.precio_p25": "El piso de precio (25% más barato). Marca la entrada accesible del mercado.",
    "of.precio_p75": "El techo de precio (25% más caro). Marca el segmento premium.",
    "of.inventario_activo": "Cuántas unidades hay disponibles. Si es bajo con demanda alta, hay escasez = palanca de precio.",
    "of.unidades_totales": "El tamaño del mercado en unidades. Contexto para absorción y participación.",
    "of.unidades_vendidas": "Cuánto se ha colocado. La tracción real de la zona.",
    "of.sell_through": "Qué % del inventario ya se vendió. Alto = producto que conecta; bajo = revisar precio/producto.",
    "of.mix_tipologia": "Qué tipologías domina la oferta. Compáralo con lo que se busca para hallar huecos.",
    "of.premium_atributo": "Cuánto más caro es el m² con cierto atributo. Cuantifica si conviene incluirlo.",
    "of.premium_piso": "Cuánto paga el mercado por subir de piso. Calibra el precio por nivel.",
    "of.premium_vista": "Cuánto vale la vista exterior. Justifica el premium de las mejores unidades.",
    "of.premium_orientacion": "Cuánto pesa la orientación en el precio. Útil para asignar precios por cara.",
    "of.absorcion_mensual": "Unidades que se venden al mes. El pulso de la velocidad de venta.",
    "of.velocidad_venta": "Qué tan rápido rota el inventario. Define expectativas de flujo de caja.",
    "of.meses_inventario": "En cuántos meses se agota el inventario al ritmo actual. <6 = mercado caliente.",
    "of.meses_venta": "Cuántos meses lleva el proyecto en mercado. Contexto para juzgar su avance.",
    "of.dias_en_mercado": "Cuánto tarda una unidad en venderse. Termómetro de liquidez.",
    "of.ticket_promedio": "El precio promedio de lo que SÍ se vendió. Lo que el mercado realmente paga.",
    "of.ritmo_lanzamientos": "Cuántos proyectos nuevos entran. Anticipa sobreoferta futura.",
    "of.descuento_negociacion": "Cuánto se baja del precio de lista al cerrar. Mide poder de negociación del comprador.",
    "of.precio_cerrado_m2": "El precio REAL de cierre por m² (no el de lista). La verdad del mercado.",
    "of.posicion_precio_cohorte": "Si estás caro o barato vs proyectos comparables. Posicionamiento competitivo.",
    # DEMANDA
    "dm.vistas": "Cuánta gente ve el listado. El tope del embudo: interés bruto.",
    "dm.vistas_prototipo": "Qué prototipo atrae más miradas. Señala el producto estrella.",
    "dm.busquedas": "Cuánta gente busca activamente en la zona. Demanda con intención.",
    "dm.solicitudes": "Cuántos piden contacto/info. La demanda que ya levantó la mano.",
    "dm.split_intencion": "Cuántos quieren vivir vs invertir. Cambia el argumento de venta.",
    "dm.atributo_buscado": "Qué atributo piden más. Define qué resaltar y qué construir.",
    "dm.presupuesto_declarado": "Cuánto dice tener el comprador. Calibra el rango de precio a ofrecer.",
    "dm.share_demanda": "Qué tajada de la demanda de la zona capta este proyecto. Su atractivo relativo.",
    "dm.filtros_atributo": "Qué filtros aplican al buscar. Las condiciones no negociables del comprador.",
    "dm.tipologia_buscada": "Qué tipología se busca más. Compárala con la oferta para hallar el hueco.",
    "dm.rango_precio_buscado": "En qué precio se concentra la búsqueda. Dónde está el grueso de la demanda.",
    "dm.demanda_por_atributo": "Cuánta demanda revela cada atributo. Prioriza features por interés real.",
    "dm.recurrencia_busqueda": "Quién vuelve a buscar. Señal de intención seria vs curioseo.",
    "dm.heat_index": "Qué tan caliente está la demanda vs el inventario. Índice de presión.",
    "dm.conv_vista_solicitud": "Cuántas vistas se vuelven solicitud. Eficiencia del embudo.",
    "dm.sesiones_calculadora": "Cuántos usan el cotizador. Señal de intención de compra avanzada.",
    "dm.enganche_declarado": "Cuánto recurso propio traen. Define enganche mínimo viable.",
    "dm.capacidad_credito": "Cuánto crédito pueden tomar. El techo de precio financiable.",
    "dm.aforo_ltv": "Qué tan apalancados vienen (préstamo/valor). Riesgo y perfil de pago.",
    "dm.plazo_target": "A cuántos años quieren el crédito. Afecta mensualidad y banco.",
    "dm.mensualidad_target": "Cuánto pueden pagar al mes. El límite real de accesibilidad.",
    "dm.tir_target": "Qué retorno busca el inversionista. Filtra qué unidades le sirven.",
    "dm.cap_rate_target": "Qué rentabilidad de renta espera. Compárala con la real (AirROI).",
    # CRUCE
    "x.gap_oferta_demanda": "Cuánto se busca por encima de lo que hay. Gap>0 = oportunidad de producto.",
    "x.ratio_demanda_inventario": "Cuántos interesados por unidad disponible. Presión de demanda.",
    "x.affordability_gap": "La brecha entre lo que pueden pagar y lo que cuesta. Mide accesibilidad real.",
    "x.dap_atributo": "Disposición a pagar por un atributo (demanda × premium). Cuánto monetiza una feature.",
    "x.elasticidad_precio": "Cómo responde la venta al precio. Guía cuánto puedes subir sin frenar la absorción.",
    "x.arbitraje": "Dónde el precio no refleja la demanda. La ineficiencia que se puede capturar.",
    "x.sobreoferta_subdemanda": "Dónde sobra producto o falta demanda. Alerta de riesgo de colocación.",
    "x.match_score": "Qué tan bien empata lo que hay con lo que se busca. Ajuste producto-mercado.",
    "x.indice_demanda_revelada": "Índice propio que resume la demanda real revelada. El termómetro DMX de la zona.",
    "x.forecast_absorcion": "Proyección de cuánto se absorberá. Anticipa el ritmo de venta futuro.",
}


def uso_de(meta: dict) -> str:
    mid = meta.get("id")
    if mid in USO:
        return USO[mid]
    lado, medida = meta.get("lado"), str(meta.get("medida") or "").lower()
    coh = meta.get("cohorte_comparacion") or "la cohorte"
    if lado == "oferta":
        return f"Oferta: {medida} en el corte. Compáralo contra {coh}."
    if lado == "demanda":
        return f"Demanda: {medida}. Dimensiona el interés del comprador en el corte."
    return f"Cruce oferta×demanda: {medida}. El gap marca dónde hay oportunidad."
