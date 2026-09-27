import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, XOctagon, HelpCircle, Layers, CheckCircle } from 'lucide-react';
import type { VerificationStatus } from '../../types';
import AnimatedNumber from './AnimatedNumber';

interface ActiveInvestigationsQueueProps {
  suspiciousCount: number;
  reviewCount: number;
  notFoundCount: number;
  activeFilter: 'ALL' | VerificationStatus;
  onFilterChange: (status: 'ALL' | VerificationStatus) => void;
  className?: string;
}

export const ActiveInvestigationsQueue: React.FC<ActiveInvestigationsQueueProps> = ({
  suspiciousCount,
  reviewCount,
  notFoundCount,
  activeFilter,
  onFilterChange,
  className = '',
}) => {
  const totalAnomalies = suspiciousCount + reviewCount + notFoundCount;

  const categories = [
    {
      id: 'SUSPICIOUS' as const,
      label: 'Suspicious / Cloned',
      count: suspiciousCount,
      icon: XOctagon,
      themeClass: 'anomaly-pill--suspicious',
      hint: 'Serial collisions or packaging tampered',
    },
    {
      id: 'REVIEW' as const,
      label: 'Review Required',
      count: reviewCount,
      icon: AlertTriangle,
      themeClass: 'anomaly-pill--review',
      hint: 'Expiry or batch anomaly detected',
    },
    {
      id: 'NOT_FOUND' as const,
      label: 'Not Registered',
      count: notFoundCount,
      icon: HelpCircle,
      themeClass: 'anomaly-pill--notfound',
      hint: 'Absent from official manufacturer ledger',
    },
  ];

  return (
    <div className={`investigations-queue-console ${className}`}>
      <div className="investigations-queue-console__header">
        <div className="investigations-queue-console__title-wrap">
          <span className="command-eyebrow">ANOMALY TRIAGE QUEUE</span>
          <h3 className="command-section-title">Active Investigations</h3>
        </div>
        <div className="investigations-queue-console__summary">
          <span className="investigations-queue-console__count-badge">
            {totalAnomalies} Flagged
          </span>
          <button
            type="button"
            className={`btn-filter-toggle ${activeFilter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => onFilterChange('ALL')}
            title="Reset filter to all inspections"
          >
            Show All
          </button>
        </div>
      </div>

      <p className="investigations-queue-console__desc">
        Direct-action filter: click any category below to isolate matching forensic events.
      </p>

      <div className="investigations-queue-console__list">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isSelected = activeFilter === cat.id;

          return (
            <motion.button
              key={cat.id}
              type="button"
              className={`investigation-row-item ${cat.themeClass} ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onFilterChange(isSelected ? 'ALL' : cat.id)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              role="button"
              aria-pressed={isSelected}
            >
              <div className="investigation-row-item__left">
                <div className="investigation-row-item__icon-wrap">
                  <Icon size={16} />
                </div>
                <div className="investigation-row-item__details">
                  <span className="investigation-row-item__label">{cat.label}</span>
                  <span className="investigation-row-item__hint">{cat.hint}</span>
                </div>
              </div>

              <div className="investigation-row-item__right">
                <span className="investigation-row-item__number">
                  <AnimatedNumber value={cat.count} />
                </span>
                <span className="investigation-row-item__state">
                  {isSelected ? 'Filtering' : 'Filter'}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveInvestigationsQueue;
