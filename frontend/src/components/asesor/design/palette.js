// Sistema de Diseño asesor · paleta semántica
// ----------------------------------------------------------------------------
// QUÉ ES: la fuente única de color/etiqueta para temperatura y estatus de lead.
// CUÁNDO: la consumen StatusDot, TemperaturePill, ScoreBar y las columnas kanban
//         de la pantalla de Leads. Un solo lugar = consistencia (patrón EB #5).
//
// REGLAS: el color de MARCA (indigo→pink) SIEMPRE sale de var(--theme*)/var(--grad)
//         vía CSS, nunca de aquí. Aquí viven solo los colores SEMÁNTICOS de estado
//         (frío/tibio/caliente/cliente), expresados como rgba() numérico — NUNCA
//         hex — para alinear con la convención del repo (Badge, BuyerScoreBadge).
//
// El kanban de Leads usa `temperatura` como dimensión de pipeline porque es el
// único campo de estado del contacto que el contrato (advisor.js · patchContacto
// y bulk set_temp) sabe mutar. Las columnas y los pills comparten esta paleta.

// Temperatura → color semántico + etiqueta es-MX. Intuición térmica: frío=azul,
// tibio=ámbar, caliente=coral, cliente(=cerrado)=verde.
export const TEMP = {
  frio:     { key: 'frio',     label: 'Frío',     rgb: '96, 165, 250'  }, // azul
  tibio:    { key: 'tibio',    label: 'Tibio',    rgb: '251, 191, 36'  }, // ámbar
  caliente: { key: 'caliente', label: 'Caliente', rgb: '248, 113, 113' }, // coral
  cliente:  { key: 'cliente',  label: 'Cliente',  rgb: '52, 211, 153'  }, // verde
};

// Orden canónico del pipeline (izquierda → derecha) = el "embudo" de Leads.
export const TEMP_ORDER = ['frio', 'tibio', 'caliente', 'cliente'];

// Helper: devuelve la entrada de paleta para una temperatura (fallback frío).
export const tempMeta = (t) => TEMP[t] || TEMP.frio;

// Estilos derivados de un rgb semántico (bg suave + borde + texto claro).
export const tone = (rgb) => ({
  bg: `rgba(${rgb}, 0.14)`,
  border: `rgba(${rgb}, 0.36)`,
  text: `rgb(${rgb})`,
  dot: `rgb(${rgb})`,
});

// Prioridad de acción (Foco de hoy) → rgb. 1 urgente · 2 medio · 3 tranquilo.
export const PRIORITY_RGB = {
  1: '248, 113, 113',
  2: '251, 191, 36',
  3: '52, 211, 153',
};
