# DMX Insights Granularity Schema · 16 categorías × ~150 sub-dimensiones

**Versión**: 1.0 · 2026-05-10
**Destino**: módulo W5.10 Wave 5 H2 (Social/Ads Multi-tenant + Analytics + IA Layer · **233h** scope-updated 2026-05-12 +28h Zernio learnings)
**Objetivo**: cubo OLAP-like que permita query cross-dimension brutal · feed AI optimization layer

---

## 1. USUARIO
- Role: Asesor/Inmobiliaria · Dev/Desarrolladora · Superadmin
- Tier: T0/T1/T2/T3/T4
- Antigüedad cohorte: <30d · 30-90d · 90-180d · 180-365d · 1y+
- DISC profile: D · I · S · C · unknown
- Tamaño org: Solo · 2-5 · 6-20 · 21-50 · 50+
- Geografía base: CDMX · GDL · MTY · QRO · Riviera Maya · otras
- Estado actividad: Activo · churned · suspended · paused
- Plan/subscription: Free · Starter · Pro · Enterprise

## 2. INMOBILIARIA
- Tipo: Boutique · Corporativa · Franquicia (RE/MAX · Coldwell · C21) · Independiente
- Verticales: Residencial · Comercial · Industrial · Hospitalidad
- Especialización: Preventa · Usada · Luxury · Medio · Social · Mixed
- # asesores activos: 1 · 2-5 · 6-20 · 21-50 · 50+
- Volumen mensual: <5 · 5-15 · 15-50 · 50+ transacciones
- Promedio ticket: <2M · 2-5M · 5-10M · 10M+
- Coverage geográfica: 1 zona · multi-zona · multi-ciudad · nacional

## 3. DEV/DESARROLLADORA
- Tipo: Dev único · Family Office · Grupo corporativo · Institutional · Public co. (FIBRAs)
- Tamaño portfolio: 1-3 · 4-10 · 11-25 · 25+ proyectos
- Especialización: Residencial · Mixed-use · Hospitality · Industrial · Office · Retail
- Tier corporativo: Boutique · Mid-market · Corporate · Institutional
- Reputación score: Fitch · HR Ratings · S&P MX
- Capacidad financiera: Self-funded · Mezzanine · Bank-backed · Public debt · Equity raise

## 4. GEOGRÁFICAS (multi-nivel)
- Estado: 32 estados MX
- Municipio/Alcaldía: 16 alcaldías CDMX + municipios EdoMex
- Colonia: ~1500+ colonias CDMX
- Sub-colonia/zona: ej. Polanco I-V · Lomas (Bezares · Hipódromo · Virreyes)
- Polígono custom: user-defined · Atlax saved zones (W4.18.2B)
- Distance metrics: metro · hospital · escuela · centro comercial · parque · aeropuerto
- Risk zones: sísmico · inundación · hundimiento · violencia (Atlas Riesgos W4.18)
- Walkability: score 0-100
- Traffic congestion: hora pico · promedio diario
- Air quality: IMECA index histórico

## 5. PROYECTO/PROPIEDAD
- Tipo vivienda: Depto · Casa · Loft · Penthouse · Garden House · Duplex · Triplex · Studio · Oficina · Local · Industrial · Terreno
- Categoría precio: Interés social <1.5M · Medio 1.5-3M · Residencial 3-7M · Plus 7-15M · Premium 15-30M · Luxury 30-60M · Ultra-luxury 60M+
- Microrangos $: <2M · 2-4M · 4-6M · 6-10M · 10-20M · 20-50M · 50-100M · 100M+
- Status: Preventa · En construcción · Entrega inmediata · Usada en venta · Usada rentada
- Año entrega: 2026 · 2027 · 2028 · 2029+
- Antigüedad usada: 0-5y · 5-10y · 10-20y · 20-50y · 50+y · histórica
- M2 construcción: <40 · 40-60 · 60-90 · 90-130 · 130-200 · 200-350 · 350+
- M2 terreno: <100 · 100-300 · 300-500 · 500-1000 · 1000+
- Recámaras: Studio · 1 · 2 · 3 · 4 · 5+
- Baños: 1 · 1.5 · 2 · 2.5 · 3 · 4+
- Estacionamientos: 0 · 1 · 2 · 3 · 4+
- Amenities (multi-select): Pool · gym · padel · pet park · coworking · cinema · roof terrace · 24h security · valet · concierge · spa · cellar · BBQ · kids playground
- Certificaciones: LEED · WELL · BREEAM · EDGE · Passivhaus · ENERGY STAR · ESG-rated
- Sustentabilidad: Panel solar · captación agua · domótica · jardines verticales · materiales eco
- Acabados: Estándar · Plus · Premium · Custom · Designer collab
- Vistas: Interior · ciudad · panorámica · jardín · mar · canyon
- Piso: PB · 1-3 · 4-7 · 8-15 · 16-25 · 26+

