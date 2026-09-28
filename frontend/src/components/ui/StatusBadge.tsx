import React from 'react';
import { CheckCircle2, AlertTriangle, XOctagon, HelpCircle, Clock } from 'lucide-react';
import type { VerificationStatus } from '../../types';

interface StatusBadgeProps {
  status: VerificationStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const STATUS_METADATA: Record<string, { label: string; icon: typeof CheckCircle2; themeClass: string }> = {
  VERIFIED: {
    label: 'Verified',
    icon: CheckCircle2,
    themeClass: 'status-badge--verified',
  },
  REVIEW: {
    label: 'Review Required',
    icon: AlertTriangle,
    themeClass: 'status-badge--review',
  },
  SUSPICIOUS: {
    label: 'Suspicious',
    icon: XOctagon,
    themeClass: 'status-badge--suspicious',
  },
  NOT_FOUND: {
    label: 'Not Registered',
    icon: HelpCircle,
    themeClass: 'status-badge--notfound',
  },
  EXPIRED: {
    label: 'Expired',
    icon: Clock,
    themeClass: 'status-badge--expired',
  },
  REQUIRES_REVIEW: {
    label: 'Requires Review',
    icon: AlertTriangle,
    themeClass: 'status-badge--review',
  },
  INVALID: {
    label: 'Invalid',
    icon: XOctagon,
    themeClass: 'status-badge--suspicious',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const norm = (status || '').toUpperCase();
  const config = STATUS_METADATA[norm] || {
    label: status,
    icon: HelpCircle,
    themeClass: 'status-badge--neutral',
  };

  const Icon = config.icon;
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 16 : 14;

  return (
    <span
      className={`status-badge status-badge--${size} ${config.themeClass} ${className}`}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <span className="status-badge__dot" aria-hidden="true" />
      {showIcon && <Icon size={iconSize} className="status-badge__icon" aria-hidden="true" />}
      <span className="status-badge__text">{config.label}</span>
    </span>
  );
};

export default StatusBadge;
