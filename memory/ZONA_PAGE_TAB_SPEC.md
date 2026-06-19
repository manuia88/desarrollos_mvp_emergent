# Página de Zona — Spec de producto POR TAB (datos · UX · narrativa Hormozi → conversión)

**Principio:** cada bloque se **gatea por data** (solo se ve si tiene el mínimo necesario; si no, no aparece — cero
fake, cero vacíos). Build-for-endstate: todos los bloques existen, se encienden al llegar el dato.
**Conversión:** cada tab es un flow que VENDE todo el camino → registro / cita / "quiero esta".
**Distinción clave:** amenidades de ZONA (escuelas/parques/restaurantes cerca · Google Places, pendiente) ≠ amenidades
del DESARROLLO (alberca, cowork, ludoteca, gym, roof privado · YA las tenemos por proyecto).

---

## 📈 INVERTIR — "tu dinero, trabajando"
**Narrativa (Hormozi):** dolor (tu dinero pierde en el banco) → mecanismo (3 formas de ganar) → prueba dura (números +
escenarios) → proyección (en 5 años) → objeción ("¿y si baja?" → escenario conservador) → CTA (aparta / habla con asesor).
**Bloques (data · gate):**
1. 3 formas de ganar — plusvalía $/año + cap rate + renta. *(gate: /inversion ok)* ✅
2. **3 escenarios** conservador/base/optimista (plusvalía + TIR por escenario). *(gate: escenarios_inv)* ← nuevo
3. Proyección a 5 años — ganancia $ + % + exit óptimo. *(gate: ganancia_5y)* ✅
4. Crédito (enganche/te prestan/al mes). *(gate: credito)* ✅
5. Históricos / forecast (gráfica). *(gate: DRPI available — hoy NO)* 🔴 pendiente volumen
6. vs otras zonas (comparativa de rendimiento). *(gate: ≥2 zonas con inv)* 🟡
**UX:** números grandes, escenarios como 3 columnas, tooltips (?). **CTA:** "Aparta tu inversión" / "Háblalo con un asesor".

## 🏠 PRIMERA CASA — "deja de rentar"
**Narrativa:** dolor (la renta se va, te quedas fuera) → comparación (rentar vs comprar, tu mensualidad ≈ tu renta) →
alivio (sí alcanza, desde $X) → sueño (tu primer patrimonio) → CTA (ve las accesibles / agenda).
**Bloques:**
1. **Rentar vs comprar** — renta de la zona vs tu mensualidad (lo que se va vs lo que es tuyo). *(gate: renta + credito)* ← nuevo
2. Lo accesible — desde $X, mensualidad ~$Y. *(gate: precio_min + credito)* ✅
3. Sube de valor mientras lo habitas — plusvalía. *(gate: plusvalía)* ✅
4. Las más accesibles primero (oferta ordenada). *(gate: devs)* ✅
**UX:** comparación lado a lado renta|compra, números cercanos a su realidad. **CTA:** "Ver mi primera casa" (al final).

## 👨‍👩‍👧 MI FAMILIA — "raíces, sin mudarte otra vez"
**Narrativa:** dolor (que crezcan seguros, no mudarse más) → la vida aquí (todo cerca) → el hogar (amenidades del
desarrollo: ludoteca, áreas verdes, alberca) → patrimonio que les dejas → CTA (agenda visita en familia).
**Bloques:**
1. **La zona para tu familia** — escuelas/hospitales/parques cerca. *(gate: amenidades de ZONA · Google)* 🔴
2. **Lo que ofrecen los desarrollos aquí** — alberca, ludoteca, áreas para niños, roof, gym (amenidades del DESARROLLO,
   agregadas de los proyectos de la zona). *(gate: dev.amenities)* ← nuevo, data real YA
3. Un hogar que sube de valor — plusvalía + 5 años. *(gate: inv)* ✅
4. ¿Cuánto para el hogar? — crédito. *(gate: credito)* ✅
**UX:** cálido, foto-driven, amenidades con íconos. **CTA:** "Agenda una visita en familia".

## ✨ VIVIR MEJOR — "la vida que mereces"
**Narrativa:** aspiración (te lo ganaste) → la vida aquí (a pie: restaurantes, cafés) → el desarrollo a tu nivel
(amenidades premium: sky lounge, spa, concierge) → y además sube de valor → CTA (conoce las residencias).
**Bloques:**
1. **La vida a la vuelta** — restaurantes/cafés/cultura. *(gate: amenidades de ZONA · Google)* 🔴
2. **Desarrollos a tu nivel** — sky lounge, spa, concierge, roof (amenidades premium del desarrollo). *(gate: dev.amenities)* ← nuevo
3. Vives mejor y tu patrimonio sube — plusvalía. *(gate: inv)* ✅
4. Crédito. *(gate: credito)* ✅
**UX:** editorial, premium, imágenes grandes. **CTA:** "Conoce las residencias".

---
## Lo que falta de DATA (honesto)
- **Amenidades de ZONA reales (Google Places):** desbloquea bloque 1 de familia + vivir. Necesita key + pago (1 vez).
- **Históricos/forecast (gráficas):** necesita volumen de transacciones (~6 zonas hoy). Gateado, aparece solo donde hay.
- **Amenidades del DESARROLLO:** YA las tenemos (dev.amenities) → se usan ya (agregadas por zona).
