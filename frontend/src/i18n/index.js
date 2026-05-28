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

// W7.AS.3.A — Conversation AI Agent (namespace separado para evitar race con common.json)
import esMXConversationRound1 from './locales/es-MX/conversation_round1.json';
// W7.AS.3.D — Round 2 · UI Advanced (Inbox/SuggestedReplies/Takeover/Heatmap/KbGaps)
import esMXConversationRound2Ui from './locales/es-MX/conversation_round2_ui.json';
// W7.AS.3.F — Round 2 · Cost dashboard namespace (Terminal F · post-merge activado).
import esMXConversationCost from './locales/es-MX/conversation_cost.json';
// W7.AS.3.G — Round 3 · A/B Testing namespace (separado · no toca common.json)
import esMXConversationAbTesting from './locales/es-MX/conversation_ab_testing.json';
// W7.AS.3.H — Round 3 · Confidence Score namespace (post-merge activado)
import esMXConversationConfidence from './locales/es-MX/conversation_confidence.json';
// W7.AS.3.I — Round 3 · Drift Dashboard namespace (post-merge activado)
import esMXConversationDrift from './locales/es-MX/conversation_drift.json';
// F1 — Asesor Sidebar Reorg V2 namespace (separado · no toca common.json)
import esMXAsesorSidebarV2 from './locales/es-MX/asesor_sidebar_v2.json';

i18n.use(initReactI18next).init({
  resources: {
    // Legacy support
    es: { translation: es },
    en: { translation: en },

    // Namespaced es-MX (primary)
    'es-MX': {
      translation: es,       // also exposes legacy keys under es-MX for fallback
      common: esMXCommon,
      conversation_round1: esMXConversationRound1,
      conversation_round2_ui: esMXConversationRound2Ui,
      conversation_cost: esMXConversationCost,
      conversation_ab_testing: esMXConversationAbTesting,
      conversation_confidence: esMXConversationConfidence,
      conversation_drift: esMXConversationDrift,
      asesor_sidebar_v2: esMXAsesorSidebarV2,
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
  ns: ['translation', 'common', 'conversation_round1', 'conversation_round2_ui', 'conversation_cost', 'conversation_ab_testing', 'conversation_confidence', 'conversation_drift', 'asesor_sidebar_v2'],

  interpolation: {
    escapeValue: false,  // React already escapes
  },

  // Clean separation between namespaces (don't leak keys)
  nsSeparator: ':',
  keySeparator: '.',
});

export default i18n;
