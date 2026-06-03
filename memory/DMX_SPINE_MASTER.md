# DMX — ESPINA MAESTRA (re-arquitectura TOTAL, IA-first)
2026-06-02 · brainstorm founder: "rediseño y re-arquitectura es TOTAL · upgrade brutal · máxima granularidad · productos/features de los docs (no nuevos) · todo IA/ML/DL/Agentic". Cruza DMX_Product_Architecture (6 capas·27 productos·160 funcs) + Catálogo Maestro v2/v3 (40 fuentes·97 funcs) + Cruces A-E.

## PRINCIPIO DE RE-ARQUITECTURA
Una sola **espina = el dato a nivel UNIDAD** → cubo OLAP temporal (snapshots, nunca sobreescribir) → del cubo cuelgan TODAS las lentes: portal dev (su slice + benchmark anónimo), superadmin (cubo crudo completo = terminal Bloomberg vendible), marketplace (SEO programático por AGEB), API (IE as API a bancos/fondos), y el Cerebro agéntico que lee todo y actúa. No se rediseña UI: se rearquitecta el motor; las pantallas son vistas.

═══════════════════════════════════════════════
## PARTE 1 · EL ÁTOMO: TAXONOMÍA MILIMÉTRICA DE LA UNIDAD
═══════════════════════════════════════════════
Grano = la unidad. Todo agrega desde aquí.

**A · Identidad/posición**: development_id, prototype_id, unit_id, SKU; torre/edificio, piso/nivel, # unidad; niveles de la unidad (1/duplex/triplex/PH); posición (PB/intermedio/penthouse/garden); orientación (N/S/E/O/NE/NO/SE/SO); vista (calle/interior/patio/parque/ciudad/área verde); esquina (s/n); exposición solar + horas de luz.

**B · Tipología**: estudio/loft/1/2/3/4+rec/PH/garden house/duplex/triplex/flat; #recámaras; recámaras en suite; recámara principal con vestidor.

**C · Áreas (m²)**: m² construidos, m² privativos/interiores, m² terreno (casas); m² terraza, m² balcón, **m² roof garden privado**, m² jardín privado, m² patio servicio; doble altura (s/n + m²); altura de techo (m).

**D · Espacios privados**: baños completos, ½ baños, baño visitas; cuarto de servicio + baño servicio; estudio/home office; family room/TV; vestidor, closet blancos; cocina (integral/cerrada/isla) + antecomedor; lavandería (interior/común); chimenea, jacuzzi/alberca privada (casas).

**E · Bodega**: bodega (s/n), m², #bodegas, ubicación (sótano/mismo piso), asignada vs opcional.

**F · Estacionamiento (ENUM completo)**: #cajones; tipo = {independiente · en batería · en batería compartida · independiente compartido}; mecánico = {eleva-autos independiente · eleva-autos compartido · hidráulico · automatizado/puzzle/robotic · ninguno}; techado/descubierto; cajón EV (con cargador); cajón visitas; cajón moto/bici.

