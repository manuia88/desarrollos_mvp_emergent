# Granularidad MÁXIMA por perfil — aprovechar TODA la data (Google + nuestros motores)

**Fecha:** 2026-06-19. **Idea:** dejar de mostrar conteos genéricos → mostrar lugares con NOMBRE, ESTRELLAS y
DISTANCIA, relevantes al dolor/sueño de cada perfil. Combinar Google Places (rico) + nuestro arsenal (AVM/DRPI/forecast/
risk/demand/live-pulse/demographics/dev-amenities). Todo gated por data. **Mapbox se queda** (render); Google solo datos.

## Lo que Google Places (New) desbloquea (campos ricos, 1 request por categoría con fieldmask ampliado)
- **Nombre + calificación + # reseñas** (`displayName`, `rating`, `userRatingCount`) → "Pujol 4.7★ (3,200)".
- **Ubicación exacta** (`location`) → pins en el mini-mapa + distancia.
- **Nivel de precio** (`priceLevel`) → señal de prestigio/accesibilidad.
- **Flags**: `goodForChildren`, `allowsDogs`, `parkingOptions`, `accessibilityOptions`, hours.
- **Fotos** (Place Photos) → imágenes reales de la zona.
- **Minutos caminando** (Routes API, a anclas clave: metro, parque top) — request aparte, más caro.
- **"Vibe / calidad de zona"** = rating promedio × densidad de los lugares (proxy de qué tan bueno es el entorno).

## Por PERFIL (qué granularidad y de dónde)
### 📈 INVERTIR — rendimiento + por qué se renta/revaloriza
- Rendimiento: ROI/TIR/cap rate/escenarios [✅ tenemos].
- **Drivers de renta**: densidad + hotspots con nombre (restaurantes/cafés/bares rated) = por qué alguien renta aquí.
- **Potencial Airbnb**: cercanía a turismo/vida nocturna + atracciones con nombre.
- **Liquidez**: absorción + Live Pulse (velocidad de demanda real).
- **Conectividad** (min al metro) → empuja la renta.
- **Calidad del entorno comercial** (rating promedio) = soporte de valor.
- **Riesgo (crimen)** = seguridad del capital · **NSE/ingreso** = calidad del inquilino.
- **vs zonas vecinas** (comparativa de cap rate/plusvalía).

### 👨‍👩‍👧 FAMILIA — hijos, seguridad, escuelas, salud, comunidad
- **Mejores escuelas CON NOMBRE + ★ + min caminando** ("Colegio Williams 4.8★, 6 min").
- **Hospitales/clínicas con nombre + ★ + distancia**.
- **Parques con nombre + min caminando** ("Parque México, 4 min").
- Farmacias, supermercados con nombre · flag `goodForChildren`.
- **Seguridad (crimen)** = #1 de la familia.
- **Amenidades del desarrollo para niños** (ludoteca, áreas verdes, alberca) [✅].
- **Demografía** (% familias, tamaño de hogar).

### 🏠 PRIMERA CASA — accesible, primer paso, vida joven, crecer
- Rentar vs comprar + desarrollos más accesibles [✅].
- **Minutos al metro/transporte** (commute = crítico para joven).
- **Cafés / gyms / coworking con nombre + ★** (vida del profesional joven).
- **Señal "zona en alza"** (plusvalía + crecimiento de demanda = entra antes de que suba).
- **Caminable** (sin coche).
- Infonavit/Cofinavit fit en el crédito.

### ✨ VIVIR MEJOR — prestigio, lo mejor, estatus
- **Mejores restaurantes CON NOMBRE + ★** ("Pujol, Quintonil a X min").
- **Cafés de especialidad, wine bars, cultura/museos con nombre**.
- **Servicios premium** (spa, gym premium) · **nivel de precio alto** = prestigio.
- **Vibe score** (rating promedio + price level) = qué tan high-end se siente.
- **Amenidades premium del desarrollo** (sky lounge, concierge, spa) [✅].
- **Fotos reales** de la zona.

## Cross-cutting (todos los perfiles)
- **Pins en el mini-mapa** de los lugares con nombre.
- **Foto real** de la zona en el hero.
- **Vibe/calidad de zona** como sello.

## Realidad de costo/cuota (honesto)
- **Nombre + estrellas**: mismo # de requests (fieldmask más rico) pero SKU "Enterprise" → free tier más bajo (~1,000/mes
  vs 5,000). → ~125 colonias/mes con nombres+★ gratis. Se prioriza y se reparte por mes como ya hacemos.
- **Minutos caminando** (Routes API): request aparte por ancla → solo a 1-2 anclas clave (metro, parque top) para no
  disparar costo.
- **Fotos**: Place Photos, barato-medio.
- **Conteos actuales (253 colonias)**: ya están, gratis (Pro SKU).

## Plan de build (incremental, gated, free-tier-aware)
1. **Nombres + estrellas** (top 3-5 por categoría relevante al perfil) — el salto más grande. Enriquece el ingest
   (fieldmask) + guarda top places por zona. Prioriza colonias con desarrollos.
2. **Minutos al metro** (Routes, 1 ancla) — "Metro a X min".
3. **Pins en el mini-mapa** + **foto de zona**.
4. Cablear cada uno al bloque del perfil correspondiente (familia=escuelas, vivir=restaurantes, etc.), con gating.
