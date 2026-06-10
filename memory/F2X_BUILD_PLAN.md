---
name: f2x-build-plan
description: Plan canónico MAESTRO — Cerebro del Mercado + lado demanda + los 10 bloques del estudio 4S integrados, sobre F1
metadata:
  type: project
---

# Plan Maestro — El Cerebro del Mercado DMX (sobre F1)

Iniciado 2026-06-09. Consolida TODO lo trabajado: el análisis del estudio de mercado 4S (10 bloques /
~90 datos), el mapeo milimétrico repo-vs-estudio, los upgrades nuevos, y el killer upgrade. Se levanta
SOBRE F0 (cimientos) y F1 (underwriting del terreno), ambos ya vivos. Reglas founder: front+back conectado,
IA-first (IA/ML/DL/agéntico), build-for-endstate (funciona sin datos, se autollena), title case, cierra ciclos,
4 portales, cero deuda, lenguaje sencillo, prende features apagadas.

## ¿CIERRA CICLOS O ES STANDALONE? — Principio
TODO el sistema cierra ciclos (es un organismo que se retroalimenta), salvo 3 ENTREGABLES de salida que son
standalone por naturaleza: Estudio de Mercado PDF, Memo de Inversionista PDF, y el copy de marketing. El resto
escribe de vuelta al pozo: la señal del comprador alimenta el Grafo → el Grafo alimenta el Generador → el cierre
del asesor calibra los estimadores → superadmin agrega y lo devuelve. Marcado 🔄 (cierra) / ▪️ (standalone) por ítem.

## EL KILLER UPGRADE — "El Cerebro del Mercado" (F2.5) 🔄
Extender el Cerebro (E0-E6, hoy solo workflow del asesor) a cerebro del MODELO DE MERCADO: un loop causal cross-portal.
Dev decide qué construir → comprador reacciona → asesor cierra (la VERDAD) → Cerebro mide predicción↔realidad →
reentrena estimadores Y el generador → siguiente dev recibe mejor consejo. Aprende PALANCAS CAUSALES (terraza →
+X% absorción para familia en Del Valle), no correlación. Reusa E4 coach. Nadie tiene IA inmobiliaria causal viva.

## LOS UPGRADES QUE SUMAN (explícitos)
1. ⭐ Cerebro del Mercado (loop causal) — F2.5
2. Grafo del Comprador VIVO (vs estudio estático de 4S) — F2.1
3. Generador de Producto calibrado con demanda real (no "lo típico") — F2.2
4. Pre-venta antes de construir ("ya tienes 47 compradores que encajan") — F2.2/F2.5
5. Curva de absorción por COHORTE (mata reportes trimestrales TINSA/Softec) — F2.7
6. Ranker de amenidades de 2 EJES: precio (hedónico) + deseo (Grafo) — F2.9
7. Recomendador de cuota (campo ya existe, sin motor) — F2.9
8. prob_venta v2 con ajuste de producto del Grafo — F2.3
9. Inferir demografía sin preguntarla (de la preferencia revelada) — F2.1
10. NSE oficial por colonia (AMAI ya mapeado, sin unir) — F2.4
11. "Qué le falta a la zona" desde DENUE (inverso de densidad) — F2.8
12. Cablear UnitInvestment por unidad (campos vacíos) — F2.3
13. Embudo de calificación real (como el 1.4% del estudio) — F2.4
14. Estudio de Mercado Vivo (el entregable que 4S cobra carísimo) — F2.6
15. Terminal vendible / Data Utility (Bloomberg CDMX) — F2.12
16. Lógica "5 opciones → céntrica/vista" en marketplace — F2.11
17. Memo de inversionista + perfil de inquilino — F2.10

## MAPEO: 10 bloques del estudio → batch
B1 Perfil de quién compra → F2.1 · B2 Qué producto quiere → F2.2 · B3 Demanda+embudo → F2.4 ·
B4 Competencia+absorción → F2.7 · B5 Estudio Vivo → F2.6 · B6 Amenidades+cuota → F2.9 ·
B7 Por qué se compra la zona → F2.8 · B8 Intención+comercio PB → F2.10 · B9 Inversionista → F2.10 ·
B10 Psicográfico → F2.11. Mapeo milimétrico "prender campos apagados" → F2.3.

