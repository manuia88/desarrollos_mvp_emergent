# Página de Zona `/zona/:slug` — Wireframe del rebuild (formato marketplace)

**Fecha:** 2026-06-19 · branch `dev-redesign-tandas`
**Diseño:** sigue el marketplace — claro, tarjetas blancas con sombra fina (`.dmx-card`), chips, globitos (?) instantáneos
estilo menú, title case inteligente, CTAs gradiente morado→magenta, lenguaje humano + fuente honesta por dato.
**Un solo template** para las ~200 colonias, alimentado por endpoints existentes. Arsenal en `ZONA_PAGE_ARSENAL.md`.

```
┌────────────────────────────────────────────────────────────────────┐
│ [DesarrollosMX · nav 4 portales]                      ES/EN  Entrar  │
├────────────────────────────────────────────────────────────────────┤
│ HERO · Roma Norte  ·  Cuauhtémoc                        ┌──────────┐ │
│ 🟢 El veredicto: Para invertir — sube parejo y          │ mini-mapa│ │
│    todavía accesible.                                   │ (polígono│ │
│ [💰 $65k/m²] [📈 +6%/año] [🏡 calidad alta] [🏢 12 devs] │  de la   │ │
│ [🔔 Vigila esta zona]   [Ver desarrollos →]             │ colonia) │ │
│                                                         └──────────┘ │
├────────────────────────────────────────────────────────────────────┤
│ 💰 PRECIOS Y VALOR                                                   │
│  Valor de la zona  $65,000/m² (±8%)      Índice DRPI ▁▂▃▅▆ +1.2% mes │
│  Pronóstico 12m  +6%        Confianza del pronóstico  82% (histórico)│
│  ⓘ fuente: AVM + transacciones · estimado donde no hay dato          │
├────────────────────────────────────────────────────────────────────┤
│ 📈 ¿BUENA INVERSIÓN?                              🟢 buena (?)        │
│  Renta mensual  $X   Plusvalía 6%(?)   Cap rate 4%(?)                 │
│  TIR 7%(?)   ROI a 5 años +X%(?)                                      │
│  🏦 Crédito hipotecario · tabla 30/50/80% + total a 20 años          │
│  └─ REUSA el panel de inversión que ya construimos                   │
├────────────────────────────────────────────────────────────────────┤
│ 🏡 ¿CÓMO SE VIVE AQUÍ? (datos concretos, no scores subjetivos)       │
│  🍴 142 restaurantes  🏫 18 escuelas  🏥 6 hospitales                 │
│  🌳 9 parques  🏦 24 bancos  🛒 31 tiendas                            │
│  🚇 Metro Insurgentes a 400 m · Metrobús a 250 m                      │
│  🛡️ Riesgo  B  — crimen bajo · sismo medio · sin inundación (?)       │
├────────────────────────────────────────────────────────────────────┤
│ 🔥 MERCADO VIVO (en tiempo real)                      Pulso 74/100 ↑ │
│  📈 búsquedas +18%   👁 vistas +9%   📨 leads +5%   💵 precio +1%     │
│  🏗️ "23 personas buscaron 2 rec <$6M aquí y no hay nada"             │
│      → ¿Eres desarrollador? Hay hueco.  [Ver el hueco →]             │
├────────────────────────────────────────────────────────────────────┤
│ 🏢 DESARROLLOS EN ROMA NORTE                                         │
│  [tarjeta] [tarjeta] [tarjeta]   ← reusa DevelopmentCard + scroll    │
├────────────────────────────────────────────────────────────────────┤
│ ⚖️ COMPARA                                                           │
│  Parecidas: Condesa · Juárez · Escandón   ·  Roma vs competidoras    │
│  [Comparar esta zona con otra →]                                     │
├────────────────────────────────────────────────────────────────────┤
│ 👥 GENTE COMO TÚ                                                     │
│  "Compradores con tu perfil se interesaron/cerraron en Roma…"        │
│  └─ lookalike/embeddings (se enciende con escala)                    │
├────────────────────────────────────────────────────────────────────┤
│ 📚 Fuentes y método (los 97 indicadores) · datos al [fecha]          │
└────────────────────────────────────────────────────────────────────┘
                                        🤖 [ Pregúntame de Roma Norte ]
                                           ← Atlax flotante, contextual
```

## Spec por sección (fuente · qué se prende · ciclo que cierra)
| Sección | Fuente backend | Estado a prender | Ciclo |
|---|---|---|---|
| **Hero + veredicto** | colonias + scores + inversion | reusa lógica del menú | — |
| **🔔 Vigila esta zona** | watch + casamentera | cablear botón→alerta | watch→lead |
| **Precios y valor** | `avm_public` · `drpi_engine` · `forecast_engine` · `fsd` | conectado (página vieja) | predicción→cierre→coach |
| **¿Buena inversión?** | `/api/zona/{id}/inversion` | ✅ ya construido (reusar) | — |
| **¿Cómo se vive?** | `osm_engine`/denue · `gtfs_cdmx` · `risk_score_engine` | 🟠 HUÉRFANO → surfacear (la joya) | — |
| **Mercado vivo** | `live_pulse_engine` · demanda insatisfecha | parcial → prender público | comprador→dev · auto-feed |
| **Desarrollos** | `/api/developments?colonia=` | reusa grid | — |
| **Compara** | `comparator_engine` · `battle_card` · similar | conectar | — |
| **Gente como tú** | `cerebro/lookalike` + embeddings | 🔴 con OPENAI_KEY + escala | flywheel de cierres |
| **Atlax contextual** | `atlax_engine` + `asistente_engine` (39 tools) | 🟠 cablear contexto de zona | comprador→lead |

## Orden de construcción sugerido (build-for-endstate, todo cableado)
1. Estructura + hero + estilo claro (template base).
2. Bloques con dato real ya cableado: Precios/Valor · ¿Buena inversión? (reuso) · Desarrollos · Compara.
3. **Surfacear lo huérfano:** ¿Cómo se vive? (amenidades/transporte/riesgo) — alto valor, dato real.
4. Mercado vivo (Live Pulse + demanda insatisfecha pública con CTA dev).
5. Upgrades agénticos: 🔔 Vigila · 🤖 Atlax contextual · 👥 Gente como tú.
6. Footer de fuentes + honestidad de cobertura.
```
```
