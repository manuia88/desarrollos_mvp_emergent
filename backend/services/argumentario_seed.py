"""Phase 3 Batch 31 · seed — Argumentario Knowledge Base inicial (≥30 entradas).

Cuatro categorías:
  - objeciones (precio, ubicación, financiamiento, tiempos)
  - cierres (urgencia, prueba social, exclusividad, comparativos)
  - comparaciones (zona vs zona, vertical vs horizontal, preventa vs entrega)
  - producto (amenidades, plusvalía, normativa, hipoteca)
"""
from __future__ import annotations

KB_SEED = [
    # ─── OBJECIONES (10) ────────────────────────────────────────────────────
    {
        "category": "objeciones",
        "title": "El cliente dice: 'está muy caro'",
        "content": (
            "Cuando el comprador objeta el precio, no defiendas el monto: redirige a "
            "valor por metro cuadrado y comparables de zona. Estructura: 1) Reconoce "
            "la preocupación. 2) Pregunta '¿comparado con qué proyecto específico?'. "
            "3) Muestra el precio/m² del proyecto vs promedio de la colonia (si está "
            "5–15% por encima del promedio justifica con amenidades, ubicación o "
            "calidad de constructor). 4) Cierra con plusvalía proyectada a 36 meses."
        ),
        "tags": ["precio", "objecion", "valor"],
    },
    {
        "category": "objeciones",
        "title": "Comparan con un proyecto rival más barato",
        "content": (
            "Pide al comprador la ficha técnica del rival. En 90% de los casos uno de "
            "estos factores marca diferencia: 1) Calidad de acabados (pisos, "
            "cancelería). 2) Densidad de torre (m² verdes/habitante). 3) Reputación "
            "del desarrollador (entregas a tiempo). 4) Estacionamientos asignados vs "
            "rotativos. Convierte el delta de precio en costo mensual a 20 años para "
            "minimizar percepción."
        ),
        "tags": ["precio", "competencia", "comparativo"],
    },
    {
        "category": "objeciones",
        "title": "'No está en la zona que quiero'",
        "content": (
            "Resistencia de zona suele ser percepción, no realidad. Pregunta: 1) ¿Qué "
            "te detiene de esta zona específicamente? 2) ¿Cuánto tiempo llevas sin "
            "visitar? Muchas zonas LATAM tuvieron transformación 2020–2025. Muestra: "
            "índice de plusvalía 5y, nuevos comercios ancla, líneas de transporte "
            "futuras. Cierra agendando visita guiada de 90 min."
        ),
        "tags": ["ubicacion", "zona", "objecion"],
    },
    {
        "category": "objeciones",
        "title": "'Prefiero esperar a ver si bajan los precios'",
        "content": (
            "Estadística clave LATAM: en preventa el precio sube 8–14% por avance "
            "de obra. Mensaje: 'Esperar el precio ideal cuesta más que comprar el "
            "imperfecto hoy'. Muestra histórico de precios del propio desarrollador. "
            "Refuerza con escasez real (unidades restantes con esa orientación)."
        ),
        "tags": ["precio", "timing", "preventa"],
    },
    {
        "category": "objeciones",
        "title": "'No me alcanza para el enganche'",
        "content": (
            "Plan de acción: 1) Calcula enganche real (no el ideal): bancos LATAM "
            "aceptan 10% en muchos casos. 2) Ofrece esquema de enganche diferido en "
            "6–12 mensualidades durante construcción. 3) Si hay co-deudor, propón "
            "INFONAVIT/FOVISSSTE + crédito banco. 4) Conecta con Caya o calculadora "
            "DMX para simular en vivo."
        ),
        "tags": ["financiamiento", "enganche", "objecion"],
    },
    {
        "category": "objeciones",
        "title": "'No confío en preventas, prefiero entregada'",
        "content": (
            "Agradece la transparencia. Diferencia las dos audiencias: 1) Quien "
            "compra entregado paga 10–25% más por la certidumbre. 2) Quien compra "
            "preventa asume riesgo ejecución pero captura plusvalía. Muestra track "
            "record del desarrollador (proyectos entregados a tiempo, % atrasos). "
            "Si no hay confianza histórica, ofrece preventa con avance ≥30%."
        ),
        "tags": ["preventa", "objecion", "riesgo"],
    },
    {
        "category": "objeciones",
        "title": "'Las mensualidades durante obra me ahogan'",
        "content": (
            "Reframe: las mensualidades durante obra son enganche disfrazado, no "
            "renta. Construye tabla: $X/mes durante 24 meses = enganche de $24X "
            "completo al entregar. Compara contra alquiler perdido (mismo monto sin "
            "construir patrimonio). Si aún preocupa, propón mensualidades crecientes "
            "(escalonadas) o un plan menor + finiquito en escrituración."
        ),
        "tags": ["financiamiento", "mensualidades", "objecion"],
    },
    {
        "category": "objeciones",
        "title": "'Ya tengo otra cotización con mejor precio'",
        "content": (
            "Pide ver la cotización rival completa (no solo el precio frente). En el "
            "95% de los casos hay diferencias en: bodega/cajón/almacén incluido, "
            "estudio de crédito, gastos de cierre, mantenimiento primer año. Cuando "
            "comparas todo-incluido el delta se reduce o invierte."
        ),
        "tags": ["competencia", "precio", "objecion"],
    },
    {
        "category": "objeciones",
        "title": "'Necesito consultar con mi pareja/familia'",
        "content": (
            "Nunca presiones. Estructura el seguimiento: 1) '¿Qué necesita ver tu "
            "pareja para decidir?'. 2) Ofrece visita conjunta dentro de 72h. 3) "
            "Manda kit personalizado: ficha técnica, video aéreo, comparable de "
            "zona, pre-cotización. 4) Pon recordatorio en 48h con 1 dato nuevo "
            "(p.ej. 'una unidad similar se reservó hoy')."
        ),
        "tags": ["seguimiento", "decision", "objecion"],
    },
    {
        "category": "objeciones",
        "title": "'No quiero un departamento, quiero casa'",
        "content": (
            "Identifica el motivo real: privacidad, espacio, jardín, pet-friendly. "
            "Hoy hay verticales con jardines privados, pet-spa, mayor m² que casas "
            "horizontales en colonias premium. Si el motivo es identidad ('siempre "
            "quise casa'), busca producto adecuado: townhouse, loft horizontal, "
            "casa-condominio."
        ),
        "tags": ["producto", "tipologia", "objecion"],
    },
    # ─── CIERRES (8) ─────────────────────────────────────────────────────────
    {
        "category": "cierres",
        "title": "Cierre por escasez real",
        "content": (
            "Funciona solo si la escasez es genuina. Estructura: 1) Cita unidades "
            "restantes específicas: 'Quedan 3 con esta orientación'. 2) Velocidad "
            "histórica: 'En las últimas 4 semanas se reservaron 2 con vista al "
            "parque'. 3) Cierra con compromiso menor: apartado reembolsable de "
            "$10–30k MXN por 5 días."
        ),
        "tags": ["cierre", "urgencia", "escasez"],
    },
    {
        "category": "cierres",
        "title": "Cierre por prueba social",
        "content": (
            "Comparte historias breves de compradores similares (con consentimiento "
            "y privacidad). Estructura: perfil del comprador (edad, ocupación), "
            "objeción inicial, motivo final de compra, satisfacción a 6/12 meses. "
            "Evita mostrar nombres completos. Refuerza con tasa de ocupación o "
            "rentabilidad real si aplica."
        ),
        "tags": ["cierre", "social_proof", "testimonial"],
    },
    {
        "category": "cierres",
        "title": "Cierre por exclusividad temporal",
        "content": (
            "Solo usar si el desarrollador autoriza. Tipos: precio congelado por 7 "
            "días, upgrade gratuito de acabados durante el mes, descuento por "
            "modelo de exhibición. Siempre escrito + fechado, nunca verbal. Da al "
            "comprador motivo concreto para no postergar."
        ),
        "tags": ["cierre", "exclusividad", "tiempo"],
    },
    {
        "category": "cierres",
        "title": "Cierre por proyección de plusvalía",
        "content": (
            "Construye escenario a 36–60 meses: precio actual, plusvalía promedio "
            "zona (3–7% anual), comparable con instrumentos de inversión "
            "(CETES/Fondo). Cierra con: 'Si esta proyección se cumple, tu "
            "patrimonio crecerá $X. Si no, conservas inmueble + has dejado de "
            "pagar renta'."
        ),
        "tags": ["cierre", "plusvalia", "inversion"],
    },
    {
        "category": "cierres",
        "title": "Cierre por urgencia de tasa hipotecaria",
        "content": (
            "Cuando las tasas suben o se proyecta alza: usa simulador para mostrar "
            "diferencia de pago mensual con tasa actual vs tasa proyectada en 3–6 "
            "meses. Una unidad de $3M MXN con +50bps de tasa puede aumentar pago "
            "mensual $1,200–1,800 MXN. Esto convierte mejor que descuento al precio."
        ),
        "tags": ["cierre", "tasa", "hipoteca"],
    },
    {
        "category": "cierres",
        "title": "Cierre por reservación protegida",
        "content": (
            "Para clientes indecisos: ofrece apartado reembolsable de 5 días con "
            "1% del valor. Beneficios: 1) Bloquea unidad específica. 2) Permite due "
            "diligence. 3) Reembolso 100% si declina. Reduce fricción mental. "
            "Siempre por escrito con cláusula clara."
        ),
        "tags": ["cierre", "apartado", "reservacion"],
    },
    {
        "category": "cierres",
        "title": "Cierre comparando con renta",
        "content": (
            "Tabla de 3 columnas: 1) Renta actual estimada. 2) Mensualidad "
            "hipoteca + mantenimiento. 3) Build equity (capital amortizado). En la "
            "mayoría de zonas LATAM hipoteca + mantenimiento = 1.1–1.4x renta, "
            "pero el comprador construye patrimonio. Cierre: 'En 5 años habrás "
            "pagado lo mismo, pero serás dueño.'"
        ),
        "tags": ["cierre", "renta", "comparativo"],
    },
    {
        "category": "cierres",
        "title": "Cierre por ajuste a perfil familiar",
        "content": (
            "Personaliza la unidad al perfil familiar: si tiene hijos pequeños "
            "destaca seguridad de torre + amenidades infantiles + cercanía escuelas. "
            "Si es pareja sin hijos o profesional joven destaca coworking, gym, "
            "rooftop, conectividad. La emoción cierra mejor que el precio."
        ),
        "tags": ["cierre", "personalizacion", "perfil"],
    },
    # ─── COMPARACIONES (6) ──────────────────────────────────────────────────
    {
        "category": "comparaciones",
        "title": "Vertical (departamento) vs Horizontal (casa)",
        "content": (
            "Vertical: menor mantenimiento individual, amenidades compartidas, "
            "seguridad 24/7, plusvalía estable, m² eficientes. Horizontal: "
            "privacidad total, expansión futura, jardín privado, pet-friendly sin "
            "restricciones. Decision drivers: estilo de vida, edad, presupuesto "
            "mantenimiento, número de hijos. No hay 'mejor', hay 'adecuado'."
        ),
        "tags": ["comparacion", "tipologia"],
    },
    {
        "category": "comparaciones",
        "title": "Preventa vs Entrega Inmediata",
        "content": (
            "Preventa: precio inicial 10–25% menor, plusvalía durante construcción, "
            "personalización de acabados, riesgo de retraso/cancelación. Entrega "
            "inmediata: certidumbre total, sin esperas, hipoteca activa de "
            "inmediato, sin captura de plusvalía constructiva. Para inversión: "
            "preventa. Para vivienda urgente: entrega inmediata."
        ),
        "tags": ["comparacion", "preventa", "entrega"],
    },
    {
        "category": "comparaciones",
        "title": "Polanco vs Roma Norte (CDMX)",
        "content": (
            "Polanco: precio/m² más alto ($95–120k), perfil corporativo/lujo, "
            "menor densidad de bares, zona consolidada. Roma Norte: precio/m² "
            "$70–90k, perfil creativo/joven, alta densidad gastronómica, mayor "
            "ruido nocturno. Plusvalía similar (~5% anual). Decisión por estilo "
            "de vida, no por inversión."
        ),
        "tags": ["comparacion", "zona", "cdmx"],
    },
    {
        "category": "comparaciones",
        "title": "Constructor consolidado vs nuevo",
        "content": (
            "Consolidado (>10 proyectos): menor riesgo entrega, precio premium "
            "8–15%, calidad estandarizada. Nuevo: precio más competitivo, pero "
            "verifica: 1) Capital de la empresa. 2) Pre-venta acumulada. 3) "
            "Avance real obra. 4) Permisos en regla. Si menos de 3 proyectos "
            "entregados, recomienda escrow o avance ≥40% antes de comprar."
        ),
        "tags": ["comparacion", "constructor", "riesgo"],
    },
    {
        "category": "comparaciones",
        "title": "Crédito hipotecario vs INFONAVIT/FOVISSSTE (MX)",
        "content": (
            "Banco: tasas 9–12% anual, plazo hasta 20 años, requisitos estrictos "
            "de ingreso. INFONAVIT: tasa fija o creciente según salario, plazo "
            "hasta 30 años, monto limitado por salario. Combinación INFONAVIT + "
            "Banco (cofinanciamiento): mejor para sueldos $25k–60k MXN. Recomienda "
            "siempre simular con calculadora DMX antes de cotización."
        ),
        "tags": ["comparacion", "credito", "hipoteca"],
    },
    {
        "category": "comparaciones",
        "title": "Departamento de inversión vs vivir",
        "content": (
            "Inversión: planta baja menos atractiva (más renta turística), pisos "
            "altos para venta. Estudios y 1 recámara con mejor ROI por renta. Para "
            "vivir: 2–3 recámaras según familia, orientación al sur (LATAM), "
            "balcón/terraza, almacén/bodega. Las decisiones de unidad cambian "
            "radicalmente según el destino. Siempre pregúntalo primero."
        ),
        "tags": ["comparacion", "inversion", "uso"],
    },
    # ─── PRODUCTO (8) ────────────────────────────────────────────────────────
    {
        "category": "producto",
        "title": "Amenidades que sí mueven plusvalía",
        "content": (
            "Top 5 que aumentan valor de reventa: 1) Roof garden con vista. 2) "
            "Gym equipado. 3) Coworking. 4) Pet area. 5) Estacionamientos visitas. "
            "Top 3 que NO mueven: alberca olímpica (alto mantenimiento), spa "
            "(infrautilizado), kids club si la torre no tiene perfil familiar. "
            "Mantenimiento >$3,500/mes inhibe demanda media."
        ),
        "tags": ["producto", "amenidades", "plusvalia"],
    },
    {
        "category": "producto",
        "title": "Cómo leer la plusvalía proyectada",
        "content": (
            "Plusvalía promedio LATAM zonas premium: 4–7% anual. Verifica: 1) "
            "Histórico INMEX/SHF de la zona específica. 2) Proyectos de "
            "infraestructura aprobados (línea metro, parque, comercio ancla). 3) "
            "Demanda demográfica (millennials migrando a la zona). Plusvalía "
            ">10%/año sostenida es bandera roja: probable burbuja o cherry-picking."
        ),
        "tags": ["producto", "plusvalia", "datos"],
    },
    {
        "category": "producto",
        "title": "Cuánto cobrar de mantenimiento es razonable",
        "content": (
            "Rango sano LATAM: $25–55 MXN/m² mensual. >$60 MXN/m² requiere "
            "amenidades premium reales (concierge, valet, alberca climatizada). "
            "<$20 MXN/m² es bandera roja: probable subfinanciamiento de fondo de "
            "reserva, cuotas extraordinarias futuras casi seguras. Siempre revisa "
            "presupuesto del condominio antes de comprar."
        ),
        "tags": ["producto", "mantenimiento", "costos"],
    },
    {
        "category": "producto",
        "title": "Documentos que revisar antes de comprar",
        "content": (
            "Checklist mínimo: 1) Escritura del terreno o régimen de propiedad en "
            "condominio. 2) Licencia de construcción vigente. 3) Manifestación de "
            "impacto ambiental si aplica. 4) Reglamento del condominio. 5) "
            "Presupuesto operativo del condominio. 6) Avance de obra certificado. "
            "Si el desarrollador se resiste a entregarlos = bandera roja."
        ),
        "tags": ["producto", "legal", "due_diligence"],
    },
    {
        "category": "producto",
        "title": "Orientación solar y diseño LATAM",
        "content": (
            "Hemisferio norte (México, Centroamérica): orientación al sur recibe "
            "más luz natural, ideal para clima frío altiplano. Norte = más fresco, "
            "ideal trópico. Hemisferio sur (Chile, Argentina): invertido. Evita "
            "balcones al oeste si no hay protección solar (sobre-calientan en "
            "tarde). Pregunta siempre: '¿en qué horario estarás más en casa?'"
        ),
        "tags": ["producto", "diseno", "orientacion"],
    },
    {
        "category": "producto",
        "title": "Estacionamientos: asignados vs rotativos",
        "content": (
            "Asignados: cajón específico escriturado, sumas valor de reventa "
            "$150–300k MXN. Rotativos: bandera amarilla, demanda excede oferta en "
            "10–20% en muchos verticales LATAM. Siempre pregunta: 1) ¿Cuántos "
            "cajones por unidad? 2) ¿Visitas tienen separados? 3) ¿Hay cuota "
            "extra? Si el ratio es <1 cajón por unidad, descártalo o negocia."
        ),
        "tags": ["producto", "estacionamiento", "amenidad"],
    },
    {
        "category": "producto",
        "title": "Cómo evaluar la calidad de acabados",
        "content": (
            "Visita la unidad de exhibición con esta lista: 1) Pisos (porcelanato "
            ">8mm, no laminado en zonas húmedas). 2) Cancelería (aluminio "
            "anodizado, no PVC en zona costera). 3) Cocina (cubierta cuarzo o "
            "granito, no melamina). 4) Baño (mezcladoras de marca reconocida, "
            "no genéricas). 5) Closets (madera o MDF de alta densidad). Pide "
            "ficha técnica de los proveedores."
        ),
        "tags": ["producto", "acabados", "calidad"],
    },
    {
        "category": "producto",
        "title": "Plazo de escrituración y costos asociados",
        "content": (
            "Costos típicos de escrituración LATAM: 4–7% del valor de la "
            "operación (notarial, ISAI/ISABI, registro público, derechos). El "
            "comprador suele asumirlos. Tiempo: 30–90 días tras entrega física. "
            "Si el desarrollador ofrece 'escrituración gratis' suele estar "
            "cargado al precio. Pide desglose claro siempre."
        ),
        "tags": ["producto", "escrituracion", "costos"],
    },
]


async def seed_kb_if_empty(db) -> int:
    """Inserta el seed solo si la colección está vacía. Retorna cuántos insertó."""
    existing = await db.argumentario_knowledge.count_documents({})
    if existing > 0:
        return 0

    from services.argumentario_rag import _embed_text, _now
    import uuid

    docs = []
    for entry in KB_SEED:
        text = f"{entry['title']}. {entry['content']}"
        vec = _embed_text(text)
        docs.append({
            "kb_id": str(uuid.uuid4()),
            "category": entry["category"],
            "title": entry["title"],
            "content": entry["content"],
            "tags": entry.get("tags", []),
            "embedding": vec,
            "created_at": _now(),
        })
    if docs:
        await db.argumentario_knowledge.insert_many(docs)
    return len(docs)
