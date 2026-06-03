# DMX — La Columna Vertebral de Dato Milimétrico (PM/Dev Master scope)
2026-06-02 · reframe tras feedback founder: "piensa milimétrico · deja de decir sí a todo · dame criterio". Cruza DMX_Product_Architecture (M1 Trust Infra, M3 Market Maker, M5 Self-improving, M6 Invisible Infra) + Catálogo Maestro (40 fuentes) + Cruces B/D.

## TESIS CENTRAL (el reframe)
El moat NO son 6 secciones de UI. Es **el dato a nivel UNIDAD (átomo) agregado en un cubo OLAP**. Las 6 secciones (vitales, mercado, proyectos, zonas, brokers, asistente) son VISTAS del mismo cubo. Si el átomo es rico, toda vista downstream es barata y la inteligencia de mercado es **irreplicable**. Si el átomo es pobre, todo lo de arriba es maqueta.

## REALIDAD DEL REPO (verificado)
- ✅ `cube_olap_engine.py` YA EXISTE: `query_slice` + `query_cross_cut` (OLAP N-dim, máx 3), tiers colonia/alcaldía/zona, price_tier, property_type, avg_price_per_m2.
- ⚠️ El ÁTOMO es pobre hoy: una unidad solo tiene `beds, baths, parking, price_base`. NO tiene m², orientación, vista, piso, bodega, terraza m², amenidad-por-unidad, **precio de cierre**, descuento, días en mercado, ni métricas de demanda.
- **Net-new real = enriquecer el esquema de la unidad + snapshots temporales + god-view superadmin + benchmarks dev.** El cubo ya corre; le falta combustible.

## EL MODELO MILIMÉTRICO (la unidad = grano)
Dimensiones del átomo:
- **Tipología**: estudio/loft/1/2/3/4-rec/PH/garden/duplex
- **Físico**: m² const, m² int, m² ext (terraza/balcón/jardín/roof), recámaras, baños, ½ baños, estacionamientos, bodega, cuarto servicio
- **Posición**: piso, torre, orientación (N/S/E/O), vista (calle/interior/parque/ciudad), esquina
- **Prototipo**: modelo repetible (1 desarrollo → N prototipos → M unidades)
- **Amenidades** (taxonomía ~40, atribuibles): alberca, gym, roof, coworking, pet, seguridad 24/7, EV charging, cine, spa, sky bar…
- **Comercial**: precio lista, precio/m² lista, **precio cierre, precio/m² cierre, spread, descuento %**, esquema pago, fecha alta/aparta/cierre, **días en mercado**, reservas caídas
- **Geo**: calle+número, CP, colonia, alcaldía, AGEB, lat/lng, zona, distancia metro/parque/escuela
- **Demanda** (del flujo): leads, visitas, vistas portal, favoritos, comparaciones, DISC de interesados, objeciones
- **Inversión**: ROI renta larga/corta (AirROI), yield, plusvalía, mensualidad

Jerarquías de agregación: **Geo** (unidad→calle→colonia→alcaldía→zona→CDMX) · **Producto** (unidad→prototipo→tipología→desarrollo→desarrollador) · **Tiempo** (día→sem→mes→trim→año, snapshots nunca sobreescritos) · **Amenidad** · **Comprador** (DISC/NSE/motivación) · **Bandas** (precio, m²).

Medidas cruzables con cualquier dimensión: precio/m² (lista/cierre/spread), absorción %, velocidad (u/mes), días en mercado, inventario, # ofertas/leads/demanda, conversión por etapa, descuento, plusvalía, ROI, "más vendido" (ranking).

## PREGUNTAS QUE DESBLOQUEA (que NADIE responde en MX)
- ¿Qué tipología se vende más rápido por colonia? (2-rec Roma vs 3-rec Del Valle)
- ¿Cuánto suma al precio/m² un roof / 2º estacionamiento en Polanco?
- ¿Qué amenidad acelera más la venta o sube más el precio/m²?
- ¿Dónde hay demanda de 1-rec y CERO inventario? (demand gap = dónde construir)
- ¿Spread lista-cierre real por tipología y zona? (cuánto se negocia)
- Ranking de desarrolladores por absorción ajustada por zona.

## DEV vs SUPERADMIN (clave del founder)
- **Dev portal**: el cubo FILTRADO a sus proyectos + **benchmark ANÓNIMO** de mercado ("tu 2-rec se vende en 4m; la colonia en 6 → 33% más rápido"). Nunca ve dato crudo de competidores.
- **Superadmin**: el cubo COMPLETO, milimétrico, todo proyecto/unidad/zona, crudo. Es el **terminal Bloomberg CDMX vendible** (M6 data marketplace $5-15K/mes · IE as API).

## LO QUE NO ESTABA DIMENSIONANDO (del doc)
1. **El dato ES el producto**, no relleno de widgets (M6 Invisible Infra · data marketplace · IE as API a bancos/fintechs/fondos).
2. **DMX Score** = la unidad de medida (el FICO/Walk Score del real estate MX) → autoridad de mercado.
3. **Self-improving loop (M5)**: cada cierre recalibra AVM/cubo → moat acumulativo.
4. El portal dev es UNA lente del IE; superadmin otra; la API otra.

## RECOMENDACIONES OPINIONADAS (con NOs)
- ✅ BOOST máx: **cubo milimétrico + Asistente protagonista + god-view superadmin**. Es el 10x.
- ❌ NO a "6 secciones coiguales" en el Inicio = dashboard plano, no inteligencia. → Asistente ARRIBA que sintetiza + secciones como **drill-downs** bajo él.
- ❌ NO (por ahora) a "Brokers y alianzas" como sección top del dev = prematuro sin el spine. → Reframe a "¿quién mueve mi inventario?" cuando el cubo exista (distribución, no analítica suelta).
- 🔁 Regla: **dejar de agregar widgets al Inicio**. Construir el spine primero; las vistas salen casi gratis del cubo.

## ORDEN FOUNDATION-FIRST (recomendado)
1. **Esquema de unidad milimétrico** (enriquecer átomo + taxonomía amenidades + precio cierre + demanda) + snapshots.
2. **Cubo OLAP god-view superadmin** (terminal de mercado vendible · prueba el dato).
3. **Benchmarks dev** (su slice vs mercado anónimo).
4. **Asistente protagonista** (lee el cubo → dice qué hacer).
5. Secciones = drill-downs del cubo (no peers).
