import React from 'react';
import { FeatureStatus, getFeatureStatusBadge } from '../utils/featureStatus';

interface FeatureBadgeProps {
  status: FeatureStatus;
  language?: 'en' | 'tr';
  className?: string;
}

export const FeatureBadge: React.FC<FeatureBadgeProps> = ({ status, language = 'en', className = '' }) => {
  const badge = getFeatureStatusBadge(status, language);
  return (
    <span className={`${badge.className} ${className}`}>
      {badge.label}
    </span>
  );
};