## CHECKLIST MAESTRO (Tenemos: ✅tenemos 🟡complementar 🔵crear 🟣innovar · Ciclo: 🔄/▪️ · Prioridad: A/M/B)

### FASE 0 — Cimientos · ✅ HECHO
Doctrina de Datos · metric_normalizer (bandas honestas) · SIG colonias · átomo dmx_unit_schema (grado Cherre) ·
Cerebro E0-E6 · taste_profile/buyer_score/lead_match · cubo OLAP · dmx_dev_benchmark.

### FASE 1 — Underwriting del Terreno · ✅ HECHO
Valor residual · Due diligence · Norma 3 · Veredicto 1 página · Calibración Puente Alvarado · Doctrina visible.

### FASE 2 — Lado Demanda + Cerebro del Mercado · EN CURSO
**F2.1 Grafo del Comprador (B1)** — 🟡🟣 · A
- [x] 2.1.1 Motor + 3 rutas (dev/asesor/superadmin) · Back · 🔄 · VERIFICADO 2026-06-09
- [ ] 2.1.2 Tarjeta dev "Qué Quiere La Demanda Aquí" · Front · D · 🔄
- [ ] 2.1.3 Distintivo de Etapa de Vida en el lead · Front · A · 🔄
- [ ] 2.1.4 Vista Agregada de Ciudad · Front · S · 🔄
**F2.2 Generador de Producto / HBU (B2)** — 🔵 · A
- [ ] 2.2.1 Motor HBU (terreno+CUS → mezcla óptima calibrada por Grafo+absorción · ratio cajones · eficiencia) · Back · 🔄
- [ ] 2.2.2 "Diseña Tu Producto" + pre-venta ("N compradores encajan") · Front · D · 🔄
**F2.3 Prender Campos Apagados (millimétrico)** — 🟡 · A
- [ ] 2.3.1 prob_venta v2 (ajuste de producto del Grafo) · Back · 🔄
- [ ] 2.3.2 Cablear UnitInvestment por unidad (desde simulador) · Back · 🔄
- [ ] 2.3.3 Días en mercado + reservas caídas + tarjetas de unidad · Back+Front · D·A·C · 🔄
**F2.4 Demanda Demográfica EPRAV (B3)** — 🔵 · A
- [ ] 2.4.1 Unir NSE oficial a colonias (AMAI→colonia) · Back · 🔄
- [ ] 2.4.2 Motor demográfico (crec.+NSE+verticalización+captura) para zonas sin señal · Back · 🔄
- [ ] 2.4.3 Embudo de calificación real (razones de descarte) + Front · D·S · 🔄
**F2.5 ⭐ Cerebro del Mercado (loop causal · KILLER)** — 🟣 · A
- [ ] 2.5.1 Registro de predicciones (cada estimación con su contexto) · Back · 🔄
- [ ] 2.5.2 Cierre → backtest → reentreno (extiende E4) · Back · 🔄
- [ ] 2.5.3 Aprendiz de palancas causales · Back · 🔄
- [ ] 2.5.4 Alimenta el generador + panel "Cómo Aprende El Mercado" · Front · S·D · 🔄
**F2.6 Estudio de Mercado Vivo (B5)** — 🔵🟣 · A
- [ ] 2.6.1 Generador del estudio (fusiona Grafo+oferta+absorción+zona) · Back · ▪️ (entregable)
- [ ] 2.6.2 Export PDF + Front dev/superadmin · D·S · ▪️
**F2.7 Competencia & Absorción por Cohorte (B4)** — 🟡 · A
- [ ] 2.7.1 Curva de absorción por cohorte (nuevo 80% / 2-3a 51% / viejo 20%) · Back · 🔄
- [ ] 2.7.2 Censo de comparables persistente + Front · D·S · 🔄
**F2.8 Zona: Atributos + Qué Le Falta (B7)** — 🟡 · M
- [ ] 2.8.1 Perfil de zona unificado + "qué le falta" desde DENUE · Back · 🔄
- [ ] 2.8.2 Front: por qué se compra / ventajas-desventajas · D·C·S · 🔄
**F2.9 Amenidades & Cuota (B6)** — 🟡🔵 · M
- [ ] 2.9.1 Ranker de amenidades 2 ejes (precio+deseo, las 55) · Back · 🔄
- [ ] 2.9.2 Recomendador de cuota (bundle→cuota vs disposición a pagar) · Back · 🔄
- [ ] 2.9.3 Front dev (selección de amenidades guiada) · D · 🔄
**F2.10 Inversionista + Comercio PB (B8/B9)** — 🟡🔵 · M
- [ ] 2.10.1 Memo de inversionista PDF · Back+Front · C·A · ▪️ (entregable)
- [ ] 2.10.2 Perfil de inquilino objetivo · Back · ▪️
- [ ] 2.10.3 Decisión comercio en PB (solo deptos vs con comercio) · Back+Front · D · 🔄
**F2.11 Marketplace "5 Opciones" + Psicográfico (B10)** — 🟡🔴 · M/B
- [ ] 2.11.1 Ranking marketplace "5 opciones" (céntrica/vista) · Back+Front · C · 🔄
- [ ] 2.11.2 Copy/tono de landings desde psicográfico · Back+Front · C · ▪️ (marketing)
**F2.12 Terminal Vendible / Data Utility (superadmin)** — 🟣 · A (al final)
- [ ] 2.12.1 Roll-up k-anónimo de todos los devs (cubo NSE×segmento×colonia) · Back · 🔄
- [ ] 2.12.2 Los 3 índices vendibles (obra/absorción/gestión) + terminal Bloomberg CDMX · Back+Front · S · 🔄
- [ ] 2.12.3 Grafo del Comprador como producto de datos (anónimo) · Back+Front · S · 🔄