## 6. CAMPAÑA/AD
- Plataforma: Meta (FB/IG/Marketplace/WA) · Google (Search/Display/Shopping) · YouTube · TikTok · LinkedIn · X/Twitter · Pinterest
- Sub-plataforma: FB feed · IG feed · IG stories · IG reels · WA Status · YT in-stream · YT bumper · YT Shorts · TikTok feed · TikTok Spark Ads · LinkedIn sponsored
- Objetivo: Awareness · Traffic · Engagement · Leads · Conversions · Sales · Catalog · Video views · Messages · App installs · Brand · Reach
- Tipo creative: Single image · Carousel · Video · Reel · Slideshow · Collection · Stories · Existing post · Dynamic
- Formato creative: 16:9 · 9:16 · 1:1 · 4:5 · custom
- Audiencia: Cold · Warm · Retargeting · Lookalike (1-10%) · Custom
- Audiencia spec: Intereses · Comportamientos · Demográficos · Geográficos · Edades · Idiomas · Estado civil · Educación · Ingresos est.
- Budget tipo: Daily · Lifetime · CBO · ABO
- Budget rango $/día: <$100 · $100-300 · $300-1000 · $1000-3000 · $3000-10K · $10K+
- Duración: <3 días · 3-7d · 7-14d · 14-30d · 30-90d · 90+d
- Pricing model: CPC · CPM · CPV · CPA · oCPM · ROAS bidding
- Optimization goal: Clicks · LP-views · Conversions · Post-engagement · Video-views · Lead form
- Bid strategy: Lowest cost · Cost cap · Bid cap · Target cost · Highest value

## 7. CONTENIDO ORGÁNICO
- Plataforma + tipo: FB post · FB story · IG feed · IG stories · IG reels · IG live · YT video · YT Shorts · TikTok · WA Status · LinkedIn post · Pinterest pin
- Formato: Text-only · Single image · Carousel · Video · Reel/Short · Story · Live · Poll · Q&A · Quiz
- Aspect ratio: 16:9 · 9:16 · 1:1 · 4:5 · 3:4
- Duración video: <15s · 15-30s · 30-60s · 1-3m · 3-10m · 10m+
- Generado por: Studio Wave IA · Manual · Mixed
- Tipo contenido: Educational · Promotional · Testimonial · Behind-scenes · Listing · Market-news · Lifestyle · Property-tour · ROI-talk · Neighborhood-guide · Methodology · Q&A
- CTA tipo: Visit website · Message · Learn more · Book now · Download · Sign up · Apply · Save · Share
- Idioma: es-MX · en-US · ar-AE · pt-BR
- Hashtags: top usados · count · trending · branded
- Música/Audio: Trending · royalty-free · custom · brand · voiceover IA (ElevenLabs)

