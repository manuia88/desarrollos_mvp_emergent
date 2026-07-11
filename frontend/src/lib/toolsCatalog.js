/*
 *  toolsCatalog — FUENTE ÚNICA de las herramientas públicas (nombre + ruta + para qué sirve).
 *  Antes la lista vivía duplicada en PublicNav y ToolNav → se desincronizaron y 5 páginas nuevas
 *  quedaron huérfanas del nav del home. Ahora TODOS (PublicNav, ToolNav, la página /herramientas)
 *  leen de aquí. Cambias una herramienta en un solo lugar. (regla: grep-antes-de-construir, cero duplicado)
 */
export const TOOL_GROUPS = [
  {
    title: 'Inteligencia de mercado',
    items: [
      { label: 'DMX Picks IA', to: '/picks', desc: 'Recomendaciones de inversión listas, rankeadas por la IA.' },
      { label: 'Ideas de inversión', to: '/ideas', desc: 'Feed de oportunidades: emergentes y por debajo de mercado.' },
      { label: 'Screener inmobiliario', to: '/screener', desc: 'Filtra colonias por precio, plusvalía, renta y riesgo.' },
      { label: 'El Índice DMX', to: '/indice', desc: 'La curva del mercado de la ciudad y qué zonas se mueven.' },
    ],
  },
  {
    title: 'Calculadoras',
    items: [
      { label: 'Calculadora de inversión', to: '/calculadora', desc: 'TIR, renta, plusvalía y escenarios de un departamento.' },
      { label: 'Proyector de impuestos', to: '/tools/tax-projector', desc: 'Estima el ISR al vender y tu costo de cierre.' },
    ],
  },
  {
    title: 'Mapas y zonas',
    items: [
      { label: 'Mapa de Valores', to: '/mapa-valores', desc: 'Precios por m² sobre el mapa de la ciudad.' },
      { label: 'Comparador de colonias', to: '/portal/comparador', desc: 'Enfrenta 2-3 zonas o desarrollos lado a lado.' },
      { label: 'Probabilidades', to: '/portal/probability', desc: 'Qué tan probable es alcanzar tu meta de rendimiento.' },
      { label: 'Vibra de la zona', to: '/portal/vibe', desc: 'Cómo se siente la colonia: ambiente y servicios.' },
      { label: 'Valores catastrales', to: '/valores', desc: 'Consulta el valor catastral de un predio.' },
    ],
  },
  {
    title: 'Datos y confianza',
    items: [
      { label: 'Datos por API (B2B)', to: '/datos', desc: 'Nuestra inteligencia de mercado para tu empresa.' },
      { label: 'Conectar por MCP', to: '/connect/mcp', desc: 'Conecta nuestros datos a tu asistente de IA (MCP).' },
      { label: 'Confianza / verificación', to: '/confianza', desc: 'Cómo verificamos desarrollos y asesores.' },
      { label: 'Sala de prensa', to: '/prensa', desc: 'Notas y datos del mercado para medios.' },
    ],
  },
];

// Lista plana (para navs que no agrupan)
export const TOOLS_FLAT = TOOL_GROUPS.flatMap((g) => g.items);
