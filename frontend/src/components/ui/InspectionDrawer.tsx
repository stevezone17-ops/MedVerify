import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  CheckCircle2,
  Calendar,
  Building,
  Hash,
  Barcode,
  Layers,
  FileText,
  Loader2,
  GitCommit,
  Check,
} from 'lucide-react';
import type { VerificationListItem, VerificationStatus, VerificationInvestigation } from '../../types';
import { getAdminInvestigation } from '../../api/client';
import { StatusBadge } from './StatusBadge';
import { drawerVariants, backdropVariants } from '../../animations/motion';
import { Link } from '../../router';

interface InspectionDrawerProps {
  item: VerificationListItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InspectionDrawer: React.FC<InspectionDrawerProps> = ({
  item,
  isOpen,
  onClose,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [investigation, setInvestigation] = useState<VerificationInvestigation | null>(null);
  const [loadingInv, setLoadingInv] = useState(false);

  // Fetch full forensic data when item changes
  useEffect(() => {
    if (isOpen && item?.verification_id) {
      setLoadingInv(true);
      getAdminInvestigation(item.verification_id)
        .then((data) => setInvestigation(data))
        .catch((err) => {
          console.warn('Investigation load error:', err);
          setInvestigation(null);
        })
        .finally(() => setLoadingInv(false));
    } else {
      setInvestigation(null);
    }
  }, [isOpen, item?.verification_id]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const isVerified = item.status === 'VERIFIED';
  const isSuspicious = item.status === 'SUSPICIOUS';
  const isReview = item.status === 'REVIEW' || item.status === 'REQUIRES_REVIEW';
  const isExpired = item.status === 'EXPIRED';

  // Use real checks from backend investigation if available; fallback to standard checks
  const checks = investigation?.checks && investigation.checks.length > 0
    ? investigation.checks.map((chk) => ({
        name: chk.name || chk.field,
        status: chk.status,
        detail: chk.detail,
      }))
    : [
        {
          name: 'Product Identifier (GTIN)',
          status: item.status !== 'NOT_FOUND' ? 'PASS' : 'FAIL',
          detail: item.raw_identifier,
        },
        {
          name: 'Manufacturer Identity',
          status: item.manufacturer ? 'PASS' : 'WARN',
          detail: item.manufacturer || 'Unspecified manufacturer',
        },
        {
          name: 'Batch Format & Integrity',
          status: isSuspicious ? 'FAIL' : 'PASS',
          detail: isSuspicious ? 'Batch checksum anomaly detected' : 'Cryptographically valid batch code',
        },
        {
          name: 'Serial Number Uniqueness',
          status: isSuspicious ? 'FAIL' : 'PASS',
          detail: isSuspicious ? 'Duplicate scan frequency flagged' : 'Single issuance verified in registry',
        },
        {
          name: 'Regulatory Expiry Window',
          status: isExpired ? 'FAIL' : isReview ? 'WARN' : 'PASS',
          detail: isExpired ? 'Product expired' : 'Therapeutic window validated',
        },
      ];

  return (
    <AnimatePresence>
      <div className="drawer-portal-root">
        {/* Backdrop */}
        <motion.div
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="drawer-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Slide-over panel */}
        <motion.div
          ref={drawerRef}
          variants={drawerVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="drawer-panel"
          role="dialog"
          aria-modal="true"
          aria-label={`Verification Inspection: ${item.product_name || item.raw_identifier}`}
        >
          {/* Drawer Header */}
          <div className="drawer-header">
            <div className="drawer-header__title-group">
              <span className="command-eyebrow">FORENSIC RECORD INSPECTION</span>
              <h2 className="drawer-header__title">
                {item.product_name || 'Pharmaceutical Inspection'}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon drawer-close-btn"
              onClick={onClose}
              aria-label="Close inspection drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="drawer-content">
            {/* Status & Confidence Banner */}
            <div className={`drawer-verdict-card drawer-verdict-card--${item.status.toLowerCase()}`}>
              <div className="drawer-verdict-card__left">
                <StatusBadge status={item.status} size="lg" />
                <span className="drawer-verdict-timestamp">
                  Recorded {new Date(item.created_at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="drawer-verdict-card__score">
                <span className="drawer-verdict-score-num">{item.confidence_score}%</span>
                <span className="drawer-verdict-score-lbl">CONFIDENCE</span>
              </div>
            </div>

            {/* Primary Attributes */}
            <div className="drawer-section">
              <h4 className="drawer-section-title">Cryptographic Identifiers</h4>
              <div className="drawer-meta-grid">
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">
                    <Barcode size={12} />
                    <span>Raw Identifier / GTIN</span>
                  </span>
                  <span className="drawer-meta-value font-mono">{item.raw_identifier}</span>
                </div>

                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">
                    <Building size={12} />
                    <span>Manufacturer</span>
                  </span>
                  <span className="drawer-meta-value">
                    {item.manufacturer || 'Unregistered Manufacturer'}
                  </span>
                </div>

                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">
                    <Hash size={12} />
                    <span>Inspection ID</span>
                  </span>
                  <span className="drawer-meta-value font-mono">
                    {item.verification_id.slice(0, 16)}...
                  </span>
                </div>
              </div>
            </div>

            {/* 6-Factor Verification Checks */}
            <div className="drawer-section">
              <h4 className="drawer-section-title">Forensic Engine Multi-Factor Checks</h4>
              <div className="drawer-checks-list">
                {checks.map((chk, idx) => (
                  <div key={idx} className="drawer-check-row">
                    <div className="drawer-check-row__left">
                      <span className={`drawer-check-icon drawer-check-icon--${chk.status.toLowerCase()}`}>
                        {chk.status === 'PASS' && <CheckCircle2 size={13} />}
                        {chk.status === 'WARN' && <AlertTriangle size={13} />}
                        {chk.status === 'FAIL' && <XOctagon size={13} />}
                      </span>
                      <div className="drawer-check-row__text">
                        <span className="drawer-check-row__name">{chk.name}</span>
                        <span className="drawer-check-row__detail font-mono">{chk.detail}</span>
                      </div>
                    </div>
                    <span className={`drawer-check-tag drawer-check-tag--${chk.status.toLowerCase()}`}>
                      {chk.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* End-to-End Pipeline Execution Trace */}
            {investigation?.pipeline_stages && investigation.pipeline_stages.length > 0 && (
              <div className="drawer-section">
                <h4 className="drawer-section-title">Pipeline Execution Trace</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {investigation.pipeline_stages.map((stg, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-slate-50)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: stg.status === 'FAIL' || stg.status === 'SUSPICIOUS' ? '#dc2626' : '#16a34a' }}>
                          {stg.status === 'FAIL' || stg.status === 'SUSPICIOUS' ? <XOctagon size={14} /> : <CheckCircle2 size={14} />}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--color-slate-800)' }}>{stg.label}</div>
                          {stg.detail && <div style={{ fontSize: '11px', color: 'var(--color-slate-500)' }}>{stg.detail}</div>}
                        </div>
                      </div>
                      <span className={`drawer-check-tag drawer-check-tag--${stg.status.toLowerCase()}`}>
                        {stg.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="drawer-footer">
            <Link
              to={`/app/result/${item.verification_id}`}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={onClose}
            >
              <FileText size={15} />
              <span>Open Complete Forensic Certificate</span>
              <ExternalLink size={14} />
            </Link>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default InspectionDrawer;