## 8. LEAD/CLIENTE
- Source: Orgánico FB · IG · YT · ad FB · IG · Google · YT · TikTok · referral · DMX directo · `/asistente` Atlax · evento · prensa · email · WhatsApp · partner
- UTM completo: source · medium · campaign · term · content
- Landing page entry: `/marketplace` · `/mapa` · `/desarrollo/{slug}` · `/colonia/{slug}` · `/valores` · `/asistente` · `/inteligencia` · `/methodology`
- Funnel step (16 step types W4.13.A): Visited · Viewed · Watchlist · Contacted · Qualified · Meeting · Visit · Proposal · Closed-won · Closed-lost · Re-engaged · etc.
- DISC profile: D · I · S · C · unknown
- Score qualification: 0-100 ML scored
- Budget cliente: <2M · 2-5M · 5-10M · 10-20M · 20M+ · undisclosed
- Tipo búsqueda: Preventa · Usada · Ambos · Renta
- M2 deseado: <50 · 50-100 · 100-150 · 150-250 · 250+
- Recámaras objetivo: 1 · 2 · 3 · 4+
- Plazo decisión: Urgente <30d · 0-3m · 3-6m · 6-12m · explorando 12m+
- Financiamiento: Cash · Hipoteca pendiente · INFONAVIT · FOVISSSTE · Pre-aprobado · Mixed
- Demografía: Edad · género · estado civil · # dependientes · ingresos est. · educación
- Idioma preferido: es · en · multi
- Device + OS: iOS · Android · Windows · macOS · Linux
- Browser: Chrome · Safari · Firefox · Edge
- Tiempo plataforma: <30s · 30s-2m · 2-10m · 10-30m · 30m+
- # interacciones: 1 · 2-5 · 6-15 · 15+
- # touchpoints: 1 · 2-3 · 4-7 · 8+ (multi-touch attribution)

## 9. TEMPORALES
- Granularidad: Hora · día · semana ISO · mes · trimestre · año
- Día semana: Lun-Dom
- Hora del día: 0-23 (peak vs off-peak)
- Día festivo MX: sí · no · pre-festivo
- Estacionalidad RE: Q1 alza · Q2 estable · Q3 verano · Q4 cierre · Bono diciembre · enero rebound
- Eventos calendario: Black Friday · Cyber Monday · Buen Fin · Navidad · DMX Anniversary · launch dev específico

## 10. CANAL
- Owned: DMX directo · `/asistente` Atlax · email Newsletter Resend · WhatsApp directo · website propio · embeds widgets
- Paid: FB · IG · Google · YouTube · TikTok · LinkedIn · X · Pinterest · Marketplace listings paid
- Earned: PR · embeds prensa (Forbes/El Financiero) · backlinks SEO · referrals · word-of-mouth
- Social orgánico: FB · IG · YT · TikTok · LinkedIn · X · Pinterest

## 11. FINANCIERAS
- Spend total: $ MXN · USD · AED
- Spend per dim: campaign · ad · day · platform · zone · proyecto · canal · audience · creative
- ROAS: <1x · 1-2x · 2-4x · 4-8x · 8-15x · 15x+
- Revenue attributed: First-touch · last-touch · linear · time-decay · position-based · data-driven
- CAC: $ por lead · qualified lead · closed deal
- LTV: estimado per cliente · cohorte · source
- Payback period: meses
- CPL · CPC · CPM · CPV · CPI: estandarizados platform-comparable
- Conversion rate: per funnel step · platform · audience
- Win rate: % leads que cierran
- Average ticket: per source · channel · zone · proyecto
- Profit margin per deal: comisión asesor · margen dev · DMX fee

## 12. PERFORMANCE METRICS
- Awareness: Impressions · Reach · Frequency · Brand lift
- Engagement: Likes · Comments · Shares · Saves · Reactions · Sticker taps · Polls · Q&A
- Click-based: CTR · Outbound CTR · Inbound CTR · Profile visits
- Video: Views (3s/10s/15s) · Completion rate (25/50/75/100%) · Avg watch time · Sound-on rate · Replays
- Story: Exits · Replies · Stickers tapped · Forward rate
- Reel/Short: Reach rate · Watch time · Loops · Shares · Saves
- Conversion: Landing-page views · Add-to-cart-equiv · Initiate-checkout-equiv · Purchase · Lead form submit
- Web: Time on page · Bounce rate · Pages/session · Scroll depth · Hover rate
- Multi-touch: Conversion path length · Touchpoints to convert · Days to convert

## 13. DMX-UNIQUE (inteligencia propia)
- Zone Score (W3): A-F per colonia · 6 axes
- Hedonic predicted price (W3): $/m2 estimado
- Demand index (W4.18.2B): demanda 30d per colonia
- Supply index (W4.18.2B): inventory active per colonia
- Demand-Supply gap: red/yellow/green zones
- Velocity prediction: months to sellout per proyecto
- Comparable similarity: 0-100 vs comparables zona
- DISC compatibility (W4.6): lead↔asesor match score
- Match weights (W4.7 Y.4B): lead↔proyecto adaptive
- Risk score (W4.18): Atlas Riesgos compounded
- Walkability custom: OSM + GTFS DMX score
- Atlax conversation depth: # turns · sentiment · intent
- Behavioral signals (W4.3): heatmap density · scroll · tab-switch
- Ingestion confidence: bulk_ingest dedup score

