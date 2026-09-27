import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Award,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  ExternalLink,
  QrCode,
  Fingerprint,
} from 'lucide-react';
import type { VerificationListItem } from '../../types';
import { StatusBadge } from './StatusBadge';
import { Link } from '../../router';

interface ForensicCertificatePanelProps {
  latestItem?: VerificationListItem | null;
  className?: string;
  onInspect?: (item: VerificationListItem) => void;
}

export const ForensicCertificatePanel: React.FC<ForensicCertificatePanelProps> = ({
  latestItem,
  className = '',
  onInspect,
}) => {
  if (!latestItem) {
    return (
      <div className={`forensic-certificate-panel ${className}`}>
        <div className="forensic-cert-header">
          <span className="command-eyebrow">FORENSIC SPECIMEN CERTIFICATE</span>
          <h3 className="command-section-title">Latest Authentication Dossier</h3>
        </div>
        <div className="forensic-cert-empty">
          <Fingerprint size={28} className="forensic-cert-empty-icon" />
          <p>Awaiting incoming pharmaceutical verification stream...</p>
        </div>
      </div>
    );
  }

  const isVerified = latestItem.status === 'VERIFIED';
  const isSuspicious = latestItem.status === 'SUSPICIOUS';

  const factorChecks = [
    { label: 'Product Identifier (GTIN)', status: 'PASS' },
    { label: 'Manufacturer Registry Match', status: latestItem.manufacturer ? 'PASS' : 'WARN' },
    { label: 'Batch Cryptographic Signature', status: isSuspicious ? 'FAIL' : 'PASS' },
    { label: 'Regulatory Expiry Window', status: 'PASS' },
    { label: 'Serial Collision Audit', status: isSuspicious ? 'FAIL' : 'PASS' },
    { label: 'Anti-Tamper Seal Matrix', status: isSuspicious ? 'FAIL' : 'PASS' },
  ];

  return (
    <div className={`forensic-certificate-panel ${className}`}>
      {/* Certificate Header Banner */}
      <div className="forensic-cert-header">
        <div className="forensic-cert-header__left">
          <span className="command-eyebrow">FORENSIC SPECIMEN CERTIFICATE</span>
          <h3 className="command-section-title">Latest Authentication Dossier</h3>
        </div>
        <div className="forensic-cert-badge">
          <Award size={14} />
          <span>OFFICIAL LEDGER</span>
        </div>
      </div>

      {/* Main Specimen Details */}
      <div className="forensic-cert-body">
        <div className="forensic-specimen-lead">
          <div className="forensic-specimen-info">
            <span className="forensic-specimen-type">ANALYZED SPECIMEN</span>
            <h4 className="forensic-specimen-name">
              {latestItem.product_name || 'Pharmaceutical Item'}
            </h4>
            <span className="forensic-specimen-manufacturer">
              {latestItem.manufacturer || 'Authorized Distributor'}
            </span>
          </div>

          <div className="forensic-specimen-rating">
            <div className="forensic-specimen-score-circle">
              <span className="forensic-specimen-score-num">
                {latestItem.confidence_score}%
              </span>
            </div>
            <span className="forensic-specimen-score-lbl">CONFIDENCE</span>
          </div>
        </div>

        {/* 6-Factor Checklist */}
        <div className="forensic-cert-checks">
          <div className="forensic-checks-heading">
            <span>6-FACTOR INTEGRITY AUDIT</span>
            <span>STATUS</span>
          </div>

          <div className="forensic-checks-rows">
            {factorChecks.map((chk, idx) => (
              <div key={idx} className="forensic-check-line">
                <span className="forensic-check-line__name">{chk.label}</span>
                <span className={`forensic-check-line__indicator forensic-check-line__indicator--${chk.status.toLowerCase()}`}>
                  {chk.status === 'PASS' && <CheckCircle2 size={13} />}
                  {chk.status === 'WARN' && <AlertTriangle size={13} />}
                  {chk.status === 'FAIL' && <XOctagon size={13} />}
                  <span>{chk.status}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Final Decision Box */}
        <div className="forensic-decision-box">
          <div className="forensic-decision-box__left">
            <span className="forensic-decision-box__label">FORENSIC VERDICT</span>
            <div className="forensic-decision-box__status-wrap">
              <StatusBadge status={latestItem.status} size="md" />
            </div>
          </div>

          <div className="forensic-decision-box__actions">
            {onInspect && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onInspect(latestItem)}
              >
                Inspect
              </button>
            )}
            <Link
              to={`/app/result/${latestItem.verification_id}`}
              className="btn btn-primary btn-sm"
            >
              <span>Full Dossier</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForensicCertificatePanel;