## ROADMAP COMPLETO DE FASES (F0 → F5) — la columna vertebral
- **F0 Cimientos** ✅ — Doctrina · bandas honestas · SIG colonias · átomo dmx_unit_schema · Cerebro E0-E6 · taste/score/match.
- **F1 Underwriting del Terreno** ✅ — valor residual · due diligence · Norma 3 · veredicto · calibración Puente Alvarado.
- **F2 Lado Demanda** — Grafo del Comprador + Generador de Producto + prender campos + demografía EPRAV + absorción por cohorte
  + zona/qué le falta + amenidades/cuota + marketplace. (Batches F2.1-2.4, 2.7-2.9, 2.11.)
- **F3 Autopiloto de Memorándum + Estudio de Mercado Vivo** — el entregable auto-generado que 4S cobra carísimo. (F2.6 + memo F2.10.)
- **F4 Cerebro del Mercado (Digital Twin + Predicción↔Realidad)** ⭐ — el loop causal que reentrena todo con cada cierre. (F2.5.)
- **F5 Modelo del Mundo / Data Utility / Score de Bancabilidad** — 3 índices vivos (obra/absorción/gestión) + roll-up k-anónimo
  de todos los devs + terminal Bloomberg CDMX + Grafo como producto de datos. (F2.12.) Identidad: vende DATOS, no servicios de terceros.

