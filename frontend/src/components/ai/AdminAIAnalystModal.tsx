import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  X,
  Send,
  ShieldAlert,
  CheckCircle2,
  TrendingUp,
  Activity,
  Layers,
  Loader2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { adminAIAnalyze } from '../../api/client';
import type { AdminAIAnalyzeResponse } from '../../types';

interface AdminAIAnalystModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_QUERIES = [
  "Summarize today's verification activity and flag critical trends.",
  'What were the most common verification concerns in the past 24 hours?',
  'How many verifications used Packaging OCR vs GS1 QR codes?',
  'Summarize failed verification attempts and identify high-risk batches.',
];

export const AdminAIAnalystModal: React.FC<AdminAIAnalystModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [query, setQuery] = useState(PRESET_QUERIES[0]);
  const [analysis, setAnalysis] = useState<AdminAIAnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunAnalysis = async (qToSend?: string) => {
    const q = (qToSend || query).trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    try {
      const data = await adminAIAnalyze({
        query: q,
        time_range: timeRange,
      });
      setAnalysis(data);
    } catch (err: any) {
      console.error('Admin AI analysis failed:', err);
      setError(err.message || 'Unable to generate admin forensic analysis.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="report-modal-backdrop" onClick={onClose}>
        <motion.div
          className="admin-analyst-modal"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="admin-analyst-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="explain-ai-icon-bubble" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 className="admin-analyst-title">AI Verification Analyst</h3>
                  <span className="admin-analyst-badge">Admin Clearance</span>
                </div>
                <p className="admin-analyst-subtitle">
                  Autonomous synthesis over authorized operational audit metrics
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              aria-label="Close analyst"
            >
              <X size={18} />
            </button>
          </div>

          {/* Time range bar */}
          <div className="admin-analyst-filter-bar">
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-slate-600)' }}>
              Analysis Window:
            </span>
            <div className="explain-style-toggle">
              {(['24h', '7d', '30d'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`explain-style-btn ${timeRange === t ? 'active' : ''}`}
                  onClick={() => setTimeRange(t)}
                >
                  {t === '24h' ? 'Last 24 Hours' : t === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                </button>
              ))}
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="admin-analyst-presets">
            {PRESET_QUERIES.map((pq, idx) => (
              <button
                key={idx}
                type="button"
                className={`admin-analyst-preset-btn ${query === pq ? 'selected' : ''}`}
                onClick={() => {
                  setQuery(pq);
                  handleRunAnalysis(pq);
                }}
                disabled={loading}
              >
                {pq}
              </button>
            ))}
          </div>

          {/* Custom query input */}
          <form
            className="admin-analyst-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleRunAnalysis();
            }}
          >
            <input
              type="text"
              className="form-input"
              style={{ flex: 1 }}
              placeholder="Or enter a custom forensic query..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="telemetry-spinner" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Analyze Metrics</span>
                </>
              )}
            </button>
          </form>

          {/* Body */}
          <div className="admin-analyst-body">
            {loading ? (
              <div className="explain-loading-view" style={{ padding: '40px 20px' }}>
                <Loader2 size={32} className="telemetry-spinner" style={{ color: '#b45309' }} />
                <h4 style={{ margin: '14px 0 4px', fontSize: '14px', fontWeight: 600 }}>
                  Aggregating authorized inspection metrics...
                </h4>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-slate-500)' }}>
                  Evaluating tamper indicators, repeat scan rates, and status distributions.
                </p>
              </div>
            ) : error ? (
              <div className="explain-error-view">
                <AlertTriangle size={24} style={{ color: '#dc2626' }} />
                <p style={{ margin: '8px 0', fontSize: '13px', color: '#991b1b' }}>{error}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleRunAnalysis()}
                >
                  Retry Analysis
                </button>
              </div>
            ) : analysis ? (
              <div className="admin-analyst-results">
                {/* Executive Summary */}
                <div className="admin-summary-card">
                  <h4 className="admin-summary-card__title">
                    <Activity size={15} style={{ color: '#b45309' }} />
                    <span>Executive Summary</span>
                  </h4>
                  <p className="admin-summary-card__text">{analysis.summary}</p>
                </div>

                <div className="explain-columns-grid">
                  {/* Key Findings */}
                  <div className="explain-card-col">
                    <h5 className="explain-card-col__title">
                      <TrendingUp size={13} style={{ color: 'var(--color-primary-600)' }} />
                      <span>Key Forensic Findings ({analysis.key_findings.length})</span>
                    </h5>
                    <ul className="explain-bullet-list">
                      {analysis.key_findings.map((item, i) => (
                        <li key={i} className="explain-bullet-item">
                          <span className="explain-bullet-dot checked" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div className="explain-card-col">
                    <h5 className="explain-card-col__title">
                      <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
                      <span>Actionable Steps ({analysis.actionable_recommendations.length})</span>
                    </h5>
                    <ul className="explain-bullet-list">
                      {analysis.actionable_recommendations.map((item, i) => (
                        <li key={i} className="explain-bullet-item">
                          <span className="explain-bullet-dot matched" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Risk Assessment */}
                <div className="admin-risk-box">
                  <div className="admin-risk-box__header">
                    <ShieldAlert size={16} style={{ color: '#dc2626' }} />
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#991b1b' }}>
                      Counterfeit Threat & Risk Assessment
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#7f1d1d', lineHeight: 1.5 }}>
                    {analysis.risk_assessment}
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-slate-400)', fontSize: '13px' }}>
                Select a preset inquiry above or enter a question to generate a real-time executive report.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="explain-modal-footer">
            <span style={{ fontSize: '11px', color: 'var(--color-slate-400)' }}>
              Authorized Model: <code className="font-mono">{analysis?.model_used || 'OpenAI'}</code>
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Close Analyst
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AdminAIAnalystModal;
