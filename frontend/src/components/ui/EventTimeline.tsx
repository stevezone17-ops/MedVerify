import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  ArrowRight,
  Eye,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import type { VerificationListItem, VerificationStatus } from '../../types';
import { StatusBadge } from './StatusBadge';
import { staggerContainer, slideFromLeft } from '../../animations/motion';
import { Link } from '../../router';

interface EventTimelineProps {
  events: VerificationListItem[];
  onSelectEvent: (event: VerificationListItem) => void;
  activeFilter?: 'ALL' | VerificationStatus;
  className?: string;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  onSelectEvent,
  activeFilter = 'ALL',
  className = '',
}) => {
  // Filter events based on active category
  const filteredEvents = events.filter((ev) => {
    if (activeFilter === 'ALL') return true;
    return ev.status === activeFilter;
  });

  return (
    <div className={`forensic-timeline-console ${className}`}>
      <div className="forensic-timeline-console__header">
        <div>
          <span className="command-eyebrow">CONTINUOUS AUDIT LEDGER</span>
          <h3 className="command-section-title">Live Verification Timeline</h3>
        </div>
        <div className="forensic-timeline-console__actions">
          {activeFilter !== 'ALL' && (
            <span className="timeline-filter-indicator">
              Filtering by: <strong>{activeFilter}</strong>
            </span>
          )}
          <Link
            to="/app/history"
            className="btn btn-ghost btn-sm timeline-full-link"
          >
            <span>Complete Audit Ledger</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="timeline-empty-notice">
          <Clock size={20} className="timeline-empty-icon" />
          <p>No verification events match the currently selected filter.</p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="forensic-timeline-list"
        >
          {/* Animated vertical track line */}
          <div className="forensic-timeline-track" />

          {filteredEvents.map((item, index) => {
            const date = new Date(item.created_at);
            const timeStr = date.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            const isVerified = item.status === 'VERIFIED';
            const isSuspicious = item.status === 'SUSPICIOUS';
            const isReview = item.status === 'REVIEW';

            return (
              <motion.div
                key={item.verification_id}
                variants={slideFromLeft}
                className="forensic-timeline-item"
                onClick={() => onSelectEvent(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectEvent(item);
                  }
                }}
                aria-label={`Inspect ${item.product_name || item.raw_identifier}`}
              >
                {/* Time Stamp */}
                <div className="forensic-timeline-item__time">
                  <span className="timeline-time-val">{timeStr}</span>
                  <span className="timeline-time-date">
                    {date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                {/* Node Pip / Status Indicator */}
                <div className="forensic-timeline-item__node">
                  <span className={`timeline-node-dot timeline-node-dot--${item.status.toLowerCase()}`}>
                    {isVerified && <CheckCircle2 size={13} />}
                    {isReview && <AlertTriangle size={13} />}
                    {isSuspicious && <XOctagon size={13} />}
                    {!isVerified && !isReview && !isSuspicious && <HelpCircle size={13} />}
                  </span>
                </div>

                {/* Content Card */}
                <div className="forensic-timeline-item__card">
                  <div className="timeline-card-header">
                    <div className="timeline-card-product">
                      <span className="timeline-product-name">
                        {item.product_name || `Identifier: ${item.raw_identifier}`}
                      </span>
                      <span className="timeline-manufacturer">
                        {item.manufacturer || 'Unspecified Manufacturer'}
                      </span>
                    </div>

                    <div className="timeline-card-status">
                      <StatusBadge status={item.status} size="sm" />
                      <span
                        className="timeline-score-badge"
                        style={{
                          color: isVerified
                            ? 'var(--color-verified-text)'
                            : isSuspicious
                            ? 'var(--color-suspicious-text)'
                            : 'var(--color-review-text)',
                        }}
                      >
                        {item.confidence_score}% match
                      </span>
                    </div>
                  </div>

                  <div className="timeline-card-footer">
                    <span className="timeline-meta-id font-mono">
                      GTIN: {item.raw_identifier}
                    </span>
                    <button
                      type="button"
                      className="timeline-inspect-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(item);
                      }}
                    >
                      <Eye size={12} />
                      <span>Inspect Details</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};

export default EventTimeline;
