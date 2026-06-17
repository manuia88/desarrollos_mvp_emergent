/**
 * DMX UI · Sistema de diseño coherente (F0 del rediseño 2026-06-16).
 *
 * Vocabulario ÚNICO que comparten los 5 portales. Todo sobre los tokens de index.css
 * (var(--theme)/--cream/--border/--r-card…), así que se adapta solo al tema de cada portal.
 * La cara pública + marketplace van en <LightScope> (fondo claro · decisión founder).
 *
 *   import { Button, Card, Badge, Input, Field, Container, Section, LightScope } from 'components/ui';
 *
 * Regla: ningún portal nuevo usa botones/tarjetas/inputs inline ad-hoc — usa estas primitivas.
 */
export { default as Button } from './Button';
export { default as Card } from './Card';
export { default as Badge } from './Badge';
export { default as Input, Field } from './Input';
export { default as LightScope } from './LightScope';
export { default as PublicNav } from './PublicNav';
export { default as Aurora } from './Aurora';
export { Container, Section } from './Container';
