import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XOctagon, HelpCircle } from 'lucide-react';
import type { VerificationStatus } from '../../types';

interface StatusDistributionBarProps {
  breakdown: Record<VerificationStatus, number>;
  total: number;
  className?: string;
}

interface SegmentMeta {
  key: VerificationStatus;
  label: string;
  color: string;
  bgClass: string;
  icon: typeof CheckCircle2;
  description: string;
}

const SEGMENTS: SegmentMeta[] = [
  {
    key: 'VERIFIED',
    label: 'Verified',
    color: 'var(--color-brand-600)',
    bgClass: 'segment--verified',
    icon: CheckCircle2,
    description: 'Passed all 6 packaging & registry checks',
  },
  {
    key: 'REVIEW',
    label: 'Review Required',
    color: 'var(--color-amber-500)',
    bgClass: 'segment--review',
    icon: AlertTriangle,
    description: 'Missing fields or expired product validation',
  },
  {
    key: 'SUSPICIOUS',
    label: 'Suspicious / Cloned',
    color: 'var(--color-red-500)',
    bgClass: 'segment--suspicious',
    icon: XOctagon,
    description: 'Batch mismatch or serial number duplicate',
  },
  {
    key: 'NOT_FOUND',
    label: 'Not Registered',
    color: 'var(--color-slate-400)',
    bgClass: 'segment--notfound',
    icon: HelpCircle,
    description: 'Product identifier absent in official registry',
  },
];

export const StatusDistributionBar: React.FC<StatusDistributionBarProps> = ({
  breakdown,
  total,
  className = '',
}) => {
  const [activeSegment, setActiveSegment] = useState<VerificationStatus | null>(null);

  const safeTotal = total > 0 ? total : 1;

  const activeMeta = activeSegment ? SEGMENTS.find((s) => s.key === activeSegment) : null;
  const activeCount = activeSegment ? breakdown[activeSegment] || 0 : null;
  const activePct = activeCount !== null ? ((activeCount / safeTotal) * 100).toFixed(1) : null;

  return (
    <div className={`status-distribution ${className}`}>
      <div className="status-distribution__header">
        <div>
          <span className="status-distribution__eyebrow">VERIFICATION ANOMALY SPECTRUM</span>
          <h3 className="status-distribution__title">Outcome Distribution</h3>
        </div>
        <span className="status-distribution__sample-size">
          {total} total verification events
        </span>
      </div>

      {/* Segmented Horizontal Bar */}
      <div
        className="status-distribution__bar-track"
        onMouseLeave={() => setActiveSegment(null)}
        role="group"
        aria-label="Verification status distribution breakdown"
      >
        {SEGMENTS.map((seg) => {
          const count = breakdown[seg.key] || 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct === 0 && total > 0) return null;

          const isHovered = activeSegment === seg.key;
          const isDimmed = activeSegment !== null && !isHovered;

          return (
            <motion.div
              key={seg.key}
              className={`status-distribution__segment ${seg.bgClass} ${isDimmed ? 'is-dimmed' : ''}`}
              style={{ width: `${Math.max(pct, total === 0 ? 25 : 2)}%` }}
              onMouseEnter={() => setActiveSegment(seg.key)}
              onFocus={() => setActiveSegment(seg.key)}
              tabIndex={0}
              role="button"
              aria-label={`${seg.label}: ${count} verifications (${pct.toFixed(1)}%)`}
              whileHover={{ scaleY: 1.15 }}
              transition={{ duration: 0.15 }}
            />
          );
        })}
      </div>

      {/* Interactive Hover Tooltip / Detail Callout */}
      <div className="status-distribution__interactive-callout">
        <AnimatePresence mode="wait">
          {activeMeta && activeCount !== null && (
            <motion.div
              key={activeMeta.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="distribution-callout"
            >
              <div className="distribution-callout__badge">
                <activeMeta.icon size={15} style={{ color: activeMeta.color }} />
                <strong>{activeMeta.label}</strong>
              </div>
              <span className="distribution-callout__stat">
                {activeCount} events ({activePct}%)
              </span>
              <span className="distribution-callout__desc">{activeMeta.description}</span>
            </motion.div>
          )}

          {!activeMeta && (
            <motion.div
              key="default"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="distribution-callout distribution-callout--hint"
            >
              <span>Hover over segments to inspect anomaly breakdowns & counts</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend & Stats Grid */}
      <div className="status-distribution__legend">
        {SEGMENTS.map((seg) => {
          const count = breakdown[seg.key] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
          const Icon = seg.icon;
          const isSelected = activeSegment === seg.key;

          return (
            <div
              key={seg.key}
              className={`legend-pill ${isSelected ? 'legend-pill--selected' : ''}`}
              onMouseEnter={() => setActiveSegment(seg.key)}
              onMouseLeave={() => setActiveSegment(null)}
            >
              <div className="legend-pill__top">
                <span className="legend-pill__pip" style={{ backgroundColor: seg.color }} />
                <span className="legend-pill__label">{seg.label}</span>
              </div>
              <div className="legend-pill__bottom">
                <span className="legend-pill__count">{count}</span>
                <span className="legend-pill__pct">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusDistributionBar;
