import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Package,
  Check,
  Loader2,
  Camera,
  ScanLine,
  Keyboard,
  Send,
  X,
  Flag,
  Sparkles,
} from 'lucide-react';
import type { VerificationResult, VerificationCheck } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { Link } from '../../router';
import { staggerContainer, staggerItem } from '../../animations/motion';
import { addToCabinet, submitReport } from '../../api/client';
import { ExplainResultModal } from '../ai/ExplainResultModal';
import { AskMedVerifyDrawer } from '../ai/AskMedVerifyDrawer';

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
  const isReview = result.status === 'REVIEW' || result.status === 'REQUIRES_REVIEW';
  const isNotFound = result.status === 'NOT_FOUND';
  const isExpired = result.status === 'EXPIRED';
  const isInvalid = result.status === 'INVALID';

  const med = result.medicine;
  const productName = med?.product_name || `Scanned Item: ${result.raw_identifier}`;
  const mfrName = med?.manufacturer || 'Unspecified Manufacturer';
  const batchNum = med?.batch_number || result.parsed_data?.batch_number;
  const serialNum = med?.serial_number || result.parsed_data?.serial_number;
  const expiryDate = med?.expiry_date || result.parsed_data?.expiry_date;

  const checks = result.checks || [];

  // Cabinet & Report state
  const [cabinetSaved, setCabinetSaved] = useState(false);
  const [savingCabinet, setSavingCabinet] = useState(false);
  const [cabinetError, setCabinetError] = useState<string | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportType, setReportType] = useState('SUSPICIOUS_PACKAGING');
  const [reportDesc, setReportDesc] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // AI Intelligence Layer States
  const [explainModalOpen, setExplainModalOpen] = useState(false);
  const [askDrawerOpen, setAskDrawerOpen] = useState(false);
  const [initialAiQuestion, setInitialAiQuestion] = useState<string | undefined>();

  const handleSaveToCabinet = async () => {
    setSavingCabinet(true);
    setCabinetError(null);
    try {
      await addToCabinet({
        medicine_id: result.matched_medicine_id || undefined,
        verification_id: result.verification_id,
        product_name: productName,
        manufacturer: mfrName,
        batch_number: batchNum,
        expiry_date: expiryDate,
        reminder_enabled: true,
      });
      setCabinetSaved(true);
    } catch (err: any) {
      console.error('Failed to save to cabinet:', err);
      setCabinetError(err.message || 'Failed to save to medicine cabinet');
    } finally {
      setSavingCabinet(false);
    }
  };

  const handleSubmitConcern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDesc.trim()) return;
    setSubmittingReport(true);
    try {
      await submitReport({
        verification_id: result.verification_id,
        report_type: reportType,
        description: reportDesc.trim(),
      });
      setReportSuccess(true);
      setTimeout(() => {
        setReportModalOpen(false);
        setReportSuccess(false);
        setReportDesc('');
      }, 2000);
    } catch (err: any) {
      console.error('Failed to submit report:', err);
    } finally {
      setSubmittingReport(false);
    }
  };

  const getMethodIcon = () => {
    const m = (result.verification_method || result.input_type || 'QR').toUpperCase();
    if (m === 'PACKAGING_OCR') return <Camera size={12} />;
    if (m === 'MANUAL') return <Keyboard size={12} />;
    return <ScanLine size={12} />;
  };

  const getMethodLabel = () => {
    const m = (result.verification_method || result.input_type || 'QR').toUpperCase();
    if (m === 'PACKAGING_OCR') return 'Packaging OCR';
    if (m === 'MANUAL') return 'Manual Entry';
    if (m === 'DATAMATRIX') return 'GS1 DataMatrix';
    if (m === 'BARCODE') return 'Barcode Scan';
    return 'QR Code';
  };

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
            {isExpired && <AlertTriangle size={32} />}
            {isInvalid && <XOctagon size={32} />}
          </div>
          <div>
            <div className="result-status-row">
              <StatusBadge status={result.status} size="lg" />
              <span className="result-confidence-pill">
                {result.confidence_score}% Confidence
              </span>
              <span className="result-method-pill" title={`Verified via ${getMethodLabel()}`}>
                {getMethodIcon()}
                <span>{getMethodLabel()}</span>
              </span>
            </div>
            <p className="result-status-explanation">
              {isVerified && 'Product successfully authenticated against registered manufacturer specifications.'}
              {isReview && 'Packaging parameters require secondary pharmacist review before dispensing.'}
              {isSuspicious && 'Critical discrepancies detected between packaging data and official registry record.'}
              {isNotFound && 'This product identifier was not found in the authorized pharmaceutical registry.'}
              {isExpired && 'Product has passed its regulatory expiry date. Do not use or administer expired medicines.'}
              {isInvalid && 'The scanned data did not produce a valid pharmaceutical verification payload.'}
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
        {/* Explain My Result Button */}
        <button
          type="button"
          className="btn btn-primary btn-lg result-action-btn"
          onClick={() => setExplainModalOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
            borderColor: 'transparent',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)',
          }}
          title="Explain verification outcome using MedVerify AI"
        >
          <Sparkles size={16} />
          <span>Explain My Result</span>
        </button>

        {/* If verified or expired: Add to Medicine Cabinet */}
        {(isVerified || isExpired) && (
          <button
            type="button"
            className={`btn btn-lg result-action-btn ${cabinetSaved ? 'btn-success' : 'btn-accent'}`}
            onClick={handleSaveToCabinet}
            disabled={savingCabinet || cabinetSaved}
          >
            {savingCabinet ? (
              <Loader2 size={16} className="telemetry-spinner" />
            ) : cabinetSaved ? (
              <Check size={16} />
            ) : (
              <Package size={16} />
            )}
            <span>{cabinetSaved ? 'Saved to Cabinet' : savingCabinet ? 'Saving...' : 'Add to Cabinet'}</span>
          </button>
        )}

        {/* If non-verified and non-expired: Report Concern */}
        {!isVerified && !isExpired && (
          <button
            type="button"
            className="btn btn-warning btn-lg result-action-btn"
            onClick={() => setReportModalOpen(true)}
          >
            <Flag size={16} />
            <span>Report Concern</span>
          </button>
        )}

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

      {/* Report Concern Modal */}
      <AnimatePresence>
        {reportModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="report-modal-backdrop"
            onClick={() => setReportModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="report-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="report-modal-header">
                <div className="report-modal-icon-wrap">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="report-modal-title">Report Pharmaceutical Anomaly</h3>
                  <p className="report-modal-subtitle">
                    Alert the safety authority regarding suspected counterfeit packaging or unverified medicine.
                  </p>
                </div>
                <button
                  type="button"
                  className="report-modal-close"
                  onClick={() => setReportModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              {reportSuccess ? (
                <div className="report-success-view">
                  <CheckCircle2 size={42} className="report-success-icon" />
                  <h4>Report Successfully Filed</h4>
                  <p>
                    Thank you. Your report has been logged with regulatory authorities for forensic review.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitConcern} className="report-modal-form">
                  <div className="form-group">
                    <label className="form-label">Type of Issue</label>
                    <select
                      className="form-select"
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                    >
                      <option value="SUSPICIOUS_PACKAGING">Suspicious or Altered Packaging</option>
                      <option value="INCORRECT_BARCODE">Barcode or DataMatrix Mismatch</option>
                      <option value="EXPIRED_MEDICINE">Dispensed Expired Product</option>
                      <option value="TAMPERED_SEAL">Broken or Tampered Security Seal</option>
                      <option value="ADVERSE_REACTION">Unexpected Physical Characteristics</option>
                      <option value="OTHER">Other Quality or Counterfeit Concern</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description & Findings</label>
                    <textarea
                      className="form-textarea"
                      rows={4}
                      placeholder="Please describe where you obtained this medicine and what discrepancies you noticed (e.g., blurry text, different font, unsealed box)..."
                      value={reportDesc}
                      onChange={(e) => setReportDesc(e.target.value)}
                      required
                    />
                  </div>

                  <div className="report-modal-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setReportModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submittingReport || !reportDesc.trim()}
                    >
                      {submittingReport ? (
                        <>
                          <Loader2 size={15} className="telemetry-spinner" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Submit Official Report</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MedVerify AI — Explain Result Modal */}
      <ExplainResultModal
        isOpen={explainModalOpen}
        onClose={() => setExplainModalOpen(false)}
        verificationId={result.verification_id}
        onOpenChatWithContext={(vid, q) => {
          setInitialAiQuestion(q);
          setAskDrawerOpen(true);
        }}
      />

      {/* MedVerify AI — Ask MedVerify Assistant Drawer */}
      <AskMedVerifyDrawer
        isOpen={askDrawerOpen}
        onClose={() => setAskDrawerOpen(false)}
        verificationId={result.verification_id}
        initialQuestion={initialAiQuestion}
      />
    </motion.div>
  );
};

export default VerificationResultPanel;
