/**
 * W4.13.A Sub-B — JourneyStepIcon
 * Mapping de 16 step_types a iconos lucide-react.
 */
import React from 'react';
import {
  UserPlus, Sparkles, Brain, Route, UserCheck,
  Mail, MessageCircle, Calendar, MapPin, FileText,
  RefreshCw, Send, Zap, CheckCircle2, XCircle, Pause,
} from 'lucide-react';

const ICON_MAP = {
  captured: UserPlus,
  enriched: Sparkles,
  disc_inferred: Brain,
  routed: Route,
  assigned: UserCheck,
  first_touch_email: Mail,
  first_touch_whatsapp: MessageCircle,
  meeting_scheduled: Calendar,
  visit_completed: MapPin,
  quote_sent: FileText,
  nurtured: RefreshCw,
  outbound_initiated_by_asesor: Send,
  atlax_consulted_broker: Zap,
  closed_won: CheckCircle2,
  closed_lost: XCircle,
  nurture_paused: Pause,
};

const COLOR_BY_ACTOR = {
  system: 'rgba(99,102,241,0.85)',     // indigo
  asesor: 'rgba(236,72,153,0.85)',     // rose
  broker: 'rgba(236,72,153,0.85)',     // rose
  buyer:  'rgba(236,72,153,0.85)',     // rose
  atlax:  'rgba(240,235,224,0.85)',    // cream (AI)
  cron:   'rgba(240,235,224,0.7)',     // cream (AI)
};

export default function JourneyStepIcon({ stepType, actorType = 'system', size = 18 }) {
  const Icon = ICON_MAP[stepType] || Sparkles;
  const color = COLOR_BY_ACTOR[actorType] || COLOR_BY_ACTOR.system;
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${color.replace('0.85', '0.3').replace('0.7', '0.25')}`,
      color, flexShrink: 0,
    }}>
      <Icon size={size} />
    </div>
  );
}
