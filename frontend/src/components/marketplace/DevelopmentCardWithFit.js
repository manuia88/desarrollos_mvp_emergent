// W5.x F11 wire · DevelopmentCardWithFit · wrapper externo · NO modifica DevelopmentCard
// Renderiza overlay FitScoreBadge top-right si advisor + leadId.
import React from 'react';
import DevelopmentCard from './DevelopmentCard';
import FitScoreBadge from '../fit/FitScoreBadge';
import useFitScore from '../../hooks/useFitScore';

export default function DevelopmentCardWithFit({
  dev,
  index,
  leadId = null,
  userRole = null,
  ...rest
}) {
  const isAdvisor = userRole === 'advisor' || userRole === 'asesor_admin' || userRole === 'asesor_freelance';
  const enabled = !!(isAdvisor && leadId && dev?.id);

  const { data: fit } = useFitScore({
    leadId,
    propertyId: dev?.id,
    enabled,
  });

  const fitScore = fit && typeof fit.score === 'number' ? fit.score : null;
  const fitConfidence = fit?.confidence || 'media';

  return (
    <div style={{ position: 'relative' }} data-testid={`dev-card-fit-${dev?.id || index}`}>
      <DevelopmentCard dev={dev} index={index} {...rest} />
      {enabled && fitScore !== null && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 5,
            pointerEvents: 'auto',
          }}
        >
          <FitScoreBadge score={fitScore} confidence={fitConfidence} size="sm" />
        </div>
      )}
    </div>
  );
}
