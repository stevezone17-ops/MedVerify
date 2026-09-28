import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  X,
  Globe,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  Loader2,
  HelpCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { explainVerification } from '../../api/client';
import type { VerificationExplanation, ExplanationStyle } from '../../types';

interface ExplainResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationId: string;
  onOpenChatWithContext?: (verificationId: string, initialQuestion?: string) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिंदी)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
];

export const ExplainResultModal: React.FC<ExplainResultModalProps> = ({
  isOpen,
  onClose,
  verificationId,
  onOpenChatWithContext,
}) => {
  const [style, setStyle] = useState<ExplanationStyle>('simple');
  const [language, setLanguage] = useState<string>('en');
  const [explanation, setExplanation] = useState<VerificationExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExplanation = async (s: ExplanationStyle, l: string) => {
    if (!verificationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await explainVerification({
        verification_id: verificationId,
        style: s,
        language: l,
      });
      setExplanation(data);
    } catch (err: any) {
      console.error('Failed to get verification explanation:', err);
      setError(err.message || 'Unable to generate AI explanation at this time.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && verificationId) {
      fetchExplanation(style, language);
    }
  }, [isOpen, verificationId, style, language]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="report-modal-backdrop" onClick={onClose}>
        <motion.div
          className="explain-modal-card"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="explain-modal-header">
            <div className="explain-modal-header__brand">
              <div className="explain-ai-icon-bubble">
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 className="explain-modal-title">MedVerify AI</h3>
                  <span className="explain-ai-tag">Grounded Intelligence</span>
                </div>
                <p className="explain-modal-subtitle">
                  Plain-language explanation grounded strictly in verified registry records
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              aria-label="Close explanation modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Controls Bar: Style Toggle + Language Picker */}
          <div className="explain-controls-bar">
            {/* Tone Toggle */}
            <div className="explain-style-toggle">
              <button
                type="button"
                className={`explain-style-btn ${style === 'simple' ? 'active' : ''}`}
                onClick={() => setStyle('simple')}
              >
                Simple Overview
              </button>
              <button
                type="button"
                className={`explain-style-btn ${style === 'technical' ? 'active' : ''}`}
                onClick={() => setStyle('technical')}
              >
                Technical / Forensic
              </button>
            </div>

            {/* Language Selector */}
            <div className="explain-lang-select-wrap">
              <Globe size={14} className="explain-lang-icon" />
              <select
                className="explain-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Select explanation language"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content Body */}
          <div className="explain-modal-body">
            {loading ? (
              <div className="explain-loading-view">
                <Loader2 size={32} className="telemetry-spinner" style={{ color: 'var(--color-primary-600)' }} />
                <h4 style={{ margin: '12px 0 4px', fontSize: '14px', fontWeight: 600 }}>
                  Analyzing Verified Evidence...
                </h4>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-slate-500)' }}>
                  Grounded in manufacturer registry, GS1 standards, and tamper audit records.
                </p>
              </div>
            ) : error ? (
              <div className="explain-error-view">
                <AlertTriangle size={24} style={{ color: '#dc2626' }} />
                <p style={{ margin: '8px 0', fontSize: '13px', color: '#991b1b' }}>{error}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fetchExplanation(style, language)}
                >
                  Retry Analysis
                </button>
              </div>
            ) : explanation ? (
              <div className="explain-content-stream">
                {/* Executive Summary Card */}
                <div className="explain-summary-card">
                  <div className="explain-summary-card__lead">
                    <ShieldCheck size={20} style={{ color: 'var(--color-primary-600)', flexShrink: 0 }} />
                    <p className="explain-summary-text">{explanation.summary}</p>
                  </div>
                </div>

                {/* Evidence Grids: Checked & Matched */}
                <div className="explain-columns-grid">
                  {/* What Was Checked */}
                  <div className="explain-card-col">
                    <h5 className="explain-card-col__title">
                      <Clock size={13} />
                      <span>Parameters Evaluated ({explanation.what_was_checked.length})</span>
                    </h5>
                    <ul className="explain-bullet-list">
                      {explanation.what_was_checked.map((item, idx) => (
                        <li key={idx} className="explain-bullet-item">
                          <span className="explain-bullet-dot checked" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Matched Evidence */}
                  <div className="explain-card-col">
                    <h5 className="explain-card-col__title">
                      <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
                      <span>Verified Matches ({explanation.matched_evidence.length})</span>
                    </h5>
                    <ul className="explain-bullet-list">
                      {explanation.matched_evidence.map((item, idx) => (
                        <li key={idx} className="explain-bullet-item">
                          <span className="explain-bullet-dot matched" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Security Flags / Concerns if present */}
                {explanation.concerns && explanation.concerns.length > 0 && (
                  <div className="explain-concerns-box">
                    <div className="explain-concerns-title">
                      <AlertTriangle size={15} />
                      <span>Flagged Parameters or Security Notes</span>
                    </div>
                    <ul className="explain-bullet-list">
                      {explanation.concerns.map((con, idx) => (
                        <li key={idx} className="explain-bullet-item" style={{ color: '#7f1d1d' }}>
                          <span className="explain-bullet-dot concern" />
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommended Next Steps */}
                {explanation.next_steps && explanation.next_steps.length > 0 && (
                  <div className="explain-next-steps">
                    <h5 className="explain-card-col__title">
                      <ArrowRight size={13} />
                      <span>Recommended Next Steps</span>
                    </h5>
                    <div className="explain-steps-grid">
                      {explanation.next_steps.map((st, idx) => (
                        <div key={idx} className="explain-step-pill">
                          <span className="explain-step-num">{idx + 1}</span>
                          <span>{st}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Regulatory Disclaimer */}
                <div className="explain-disclaimer-box">
                  <strong>Notice:</strong> {explanation.disclaimer}
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer Action */}
          <div className="explain-modal-footer">
            <div style={{ fontSize: '11px', color: 'var(--color-slate-400)' }}>
              Model: <code className="font-mono">{explanation?.model_used || 'OpenAI'}</code>
            </div>

            {onOpenChatWithContext && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  onOpenChatWithContext(verificationId, 'Can you explain this result in more detail?');
                }}
              >
                <MessageSquare size={13} />
                <span>Ask MedVerify Assistant</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ExplainResultModal;
