import React from 'react';
import { motion } from 'framer-motion';
import type { VerificationStatus } from '../../types';

interface ConfidenceRingProps {
  score: number;
  status: VerificationStatus | string;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

export const ConfidenceRing: React.FC<ConfidenceRingProps> = ({
  score,
  status,
  size = 148,
  strokeWidth = 10,
  showLabel = true,
  className = '',
}) => {
  const norm = (status || '').toUpperCase();
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(Math.max(score, 0), 100) / 100) * circumference;

  const colorConfig: Record<string, { stroke: string; track: string; text: string }> = {
    VERIFIED: {
      stroke: 'var(--color-brand-600)',
      track: 'rgba(22, 110, 84, 0.12)',
      text: 'var(--color-brand-700)',
    },
    REVIEW: {
      stroke: 'var(--color-amber-500)',
      track: 'rgba(217, 119, 6, 0.12)',
      text: 'var(--color-amber-600)',
    },
    SUSPICIOUS: {
      stroke: 'var(--color-red-500)',
      track: 'rgba(220, 38, 38, 0.12)',
      text: 'var(--color-red-600)',
    },
    NOT_FOUND: {
      stroke: 'var(--color-slate-400)',
      track: 'rgba(148, 163, 184, 0.15)',
      text: 'var(--color-slate-600)',
    },
  };

  const colors = colorConfig[norm] || colorConfig.NOT_FOUND;

  return (
    <div
      className={`confidence-ring ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Verification confidence score: ${score} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.track}
          strokeWidth={strokeWidth}
        />
        {/* Progress Circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="confidence-ring__content">
        <span className="confidence-ring__value" style={{ color: colors.text }}>
          {score}
          <span className="confidence-ring__percent">%</span>
        </span>
        {showLabel && <span className="confidence-ring__label">CONFIDENCE</span>}
      </div>
    </div>
  );
};

export default ConfidenceRing;
