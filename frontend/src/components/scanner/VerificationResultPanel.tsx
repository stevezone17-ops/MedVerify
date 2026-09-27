import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  ExternalLink,
  RefreshCw,
  Building,
  Calendar,
  Hash,
  Barcode,
  Layers,
  FileText,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import type { VerificationResult, VerificationCheck } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { Link } from '../../router';
import { staggerContainer, staggerItem } from '../../animations/motion';

interface VerificationResultPanelProps {
  result: VerificationResult;
  onScanAnother: () => void;
  className?: string;
}

export const VerificationResultPanel: React.FC<VerificationResultPanelProps> = ({
  result,
  onScanAnother,
  className = '',
}) => {
  const isVerified = result.status === 'VERIFIED';
  const isSuspicious = result.status === 'SUSPICIOUS';
  const isReview = result.status === 'REVIEW';
  const isNotFound = result.status === 'NOT_FOUND';

  const med = result.medicine;
  const productName = med?.product_name || `Scanned Item: ${result.raw_identifier}`;
  const mfrName = med?.manufacturer || 'Unspecified Manufacturer';
  const batchNum = med?.batch_number || result.parsed_data?.batch_number;
  const serialNum = med?.serial_number || result.parsed_data?.serial_number;
  const expiryDate = med?.expiry_date || result.parsed_data?.expiry_date;

  const checks = result.checks || [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`verification-result-panel ${className}`}
    >
      {/* Banner Decision Header */}
      <div className={`result-decision-banner result-decision-banner--${result.status.toLowerCase()}`}>
        <div className="result-decision-lead">
          <div className="result-decision-icon-wrap">
            {isVerified && <CheckCircle2 size={32} />}
            {isReview && <AlertTriangle size={32} />}
            {isSuspicious && <XOctagon size={32} />}
            {isNotFound && <HelpCircle size={32} />}
          </div>
          <div>
            <div className="result-status-row">
              <StatusBadge status={result.status} size="lg" />
              <span className="result-confidence-pill">
                {result.confidence_score}% Confidence
              </span>
            </div>
            <p className="result-status-explanation">
              {isVerified && 'Product successfully authenticated against registered manufacturer specifications.'}
              {isReview && 'Packaging parameters require secondary pharmacist review before dispensing.'}
              {isSuspicious && 'Critical discrepancies detected between packaging data and official registry record.'}
              {isNotFound && 'This product identifier was not found in the authorized pharmaceutical registry.'}
            </p>
          </div>
        </div>

        <div className="result-time-stamp">
          <Clock size={12} />
          <span>
            {new Date(result.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* Issues Callout if any */}
      {result.issues && result.issues.length > 0 && (
        <div className="result-issues-callout">
          <ShieldAlert size={16} className="issues-alert-icon" />
          <div className="issues-list">
            <span className="issues-heading">Flagged Discrepancies:</span>
            {result.issues.map((issue, idx) => (
              <span key={idx} className="issue-item">
                • {issue}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Product Specimen Identification */}
      <div className="result-section">
        <h4 className="result-section-heading">Pharmaceutical Identification</h4>
        <div className="result-specimen-card">
          <div className="specimen-lead-info">
            <h3 className="specimen-product-name">{productName}</h3>
            <span className="specimen-manufacturer">{mfrName}</span>
          </div>

          <div className="specimen-attributes-grid">
            <div className="specimen-attr">
              <span className="specimen-attr-label">
                <Barcode size={12} />
                <span>GTIN / Barcode</span>
              </span>
              <span className="specimen-attr-val font-mono">{result.raw_identifier}</span>
            </div>

            {batchNum && (
              <div className="specimen-attr">
                <span className="specimen-attr-label">
                  <Hash size={12} />
                  <span>Batch Number</span>
                </span>
                <span className="specimen-attr-val font-mono">{batchNum}</span>
              </div>
            )}

            {serialNum && (
              <div className="specimen-attr">
                <span className="specimen-attr-label">
                  <Layers size={12} />
                  <span>Serial Identifier</span>
                </span>
                <span className="specimen-attr-val font-mono">{serialNum}</span>
              </div>
            )}

            {expiryDate && (
              <div className="specimen-attr">
                <span className="specimen-attr-label">
                  <Calendar size={12} />
                  <span>Regulatory Expiry</span>
                </span>
                <span className="specimen-attr-val font-mono">{expiryDate}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6-Factor Verification Checks Breakdown */}
      <div className="result-section">
        <div className="checks-header-row">
          <h4 className="result-section-heading">Multi-Factor Cryptographic Checks</h4>
          <span className="checks-counter font-mono">
            {checks.filter((c) => c.status === 'PASS').length} of {checks.length} Verified
          </span>
        </div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="checks-table-card"
        >
          {checks.map((chk, idx) => (
            <motion.div key={idx} variants={staggerItem} className="check-row-item">
              <div className="check-row-left">
                <span className={`check-status-pip check-status-pip--${chk.status.toLowerCase()}`}>
                  {chk.status === 'PASS' && <CheckCircle2 size={13} />}
                  {chk.status === 'WARN' && <AlertTriangle size={13} />}
                  {chk.status === 'FAIL' && <XOctagon size={13} />}
                  {chk.status === 'SKIP' && <HelpCircle size={13} />}
                </span>
                <div className="check-name-group">
                  <span className="check-name">{chk.name}</span>
                  {chk.detail && <span className="check-detail font-mono">{chk.detail}</span>}
                </div>
              </div>

              <div className="check-row-right">
                <span className={`check-verdict-badge check-verdict-badge--${chk.status.toLowerCase()}`}>
                  {chk.status}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Action Footer */}
      <div className="result-actions-footer">
        <button
          type="button"
          className="btn btn-primary btn-lg result-action-btn"
          onClick={onScanAnother}
        >
          <RefreshCw size={16} />
          <span>Scan Another Medicine</span>
        </button>

        <Link
          to={`/app/result/${result.verification_id}`}
          className="btn btn-secondary btn-lg result-action-btn"
          state={{ result }}
        >
          <FileText size={16} />
          <span>Full Forensic Dossier</span>
          <ExternalLink size={14} />
        </Link>
      </div>
    </motion.div>
  );
};

export default VerificationResultPanel;