## UPGRADES A MÓDULOS QUE YA EXISTEN (lo del análisis aterriza en cada portal · 🔄 cierra ciclo / ▪️ standalone)
### Portal DEV
- Inicio/Dashboard → jugada de mayor palanca (F4) · alertas de demanda viva (F2.1) · ranking de absorción real (F2.7) · 🔄
- Mis Proyectos / Ficha del Proyecto → Grafo de la colonia (F2.1) · prob_venta v2 + UnitInvestment + cuota por unidad (F2.3/2.9) · curva de absorción real (F2.7) · 🔄
- Mercado → Grafo + perfil de zona unificado + "qué le falta" (F2.1/2.8) · 🔄
- Demanda → EPRAV + embudo de calificación + pre-venta (F2.4/2.2) · 🔄
- Competidores (Battle Card) → curva por cohorte + censo de comparables persistente (F2.7) · 🔄
- Pricing / PricingLab → premium "5 opciones" + impacto de amenidades 2 ejes (F2.9/2.11) · 🔄
- Valor del Terreno (F1) → Generador de Producto cableado al veredicto + decisión comercio PB (F2.2/2.10) · 🔄
- Site Selection → demanda demográfica para terreno sin señal (F2.4) · 🔄
- Reportes → Estudio de Mercado Vivo + Memo de inversionista (F3) · ▪️
- Cash Flow → calibración con cierres reales (F4) · 🔄
### Portal ASESOR
- Mis Leads → distintivo de Etapa de Vida + segmentación lifecycle (F2.1) · 🔄
- Ficha360 → perfil de comprador unificado (lifecycle+producto+DISC+taste) (F2.1/2.3) · 🔄
- Galería/Swipe → ya alimenta el Grafo (F2.1) · 🔄
- Match de propiedades → ajuste lifecycle + prob_venta v2 (F2.3) · 🔄
- Cierre ganado/perdido → DISPARA el Cerebro (predicción↔realidad) (F4) · 🔄 ← cable clave del loop
- Leads inversionistas → Memo de inversionista (F3) · ▪️
### Portal SUPERADMIN
- Calibración → calibra TODOS los estimadores, no solo terreno (F4) · 🔄
- Vertical Products → Grafo del Comprador como producto vendible (F5) · 🔄
- Índices → 3 índices vivos obra/absorción/gestión con curva real (F5) · 🔄
- Live Pulse (apagado) → DESPERTAR + señal de demanda del Grafo (F2.1) · 🔄
- Knowledge Graph (pendiente) → nodos de segmento/lifecycle + edges de demanda (F2.1) · 🔄
- Metrics Cube → dimensiones NSE × segmento × lifecycle + roll-up k-anónimo (F5) · 🔄
- Data Sources → NSE oficial AMAI/INEGI (F2.4) · 🔄
- FSD Accuracy (sin UI) → DESPERTAR la banda de error en superadmin · 🔄
- NUEVO panel "Cómo Aprende El Mercado" (F4) + Terminal Bloomberg CDMX (F5)
### Portal COMPRADOR / MARKETPLACE
- Marketplace → ranking "5 opciones" (céntrica/vista/menos vecinos) + match lifecycle (F2.11/2.3) · 🔄
- Dashboard comprador → cada búsqueda/swipe alimenta el Grafo (F2.1) · 🔄
- Buyer Coach → perfil lifecycle + memo de inversionista para perfil inversionista (F2.1/F3) · 🔄
- Comparador / AVM público → DESPERTAR FSD (banda de error) en UI + forecast · 🔄/▪️
- Landings → copy/tono psicográfico (F2.11) · ▪️

## ARCHIVOS (F2.1.1, hecho)
- `backend/grafo_comprador_engine.py` · `backend/routes/grafo_comprador.py` · registrado en `server.py`.
- Lee `asesor_busquedas`+`asesor_contactos`+`data_seed.COLONIAS`; banda honesta vía `metric_normalizer`. K_MIN=3.

## NOTAS
- ~70% del trabajo = prender campos que ya existen (estimadores calibrados por el estudio), no crear de cero.
- Identidad DMX: utilidad de DATOS + INFRAESTRUCTURA. Nunca banco/notaría/aseguradora/SOFOM. F2.12 vende datos, no servicios de terceros.
- DB local = `desarrollosmx`. Backend: `set -a; source backend/.env.local; set +a` + `scripts/.venv/bin/python`.
- NO commitear un batch hasta front+back conectado (regla no-huérfanas). F2.1 aún sin commit (falta front 2.1.2-4).
