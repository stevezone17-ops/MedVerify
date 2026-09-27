import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from '../router';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  HelpCircle,
  ArrowLeft,
  ScanLine,
  ChevronRight,
  Minus,
  Printer,
  Share2,
  Shield,
  FileCheck,
  Building2,
  Calendar,
  Hash,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { getVerification } from '../api/client';
import type { VerificationResult as VResult, VerificationCheck, VerificationStatus } from '../types';
import { ConfidenceRing } from '../components/ui/ConfidenceRing';
import { StatusBadge } from '../components/ui/StatusBadge';
import { pageVariants, staggerContainer, staggerItem } from '../animations/motion';

const STATUS_HERO: Record<
  VerificationStatus,
  {
    title: string;
    description: string;
    bannerClass: string;
    icon: typeof CheckCircle2;
  }
> = {
  VERIFIED: {
    title: 'Authentic Medicine Confirmed',
    description:
      'All 6 packaging security and manufacturer registry dimensions matched active pharmaceutical records.',
    bannerClass: 'result-certificate__banner--verified',
    icon: CheckCircle2,
  },
  REVIEW: {
    title: 'Inspection / Review Required',
    description:
      'The product requires manual verification due to missing packaging fields or an expired distribution date.',
    bannerClass: 'result-certificate__banner--review',
    icon: AlertTriangle,
  },
  SUSPICIOUS: {
    title: 'Suspicious / Potential Counterfeit',
    description:
      'Critical mismatches detected in batch code or serial uniqueness. Quarantine this product immediately.',
    bannerClass: 'result-certificate__banner--suspicious',
    icon: XOctagon,
  },
  NOT_FOUND: {
    title: 'Unregistered Product Identifier',
    description:
      'No record exists for this identifier in the authorized pharmaceutical registry catalog.',
    bannerClass: 'result-certificate__banner--notfound',
    icon: HelpCircle,
  },
};

