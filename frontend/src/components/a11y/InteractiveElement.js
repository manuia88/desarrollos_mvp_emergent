/**
 * InteractiveElement · A11y wrapper para divs/spans con onClick.
 *
 * Resuelve los 2 errores ESLint más comunes de jsx-a11y:
 *   - click-events-have-key-events (necesita onKeyDown)
 *   - no-static-element-interactions (necesita role + tabIndex)
 *
 * Uso:
 *   <InteractiveElement onClick={handler}>Click me</InteractiveElement>
 *   // renderiza: <div role="button" tabIndex={0} onClick={handler}
 *   //              onKeyDown={enter+space → handler}>Click me</div>
 *
 * Props:
 *   - onClick: handler obligatorio
 *   - children: contenido
 *   - as: 'div' (default) | 'span' | otro
 *   - role: 'button' (default) | 'link' | 'tab' | etc
 *   - tabIndex: 0 (default · focusable) | -1 (focusable solo por JS)
 *   - disabled: si true · tabIndex=-1 y onClick no se ejecuta
 *   - className · style · etc se pasan al elemento
 *
 * Diseño: prefer NATIVE elements when possible (button · a · etc). Use este wrapper
 * SOLO cuando un div/span es necesario por restricciones de layout/styling existente.
 *
 * W4.15 A11y Etapa 4 · 2026-05-14.
 */
import React from 'react';

export default function InteractiveElement({
  as = 'div',
  onClick,
  onKeyDown,
  children,
  role = 'button',
  tabIndex,
  disabled = false,
  ariaLabel,
  className,
  style,
  ...rest
}) {
  const handleKeyDown = (e) => {
    if (onKeyDown) onKeyDown(e);
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (onClick) onClick(e);
    }
  };

  const handleClick = (e) => {
    if (disabled) return;
    if (onClick) onClick(e);
  };

  const Tag = as;
  const computedTabIndex = disabled ? -1 : tabIndex !== undefined ? tabIndex : 0;

  return (
    <Tag
      role={role}
      tabIndex={computedTabIndex}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