**G · Amenidades del desarrollo (taxonomía ~50, atribuible por unidad)**: alberca (techada/exterior/infantil), jacuzzi común, sauna, vapor, spa; gym, yoga, pádel/tenis/multiusos, running track; roof garden común, sky bar, asadores, fire pit; salón usos múltiples, salón eventos, cocina chef, comedor privado; coworking, salas juntas, business center, cabinas llamadas; cine, ludoteca/área infantil, salón gamer; pet zone/pet wash/dog park; lobby doble altura, concierge, valet; bici-estacionamiento, lockers, **paquetería inteligente (smart lockers)**; planta emergencia, cisterna, planta tratamiento agua, captación pluvial; EV charging común, car wash; huerto urbano, jardín zen, asoleadero; elevadores (#, de servicio), montacargas; accesibilidad (rampas/elevador accesible).

**H · Vigilancia/seguridad**: vigilancia 24/7 (s/n), #casetas, CCTV (#cámaras), control acceso (tarjeta/biométrico/app), botón pánico, ronda, alarma por unidad.

**I · Costos recurrentes**: **cuota mantenimiento mensual ($) + $/m²**, fondo reserva, predial estimado anual, servicios incluidos (agua/gas/seguridad/limpieza), cuota amenidades extra.

**J · Acabados (nivel detalle)**: piso (madera/porcelánico/mármol/laminado), cocina (marca, cubierta cuarzo/granito), baños (grifería marca), herrería, ventanería (PVC/aluminio/doble cristal acústico), nivel acabados (gris/blanco/llave en mano), opciones de personalización.

**K · Sustentabilidad/smart**: paneles solares, calentador solar, captación pluvial, medición individual agua/luz/gas, LED, doble cristal, certificación (LEED/EDGE); domótica (cerradura smart, termostato, persianas, app edificio), internet/fibra incluido.

**L · Legal/jurídico**: régimen (condominio/propiedad), escriturable, libre de gravamen, predial al corriente, uso de suelo, pet-friendly (s/n + kg), unidad accesible.

**M · Comercial (TRANSACCIONAL = el oro)**: precio lista, precio/m² lista; **precio cierre, precio/m² cierre, spread, descuento %**; esquema pago (enganche %, #mensualidades, % contra-entrega, financiamiento dev); crédito aceptado (Infonavit/Fovissste/bancario/contado); status (disponible/apartado/reservado/vendido/bloqueado/escriturado); fechas (alta/aparta/reserva/cierre/escritura); **días en mercado por etapa**; reservas caídas (# + razón); promociones (MSI, pronto pago, paquete acabados).

**N · Construcción/entrega**: etapa (preventa/avanzada/construcción/entrega inmediata), % obra, fecha entrega estimada/real, certificaciones.

**O · Demanda (flujo, IA)**: #leads, #visitas agendadas/hechas, #vistas portal, #favoritos, #comparaciones, #solicitudes info; DISC de interesados, segmento/NSE, motivación (vivir/invertir/1er hogar); objeciones, micro-commitments (2ª visita/preguntó crédito/trajo familia); score probabilidad de venta de la unidad.

**P · Inversión (renta)**: ROI renta larga, ROI renta corta (AirROI/AirDNA: ADR/ocupación/RevPAR de zona), yield bruto/neto, plusvalía 12/24/60m, mensualidad crédito, punto equilibrio, hold period óptimo.

**Q · Geo/contexto (atado a unidad)**: calle+#, CP, colonia, alcaldía, AGEB, lat/lng, polígono; distancia metro/metrobús/parque/escuela/hospital/super; walkability, ruido, calidad aire, riesgo (inundación/sismo), seguridad zona.

═══════════════════════════════════════════════
## PARTE 2 · EL CUBO (agregación OLAP)
═══════════════════════════════════════════════
Ya existe `cube_olap_engine.py` (query_slice + cross_cut 3-dim) — hay que ALIMENTARLO con el átomo rico + snapshots.
- **Jerarquías**: Geo (unidad→calle→colonia→alcaldía→zona→CDMX) · Producto (unidad→prototipo→tipología→desarrollo→desarrollador→marca) · Tiempo (día→sem→mes→trim→año) · Amenidad (cross-cut) · Comprador (DISC/NSE/motivación) · Bandas (precio/m²).
- **Medidas**: precio/m² (lista/cierre/spread), absorción %, velocidad (u/mes), días en mercado, inventario, #ofertas/leads/demanda, conversión por etapa, descuento, plusvalía, ROI, ranking "más vendido".
- **Preguntas que NADIE responde en MX**: tipología más rápida por colonia · valor marginal de roof/2º cajón/vista al precio/m² · qué amenidad acelera venta/sube precio · demand-gap (1-rec demandado, cero inventario = dónde construir) · spread lista-cierre real por zona · ranking desarrolladores por absorción.

═══════════════════════════════════════════════
## PARTE 3 · CAPAS IA-FIRST (todo se nutre del cubo)
═══════════════════════════════════════════════
- **ML Pricing**: AVM hedónico por unidad (cada atributo explica precio/m²: roof +X%, eleva-autos compartido −Y vs independiente, vista parque +Z) [hedonic_regression ✅] · price elasticity · dynamic + unit-level pricing · launch pricing.
- **ML Demand**: absorción por tipología×zona · demand-gap detector · lead scoring · prob. de cierre por unidad [forecast/buyer_score ✅].
- **ML Atribución de amenidades** (LA pregunta del founder): "qué amenidad sube precio/velocidad" = regresión hedónica sobre el cubo.
- **DL Visión**: auto-tag fotos (acabados/amenidad/calidad), AVM visual, verificación de fotos [taste/photo_tagger ✅].
- **DL NLP**: extracción de atributos de brochures/PDF para AUTO-LLENAR el átomo [extraction_engine ✅] · objeciones · voice notes.
- **Agentic (Cerebro)**: lee cubo → detecta (demand-gap/unidad estancada/precio fuera de mercado) → propone → ejecuta con aprobación. Para dev Y superadmin. [cerebro/ ✅ E0-E6].
- **Self-improving (M5)**: cada cierre real recalibra AVM + pesos hedónicos.

═══════════════════════════════════════════════
## PARTE 4 · PRODUCTOS/FEATURES DEL DOC QUE PODEMOS IMPLEMENTAR (ya hay motor)
═══════════════════════════════════════════════
**Capa 2 IE**: comparable multidim · oráculo precio futuro/AGEB · price elasticity · seasonal · micro-zone DNA · risk composite · gentrification radar · zone discovery (twin zones) · development pipeline tracker · demand graph · supply-demand gap · demand pre-validation dev · absorption forecast · competitor radar (battle_card) · verified developer score · **Transparency Index (cubo anónimo = dataset público)**.
**Capa 5 Revenue**: dynamic + **unit-level pricing** · launch pricing · **CFO virtual dev** · **unit-mix optimizer** · **amenity value ranker** · pre-sale intelligence ("vende X primero") · objection feedback loop · investor platform (portfolio/AirROI/hold period/calculadora).
**Capa 6 Agente**: opportunity hunter (demand-gap→"construye N aquí") · proactive developer outreach (business case auto) · report factory (semanal mercado / trimestral absorción) · full-cycle agent.
**Capa 4 Distribución**: **SEO programático por AGEB** (miles de páginas del cubo) · **IE as API** · **data marketplace** ($5-15K/mes).
**Capa 1 CRM (dev ve)**: lead intelligence · buyer twin · micro-commitment tracker.
**Mega-mutations vivibles**: M1 Trust Infra ("verificado por DMX") · M3 Market Maker (dice dónde construir/captar/comprar) · M5 self-improving · M6 invisible infra (vender el cubo).

═══════════════════════════════════════════════
## PARTE 5 · LAS LENTES (mismo cubo, distinto permiso)
═══════════════════════════════════════════════
- **Dev**: su slice + benchmark ANÓNIMO de mercado + Asistente que dice qué hacer. Nunca dato crudo ajeno.
- **Superadmin**: cubo CRUDO milimétrico, todo proyecto/unidad/zona → terminal Bloomberg CDMX (god-view) = activo vendible.
- **Marketplace**: SEO programático + fichas enriquecidas del cubo.
- **API/B2B**: IE as API + data marketplace (M6).

═══════════════════════════════════════════════
## PARTE 6 · CRITERIO PM/DEV MASTER (prioridades, con NOs)
═══════════════════════════════════════════════
✅ **BOOST (el 10x)**: (1) átomo milimétrico + cubo alimentado + snapshots · (2) amenity value ranker / hedónico (responde la pregunta del founder) · (3) god-view superadmin · (4) Cerebro agéntico sobre el cubo.
🔁 **Reframe**: secciones del Inicio = drill-downs del cubo bajo el Asistente, no peers.
❌ **NO ahora (criterio)**: AR preview · agente de voz · cierre 100% autónomo · gamification/leaderboard dev · buyer-twin multigeneracional. Alto esfuerzo, requieren madurez de datos/escala. Backlog explícito.

## ORDEN FOUNDATION-FIRST
① Esquema de unidad milimétrico (contrato de datos) + auto-llenado NLP de lo faltante + snapshots → ② cubo god-view superadmin → ③ AVM hedónico + amenity ranker → ④ benchmarks dev → ⑤ Cerebro sobre el cubo → ⑥ lentes marketplace/API.
