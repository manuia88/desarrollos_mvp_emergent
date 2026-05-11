// SkipToContent — enlace de salto accesible. Visible solo al recibir foco (teclado).
// Debe montarse como primer hijo del árbol de componentes.
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function SkipToContent() {
  const { t } = useTranslation();
  return (
    <a
      href="#main-content"
      className="skip-to-content"
      data-testid="skip-to-content"
    >
      {t('a11y.skip_to_content', 'Saltar al contenido principal')}
    </a>
  );
}
