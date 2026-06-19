# Marketplace (Copiloto de Compra) — Checklist del REBUILD DE DISEÑO

**Branch:** `dev-redesign-tandas` · **Dirección visual aprobada:** Claro + data viva ("Monopolio++"), no oscuro.
**Regla:** datos reales/estimados-transparentes (cero fake), lenguaje humano (cero jerga sin glosa), todo cableado al
backend (cero deuda/cables muertos), title case inteligente en todo.
**Propósito:** este es el checklist al que volver para ver el avance del rediseño visual del marketplace y elegir el
siguiente pase. (El estado FUNCIONAL vive en `COPILOTO_PUBLIC_STATE.md`; esto es el DISEÑO.)

---

## ✅ HECHO (sesiones 2026-06-17/19)

| Pieza | Qué se hizo | Estado |
|---|---|---|
| **Dirección visual** | Claro + data viva ("Monopolio++") establecida y aprobada | ✅ |
| **Tarjetas del grid** (`DevelopmentCard`) | jerarquía recompuesta (nombre→precio→specs→señales) · "desde" arriba · semáforo precio/m² · badge de etapa con **color sólido por tiempo de entrega** (inmediata azul·<3m verde·3-6 cyan·6-12 ámbar·+12 rojo, texto blanco visible) · **"↑ X% desde el lanzamiento"** (incremento del dev) + (?) tooltip · **amenidades = conteo + (?) que lista cuáles** (dev.amenities real) · tooltips instantáneos (estilo menú) · tamaño parejo · espaciado compacto | ✅ |
| **Menú izquierdo** (`OportunidadPanel` · "Explora una zona") | resumen + CTA a la página de zona · **Veredicto** + puente · **Para vivir** (compra menor/prom/mayor, 1 decimal) · **Para rentar** (renta menor/prom/mayor) · **Para invertir** (Renta mensual·Plusvalía·Cap rate·TIR·ROI a 5 años, cada una con (?) glosa+ejemplo numérico, dinámico por zona) · **Crédito hipotecario** (tabla: te prestan/al mes/total a 20 años + ejemplo + disclaimer CAT) · badge de veredicto con escala · todo title case | ✅ |
| **Comparador** | movido del FAB flotante (chocaba) a **pill en la barra de filtros** | ✅ |
| **Paginación / infinite scroll** | backend `offset` + frontend IntersectionObserver (24/pág, appende) — escala a 1,000-20,000 sin romperse. Verificado E2E | ✅ |
| **Title case inteligente** | aplicado a títulos de todo el portal (~27 archivos) | ✅ |

---

## ⏳ PENDIENTE (los pases que faltan)

| # | Pieza | Qué falta | Tamaño |
|---|---|---|---|
| **A** | **Páginas de zona `/zona/:slug`** | el "**upgrade brutal**": llevar la inteligencia de inversión completa (precios·renta·ROI·TIR·crédito·forecast·comparador) a la página rica `ZonePage` (hoy tiene forecast/scores/DRPI/pulse/reviews pero le falta lo de inversión). **Aplica a las ~200 colonias** (las que sacamos de Monopolio), cada una su `/zona/:slug`. Es el siguiente gran salto. | 🔴 grande |
| **B** | **Hero / encabezado** | pase de diseño del hero ("Todos los Estrenos de CDMX…") — diferido | 🟡 medio |
| **C** | **Barra de búsqueda (pase 3)** | pase visual de la barra IA + filtros — diferido | 🟡 medio |
| **D** | **Ficha de desarrollo** (`DevelopmentDetail`) | pase de diseño de la página del proyecto | 🟡 medio |
| **E** | **Página de Favoritos** | pase de diseño | 🟢 chico |
| **F** | **Vista de Mapa** | pulido de diseño (ya funcional con 1,811 colonias) | 🟢 chico |
| **G** | **Cargar por área del mapa** | (escala) cargar solo lo visible en el mapa — mejora futura sobre la paginación | 🟢 backlog |

**Siguiente recomendado:** **A — páginas de zona ×200** (es el que más mueve la aguja y el founder lo pidió como
"upgrade brutal"). Diseñar UN template `/zona/:slug` que sirva para las ~200 colonias, alimentado por los endpoints
ya existentes (`/api/zona/{id}/inversion`, `/pulso`, forecast, scores).
