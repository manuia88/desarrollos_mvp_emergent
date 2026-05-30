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
// tibio=ámbar, caliente=coral, cliente(=cerrado)=verde. RGB alineados al mockup
// del tema claro: cold #3B82F6 · warm #E2982E · hot #F2635B · ok #1FA06A.
export const TEMP = {
  frio:     { key: 'frio',     label: 'Frío',     rgb: '59, 130, 246' }, // cold
  tibio:    { key: 'tibio',    label: 'Tibio',    rgb: '226, 152, 46' }, // warm
  caliente: { key: 'caliente', label: 'Caliente', rgb: '242, 99, 91'  }, // hot
  cliente:  { key: 'cliente',  label: 'Cliente',  rgb: '31, 160, 106' }, // ok
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
  1: '242, 99, 91',   // hot
  2: '226, 152, 46',  // warm
  3: '31, 160, 106',  // ok
};