export default function VerificationResultPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [result, setResult] = useState<VResult | null>((location.state as any)?.result || null);
  const [loading, setLoading] = useState(!result);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!result && id) {
      getVerification(id)
        .then(setResult)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [id, result]);

  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: '60vh' }}>
        <div className="modal-step-item__spinner" style={{ width: 32, height: 32 }} />
        <h3 className="empty-state__title" style={{ marginTop: 'var(--space-4)' }}>
          Retrieving Verification Certificate...
        </h3>
        <p className="empty-state__description">
          Decrypting tamper-evident record and forensic audit breakdown.
        </p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="empty-state" style={{ minHeight: '60vh' }}>
        <div className="empty-state__icon-ring">
          <HelpCircle size={28} />
        </div>
        <h3 className="empty-state__title">Verification Record Not Found</h3>
        <p className="empty-state__description">
          {error || 'The requested verification token could not be located in the audit ledger.'}
        </p>
        <Link to="/app/scanner" className="btn btn-primary">
          <ScanLine size={16} />
          <span>Scan New Medicine</span>
        </Link>
      </div>
    );
  }

  const heroConfig = STATUS_HERO[result.status] || STATUS_HERO.NOT_FOUND;
  const HeroIcon = heroConfig.icon;
  const passedChecks = result.checks.filter((c) => c.status === 'PASS').length;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="result-view-container"
    >
      {/* Navigation / Action Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link to="/app/scanner" className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} />
            <span>Return to Scanner</span>
          </Link>
          <span style={{ color: 'var(--color-slate-300)' }}>/</span>
          <span
            className="font-mono"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}
          >
            Token: {result.verification_id}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => window.print()}
            title="Print Inspection Certificate"
          >
            <Printer size={14} />
            <span>Print Report</span>
          </button>
          <Link to="/app/scanner" className="btn btn-primary btn-sm">
            <ScanLine size={14} />
            <span>Scan Another</span>
          </Link>
        </div>
      </div>

      {/* Main Certificate Card */}
      <div className="result-certificate">
        {/* Authoritative Status Banner */}
        <div className={`result-certificate__banner ${heroConfig.bannerClass}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <HeroIcon size={26} />
            </div>
            <div className="result-banner-info">
              <h1>{heroConfig.title}</h1>
              <p>{heroConfig.description}</p>
            </div>
          </div>

          <StatusBadge status={result.status} size="lg" />
        </div>

        {/* Certificate Body */}
        <div className="result-certificate__body">
          {/* Top Row: Confidence Gauge + Specimen Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 'var(--space-8)',
              alignItems: 'center',
              padding: 'var(--space-5)',
              backgroundColor: 'var(--color-slate-50)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            {/* SVG Circular Confidence Ring */}
            <div style={{ padding: 'var(--space-2)' }}>
              <ConfidenceRing score={result.confidence_score} status={result.status} size={132} />
            </div>

            {/* Specimen Overview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--color-slate-400)',
                  }}
                >
                  SPECIMEN IDENTIFICATION
                </span>
                <span style={{ color: 'var(--color-slate-300)' }}>•</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                  {result.medicine ? 'Matched in Registry' : 'Unregistered Payload'}
                </span>
              </div>

              <h2
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 700,
                  color: 'var(--color-slate-900)',
                  letterSpacing: '-0.02em',
                }}
              >
                {result.medicine?.product_name || `Scanned String: ${result.raw_identifier}`}
              </h2>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-slate-600)',
                }}
              >
                {result.medicine?.manufacturer && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Building2 size={14} className="telemetry-item__icon" />
                    <strong>{result.medicine.manufacturer}</strong>
                  </span>
                )}
                {result.medicine?.batch_number && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Hash size={14} />
                    <span className="font-mono">Batch: {result.medicine.batch_number}</span>
                  </span>
                )}
                {result.medicine?.expiry_date && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={14} />
                    <span>Expires: {result.medicine.expiry_date}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 6-Factor Checks Breakdown */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div>
                <span className="system-health-widget__eyebrow">EXPLAINABLE FORENSIC AUDIT</span>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-slate-900)' }}>
                  6-Factor Packaging & Registry Integrity Checks
                </h3>
              </div>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-slate-500)',
                }}
              >
                {passedChecks} of {result.checks.length} checks passed
              </span>
            </div>

            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="checks-breakdown-list"
            >
              {result.checks.map((check, index) => {
                const isPass = check.status === 'PASS';
                const isFail = check.status === 'FAIL';
                const isWarn = check.status === 'WARN';

                return (
                  <motion.div key={check.field + index} variants={staggerItem} className="check-item">
                    <div className="check-item__left">
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isPass ? '#ecfdf5' : isFail ? '#fef2f2' : isWarn ? '#fffbeb' : 'var(--color-slate-100)',
                          color: isPass ? '#065f46' : isFail ? '#991b1b' : isWarn ? '#92400e' : 'var(--color-slate-500)',
                        }}
                      >
                        {isPass ? <CheckCircle2 size={15} /> : isFail ? <XOctagon size={15} /> : isWarn ? <AlertTriangle size={15} /> : <Minus size={15} />}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="check-item__name">{check.name}</span>
                          <span className="check-item__weight">({check.weight} pts weight)</span>
                        </div>
                        {check.detail && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', marginTop: 2 }}>
                            {check.detail}
                          </div>
                        )}
                        {check.expected && isPass && (
                          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-brand-800)', marginTop: 2 }}>
                            Verified match: {check.expected}
                          </div>
                        )}
                      </div>
                    </div>

                    <span
                      className={`check-item__status-pill ${
                        isPass
                          ? 'check-item__status-pill--pass'
                          : isFail
                          ? 'check-item__status-pill--fail'
                          : isWarn
                          ? 'check-item__status-pill--warn'
                          : 'check-item__status-pill--skip'
                      }`}
                    >
                      {check.status}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>

          {/* Anomaly & Issues Alert Callout */}
          {result.issues && result.issues.length > 0 && (
            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: result.status === 'SUSPICIOUS' ? '#fef2f2' : '#fffbeb',
                border: `1px solid ${result.status === 'SUSPICIOUS' ? '#fecaca' : '#fde68a'}`,
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  color: result.status === 'SUSPICIOUS' ? '#991b1b' : '#92400e',
                  marginBottom: 'var(--space-2)',
                }}
              >
                <AlertCircle size={16} />
                <span>Detected Security Flags ({result.issues.length}):</span>
              </div>
              <ul style={{ paddingLeft: 'var(--space-5)', fontSize: 'var(--text-xs)', color: result.status === 'SUSPICIOUS' ? '#7f1d1d' : '#78350f' }}>
                {result.issues.map((iss, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    {iss}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Medicine Specimen Full Grid */}
          {result.medicine && (
            <div>
              <span className="system-health-widget__eyebrow">REGISTERED PRODUCT SPECIFICATION</span>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-slate-900)', marginBottom: 'var(--space-3)' }}>
                Product Dossier
              </h3>

              <div className="specimen-grid">
                <div className="specimen-field">
                  <span className="specimen-field__label">Dosage & Strength</span>
                  <span className="specimen-field__value">{result.medicine.dosage || 'Standard'}</span>
                </div>
                <div className="specimen-field">
                  <span className="specimen-field__label">Packaging Size</span>
                  <span className="specimen-field__value">{result.medicine.package_size || 'Unit pack'}</span>
                </div>
                <div className="specimen-field">
                  <span className="specimen-field__label">Manufacturing Date</span>
                  <span className="specimen-field__value font-mono">{result.medicine.manufacturing_date}</span>
                </div>
                <div className="specimen-field">
                  <span className="specimen-field__label">Expiry Date</span>
                  <span className="specimen-field__value font-mono">{result.medicine.expiry_date}</span>
                </div>
                <div className="specimen-field">
                  <span className="specimen-field__label">Serial Number</span>
                  <span className="specimen-field__value font-mono">{result.medicine.serial_number}</span>
                </div>
                <div className="specimen-field">
                  <span className="specimen-field__label">Regulatory Status</span>
                  <span className="specimen-field__value" style={{ textTransform: 'capitalize' }}>
                    {result.medicine.status || 'Active Authorized'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Forensic Audit Metadata */}
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--color-slate-50)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-slate-500)',
            }}
          >
            <div>
              <strong>Audit Ledger Reference:</strong>{' '}
              <span className="font-mono">{result.verification_id}</span>
            </div>
            <div>
              <strong>Timestamp:</strong>{' '}
              {new Date(result.created_at).toLocaleString()}
            </div>
            <div>
              <strong>Input Modality:</strong>{' '}
              <span style={{ textTransform: 'uppercase' }}>{result.input_type}</span>
            </div>
          </div>

          {/* Regulatory Notice Banner */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: '#f8fafc',
              border: '1px solid var(--color-slate-200)',
              borderRadius: 'var(--radius-md)',
              fontSize: '11px',
              color: 'var(--color-slate-500)',
              lineHeight: 1.5,
            }}
          >
            <strong>Regulatory Compliance Notice:</strong> MedVerify delivers cryptographically verified
            evaluations against registered manufacturer batch databases. In accordance with WHO counterfeit
            drug protocols, any suspected physical packaging defects or labeling irregularities must be
            escalated to national pharmaceutical oversight authorities.
          </div>
        </div>
      </div>
    </motion.div>
  );
}