## 14. COMPLIANCE/QUALITY
- LFPDPPP consent: granted · denied · partial · pending
- Cookie tier: essential · analytics · marketing
- Data quality score: 0-100
- Origin geo IP: MX · USA · LATAM · Europa · Asia
- Ad disapprovals count: per platform · period
- Ad reviews pending: time waiting · category
- Violations history: type · severity · resolution

## 15. DEVICE/SESSION
- Device: Mobile · Tablet · Desktop · Smart TV · Connected
- OS: iOS (versión) · Android (versión) · Windows · macOS · Linux
- Browser: Chrome · Safari · Firefox · Edge · Brave · Opera
- Screen: <360 · 360-768 · 768-1280 · 1280-1920 · 1920+
- Network: WiFi · 5G · 4G · 3G · slow
- Logged-in: sí · anonymous · partial (waitlist)

## 16. COMPETITIVE INTELLIGENCE
- Competitor activity: FB Ad Library scraping legal · LinkedIn Ad Library · X transparency · TikTok Creative Center
- Top performing creatives industry: inferido FB Ad Library RE category MX
- Average CPM industry: per platform · vertical
- Average CPL industry: per platform · vertical
- Market share organic vs paid: per zona · proyecto · share-of-voice

---

## TOP 10 cross-dimension queries que mueven aguja

1. **Spend × Plataforma × Zona × Tipo vivienda × ROAS** → "Polanco preventa luxury en TikTok Reels = ROAS 12x · NO en LinkedIn = ROAS 2x"
2. **CPL × Source × DISC × Lead score × Win rate** → "Leads DISC-D desde IG Reels luxury = win rate 38% vs DISC-S desde FB Ads = 12%"
3. **Audience spec × Creative format × Hour × Engagement** → "Audiencia 35-50 inversionistas + Reel vertical 30s + 9-11pm = engagement 4.5x baseline"
4. **Zona × Demand-Supply gap × Spend efficiency** → "Roma Sur demand-gap +35% pero spend industria <10% = oportunidad alpha 18m"
5. **Asesor × DISC compat × Lead source × Conversion** → "Asesor DISC-I match con leads I+S desde IG = 4x conversion vs random"
6. **Dev × Velocity prediction × Spend optimization** → "Torre Polanco velocity 14m → bajar 5% precio + redirigir 30% budget = velocity 9m · ROI dev +18%"
7. **Creative format × Audience × Funnel step × Cost per stage** → "Carousel 5-img cold = awareness · Video 15s retargeting = conversion"
8. **Period × Estacionalidad × Spend × Performance** → "Q4 cierre fiscal + 31-Dec deadline → spend último 7d convierte 3x · auto-boost"
9. **Tenant × Multi-touch × Channel mix × Profit/deal** → "Mejor mix: 40% IG Reels + 30% Google Search + 20% WA + 10% YT Shorts = avg ticket 1.4x"
10. **Lead source × Time to convert × LTV × Best-fit creative IA** → "YT Shorts convierten 18d · LTV 2.3x · creative IA recomienda 'tour 30s + ROI overlay'"

---

## Implementación técnica W5.10

| Componente | Decisión |
|---|---|
| Storage | MongoDB time-series collections + agregados materializados pre-calculados |
| Aggregation | Mongo aggregation pipelines + Pandas analytics layer · Druid si >10M events/día Wave 6 |
| Cubo OLAP | Pre-compute slices comunes (1h cron) · query on-demand para combos raros |
| Granularity slicer UI | Faceted search component · 16 dims · multi-select · time range · save filter views |
| Permission filter | Middleware enmascara queries según role |
| Caching | Redis 5min TTL queries comunes · 1h TTL agregados pesados |
| Export | CSV · Excel · PDF · API JSON |
| AI optimization | LLM ingiere snapshot queries → recomienda acciones cuantificadas |

## Acceptance criteria W5.10 (mínimo)

Plataforma debe poder responder sin código adicional las 10 queries cross-dim listadas arriba.
