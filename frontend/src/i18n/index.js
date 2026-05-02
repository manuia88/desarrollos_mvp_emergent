/**
 * i18n configuration — Phase 4 B0 Sub-chunk C
 * Primary: es-MX (all app copy)
 * Secondary: en-US (portal-ready for international use)
 *
 * Namespaces:
 *   translation — legacy (es/en top-level keys, backward-compat)
 *   common      — new shared primitives namespace (es-MX/common.json, en-US/common.json)
 *
 * Usage:
 *   const { t } = useTranslation()           // uses 'translation' namespace
 *   const { t } = useTranslation('common')   // uses 'common' namespace
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Legacy translations (backward-compat)
import es from './locales/es.json';
import en from './locales/en.json';

// New namespaced translations (es-MX / en-US)
import esMXCommon from './locales/es-MX/common.json';
import enUSCommon from './locales/en-US/common.json';

i18n.use(initReactI18next).init({
  resources: {
    // Legacy support
    es: { translation: es },
    en: { translation: en },

    // Namespaced es-MX (primary)
    'es-MX': {
      translation: es,       // also exposes legacy keys under es-MX for fallback
      common: esMXCommon,
    },

    // Namespaced en-US
    'en-US': {
      translation: en,
      common: enUSCommon,
    },
  },

  // Primary locale for DMX platform
  lng: 'es-MX',

  // Fallback chain: es-MX → es → en-US → en
  fallbackLng: ['es-MX', 'es', 'en-US', 'en'],

  // Default namespace
  defaultNS: 'translation',

  // Available namespaces
  ns: ['translation', 'common'],

  interpolation: {
    escapeValue: false,  // React already escapes
  },

  // Clean separation between namespaces (don't leak keys)
  nsSeparator: ':',
  keySeparator: '.',
});

export default i18n;
