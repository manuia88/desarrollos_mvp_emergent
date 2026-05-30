// Sistema de Diseño asesor · librería F0
// ----------------------------------------------------------------------------
// Componentes que encarnan los 10 patrones de facilidad de EasyBroker, vestidos
// 100% en estética DMX (aurora indigo→pink, glassmorphism, es-MX). Se construyen
// una vez aquí y se reúsan en cada pantalla del asesor (empezando por Leads).
// El scope visual vive en styles/asesor-aurora.css (.portal-asesor).
export { default as ActionBar } from './ActionBar';
export { default as ViewToggle } from './ViewToggle';
export { default as StatusDot } from './StatusDot';
export { default as TemperaturePill } from './TemperaturePill';
export { default as ScoreBar } from './ScoreBar';
export { default as ScoreRing } from './ScoreRing';
export { default as PremiumCard } from './PremiumCard';
export { default as Ficha360 } from './Ficha360';
export * from './palette';
